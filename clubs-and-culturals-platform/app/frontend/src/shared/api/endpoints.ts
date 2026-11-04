/** Typed calls, one per route the student and organiser screens use. */
import { request } from './client';
import type {
  ClubOut,
  EventOut,
  JoinRequestOut,
  Me,
  MembershipOut,
  Page,
  Preferences,
  ProfileQr,
  RegistrationOut,
  Session,
  Wallet,
} from './types';

export interface EventFilters {
  status?: string;
  club?: string;
  starts_at_after?: string;
  starts_at_before?: string;
  /** F-07: `feed` puts the caller's clubs first; any model field otherwise. */
  ordering?: string;
  mine?: boolean;
  search?: string;
  page_size?: number;
}

export const api = {
  auth: {
    login: (body: { email: string; password: string; mfa_code?: string }) =>
      request<Session>('/module/auth/login', { method: 'POST', body, auth: false }),
    logout: () => request<void>('/module/auth/logout', { method: 'POST' }),
    me: () => request<Me>('/module/auth/me'),
    preferences: () => request<Preferences>('/module/auth/preferences'),
    setPreferences: (body: Partial<Preferences>) =>
      request<Preferences>('/module/auth/preferences', { method: 'PATCH', body }),
  },
  clubs: {
    list: () => request<Page<ClubOut>>('/clubs', { query: { page_size: 100 } }),
    /** 201 MembershipOut for an open club, 202 JoinRequestOut for an approval club. */
    join: (id: string) =>
      request<MembershipOut | JoinRequestOut>(`/clubs/${encodeURIComponent(id)}/join`, {
        method: 'POST',
      }),
    leave: (id: string) =>
      request<void>(`/clubs/${encodeURIComponent(id)}/leave`, { method: 'POST' }),
  },
  events: {
    list: (filters: EventFilters = {}) =>
      request<Page<EventOut>>('/events', { query: { page_size: 100, ...filters } }),
    get: (id: string) => request<EventOut>(`/events/${encodeURIComponent(id)}`),
  },
  participation: {
    register: (event: string) =>
      request<RegistrationOut>('/participation/registrations', { method: 'POST', body: { event } }),
    cancel: (registrationId: string) =>
      request<void>(`/participation/registrations/${encodeURIComponent(registrationId)}/cancel`, {
        method: 'POST',
      }),
    myPasses: () => request<Wallet>('/participation/my-passes'),
    reissueProfileQr: () => request<ProfileQr>('/participation/me/qr', { method: 'POST' }),
  },
};
