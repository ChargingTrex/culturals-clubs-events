/**
 * Sign in, sign out, and "who is signed in" for React.
 *
 * The session (tokens + claims) is the external store; the capability payload
 * from `/module/auth/me` is cached in TanStack Query (see useCapabilities).
 */
import { useSyncExternalStore } from 'react';
import { api } from '../api/endpoints';
import type { Session } from '../api/types';
import { clearSession, readSession, subscribeSession, writeSession } from './tokens';

export interface Credentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export async function login({ email, password, mfaCode }: Credentials): Promise<Session> {
  const body: { email: string; password: string; mfa_code?: string } = { email, password };
  const code = mfaCode?.trim();
  if (code) body.mfa_code = code;
  const session = await api.auth.login(body);
  writeSession(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    if (readSession()) await api.auth.logout();
  } catch {
    /* the access token expires on its own; the local copy goes regardless */
  }
  clearSession();
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribeSession, readSession, readSession);
}

export { readSession, clearSession };
