/**
 * The one way to call the API.
 *
 * - attaches the bearer token;
 * - on a 401 it refreshes once (`/module/auth/refresh`, rotating the refresh
 *   token) and retries the original call — concurrent 401s share one refresh;
 * - every failure is an `ApiError` carrying the RFC 9457 problem the server
 *   sent (`code` is what callers branch on), or a synthesised one when the
 *   server could not be reached or sent something that is not a problem.
 */
import { clearSession, readSession, writeSession } from '../auth/tokens';
import type { Session } from './types';

export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1').replace(
  /\/+$/,
  '',
);

export interface ProblemFieldError {
  field: string;
  code: string;
  message: string;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  trace_id?: string;
  errors?: ProblemFieldError[];
}

/** Mirrors `common/errors.py:_DEFAULT_CODES` for bodies that are not problems. */
const DEFAULT_CODES: Record<number, string> = {
  400: 'REQUEST_MALFORMED',
  401: 'AUTH_REQUIRED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly type: string;
  readonly instance: string;
  readonly traceId: string;
  readonly errors: ProblemFieldError[];

  constructor(problem: ProblemDetails) {
    super(problem.detail || problem.title || problem.code);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.title = problem.title ?? 'That did not work';
    this.detail = problem.detail ?? '';
    this.type = problem.type ?? '';
    this.instance = problem.instance ?? '';
    this.traceId = problem.trace_id ?? '';
    this.errors = problem.errors ?? [];
  }

  /** A rule refusing (403) or scoping (404) — shown as such, never hidden. */
  get refused(): boolean {
    return this.status === 403 || this.status === 404;
  }

  get problem(): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      code: this.code,
      trace_id: this.traceId,
      errors: this.errors,
    };
  }

  static fromBody(status: number, body: unknown, instance = ''): ApiError {
    return new ApiError(toProblem(status, body, instance));
  }

  static network(cause: unknown): ApiError {
    const err = new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      title: 'Cannot reach the server',
      detail: cause instanceof Error ? cause.message : 'The request did not complete.',
    });
    err.cause = cause;
    return err;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Anything thrown → a problem to render. ApiErrors keep the server's own. */
export function toProblemDetails(error: unknown): ProblemDetails {
  if (error instanceof ApiError) return error.problem;
  if (typeof error === 'object' && error !== null && 'code' in error && 'status' in error) {
    return error as ProblemDetails;
  }
  return {
    status: 0,
    code: 'UNEXPECTED',
    title: 'That did not work',
    detail: error instanceof Error ? error.message : String(error ?? ''),
  };
}

function isProblemLike(body: unknown): body is Partial<ProblemDetails> & { code: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
  );
}

/** Any HTTP failure → a problem. Real problem bodies pass through untouched. */
export function toProblem(status: number, body: unknown, instance = ''): ProblemDetails {
  if (isProblemLike(body)) {
    return {
      type: body.type,
      title: body.title,
      status: typeof body.status === 'number' ? body.status : status,
      detail: body.detail,
      instance: body.instance ?? instance,
      code: body.code,
      trace_id: body.trace_id,
      errors: Array.isArray(body.errors) ? body.errors : [],
    };
  }
  const fallback = DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
  const detail =
    typeof body === 'string' && body.trim() && body.length < 400
      ? body.trim()
      : `The server answered ${status} without a problem body.`;
  return { status, code: fallback, title: 'That did not work', detail, instance, errors: [] };
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Attach the bearer token and refresh on 401. Default true. */
  auth?: boolean;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Query): string {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchange the refresh token for a new pair. Single-flight: every caller that
 * hits a 401 while a refresh is running waits for the same one.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const current = readSession();
    if (!current?.refresh_token) return false;
    try {
      const next = await request<Session>('/module/auth/refresh', {
        method: 'POST',
        body: { refresh_token: current.refresh_token },
        auth: false,
      });
      writeSession(next);
      return true;
    } catch {
      clearSession();
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function send(path: string, opts: RequestOptions, retried: boolean): Promise<unknown> {
  const auth = opts.auth ?? true;
  const headers: Record<string, string> = { accept: 'application/json, application/problem+json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const session = readSession();
    if (session) headers['authorization'] = `Bearer ${session.access_token}`;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (cause) {
    throw ApiError.network(cause);
  }

  if (res.status === 401 && auth && !retried && readSession()) {
    const refreshed = await refreshSession();
    if (refreshed) return send(path, opts, true);
  }

  const body = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401 && auth) clearSession();
    throw ApiError.fromBody(res.status, body, path);
  }
  return body;
}

export function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return send(path, opts, false) as Promise<T>;
}
