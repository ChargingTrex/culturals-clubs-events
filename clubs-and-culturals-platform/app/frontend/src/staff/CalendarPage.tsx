/**
 * C-03 / AR-02: the events calendar for the Cultural Society, the Dean, the VC,
 * admin and club Presidents/VPs.
 *
 * A week strip, then one day as a grid: venues across, 1-hour slots down.
 * Bookings are whole hours (C-02), so a clash is a cell holding two bookings.
 * Read-only, except for a booking the API marks `can_move`: every live booking for
 * the Dean, and (AR-08) a proposal still with the Cultural Society for its Secretary
 * and Vice-Secretary. Club Presidents and VPs never move anything.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { Button, Chip, Icon, cx } from '../shared/ds';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { STAFF_KEYS, staffApi, type CalendarBooking, type VenueCalendar } from './api';
import { dayKey, hoursOn } from './calendarTime';
import { ClashPair } from './VenuesPage';

const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 22;
// AR-03: the Wednesday open block, as OPEN_BLOCK_WEEKDAY / OPEN_BLOCK_HOURS in backend settings.
const OPEN_BLOCK_WEEKDAY = 3; // JS getDay(): 0 = Sunday
const OPEN_BLOCK_HOURS = new Set([15, 16]);

/** How far ahead the "Awaiting approval" list looks. */
const PENDING_LOOKAHEAD_DAYS = 120;

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

const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Same convention as New event: a date plus a whole hour, in the browser's zone. */
const toIso = (date: string, hour: number) => new Date(`${date}T${pad(hour)}:00`).toISOString();

/** A move: new day, hours and venue for one booking, with a reason the club is shown. */
function MoveForm({
  b,
  venues,
  onDone,
}: {
  b: CalendarBooking;
  venues: VenueCalendar['venues'];
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dayKey(b.starts_at));
  const [start, setStart] = useState(new Date(b.starts_at).getHours());
  const [end, setEnd] = useState(new Date(b.ends_at).getHours() || 24);
  const [venue, setVenue] = useState(b.venue);
  const [reason, setReason] = useState('');
  const move = useMutation<unknown, ApiError>({
    mutationFn: () =>
      staffApi.reassign(b.id, {
        to_venue: venue,
        starts_at: toIso(date, start),
        ends_at: end === 24 ? toIso(addDays(date, 1), 0) : toIso(date, end),
        reason,
      }),
    onSuccess: () => {
      toast.show(`“${b.title}” moved; the club and registered students are told`);
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      onDone();
    },
  });
  return (
    <form
      aria-label={`Move ${b.title}`}
      className="mb-5 grid gap-3 rounded-lg border border-primary bg-primary-soft p-4 sm:grid-cols-5 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        move.mutate();
      }}
    >
      <h3 className="sm:col-span-5">Move “{b.title}”</h3>
      <label className="grid gap-1 text-label-md">
        Day
        <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="grid gap-1 text-label-md">
        From
        <select className="field" value={start} onChange={(e) => setStart(Number(e.target.value))}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {pad(h)}:00
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-label-md">
        To
        <select className="field" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
          {HOURS.slice(1).concat(24).map((h) => (
            <option key={h} value={h}>
              {pad(h % 24)}:00
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-label-md sm:col-span-2">
        Venue
        <select className="field" value={venue} onChange={(e) => setVenue(e.target.value)}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-label-md sm:col-span-4">
        Reason (the club is shown this)
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={move.isPending || reason.trim().length < 5}>
          Move
        </Button>
        <Button type="button" size="sm" variant="outlined" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {move.error ? (
        <div className="sm:col-span-5">
          <ProblemView error={move.error} />
        </div>
      ) : null}
    </form>
  );
}

function BookingChip({
  b,
  hour,
  day,
  onMove,
}: {
  b: CalendarBooking;
  hour: number;
  day: string;
  onMove?: (b: CalendarBooking) => void;
}) {
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
      {starts && onMove ? (
        <button
          type="button"
          className="mt-1 block text-primary hover:underline"
          aria-label={`Move ${b.title}`}
          onClick={() => onMove(b)}
        >
          Move
        </button>
      ) : null}
    </div>
  );
}

export function CalendarPage() {
  const today = dayKey(new Date().toISOString());
  const [day, setDay] = useState(today);
  const [moving, setMoving] = useState<CalendarBooking | null>(null);
  const from = weekStart(day);
  const to = addDays(from, 6);
  const calendar = useQuery<VenueCalendar, ApiError>({
    queryKey: STAFF_KEYS.calendarWeek(from),
    queryFn: () => staffApi.calendarWeek(from, to),
  });

  // The grid shows one week, so a request three weeks out would be invisible here.
  // This looks ahead and lists every booking still awaiting approval, with a jump to its day.
  const ahead = useQuery<VenueCalendar, ApiError>({
    queryKey: STAFF_KEYS.calendarWeek(`pending-from-${today}`),
    queryFn: () => staffApi.calendarWeek(today, addDays(today, PENDING_LOOKAHEAD_DAYS)),
  });
  const awaiting = (ahead.data?.bookings ?? []).filter((b) => !b.confirmed);

  const data = calendar.data;
  const bookings = data?.bookings ?? [];
  const venues = data?.venues ?? [];
  const week = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const grid = slotsFor(bookings, day);
  const hours = [...grid.values()].flatMap((byHour) => [...byHour.keys()]);
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...hours);
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...hours.map((h) => h + 1));
  const rows = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const isOpenBlockDay = new Date(`${day}T12:00`).getDay() === OPEN_BLOCK_WEEKDAY;
  const dayPairs = (data?.clashes ?? []).filter((pair) =>
    pair.events.some((e) => hoursOn(e, day).length > 0),
  );

  return (
    <>
      <div className="mb-5">
        <h1>Calendar</h1>
        <p className="mt-1.5 max-w-[62ch] text-ink-muted">
          Every venue in one-hour slots. Two bookings in the same slot of one venue are a clash;
          only the Dean can move a booking, and the Cultural Society&rsquo;s Secretary and
          Vice-Secretary can while a proposal is still with them. The club is told of every move.
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

      {awaiting.length > 0 ? (
        <section
          className="mb-5 rounded-lg border border-line bg-surface p-4"
          aria-label="Awaiting approval"
        >
          <h3 className="flex items-center gap-2">
            <Icon name="clock" /> {awaiting.length} booking{awaiting.length === 1 ? '' : 's'}{' '}
            awaiting approval
          </h3>
          <p className="mt-1 text-body-md text-ink-muted">
            Requested but not yet approved, from today on. Pick one to open its day.
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
            {awaiting.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-label={`Show ${b.title} on ${fmtDate(b.starts_at)}`}
                  aria-pressed={dayKey(b.starts_at) === day}
                  onClick={() => setDay(dayKey(b.starts_at))}
                  className={cx(
                    'flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-left',
                    dayKey(b.starts_at) === day ? 'border-primary bg-primary-soft' : 'border-line',
                  )}
                >
                  <strong>{b.title}</strong>
                  <span className="text-body-md text-ink-muted">
                    {b.club ? `${b.club} · ` : ''}
                    {b.venue_name} · {fmtDate(b.starts_at)}, {fmtTime(b.starts_at)}–
                    {fmtTime(b.ends_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

          {moving ? (
            <MoveForm key={moving.id} b={moving} venues={venues} onDone={() => setMoving(null)} />
          ) : null}

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
                        const openBlock = isOpenBlockDay && OPEN_BLOCK_HOURS.has(hour);
                        return (
                          <td
                            key={v.id}
                            data-testid="slot"
                            data-venue={v.name}
                            data-hour={hour}
                            data-clash={clash}
                            data-open-block={openBlock}
                            className={cx(
                              'px-2 py-1.5 align-top',
                              clash ? 'bg-danger-soft' : openBlock && 'bg-primary-soft/50',
                            )}
                          >
                            {openBlock && list.length === 0 ? (
                              <span className="caption text-ink-muted">Open block</span>
                            ) : null}
                            {clash ? (
                              <Chip tone="rejected" icon="alert" className="mb-1">
                                Clash
                              </Chip>
                            ) : null}
                            <div className="flex flex-col gap-1">
                              {list.map((b) => (
                                <BookingChip
                                  key={b.id}
                                  b={b}
                                  hour={hour}
                                  day={day}
                                  onMove={b.can_move ? setMoving : undefined}
                                />
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
