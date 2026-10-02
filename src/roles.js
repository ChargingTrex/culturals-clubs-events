/**
 * The role vocabulary and the capability sets.
 *
 * Ported from the Django backend's common/roles.py so the two cannot drift. Each
 * set exists because some document says so, and the comment says which.
 */

// Global roles
export const STUDENT = "student";
export const CULTURAL_SOCIETY = "cultural_society";
export const DEAN = "dean";
export const VICE_CHANCELLOR = "vice_chancellor";
export const MANAGEMENT = "management";
export const ADMIN = "admin";

// Club-scoped roles, most senior first
export const CLUB_PRESIDENT = "club_president";
export const CLUB_VICE_PRESIDENT = "club_vice_president";
export const CLUB_TREASURER = "club_treasurer";
export const CLUB_SECRETARY = "club_secretary";
export const CLUB_CORE = "club_core";
export const CLUB_MEMBER = "club_member";

export const CLUB_ROLES = [
  CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER,
  CLUB_SECRETARY, CLUB_CORE, CLUB_MEMBER,
];

export const CLUB_ROLE_LABELS = {
  [CLUB_PRESIDENT]: "President",
  [CLUB_VICE_PRESIDENT]: "Vice-President",
  [CLUB_TREASURER]: "Treasurer",
  [CLUB_SECRETARY]: "Secretary",
  [CLUB_CORE]: "Core team",
  [CLUB_MEMBER]: "Member",
};

// Event-scoped, time-bound to one event.
export const EVENT_ORGANISER = "event_organiser";

// --- capability sets ------------------------------------------------------

/** Only these two may assign club roles. A Treasurer explicitly cannot. */
export const ROLE_ASSIGNERS = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT];

/** Budget visibility begins at Treasurer. A plain member never sees money. */
export const BUDGET_VIEWERS = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER];

/** Who builds the budget: adds, edits and removes entries, or declares it nil. */
export const BUDGET_PREPARERS = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER];

/** Who records spend and attaches receipts. */
export const BUDGET_SETTLERS = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER];

/** Who may raise a proposal and its budget request — the Treasurer included. */
export const PROPOSERS = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_SECRETARY, CLUB_TREASURER];

/** Who runs an event: marks it live, closes it. Not the Treasurer. */
export const EVENT_OPERATORS = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_SECRETARY];

/** Who may work a check-in desk. Not a plain member, and not the Treasurer. */
export const DOOR_STAFF = [CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_SECRETARY, CLUB_CORE];

/**
 * Approval stages, and the role that holds each gate. The order here is the order
 * a proposal travels: each later gate holds a higher delegation of financial power.
 */
export const STAGE_ROLE = {
  cultural_society: CULTURAL_SOCIETY,
  dean: DEAN,
  vc: VICE_CHANCELLOR,
  management: MANAGEMENT,
};

export const STAGE_LABELS = {
  cultural_society: "Cultural Society",
  dean: "Dean of Student Affairs",
  vc: "Vice-Chancellor",
  management: "Management",
};

/** How a sentence names the gate holding something: "with the Dean", "with Management". */
export const STAGE_WITH = {
  cultural_society: "the Cultural Society",
  dean: "the Dean",
  vc: "the Vice-Chancellor",
  management: "Management",
};

/** Short forms for tight spaces: route trackers, pills, toasts. */
export const STAGE_SHORT = {
  cultural_society: "Society",
  dean: "Dean",
  vc: "VC",
  management: "Management",
};

/**
 * Gates that sanction money. The Cultural Society recommends on merit and the
 * calendar; the figures are first sanctioned by the Dean, and each later gate may
 * reduce them further but never raise them.
 */
export const SANCTIONING_STAGES = ["dean", "vc", "management"];

/** Roles for which a second factor is mandatory. */
export const MFA_REQUIRED_ROLES = [DEAN, VICE_CHANCELLOR, MANAGEMENT, ADMIN, CULTURAL_SOCIETY];

/**
 * The governance tier that receives aggregates and never an individual student:
 * no roster, no attendee list, no PRN lookup.
 */
export const AGGREGATE_ONLY_ROLES = [VICE_CHANCELLOR, MANAGEMENT];

export function splitRole(role) {
  const [name, scope] = String(role).split(":");
  return { name, scope: scope || null };
}

export const scoped = (name, scope) => `${name}:${scope}`;

export function seniority(name) {
  const i = CLUB_ROLES.indexOf(name);
  return i === -1 ? CLUB_ROLES.length : i;
}
