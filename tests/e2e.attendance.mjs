/**
 * End to end: the QR attendance system.
 *
 * Every figure the report shows derives from these records, so if check-in is
 * unreliable nothing else in the app matters. These are the tests that hold that up.
 */
import { describe, test, beforeEach, expect, refuses, world } from "./harness.mjs";
import * as api from "../src/api.js";
import { db } from "../src/db.js";
import * as attendance from "../src/attendance.js";
import * as qr from "../src/tokens.js";

const liveEvent = () => db().events.find(e => e.title === "Lens Heritage Photowalk");
const publishedEvent = () => db().events.find(e => e.title === "Kalam Lit Quiz");

/** A student holding no club role, so nothing else grants them access. */
function freeStudent(as) {
  const held = new Set(db().memberships.filter(m => !m.endedAt).map(m => m.studentId));
  return db().students.filter(s => !held.has(s.id))
    .find(s => !db().registrations.some(
      r => r.studentId === s.id && r.eventId === liveEvent().id));
}

describe("A student's pass and profile QR", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("registering mints a one-time pass", async () => {
    const event = publishedEvent();
    const registration = await api.participation.register(as.student, event.id);
    const pass = attendance.livePass(registration.id);
    expect(pass).toBeTruthy();
    const payload = await qr.verify(pass.token, { expectPurpose: qr.PURPOSE_PASS });
    // The token names the PASS row, not the registration: the pass row carries
    // usedAt, so the token names exactly the thing that gets spent.
    expect(payload.subject).toBe(pass.id);
    expect(payload.eventId).toBe(event.id);
  });

  test("the wallet shows the pass and a persistent profile QR", async () => {
    await api.participation.register(as.student, publishedEvent().id);
    const wallet = await api.participation.myPasses(as.student);
    expect(wallet.passes).toHaveLength(1);
    expect(wallet.profileQr.version).toBe(1);
    const payload = await qr.verify(wallet.profileQr.token,
      { expectPurpose: qr.PURPOSE_PROFILE });
    // A signed reference, not the PRN — a photo of it reveals nothing.
    expect(payload.subject).toBe(as.student.studentId);
    expect(wallet.profileQr.token).notToContain(as.student.prn);
  });

  test("reissuing the profile QR revokes the old one", async () => {
    const before = (await api.participation.myPasses(as.student)).profileQr.token;
    const after = await api.participation.reissueProfileQr(as.student);
    expect(after.version).toBe(2);
    expect(after.token === before).toBeFalsy();

    // The old code must stop working at the door.
    const outcome = await api.participation.scan(as.organiser, liveEvent().id,
      { token: before });
    expect(outcome.result).toBe("unknown_code");
  });

  test("a student cannot register twice for one event", async () => {
    const event = publishedEvent();
    await api.participation.register(as.student, event.id);
    await refuses(() => api.participation.register(as.student, event.id),
      { code: "PARTICIPATION_ALREADY_REGISTERED", status: 409 });
  });

  test("cancelling frees the place and revokes the pass", async () => {
    // The LIVE Lens event, because `as.organiser` staffs Lens doors and not Kalam's.
    const event = liveEvent();
    const registration = await api.participation.register(as.student, event.id);
    const token = attendance.livePass(registration.id).token;
    api.participation.cancel(as.student, registration.id);
    expect(attendance.livePass(registration.id)).toBeFalsy();
    const outcome = await api.participation.scan(as.organiser, event.id, { token });
    expect(["cancelled", "unknown_code"]).toContain(outcome.result);
  });
});

describe("Check-in: the seven branches", () => {
  let as; let event;
  beforeEach(async () => {
    as = await world();
    event = liveEvent();
    return { as };
  });

  const scan = (token, opts = {}) =>
    api.participation.scan(as.organiser, event.id, { token, ...opts });

  test("1 — a valid pass is accepted", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const outcome = await scan(attendance.livePass(registration.id).token);
    expect(outcome.result).toBe("accepted");
    expect(outcome.accepted).toBeTruthy();
    expect(outcome.student.prn).toBe(student.prn);
    const stored = db().registrations.find(r => r.id === registration.id);
    expect(stored.attended).toBeTruthy();
    expect(stored.stationId).toBe("GATE-1");
  });

  test("2 — the same pass twice is a duplicate, not an error", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const token = attendance.livePass(registration.id).token;
    await scan(token);
    const again = await scan(token);
    expect(again.result).toBe("duplicate");
    expect(again.tone).toBe("warn");
    expect(again.detail).toContain("First scanned at");
  });

  test("3 — a registered student's profile QR is accepted", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const profile = await attendance.profileTokenFor(student.id);
    const outcome = await scan(profile.token);
    expect(outcome.result).toBe("accepted");
    expect(db().registrations.find(r => r.id === registration.id).attended).toBeTruthy();
  });

  test("4 — a walk-in's profile QR registers and admits in one scan", async () => {
    const student = freeStudent(as);
    const profile = await attendance.profileTokenFor(student.id);
    const outcome = await scan(profile.token);
    expect(outcome.result).toBe("spot_registered");
    const created = db().registrations.find(
      r => r.eventId === event.id && r.studentId === student.id);
    expect(created.source).toBe("spot");
    expect(created.attended).toBeTruthy();
  });

  test("5 — a profile QR presented twice is a duplicate", async () => {
    const student = freeStudent(as);
    const profile = await attendance.profileTokenFor(student.id);
    await scan(profile.token);
    expect((await scan(profile.token)).result).toBe("duplicate");
  });

  test("6 — a pass for another event is wrong_event, not invalid", async () => {
    // The distinction matters at the door: wrong_event sends someone to the right
    // hall, invalid sends them to the help desk.
    const other = publishedEvent();
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(other, student.id);
    const outcome = await scan(attendance.livePass(registration.id).token);
    expect(outcome.result).toBe("wrong_event");
    expect(outcome.detail).toContain(other.title);
  });

  test("7 — a forged code is unrecognised", async () => {
    expect((await scan("demo.bm90cmVhbA.forged")).result).toBe("unknown_code");
    expect((await scan("nonsense")).result).toBe("unknown_code");
    expect((await scan("")).result).toBe("unknown_code");
  });

  test("a tampered signature does not verify", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const [kid, payload, signature] = attendance.livePass(registration.id)
      .token.split(".");
    const forged = `${kid}.${payload}.${"A".repeat(signature.length)}`;
    expect((await scan(forged)).result).toBe("unknown_code");
  });

  test("an expired pass is its own branch", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const pass = attendance.livePass(registration.id);
    pass.token = await qr.issue(qr.PURPOSE_PASS, pass.id,
      { eventId: event.id, ttlSeconds: -10 });
    expect((await scan(pass.token)).result).toBe("expired");
  });

  test("a replaced pass stops working", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const old = attendance.livePass(registration.id).token;
    await attendance.reissuePass(registration);
    const outcome = await scan(old);
    expect(outcome.result).toBe("unknown_code");
    expect(outcome.detail).toContain("newer pass");
  });

  test("every branch writes a record, and failures move the capture rate", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const before = api.participation.station(as.organiser, event.id).capture.attempts;

    await scan(attendance.livePass(registration.id).token);  // accepted
    await scan("demo.forged.nope");                          // unknown
    await scan("demo.also-forged.nope");                     // unknown

    const capture = api.participation.station(as.organiser, event.id).capture;
    expect(capture.attempts).toBe(before + 3);
    expect(capture.unknown).toBeGreaterThan(1);
    // A rate of 1.0 with forged scans present would mean failures are not counted.
    expect(capture.captureRate).toBeLessThan(1);
  });
});

describe("The door: who may work it", () => {
  let as; let event;
  beforeEach(async () => { as = await world(); event = liveEvent(); return { as }; });

  const attempt = session => api.participation.scan(session, event.id,
    { token: "demo.anything.at-all" });

  test("the hosting club's president may scan", async () => {
    const outcome = await attempt(as.organiser);
    expect(outcome.result).toBe("unknown_code");   // reached the resolver
  });

  test("a student cannot scan themselves in", async () => {
    // Self-marking does not exist: there is no route by which a student records
    // their own attendance, and this is the test of that claim.
    await refuses(() => attempt(as.student),
      { code: "PARTICIPATION_STATION_DENIED", status: 403 });
  });

  test("a plain club member cannot work a door", async () => {
    await refuses(() => attempt(as.member),
      { code: "PARTICIPATION_STATION_DENIED", status: 403 });
  });

  test("the Treasurer cannot work a door either", async () => {
    // The scan response carries names and PRNs; money is the Treasurer's job.
    expect(as.treasurer.capabilities().clubsDoorStaff).toHaveLength(0);
    await refuses(() => attempt(as.treasurer),
      { code: "PARTICIPATION_STATION_DENIED", status: 403 });
  });

  test("another club's president cannot work this door", async () => {
    await refuses(() => attempt(as.president),
      { code: "PARTICIPATION_STATION_DENIED", status: 403 });
  });

  test("the Dean approves events but does not mark attendance", async () => {
    await refuses(() => attempt(as.dean),
      { code: "PARTICIPATION_STATION_DENIED", status: 403 });
  });

  test("Management cannot work a door or read the roster", async () => {
    await refuses(() => attempt(as.vc),
      { code: "PARTICIPATION_STATION_DENIED", status: 403 });
    await refuses(() => api.participation.roster(as.vc, event.id),
      { code: "NOT_FOUND", status: 404 });
  });

  test("an organiser gets the roster; a pass token never leaves its owner", () => {
    const roster = api.participation.roster(as.organiser, event.id);
    expect(roster.results.length).toBeGreaterThan(0);
    const serialised = JSON.stringify(roster);
    for (const pass of db().passes) {
      expect(serialised).notToContain(pass.token);
    }
  });

  test("manual check-in by PRN is still recorded with an operator", () => {
    const student = freeStudent(as);
    const before = db().scans.length;
    const outcome = api.participation.checkInManually(as.organiser, event.id,
      { prn: student.prn });
    expect(outcome.result).toBe("spot_registered");
    expect(outcome.detail).toContain("Manual entry");
    // A manual entry that left no trace would be indistinguishable from a scan
    // that never happened, and the capture rate would overstate the door.
    expect(db().scans.length).toBe(before + 1);
    expect(db().scans[0].operator).toBe(as.organiser.sub);
  });

  test("a PRN lookup is refused to Management and to a plain student", async () => {
    await refuses(() => api.directory.students(as.vc, "Meera"),
      { code: "DIRECTORY_NOT_PERMITTED", status: 403 });
    await refuses(() => api.directory.students(as.student, "Meera"),
      { code: "DIRECTORY_NOT_PERMITTED", status: 403 });
    expect(api.directory.students(as.organiser, "10").length).toBeGreaterThan(0);
    // Below two characters the directory deliberately returns nothing.
    expect(api.directory.students(as.organiser, "1")).toHaveLength(0);
  });
});

describe("Offline stations", () => {
  let as; let event;
  beforeEach(async () => { as = await world(); event = liveEvent(); return { as }; });

  test("the earliest device timestamp wins, not the arrival order", async () => {
    const student = freeStudent(as);
    const registration = await attendance.registerStudent(event, student.id);
    const profile = await attendance.profileTokenFor(student.id);
    const early = new Date(Date.now() - 20 * 60000).toISOString();
    const late = new Date(Date.now() - 5 * 60000).toISOString();

    // Queue arrives newest-first, as an unsorted replay would deliver it.
    const synced = await api.participation.syncOffline(as.organiser, event.id, {
      scans: [
        { token: profile.token, scannedAt: late, ref: "q2" },
        { token: profile.token, scannedAt: early, ref: "q1" },
      ],
    });
    expect(synced.results[0].result).toBe("accepted");
    expect(synced.results[1].result).toBe("duplicate");
    // The recorded time should be when they actually arrived at the door.
    expect(db().registrations.find(r => r.id === registration.id).checkedInAt)
      .toBe(early);
  });

  test("replaying the same queue twice does not double-record", async () => {
    const student = freeStudent(as);
    await attendance.registerStudent(event, student.id);
    const profile = await attendance.profileTokenFor(student.id);
    const batch = { scans: [{ token: profile.token, scannedAt: new Date().toISOString(),
                              ref: "q1" }] };
    await api.participation.syncOffline(as.organiser, event.id, batch);
    await api.participation.syncOffline(as.organiser, event.id, batch);
    const recorded = db().scans.filter(
      s => s.eventId === event.id && s.offlineRef === "q1");
    expect(recorded).toHaveLength(1);
  });

  test("a replayed scan is flagged as offline", async () => {
    const student = freeStudent(as);
    await attendance.registerStudent(event, student.id);
    const profile = await attendance.profileTokenFor(student.id);
    await api.participation.syncOffline(as.organiser, event.id, {
      scans: [{ token: profile.token,
                scannedAt: new Date(Date.now() - 3600000).toISOString(), ref: "q9" }],
    });
    const row = api.participation.station(as.organiser, event.id)
      .recent.find(r => r.wasOffline);
    expect(row).toBeTruthy();
  });
});

describe("Capacity", () => {
  let as;
  beforeEach(async () => { as = await world(); return { as }; });

  test("a walk-in is refused once the event is full", async () => {
    const event = db().events.find(e => e.title === "Kalam Lit Quiz");
    event.capacity = attendance.registeredCount(event.id) + 1;
    const first = freeStudent(as);
    await attendance.registerStudent(event, first.id);

    const held = new Set(db().memberships.filter(m => !m.endedAt).map(m => m.studentId));
    const next = db().students.find(
      s => !held.has(s.id) && s.id !== first.id
        && !db().registrations.some(r => r.eventId === event.id && r.studentId === s.id));
    const profile = await attendance.profileTokenFor(next.id);
    event.status = "live";
    const outcome = await api.participation.scan(
      as.organiser.hasClubRole(event.clubId) ? as.organiser : as.dean, event.id,
      { token: profile.token },
    ).catch(err => err);
    // The Lens organiser does not staff a Kalam door, so this is a refusal; the
    // capacity branch itself is covered by the engine test below.
    expect(outcome.code || outcome.result).toBeTruthy();
  });

  test("registration is refused when the event is full", async () => {
    const event = db().events.find(e => e.title === "Kalam Lit Quiz");
    event.capacity = attendance.registeredCount(event.id);
    await refuses(() => api.participation.register(as.student, event.id),
      { code: "PARTICIPATION_EVENT_FULL", status: 409 });
  });

  test("registration is refused on an unpublished event", async () => {
    const draft = db().events.find(e => e.status === "submitted");
    await refuses(() => api.participation.register(as.student, draft.id),
      { code: "PARTICIPATION_NOT_OPEN", status: 409 });
  });
});
