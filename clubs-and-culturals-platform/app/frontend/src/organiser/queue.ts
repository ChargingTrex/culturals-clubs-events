/**
 * The station's offline queue and identity, in localStorage.
 *
 * A door never stops because the network did: a scan that cannot reach the
 * server is kept here with the device's own timestamp and replayed through
 * `scan/sync`, where the earliest `scanned_at` wins (participation/services.py
 * `replay_offline`). Every storage access is guarded — private windows throw.
 */
import type { QueuedScan } from './api';

const QUEUE_PREFIX = 'culturals.scanQueue.';
const STATION_KEY = 'culturals.stationId';

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function stationId(): string {
  try {
    const existing = localStorage.getItem(STATION_KEY);
    if (existing) return existing;
    const id = `web-${randomId().slice(0, 8)}`;
    localStorage.setItem(STATION_KEY, id);
    return id;
  } catch {
    return 'web-station';
  }
}

export function readQueue(eventId: string): QueuedScan[] {
  try {
    const raw = localStorage.getItem(QUEUE_PREFIX + eventId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(eventId: string, scans: QueuedScan[]): void {
  try {
    if (scans.length === 0) localStorage.removeItem(QUEUE_PREFIX + eventId);
    else localStorage.setItem(QUEUE_PREFIX + eventId, JSON.stringify(scans));
  } catch {
    // Storage refused (private mode, quota). The in-memory copy still syncs.
  }
}

export function newQueuedScan(token: string): QueuedScan {
  return { ref: randomId(), token, scanned_at: new Date().toISOString() };
}
