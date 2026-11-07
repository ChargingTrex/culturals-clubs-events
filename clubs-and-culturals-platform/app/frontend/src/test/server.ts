/**
 * MSW stand-in for the module API. Shapes follow docs/API_DATA_MODELS.md §6
 * and the real problem bodies (RFC 9457 with `code`).
 */
import { http, HttpResponse, type DefaultBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { API_BASE } from '../shared/api/client';
import type { ClubOut, EventOut, PassOut, Session, Wallet } from '../shared/api/types';
import { makeMe, makeSession } from './capabilities';

const OFFICES = ['club_president', 'club_vice_president', 'club_treasurer', 'club_secretary'];
const MAX_CLUBS = 3;

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
  /** Club ids with the caller's join request pending. */
  pendingJoins: Set<string>;
  preferences: { personalised_feed: boolean };
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
    join_mode: 'open',
    last_activity_at: '2026-10-01T09:00:00Z',
    member_count: 12,
    my_role: null,
    my_join_request_state: null,
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
    join_mode: 'approval',
    last_activity_at: '2026-10-05T09:00:00Z',
    member_count: 30,
    my_role: null,
    my_join_request_state: null,
  },
];

/** The caller's club role in `club`, from the mock's role list (as the token would carry it). */
function myRole(club: string): string | null {
  return state.roles.find((r) => r.endsWith(`:${club}`))?.split(':')[0] ?? null;
}
const clubIds = () => state.roles.filter((r) => r.includes(':')).map((r) => r.split(':')[1]);

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
    pendingJoins: new Set(),
    preferences: { personalised_feed: false },
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
  // Demo server: the pilot accounts the sign-in page lists.
  http.get(`${B}/module/auth/demo/personas`, () =>
    HttpResponse.json({
      demo_mode: true,
      personas: [
        {
          key: 'student',
          label: 'Student',
          sub: 'Any enrolled student',
          available: true,
          name: 'Nithya',
          email: '25la1001@college.edu',
          password: 'culturals-demo',
          mfa_required: false,
        },
        {
          key: 'dean',
          label: 'Dean',
          sub: 'Dean of Student Affairs — the mandatory gate',
          available: true,
          name: 'Dr. Revathi Srinivasan',
          email: 'dean@college.edu',
          password: 'culturals-demo',
          mfa_required: true,
        },
        {
          key: 'vc',
          label: 'Management',
          sub: 'Vice-Chancellor — dashboard only',
          available: false,
          name: null,
          email: null,
          password: null,
          mfa_required: false,
        },
      ],
    }),
  ),

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
    ({ request }) =>
      authorised(request) ?? HttpResponse.json(makeMe(state.roles, state.preferences)),
  ),

  http.get(
    `${B}/module/auth/preferences`,
    ({ request }) => authorised(request) ?? HttpResponse.json(state.preferences),
  ),

  http.patch(`${B}/module/auth/preferences`, async ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const body = (await request.json()) as Record<string, unknown>;
    const unknown = Object.keys(body).filter((k) => k !== 'personalised_feed');
    if (unknown.length) {
      return problem(422, 'VALIDATION_FAILED', 'Validation failed', '', {
        errors: unknown.map((k) => ({ field: k, code: 'invalid', message: 'Unknown preference.' })),
      });
    }
    state.preferences = { ...state.preferences, ...(body as { personalised_feed?: boolean }) };
    return HttpResponse.json(state.preferences);
  }),

  http.get(
    `${B}/clubs`,
    ({ request }) =>
      authorised(request) ??
      HttpResponse.json({
        count: state.clubs.length,
        next: null,
        previous: null,
        results: state.clubs.map((c) => ({
          ...c,
          my_role: myRole(c.id) as ClubOut['my_role'],
          my_join_request_state: state.pendingJoins.has(c.id) ? 'pending' : null,
        })),
      }),
  ),

  http.post(`${B}/clubs/:id/join`, ({ request, params }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const club = state.clubs.find((c) => c.id === params.id);
    if (!club) return problem(404, 'NOT_FOUND', 'Not found');
    if (myRole(club.id)) {
      return problem(409, 'CLUBS_ALREADY_MEMBER', 'Already a member');
    }
    if (clubIds().length >= MAX_CLUBS) {
      return problem(
        409,
        'CLUBS_MEMBERSHIP_LIMIT',
        'Club limit reached',
        `You can be a member of up to ${MAX_CLUBS} clubs. Leave one to join another.`,
      );
    }
    if (club.join_mode === 'open') {
      state.roles.push(`club_member:${club.id}`);
      return HttpResponse.json(
        { id: `m-${club.id}`, club: club.id, student: 'student-1', role: 'club_member' },
        { status: 201 },
      );
    }
    if (state.pendingJoins.has(club.id)) {
      return problem(409, 'CLUBS_JOIN_PENDING', 'Request already pending');
    }
    state.pendingJoins.add(club.id);
    return HttpResponse.json(
      { id: `jr-${club.id}`, club: club.id, student: 'student-1', state: 'pending' },
      { status: 202 },
    );
  }),

  http.post(`${B}/clubs/:id/leave`, ({ request, params }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const club = state.clubs.find((c) => c.id === params.id);
    const role = club ? myRole(club.id) : null;
    if (!club || !role) {
      return problem(404, 'NOT_FOUND', 'Not found', 'You are not a member of this club.');
    }
    if (OFFICES.includes(role)) {
      return problem(
        409,
        'CLUBS_OFFICE_BEARER_CANNOT_LEAVE',
        'Office bearers cannot leave',
        `You are Treasurer of ${club.name}. Hand the office over before leaving.`,
      );
    }
    state.roles = state.roles.filter((r) => r !== `${role}:${club.id}`);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${B}/events`, ({ request }) => {
    const refused = authorised(request);
    if (refused) return refused;
    const url = new URL(request.url);
    const statuses = url.searchParams.get('status')?.split(',');
    const club = url.searchParams.get('club');
    const search = url.searchParams.get('search')?.toLowerCase();
    const mine = url.searchParams.get('mine') === 'true';
    const feed = url.searchParams.get('ordering') === 'feed';
    const isMine = (e: EventOut) => clubIds().includes(e.club);
    const results = state.events
      .filter((e) => !statuses || statuses.includes(e.status))
      .filter((e) => !club || e.club === club)
      .filter((e) => !mine || isMine(e))
      .filter(
        (e) =>
          !search ||
          e.title.toLowerCase().includes(search) ||
          e.club_name.toLowerCase().includes(search),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .sort((a, b) => (feed ? Number(isMine(b)) - Number(isMine(a)) : 0))
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
