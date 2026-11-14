/** Typed calls for the club screens (F-04): events, proposals, budgets, roster. */
import { ApiError, buildUrl, request, refreshSession } from '../shared/api/client';
import type { components } from '../shared/api/schema';
import { fileUrl } from '../shared/api/files';
import { readSession } from '../shared/auth/tokens';
import type { EventOut, Page } from '../shared/api/types';

export { fileUrl };

type S = components['schemas'];

export type Budget = S['Budget'];
export type BudgetLine = S['BudgetLine'];
export type Receipt = S['Receipt'];
export type Envelope = S['EnvelopeOut'];
export type BudgetTemplates = S['BudgetTemplates'];
export type BudgetTemplate = S['BudgetTemplate'];
export type Venue = S['Venue'];
export type EventCreate = S['EventCreate'];
export type EventCreated = S['EventCreated'];
export type EventKind = S['EventKindEnum'];
export type SubmitOut = S['SubmitOut'];
export type Clashes = S['Clashes'];
export type ApprovalRequest = S['ApprovalRequest'];
export type ClubMembers = S['ClubMembers'];
export type Membership = S['Membership'];
export type ClubRole = S['ClubRoleEnum'];
export type JoinRequests = S['JoinRequests'];
export type JoinRequest = S['JoinRequest'];
export type OpenBlock = S['OpenBlock'];
export type EventPhoto = S['EventPhoto'];
export type ProposalDocument = S['ProposalDocument'];
export type EventSocialPost = S['EventSocialPost'];
export type EventReportDraft = S['EventReportDraft'];
export type OfficeBearerHistory = S['OfficeBearerHistory'];
export type HandoverRequest = S['HandoverRequest'];
export type HandoverOut = S['HandoverOut'];

const id = (v: string) => encodeURIComponent(v);
const budgetPath = (b: string) => `/budget/budgets/${id(b)}`;
const linePath = (b: string, l: string) => `${budgetPath(b)}/lines/${id(l)}`;

export const KINDS: Array<{ value: EventKind; label: string }> = [
  { value: 'performance', label: 'Performance' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'competition', label: 'Competition' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'talk', label: 'Talk' },
];

export const ROLES: Array<{ value: ClubRole; label: string }> = [
  { value: 'club_president', label: 'President' },
  { value: 'club_vice_president', label: 'Vice-President' },
  { value: 'club_treasurer', label: 'Treasurer' },
  { value: 'club_secretary', label: 'Secretary' },
  { value: 'club_core', label: 'Core team' },
  { value: 'club_member', label: 'Member' },
];

/** Offices a handover can fill (clubs/services.OFFICE_BEARER_ROLES). */
export const OFFICES: ClubRole[] = [
  'club_president',
  'club_vice_president',
  'club_treasurer',
  'club_secretary',
];

/**
 * Multipart upload. `request` only speaks JSON, so this is the one hand-rolled
 * fetch: same bearer, one refresh on 401, same problem mapping.
 */
async function upload<T>(path: string, form: FormData, retried = false): Promise<T> {
  const session = readSession();
  const headers: Record<string, string> = { accept: 'application/json, application/problem+json' };
  if (session) headers['authorization'] = `Bearer ${session.access_token}`;
  let res: Response;
  try {
    res = await fetch(buildUrl(path), { method: 'POST', headers, body: form });
  } catch (cause) {
    throw ApiError.network(cause);
  }
  if (res.status === 401 && !retried && session && (await refreshSession())) {
    return upload<T>(path, form, true);
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!res.ok) throw ApiError.fromBody(res.status, body, path);
  return body as T;
}

export const clubApi = {
  events: {
    list: (club?: string) =>
      request<Page<EventOut>>('/events', {
        query: { page_size: 100, club, ordering: '-starts_at' },
      }),
    create: (body: EventCreate) => request<EventCreated>('/events', { method: 'POST', body }),
    submit: (event: string) =>
      request<SubmitOut>(`/events/${id(event)}/submit`, { method: 'POST' }),
    goLive: (event: string) =>
      request<EventOut>(`/events/${id(event)}/go-live`, { method: 'POST' }),
    close: (event: string, body: { outcomes: string; learnings?: string }) =>
      request<EventOut>(`/events/${id(event)}/close`, { method: 'POST', body }),
    /** AR-10: attach or replace the proposal write-up (PDF or Word). */
    setProposalDocument: (event: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      return upload<ProposalDocument>(`/events/${id(event)}/proposal-document`, form);
    },
    report: (event: string) => request<EventReportDraft>(`/events/${id(event)}/report`),
    photos: (event: string) => request<EventPhoto[]>(`/events/${id(event)}/photos`),
    addPhoto: (event: string, form: FormData) => upload<EventPhoto>(`/events/${id(event)}/photos`, form),
    editPhoto: (event: string, photo: string, body: { caption?: string; is_highlight?: boolean }) =>
      request<EventPhoto>(`/events/${id(event)}/photos/${id(photo)}`, { method: 'PATCH', body }),
    removePhoto: (event: string, photo: string) =>
      request<void>(`/events/${id(event)}/photos/${id(photo)}`, { method: 'DELETE' }),
    posts: (event: string) => request<EventSocialPost[]>(`/events/${id(event)}/social-posts`),
    addPost: (event: string, url: string, screenshot?: File | null) => {
      if (!screenshot) {
        return request<EventSocialPost>(`/events/${id(event)}/social-posts`, {
          method: 'POST',
          body: { url },
        });
      }
      const form = new FormData();
      form.append('url', url);
      form.append('screenshot', screenshot);
      return upload<EventSocialPost>(`/events/${id(event)}/social-posts`, form);
    },
    removePost: (event: string, post: string) =>
      request<void>(`/events/${id(event)}/social-posts/${id(post)}`, { method: 'DELETE' }),
    remove: (event: string) => request<void>(`/events/${id(event)}`, { method: 'DELETE' }),
    clashes: (event: string) => request<Clashes>(`/events/${id(event)}/clashes`),
  },
  venues: () => request<Page<Venue>>('/venues', { query: { page_size: 100 } }),
  openBlock: {
    get: () => request<OpenBlock>('/open-block'),
    book: (body: { club: string; venue: string; starts_at: string }) =>
      request<EventOut>('/open-block', { method: 'POST', body }),
  },
  approvals: () =>
    request<Page<ApprovalRequest>>('/governance/approvals', { query: { page_size: 100 } }),
  budget: {
    templates: (expected: number) =>
      request<BudgetTemplates>('/budget/budget-templates', {
        query: { expected_attendance: expected },
      }),
    list: () => request<Page<Budget>>('/budget/budgets', { query: { page_size: 100 } }),
    get: (b: string) => request<Budget>(budgetPath(b)),
    envelope: (club: string) => request<Envelope>(`/budget/envelopes/${id(club)}`),
    addLine: (b: string, body: { head: string; amount_requested: string; basis?: string }) =>
      request<Budget>(`${budgetPath(b)}/lines`, { method: 'POST', body }),
    editLine: (b: string, l: string, body: { head?: string; amount_requested?: string }) =>
      request<Budget>(`${linePath(b, l)}/edit`, { method: 'PUT', body }),
    importLines: (b: string, form: FormData) => upload<Budget>(`${budgetPath(b)}/lines/import`, form),
    removeLine: (b: string, l: string) =>
      request<Budget>(`${linePath(b, l)}/remove`, { method: 'DELETE' }),
    setSpend: (
      b: string,
      l: string,
      body: { amount_spent?: string | null; variance_note?: string },
    ) => request<Budget>(linePath(b, l), { method: 'PATCH', body }),
    declareNil: (b: string, reason: string) =>
      request<Budget>(`${budgetPath(b)}/declare-nil`, { method: 'POST', body: { reason } }),
    withdrawNil: (b: string) =>
      request<Budget>(`${budgetPath(b)}/withdraw-nil`, { method: 'POST' }),
    settle: (b: string) => request<Budget>(`${budgetPath(b)}/settle`, { method: 'POST' }),
    attachReceipt: (b: string, l: string, form: FormData) =>
      upload<Receipt>(`${linePath(b, l)}/receipts`, form),
    /** The file sits behind the bearer, so a plain link cannot open it. */
    openReceipt: async (r: Receipt): Promise<void> => {
      const url = await fileUrl(r.file_url);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  },
  clubs: {
    members: (club: string) => request<ClubMembers>(`/clubs/${id(club)}/members`),
    setRole: (membership: string, body: { role: ClubRole; reason?: string }) =>
      request<Membership>(`/memberships/${id(membership)}/role`, { method: 'POST', body }),
    joinRequests: (club: string) => request<JoinRequests>(`/clubs/${id(club)}/join-requests`),
    decideJoin: (club: string, req: string, outcome: 'accept' | 'decline', note = '') =>
      request<JoinRequest>(`/clubs/${id(club)}/join-requests/${id(req)}/${outcome}`, {
        method: 'POST',
        body: { note },
      }),
    history: (club: string) =>
      request<OfficeBearerHistory>(`/clubs/${id(club)}/office-bearers/history`),
    handover: (club: string, body: HandoverRequest) =>
      request<HandoverOut>(`/clubs/${id(club)}/handover`, { method: 'POST', body }),
  },
};
