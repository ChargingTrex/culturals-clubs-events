/**
 * The approval chain: Cultural Society -> Dean -> Vice-Chancellor.
 *
 * The chain is DATA, not branching. `buildRoute` produces an ordered list at
 * submission and `decide` walks it, which is what lets the Society gate be switched
 * off in config without touching the decision code.
 */
import { db, find, now, uid } from "./db.js";
import * as R from "./roles.js";
import { conflict, denied, invalid, notFound } from "./errors.js";
import { totalRequested, isReadyToSubmit, stageForGate } from "./budget.js";

export const VC_THRESHOLD = 50000;

/** Default chain. `dean` alone restores the chain the source documents fix. */
export const APPROVAL_CHAIN = ["cultural_society", "dean"];

const SOCIETY_CATEGORIES = ["cultural", "literary"];

export function buildRoute(event, amount) {
  const club = find(db().clubs, event.clubId);
  const stages = [];
  for (const stage of APPROVAL_CHAIN) {
    if (stage === "cultural_society") {
      // Only the clubs the society covers. A technical club should not queue
      // behind the cultural secretary.
      if (SOCIETY_CATEGORIES.includes(club.category)) stages.push(stage);
    } else if (stage === "dean") {
      stages.push(stage);
    }
  }
  // The Dean gate is not optional. A chain without it would publish events with
  // nobody accountable for the money.
  if (!stages.includes("dean")) stages.push("dean");

  const reasons = [];
  if (amount > VC_THRESHOLD) reasons.push(`budget over ${VC_THRESHOLD.toLocaleString("en-IN")}`);
  if (event.festId) reasons.push("part of a fest");
  if (reasons.length) stages.push("vc");

  return { stages, vcReason: reasons.join(", ") };
}

export function pendingFor(ctx) {
  const stages = Object.entries(R.STAGE_ROLE)
    .filter(([, role]) => ctx.hasAny(role))
    .map(([stage]) => stage);
  if (!stages.length) return [];
  return db().approvals
    .filter(a => a.state === "pending" && stages.includes(a.currentStage))
    .sort((a, b) => find(db().events, a.eventId).startsAt
      .localeCompare(find(db().events, b.eventId).startsAt));
}

export function submit(event, ctx) {
  if (!["draft", "returned"].includes(event.status)) {
    throw conflict("GOVERNANCE_ALREADY_SUBMITTED", "Already submitted",
      `“${event.title}” is ${event.status}.`);
  }
  const budget = db().budgets.find(b => b.eventId === event.id);
  if (!budget || !isReadyToSubmit(budget)) {
    throw conflict("GOVERNANCE_BUDGET_REQUIRED", "Budget required",
      "Add at least one budget line, or declare that the event needs no budget and "
      + "say why. An empty budget and a genuinely free event look the same to an "
      + "approver, so one of the two has to be stated.");
  }

  const amount = totalRequested(budget);
  const { stages, vcReason } = buildRoute(event, amount);
  const request = {
    id: uid("ap"), eventId: event.id, stages, currentStage: stages[0],
    state: "pending", amountRequested: amount,
    requiresVc: stages.includes("vc"), vcReason,
    submittedBy: ctx.sub, steps: [], createdAt: now(), resolvedAt: null,
  };
  db().approvals.push(request);
  event.status = "submitted";
  event.submittedAt = now();
  budget.stage = stageForGate(stages[0]);
  notifyStage(request);
  audit(ctx, "event.submitted", event.id, { stages, amount });
  return request;
}

export function assertCanDecide(request, ctx) {
  if (request.state !== "pending") {
    throw conflict("GOVERNANCE_ALREADY_RESOLVED", "Already resolved",
      `This request is ${request.state}.`);
  }
  const current = request.currentStage;
  const event = find(db().events, request.eventId);

  if (!ctx.hasAny(R.STAGE_ROLE[current])) {
    // Holding a LATER gate on this route is a turn-taking problem, not a
    // permission one, and it wants a different message.
    const elsewhere = request.stages.filter(
      s => s !== current && ctx.hasAny(R.STAGE_ROLE[s]));
    if (elsewhere.length) {
      throw conflict("GOVERNANCE_WRONG_STAGE", "Not at your stage",
        `This request is with the ${R.STAGE_LABELS[current]}. It reaches you at the `
        + `${R.STAGE_LABELS[elsewhere[0]]} stage.`);
    }
    throw denied("GOVERNANCE_NOT_APPROVER",
      `Only the ${R.STAGE_LABELS[current]} may decide this request.`);
  }
  // No club role approves its own budget — even if the holder also has a gate.
  if (ctx.clubRole(event.clubId)) {
    throw denied("GOVERNANCE_SELF_APPROVAL",
      "You hold a role in the club that submitted this proposal. "
      + "No club role approves its own budget.");
  }
}

export const requiresMfa = (request, stage) =>
  stage === "vc" || request.amountRequested > VC_THRESHOLD;

export function decide(request, ctx, { decision, comment = "", sanctioned = {} }) {
  assertCanDecide(request, ctx);
  const stage = request.currentStage;
  const event = find(db().events, request.eventId);
  const budget = db().budgets.find(b => b.eventId === event.id);

  if (decision !== "approve" && !comment.trim()) {
    throw invalid("GOVERNANCE_COMMENT_REQUIRED", "A comment is required",
      "Say what the club should change, so the decision is actionable.",
      [{ field: "comment", code: "REQUIRED", message: "Required to return or reject." }]);
  }
  if (decision === "approve" && requiresMfa(request, stage) && !ctx.mfa) {
    throw denied("GOVERNANCE_MFA_REQUIRED",
      "Sanctioning above the escalation threshold requires a verified session.");
  }
  if (decision === "approve") {
    const clashes = clashesFor(event);
    if (clashes.length) {
      throw conflict("GOVERNANCE_CLASH_UNRESOLVED", "Venue clash unresolved",
        `“${event.title}” overlaps ${clashes.map(e => e.title).join(", ")} in `
        + `${find(db().venues, event.venueId).name}. Move one of them first.`);
    }
  }

  if (decision === "approve" && stage === "dean") applySanctions(budget, sanctioned);

  const step = {
    id: uid("st"), stage, decision, comment: comment.trim(),
    actorSub: ctx.sub, actorLabel: ctx.displayName, mfaVerified: ctx.mfa, at: now(),
  };
  request.steps.push(step);

  if (decision === "return") {
    request.state = "returned"; request.resolvedAt = now();
    event.status = "returned";
    if (budget) budget.stage = "returned";
    notifyClub(event, `“${event.title}” was returned for changes`,
      `${R.STAGE_LABELS[stage]}: ${comment}`);
  } else if (decision === "reject") {
    request.state = "rejected"; request.resolvedAt = now();
    event.status = "rejected";
    if (budget) budget.stage = "rejected";
    notifyClub(event, `“${event.title}” was rejected`,
      `${R.STAGE_LABELS[stage]}: ${comment}`);
  } else {
    const remaining = request.stages.slice(request.stages.indexOf(stage) + 1);
    if (remaining.length) {
      request.currentStage = remaining[0];
      if (budget) budget.stage = stageForGate(remaining[0]);
      notifyStage(request);
      notifyClub(event, `“${event.title}” cleared the ${R.STAGE_LABELS[stage]}`,
        `It is now with the ${R.STAGE_LABELS[remaining[0]]}.`);
    } else {
      // Last gate cleared: published in the same step. An "approved but not
      // published" limbo is a state nobody watches, and proposals rot in it.
      request.state = "approved"; request.resolvedAt = now();
      event.status = "published";
      if (budget) budget.stage = "sanctioned";
      notifyClub(event, `“${event.title}” is approved and published`,
        "Registration is open and the event is on the calendar.");
    }
  }
  audit(ctx, `approval.${decision}`, event.id,
    { stage, state: request.state, eventStatus: event.status }, comment);
  return step;
}

function applySanctions(budget, sanctioned) {
  if (!budget) return;
  for (const [lineId, raw] of Object.entries(sanctioned || {})) {
    const line = find(budget.lines, lineId);
    if (!line) {
      throw invalid("BUDGET_UNKNOWN_LINE", "Unknown budget line", `No line ${lineId}.`);
    }
    const amount = Math.max(0, Number(raw) || 0);
    if (amount > line.amountRequested) {
      throw invalid("BUDGET_SANCTION_EXCEEDS_REQUEST", "Sanction exceeds the request",
        `“${line.head}” requested ${line.amountRequested}; ${amount} cannot be sanctioned.`,
        [{ field: `sanctioned.${lineId}`, code: "ABOVE_REQUESTED",
           message: String(line.amountRequested) }]);
    }
    line.amountSanctioned = amount;
  }
  // Heads the approver did not touch are sanctioned as requested. A null there
  // would read as "not yet decided" after the decision was made.
  for (const line of budget.lines) {
    if (line.amountSanctioned == null) line.amountSanctioned = line.amountRequested;
  }
}

// --- venue clashes --------------------------------------------------------
export const BUFFER_MINUTES = 30;
const SLOT_HOLDING = ["submitted", "approved", "published", "live", "completed", "reported"];
const SLOT_CONFIRMED = ["approved", "published", "live", "completed", "reported"];

const ms = iso => new Date(iso).getTime();
const buffer = BUFFER_MINUTES * 60 * 1000;

export function overlaps(a, b) {
  if (a.venueId !== b.venueId || a.id === b.id) return false;
  return ms(a.startsAt) < ms(b.endsAt) + buffer && ms(b.startsAt) < ms(a.endsAt) + buffer;
}

export const clashesFor = event =>
  db().events.filter(o => SLOT_HOLDING.includes(o.status) && overlaps(event, o));

export function allClashes() {
  const seen = new Set(); const out = [];
  for (const e of db().events.filter(x => SLOT_HOLDING.includes(x.status))) {
    for (const o of clashesFor(e)) {
      const key = [e.id, o.id].sort().join("|");
      if (!seen.has(key)) { seen.add(key); out.push([e, o]); }
    }
  }
  return out;
}

export function assertBookable(candidate) {
  const hard = db().events.filter(
    o => SLOT_CONFIRMED.includes(o.status) && overlaps(candidate, o));
  if (hard.length) {
    const other = hard[0];
    throw conflict("EVENTS_VENUE_UNAVAILABLE", "Venue already booked",
      `${find(db().venues, other.venueId).name} is booked for “${other.title}” then, `
      + `including a ${BUFFER_MINUTES}-minute buffer.`);
  }
  // Overlap with another PENDING request is allowed and flagged: which club gets
  // Friday evening is the Dean's call, not a validation error.
  return db().events.filter(o => o.status === "submitted" && overlaps(candidate, o));
}

// --- notifications and audit ---------------------------------------------
export function notifyStage(request) {
  const event = find(db().events, request.eventId);
  const club = find(db().clubs, event.clubId);
  const role = R.STAGE_ROLE[request.currentStage];
  for (const user of db().users.filter(u => (u.globalRoles || []).includes(role))) {
    push(user.id, `${club.name} sent “${event.title}” for approval`,
      `Requesting ${request.amountRequested.toLocaleString("en-IN")}. `
      + `It is with the ${R.STAGE_LABELS[request.currentStage]}.`);
  }
}

export function notifyClub(event, subject, body) {
  // Office bearers only. A club member has no budget visibility, so an outcome
  // carrying a sanctioned figure goes only to the roles allowed to see it.
  for (const m of db().memberships.filter(
    m => m.clubId === event.clubId && !m.endedAt && R.BUDGET_VIEWERS.includes(m.role))) {
    const student = find(db().students, m.studentId);
    if (student) push(student.userId, subject, body);
  }
}

function push(userId, subject, body) {
  db().notifications.unshift({
    id: uid("nt"), userId, subject, body, readAt: null, at: now(),
  });
}

export function audit(ctx, action, targetId, after = {}, reason = "") {
  db().audit.unshift({
    id: uid("au"), actorSub: ctx.sub, actorLabel: ctx.displayName,
    action, targetId, after, reason, at: now(),
  });
}
