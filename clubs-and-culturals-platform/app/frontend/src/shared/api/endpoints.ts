/** Typed calls, one per route the student and organiser screens use. */
import { request } from './client';
import type {
  ClubOut,
  EventOut,
  Me,
  Page,
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
  ordering?: string;
  page_size?: number;
}

export const api = {
  auth: {
    login: (body: { email: string; password: string; mfa_code?: string }) =>
      request<Session>('/module/auth/login', { method: 'POST', body, auth: false }),
    logout: () => request<void>('/module/auth/logout', { method: 'POST' }),
    me: () => request<Me>('/module/auth/me'),
  },
  clubs: {
    list: () => request<Page<ClubOut>>('/clubs', { query: { page_size: 100 } }),
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
