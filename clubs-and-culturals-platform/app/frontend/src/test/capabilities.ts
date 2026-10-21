/**
 * Build a `/module/auth/me` capability payload from a role list, the way
 * `identity/views._capabilities` does from `common/roles.py`. Test-only: the
 * real payload always comes from the API.
 */
import type { ApprovalStage, Capabilities, Claims, Me, Session } from '../shared/api/types';

const CLUB_ROLES = [
  'club_president',
  'club_vice_president',
  'club_treasurer',
  'club_secretary',
  'club_core',
  'club_member',
] as const;
const ROLE_ASSIGNERS = ['club_president', 'club_vice_president'];
const BUDGET_VIEWERS = ['club_president', 'club_vice_president', 'club_treasurer'];
const PROPOSERS = ['club_president', 'club_vice_president', 'club_secretary', 'club_treasurer'];
const EVENT_OPERATORS = ['club_president', 'club_vice_president', 'club_secretary'];
const BUDGET_SETTLERS = ['club_president', 'club_vice_president', 'club_treasurer'];
const DOOR_STAFF = ['club_president', 'club_vice_president', 'club_secretary', 'club_core'];
const STAGE_ROLE: Record<ApprovalStage, string> = {
  cultural_society: 'cultural_society',
  dean: 'dean',
  vc: 'vice_chancellor',
};

const split = (role: string): [string, string | null] => {
  const [name, scope] = role.split(':');
  return [name ?? role, scope ?? null];
};

export function capabilitiesFromRoles(roles: string[]): Capabilities {
  const parsed = roles.map(split);
  const has = (...names: string[]) => parsed.some(([n]) => names.includes(n));
  const scopes = (names: readonly string[]) =>
    [
      ...new Set(parsed.filter(([n, s]) => names.includes(n) && s).map(([, s]) => s as string)),
    ].sort();
  return {
    can_see_individual_records: has('dean', 'admin'),
    can_see_all_clubs: has('dean', 'vice_chancellor', 'admin', 'cultural_society'),
    is_student: has('student'),
    is_dean: has('dean'),
    is_vice_chancellor: has('vice_chancellor'),
    is_cultural_society: has('cultural_society'),
    is_admin: has('admin'),
    clubs: scopes(CLUB_ROLES),
    clubs_with_budget_access: scopes(BUDGET_VIEWERS),
    clubs_can_assign_roles: scopes(ROLE_ASSIGNERS),
    clubs_can_propose: scopes(PROPOSERS),
    clubs_can_operate_events: scopes(EVENT_OPERATORS),
    clubs_can_enter_spend: scopes(BUDGET_SETTLERS),
    clubs_door_staff: scopes(DOOR_STAFF),
    can_see_overview: has('dean', 'admin', 'cultural_society'),
    organiser_events: scopes(['event_organiser']),
    approval_stages: (Object.keys(STAGE_ROLE) as ApprovalStage[]).filter((s) => has(STAGE_ROLE[s])),
  };
}

/** The web-app's nine sign-in personas, as role lists. */
export const PERSONAS = {
  student: ['student'],
  member: ['student', 'club_member:swara'],
  secretary: ['student', 'club_secretary:swara'],
  treasurer: ['student', 'club_treasurer:swara'],
  president: ['student', 'club_president:swara'],
  organiser: ['student', 'club_president:lens'],
  society: ['cultural_society'],
  dean: ['dean'],
  vc: ['vice_chancellor'],
} as const;

export type PersonaKey = keyof typeof PERSONAS;

export function makeClaims(roles: string[], overrides: Partial<Claims> = {}): Claims {
  const student = roles.includes('student');
  return {
    sub: 'user-1',
    iss: 'https://portal.college.edu',
    aud: 'clubs',
    email: 'meera@college.edu',
    student_id: student ? 'student-1' : null,
    prn: student ? '23LA1041' : null,
    display_name: 'Meera',
    roles,
    department: student ? 'LAW' : null,
    programme: student ? 'BA-LLB' : null,
    year: student ? 3 : null,
    mfa: !student,
    iat: 1_700_000_000,
    exp: 1_700_000_900,
    ...overrides,
  };
}

export function makeSession(
  roles: string[],
  tokens = { access: 'access-1', refresh: 'refresh-1' },
): Session {
  return {
    access_token: tokens.access,
    refresh_token: tokens.refresh,
    token_type: 'Bearer',
    expires_in: 900,
    claims: makeClaims(roles),
  };
}

export function makeMe(roles: string[]): Me {
  const claims = makeClaims(roles);
  return {
    sub: claims.sub,
    display_name: claims.display_name,
    prn: claims.prn,
    student_id: claims.student_id,
    department: claims.department,
    programme: claims.programme,
    year: claims.year,
    roles,
    mfa: claims.mfa,
    capabilities: capabilitiesFromRoles(roles),
  };
}
