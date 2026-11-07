/**
 * Types the pages work with.
 *
 * `schema.d.ts` is generated from the backend's OpenAPI document
 * (`npm run gen:types`). Every shape here is an alias into it: the backend
 * annotates each route's response (B-09), so nothing is hand-typed any more.
 * The one addition is `MyRegistration.waitlisted`, which the backend does not
 * produce today and the pages render only if it ever appears.
 */
import type { components } from './schema';

type S = components['schemas'];

export type EventStatus = S['EventStatusEnum'];
export type ClubOut = S['Club'];
export type MembershipOut = S['Membership'];
export type JoinRequestOut = S['JoinRequest'];
export type VenueOut = S['Venue'];
export type LoginRequest = S['Login'];

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type BudgetSummary = S['BudgetSummary'];

export type MyRegistration = S['MyRegistration'] & {
  /** Not produced by the backend today (registration refuses with
   *  PARTICIPATION_EVENT_FULL); rendered if it ever appears. */
  waitlisted?: boolean;
};

export type EventOut = Omit<S['Event'], 'my_registration'> & {
  my_registration: MyRegistration | null;
};

export type RegistrationOut = S['Registration'];

// --- identity -----------------------------------------------------------------
export type Claims = S['Claims'];
export type Session = S['Session'];
export type ApprovalStage = S['ApprovalStageEnum'];
export type Capabilities = S['Capabilities'];
export type Me = S['Me'];
export type Preferences = S['Preferences'];

// --- participation wallet ------------------------------------------------------
export type PassOut = S['Pass'];
export type ProfileQr = S['ProfileQr'];
export type Wallet = S['Wallet'];
