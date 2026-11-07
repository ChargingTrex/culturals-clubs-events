/**
 * C-03: the events calendar for the Cultural Society (and the Dean and admin).
 *
 * A week strip, then one day as a grid: venues across, 1-hour slots down.
 * Bookings are whole hours (C-02), so a clash is a cell holding two bookings.
 * Read-only: moving a booking stays on the Dean's Venues page.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { Button, Chip, Icon, cx } from '../shared/ds';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { STAFF_KEYS, staffApi, type CalendarBooking, type VenueCalendar } from './api';
import { dayKey, hoursOn } from './calendarTime';
import { ClashPair } from './VenuesPage';

const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 22;

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d.toISOString());
}

/** Monday of the week holding `day`. */
function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00`).getDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/** venue id → hour → bookings in that slot, for one day. */
function slotsFor(bookings: CalendarBooking[], day: string) {
  const grid = new Map<string, Map<number, CalendarBooking[]>>();
  for (const b of bookings) {
    for (const hour of hoursOn(b, day)) {
      const byHour = grid.get(b.venue) ?? new Map<number, CalendarBooking[]>();
      byHour.set(hour, [...(byHour.get(hour) ?? []), b]);
      grid.set(b.venue, byHour);
    }
  }
  return grid;
}

function hasClash(grid: Map<string, Map<number, CalendarBooking[]>>): boolean {
  for (const byHour of grid.values())
    for (const list of byHour.values()) if (list.length > 1) return true;
  return false;
}

function BookingChip({ b, hour, day }: { b: CalendarBooking; hour: number; day: string }) {
  const starts = hoursOn(b, day)[0] === hour;
  const pending = b.status === 'submitted';
  return (
    <div
      data-testid="slot-booking"
      className={cx(
        'rounded-sm border px-2 py-1 text-caption',
        pending ? 'border-dashed border-line-strong bg-surface' : 'border-primary bg-primary-soft',
      )}
    >
      <strong className={cx('block truncate', !starts && 'font-normal text-ink-muted')}>
        {b.title}
      </strong>
      {starts ? (
        <span className="text-ink-muted">
          {b.club} ·{' '}
          <span className="mono-sm">
            {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
          </span>
          {pending ? ' · requested' : ''}
        </span>
      ) : null}
    </div>
  );
}

export function CalendarPage() {
  const today = dayKey(new Date().toISOString());
  const [day, setDay] = useState(today);
  const from = weekStart(day);
  const to = addDays(from, 6);
  const calendar = useQuery<VenueCalendar, ApiError>({
    queryKey: STAFF_KEYS.calendarWeek(from),
    queryFn: () => staffApi.calendarWeek(from, to),
  });

  const data = calendar.data;
  const bookings = data?.bookings ?? [];
  const venues = data?.venues ?? [];
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const grid = slotsFor(bookings, day);
  const hours = [...grid.values()].flatMap((byHour) => [...byHour.keys()]);
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...hours);
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...hours.map((h) => h + 1));
  const rows = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const dayPairs = (data?.clashes ?? []).filter((pair) =>
    pair.events.some((e) => hoursOn(e, day).length > 0),
  );

  return (
    <>
      <div className="mb-5">
        <h1>Calendar</h1>
        <p className="mt-1.5 max-w-[62ch] text-ink-muted">
          Every venue in one-hour slots. Two bookings in the same slot of one venue are a clash;
          only the Dean can move one, from Venues.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="tonal" onClick={() => setDay(addDays(day, -7))}>
          Previous week
        </Button>
        <Button size="sm" variant="tonal" onClick={() => setDay(today)}>
          Today
        </Button>
        <Button size="sm" variant="tonal" onClick={() => setDay(addDays(day, 7))}>
          Next week
        </Button>
      </div>

      {calendar.isPending ? (
        <Loading />
      ) : calendar.error ? (
        <ProblemView error={calendar.error} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-7 gap-1.5" role="group" aria-label="Week">
            {week.map((d) => {
              const dayGrid = slotsFor(bookings, d);
              const count = bookings.filter((b) => hoursOn(b, d).length > 0).length;
              const clash = hasClash(dayGrid);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={d === day}
                  aria-label={`${fmtDate(`${d}T12:00`)}: ${count} booking${count === 1 ? '' : 's'}${clash ? ', clash' : ''}`}
                  onClick={() => setDay(d)}
                  className={cx(
                    'flex min-h-11 flex-col items-center rounded-md border px-1 py-2 text-caption',
                    d === day ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
                  )}
                >
                  <span className="text-ink-muted">
                    {new Date(`${d}T12:00`).toLocaleDateString('en-IN', { weekday: 'short' })}
                  </span>
                  <strong>{new Date(`${d}T12:00`).getDate()}</strong>
                  <span className="flex items-center gap-1 text-ink-muted">
                    {count}
                    {clash ? (
                      <span
                        aria-hidden="true"
                        className="inline-block size-2 rounded-full bg-danger"
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <h2 className="mb-3">{fmtDate(`${day}T12:00`)}</h2>

          {dayPairs.length > 0 ? (
            <section
              className="mb-5 rounded-lg border border-danger bg-danger-soft p-4 sm:p-5"
              role="alert"
              aria-label="Clashes this day"
            >
              <h3 className="flex items-center gap-2 text-danger">
                <Icon name="alert" /> {dayPairs.length} clash{dayPairs.length === 1 ? '' : 'es'}
              </h3>
              <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                {dayPairs.map((pair, i) => (
                  <ClashPair
                    key={`${pair.venue}-${i}`}
                    venue={pair.venue}
                    venueId=""
                    events={pair.events}
                    canMove={false}
                    form={() => null}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {venues.length === 0 ? (
            <Empty>No venues yet.</Empty>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-max border-collapse text-left">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 bg-surface-sunken px-3 py-2 text-label-md"
                    >
                      Hour
                    </th>
                    {venues.map((v) => (
                      <th
                        key={v.id}
                        scope="col"
                        className="min-w-40 bg-surface-sunken px-3 py-2 text-label-md"
                      >
                        {v.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((hour) => (
                    <tr key={hour} className="border-t border-line">
                      <th
                        scope="row"
                        className="sticky left-0 bg-surface px-3 py-2 align-top mono-sm"
                      >
                        {pad(hour)}:00
                      </th>
                      {venues.map((v) => {
                        const list = grid.get(v.id)?.get(hour) ?? [];
                        const clash = list.length > 1;
                        return (
                          <td
                            key={v.id}
                            data-testid="slot"
                            data-venue={v.name}
                            data-hour={hour}
                            data-clash={clash}
                            className={cx('px-2 py-1.5 align-top', clash && 'bg-danger-soft')}
                          >
                            {clash ? (
                              <Chip tone="rejected" icon="alert" className="mb-1">
                                Clash
                              </Chip>
                            ) : null}
                            <div className="flex flex-col gap-1">
                              {list.map((b) => (
                                <BookingChip key={b.id} b={b} hour={hour} day={day} />
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
