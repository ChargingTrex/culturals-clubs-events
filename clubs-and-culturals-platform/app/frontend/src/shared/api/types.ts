/**
 * Types the pages work with.
 *
 * `schema.d.ts` is generated from the backend's OpenAPI document
 * (`npm run gen:types`). Where drf-spectacular could infer a serializer the
 * type comes from there. Where it could not — the APIViews for `/module/auth/*`
 * and `/participation/my-passes` carry no `responses=` annotation, and the
 * `SerializerMethodField`s on `Event` come out as `string` — the shape is
 * written here by hand from docs/API_DATA_MODELS.md §5–§6. Each hand-typed
 * block says so, so it can be deleted once the backend annotates it.
 */
import type { components } from './schema';

type S = components['schemas'];

export type EventStatus = S['EventStatusEnum'];
/** `member_count` and `my_role` are method fields the schema calls `string`. */
export type ClubOut = Omit<S['Club'], 'member_count' | 'my_role'> & {
  member_count: number;
  my_role: string | null;
};
export type VenueOut = S['Venue'];
export type LoginRequest = S['Login'];

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// --- hand-typed: Event's method fields (schema says `string`) --------------
export interface BudgetSummary {
  id: string;
  stage: string;
  stage_label: string;
  total_requested: string;
  total_sanctioned: string;
  total_spent: string;
}

export interface MyRegistration {
  id: string;
  attended: boolean;
  pass_token: string | null;
  /** Not produced by the backend today (registration refuses with
   *  PARTICIPATION_EVENT_FULL); rendered if it ever appears. */
  waitlisted?: boolean;
}

export type EventOut = Omit<
  S['Event'],
  'registered' | 'attended' | 'budget' | 'my_registration' | 'social_links'
> & {
  registered: number;
  attended: number;
  budget: BudgetSummary | null;
  my_registration: MyRegistration | null;
  social_links: string[];
};

export type RegistrationOut = Omit<S['Registration'], 'pass_token'> & {
  pass_token: string | null;
};

// --- hand-typed: identity (API_DATA_MODELS §5) ------------------------------
export interface Claims {
  sub: string;
  iss: string;
  aud: string;
  email: string;
  student_id: string | null;
  prn: string | null;
  display_name: string;
  roles: string[];
  department: string | null;
  programme: string | null;
  year: number | null;
  mfa: boolean;
  iat: number;
  exp: number;
  scan_event?: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  claims: Claims;
}

export type ApprovalStage = 'cultural_society' | 'dean' | 'vc';

export interface Capabilities {
  can_see_individual_records: boolean;
  can_see_all_clubs: boolean;
  is_student: boolean;
  is_dean: boolean;
  is_vice_chancellor: boolean;
  is_cultural_society: boolean;
  is_admin: boolean;
  clubs: string[];
  clubs_with_budget_access: string[];
  clubs_can_assign_roles: string[];
  clubs_can_propose: string[];
  clubs_can_operate_events: string[];
  clubs_can_enter_spend: string[];
  clubs_door_staff: string[];
  can_see_overview: boolean;
  organiser_events: string[];
  approval_stages: ApprovalStage[];
}

export interface Me {
  sub: string;
  display_name: string;
  prn: string | null;
  student_id: string | null;
  department: string | null;
  programme: string | null;
  year: number | null;
  roles: string[];
  mfa: boolean;
  capabilities: Capabilities;
}

// --- hand-typed: participation wallet (API_DATA_MODELS §6) ------------------
export interface PassOut {
  registration_id: string;
  event_id: string;
  title: string;
  club: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  attended: boolean;
  /** null once the pass has been used or revoked. */
  token: string | null;
  image: string | null;
}

export interface ProfileQr {
  token: string;
  version: number;
  image: string;
}

export interface Wallet {
  passes: PassOut[];
  profile_qr: ProfileQr | null;
  note?: string;
}
