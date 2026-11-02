import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import type { VenueOut } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
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

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ReassignForm({
  booking,
  venues,
  onDone,
}: {
  booking: CalendarBooking;
  venues: VenueOut[];
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const options = venues.filter((v) => v.id !== booking.venue && v.active !== false);
  const [toVenue, setToVenue] = useState(options[0]?.id ?? '');
  const [reason, setReason] = useState('');

  const move = useMutation<VenueReassignment, ApiError>({
    mutationFn: () => staffApi.reassign(booking.id, { to_venue: toVenue, reason: reason.trim() }),
    onSuccess: async (out) => {
      toast.show(`Moved “${booking.title}” to ${out.to_venue_name}`);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      onDone();
    },
  });

  return (
    <form
      className="mt-2.5 grid gap-2.5 rounded-sm bg-sunk p-3 sm:grid-cols-[1fr_2fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        move.mutate();
      }}
    >
      <div>
        <label className="label" htmlFor={`to-${booking.id}`}>
          Move to
        </label>
        <select
          id={`to-${booking.id}`}
          className="field"
          value={toVenue}
          onChange={(e) => setToVenue(e.target.value)}
        >
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.capacity})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`why-${booking.id}`}>
          Reason (the club sees this)
        </label>
        <input
          id={`why-${booking.id}`}
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Clash with an approved event in the same slot"
        />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn btn-primary" disabled={move.isPending || !toVenue}>
          Move
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
      {move.error ? (
        <div className="sm:col-span-3">
          <ProblemView error={move.error} />
        </div>
      ) : null}
    </form>
  );
}

function BookingRow({
  booking,
  venues,
  canMove,
}: {
  booking: CalendarBooking;
  venues: VenueOut[];
  canMove: boolean;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <li
      data-testid="booking"
      data-clash={booking.clash ? 'true' : 'false'}
      className={`rounded-sm border px-3 py-2.5 ${booking.clash ? 'border-bad bg-bad-soft/50' : 'border-line bg-surface'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.82rem] text-muted">
          {fmtTime(booking.starts_at)}–{fmtTime(booking.ends_at)}
        </span>
        <strong>{booking.title}</strong>
        <span className="text-[0.85rem] text-muted">{booking.club}</span>
        <StatusPill status={booking.status} />
        {booking.confirmed ? <Pill tone="ok">Confirmed</Pill> : <Pill>Pencilled</Pill>}
        {booking.clash ? <Pill tone="bad">Clash</Pill> : null}
        {canMove ? (
          <button
            type="button"
            className="btn btn-quiet ml-auto text-[0.85rem]"
            onClick={() => setMoving((m) => !m)}
          >
            Move venue
          </button>
        ) : null}
      </div>
      {moving ? (
        <ReassignForm booking={booking} venues={venues} onDone={() => setMoving(false)} />
      ) : null}
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
  const today = dayKey(new Date().toISOString());
  const days = new Map<string, Map<string, CalendarBooking[]>>();
  for (const b of [...(data?.bookings ?? [])].sort((x, y) =>
    x.starts_at.localeCompare(y.starts_at),
  )) {
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
          <p className="mt-1.5 max-w-[62ch] text-muted">
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
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="panel !p-4">
              <span className="text-[0.78rem] font-semibold text-muted uppercase">Venues</span>
              <b className="block font-display text-[1.6rem]">{calendar.data.venues.length}</b>
            </div>
            <div className="panel !p-4">
              <span className="text-[0.78rem] font-semibold text-muted uppercase">Bookings</span>
              <b className="block font-display text-[1.6rem]">{calendar.data.bookings.length}</b>
            </div>
            <div className="panel !p-4">
              <span className="text-[0.78rem] font-semibold text-muted uppercase">Clashes</span>
              <b
                className={`block font-display text-[1.6rem] ${clashCount ? 'text-bad' : ''}`}
                data-testid="clash-count"
              >
                {clashCount}
              </b>
            </div>
            <div className="panel !p-4">
              <span className="text-[0.78rem] font-semibold text-muted uppercase">Buffer</span>
              <b className="block font-display text-[1.6rem]">
                {calendar.data.buffer_minutes ?? 0}
                <span className="text-[0.9rem] font-normal"> min</span>
              </b>
            </div>
          </div>

          {!date ? (
            <label className="mb-3 flex items-center gap-2 text-[0.9rem]">
              <input
                type="checkbox"
                checked={showPast}
                onChange={(e) => setShowPast(e.target.checked)}
              />
              Show past days
            </label>
          ) : null}

          {days.size === 0 ? (
            <Empty>{date ? 'No bookings that day.' : 'No bookings yet.'}</Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {[...days.entries()].map(([day, byVenue]) => (
                <section key={day} className="panel">
                  <h2>{fmtDate(`${day}T12:00:00`)}</h2>
                  <div className="mt-3 flex flex-col gap-4">
                    {[...byVenue.entries()].map(([venue, bookings]) => (
                      <div key={venue}>
                        <h3 className="mb-1.5 text-[0.95rem] text-ink-2">{venue}</h3>
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                          {bookings.map((b) => (
                            <BookingRow
                              key={b.id}
                              booking={b}
                              venues={calendar.data.venues}
                              canMove={canMove}
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
            <ul className="mt-2 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {calendar.data.venues.map((v) => (
                <li key={v.id} className="text-[0.92rem]">
                  <strong>{v.name}</strong>{' '}
                  <span className="text-muted">
                    · {v.capacity} seats{v.location ? ` · ${v.location}` : ''}
                    {v.active === false ? ' · closed' : ''}
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
