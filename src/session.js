/**
 * Who the caller is, and what they may do.
 *
 * Mirrors the backend's AuthContext: every question is answered from the claims,
 * never from a database scan, so a permission check costs nothing.
 */
import { db, find } from "./db.js";
import * as R from "./roles.js";
import { MANAGEMENT_THRESHOLD, VC_THRESHOLD } from "./approvals.js";

const KEY = "culturals.persona";
const rupees = n => `₹${n.toLocaleString("en-IN")}`;

/**
 * The login page's buttons, in the order they appear, grouped the way people
 * think about them: the campus side that runs events, and the gates that approve
 * them.
 */
export const PERSONA_GROUPS = [
  { key: "campus", label: "Students and clubs",
    blurb: "Register for events, raise proposals, build budgets, run the door." },
  { key: "approver", label: "Approvers",
    blurb: "Each gate sees only the proposals waiting with it." },
];

/** `home` is where each role lands after signing in: its own work, not a student page. */
export const PERSONAS = [
  { key: "student", group: "campus", label: "Student", blurb: "Any enrolled student",
    hint: "Browse, register, show a QR at the door", home: "student-events.html" },
  { key: "member", group: "campus", label: "Club member", blurb: "Member, Swara",
    hint: "Club internals — but never the budget", home: "club-events.html" },
  { key: "secretary", group: "campus", label: "Secretary", blurb: "Secretary, Swara",
    hint: "Raise proposals and run events", home: "club-events.html" },
  { key: "treasurer", group: "campus", label: "Treasurer", blurb: "Treasurer, Swara",
    hint: "Build the budget, request it, settle it", home: "club-budget.html" },
  { key: "president", group: "campus", label: "President", blurb: "President, Swara",
    hint: "Everything the club can do, plus roles", home: "club-events.html" },
  { key: "organiser", group: "campus", label: "Organiser", blurb: "President, Lens",
    hint: "Runs the live event and its scan station", home: "organiser-scan.html" },
  { key: "society", group: "approver", label: "Cultural Society",
    blurb: "Cultural secretary", hint: "Gate 1 — recommends cultural and literary events",
    home: "society-approvals.html" },
  { key: "dean", group: "approver", label: "Dean", blurb: "Dean of Student Affairs",
    hint: "Gate 2 — sanctions every budget. Venues, overview",
    home: "dean-approvals.html" },
  { key: "vc", group: "approver", label: "Vice-Chancellor", blurb: "Head of the university",
    hint: `Gate 3 — budgets over ${rupees(VC_THRESHOLD)}, and fests`,
    home: "vc-queue.html" },
  { key: "management", group: "approver", label: "Management",
    blurb: "Director of Finance, for the Trust",
    hint: `Gate 4 — budgets over ${rupees(MANAGEMENT_THRESHOLD)}. Aggregates only`,
    home: "management-queue.html" },
];

function clubIdByName(name) {
  const club = db().clubs.find(c => c.name === name);
  return club ? club.id : null;
}

function officerOf(clubName, role) {
  const clubId = clubIdByName(clubName);
  const membership = db().memberships.find(
    m => m.clubId === clubId && m.role === role && !m.endedAt);
  return membership ? find(db().students, membership.studentId) : null;
}

function studentWithNoClubRole() {
  const held = new Set(db().memberships.filter(m => !m.endedAt).map(m => m.studentId));
  return db().students.find(s => !held.has(s.id)) || db().students[0];
}

function resolvePersona(key) {
  const { staffIds } = db();
  switch (key) {
    case "student":   return { student: studentWithNoClubRole() };
    case "member":    return { student: officerOf("Swara", R.CLUB_MEMBER)
                                || officerOf("Swara", R.CLUB_CORE) };
    case "secretary": return { student: officerOf("Swara", R.CLUB_SECRETARY) };
    case "treasurer": return { student: officerOf("Swara", R.CLUB_TREASURER) };
    case "president": return { student: officerOf("Swara", R.CLUB_PRESIDENT) };
    case "organiser": return { student: officerOf("Lens", R.CLUB_PRESIDENT) };
    case "society":   return { user: find(db().users, staffIds.society) };
    case "dean":      return { user: find(db().users, staffIds.dean) };
    case "vc":        return { user: find(db().users, staffIds.vc) };
    case "management": return { user: find(db().users, staffIds.management) };
    default:          return {};
  }
}

/** Global roles plus one scoped role per active membership. */
function rolesFor(user, student) {
  const roles = [...(user.globalRoles || [])];
  if (student) {
    for (const m of db().memberships.filter(
      m => m.studentId === student.id && !m.endedAt)) {
      roles.push(R.scoped(m.role, m.clubId));
    }
  }
  return [...new Set(roles)].sort();
}

export class Session {
  constructor({ personaKey, user, student }) {
    this.personaKey = personaKey;
    this.user = user;
    this.student = student || null;
    this.sub = user.id;
    this.displayName = user.displayName;
    this.prn = student ? student.prn : null;
    this.studentId = student ? student.id : null;
    this.department = student ? student.department : null;
    this.programme = student ? student.programme : null;
    this.year = student ? student.year : null;
    this.roles = rolesFor(user, student);
    // MFA is granted for the staff personas because a walkthrough cannot read an
    // authenticator app. It is the one honest shortcut in this build.
    this.mfa = (user.globalRoles || []).some(r => R.MFA_REQUIRED_ROLES.includes(r));
    this._parsed = this.roles.map(R.splitRole);
  }

  hasAny(...names) {
    const wanted = new Set(names);
    return this._parsed.some(p => wanted.has(p.name));
  }

  scopesFor(...names) {
    const wanted = new Set(names);
    return [...new Set(this._parsed
      .filter(p => wanted.has(p.name) && p.scope)
      .map(p => p.scope))];
  }

  /** The most senior club role held in this club, or null. */
  clubRole(clubId) {
    const held = this._parsed
      .filter(p => R.CLUB_ROLES.includes(p.name) && p.scope === String(clubId))
      .map(p => p.name);
    if (!held.length) return null;
    return held.sort((a, b) => R.seniority(a) - R.seniority(b))[0];
  }

  hasClubRole(clubId, ...allowed) {
    return allowed.includes(this.clubRole(clubId));
  }

  organiserEvents() { return this.scopesFor(R.EVENT_ORGANISER); }

  /** Cross-club visibility of aggregates and of the work itself. */
  canSeeAllClubs() {
    return this.hasAny(R.DEAN, R.VICE_CHANCELLOR, R.MANAGEMENT, R.ADMIN, R.CULTURAL_SOCIETY);
  }

  /**
   * Names and PRNs of identifiable students. The Vice-Chancellor and Management
   * are excluded on purpose: that tier receives aggregates, not the roster.
   */
  canSeeIndividualRecords() { return this.hasAny(R.DEAN, R.ADMIN); }

  capabilities() {
    return {
      isStudent: this.hasAny(R.STUDENT),
      isDean: this.hasAny(R.DEAN),
      isViceChancellor: this.hasAny(R.VICE_CHANCELLOR),
      isManagement: this.hasAny(R.MANAGEMENT),
      isAggregateOnly: this.hasAny(...R.AGGREGATE_ONLY_ROLES)
        && !this.canSeeIndividualRecords(),
      isCulturalSociety: this.hasAny(R.CULTURAL_SOCIETY),
      canSeeAllClubs: this.canSeeAllClubs(),
      canSeeIndividualRecords: this.canSeeIndividualRecords(),
      canSeeOverview: this.hasAny(R.DEAN, R.ADMIN, R.CULTURAL_SOCIETY),
      clubs: this.scopesFor(...R.CLUB_ROLES),
      clubsWithBudgetAccess: this.scopesFor(...R.BUDGET_VIEWERS),
      clubsCanAssignRoles: this.scopesFor(...R.ROLE_ASSIGNERS),
      clubsCanPropose: this.scopesFor(...R.PROPOSERS),
      clubsCanOperateEvents: this.scopesFor(...R.EVENT_OPERATORS),
      clubsCanEnterSpend: this.scopesFor(...R.BUDGET_SETTLERS),
      clubsDoorStaff: this.scopesFor(...R.DOOR_STAFF),
      organiserEvents: this.organiserEvents(),
      approvalStages: Object.entries(R.STAGE_ROLE)
        .filter(([, role]) => this.hasAny(role)).map(([stage]) => stage),
      mfa: this.mfa,
    };
  }
}

export function sessionFor(personaKey) {
  const resolved = resolvePersona(personaKey);
  const student = resolved.student || null;
  const user = resolved.user || (student ? find(db().users, student.userId) : null);
  if (!user) return null;
  return new Session({ personaKey, user, student });
}

/**
 * The signed-in role is kept per TAB, so a tester can hold the Treasurer in one
 * tab and the Dean in the next and watch a proposal move between them. The last
 * choice is also remembered for new tabs.
 */
export function savePersona(key) {
  try { sessionStorage.setItem(KEY, key); } catch {}
  try { localStorage.setItem(KEY, key); } catch {}
}
export function currentPersonaKey() {
  try {
    const mine = sessionStorage.getItem(KEY);
    if (mine) return mine;
  } catch {}
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function clearPersona() {
  try { sessionStorage.removeItem(KEY); } catch {}
  try { localStorage.removeItem(KEY); } catch {}
}
