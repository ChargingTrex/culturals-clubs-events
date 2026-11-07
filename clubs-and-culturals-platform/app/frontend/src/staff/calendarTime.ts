/** Day and hour arithmetic shared by the Venues and Calendar pages, in browser-local time. */
import type { CalendarBooking } from './api';

const HOUR = 3_600_000;

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The hour slots (0–23) a booking covers on `day`, in browser-local time like
 * every other screen. Start is floored and end ceiled, so a legacy 17:30 row
 * still shows in the 17:00 slot.
 */
export function hoursOn(b: Pick<CalendarBooking, 'starts_at' | 'ends_at'>, day: string): number[] {
  const dayStart = new Date(`${day}T00:00`).getTime();
  const start = Math.max(new Date(b.starts_at).getTime(), dayStart);
  const end = Math.min(new Date(b.ends_at).getTime(), dayStart + 24 * HOUR);
  if (end <= start) return [];
  const first = Math.floor((start - dayStart) / HOUR);
  const last = Math.ceil((end - dayStart) / HOUR);
  return Array.from({ length: last - first }, (_, i) => first + i);
}
