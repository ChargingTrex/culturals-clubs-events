import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { ClubOut, EventOut, Page } from '../shared/api/types';
import { dateParts, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill, StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { EVENTS_KEY } from './useRegistration';

const OPEN = 'published,live';

function dayBounds(date: string): { starts_at_after: string; starts_at_before: string } {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(`${date}T23:59:59.999`);
  return { starts_at_after: start.toISOString(), starts_at_before: end.toISOString() };
}

function DateBox({ at }: { at: string }) {
  const { day, month } = dateParts(at);
  return (
    <div className="rounded-sm border border-line bg-surface py-2 text-center font-display leading-none">
      <b className="block text-[1.6rem] font-extrabold">{day}</b>
      <span className="text-[0.75rem] text-muted">{month}</span>
    </div>
  );
}

export function EventRow({ event }: { event: EventOut }) {
  const full = event.registered >= event.capacity;
  const pct = event.capacity > 0 ? Math.min(100, (event.registered / event.capacity) * 100) : 100;
  const mine = event.my_registration;
  return (
    <li
      data-testid="event-row"
      className="grid grid-cols-[52px_1fr] items-center gap-4 border-b border-line py-4 sm:grid-cols-[64px_1fr_auto]"
    >
      <DateBox at={event.starts_at} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3>
            <Link to={`/events/${event.id}`} className="hover:underline">
              {event.title}
            </Link>
          </h3>
          <StatusPill status={event.status} label={event.status_label} />
          {mine?.waitlisted ? <Pill tone="warn">Waitlisted</Pill> : null}
          {mine && !mine.waitlisted ? (
            <Pill tone={mine.attended ? 'ok' : 'gold'}>
              {mine.attended ? 'Checked in' : 'Registered'}
            </Pill>
          ) : null}
        </div>
        <p className="text-[0.875rem] text-muted">
          {event.club_name} · {event.venue_name} · {fmtTime(event.starts_at)}–
          {fmtTime(event.ends_at)}
        </p>
        <div className="meter mt-2 max-w-[260px]">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-[0.875rem] text-muted">
          {event.registered} of {event.capacity} places taken{full ? ' · full' : ''}
        </p>
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-2.5 sm:col-span-1 sm:justify-end">
        {mine ? (
          <Link className="btn" to="/passes">
            View pass
          </Link>
        ) : (
          <Link className="btn btn-primary" to={`/events/${event.id}`}>
            {full ? 'Full — details' : 'Register'}
          </Link>
        )}
      </div>
    </li>
  );
}

export function EventsPage() {
  const [club, setClub] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState('');

  const clubs = useQuery<Page<ClubOut>, ApiError>({
    queryKey: ['clubs'],
    queryFn: () => api.clubs.list(),
    staleTime: 10 * 60_000,
  });

  const filters = { status: OPEN, club: club || undefined, ...(date ? dayBounds(date) : {}) };
  const events = useQuery<Page<EventOut>, ApiError>({
    queryKey: [...EVENTS_KEY, 'list', filters],
    queryFn: () => api.events.list(filters),
  });

  const categoryOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clubs.data?.results ?? []) map.set(c.id, c.category);
    return map;
  }, [clubs.data]);

  const categories = useMemo(
    () => [...new Set((clubs.data?.results ?? []).map((c) => c.category))].sort(),
    [clubs.data],
  );

  // The API filters by club and date; category is a property of the club, so
  // it is narrowed here from the club list rather than invented server-side.
  const rows = (events.data?.results ?? []).filter(
    (e) => !category || categoryOf.get(e.club) === category,
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>What&apos;s on</h1>
          <p className="mt-1.5 max-w-[62ch] text-muted">
            Register once and your pass appears under My passes. Show it at the door, or just show
            your profile QR.
          </p>
        </div>
      </div>

      <form
        className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <div>
          <label className="label" htmlFor="f-club">
            Club
          </label>
          <select
            id="f-club"
            className="field"
            value={club}
            onChange={(e) => setClub(e.target.value)}
          >
            <option value="">All clubs</option>
            {(clubs.data?.results ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-category">
            Category
          </label>
          <select
            id="f-category"
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-date">
            Date
          </label>
          <input
            id="f-date"
            type="date"
            className="field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </form>

      {events.isPending ? (
        <Loading />
      ) : events.error ? (
        <ProblemView error={events.error} />
      ) : rows.length === 0 ? (
        <Empty>
          {events.data.results.length === 0
            ? 'Nothing published yet. Once the Dean approves an event it appears here.'
            : 'Nothing matches those filters.'}
        </Empty>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {rows.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </>
  );
}
