/**
 * Registration, passes and the seven-branch check-in resolution.
 *
 * The organiser scans the student, metro-turnstile style — never the reverse, and
 * there is no route by which a student marks themselves present. Every function
 * here therefore takes an operator.
 */
import { db, find, now, uid } from "./db.js";
import { conflict } from "./errors.js";
import * as qr from "./tokens.js";

export const RESULT_LABELS = {
  accepted: "Checked in",
  spot_registered: "Registered at the door and checked in",
  duplicate: "Already checked in",
  wrong_event: "Pass is for another event",
  unknown_code: "Code not recognised",
  not_registered: "Not registered and cannot be",
  expired: "Pass expired",
  cancelled: "Registration was cancelled",
};

const ACCEPTING = ["accepted", "spot_registered"];
export const isAccepting = result => ACCEPTING.includes(result);

const liveRegistrations = eventId =>
  db().registrations.filter(r => r.eventId === eventId && !r.cancelledAt);

export const registeredCount = eventId => liveRegistrations(eventId).length;
export const attendedCount = eventId =>
  liveRegistrations(eventId).filter(r => r.attended).length;

export const livePass = registrationId => db().passes.find(
  p => p.registrationId === registrationId && !p.usedAt && !p.revokedAt);

export async function profileTokenFor(studentId) {
  let record = db().qrTokens.find(t => t.studentId === studentId && !t.revokedAt);
  if (record) return record;
  record = {
    id: uid("qr"), studentId, token: await qr.issueProfileToken(studentId),
    version: 1, revokedAt: null,
  };
  db().qrTokens.push(record);
  return record;
}

export async function reissueProfileToken(studentId) {
  const previous = db().qrTokens.find(t => t.studentId === studentId && !t.revokedAt);
  let version = 1;
  if (previous) { previous.revokedAt = now(); version = previous.version + 1; }
  const record = {
    id: uid("qr"), studentId, token: await qr.issueProfileToken(studentId),
    version, revokedAt: null,
  };
  db().qrTokens.push(record);
  return record;
}

async function issuePass(registration) {
  // Two steps on purpose: the row is created first so the token can name it. The
  // pass row is what carries usedAt, so the token names the thing that gets spent.
  const pass = {
    id: uid("ep"), registrationId: registration.id, token: "",
    usedAt: null, revokedAt: null,
  };
  pass.token = await qr.issueEventPass(pass.id, registration.eventId);
  db().passes.push(pass);
  return pass;
}

export async function registerStudent(event, studentId, source = "pre_registered") {
  if (!["published", "live"].includes(event.status)) {
    throw conflict("PARTICIPATION_NOT_OPEN", "Registration is not open",
      `“${event.title}” is ${event.status}.`);
  }
  if (registeredCount(event.id) >= event.capacity) {
    throw conflict("PARTICIPATION_EVENT_FULL", "Event is full",
      `All ${event.capacity} places are taken.`);
  }
  if (liveRegistrations(event.id).some(r => r.studentId === studentId)) {
    throw conflict("PARTICIPATION_ALREADY_REGISTERED", "Already registered",
      "You already hold a registration for this event.");
  }
  const student = find(db().students, studentId);
  const registration = {
    id: uid("rg"), eventId: event.id, studentId, source,
    registeredAt: now(), cancelledAt: null,
    attended: false, checkedInAt: null, checkedInBy: null, stationId: "",
    // Snapshotted at registration: a student who changes department must not
    // retroactively move their past attendance.
    departmentAtEvent: student.department,
    programmeAtEvent: student.programme,
    yearAtEvent: student.year,
  };
  db().registrations.push(registration);
  await issuePass(registration);
  return registration;
}

export function cancelRegistration(registration) {
  if (registration.attended) {
    throw conflict("PARTICIPATION_ALREADY_ATTENDED", "Already checked in",
      "An attended registration cannot be cancelled.");
  }
  registration.cancelledAt = now();
  for (const p of db().passes.filter(
    p => p.registrationId === registration.id && !p.usedAt && !p.revokedAt)) {
    p.revokedAt = now();
  }
  return registration;
}

export async function reissuePass(registration) {
  for (const p of db().passes.filter(
    p => p.registrationId === registration.id && !p.usedAt && !p.revokedAt)) {
    p.revokedAt = now();
  }
  return issuePass(registration);
}

function record(event, outcome, { token, stationId, at, offlineRef }) {
  if (offlineRef && db().scans.some(
    s => s.eventId === event.id && s.offlineRef === offlineRef)) {
    // Replaying the same queue twice — which happens when a sync response is lost
    // — must not record the same scan again.
    return outcome;
  }
  db().scans.unshift({
    id: uid("sc"), eventId: event.id,
    registrationId: outcome.registration ? outcome.registration.id : null,
    result: outcome.result, scannedToken: String(token || "").slice(0, 64),
    stationId: stationId || "", operator: outcome.operator || null,
    scannedAt: at, syncedAt: now(), offlineRef: offlineRef || "",
    detail: outcome.detail || "",
  });
  return outcome;
}

const outcome = (result, verdict, extra = {}) => ({
  result, verdict,
  tone: isAccepting(result) ? "ok" : result === "duplicate" ? "warn" : "bad",
  accepted: isAccepting(result),
  detail: "", registration: null, student: null, ...extra,
});

const duplicateOf = registration => outcome("duplicate", "Already checked in", {
  registration, student: find(db().students, registration.studentId),
  detail: `First scanned at ${new Date(registration.checkedInAt)
    .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
    + (registration.stationId ? ` at ${registration.stationId}` : ""),
});

function markAttended(registration, at, operatorId, stationId) {
  registration.attended = true;
  registration.checkedInAt = at;
  registration.checkedInBy = operatorId;
  registration.stationId = stationId || "";
}

/**
 * Resolve one presented code against one event, writing a ScanRecord on every
 * branch — including each failure. The failures ARE the capture-rate metric:
 * without them a station rejecting half its queue looks like a quiet event.
 */
export async function resolve(token, event, { operatorId, stationId = "",
                                              scannedAt = null, offlineRef = "" } = {}) {
  const at = scannedAt || now();
  const ctxFor = o => record(event, { ...o, operator: operatorId },
    { token, stationId, at, offlineRef });

  // --- branches 1, 2 and expiry: the one-time pass -----------------------
  let payload = null;
  try {
    payload = await qr.verify(token, { expectPurpose: qr.PURPOSE_PASS });
  } catch (err) {
    if (err instanceof qr.TokenExpired) {
      return ctxFor(outcome("expired", "Pass expired",
        { detail: "Ask them to show their profile QR instead." }));
    }
    if (!(err instanceof qr.TokenWrongPurpose)) {
      return ctxFor(outcome("unknown_code", "Code not recognised"));
    }
  }

  if (payload) {
    if (String(payload.eventId) !== String(event.id)) {
      const pass = find(db().passes, payload.subject);
      const other = pass
        ? find(db().events, find(db().registrations, pass.registrationId).eventId)
        : null;
      return ctxFor(outcome("wrong_event", "Wrong event",
        { detail: other ? `Pass is for “${other.title}”` : "Pass is for another event" }));
    }
    const pass = find(db().passes, payload.subject);
    if (!pass) return ctxFor(outcome("unknown_code", "Code not recognised"));
    const registration = find(db().registrations, pass.registrationId);
    if (pass.revokedAt) {
      return ctxFor(outcome("unknown_code", "Pass was replaced", {
        student: find(db().students, registration.studentId),
        detail: "A newer pass was issued. Ask them to open the current one.",
      }));
    }
    if (pass.usedAt || registration.attended) return ctxFor(duplicateOf(registration));
    if (registration.cancelledAt) {
      return ctxFor(outcome("cancelled", "Registration cancelled", {
        student: find(db().students, registration.studentId),
        detail: "Scan their profile QR to admit them as a walk-in.",
      }));
    }
    pass.usedAt = at;
    markAttended(registration, at, operatorId, stationId);
    return ctxFor(outcome("accepted", "Checked in", {
      registration, student: find(db().students, registration.studentId),
    }));
  }

  // --- branches 3 to 5: the persistent profile QR ------------------------
  try {
    payload = await qr.verify(token, { expectPurpose: qr.PURPOSE_PROFILE });
  } catch {
    return ctxFor(outcome("unknown_code", "Code not recognised"));
  }
  // Looked up by the PRESENTED token, not by the student id. Searching by student
  // would find whichever record is currently live and admit a revoked code — so a
  // lost phone's QR would keep working for ever after a reissue.
  const qrRecord = db().qrTokens.find(t => t.token === String(token).trim());
  if (!qrRecord) return ctxFor(outcome("unknown_code", "Code not recognised"));
  if (qrRecord.revokedAt) {
    return ctxFor(outcome("unknown_code", "Code was replaced", {
      student: find(db().students, qrRecord.studentId),
      detail: "This profile QR was reissued. Ask them to open the current one.",
    }));
  }
  const student = find(db().students, qrRecord.studentId);

  const existing = liveRegistrations(event.id).find(r => r.studentId === student.id);
  if (existing) {
    if (existing.attended) return ctxFor(duplicateOf(existing));
    markAttended(existing, at, operatorId, stationId);
    return ctxFor(outcome("accepted", "Checked in", { registration: existing, student }));
  }

  // Walk-in. Registering at the door is the intended path, not an exception.
  if (registeredCount(event.id) >= event.capacity) {
    return ctxFor(outcome("not_registered", "Event at capacity", {
      student, detail: "No places left, so a walk-in cannot be admitted.",
    }));
  }
  const registration = {
    id: uid("rg"), eventId: event.id, studentId: student.id, source: "spot",
    registeredAt: now(), cancelledAt: null, attended: false, checkedInAt: null,
    checkedInBy: null, stationId: "",
    departmentAtEvent: student.department, programmeAtEvent: student.programme,
    yearAtEvent: student.year,
  };
  db().registrations.push(registration);
  markAttended(registration, at, operatorId, stationId);
  return ctxFor(outcome("spot_registered", "Registered and checked in",
    { registration, student }));
}

/**
 * Desk fallback when a phone is flat. Still the organiser acting, still recorded
 * with an operator, still a ScanRecord — a manual entry that left no trace would
 * be indistinguishable from a scan that never happened.
 */
export function checkInManually(event, studentId, { operatorId, stationId = "" }) {
  const at = now();
  const student = find(db().students, studentId);
  const existing = liveRegistrations(event.id).find(r => r.studentId === studentId);
  let result;
  if (existing && existing.attended) {
    result = duplicateOf(existing);
  } else if (existing) {
    markAttended(existing, at, operatorId, stationId);
    result = outcome("accepted", "Checked in",
      { registration: existing, student, detail: "Manual entry by PRN lookup" });
  } else if (registeredCount(event.id) >= event.capacity) {
    result = outcome("not_registered", "Event at capacity", { student });
  } else {
    const registration = {
      id: uid("rg"), eventId: event.id, studentId, source: "manual",
      registeredAt: at, cancelledAt: null, attended: false, checkedInAt: null,
      checkedInBy: null, stationId: "",
      departmentAtEvent: student.department, programmeAtEvent: student.programme,
      yearAtEvent: student.year,
    };
    db().registrations.push(registration);
    markAttended(registration, at, operatorId, stationId);
    result = outcome("spot_registered", "Registered and checked in",
      { registration, student, detail: "Manual entry by PRN lookup" });
  }
  return record(event, { ...result, operator: operatorId },
    { token: `manual:${student.prn}`, stationId, at, offlineRef: "" });
}

/**
 * Replay a station's offline queue, sorted by the DEVICE's timestamp so the
 * earliest scan wins and the later presentation becomes the duplicate. Replaying
 * in arrival order would award the check-in to whichever packet arrived first,
 * which is not who reached the door first.
 */
export async function replayOffline(event, items, { operatorId, stationId = "" }) {
  const ordered = [...items].sort(
    (a, b) => String(a.scannedAt || "").localeCompare(String(b.scannedAt || "")));
  const out = [];
  for (const item of ordered) {
    out.push(await resolve(item.token, event, {
      operatorId, stationId, scannedAt: item.scannedAt, offlineRef: item.ref || "",
    }));
  }
  return out;
}

export function captureStats(eventId) {
  const scans = db().scans.filter(s => s.eventId === eventId);
  const accepted = scans.filter(s => isAccepting(s.result)).length;
  return {
    attempts: scans.length,
    accepted,
    duplicates: scans.filter(s => s.result === "duplicate").length,
    unknown: scans.filter(s => s.result === "unknown_code").length,
    wrongEvent: scans.filter(s => s.result === "wrong_event").length,
    expired: scans.filter(s => s.result === "expired").length,
    captureRate: scans.length ? Math.round(accepted / scans.length * 1000) / 1000 : null,
  };
}
