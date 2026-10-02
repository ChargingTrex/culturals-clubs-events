/**
 * End to end: a club raises a budget request and it travels the three gates.
 *
 * This is the workflow the testers are being asked to feel, so it is tested from
 * the outside — through the same api.* calls the pages make — rather than by
 * poking the engines directly.
 */
import { describe, test, beforeEach, expect, refuses, world } from "./harness.mjs";
import * as api from "../src/api.js";
import { db } from "../src/db.js";

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

describe("Approvals: Society, then Dean, then Management", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  const pendingNight = session => api.governance.queue(session).results
    .find(r => r.eventTitle === "Culturals Night 2026");

  test("each gate sees only its own queue", () => {
    const society = api.governance.queue(as.society);
    const dean = api.governance.queue(as.dean);
    expect(society.stagesYouHold).toEqual(["cultural_society"]);
    expect(dean.stagesYouHold).toEqual(["dean"]);
    expect(society.count).toBeGreaterThan(0);
    // Everything still sits at gate 1, so the Dean's queue is correctly empty.
    expect(dean.count).toBe(0);
  });

  test("a student sees no queue at all", () => {
    const queue = api.governance.queue(as.student);
    expect(queue.stagesYouHold).toHaveLength(0);
    expect(queue.count).toBe(0);
  });

  test("above the threshold the route gains the VC gate", () => {
    const row = pendingNight(as.society);
    expect(row.requiresVc).toBeTruthy();
    expect(row.vcReason).toContain("over");
    expect(row.stages).toEqual(["cultural_society", "dean", "vc"]);
  });

  test("the full three-gate chain publishes the event", () => {
    const row = pendingNight(as.society);
    api.governance.decide(as.society, row.id, { decision: "approve" });
    expect(api.governance.get(as.society, row.id).currentStage).toBe("dean");

    api.governance.decide(as.dean, row.id, { decision: "approve" });
    expect(api.governance.get(as.dean, row.id).currentStage).toBe("vc");

    api.governance.decide(as.vc, row.id, { decision: "approve" });
    const resolved = api.governance.get(as.dean, row.id);
    expect(resolved.state).toBe("approved");

    const event = api.events.get(as.dean, resolved.eventId);
    expect(event.status).toBe("published");
    expect(event.budget.stage).toBe("sanctioned");
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
