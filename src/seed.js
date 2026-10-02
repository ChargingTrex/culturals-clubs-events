/**
 * The demo dataset.
 *
 * Attendance overlap is deliberate: some students attend several events, so
 * unique_students is meaningfully lower than total_participation. Without that
 * overlap the report's headline figure looks right whether or not the DISTINCT
 * count is.
 */
import { SCHEMA_VERSION, resetIds, rng, setState, uid } from "./db.js";
import * as R from "./roles.js";

const FIRST = ["Meera", "Arjun", "Kavya", "Rohan", "Divya", "Karthik", "Ananya",
  "Vikram", "Sneha", "Aditya", "Lakshmi", "Rahul", "Priya", "Surya", "Nithya",
  "Harish", "Deepa", "Vishnu", "Aishwarya", "Gokul", "Janani", "Pranav", "Shruti",
  "Ashwin", "Keerthana", "Sanjay", "Revathi", "Naveen", "Pooja", "Bharath",
  "Swathi", "Mani", "Harini", "Dinesh", "Varsha", "Ramesh", "Anjali", "Sathish"];
const LAST = ["Krishnan", "Iyer", "R", "Subramanian", "Nair", "S", "Raghavan",
  "Menon", "K", "Venkatesh", "Pillai", "M", "Balaji", "Chandran", "A", "Sundar"];
const DEPTS = [["CSE", "BTech-CSE"], ["ECE", "BTech-ECE"], ["BBA", "BBA"],
  ["ARTS", "BA-English"], ["MECH", "BTech-MECH"], ["LAW", "BA-LLB"]];

const CLUBS = [
  ["Swara", "Music", "cultural"],
  ["Natya", "Dance", "cultural"],
  ["Kalam", "Literary", "literary"],
  ["Lens", "Photography", "cultural"],
  ["Drishti", "Theatre", "cultural"],
];
const VENUES = [["Main Auditorium", 600], ["Open Air Theatre", 1000],
  ["Seminar Hall A", 150], ["Seminar Hall B", 120], ["Amphitheatre", 300],
  ["Music Room", 40]];

export const TEMPLATES = [
  { name: "Performance", lines: [
    { head: "Sound & lighting", basis: "lump_sum", rate: 12000 },
    { head: "Stage & decoration", basis: "lump_sum", rate: 8000 },
    { head: "Refreshments", basis: "per_head", rate: 60 },
    { head: "Publicity", basis: "lump_sum", rate: 2000 }] },
  { name: "Workshop", lines: [
    { head: "Trainer honorarium", basis: "lump_sum", rate: 8000 },
    { head: "Materials", basis: "per_head", rate: 150 },
    { head: "Refreshments", basis: "per_head", rate: 50 }] },
  { name: "Competition", lines: [
    { head: "Prizes", basis: "lump_sum", rate: 6000 },
    { head: "Judges' honorarium", basis: "lump_sum", rate: 3000 },
    { head: "Printing", basis: "lump_sum", rate: 800 }] },
  { name: "Exhibition", lines: [
    { head: "Printing & framing", basis: "lump_sum", rate: 9000 },
    { head: "Display stands", basis: "lump_sum", rate: 4000 }] },
  // A headline night: the artist fee alone puts it over the Management threshold,
  // so it is the template that walks a proposal through all four gates.
  { name: "Fest night", lines: [
    { head: "Artist & performers' fee", basis: "lump_sum", rate: 150000 },
    { head: "Sound, light & stage", basis: "lump_sum", rate: 45000 },
    { head: "Security & crowd control", basis: "per_head", rate: 20 },
    { head: "Refreshments", basis: "per_head", rate: 60 },
    { head: "Publicity", basis: "lump_sum", rate: 8000 }] },
];

const iso = (daysFromToday, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export function buildSeed() {
  resetIds();
  const random = rng(42);

  const users = [];
  const students = [];
  for (let i = 0; i < 48; i += 1) {
    const [department, programme] = DEPTS[Math.floor(random() * DEPTS.length)];
    const year = 1 + Math.floor(random() * 4);
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(random() * LAST.length)]}`;
    const prn = `${26 - year}${department.slice(0, 2)}${1001 + i}`;
    const user = {
      id: uid("us"), email: `${prn.toLowerCase()}@college.edu`,
      displayName: name.split(" ")[0], fullName: name,
      globalRoles: [R.STUDENT], mfaEnabled: false,
    };
    users.push(user);
    students.push({
      id: uid("sd"), userId: user.id, prn, fullName: name,
      department, programme, year,
    });
  }

  const staff = (email, name, role) => {
    const user = {
      id: uid("us"), email, displayName: name, fullName: name,
      globalRoles: [role], mfaEnabled: true,
    };
    users.push(user);
    return user;
  };
  const dean = staff("dean@college.edu", "Dr. Revathi Srinivasan", R.DEAN);
  const vc = staff("vc@college.edu", "Prof. K. Ramanathan", R.VICE_CHANCELLOR);
  const management = staff("finance.director@college.edu", "Anand Krishnamurthy",
    R.MANAGEMENT);
  const society = staff("cultural.secretary@college.edu", "Nivedita Raman",
    R.CULTURAL_SOCIETY);

  const venues = VENUES.map(([name, capacity]) => ({ id: uid("vn"), name, capacity }));
  const clubs = CLUBS.map(([name, tag, category]) => ({
    id: uid("cl"), name, slug: name.toLowerCase(), tag, category, status: "active",
    instagram: `@${name.toLowerCase()}.saiu`,
  }));

  // Office bearers, then members. The order of `office` is the seniority order.
  const office = [R.CLUB_PRESIDENT, R.CLUB_VICE_PRESIDENT, R.CLUB_TREASURER,
    R.CLUB_SECRETARY];
  const memberships = [];
  let cursor = 0;
  for (const club of clubs) {
    const size = club.name === "Swara" ? 12 : 7;
    for (let i = 0; i < size && cursor < students.length; i += 1, cursor += 1) {
      memberships.push({
        id: uid("mb"), clubId: club.id, studentId: students[cursor].id,
        role: i < office.length ? office[i] : (i < 6 ? R.CLUB_CORE : R.CLUB_MEMBER),
        joinedAt: iso(-120, 9), endedAt: null,
      });
    }
  }
  // Students beyond `cursor` hold no club role — the plain-student persona.

  const venueBy = name => venues.find(v => v.name === name).id;
  const clubBy = name => clubs.find(c => c.name === name).id;

  // The last column is where the seed leaves each event: a status, or "at:<gate>"
  // for a proposal waiting at that gate. Every approver opens the app to at least
  // one item of their own, and Culturals Night is left at gate 1 so a tester can
  // walk it through all four.
  const eventSpecs = [
    ["Swara Unplugged", "Swara", -17, 18, 20, "Amphitheatre", "Performance", 120, "reported"],
    ["Natya Showcase", "Natya", -10, 17, 20, "Main Auditorium", "Performance", 250, "reported"],
    ["Kalam Poetry Slam", "Kalam", -7, 16, 18, "Seminar Hall B", "Competition", 60, "reported"],
    ["Lens Frames Exhibition", "Lens", -24, 10, 16, "Seminar Hall A", "Exhibition", 80, "reported"],
    ["Lens Heritage Photowalk", "Lens", 0, 16, 18, "Open Air Theatre", "Workshop", 45, "live"],
    ["Kalam Lit Quiz", "Kalam", 8, 15, 17, "Seminar Hall B", "Competition", 70, "published"],
    ["Drishti Street Play", "Drishti", 10, 17, 19, "Amphitheatre", "Performance", 150, "submitted"],
    ["Kalam Debating Championship", "Kalam", 12, 10, 13, "Seminar Hall B", "Competition", 80,
      "at:dean"],
    ["Swara Open Mic", "Swara", 16, 16, 18, "Seminar Hall A", "Performance", 90, "submitted"],
    // Deliberate clash with Swara Open Mic: same venue, overlapping window, so the
    // Dean's calendar has something real to resolve.
    ["Natya Contemporary Workshop", "Natya", 16, 17, 19, "Seminar Hall A", "Workshop", 60, "submitted"],
    // Over the VC threshold, under Management's: Society -> Dean -> VC.
    ["Natya Dance Drama", "Natya", 20, 17, 20, "Main Auditorium", "Performance", 500, "at:vc"],
    // Over the Management threshold, so it routes Society -> Dean -> VC -> Management.
    ["Culturals Night 2026", "Swara", 25, 17, 22, "Open Air Theatre", "Fest night", 700, "submitted"],
    ["Inter-College Dance Championship", "Natya", 40, 16, 21, "Open Air Theatre", "Fest night", 600,
      "at:management"],
  ];

  const events = eventSpecs.map(
    ([title, club, offset, sh, eh, venue, template, expected, target]) => ({
      id: uid("ev"), title, clubId: clubBy(club), venueId: venueBy(venue),
      festId: null, kind: "performance",
      startsAt: iso(offset, sh), endsAt: iso(offset, eh),
      capacity: venues.find(v => v.name === venue).capacity,
      expectedAttendance: expected,
      status: "draft", targetStatus: target, templateName: template,
      photoCount: 0, socialLinks: [], submittedAt: null, closedAt: null,
      createdBy: null,
    }));

  const today = new Date();
  const semester = {
    id: uid("sm"), name: `Monsoon ${today.getFullYear()}`,
    startsOn: iso(-70, 0).slice(0, 10), endsOn: iso(84, 0).slice(0, 10),
    isCurrent: true,
  };

  return setState({
    version: SCHEMA_VERSION, seededAt: new Date().toISOString(), readyAt: null,
    users, students, clubs, venues, memberships, events, semester,
    templates: TEMPLATES,
    budgets: [], approvals: [], registrations: [], passes: [], qrTokens: [],
    scans: [], notifications: [], audit: [],
    staffIds: { dean: dean.id, vc: vc.id, management: management.id, society: society.id },
    attendancePlan: {
      "Swara Unplugged": [34, 28],
      "Natya Showcase": [40, 33],
      "Kalam Poetry Slam": [26, 21],
      "Lens Frames Exhibition": [24, 19],
      "Lens Heritage Photowalk": [22, 5],
      "Kalam Lit Quiz": [18, 0],
    },
  });
}
