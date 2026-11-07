/** Typed calls for the staff screens (F-05): approvals, venues, overview, report. */
import { ApiError, buildUrl, request } from '../shared/api/client';
import type { components } from '../shared/api/schema';
import { readSession } from '../shared/auth/tokens';

type S = components['schemas'];

export type ApprovalStage = S['ApprovalStageEnum'];
export type Decision = S['DecisionEnum'];
export type ApprovalQueue = S['ApprovalQueue'];
export type ApprovalRequest = S['ApprovalRequest'];
export type ApprovalStep = S['ApprovalStep'];
export type DecisionOut = S['DecisionOut'];
export type VenueCalendar = S['VenueCalendar'];
export type CalendarBooking = S['CalendarBooking'];
export type VenueReassignment = S['VenueReassignment'];
export type DeanOverview = S['DeanOverview'];
export type SemesterReport = S['SemesterReport'];

export const STAGE_LABEL: Record<ApprovalStage, string> = {
  cultural_society: 'Cultural Society',
  dean: 'Dean',
  vc: 'Vice-Chancellor',
};

export const STAGE_PATH: Record<ApprovalStage, string> = {
  cultural_society: '/staff/approvals/society',
  dean: '/staff/approvals/dean',
  vc: '/staff/approvals/vc',
};

export const STAFF_KEYS = {
  queue: (escalated: boolean) => ['staff', 'queue', { escalated }] as const,
  approval: (id: string) => ['staff', 'approval', id] as const,
  calendar: (date: string) => ['staff', 'calendar', date] as const,
  calendarWeek: (from: string) => ['staff', 'calendar-week', from] as const,
  overview: ['staff', 'overview'] as const,
  report: ['staff', 'report'] as const,
};

export interface DecideBody {
  decision: Decision;
  comment: string;
  /** {line_id: amount} — Dean only, never above what was requested. */
  sanctioned?: Record<string, string>;
}

export const staffApi = {
  queue: (escalated = false) =>
    request<ApprovalQueue>('/governance/approvals/queue', {
      query: { escalated: escalated ? 'true' : undefined },
    }),
  approval: (id: string) =>
    request<ApprovalRequest>(`/governance/approvals/${encodeURIComponent(id)}`),
  decide: (id: string, body: DecideBody) =>
    request<DecisionOut>(`/governance/approvals/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      body,
    }),
  calendar: (date?: string) =>
    request<VenueCalendar>('/venue-calendar', { query: { date: date || undefined } }),
  /** One week, `from` and `to` inclusive, as campus-clock dates (C-03). */
  calendarWeek: (from: string, to: string) =>
    request<VenueCalendar>('/venue-calendar', { query: { from, to } }),
  reassign: (eventId: string, body: { to_venue: string; reason: string }) =>
    request<VenueReassignment>(`/events/${encodeURIComponent(eventId)}/reassign`, {
      method: 'POST',
      body,
    }),
  overview: () => request<DeanOverview>('/reporting/reports/overview'),
  report: () => request<SemesterReport>('/reporting/reports/semester'),
};

/** The CSV is not JSON, so it is fetched directly and handed to the browser as a file. */
export async function downloadSemesterCsv(filename: string): Promise<void> {
  const session = readSession();
  const headers: Record<string, string> = { accept: 'text/csv, application/problem+json' };
  if (session) headers['authorization'] = `Bearer ${session.access_token}`;
  let res: Response;
  try {
    res = await fetch(buildUrl('/reporting/reports/semester/csv'), { headers });
  } catch (cause) {
    throw ApiError.network(cause);
  }
  if (!res.ok) {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not a problem body */
    }
    throw ApiError.fromBody(res.status, body, '/reporting/reports/semester/csv');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 51 hours → "2d 3h". */
export function ageLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  const h = Math.max(0, Math.round(hours));
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return rest ? `${d}d ${rest}h` : `${d}d`;
}

export const pct = (rate: number | null | undefined): string =>
  rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
