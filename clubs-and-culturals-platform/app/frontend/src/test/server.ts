/**
 * MSW stand-in for the module API. Shapes follow docs/API_DATA_MODELS.md §6
 * and the real problem bodies (RFC 9457 with `code`).
 */
import { http, HttpResponse, type DefaultBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { API_BASE } from '../shared/api/client';
import type { ClubOut, EventOut, PassOut, Session, Wallet } from '../shared/api/types';
import { makeMe, makeSession } from './capabilities';

const B = API_BASE;

/** The generated types mark server-computed fields readonly; the mock keeps its own counters. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Registration {
  id: string;
  event: string;
  attended: boolean;
  pass_token: string | null;
}

export interface MockState {
  /** Access tokens the API accepts. */
  validAccess: Set<string>;
  /** Refresh tokens the API will rotate. */
  validRefresh: Set<string>;
  refreshCalls: number;
  roles: string[];
  events: Mutable<EventOut>[];
  clubs: ClubOut[];
  full: Set<string>;
  registrations: Registration[];
  profile: { token: string; version: number };
  nextId: number;
}

export const CLUBS: ClubOut[] = [
  {
    id: 'club-lens',
    name: 'Lens',
    slug: 'lens',
    tag: 'Photography',
    category: 'cultural',
    description: '',
    instagram_handle: '',
    status: 'active',
    last_activity_at: '2026-10-01T09:00:00Z',
    member_count: 12,
    my_role: null,
  },
  {
    id: 'club-byte',
    name: 'Byte',
    slug: 'byte',
    tag: 'Coding',
    category: 'technical',
    description: '',
    instagram_handle: '',
    status: 'active',
    last_activity_at: '2026-10-05T09:00:00Z',
    member_count: 30,
    my_role: null,
  },
];

const baseEvent = (over: Partial<EventOut>): EventOut => ({
  id: 'e1',
  title: 'Lens Heritage Photowalk',
  club: 'club-lens',
  club_name: 'Lens',
  fest: null,
  kind: 'performance',
  description: 'A walk through the old town with cameras.',
  venue: 'venue-1',
  venue_name: 'Open Air Theatre',
  starts_at: '2026-11-02T10:30:00Z',
  ends_at: '2026-11-02T12:30:00Z',
  capacity: 100,
  expected_attendance: 45,
  status: 'published',
  status_label: 'Published',
  photo_count: 0,
  social_links: [],
  registered: 38,
  attended: 0,
  budget: null,
  my_registration: null,
  submitted_at: null,
  closed_at: null,
  ...over,
});

export function freshState(): MockState {
  return {
    validAccess: new Set(['access-1']),
    validRefresh: new Set(['refresh-1']),
    refreshCalls: 0,
    roles: ['student'],
    clubs: CLUBS,
    events: [
      baseEvent({}),
      baseEvent({
        id: 'e2',
        title: 'Byte Hack Night',
        club: 'club-byte',
        club_name: 'Byte',
        status: 'live',
        status_label: 'Live now',
        capacity: 40,
        registered: 40,
      }),
    ],
    full: new Set(['e2']),
    registrations: [],
    profile: { token: 'profile-token-v1', version: 1 },
    nextId: 1,
  };
}

export let state: MockState = freshState();
export function resetState(): void {
  state = freshState();
}

export function problem(
  status: number,
  code: string,
  title: string,
  detail = '',
  extra: Record<string, DefaultBodyType> = {},
) {
  return HttpResponse.json(
    {
      type: `https://portal.college.edu/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      instance: '/api/v1/x',
      code,
      trace_id: 'trace-1',
      ...extra,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function authorised(request: Request) {
  const token = bearer(request);
  if (!token || !state.validAccess.has(token)) {
    return problem(401, 'AUTH_REQUIRED', 'Sign in', 'A valid bearer token is required.');
  }
  return null;
}

function withMine(event: EventOut): EventOut {
  const mine = state.registrations.find((r) => r.event === event.id);
  return {
    ...event,
    my_registration: mine
      ? { id: mine.id, attended: mine.attended, pass_token: mine.pass_token }
      : null,
  };
}

const STAFF = new Set(['dean@college.edu', 'vc@college.edu', 'cultural.secretary@college.edu']);
const ROLE_BY_EMAIL: Record<string, string[]> = {
  'dean@college.edu': ['dean'],
  'vc@college.edu': ['vice_chancellor'],
  'cultural.secretary@college.edu': ['cultural_society'],
};

export const handlers = [
  http.post(`${B}/module/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string; mfa_code?: string };
    if (body.password !== 'culturals-demo') {
      return problem(401, 'AUTH_INVALID_CREDENTIALS', 'Login failed', 'Not recognised.');
    }
    if (STAFF.has(body.email) && !body.mfa_code?.trim()) {
      return problem(
        401,
        'AUTH_MFA_REQUIRED',
        'Second factor required',
        'This role requires multi-factor authentication.',
        {
          errors: [
            {
              field: 'mfa_code',
              code: 'REQUIRED',
              message: 'Enter the code from your authenticator.',
            },
          ],
        },
      );
    }
    state.roles = ROLE_BY_EMAIL[body.email] ?? ['student'];
    state.validAccess.add('access-login');
    state.validRefresh.add('refresh-login');
    const session: Session = makeSession(state.roles, {
      access: 'access-login',
      refresh: 'refresh-login',
    });
    return HttpResponse.json(session);
  }),

  http.post(`${B}/module/auth/refresh`, async ({ request }) => {
    state.refreshCalls += 1;
    const body = (await request.json()) as { refresh_token?: string };
    if (!body.refresh_token || !state.validRefresh.has(body.refresh_token)) {
      return problem(
        401,
        'AUTH_INVALID_CREDENTIALS',
        'Login failed',
        'Refresh token is not valid.',
      );
    }
    state.validRefresh.delete(body.refresh_token);
    const n = state.refreshCalls + 1;
    state.validAccess.add(`access-${n}`);
    state.validRefresh.add(`refresh-${n}`);
    return HttpResponse.json(
      makeSession(state.roles, { access: `access-${n}`, refresh: `refresh-${n}` }),
    );
  }),

  http.post(`${B}/module/auth/logout`, () => new HttpResponse(null, { status: 204 })),

  http.get(
    `${B}/module/auth/me`,
    ({ request }) => authorised(request) ?? HttpResponse.json(makeMe(state.roles)),
  ),

  http.get(
    `${B}/clubs`,
    ({ request }) =>
      authorised(request) ??
      HttpResponse.json({
        count: state.clubs.length,
        next: null,
        previous: null,
        results: state.clubs,
      }),
  ),

  http.get(`${B}/events`, ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const url = new URL(request.url);
    const statuses = url.searchParams.get('status')?.split(',');
    const club = url.searchParams.get('club');
    const results = state.events
      .filter((e) => !statuses || statuses.includes(e.status))
      .filter((e) => !club || e.club === club)
      .map(withMine);
    return HttpResponse.json({ count: results.length, next: null, previous: null, results });
  }),

  http.get(`${B}/events/:id`, ({ request, params }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const event = state.events.find((e) => e.id === params.id);
    return event ? HttpResponse.json(withMine(event)) : problem(404, 'NOT_FOUND', 'Not found');
  }),

  http.post(`${B}/participation/registrations`, async ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const body = (await request.json()) as { event: string };
    const event = state.events.find((e) => e.id === body.event);
    if (!event) return problem(404, 'NOT_FOUND', 'Not found');
    if (!['published', 'live'].includes(event.status)) {
      return problem(409, 'PARTICIPATION_NOT_OPEN', 'Registration is not open');
    }
    if (state.registrations.some((r) => r.event === event.id)) {
      return problem(409, 'PARTICIPATION_ALREADY_REGISTERED', 'Already registered');
    }
    if (state.full.has(event.id)) {
      return problem(409, 'PARTICIPATION_EVENT_FULL', 'Event is full', 'This event is full.');
    }
    const id = `reg-${state.nextId++}`;
    const registration = { id, event: event.id, attended: false, pass_token: `pass.${id}` };
    state.registrations.push(registration);
    event.registered += 1;
    return HttpResponse.json(
      {
        id,
        event: event.id,
        event_title: event.title,
        source: 'pre_registered',
        attended: false,
        checked_in_at: null,
        cancelled_at: null,
        pass_token: registration.pass_token,
        registered_at: '2026-10-21T09:00:00Z',
      },
      { status: 201 },
    );
  }),

  http.post(`${B}/participation/registrations/:id/cancel`, ({ request, params }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const idx = state.registrations.findIndex((r) => r.id === params.id);
    if (idx < 0) return problem(404, 'NOT_FOUND', 'Not found');
    const [gone] = state.registrations.splice(idx, 1);
    const event = state.events.find((e) => e.id === gone?.event);
    if (event) event.registered -= 1;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/participation/my-passes`, ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    if (!state.roles.includes('student')) {
      return HttpResponse.json({ passes: [], profile_qr: null } satisfies Wallet);
    }
    const passes: PassOut[] = state.registrations.map((r) => {
      const event = state.events.find((e) => e.id === r.event)!;
      return {
        registration_id: r.id,
        event_id: event.id,
        title: event.title,
        club: event.club_name,
        venue: event.venue_name,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        attended: r.attended,
        waitlisted: false,
        token: r.pass_token,
        image: r.pass_token ? 'data:image/png;base64,server' : null,
      };
    });
    return HttpResponse.json({
      passes,
      profile_qr: { ...state.profile, image: 'data:image/png;base64,server' },
      note: 'Your profile QR holds a signed reference, not your PRN.',
    } satisfies Wallet);
  }),

  http.get(`${B}/reporting/reports/semester`, ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const staff = state.roles.some((r) =>
      ['dean', 'vice_chancellor', 'admin', 'cultural_society'].includes(r),
    );
    return staff
      ? HttpResponse.json({ semester: { name: 'Odd 2026' }, events_run: 0 })
      : problem(
          403,
          'REPORTING_DENIED',
          'Not permitted',
          'Reports are for the Dean, Management and the Cultural Society.',
        );
  }),

  http.post(`${B}/participation/me/qr`, ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    if (!state.roles.includes('student')) {
      return problem(
        403,
        'PARTICIPATION_NOT_A_STUDENT',
        'Not permitted',
        'Only a student holds a profile QR.',
      );
    }
    const version = state.profile.version + 1;
    state.profile = { token: `profile-token-v${version}`, version };
    return HttpResponse.json({ ...state.profile, image: 'data:image/png;base64,server' });
  }),
];

export const server = setupServer(...handlers);
