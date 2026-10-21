/**
 * Where the session lives: one localStorage key, read through a small cache so
 * `useSyncExternalStore` gets a stable snapshot while nothing has changed.
 */
import type { Session } from '../api/types';

const KEY = 'culturals.session';

let cachedRaw: string | null = null;
let cached: Session | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function writeSession(session: Session): void {
  const raw = JSON.stringify(session);
  try {
    storage()?.setItem(KEY, raw);
  } catch {
    /* private mode: keep the in-memory copy only */
  }
  cachedRaw = raw;
  cached = session;
  emit();
}

export function clearSession(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  cachedRaw = null;
  cached = null;
  emit();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}
