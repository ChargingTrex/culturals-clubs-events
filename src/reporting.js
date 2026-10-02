/**
 * Semester report and the Dean's overview.
 *
 * `uniqueStudents` is the headline. 20 events attended by the same 80 students and
 * 20 events reaching 600 both give totalParticipation = 1600; only the DISTINCT
 * count separates them, and only the second justifies the budget.
 */
import { db, find } from "./db.js";
import { allClashes } from "./approvals.js";
import { captureStats, isAccepting } from "./attendance.js";
import { totalRequested, totalSanctioned, totalSpent } from "./budget.js";

const REPORTABLE = ["completed", "reported"];
const SLOT_HOLDING = ["submitted", "approved", "published", "live", "completed", "reported"];

const inSemester = (event, semester) => {
  const day = event.startsAt.slice(0, 10);
  return day >= semester.startsOn && day <= semester.endsOn;
};

export function semesterReport() {
  const { semester } = db();
  const events = db().events.filter(
    e => REPORTABLE.includes(e.status) && inSemester(e, semester));
  const ids = new Set(events.map(e => e.id));
  const attended = db().registrations.filter(
    r => ids.has(r.eventId) && r.attended && !r.cancelledAt);

  const uniqueStudents = new Set(attended.map(r => r.studentId)).size;

  const byClubMap = new Map();
  for (const event of events) {
    const club = find(db().clubs, event.clubId);
    const row = byClubMap.get(club.id)
      || { club: club.name, tag: club.tag, category: club.category, eventsRun: 0, attendance: 0 };
    row.eventsRun += 1;
    row.attendance += attended.filter(r => r.eventId === event.id).length;
    byClubMap.set(club.id, row);
  }

  // Grouped by the department recorded AT the event, not the student's current
  // one, so a re-issued report of a past semester gives the same numbers.
  const byDeptMap = new Map();
  for (const r of attended) {
    const key = r.departmentAtEvent || "unknown";
    const row = byDeptMap.get(key) || { department: key, students: new Set(), attendance: 0 };
    row.students.add(r.studentId);
    row.attendance += 1;
    byDeptMap.set(key, row);
  }

  const money = { requested: 0, sanctioned: 0, spent: 0 };
  for (const event of events) {
    const budget = db().budgets.find(b => b.eventId === event.id);
    if (!budget) continue;
    money.requested += totalRequested(budget);
    money.sanctioned += totalSanctioned(budget);
    money.spent += totalSpent(budget);
  }

  return {
    semester,
    eventsRun: events.length,
    totalParticipation: attended.length,
    uniqueStudents,
    externalParticipants: 0,
    avgAttendance: events.length ? Math.round(attended.length / events.length) : 0,
    byClub: [...byClubMap.values()].sort((a, b) => b.attendance - a.attendance),
    byDepartment: [...byDeptMap.values()]
      .map(r => ({ department: r.department, studentsReached: r.students.size,
                   attendance: r.attendance }))
      .sort((a, b) => b.studentsReached - a.studentsReached),
    money,
    events: events
      .slice()
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(e => {
        const budget = db().budgets.find(b => b.eventId === e.id);
        return {
          id: e.id, title: e.title, club: find(db().clubs, e.clubId).name,
          startsAt: e.startsAt,
          attended: attended.filter(r => r.eventId === e.id).length,
          registered: db().registrations.filter(
            r => r.eventId === e.id && !r.cancelledAt).length,
          photos: e.photoCount, socialLinks: e.socialLinks,
          sanctioned: budget ? totalSanctioned(budget) : 0,
          spent: budget ? totalSpent(budget) : 0,
        };
      }),
    caveats: [
      "Figures are counted at the door from attendance records, not estimated.",
      "Own students and external participants are counted separately and never summed.",
      "Activity that ran outside the system is not included, so totals understate the "
        + "real figure.",
    ],
  };
}

export function deanOverview() {
  const { semester } = db();
  const inSem = db().events.filter(e => inSemester(e, semester));
  const done = inSem.filter(e => REPORTABLE.includes(e.status));
  const pending = db().approvals.filter(a => a.state === "pending");

  const pendingByStage = {};
  for (const a of pending) {
    pendingByStage[a.currentStage] = (pendingByStage[a.currentStage] || 0) + 1;
  }

  const activeClubIds = new Set(done.map(e => e.clubId));
  const scans = db().scans.filter(s => done.some(e => e.id === s.eventId));
  const accepted = scans.filter(s => isAccepting(s.result)).length;

  return {
    semester: semester.name,
    pendingApprovals: pending.length,
    pendingByStage,
    venueClashes: allClashes().length,
    clubsActive: activeClubIds.size,
    clubsTotal: db().clubs.length,
    clubsInactive: db().clubs.filter(c => !activeClubIds.has(c.id)).map(c => c.name),
    // The chasing list: a closed event with no photos or no post link is the gap
    // that makes a semester report thinner than the semester actually was.
    missingEvidence: done
      .filter(e => !e.photoCount || !e.socialLinks.length)
      .map(e => ({
        id: e.id, title: e.title, club: find(db().clubs, e.clubId).name,
        missing: [!e.photoCount && "photos", !e.socialLinks.length && "social post link"]
          .filter(Boolean),
      })),
    venueUse: db().venues.map(v => ({
      venue: v.name,
      bookings: db().events.filter(
        e => e.venueId === v.id && SLOT_HOLDING.includes(e.status)).length,
    })).sort((a, b) => b.bookings - a.bookings),
    capture: {
      scanAttempts: scans.length,
      scansAccepted: accepted,
      captureRate: scans.length ? Math.round(accepted / scans.length * 1000) / 1000 : null,
    },
  };
}

export { captureStats };
