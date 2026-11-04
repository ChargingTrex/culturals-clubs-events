import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import type { components } from '../shared/api/schema';
import type { VenueOut } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import { Button, Chip, Icon, Stat, Switch, cx } from '../shared/ds';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill, StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import {
  STAFF_KEYS,
  staffApi,
  type CalendarBooking,
  type VenueCalendar,
  type VenueReassignment,
} from './api';

type EventClash = components['schemas']['EventClash'];

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** What the Dean needs to know about a booking to move it. */
interface Movable {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  expected?: number;
}

/**
 * Whether a venue can take this booking, by the server's own rule: two
 * bookings clash when each starts before the other ends, the setup buffer
 * included. Advisory only — the server checks again, under a lock, on move.
 */
function venueVerdict(
  venue: VenueOut,
  item: Movable,
  bookings: CalendarBooking[],
  bufferMin: number,
): { ok: boolean; why?: string } {
  if (item.expected != null && venue.capacity < item.expected) {
    return { ok: false, why: `too small — seats ${venue.capacity}, ${item.expected} expected` };
  }
  const buf = bufferMin * 60_000;
  const s = new Date(item.starts_at).getTime();
  const e = new Date(item.ends_at).getTime();
  const taken = bookings.find(
    (b) =>
      b.id !== item.id &&
      b.venue === venue.id &&
      new Date(b.starts_at).getTime() < e + buf &&
      new Date(b.ends_at).getTime() > s - buf,
  );
  if (taken) {
    return {
      ok: false,
      why: `${taken.confirmed ? 'booked' : 'requested'}: ${taken.title} ${fmtTime(taken.starts_at)}–${fmtTime(taken.ends_at)}`,
    };
  }
  return { ok: true };
}

function ReassignForm({
  item,
  venues,
  bookings,
  bufferMin,
  onDone,
}: {
  item: Movable;
  venues: VenueOut[];
  bookings: CalendarBooking[];
  bufferMin: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = venues
    .filter((v) => v.id !== item.venue && v.active !== false)
    .map((v) => ({ venue: v, ...venueVerdict(v, item, bookings, bufferMin) }));
  const [toVenue, setToVenue] = useState(options.find((o) => o.ok)?.venue.id ?? '');
  const [reason, setReason] = useState('');
  const chosen = options.find((o) => o.venue.id === toVenue);

  const move = useMutation<VenueReassignment, ApiError>({
    mutationFn: () => staffApi.reassign(item.id, { to_venue: toVenue, reason: reason.trim() }),
    onSuccess: async (out) => {
      toast.show(`Moved “${item.title}” to ${out.to_venue_name} — the club and attendees are told`);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      onDone();
    },
  });

  return (
    <form
      className="mt-3 grid gap-3 rounded-md border border-line bg-surface-sunken p-4 sm:grid-cols-[1fr_2fr]"
      onSubmit={(e) => {
        e.preventDefault();
        move.mutate();
      }}
    >
      <div>
        <label className="label" htmlFor={`to-${item.id}`}>
          Move to
        </label>
        <select
          id={`to-${item.id}`}
          className="field"
          value={toVenue}
          onChange={(e) => setToVenue(e.target.value)}
        >
          {options.length === 0 ? <option value="">No other open venue</option> : null}
          {options.map((o) => (
            <option key={o.venue.id} value={o.venue.id} disabled={!o.ok}>
              {o.venue.name} ({o.venue.capacity}){o.ok ? ' — free' : ` — ${o.why}`}
            </option>
          ))}
        </select>
        {chosen && !chosen.ok ? <p className="mt-1 caption text-danger">{chosen.why}</p> : null}
      </div>
      <div>
        <label className="label" htmlFor={`why-${item.id}`}>
          Reason (the club sees this)
        </label>
        <input
          id={`why-${item.id}`}
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Clash with an approved event in the same slot"
        />
      </div>
      <p className="m-0 flex items-start gap-1.5 caption text-ink-muted sm:col-span-2">
        <Icon name="bell" size={14} className="mt-px" />
        The club&apos;s office bearers, the event&apos;s organisers and every registered student are
        notified of the new venue and your reason. The server re-checks the slot when you move.
      </p>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={move.isPending || !toVenue || !chosen?.ok}>
          Move
        </Button>
        <Button type="button" size="sm" variant="text" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {move.error ? (
        <div className="sm:col-span-2">
          <ProblemView error={move.error} />
        </div>
      ) : null}
    </form>
  );
}

function BookingRow({
  booking,
  movable,
  canMove,
  form,
}: {
  booking: CalendarBooking;
  movable: Movable;
  canMove: boolean;
  form: (item: Movable, onDone: () => void) => React.ReactNode;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <li
      data-testid="booking"
      data-clash={booking.clash ? 'true' : 'false'}
      className={cx(
        'rounded-md border border-l-4 px-4 py-3',
        booking.clash
          ? 'border-danger bg-danger-soft'
          : 'border-line border-l-line-strong bg-surface',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono-md text-ink-muted">
          {fmtTime(booking.starts_at)}–{fmtTime(booking.ends_at)}
        </span>
        <strong>{booking.title}</strong>
        <span className="text-body-md text-ink-muted">{booking.club}</span>
        <StatusPill status={booking.status} />
        {booking.confirmed ? <Pill tone="ok">Confirmed</Pill> : <Pill>Pencilled</Pill>}
        {booking.clash ? <Pill tone="bad">Clash</Pill> : null}
        {canMove ? (
          <span className="ml-auto">
            <Button size="sm" variant="outlined" onClick={() => setMoving((m) => !m)}>
              Move venue
            </Button>
          </span>
        ) : null}
      </div>
      {moving ? form(movable, () => setMoving(false)) : null}
    </li>
  );
}

/** One clashing pair: both events side by side, each movable by the Dean. */
function ClashPair({
  venue,
  events,
  canMove,
  form,
  venueId,
}: {
  venue: string;
  events: EventClash[];
  canMove: boolean;
  form: (item: Movable, onDone: () => void) => React.ReactNode;
  venueId: string;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const first = events[0];
  return (
    <li className="rounded-md border border-danger bg-surface p-4">
      <p className="mb-3 flex flex-wrap items-center gap-2 text-body-md">
        <Icon name="pin" size={16} className="text-danger" />
        <strong>{venue}</strong>
        {first ? <span className="text-ink-muted">· {fmtDate(first.starts_at)}</span> : null}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {events.map((e) => {
          const pending = e.status === 'submitted';
          return (
            <div key={e.id} className="rounded-md bg-surface-sunken p-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{e.title}</strong>
                <Chip tone={pending ? 'in-review' : 'approved'} icon={pending ? 'clock' : 'check'}>
                  {pending ? 'Pending request' : 'Confirmed'}
                </Chip>
              </div>
              <p className="mt-1 text-body-md text-ink-muted">
                {e.club} ·{' '}
                <span className="mono-md">
                  {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)}
                </span>{' '}
                · {e.expected_attendance} expected
              </p>
              {canMove ? (
                <Button
                  size="sm"
                  variant="tonal"
                  className="mt-2"
                  aria-label={`Move “${e.title}” to another venue`}
                  onClick={() => setMoving((m) => (m === e.id ? null : e.id))}
                >
                  Move this one
                </Button>
              ) : null}
              {moving === e.id
                ? form(
                    {
                      id: e.id,
                      title: e.title,
                      venue: venueId,
                      starts_at: e.starts_at,
                      ends_at: e.ends_at,
                      expected: e.expected_attendance,
                    },
                    () => setMoving(null),
                  )
                : null}
            </div>
          );
        })}
      </div>
    </li>
  );
}

export function VenuesPage() {
  const [date, setDate] = useState('');
  const [showPast, setShowPast] = useState(false);
  const { capabilities } = useCapabilities();
  const canMove = capabilities?.is_dean ?? false;
  const calendar = useQuery<VenueCalendar, ApiError>({
    queryKey: STAFF_KEYS.calendar(date),
    queryFn: () => staffApi.calendar(date),
  });

  const data = calendar.data;
  const bookings = data?.bookings ?? [];
  const venues = data?.venues ?? [];
  const bufferMin = Number(data?.buffer_minutes ?? 0);
  const venueIdByName = new Map(venues.map((v) => [v.name, v.id]));
  // Expected crowd is known for events in a clash pair; used for the size check.
  const expectedById = new Map<string, number>();
  for (const pair of data?.clashes ?? [])
    for (const e of pair.events) expectedById.set(e.id, e.expected_attendance);

  const form = (item: Movable, onDone: () => void) => (
    <ReassignForm
      item={item}
      venues={venues}
      bookings={bookings}
      bufferMin={bufferMin}
      onDone={onDone}
    />
  );

  const today = dayKey(new Date().toISOString());
  const days = new Map<string, Map<string, CalendarBooking[]>>();
  for (const b of [...bookings].sort((x, y) => x.starts_at.localeCompare(y.starts_at))) {
    if (!date && !showPast && dayKey(b.starts_at) < today && !b.clash) continue;
    const day = days.get(dayKey(b.starts_at)) ?? new Map<string, CalendarBooking[]>();
    const list = day.get(b.venue_name) ?? [];
    list.push(b);
    day.set(b.venue_name, list);
    days.set(dayKey(b.starts_at), day);
  }
  const clashCount = data?.clashes.length ?? 0;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Venues</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-muted">
            Every venue and every booking. Two events in one hall are flagged; the system does not
            pick a winner — you move one, with a reason the club is shown.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="v-date">
            Day
          </label>
          <input
            id="v-date"
            type="date"
            className="field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {calendar.isPending ? (
        <Loading />
      ) : calendar.error ? (
        <ProblemView error={calendar.error} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-5">
            <Stat label="Venues" value={venues.length} />
            <Stat label="Bookings" value={bookings.length} />
            <Stat
              label="Clashes"
              value={<span data-testid="clash-count">{clashCount}</span>}
              tone={clashCount ? 'danger' : undefined}
              note={clashCount ? 'all dates — resolve before approving' : 'none'}
            />
            <Stat
              label="Setup buffer"
              value={`${bufferMin} min`}
              note="counted as part of every booking"
            />
          </div>

          {clashCount > 0 ? (
            <section
              className="mb-5 rounded-lg border border-danger bg-danger-soft p-4 sm:p-5"
              role="alert"
              aria-label="Venue clashes"
            >
              <h2 className="flex items-center gap-2 text-danger">
                <Icon name="alert" /> {clashCount} venue clash{clashCount === 1 ? '' : 'es'}
              </h2>
              <p className="mt-1 mb-4 text-body-md">
                Neither event can be approved while they overlap
                {bufferMin ? ` (the ${bufferMin}-minute setup buffer counts)` : ''}.{' '}
                {canMove
                  ? 'Move one of each pair to a free venue.'
                  : 'Only the Dean can move an event.'}
              </p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {data!.clashes.map((pair, i) => (
                  <ClashPair
                    key={`${pair.venue}-${i}`}
                    venue={pair.venue}
                    venueId={venueIdByName.get(pair.venue) ?? ''}
                    events={pair.events}
                    canMove={canMove}
                    form={form}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {!date ? (
            <div className="mb-4">
              <Switch label="Show past days" checked={showPast} onChange={setShowPast} />
            </div>
          ) : null}

          {days.size === 0 ? (
            <Empty>{date ? 'No bookings that day.' : 'No bookings yet.'}</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {[...days.entries()].map(([day, byVenue]) => (
                <section key={day} className="panel">
                  <h2>{fmtDate(`${day}T12:00:00`)}</h2>
                  <div className="mt-3 flex flex-col gap-4">
                    {[...byVenue.entries()].map(([venue, list]) => (
                      <div key={venue}>
                        <h3 className="mb-2 flex items-center gap-1.5 text-body-lg text-ink-muted">
                          <Icon name="pin" size={16} /> {venue}
                        </h3>
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                          {list.map((b) => (
                            <BookingRow
                              key={b.id}
                              booking={b}
                              canMove={canMove}
                              form={form}
                              movable={{
                                id: b.id,
                                title: b.title,
                                venue: b.venue,
                                starts_at: b.starts_at,
                                ends_at: b.ends_at,
                                expected: expectedById.get(b.id),
                              }}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <section className="panel mt-5">
            <h3>All venues</h3>
            <ul className="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {venues.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2 text-body-md"
                >
                  <span>
                    <strong>{v.name}</strong>
                    {v.location ? <span className="text-ink-muted"> · {v.location}</span> : null}
                  </span>
                  <span className="figure-md text-ink-muted">
                    {v.capacity} seats{v.active === false ? ' · closed' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
