import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeSession } from '../../test/capabilities';
import { problem, server, state } from '../../test/server';
import { readSession, writeSession } from '../auth/tokens';
import { API_BASE, ApiError, request, toProblem } from './client';

const B = API_BASE;

describe('problem-details mapping', () => {
  it('maps an RFC 9457 body into a typed ApiError with code, status, detail and errors', async () => {
    writeSession(makeSession(['student']));
    server.use(
      http.post(`${B}/participation/registrations`, () =>
        problem(409, 'PARTICIPATION_EVENT_FULL', 'Event is full', 'No places left.', {
          errors: [{ field: 'event', code: 'FULL', message: 'Capacity reached.' }],
        }),
      ),
    );
    const err = await request('/participation/registrations', {
      method: 'POST',
      body: { event: 'e1' },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const api = err as ApiError;
    expect(api.status).toBe(409);
    expect(api.code).toBe('PARTICIPATION_EVENT_FULL');
    expect(api.title).toBe('Event is full');
    expect(api.detail).toBe('No places left.');
    expect(api.traceId).toBe('trace-1');
    expect(api.errors).toEqual([{ field: 'event', code: 'FULL', message: 'Capacity reached.' }]);
    expect(api.refused).toBe(false);
    expect(api.message).toBe('No places left.');
  });

  it('flags 403 and 404 as refusals', () => {
    expect(new ApiError({ status: 403, code: 'PERMISSION_DENIED' }).refused).toBe(true);
    expect(new ApiError({ status: 404, code: 'NOT_FOUND' }).refused).toBe(true);
    expect(new ApiError({ status: 422, code: 'VALIDATION_FAILED' }).refused).toBe(false);
  });

  it('synthesises a default code for a non-problem body', async () => {
    writeSession(makeSession(['student']));
    server.use(
      http.get(`${B}/events`, () => new HttpResponse('<h1>Bad gateway</h1>', { status: 502 })),
    );
    const err = (await request('/events').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(toProblem(409, { not: 'a problem' }).code).toBe('CONFLICT');
    expect(toProblem(418, undefined).code).toBe('REQUEST_FAILED');
  });

  it('turns a network failure into NETWORK_ERROR with status 0', async () => {
    writeSession(makeSession(['student']));
    server.use(http.get(`${B}/events`, () => HttpResponse.error()));
    const err = (await request('/events').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.status).toBe(0);
  });

  it('returns undefined for 204 and parses JSON otherwise', async () => {
    writeSession(makeSession(['student']));
    await expect(request('/module/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    await expect(request<{ count: number }>('/clubs')).resolves.toMatchObject({ count: 2 });
  });
});

describe('token refresh on 401', () => {
  it('refreshes once with rotation, retries with the new bearer, and stores the new pair', async () => {
    writeSession(makeSession(['student'], { access: 'access-stale', refresh: 'refresh-1' }));
    state.validAccess = new Set(['access-2']);
    const seen: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/clubs')) seen.push(request.headers.get('authorization') ?? '');
    });

    const page = await request<{ count: number }>('/clubs');
    expect(page.count).toBe(2);
    expect(state.refreshCalls).toBe(1);
    expect(seen).toEqual(['Bearer access-stale', 'Bearer access-2']);
    expect(readSession()).toMatchObject({ access_token: 'access-2', refresh_token: 'refresh-2' });
  });

  it('shares one refresh between concurrent 401s', async () => {
    writeSession(makeSession(['student'], { access: 'access-stale', refresh: 'refresh-1' }));
    state.validAccess = new Set(['access-2']);
    await Promise.all([request('/clubs'), request('/events'), request('/module/auth/me')]);
    expect(state.refreshCalls).toBe(1);
  });

  it('clears the session and surfaces the 401 when the refresh token is rejected', async () => {
    writeSession(makeSession(['student'], { access: 'access-stale', refresh: 'refresh-replayed' }));
    state.validAccess = new Set(['access-2']);
    const err = (await request('/clubs').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(state.refreshCalls).toBe(1);
    expect(readSession()).toBeNull();
  });

  it('does not try to refresh an unauthenticated call', async () => {
    const err = (await request('/clubs').catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(401);
    expect(state.refreshCalls).toBe(0);
  });

  it('never refreshes on a login failure', async () => {
    writeSession(makeSession(['student']));
    const err = (await request('/module/auth/login', {
      method: 'POST',
      body: { email: 'x@college.edu', password: 'wrong' },
      auth: false,
    }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(state.refreshCalls).toBe(0);
    expect(readSession()).not.toBeNull();
  });
});
