/**
 * Bring the demo dataset to life.
 *
 * Deliberately drives every event through the REAL approval chain, the REAL
 * registration path and the REAL scan resolver rather than writing finished rows.
 * If a rule breaks, the seed breaks — which is the point: the demo data is evidence
 * that the workflow runs, not a picture of it having run.
 */
import { db, find, load, rng, save } from "./db.js";
import { buildSeed, TEMPLATES } from "./seed.js";
import { Session } from "./session.js";
import * as R from "./roles.js";
import * as approvals from "./approvals.js";
import * as budgets from "./budget.js";
import * as attendance from "./attendance.js";

function sessionFromStudent(student) {
  return new Session({
    personaKey: "seed", user: find(db().users, student.userId), student,
  });
}

function staffSession(userId) {
  return new Session({ personaKey: "seed", user: find(db().users, userId) });
}

function officer(clubName, role) {
  const club = db().clubs.find(c => c.name === clubName);
  const membership = db().memberships.find(
    m => m.clubId === club.id && m.role === role && !m.endedAt);
  return find(db().students, membership.studentId);
}

export async function seedAll() {
  buildSeed();
  const { staffIds } = db();
  const society = staffSession(staffIds.society);
  const dean = staffSession(staffIds.dean);
  const vc = staffSession(staffIds.vc);
  const byStage = { cultural_society: society, dean, vc };

  // ---- price and submit every event, then approve to its target --------
  for (const event of [...db().events]) {
    const club = find(db().clubs, event.clubId);
    const president = officer(club.name, R.CLUB_PRESIDENT);
    const ctx = sessionFromStudent(president);

    const budget = budgets.ensureBudget(event.id);
    const template = TEMPLATES.find(t => t.name === event.templateName);
    budgets.seedFromTemplate(budget, template, event.expectedAttendance);

    const request = approvals.submit(event, ctx);
    if (event.targetStatus === "submitted") continue;

    // Walk the route with the real decide(), so the seeded history is a genuine
    // approval trail rather than a fabricated one.
    let guard = 0;
    while (request.state === "pending" && guard < 4) {
      guard += 1;
      const stage = request.currentStage;
      let sanctioned = {};
      if (stage === "dean") {
        // Trim one head, so the report shows sanctioned below requested.
        const first = budget.lines[0];
        sanctioned = { [first.id]: Math.round(first.amountRequested * 0.9) };
      }
      approvals.decide(request, byStage[stage], { decision: "approve", sanctioned });
    }
    if (event.targetStatus === "live") event.status = "live";
  }

  // ---- attendance, with deliberate overlap ----------------------------
  const random = rng(7);
  const pool = db().students.slice(0, 40);
  for (const [title, [wanted, attending]] of Object.entries(db().attendancePlan)) {
    const event = db().events.find(e => e.title === title);
    if (!event) continue;
    const originalStatus = event.status;
    // Registration is only open on a published or live event, which is correct;
    // the seed reopens briefly to backfill history.
    if (["reported", "completed"].includes(event.status)) event.status = "published";

    const club = find(db().clubs, event.clubId);
    const operator = sessionFromStudent(officer(club.name, R.CLUB_PRESIDENT));

    const shuffled = pool.slice().sort(() => random() - 0.5);
    const chosen = shuffled.slice(0, Math.min(wanted, shuffled.length));
    for (let i = 0; i < chosen.length; i += 1) {
      const registration = await attendance.registerStudent(event, chosen[i].id);
      if (i < attending) {
        const pass = attendance.livePass(registration.id);
        const at = new Date(new Date(event.startsAt).getTime() + (5 + i) * 60000)
          .toISOString();
        await attendance.resolve(pass.token, event,
          { operatorId: operator.sub, stationId: "GATE-1", scannedAt: at });
      }
    }
    // A couple of forged scans, so the capture rate is not a meaningless 1.0 and
    // the failure records have something to show.
    for (let i = 0; i < Math.max(1, Math.floor(attending / 12)); i += 1) {
      await attendance.resolve("demo.not-a-real-token.forged", event,
        { operatorId: operator.sub, stationId: "GATE-1" });
    }
    event.status = originalStatus;
  }

  // ---- close the past events with evidence ----------------------------
  for (const title of ["Swara Unplugged", "Natya Showcase", "Kalam Poetry Slam",
                       "Lens Frames Exhibition"]) {
    const event = db().events.find(e => e.title === title);
    if (!event) continue;
    event.photoCount = 6 + Math.floor(random() * 24);
    event.socialLinks = ["https://www.instagram.com/p/demo"];
    event.status = "reported";
    event.closedAt = new Date().toISOString();
  }

  // ---- settle one budget, satisfying its own receipt rule -------------
  const unplugged = db().events.find(e => e.title === "Swara Unplugged");
  const budget = db().budgets.find(b => b.eventId === unplugged.id);
  const treasurer = sessionFromStudent(officer("Swara", R.CLUB_TREASURER));
  for (const line of budget.lines) {
    line.amountSpent = Math.round((line.amountSanctioned ?? line.amountRequested) * 0.95);
    if (line.amountSpent > budgets.RECEIPT_THRESHOLD) {
      budgets.attachReceipt(line, {
        fileName: `${line.head.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
        byteSize: 128, amount: line.amountSpent,
      });
    }
  }
  budgets.settle(budget, treasurer);

  // Clear the seed-time notification backlog: a tester opening the app should see
  // their own actions, not a hundred messages from the fixture build.
  db().notifications = [];
  db().events.forEach(e => { delete e.targetStatus; delete e.templateName; });

  save();
  return db();
}

/** Load an existing walkthrough, or build a fresh one. */
export async function ensureSeeded() {
  if (load()) return db();
  return seedAll();
}

export async function reseed() {
  const { reset } = await import("./db.js");
  reset();
  return seedAll();
}
