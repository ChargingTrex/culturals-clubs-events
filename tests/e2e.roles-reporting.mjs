/**
 * End to end: role boundaries, and the figures the report leads with.
 *
 * The role tests are the "wrong-role" tests the spec's definition of done asks
 * for — every restriction proved by calling it as somebody who should be refused.
 */
import { describe, test, beforeEach, expect, refuses, world } from "./harness.mjs";
import * as api from "../src/api.js";
import { db } from "../src/db.js";
import * as attendance from "../src/attendance.js";

describe("Role boundaries", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  const swara = () => db().clubs.find(c => c.name === "Swara");

  test("budget visibility begins at Treasurer", () => {
    expect(api.budget.list(as.member)).toHaveLength(0);
    expect(api.budget.list(as.secretary)).toHaveLength(0);
    expect(api.budget.list(as.treasurer).length).toBeGreaterThan(0);
    expect(api.budget.list(as.president).length).toBeGreaterThan(0);
  });

  test("an event payload omits the budget for a member and includes it for a treasurer", () => {
    const event = db().events.find(e => e.clubId === swara().id);
    expect(api.events.get(as.member, event.id).budget).toBeNull();
    expect(api.events.get(as.treasurer, event.id).budget).toBeTruthy();
  });

  test("another club's budget is 404, not 403", async () => {
    // A 403 would confirm the budget exists, which for another club's money is
    // itself the disclosure.
    const lensEvent = db().events.find(
      e => e.clubId === db().clubs.find(c => c.name === "Lens").id);
    const lensBudget = db().budgets.find(b => b.eventId === lensEvent.id);
    await refuses(() => api.budget.get(as.treasurer, lensBudget.id),
      { code: "NOT_FOUND", status: 404 });
  });

  test("only the President and VP may assign roles", async () => {
    const roster = api.clubs.roster(as.president, swara().id);
    const target = roster.results.find(r => r.role === "club_member");
    expect(roster.canAssignRoles).toBeTruthy();

    const changed = api.clubs.setRole(as.president, target.id,
      { role: "club_core", reason: "Reorganising" });
    expect(changed.role).toBe("club_core");

    // The Treasurer explicitly cannot — checked on save, not by hiding a control.
    expect(api.clubs.roster(as.treasurer, swara().id).canAssignRoles).toBeFalsy();
    await refuses(() => api.clubs.setRole(as.treasurer, target.id,
      { role: "club_secretary" }), { code: "CLUBS_ROLE_ASSIGN_DENIED", status: 403 });
    // And nothing changed.
    expect(api.clubs.roster(as.president, swara().id).results
      .find(r => r.id === target.id).role).toBe("club_core");
  });

  test("a second president is refused", async () => {
    const roster = api.clubs.roster(as.president, swara().id);
    const target = roster.results.find(r => r.role === "club_core"
      || r.role === "club_member");
    await refuses(() => api.clubs.setRole(as.president, target.id,
      { role: "club_president" }), { code: "CLUBS_PRESIDENT_EXISTS", status: 409 });
  });

  test("a plain member cannot propose an event", async () => {
    const venue = db().venues.find(v => v.name === "Music Room");
    const future = new Date(); future.setDate(future.getDate() + 60);
    await refuses(() => api.events.create(as.member, {
      title: "Member's idea", clubId: swara().id, venueId: venue.id,
      startsAt: future.toISOString(),
      endsAt: new Date(future.getTime() + 3600000).toISOString(),
      expectedAttendance: 20,
    }), { code: "EVENTS_PROPOSE_DENIED", status: 403 });
  });

  test("only the Dean may move an event between venues", async () => {
    const clash = api.venues.calendar(as.dean).clashes[0];
    const target = clash.events[0];
    await refuses(() => api.events.reassign(as.president, target.id,
      { toVenue: db().venues[0].id, reason: "I would prefer the big hall" }),
      { code: "EVENTS_REASSIGN_DENIED", status: 403 });

    const options = api.events.clashes(as.dean, target.id);
    expect(options.freeVenues.length).toBeGreaterThan(0);
    const moved = api.events.reassign(as.dean, target.id, {
      toVenue: options.freeVenues[0].id,
      reason: "Hall double-booked; this one has the same setup",
    });
    expect(moved.to).toBe(options.freeVenues[0].name);
    // Moving resolves the clash, so approval unblocks.
    expect(api.events.clashes(as.dean, target.id).clashes).toHaveLength(0);
  });

  test("a move needs a reason the club can act on", async () => {
    const clash = api.venues.calendar(as.dean).clashes[0];
    const options = api.events.clashes(as.dean, clash.events[0].id);
    await refuses(() => api.events.reassign(as.dean, clash.events[0].id,
      { toVenue: options.freeVenues[0].id, reason: "x" }),
      { code: "EVENTS_REASON_REQUIRED", status: 422 });
  });

  test("the venue calendar is staff-only", async () => {
    await refuses(() => api.venues.calendar(as.student),
      { code: "EVENTS_CALENDAR_DENIED", status: 403 });
    expect(api.venues.calendar(as.dean).bookings.length).toBeGreaterThan(0);
  });

  test("the audit trail is Dean and admin only", async () => {
    await refuses(() => api.governance.audit(as.treasurer),
      { code: "GOVERNANCE_AUDIT_DENIED", status: 403 });
    expect(api.governance.audit(as.dean).length).toBeGreaterThan(0);
  });
});

describe("Management gets a dashboard, never a roster", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("the VC can read the report and the above-threshold queue", () => {
    expect(api.reports.semester(as.vc).eventsRun).toBeGreaterThan(0);
    expect(api.governance.queue(as.vc).stagesYouHold).toEqual(["vc"]);
  });

  test("the VC cannot read any club roster", async () => {
    for (const club of db().clubs) {
      await refuses(() => api.clubs.roster(as.vc, club.id),
        { code: "NOT_FOUND", status: 404 });
    }
  });

  test("the VC cannot read any attendee list", async () => {
    for (const event of db().events) {
      await refuses(() => api.participation.roster(as.vc, event.id),
        { code: "NOT_FOUND", status: 404 });
    }
  });

  test("the VC cannot reach the Dean's operational overview", async () => {
    await refuses(() => api.reports.overview(as.vc),
      { code: "REPORTING_DENIED", status: 403 });
  });

  test("no PRN or student name appears in anything the VC can read", () => {
    const readable = JSON.stringify({
      report: api.reports.semester(as.vc),
      queue: api.governance.queue(as.vc),
      events: api.events.list(as.vc),
      calendar: api.venues.calendar(as.vc),
      budgets: api.budget.list(as.vc),
    });
    for (const student of db().students) {
      expect(readable).notToContain(student.prn);
      expect(readable).notToContain(student.fullName);
    }
  });

  test("the Dean is unaffected and still sees rosters", () => {
    expect(api.clubs.roster(as.dean, db().clubs[0].id).results.length)
      .toBeGreaterThan(0);
    const reported = db().events.find(e => e.status === "reported");
    expect(api.participation.roster(as.dean, reported.id).results.length)
      .toBeGreaterThan(0);
  });

  test("a student cannot read the semester report", async () => {
    await refuses(() => api.reports.semester(as.student),
      { code: "REPORTING_DENIED", status: 403 });
  });
});

describe("The semester report", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("unique students and total attendance are different numbers", () => {
    const report = api.reports.semester(as.dean);
    expect(report.eventsRun).toBeGreaterThan(0);
    expect(report.totalParticipation).toBeGreaterThan(0);
    expect(report.uniqueStudents).toBeGreaterThan(0);
    // The whole point of the figure: 20 events attended by the same 80 students
    // and 20 reaching 600 give the same total. Only DISTINCT separates them, and
    // the seed builds deliberate overlap so this assertion means something.
    expect(report.uniqueStudents).toBeLessThan(report.totalParticipation);
  });

  test("only reported events count, and absentees do not", () => {
    const report = api.reports.semester(as.dean);
    const reported = db().events.filter(e => e.status === "reported");
    expect(report.eventsRun).toBe(reported.length);

    const attendedRows = db().registrations.filter(
      r => r.attended && !r.cancelledAt
        && reported.some(e => e.id === r.eventId)).length;
    expect(report.totalParticipation).toBe(attendedRows);

    const registeredRows = db().registrations.filter(
      r => !r.cancelledAt && reported.some(e => e.id === r.eventId)).length;
    // Registered-but-absent rows stay for the no-show rate, but are not counted.
    expect(registeredRows).toBeGreaterThan(attendedRows);
  });

  test("the department split uses the snapshot, not the current record", () => {
    const before = JSON.stringify(api.reports.semester(as.dean).byDepartment);
    const moved = db().students.find(s => db().registrations.some(
      r => r.studentId === s.id && r.attended));
    moved.department = "LAW";
    const after = JSON.stringify(api.reports.semester(as.dean).byDepartment);
    // A re-issued report of a past semester must give the same numbers.
    expect(after).toBe(before);
  });

  test("the report states its own caveats and carries no individual rows", () => {
    const report = api.reports.semester(as.dean);
    expect(report.caveats.length).toBeGreaterThan(0);
    expect(JSON.stringify(report)).notToContain("prn");
  });

  test("the Dean's overview chases missing evidence and shows the capture rate", () => {
    const overview = api.reports.overview(as.dean);
    expect(overview.pendingApprovals).toBeGreaterThan(0);
    expect(overview.pendingByStage.cultural_society).toBeGreaterThan(0);
    expect(overview.venueClashes).toBeGreaterThan(0);
    expect(overview.capture.scanAttempts).toBeGreaterThan(0);
    // Forged scans are seeded, so a rate of exactly 1.0 would mean failures are
    // not being counted.
    expect(overview.capture.captureRate).toBeLessThan(1);
  });

  test("closing an event requires at least one photo", async () => {
    const live = db().events.find(e => e.status === "live");
    await refuses(() => api.events.close(as.organiser, live.id, { photoCount: 0 }),
      { code: "EVENTS_EVIDENCE_REQUIRED", status: 409 });
    const closed = api.events.close(as.organiser, live.id,
      { photoCount: 4, socialLinks: ["https://example.com/p/1"] });
    expect(closed.status).toBe("reported");
    // And it now counts towards the report.
    expect(api.reports.semester(as.dean).events.map(e => e.id)).toContain(live.id);
  });
});

describe("Notifications reach the right people", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("submitting notifies the gate that holds it, and the club's officers", () => {
    const venue = db().venues.find(v => v.name === "Music Room");
    const future = new Date(); future.setDate(future.getDate() + 70);
    const created = api.events.create(as.president, {
      title: "Notification Probe",
      clubId: as.president.capabilities().clubsCanPropose[0],
      venueId: venue.id, startsAt: future.toISOString(),
      endsAt: new Date(future.getTime() + 3600000).toISOString(),
      expectedAttendance: 20, template: "Workshop", submit: true,
    });
    expect(created.approval.currentStage).toBe("cultural_society");
    expect(api.governance.unreadCount(as.society)).toBeGreaterThan(0);

    const row = api.governance.queue(as.society).results
      .find(r => r.eventTitle === "Notification Probe");
    api.governance.decide(as.society, row.id, { decision: "approve" });

    // The outcome carries a sanctioned figure, so it goes only to the roles
    // allowed to see money — not to every club member.
    expect(api.governance.unreadCount(as.treasurer)).toBeGreaterThan(0);
    expect(api.governance.unreadCount(as.member)).toBe(0);
    expect(api.governance.unreadCount(as.dean)).toBeGreaterThan(0);
  });

  test("marking read clears only your own", () => {
    api.governance.markRead(as.society);
    expect(api.governance.unreadCount(as.society)).toBe(0);
  });
});
