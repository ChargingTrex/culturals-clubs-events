/**
 * The API surface.
 *
 * Deliberately shaped like the Django backend's REST endpoints. The pages call
 * `api.events.list(...)`, the test suite calls the same functions, and swapping
 * this build onto the real server means replacing this one module.
 *
 * HONEST LIMIT: these checks run in the browser, so they are not security. On the
 * real backend the identical rules run server-side and a tampered client gets a
 * 403 anyway. Here they exist so the WORKFLOW is faithful — what each role can and
 * cannot do — not to defend anything.
 */
import { db, find, now, save, uid } from "./db.js";
import * as R from "./roles.js";
import { conflict, denied, invalid, notFound } from "./errors.js";
import * as approvals from "./approvals.js";
import * as budgets from "./budget.js";
import * as attendance from "./attendance.js";
import * as reporting from "./reporting.js";
import { TEMPLATES } from "./seed.js";

const PUBLIC_STATUSES = ["published", "live", "completed", "reported"];

/** Every mutation ends here, so a reload shows what the walkthrough just did. */
const commit = value => { save(); return value; };

// --------------------------------------------------------------------------
// events
// --------------------------------------------------------------------------
function visibleEvents(ctx) {
  if (ctx.canSeeAllClubs()) return db().events;
  const clubs = new Set(ctx.scopesFor(...R.CLUB_ROLES));
  const organiser = new Set(ctx.organiserEvents());
  return db().events.filter(
    e => PUBLIC_STATUSES.includes(e.status) || clubs.has(e.clubId) || organiser.has(e.id));
}

/** The governance tier that sees figures and aggregates, never a student. */
const aggregateOnly = ctx =>
  ctx.hasAny(...R.AGGREGATE_ONLY_ROLES) && !ctx.canSeeIndividualRecords();

/** May this caller see money on this club's work? */
const maySeeMoney = (ctx, clubId) =>
  ctx.canSeeAllClubs() || ctx.hasClubRole(clubId, ...R.BUDGET_VIEWERS);

/** The most recent approval request for an event, or null if never submitted. */
const latestRequest = eventId => db().approvals
  .filter(a => a.eventId === eventId)
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;

/**
 * Where a proposal is on its route, for a tracker. Comments are shown only to
 * people who may see money, because a return comment is often about the money
 * ("trim the artist fees") and a member has no budget visibility.
 */
function routeSummary(request, ctx, clubId) {
  if (!request) return null;
  const money = maySeeMoney(ctx, clubId);
  const doneIndex = request.state === "approved"
    ? request.stages.length : request.stages.indexOf(request.currentStage);
  return {
    id: request.id, state: request.state, currentStage: request.currentStage,
    currentLabel: R.STAGE_LABELS[request.currentStage],
    currentWith: R.STAGE_WITH[request.currentStage],
    stages: request.stages.map((stage, i) => {
      const step = [...request.steps].reverse().find(x => x.stage === stage);
      return {
        stage, label: R.STAGE_LABELS[stage], short: R.STAGE_SHORT[stage],
        status: i < doneIndex ? "done"
          : i === doneIndex && request.state === "pending" ? "now"
          : i === doneIndex ? request.state
          : "upcoming",
        decidedBy: step ? step.actorLabel : null, decidedAt: step ? step.at : null,
      };
    }),
    lastDecision: request.steps.length ? (() => {
      const last = request.steps[request.steps.length - 1];
      return {
        stage: last.stage, stageLabel: R.STAGE_LABELS[last.stage],
        decision: last.decision, actorLabel: last.actorLabel, at: last.at,
        comment: money ? last.comment : null,
      };
    })() : null,
  };
}

function decorateEvent(event, ctx) {
  const budget = db().budgets.find(b => b.eventId === event.id);
  const myReg = ctx.studentId
    ? db().registrations.find(
        r => r.eventId === event.id && r.studentId === ctx.studentId && !r.cancelledAt)
    : null;
  const maySeeBudget = budget
    && (ctx.canSeeAllClubs() || ctx.hasClubRole(event.clubId, ...R.BUDGET_VIEWERS));
  return {
    ...event,
    clubName: find(db().clubs, event.clubId).name,
    venueName: find(db().venues, event.venueId).name,
    registered: attendance.registeredCount(event.id),
    attended: attendance.attendedCount(event.id),
    // Omitted entirely, not nulled, when the caller may not see money — so the
    // shape of the response cannot leak an amount.
    budget: maySeeBudget ? budgetView(budget, ctx) : null,
    approval: (ctx.canSeeAllClubs() || ctx.clubRole(event.clubId))
      ? routeSummary(latestRequest(event.id), ctx, event.clubId) : null,
    myRegistration: myReg
      ? { id: myReg.id, attended: myReg.attended,
          pass: attendance.livePass(myReg.id) || null }
      : null,
  };
}

export const events = {
  list(ctx, { status, club, ordering = "startsAt" } = {}) {
    let rows = visibleEvents(ctx);
    if (club) rows = rows.filter(e => e.clubId === club);
    if (status) {
      const wanted = new Set(String(status).split(","));
      rows = rows.filter(e => wanted.has(e.status));
    }
    const desc = ordering.startsWith("-");
    const key = desc ? ordering.slice(1) : ordering;
    rows = rows.slice().sort((a, b) =>
      String(a[key]).localeCompare(String(b[key])) * (desc ? -1 : 1));
    return rows.map(e => decorateEvent(e, ctx));
  },

  get(ctx, id) {
    const event = visibleEvents(ctx).find(e => e.id === id);
    if (!event) throw notFound("No such event, or it is not visible to you.");
    return decorateEvent(event, ctx);
  },

  create(ctx, payload) {
    const club = find(db().clubs, payload.clubId);
    if (!club) throw notFound("No such club.");
    if (!ctx.hasClubRole(club.id, ...R.PROPOSERS)) {
      throw denied("EVENTS_PROPOSE_DENIED",
        "Only the President, Vice-President, Secretary or Treasurer of this club may "
        + "raise a proposal.");
    }
    const venue = find(db().venues, payload.venueId);
    if (!venue) throw notFound("No such venue.");
    if (new Date(payload.endsAt) <= new Date(payload.startsAt)) {
      throw invalid("EVENTS_END_BEFORE_START", "Validation failed",
        "The end time must be after the start time.",
        [{ field: "endsAt", code: "INVALID", message: "Must be after the start." }]);
    }
    const expected = Number(payload.expectedAttendance) || 0;
    if (expected > venue.capacity) {
      throw invalid("EVENTS_OVER_CAPACITY", "Validation failed",
        `${venue.name} seats ${venue.capacity}.`,
        [{ field: "expectedAttendance", code: "INVALID",
           message: `Cannot expect more than ${venue.capacity}.` }]);
    }

    const candidate = {
      id: "pending", venueId: venue.id,
      startsAt: payload.startsAt, endsAt: payload.endsAt,
    };
    const softClashes = approvals.assertBookable(candidate);

    const event = {
      id: uid("ev"), title: String(payload.title || "").trim(), clubId: club.id,
      venueId: venue.id, festId: null, kind: payload.kind || "performance",
      startsAt: payload.startsAt, endsAt: payload.endsAt,
      capacity: venue.capacity, expectedAttendance: expected,
      status: "draft", photoCount: 0, socialLinks: [],
      submittedAt: null, closedAt: null, createdBy: ctx.sub,
    };
    if (!event.title) {
      throw invalid("EVENTS_TITLE_REQUIRED", "Validation failed", "Give the event a name.",
        [{ field: "title", code: "REQUIRED", message: "Required." }]);
    }
    db().events.push(event);

    // A shell always, so the Treasurer has something to add lines to. Creating the
    // event and pricing it are separate steps on purpose.
    const budget = budgets.ensureBudget(event.id);
    if (payload.template) {
      const template = TEMPLATES.find(t => t.name === payload.template);
      if (!template) {
        throw invalid("BUDGET_UNKNOWN_TEMPLATE", "Unknown budget template",
          `No template named ${payload.template}.`);
      }
      budgets.seedFromTemplate(budget, template, expected);
    }

    let approval = null;
    if (payload.submit && budgets.isReadyToSubmit(budget)) {
      approval = approvals.submit(event, ctx);
    }
    return commit({
      event: decorateEvent(event, ctx),
      budget: budgetView(budget, ctx),
      approval,
      softClashes: softClashes.map(
        e => ({ id: e.id, title: e.title, club: find(db().clubs, e.clubId).name })),
    });
  },

  submit(ctx, id) {
    const event = find(db().events, id);
    if (!event) throw notFound("No such event.");
    if (!ctx.hasClubRole(event.clubId, ...R.PROPOSERS)) {
      throw denied("EVENTS_PROPOSE_DENIED",
        "Only the club's office bearers may submit this proposal.");
    }
    return commit(approvals.submit(event, ctx));
  },

  goLive(ctx, id) {
    const event = find(db().events, id);
    if (!event) throw notFound("No such event.");
    if (!(ctx.hasClubRole(event.clubId, ...R.EVENT_OPERATORS) || ctx.hasAny(R.DEAN))) {
      throw denied("EVENTS_GO_LIVE_DENIED",
        "Marking an event live sits with the President, Vice-President or Secretary.");
    }
    if (event.status !== "published") {
      throw conflict("EVENTS_NOT_PUBLISHED", "Not published",
        "Only a published event can go live.");
    }
    event.status = "live";
    approvals.audit(ctx, "event.live", event.id, {});
    return commit(decorateEvent(event, ctx));
  },

  close(ctx, id, { photoCount, socialLinks = [] }) {
    const event = find(db().events, id);
    if (!event) throw notFound("No such event.");
    const allowed = ctx.hasClubRole(event.clubId, ...R.EVENT_OPERATORS)
      || ctx.organiserEvents().includes(event.id)
      || ctx.hasAny(R.DEAN);
    if (!allowed) {
      throw denied("EVENTS_CLOSE_DENIED",
        "Closing an event sits with its organisers and the club's office bearers.");
    }
    if (!["live", "published", "completed"].includes(event.status)) {
      throw conflict("EVENTS_NOT_CLOSEABLE", "Cannot close this event",
        `An event that is ${event.status} cannot be closed.`);
    }
    if (Number(photoCount) < 1) {
      throw conflict("EVENTS_EVIDENCE_REQUIRED", "Evidence required",
        "An event cannot be closed without at least one photo.",
        [{ field: "photoCount", code: "REQUIRED", message: "Upload at least one photo." }]);
    }
    event.photoCount = Number(photoCount);
    event.socialLinks = socialLinks.filter(Boolean);
    event.status = "reported";
    event.closedAt = now();
    approvals.audit(ctx, "event.closed", event.id, { photoCount: event.photoCount });
    return commit(decorateEvent(event, ctx));
  },

  clashes(ctx, id) {
    const event = find(db().events, id);
    if (!event) throw notFound("No such event.");
    const free = db().venues.filter(v => {
      if (v.id === event.venueId) return false;
      if (v.capacity < event.expectedAttendance) return false;
      return !approvals.clashesFor({ ...event, venueId: v.id }).length;
    });
    return {
      clashes: approvals.clashesFor(event).map(e => ({
        id: e.id, title: e.title, club: find(db().clubs, e.clubId).name,
        startsAt: e.startsAt, endsAt: e.endsAt, status: e.status,
        expectedAttendance: e.expectedAttendance,
      })),
      freeVenues: free,
    };
  },

  reassign(ctx, id, { toVenue, reason }) {
    const event = find(db().events, id);
    if (!event) throw notFound("No such event.");
    // Venue precedence when two events clash is an open question, so the system
    // does not pick a winner: it surfaces the clash and the Dean moves one.
    if (!ctx.hasAny(R.DEAN)) {
      throw denied("EVENTS_REASSIGN_DENIED",
        "Only the Dean may move an event to another venue.");
    }
    const text = String(reason || "").trim();
    if (text.length < 5) {
      throw invalid("EVENTS_REASON_REQUIRED", "A reason is required",
        "Give a reason the club can act on — they are shown this text.",
        [{ field: "reason", code: "REQUIRED", message: "At least a few words." }]);
    }
    const venue = find(db().venues, toVenue);
    if (!venue) throw notFound("No such venue.");
    if (venue.id === event.venueId) {
      throw conflict("EVENTS_SAME_VENUE", "Already in that venue",
        "Choose a different venue.");
    }
    if (venue.capacity < event.expectedAttendance) {
      throw conflict("EVENTS_VENUE_TOO_SMALL", "Venue too small",
        `${venue.name} seats ${venue.capacity}; ${event.expectedAttendance} are expected.`);
    }
    approvals.assertBookable({ ...event, venueId: venue.id });
    const fromName = find(db().venues, event.venueId).name;
    event.venueId = venue.id;
    approvals.notifyClub(event, `“${event.title}” was moved to ${venue.name}`,
      `Moved from ${fromName}. Reason: ${text}`);
    approvals.audit(ctx, "event.venue_reassigned", event.id,
      { from: fromName, to: venue.name }, text);
    return commit({ from: fromName, to: venue.name, reason: text });
  },
};

// --------------------------------------------------------------------------
// venues
// --------------------------------------------------------------------------
export const venues = {
  list() { return db().venues; },

  calendar(ctx, { date } = {}) {
    if (!ctx.canSeeAllClubs()) {
      throw denied("EVENTS_CALENDAR_DENIED", "The venue calendar is available to staff.");
    }
    const holding = ["submitted", "approved", "published", "live", "completed", "reported"];
    let rows = db().events.filter(e => holding.includes(e.status));
    if (date) rows = rows.filter(e => e.startsAt.slice(0, 10) === date);
    const pairs = approvals.allClashes();
    const clashIds = new Set(pairs.flat().map(e => e.id));
    return {
      bufferMinutes: approvals.BUFFER_MINUTES,
      venues: db().venues,
      bookings: rows.map(e => ({
        id: e.id, title: e.title, club: find(db().clubs, e.clubId).name,
        venueId: e.venueId, venueName: find(db().venues, e.venueId).name,
        startsAt: e.startsAt, endsAt: e.endsAt, status: e.status,
        confirmed: e.status !== "submitted", clash: clashIds.has(e.id),
      })).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      clashes: pairs.map(([a, b]) => ({
        venue: find(db().venues, a.venueId).name,
        events: [a, b].map(e => ({
          id: e.id, title: e.title, club: find(db().clubs, e.clubId).name,
          startsAt: e.startsAt, endsAt: e.endsAt,
          expectedAttendance: e.expectedAttendance, status: e.status,
        })),
      })),
    };
  },
};

// --------------------------------------------------------------------------
// clubs and roster
// --------------------------------------------------------------------------
export const clubs = {
  list(ctx) {
    return db().clubs.map(c => ({
      ...c,
      memberCount: db().memberships.filter(m => m.clubId === c.id && !m.endedAt).length,
      myRole: ctx.clubRole(c.id),
    }));
  },

  roster(ctx, clubId) {
    const club = find(db().clubs, clubId);
    if (!club) throw notFound("No such club.");
    // A roster is names and PRNs, so the Vice-Chancellor and Management are
    // excluded: that tier receives aggregates. Outsiders get 404, not 403 — a 403
    // would confirm it exists.
    if (!(ctx.canSeeIndividualRecords() || ctx.clubRole(club.id))) {
      throw notFound("No such club roster, or it is not visible to you.");
    }
    const order = R.CLUB_ROLES;
    const rows = db().memberships
      .filter(m => m.clubId === club.id && !m.endedAt)
      .map(m => {
        const student = find(db().students, m.studentId);
        return {
          id: m.id, clubId: club.id, studentId: student.id, prn: student.prn,
          fullName: student.fullName, department: student.department,
          programme: student.programme, year: student.year,
          role: m.role, roleLabel: R.CLUB_ROLE_LABELS[m.role],
        };
      })
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)
        || a.fullName.localeCompare(b.fullName));
    return {
      club: { id: club.id, name: club.name },
      canAssignRoles: ctx.hasClubRole(club.id, ...R.ROLE_ASSIGNERS),
      results: rows,
      recentChanges: (db().roleChanges || []).filter(
        c => rows.some(r => r.id === c.membershipId)).slice(0, 8),
    };
  },

  setRole(ctx, membershipId, { role, reason = "" }) {
    const membership = find(db().memberships, membershipId);
    if (!membership || membership.endedAt) throw notFound("No such membership.");
    // Checked on save, not by hiding the control. Hiding a control is not a permission.
    if (!ctx.hasClubRole(membership.clubId, ...R.ROLE_ASSIGNERS)) {
      throw denied("CLUBS_ROLE_ASSIGN_DENIED",
        "Only the President or Vice-President of this club may assign roles.");
    }
    if (!R.CLUB_ROLES.includes(role)) {
      throw invalid("CLUBS_UNKNOWN_ROLE", "Unknown role", `${role} is not a club role.`);
    }
    if (role === R.CLUB_PRESIDENT) {
      const existing = db().memberships.find(
        m => m.clubId === membership.clubId && m.role === R.CLUB_PRESIDENT
          && !m.endedAt && m.id !== membership.id);
      if (existing) {
        throw conflict("CLUBS_PRESIDENT_EXISTS", "A president is already in post",
          "Step the current president down to another role first. Two presidents "
          + "means two people hold the role that assigns roles.");
      }
    }
    const fromRole = membership.role;
    membership.role = role;
    db().roleChanges = db().roleChanges || [];
    db().roleChanges.unshift({
      id: uid("rc"), membershipId: membership.id, actorLabel: ctx.displayName,
      fromRole, toRole: role, reason, at: now(),
    });
    approvals.audit(ctx, "club.role_changed", membership.id, { fromRole, toRole: role }, reason);
    return commit({ ...membership, roleLabel: R.CLUB_ROLE_LABELS[role] });
  },
};

// --------------------------------------------------------------------------
// budgets
// --------------------------------------------------------------------------
function budgetView(budget, ctx) {
  if (!budget) return null;
  return {
    id: budget.id, eventId: budget.eventId, stage: budget.stage,
    stageLabel: budgets.STAGE_LABELS[budget.stage],
    lines: budget.lines.map(l => ({
      ...l,
      isOverspent: l.amountSpent != null && l.amountSanctioned != null
        && l.amountSpent > l.amountSanctioned,
      receipts: l.receipts.filter(r => !r.supersededBy),
    })),
    totalRequested: budgets.totalRequested(budget),
    totalSanctioned: budgets.totalSanctioned(budget),
    totalSpent: budgets.totalSpent(budget),
    settledAt: budget.settledAt,
    nilDeclaration: budgets.nilDeclaration(budget),
    isEditable: budgets.isEditable(budget),
    isReadyToSubmit: budgets.isReadyToSubmit(budget),
    canSettle: budgets.canSettle(budget),
    settlementWaitingOn: budgets.settlementWaitingOn(budget),
    settlementHint: budgets.settlementHint(budget),
    settlementProblems: budgets.settlementProblems(budget),
    thresholds: { receiptThreshold: budgets.RECEIPT_THRESHOLD,
                  vcThreshold: approvals.VC_THRESHOLD,
                  managementThreshold: approvals.MANAGEMENT_THRESHOLD },
    eventTitle: find(db().events, budget.eventId)?.title || "",
    eventStatus: find(db().events, budget.eventId)?.status || "",
  };
}

function visibleBudgets(ctx) {
  if (ctx.canSeeAllClubs()) return db().budgets;
  const clubIds = new Set(ctx.scopesFor(...R.BUDGET_VIEWERS));
  if (!clubIds.size) return [];
  return db().budgets.filter(b => {
    const event = find(db().events, b.eventId);
    return event && clubIds.has(event.clubId);
  });
}

function budgetOr404(ctx, id) {
  const budget = visibleBudgets(ctx).find(b => b.id === id);
  // Budget visibility begins at Treasurer; a member gets 404, because the
  // existence of another club's budget is itself the disclosure.
  if (!budget) throw notFound("No such budget, or it is not visible to you.");
  return budget;
}

function requirePreparer(ctx, budget) {
  const event = find(db().events, budget.eventId);
  if (!ctx.hasClubRole(event.clubId, ...R.BUDGET_PREPARERS)) {
    throw denied("BUDGET_PREPARE_DENIED",
      "Only the club's President, Vice-President or Treasurer may build the budget.");
  }
}

export const budget = {
  list(ctx) { return visibleBudgets(ctx).map(b => budgetView(b, ctx)); },
  get(ctx, id) { return budgetView(budgetOr404(ctx, id), ctx); },
  forEvent(ctx, eventId) {
    const found = visibleBudgets(ctx).find(b => b.eventId === eventId);
    if (!found) throw notFound("No such budget, or it is not visible to you.");
    return budgetView(found, ctx);
  },

  addLine(ctx, id, payload) {
    const b = budgetOr404(ctx, id);
    requirePreparer(ctx, b);
    budgets.addLine(b, payload);
    return commit(budgetView(b, ctx));
  },

  updateLine(ctx, id, lineId, payload) {
    const b = budgetOr404(ctx, id);
    requirePreparer(ctx, b);
    const line = find(b.lines, lineId);
    if (!line) throw notFound("No such budget line on this budget.");
    budgets.updateLine(b, line, payload);
    return commit(budgetView(b, ctx));
  },

  removeLine(ctx, id, lineId) {
    const b = budgetOr404(ctx, id);
    requirePreparer(ctx, b);
    const line = find(b.lines, lineId);
    if (!line) throw notFound("No such budget line on this budget.");
    budgets.removeLine(b, line);
    return commit(budgetView(b, ctx));
  },

  declareNil(ctx, id, { reason }) {
    const b = budgetOr404(ctx, id);
    requirePreparer(ctx, b);
    budgets.declareNil(b, { reason, ctx });
    approvals.audit(ctx, "budget.declared_nil", b.id, { reason });
    return commit(budgetView(b, ctx));
  },

  withdrawNil(ctx, id) {
    const b = budgetOr404(ctx, id);
    requirePreparer(ctx, b);
    budgets.withdrawNil(b);
    return commit(budgetView(b, ctx));
  },

  setSpend(ctx, id, lineId, { amountSpent, varianceNote }) {
    const b = budgetOr404(ctx, id);
    const event = find(db().events, b.eventId);
    if (!ctx.hasClubRole(event.clubId, ...R.BUDGET_SETTLERS)) {
      throw denied("BUDGET_SPEND_DENIED",
        "Recording spend sits with the club's President, Vice-President or Treasurer.");
    }
    if (b.stage === "settled") {
      throw conflict("BUDGET_ALREADY_SETTLED", "Already settled",
        "A settled budget is closed. A correction needs the Dean to reopen it.");
    }
    const line = find(b.lines, lineId);
    if (!line) throw notFound("No such budget line on this budget.");
    if (amountSpent !== undefined) {
      line.amountSpent = amountSpent === null || amountSpent === ""
        ? null : Math.max(0, Number(amountSpent) || 0);
    }
    if (varianceNote !== undefined) line.varianceNote = String(varianceNote);
    return commit(budgetView(b, ctx));
  },

  attachReceipt(ctx, id, lineId, { fileName, byteSize = 0, amount = null }) {
    const b = budgetOr404(ctx, id);
    const event = find(db().events, b.eventId);
    if (!ctx.hasClubRole(event.clubId, ...R.BUDGET_SETTLERS)) {
      throw denied("BUDGET_SPEND_DENIED", "Attaching receipts sits with the club.");
    }
    const line = find(b.lines, lineId);
    if (!line) throw notFound("No such budget line on this budget.");
    budgets.attachReceipt(line, { fileName, byteSize, amount });
    return commit(budgetView(b, ctx));
  },

  settle(ctx, id) {
    const b = budgetOr404(ctx, id);
    const event = find(db().events, b.eventId);
    if (!ctx.hasClubRole(event.clubId, ...R.BUDGET_SETTLERS)) {
      throw denied("BUDGET_SPEND_DENIED", "Settling sits with the club.");
    }
    budgets.settle(b, ctx);
    approvals.audit(ctx, "budget.settled", b.id,
      { sanctioned: budgets.totalSanctioned(b), spent: budgets.totalSpent(b) });
    return commit(budgetView(b, ctx));
  },

  templates({ expectedAttendance = 80 } = {}) {
    const expected = Math.max(1, Number(expectedAttendance) || 80);
    return TEMPLATES.map(t => {
      const lines = t.lines.map(l => ({
        head: l.head, basis: l.basis, rate: l.rate,
        amount: l.basis === "per_head" ? l.rate * expected : l.rate,
        explanation: l.basis === "per_head" ? `${l.rate} x ${expected}` : "lump sum",
      }));
      const subtotal = lines.reduce((a, l) => a + l.amount, 0);
      const contingency = Math.round(subtotal * budgets.CONTINGENCY_PERCENT / 100);
      const total = subtotal + contingency;
      return {
        name: t.name, lines,
        contingency: { percent: budgets.CONTINGENCY_PERCENT, amount: contingency },
        totalRequested: total,
        // Told up front, so a club knows before submitting how many gates its
        // proposal will take.
        requiresVc: total > approvals.VC_THRESHOLD,
        vcThreshold: approvals.VC_THRESHOLD,
        requiresManagement: total > approvals.MANAGEMENT_THRESHOLD,
        managementThreshold: approvals.MANAGEMENT_THRESHOLD,
      };
    });
  },
};

// --------------------------------------------------------------------------
// governance
// --------------------------------------------------------------------------
function approvalView(request, ctx) {
  const event = find(db().events, request.eventId);
  const b = db().budgets.find(x => x.eventId === event.id);
  // A club member may follow their club's proposal, but never its figures.
  const money = maySeeMoney(ctx, event.clubId);
  return {
    id: request.id, eventId: event.id, eventTitle: event.title,
    club: find(db().clubs, event.clubId).name, clubId: event.clubId,
    venue: find(db().venues, event.venueId).name,
    startsAt: event.startsAt, endsAt: event.endsAt,
    expectedAttendance: event.expectedAttendance,
    stages: request.stages, currentStage: request.currentStage,
    stageLabel: R.STAGE_LABELS[request.currentStage],
    route: routeSummary(request, ctx, event.clubId),
    state: request.state,
    amountRequested: money ? request.amountRequested : null,
    requiresVc: request.requiresVc, vcReason: request.vcReason,
    requiresManagement: Boolean(request.requiresManagement),
    managementReason: request.managementReason || "",
    requiresMfa: approvals.requiresMfa(request, request.currentStage),
    myStage: ctx.hasAny(R.STAGE_ROLE[request.currentStage]),
    // Only the financial gates sanction; the Society recommends.
    canSanction: R.SANCTIONING_STAGES.includes(request.currentStage),
    // The submitter is a student; the aggregate-only tier is told "the club".
    submittedAt: request.createdAt,
    submittedByLabel: aggregateOnly(ctx) ? "" : request.submittedByLabel || "",
    steps: request.steps.map(s => ({
      ...s, stageLabel: R.STAGE_LABELS[s.stage],
      comment: money ? s.comment : "",
    })),
    lines: b && money ? b.lines.map(l => ({
      id: l.id, head: l.head, amountRequested: l.amountRequested,
      amountSanctioned: l.amountSanctioned,
    })) : [],
    // An approver must be able to tell "this costs nothing" from "nobody priced
    // it". A blank line table cannot say which.
    nilDeclaration: b && money ? budgets.nilDeclaration(b) : null,
    clashes: approvals.clashesFor(event).map(e => ({
      id: e.id, title: e.title, club: find(db().clubs, e.clubId).name,
      startsAt: e.startsAt, endsAt: e.endsAt,
      expectedAttendance: e.expectedAttendance,
    })),
  };
}

export const governance = {
  /**
   * The gates a proposal from this club would pass for this amount, before it is
   * sent — so a club knows up front that a big budget takes four gates, not two.
   */
  previewRoute(ctx, { clubId, amount = 0, festId = null }) {
    const club = find(db().clubs, clubId);
    if (!club) throw notFound("No such club.");
    const { stages, vcReason, managementReason } =
      approvals.buildRoute({ clubId, festId }, Number(amount) || 0);
    return {
      stages: stages.map(stage => ({
        stage, label: R.STAGE_LABELS[stage], short: R.STAGE_SHORT[stage],
        reason: stage === "vc" ? vcReason : stage === "management" ? managementReason : "",
      })),
    };
  },

  queue(ctx) {
    const rows = approvals.pendingFor(ctx);
    return {
      stagesYouHold: Object.entries(R.STAGE_ROLE)
        .filter(([, role]) => ctx.hasAny(role)).map(([stage]) => stage),
      count: rows.length,
      results: rows.map(r => approvalView(r, ctx)),
    };
  },

  list(ctx) {
    let rows = db().approvals;
    if (!ctx.canSeeAllClubs()) {
      const clubIds = new Set(ctx.scopesFor(...R.CLUB_ROLES));
      rows = rows.filter(a => clubIds.has(find(db().events, a.eventId).clubId));
    }
    return rows.map(r => approvalView(r, ctx));
  },

  get(ctx, id) {
    const found = governance.list(ctx).find(a => a.id === id);
    if (!found) throw notFound("No such approval request, or it is not visible to you.");
    return found;
  },

  decide(ctx, id, payload) {
    const request = find(db().approvals, id);
    if (!request) throw notFound("No such approval request.");
    if (!ctx.canSeeAllClubs()
        && !ctx.scopesFor(...R.CLUB_ROLES).includes(
          find(db().events, request.eventId).clubId)) {
      throw notFound("No such approval request, or it is not visible to you.");
    }
    const step = approvals.decide(request, ctx, payload);
    return commit({ step, request: approvalView(request, ctx) });
  },

  /**
   * The caller's own recent decisions, newest first, with where each proposal
   * went next. An approved item leaves the queue; this is how an approver sees
   * that it went somewhere rather than vanished.
   */
  myDecisions(ctx, { limit = 8 } = {}) {
    const rows = [];
    for (const request of db().approvals) {
      for (const step of request.steps.filter(x => x.actorSub === ctx.sub)) {
        const event = find(db().events, request.eventId);
        rows.push({
          requestId: request.id, eventId: event.id, eventTitle: event.title,
          club: find(db().clubs, event.clubId).name,
          stage: step.stage, stageLabel: R.STAGE_LABELS[step.stage],
          decision: step.decision, at: step.at,
          nowWith: request.state === "pending" ? R.STAGE_WITH[request.currentStage] : null,
          state: request.state, eventStatus: event.status,
        });
      }
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  },

  notifications(ctx, { unread = false } = {}) {
    let rows = db().notifications.filter(n => n.userId === ctx.sub);
    if (unread) rows = rows.filter(n => !n.readAt);
    return rows;
  },

  unreadCount(ctx) {
    return db().notifications.filter(n => n.userId === ctx.sub && !n.readAt).length;
  },

  markRead(ctx) {
    let n = 0;
    for (const note of db().notifications.filter(x => x.userId === ctx.sub && !x.readAt)) {
      note.readAt = now(); n += 1;
    }
    return commit({ marked: n });
  },

  audit(ctx) {
    // Actor names include students acting for their clubs, so the aggregate-only
    // tier is excluded, as the message says.
    if (!ctx.hasAny(R.DEAN, R.ADMIN)) {
      throw denied("GOVERNANCE_AUDIT_DENIED",
        "The audit trail is available to the Dean and administrators.");
    }
    return db().audit.slice(0, 200);
  },
};

// --------------------------------------------------------------------------
// participation
// --------------------------------------------------------------------------
function requireDoorAccess(ctx, event) {
  if (ctx.organiserEvents().includes(event.id)) return;
  if (ctx.hasClubRole(event.clubId, ...R.DOOR_STAFF)) return;
  if (ctx.hasAny(R.ADMIN)) return;
  // Deliberately not the Dean, the VC, Management or the society: running a door
  // is the club's job, and the scan response carries names and PRNs.
  throw denied("PARTICIPATION_STATION_DENIED",
    "Only this event's organisers and their club's door staff may work a check-in desk.");
}

export const participation = {
  async myPasses(ctx) {
    if (!ctx.studentId) return { passes: [], profileQr: null, note: "" };
    const rows = db().registrations.filter(
      r => r.studentId === ctx.studentId && !r.cancelledAt
        && ["published", "live"].includes(find(db().events, r.eventId).status));
    const profile = await attendance.profileTokenFor(ctx.studentId);
    return commit({
      passes: rows.map(r => {
        const event = find(db().events, r.eventId);
        const pass = attendance.livePass(r.id);
        return {
          registrationId: r.id, eventId: event.id, title: event.title,
          club: find(db().clubs, event.clubId).name,
          venue: find(db().venues, event.venueId).name,
          startsAt: event.startsAt, endsAt: event.endsAt,
          attended: r.attended, token: pass ? pass.token : null,
        };
      }),
      profileQr: { token: profile.token, version: profile.version },
      note: "Your profile QR holds a signed reference, not your PRN. "
        + "A photograph of it reveals nothing about you.",
    });
  },

  async reissueProfileQr(ctx) {
    if (!ctx.studentId) {
      throw denied("PARTICIPATION_NOT_A_STUDENT", "Only a student holds a profile QR.");
    }
    const record = await attendance.reissueProfileToken(ctx.studentId);
    return commit({ token: record.token, version: record.version });
  },

  myRegistrations(ctx) {
    if (!ctx.studentId) return [];
    return db().registrations
      .filter(r => r.studentId === ctx.studentId)
      .map(r => ({
        ...r, eventTitle: find(db().events, r.eventId).title,
        pass: attendance.livePass(r.id),
      }));
  },

  async register(ctx, eventId) {
    if (!ctx.studentId) {
      throw denied("PARTICIPATION_NOT_A_STUDENT",
        "Only a student may register for an event.");
    }
    const event = find(db().events, eventId);
    if (!event) throw notFound("No such event.");
    const registration = await attendance.registerStudent(event, ctx.studentId);
    return commit(registration);
  },

  cancel(ctx, registrationId) {
    const registration = find(db().registrations, registrationId);
    if (!registration || registration.studentId !== ctx.studentId) {
      throw notFound("No such registration.");
    }
    return commit(attendance.cancelRegistration(registration));
  },

  station(ctx, eventId) {
    const event = find(db().events, eventId);
    if (!event) throw notFound("No such event.");
    requireDoorAccess(ctx, event);
    return {
      event: {
        id: event.id, title: event.title,
        club: find(db().clubs, event.clubId).name,
        venue: find(db().venues, event.venueId).name,
        status: event.status, startsAt: event.startsAt, endsAt: event.endsAt,
      },
      counters: {
        checkedIn: attendance.attendedCount(event.id),
        registered: attendance.registeredCount(event.id),
        capacity: event.capacity,
      },
      capture: attendance.captureStats(event.id),
      recent: db().scans.filter(s => s.eventId === event.id).slice(0, 12).map(s => {
        const reg = s.registrationId ? find(db().registrations, s.registrationId) : null;
        return {
          id: s.id, result: s.result,
          resultLabel: attendance.RESULT_LABELS[s.result] || s.result,
          scannedAt: s.scannedAt, stationId: s.stationId,
          wasOffline: new Date(s.syncedAt) - new Date(s.scannedAt) > 60000,
          who: reg ? find(db().students, reg.studentId).fullName : null,
        };
      }),
    };
  },

  async scan(ctx, eventId, { token, stationId = "GATE-1", scannedAt = null }) {
    const event = find(db().events, eventId);
    if (!event) throw notFound("No such event.");
    requireDoorAccess(ctx, event);
    const outcome = await attendance.resolve(token, event,
      { operatorId: ctx.sub, stationId, scannedAt });
    return commit(outcome);
  },

  async syncOffline(ctx, eventId, { scans, stationId = "GATE-1" }) {
    const event = find(db().events, eventId);
    if (!event) throw notFound("No such event.");
    requireDoorAccess(ctx, event);
    const results = await attendance.replayOffline(event, scans,
      { operatorId: ctx.sub, stationId });
    return commit({
      synced: results.length,
      accepted: results.filter(r => r.accepted).length,
      duplicates: results.filter(r => r.result === "duplicate").length,
      results,
    });
  },

  checkInManually(ctx, eventId, { studentId, prn, stationId = "GATE-1" }) {
    const event = find(db().events, eventId);
    if (!event) throw notFound("No such event.");
    requireDoorAccess(ctx, event);
    const student = studentId
      ? find(db().students, studentId)
      : db().students.find(
          s => s.prn.toUpperCase() === String(prn || "").trim().toUpperCase());
    if (!student) {
      throw notFound("No such student. Check the PRN on their ID card.");
    }
    return commit(attendance.checkInManually(event, student.id,
      { operatorId: ctx.sub, stationId }));
  },

  roster(ctx, eventId) {
    const event = find(db().events, eventId);
    if (!event) throw notFound("No such event.");
    const allowed = ctx.canSeeIndividualRecords()
      || ctx.organiserEvents().includes(event.id)
      || ctx.hasClubRole(event.clubId, ...R.DOOR_STAFF);
    if (!allowed) {
      throw notFound("No such attendee list, or it is not visible to you.");
    }
    return {
      event: { id: event.id, title: event.title },
      counts: {
        registered: attendance.registeredCount(event.id),
        attended: attendance.attendedCount(event.id),
      },
      results: db().registrations
        .filter(r => r.eventId === event.id && !r.cancelledAt)
        .map(r => {
          const student = find(db().students, r.studentId);
          return {
            id: r.id, prn: student.prn, fullName: student.fullName,
            department: r.departmentAtEvent, programme: r.programmeAtEvent,
            year: r.yearAtEvent, source: r.source, attended: r.attended,
            checkedInAt: r.checkedInAt, stationId: r.stationId,
          };
        })
        .sort((a, b) => Number(b.attended) - Number(a.attended)
          || a.fullName.localeCompare(b.fullName)),
    };
  },
};

// --------------------------------------------------------------------------
// directory and reports
// --------------------------------------------------------------------------
export const directory = {
  students(ctx, query) {
    // A PRN directory is individual student data, so the VC, Management and the
    // society are excluded; organisers and door staff need it at the desk.
    if (!(ctx.canSeeIndividualRecords() || ctx.organiserEvents().length
          || ctx.scopesFor(...R.DOOR_STAFF).length)) {
      throw denied("DIRECTORY_NOT_PERMITTED",
        "Directory lookup is limited to organisers and staff.");
    }
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 2) return [];
    return db().students
      .filter(s => s.prn.toLowerCase().includes(q)
        || s.fullName.toLowerCase().includes(q))
      .slice(0, 6)
      .map(s => ({
        studentId: s.id, prn: s.prn, fullName: s.fullName,
        department: s.department, programme: s.programme, year: s.year,
      }));
  },
};

export const reports = {
  semester(ctx) {
    if (!ctx.hasAny(R.DEAN, R.VICE_CHANCELLOR, R.MANAGEMENT, R.ADMIN,
                    R.CULTURAL_SOCIETY)) {
      throw denied("REPORTING_DENIED",
        "The semester report is available to the Dean and management.");
    }
    return reporting.semesterReport();
  },

  overview(ctx) {
    if (!ctx.hasAny(R.DEAN, R.ADMIN, R.CULTURAL_SOCIETY)) {
      throw denied("REPORTING_DENIED", "This overview is available to the Dean.");
    }
    return reporting.deanOverview();
  },
};

// --------------------------------------------------------------------------
// pilot: the guided journey on the sign-in page
// --------------------------------------------------------------------------
const rupees = n => `₹${n.toLocaleString("en-IN")}`;

export const pilot = {
  /**
   * Progress through the full journey, derived from what actually happened since
   * the data was seeded rather than from clicks — so a step done the long way
   * round still counts, and resetting the data resets the journey.
   */
  journey() {
    const since = db().readyAt || "";
    const after = at => String(at || "") > since;
    const acted = (action, test = () => true) => db().audit.some(
      a => a.action === action && after(a.at) && test(a));
    const approvedAt = stage =>
      acted("approval.approve", a => Boolean(a.after) && a.after.stage === stage);

    const steps = [
      { key: "request", persona: "treasurer", page: "club-new-event.html",
        title: "Raise a budget request",
        detail: "Create an event from the Fest night template. At over "
          + `${rupees(approvals.MANAGEMENT_THRESHOLD)} it needs all four gates.`,
        done: acted("event.submitted") },
      { key: "society", persona: "society", page: "society-approvals.html",
        title: "The Cultural Society recommends it",
        detail: "Gate 1. Approve it, or return it with a comment the club can act on.",
        done: approvedAt("cultural_society") },
      { key: "dean", persona: "dean", page: "dean-approvals.html",
        title: "The Dean sanctions it",
        detail: "Gate 2. Trim a head if you like — never above what was asked for.",
        done: approvedAt("dean") },
      { key: "vc", persona: "vc", page: "vc-queue.html",
        title: "The Vice-Chancellor approves",
        detail: `Gate 3, for budgets over ${rupees(approvals.VC_THRESHOLD)}.`,
        done: approvedAt("vc") },
      { key: "management", persona: "management", page: "management-queue.html",
        title: "Management gives the final approval",
        detail: `Gate 4, over ${rupees(approvals.MANAGEMENT_THRESHOLD)}. `
          + "Approving publishes the event.",
        done: approvedAt("management") },
      { key: "register", persona: "student", page: "student-events.html",
        title: "A student registers",
        detail: "Find it under What's on. The pass appears under My passes.",
        done: db().registrations.some(
          r => after(r.registeredAt) && r.source === "pre_registered") },
      { key: "checkin", persona: "president", page: "organiser-scan.html",
        title: "Check them in at the door",
        detail: "At the Scan station, scan the student's pass — then try it twice.",
        done: db().scans.some(s => after(s.syncedAt) && attendance.isAccepting(s.result)) },
      { key: "settle", persona: "president", page: "club-events.html",
        title: "Close the event and settle the budget",
        detail: "Close it with photos, record what was spent, attach receipts, settle.",
        done: acted("budget.settled") },
    ];
    return { steps, done: steps.filter(x => x.done).length, total: steps.length };
  },
};
