/**
 * End to end: a club raises a budget request and it travels the gates — the
 * Cultural Society, the Dean, the Vice-Chancellor and Management.
 *
 * This is the workflow the testers are being asked to feel, so it is tested from
 * the outside — through the same api.* calls the pages make — rather than by
 * poking the engines directly.
 */
import { describe, test, beforeEach, expect, refuses, world } from "./harness.mjs";
import * as api from "../src/api.js";
import { db, dropMemory, load } from "../src/db.js";

const inDays = (days, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

/** A fresh unpriced draft in Swara, in a venue nothing else wants. */
function newDraft(as, { title = "Monsoon Ragas", expected = 60, submit = false } = {}) {
  const clubId = as.president.capabilities().clubsCanPropose[0];
  const venue = db().venues.find(v => v.name === "Music Room");
  return api.events.create(as.treasurer, {
    title, clubId, venueId: venue.id, kind: "performance",
    startsAt: inDays(45, 11), endsAt: inDays(45, 13),
    expectedAttendance: Math.min(expected, venue.capacity), submit,
  });
}

describe("Budget request: the Treasurer raises it", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("an event can be created unpriced, and gets a budget shell", () => {
    const created = newDraft(as);
    expect(created.event.status).toBe("draft");
    expect(created.budget.lines).toHaveLength(0);
    expect(created.budget.isReadyToSubmit).toBeFalsy();
    expect(created.approval).toBeNull();
  });

  test("an unpriced proposal cannot be submitted", async () => {
    const created = newDraft(as);
    await refuses(() => api.events.submit(as.president, created.event.id),
      { code: "GOVERNANCE_BUDGET_REQUIRED", status: 409 });
  });

  test("the Treasurer adds entries and then it submits", () => {
    const created = newDraft(as);
    const id = created.budget.id;
    api.budget.addLine(as.treasurer, id, { head: "Sound", amountRequested: 9000 });
    api.budget.addLine(as.treasurer, id, { head: "Refreshments", amountRequested: 3500 });
    const view = api.budget.get(as.treasurer, id);
    expect(view.lines).toHaveLength(2);
    expect(view.totalRequested).toBe(12500);

    const approval = api.events.submit(as.president, created.event.id);
    expect(approval.state).toBe("pending");
    expect(approval.currentStage).toBe("cultural_society");
  });

  test("a plain member cannot add an entry", async () => {
    const created = newDraft(as);
    await refuses(() => api.budget.addLine(as.member, created.budget.id,
      { head: "Sneaky", amountRequested: 1 }), { code: "NOT_FOUND", status: 404 });
  });

  test("a plain member cannot even see the budget exists", () => {
    newDraft(as);
    expect(api.budget.list(as.member)).toHaveLength(0);
    expect(api.budget.list(as.treasurer).length).toBeGreaterThan(0);
  });

  test("one head cannot appear twice", async () => {
    const created = newDraft(as);
    api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Sound", amountRequested: 9000 });
    await refuses(() => api.budget.addLine(as.treasurer, created.budget.id,
      { head: "sound", amountRequested: 500 }),
      { code: "BUDGET_LINE_DUPLICATE_HEAD", status: 409 });
  });

  test("entries freeze once an approver holds the budget", async () => {
    const created = newDraft(as);
    api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Sound", amountRequested: 9000 });
    api.events.submit(as.president, created.event.id);
    await refuses(() => api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Late addition", amountRequested: 500 }),
      { code: "BUDGET_LOCKED", status: 409 });
  });

  test("the Treasurer cannot run the event they priced", async () => {
    const created = newDraft(as);
    const caps = as.treasurer.capabilities();
    expect(caps.clubsCanPropose.length).toBeGreaterThan(0);
    expect(caps.clubsCanOperateEvents).toHaveLength(0);
    await refuses(() => api.events.close(as.treasurer, created.event.id,
      { photoCount: 3 }), { code: "EVENTS_CLOSE_DENIED", status: 403 });
  });
});

describe("Zero-budget events carry an explicit declaration", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("a nil declaration needs a real reason", async () => {
    const created = newDraft(as, { title: "Free Reading Circle" });
    await refuses(() => api.budget.declareNil(as.treasurer, created.budget.id,
      { reason: "n/a" }), { code: "BUDGET_NIL_REASON_REQUIRED", status: 422 });
  });

  test("a declared nil budget submits, and the approver sees the statement", () => {
    const created = newDraft(as, { title: "Free Reading Circle" });
    const declared = api.budget.declareNil(as.treasurer, created.budget.id,
      { reason: "Music Room is free and the club owns the equipment" });
    expect(declared.nilDeclaration.head).toBe("No budget required");
    expect(declared.nilDeclaration.declaredBy).toBe(as.treasurer.displayName);
    expect(declared.isReadyToSubmit).toBeTruthy();
    expect(declared.totalRequested).toBe(0);

    api.events.submit(as.president, created.event.id);
    const queue = api.governance.queue(as.society);
    const row = queue.results.find(r => r.eventTitle === "Free Reading Circle");
    expect(row.amountRequested).toBe(0);
    expect(row.lines).toHaveLength(0);
    expect(row.nilDeclaration.head).toBe("No budget required");
    // Zero is under the threshold, so it never reaches Management.
    expect(row.stages).notToContain("vc");
  });

  test("declaring nil is refused while priced lines exist", async () => {
    const created = newDraft(as);
    api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Prizes", amountRequested: 3000 });
    const err = await refuses(() => api.budget.declareNil(as.treasurer,
      created.budget.id, { reason: "Actually it is free" }),
      { code: "BUDGET_NIL_HAS_LINES", status: 409 });
    expect(err.detail).toContain("Prizes");
  });

  test("adding a priced line withdraws the declaration", () => {
    const created = newDraft(as);
    api.budget.declareNil(as.treasurer, created.budget.id,
      { reason: "Nothing needed for this one" });
    const after = api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Prizes", amountRequested: 3000 });
    expect(after.nilDeclaration).toBeNull();
  });
});

describe("Approvals: Society, Dean, Vice-Chancellor, Management", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  const pendingNight = session => api.governance.queue(session).results
    .find(r => r.eventTitle === "Culturals Night 2026");

  test("each gate sees only its own queue", () => {
    const gates = { society: "cultural_society", dean: "dean", vc: "vc",
                    management: "management" };
    for (const [persona, stage] of Object.entries(gates)) {
      const queue = api.governance.queue(as[persona]);
      expect(queue.stagesYouHold).toEqual([stage]);
      // The seed leaves something at every gate, so no approver opens to nothing.
      expect(queue.count).toBeGreaterThan(0);
      for (const row of queue.results) expect(row.currentStage).toBe(stage);
    }
    // Culturals Night still sits at gate 1, so it is correctly not the Dean's yet.
    expect(pendingNight(as.dean)).toBeFalsy();
    expect(pendingNight(as.society)).toBeTruthy();
  });

  test("a student sees no queue at all", () => {
    const queue = api.governance.queue(as.student);
    expect(queue.stagesYouHold).toHaveLength(0);
    expect(queue.count).toBe(0);
  });

  test("the route grows with the amount: VC over 50,000, Management over 2 lakh", () => {
    const small = api.governance.queue(as.society).results
      .find(r => r.eventTitle === "Drishti Street Play");
    expect(small.stages).toEqual(["cultural_society", "dean"]);

    const middle = api.governance.queue(as.vc).results
      .find(r => r.eventTitle === "Natya Dance Drama");
    expect(middle.amountRequested).toBeGreaterThan(50000);
    expect(middle.stages).toEqual(["cultural_society", "dean", "vc"]);
    expect(middle.requiresManagement).toBeFalsy();

    const row = pendingNight(as.society);
    expect(row.amountRequested).toBeGreaterThan(200000);
    expect(row.requiresVc).toBeTruthy();
    expect(row.vcReason).toContain("over");
    expect(row.requiresManagement).toBeTruthy();
    expect(row.managementReason).toContain("2,00,000");
    expect(row.stages).toEqual(["cultural_society", "dean", "vc", "management"]);
  });

  test("the route preview a club sees before sending matches the real route", () => {
    const swara = db().clubs.find(c => c.name === "Swara");
    const preview = api.governance.previewRoute(as.treasurer,
      { clubId: swara.id, amount: pendingNight(as.society).amountRequested });
    expect(preview.stages.map(s => s.stage))
      .toEqual(["cultural_society", "dean", "vc", "management"]);
  });

  test("the full four-gate chain publishes the event", () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    expect(api.governance.get(as.society, row.id).currentStage).toBe("dean");

    api.governance.decide(as.dean, row.id, { decision: "approve" });
    expect(api.governance.get(as.dean, row.id).currentStage).toBe("vc");
    expect(api.events.get(as.treasurer, row.eventId).budget.stage).toBe("vc_review");

    api.governance.decide(as.vc, row.id, { decision: "approve" });
    expect(api.governance.get(as.vc, row.id).currentStage).toBe("management");
    expect(api.events.get(as.treasurer, row.eventId).budget.stageLabel)
      .toBe("With Management");
    // Approved by three gates and still not published: the fourth has not spoken.
    expect(api.events.get(as.dean, row.eventId).status).toBe("submitted");

    api.governance.decide(as.management, row.id, { decision: "approve" });
    const resolved = api.governance.get(as.dean, row.id);
    expect(resolved.state).toBe("approved");
    expect(resolved.steps.map(x => x.stage))
      .toEqual(["cultural_society", "dean", "vc", "management"]);

    const event = api.events.get(as.dean, resolved.eventId);
    expect(event.status).toBe("published");
    expect(event.budget.stage).toBe("sanctioned");
    // And it is now open to students.
    expect(api.events.list(as.student, { status: "published" }).map(e => e.id))
      .toContain(resolved.eventId);
  });

  test("Management cannot act while it is with the Vice-Chancellor", async () => {
    const row = api.governance.queue(as.vc).results
      .find(r => r.eventTitle === "Natya Dance Drama");
    // Natya Dance Drama never reaches Management at all: not on its route.
    await refuses(() => api.governance.decide(as.management, row.id,
      { decision: "approve" }), { code: "GOVERNANCE_NOT_APPROVER", status: 403 });

    const night = pendingNight(as.society);
    api.governance.decide(as.society, night.id, { decision: "approve" });
    api.governance.decide(as.dean, night.id, { decision: "approve" });
    const err = await refuses(() => api.governance.decide(as.management, night.id,
      { decision: "approve" }), { code: "GOVERNANCE_WRONG_STAGE", status: 409 });
    expect(err.detail).toContain("Vice-Chancellor");
  });

  test("Management's approval of the seeded championship publishes it", () => {
    const row = api.governance.queue(as.management).results
      .find(r => r.eventTitle === "Inter-College Dance Championship");
    expect(row.steps.map(x => x.stage)).toEqual(["cultural_society", "dean", "vc"]);
    api.governance.decide(as.management, row.id, { decision: "approve" });
    expect(api.events.get(as.dean, row.eventId).status).toBe("published");
  });

  test("the Dean cannot act while it is with the Society", async () => {
    const row = pendingNight(as.society);
    await refuses(() => api.governance.decide(as.dean, row.id,
      { decision: "approve" }), { code: "GOVERNANCE_WRONG_STAGE", status: 409 });
  });

  test("an approver later on the route is told it is not their turn", async () => {
    const row = pendingNight(as.society);
    const err = await refuses(() => api.governance.decide(as.vc, row.id,
      { decision: "approve" }), { code: "GOVERNANCE_WRONG_STAGE", status: 409 });
    expect(err.detail).toContain("Cultural Society");
  });

  test("the VC holds no gate on a below-threshold route", async () => {
    const row = api.governance.queue(as.society).results
      .find(r => !r.requiresVc);
    await refuses(() => api.governance.decide(as.vc, row.id,
      { decision: "approve" }), { code: "GOVERNANCE_NOT_APPROVER", status: 403 });
  });

  test("returning or rejecting requires a comment", async () => {
    const row = pendingNight(as.society);
    await refuses(() => api.governance.decide(as.society, row.id,
      { decision: "return" }), { code: "GOVERNANCE_COMMENT_REQUIRED", status: 422 });
    await refuses(() => api.governance.decide(as.society, row.id,
      { decision: "reject" }), { code: "GOVERNANCE_COMMENT_REQUIRED", status: 422 });
  });

  test("a returned proposal can be revised and resubmitted", () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id,
      { decision: "return", comment: "Trim the artist fees." });
    const event = api.events.get(as.president, row.eventId);
    expect(event.status).toBe("returned");
    // A return reopens the budget, which is the point of returning.
    expect(event.budget.isEditable).toBeTruthy();
    const again = api.events.submit(as.president, row.eventId);
    expect(again.state).toBe("pending");
  });

  test("a rejection is terminal", async () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id,
      { decision: "reject", comment: "Not this semester." });
    expect(api.events.get(as.president, row.eventId).status).toBe("rejected");
    await refuses(() => api.events.submit(as.president, row.eventId),
      { code: "GOVERNANCE_ALREADY_SUBMITTED", status: 409 });
  });

  test("the Dean may reduce a head but never raise it", async () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    const line = api.governance.get(as.dean, row.id).lines[0];
    await refuses(() => api.governance.decide(as.dean, row.id,
      { decision: "approve", sanctioned: { [line.id]: 999999 } }),
      { code: "BUDGET_SANCTION_EXCEEDS_REQUEST", status: 422 });
  });

  test("a later gate may cut the Dean's sanction, never restore it", async () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    const [first, second] = api.governance.get(as.dean, row.id).lines;
    api.governance.decide(as.dean, row.id, {
      decision: "approve", sanctioned: { [first.id]: first.amountRequested - 10000 },
    });
    // Restoring the cut is refused, even though it is within what was requested.
    await refuses(() => api.governance.decide(as.vc, row.id, {
      decision: "approve", sanctioned: { [first.id]: first.amountRequested },
    }), { code: "BUDGET_SANCTION_RAISED", status: 422 });

    api.governance.decide(as.vc, row.id, {
      decision: "approve", sanctioned: { [second.id]: 1000 },
    });
    const lines = api.budget.forEvent(as.dean, row.eventId).lines;
    expect(lines[0].amountSanctioned).toBe(first.amountRequested - 10000);
    expect(lines[1].amountSanctioned).toBe(1000);
  });

  test("a refused sanction changes no head at all", async () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    const [first, second] = api.governance.get(as.dean, row.id).lines;
    await refuses(() => api.governance.decide(as.dean, row.id, {
      decision: "approve",
      sanctioned: { [first.id]: 10, [second.id]: second.amountRequested + 1 },
    }), { code: "BUDGET_SANCTION_EXCEEDS_REQUEST", status: 422 });
    // The valid figure for the first head must not have been half-applied.
    expect(api.budget.forEvent(as.dean, row.eventId).lines[0].amountSanctioned)
      .toBeNull();
  });

  test("the Society recommends but does not sanction figures", () => {
    const row = pendingNight(as.society);
    expect(row.canSanction).toBeFalsy();
    const line = row.lines[0];
    api.governance.decide(as.society, row.id,
      { decision: "approve", sanctioned: { [line.id]: 1 } });
    expect(api.budget.forEvent(as.dean, row.eventId).lines[0].amountSanctioned)
      .toBeNull();
    expect(api.governance.get(as.dean, row.id).canSanction).toBeTruthy();
  });

  test("a resubmitted proposal starts with nothing sanctioned", () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    api.governance.decide(as.dean, row.id, { decision: "approve" });
    expect(api.budget.forEvent(as.dean, row.eventId).totalSanctioned).toBeGreaterThan(0);
    api.governance.decide(as.vc, row.id,
      { decision: "return", comment: "Find a sponsor for the artist fee." });
    api.events.submit(as.treasurer, row.eventId);
    // Last round's figures would read as already decided while this one is open.
    expect(api.budget.forEvent(as.dean, row.eventId).totalSanctioned).toBe(0);
  });

  test("the club sees why it was returned; a plain member sees no figures", () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id,
      { decision: "return", comment: "Trim the artist fees." });
    const forTreasurer = api.events.get(as.treasurer, row.eventId).approval;
    expect(forTreasurer.state).toBe("returned");
    expect(forTreasurer.lastDecision.comment).toBe("Trim the artist fees.");
    expect(forTreasurer.stages[0].status).toBe("returned");

    const forMember = api.events.get(as.member, row.eventId).approval;
    expect(forMember.state).toBe("returned");
    // A return comment is usually about the money; a member has no budget access.
    expect(forMember.lastDecision.comment).toBeNull();
  });

  test("a club member can follow a proposal but never read its figures", () => {
    const rows = api.governance.list(as.member);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.amountRequested).toBeNull();
      expect(row.lines).toHaveLength(0);
    }
    // The Treasurer of the same club still sees them.
    expect(api.governance.list(as.treasurer).some(r => r.amountRequested > 0))
      .toBeTruthy();
  });

  test("heads the Dean did not touch are sanctioned as requested", () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    const before = api.governance.get(as.dean, row.id).lines;
    api.governance.decide(as.dean, row.id, {
      decision: "approve", sanctioned: { [before[0].id]: 1000 },
    });
    const after = api.budget.forEvent(as.dean, row.eventId).lines;
    expect(after[0].amountSanctioned).toBe(1000);
    // Not null — a null after the decision would read as "not yet decided".
    expect(after[1].amountSanctioned).toBe(after[1].amountRequested);
  });

  test("no club role approves its own budget", async () => {
    // Give the Swara president the society gate too; the club role must still win.
    const user = db().users.find(u => u.id === as.president.sub);
    user.globalRoles = [...user.globalRoles, "cultural_society"];
    const { sessionFor } = await import("../src/session.js");
    const conflicted = sessionFor("president");
    const row = pendingNight(as.society);
    await refuses(() => api.governance.decide(conflicted, row.id,
      { decision: "approve" }), { code: "GOVERNANCE_SELF_APPROVAL", status: 403 });
  });

  test("an unresolved venue clash blocks approval but not a return", async () => {
    const clashing = api.governance.queue(as.society).results
      .find(r => r.clashes.length > 0);
    expect(clashing).toBeTruthy();
    await refuses(() => api.governance.decide(as.society, clashing.id,
      { decision: "approve" }), { code: "GOVERNANCE_CLASH_UNRESOLVED", status: 409 });
    // A clash must not trap a proposal the approver wants to send back.
    const returned = api.governance.decide(as.society, clashing.id,
      { decision: "return", comment: "Another club wants this slot; pick another." });
    expect(returned.request.state).toBe("returned");
  });
});

describe("State survives a page load", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("records created on separate page loads get distinct ids", () => {
    // Every page is a fresh load. The id counter used to restart at zero on each,
    // so two events created on two pages were both ev_0001 and shared one budget.
    const first = newDraft(as, { title: "First Page Draft" });
    dropMemory();
    load();
    const second = newDraft(as, { title: "Second Page Draft" });
    expect(first.event.id === second.event.id).toBeFalsy();
    expect(first.budget.id === second.budget.id).toBeFalsy();
    const ids = db().events.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a returned trip through storage keeps every rule intact", () => {
    const created = newDraft(as, { title: "Stored Then Priced" });
    dropMemory();
    load();
    api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Sound", amountRequested: 5000 });
    const approval = api.events.submit(as.president, created.event.id);
    expect(approval.currentStage).toBe("cultural_society");
    expect(db().budgets.filter(b => b.eventId === created.event.id)).toHaveLength(1);
  });
});

describe("The guided journey counts only what the tester did", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("a fresh dataset starts at zero, and real actions tick it forward", () => {
    // The seed walks proposals through every gate itself; none of that may count.
    expect(api.pilot.journey().done).toBe(0);
    const night = api.governance.queue(as.society).results
      .find(r => r.eventTitle === "Culturals Night 2026");
    api.governance.decide(as.society, night.id, { decision: "approve" });
    const journey = api.pilot.journey();
    expect(journey.steps.find(x => x.key === "society").done).toBeTruthy();
    expect(journey.steps.find(x => x.key === "dean").done).toBeFalsy();
    expect(journey.done).toBe(1);
  });

  test("seeding before today's live event starts still counts nothing as done",
    async () => {
      // The seed backfills check-ins at today's live event. Seeded at 9am, before
      // that event opens, a naive backfill lands in the future — after the moment
      // the tester's own actions start counting — and ticks the journey for them.
      const RealDate = Date;
      const morning = new RealDate();
      morning.setHours(9, 0, 0, 0);
      const offset = morning.getTime() - RealDate.now();
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [RealDate.now() + offset])); }
        static now() { return RealDate.now() + offset; }
      };
      try {
        await world();
        expect(api.pilot.journey().done).toBe(0);
        const late = db().scans.filter(s => s.scannedAt > db().readyAt);
        expect(late).toHaveLength(0);
      } finally {
        globalThis.Date = RealDate;
      }
    });
});

describe("Settlement happens last, and says so", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("a draft budget reports no blockers, only what it waits on", () => {
    const created = newDraft(as);
    api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Sound", amountRequested: 9000 });
    const view = api.budget.get(as.treasurer, created.budget.id);
    expect(view.settlementProblems).toHaveLength(0);
    expect(view.canSettle).toBeFalsy();
    expect(view.settlementWaitingOn).toBe("sanction");
    expect(view.settlementHint).toContain("sanctioned before spend");
  });

  test("sanctioned but not yet run waits on the event", () => {
    const quiz = db().events.find(e => e.title === "Kalam Lit Quiz");
    const view = api.budget.forEvent(as.dean, quiz.id);
    expect(view.stage).toBe("sanctioned");
    expect(view.canSettle).toBeFalsy();
    expect(view.settlementWaitingOn).toBe("event");
    expect(view.settlementProblems).toHaveLength(0);
  });

  test("settling out of order is refused by the API, not just hidden", async () => {
    const created = newDraft(as);
    api.budget.addLine(as.treasurer, created.budget.id,
      { head: "Sound", amountRequested: 9000 });
    await refuses(() => api.budget.settle(as.treasurer, created.budget.id),
      { code: "BUDGET_NOT_SANCTIONED", status: 409 });
  });

  test("blockers appear once settlement is reachable, all at once", async () => {
    // The live Lens event: sanctioned, and running now.
    const walk = db().events.find(e => e.title === "Lens Heritage Photowalk");
    const view = api.budget.forEvent(as.organiser, walk.id);
    expect(view.canSettle).toBeTruthy();
    expect(view.settlementProblems.map(p => p.code)).toContain("NO_SPEND_ENTERED");

    // Overspend one head with no receipt and no reason: two blockers, one call.
    const line = view.lines[0];
    api.budget.setSpend(as.organiser, view.id, line.id,
      { amountSpent: line.amountSanctioned + 9000 });
    const codes = api.budget.get(as.organiser, view.id)
      .settlementProblems.map(p => p.code);
    expect(codes).toContain("RECEIPT_REQUIRED");
    expect(codes).toContain("VARIANCE_NOTE_REQUIRED");
    await refuses(() => api.budget.settle(as.organiser, view.id),
      { code: "BUDGET_SETTLEMENT_INCOMPLETE", status: 422 });
  });

  test("a receipt and a reason clear the blockers", () => {
    const walk = db().events.find(e => e.title === "Lens Heritage Photowalk");
    const view = api.budget.forEvent(as.organiser, walk.id);
    for (const line of view.lines) {
      api.budget.setSpend(as.organiser, view.id, line.id, {
        amountSpent: line.amountSanctioned, varianceNote: "",
      });
      if (line.amountSanctioned > view.thresholds.receiptThreshold) {
        api.budget.attachReceipt(as.organiser, view.id, line.id,
          { fileName: "receipt.pdf" });
      }
    }
    const settled = api.budget.settle(as.organiser, view.id);
    expect(settled.stage).toBe("settled");
  });

  test("a nil budget settles with nothing to settle", () => {
    const created = newDraft(as, { title: "Free Circle" });
    api.budget.declareNil(as.treasurer, created.budget.id,
      { reason: "Costs nothing at all" });
    api.events.submit(as.president, created.event.id);
    const row = api.governance.queue(as.society).results
      .find(r => r.eventTitle === "Free Circle");
    api.governance.decide(as.society, row.id, { decision: "approve" });
    api.governance.decide(as.dean, row.id, { decision: "approve" });
    api.events.goLive(as.president, created.event.id);

    const settled = api.budget.settle(as.treasurer, created.budget.id);
    expect(settled.stage).toBe("settled");
    expect(settled.settlementProblems).toHaveLength(0);
  });
});
