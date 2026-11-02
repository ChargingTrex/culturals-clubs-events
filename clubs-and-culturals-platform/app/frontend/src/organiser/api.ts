/** Typed calls for the door: scan, offline replay, PRN check-in, roster. */
import { request } from '../shared/api/client';
import type { components } from '../shared/api/schema';

type S = components['schemas'];

export type ScanOutcome = S['ScanOutcome'];
export type ScanResult = S['ScanResultEnum'];
export type ScanStation = S['ScanStation'];
export type OfflineSync = S['OfflineSync'];
export type Roster = S['Roster'];
export type Attendee = S['Attendee'];

/** One scan the station could not send; replayed later in `scanned_at` order. */
export interface QueuedScan {
  ref: string;
  token: string;
  scanned_at: string;
}

const base = (eventId: string) => `/participation/events/${encodeURIComponent(eventId)}`;

export const doorApi = {
  station: (eventId: string) => request<ScanStation>(`${base(eventId)}/scan`),
  scan: (eventId: string, body: { token: string; station_id: string; scanned_at: string }) =>
    request<ScanOutcome>(`${base(eventId)}/scan`, { method: 'POST', body }),
  sync: (eventId: string, body: { station_id: string; scans: QueuedScan[] }) =>
    request<OfflineSync>(`${base(eventId)}/scan/sync`, { method: 'POST', body }),
  checkIn: (eventId: string, body: { prn: string; station_id: string }) =>
    request<ScanOutcome>(`${base(eventId)}/check-in`, { method: 'POST', body }),
  roster: (eventId: string) => request<Roster>(`${base(eventId)}/roster`),
};

export const stationKey = (eventId: string) => ['door', eventId, 'station'] as const;
export const rosterKey = (eventId: string) => ['door', eventId, 'roster'] as const;
