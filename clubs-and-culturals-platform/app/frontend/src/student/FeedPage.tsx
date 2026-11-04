/**
 * F-07 — the feed: event cards, the caller's clubs first when they asked for
 * that (Settings → Personalised feed), search done by the API.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { EventOut, Page } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import {
  accentFor,
  Button,
  buttonClass,
  CATEGORY_GLYPH,
  Chip,
  ClubIcon,
  Icon,
  PosterArt,
  type ClubCategory,
} from '../shared/ds';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useClubs } from './useClubs';
import { EVENTS_KEY } from './useRegistration';

const OPEN = 'published,live';

/** "Live" only between start and end (F-07 acceptance), whatever the status says. */
function phaseOf(event: EventOut, now: number): 'Upcoming' | 'Live' | 'Ended' {
  if (now < new Date(event.starts_at).getTime()) return 'Upcoming';
  if (now <= new Date(event.ends_at).getTime()) return 'Live';
  return 'Ended';
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function FeedCard({
  event,
  category,
  now,
}: {
  event: EventOut;
  category?: ClubCategory;
  now: number;
}) {
  const phase = phaseOf(event, now);
  const full = event.registered >= event.capacity;
  const pct = event.capacity > 0 ? Math.min(100, (event.registered / event.capacity) * 100) : 100;
  const mine = event.my_registration;
  const accent = accentFor(event.club_name);
  const when = sameDay(event.starts_at, event.ends_at)
    ? `${fmtDate(event.starts_at)} · ${fmtTime(event.starts_at)}`
    : `${fmtDate(event.starts_at)} – ${fmtDate(event.ends_at)}`;
  return (
    <li
      data-testid="feed-card"
      data-event={event.id}
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-elevation-1"
    >
      <Link to={`/events/${event.id}`} tabIndex={-1} aria-hidden="true">
        <PosterArt
          headline={event.club_name}
          kicker="Presents"
          sub={event.venue_name}
          accent={accent}
          category={category}
          ratio="16 / 9"
          headlineClassName="headline"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <ClubIcon name={event.club_name} accent={accent} category={category} size="xs" />
          <span className="label-md truncate">{event.club_name}</span>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-body-md text-ink-muted">
          <span className="cc-num">{when}</span>
          {phase === 'Live' ? (
            <Chip tone="approved" live>
              Live
            </Chip>
          ) : phase === 'Upcoming' ? (
            <Chip tone="in-review" icon="calendar">
              Upcoming
            </Chip>
          ) : (
            <Chip tone="neutral" icon="check">
              Ended
            </Chip>
          )}
        </p>
        <h3>
          <Link to={`/events/${event.id}`} className="hover:underline">
            {event.title}
          </Link>
        </h3>
        {event.description ? (
          <p className="line-clamp-1 text-body-md text-ink-muted">{event.description}</p>
        ) : null}
        <div className="meter mt-1">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="flex flex-wrap items-center gap-2 text-body-md text-ink-muted">
          <span>
            {event.registered} of {event.capacity} places taken{full ? ' · Full' : ''}
          </span>
          {mine?.waitlisted ? <Pill tone="warn">Waitlisted</Pill> : null}
          {mine && !mine.waitlisted ? (
            <Pill tone={mine.attended ? 'ok' : 'info'}>
              {mine.attended ? 'Checked in' : mine.pass_token ? 'Pass ready' : 'Registered'}
            </Pill>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!shown) return null;
  return (
    <Button
      variant="tonal"
      size="sm"
      icon="upload"
      className="fixed right-4 bottom-[calc(var(--navbar-height)+var(--space-4)+env(safe-area-inset-bottom,0px))] z-40 shadow-elevation-3 md:bottom-6"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      Back to top
    </Button>
  );
}

export function FeedPage() {
  const { me, capabilities } = useCapabilities();
  const personalised = me?.preferences.personalised_feed ?? false;
  const myClubs = useMemo(() => new Set(capabilities?.clubs ?? []), [capabilities]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  // Judged once per page view, so a card does not flip to "Live" mid-render.
  const [now] = useState(() => Date.now());

  const clubs = useClubs();
  const filters = {
    status: OPEN,
    ordering: personalised ? 'feed' : 'starts_at',
    search: search || undefined,
  };
  const events = useQuery<Page<EventOut>, ApiError>({
    queryKey: [...EVENTS_KEY, 'feed', filters],
    queryFn: () => api.events.list(filters),
    enabled: me !== null,
  });

  const categoryOf = useMemo(() => {
    const map = new Map<string, ClubCategory>();
    for (const c of clubs.data?.results ?? []) {
      const glyph = CATEGORY_GLYPH[c.category];
      if (glyph) map.set(c.id, glyph);
    }
    return map;
  }, [clubs.data]);

  const rows = events.data?.results ?? [];
  const fromMine = personalised ? rows.filter((e) => myClubs.has(e.club)) : [];
  const rest = personalised ? rows.filter((e) => !myClubs.has(e.club)) : rows;
  const exploreClubs = (
    <Link to="/clubs" className={buttonClass('tonal', 'sm')}>
      Explore clubs
    </Link>
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Feed</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-muted">
            {personalised
              ? 'Events from your clubs first, then the rest of campus.'
              : 'Everything on campus, in date order. Turn on the personalised feed in Settings to see your clubs first.'}
          </p>
        </div>
      </div>

      <form
        role="search"
        className="mb-5 w-full max-w-[420px]"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
        }}
      >
        <label className="cc-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            className="body-md"
            placeholder="Search events and clubs"
            aria-label="Search the feed"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!e.target.value.trim()) setSearch('');
            }}
          />
        </label>
      </form>

      {myClubs.size === 0 && !search ? (
        <div
          className="note mb-5 flex flex-wrap items-center justify-between gap-3"
          data-testid="no-clubs-note"
        >
          <span>Nothing from your clubs yet — you haven&apos;t joined one.</span>
          {exploreClubs}
        </div>
      ) : null}

      {events.isPending ? (
        <Loading />
      ) : events.error ? (
        <ProblemView error={events.error} />
      ) : rows.length === 0 ? (
        <Empty action={myClubs.size === 0 ? exploreClubs : undefined}>
          {search ? `Nothing matches “${search}”.` : 'Nothing published yet.'}
        </Empty>
      ) : (
        <>
          {personalised && fromMine.length > 0 ? (
            <h2 className="mb-3 label-md text-ink-muted uppercase">From your clubs</h2>
          ) : null}
          {fromMine.length > 0 ? (
            <ul className="m-0 mb-6 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
              {fromMine.map((e) => (
                <FeedCard key={e.id} event={e} category={categoryOf.get(e.club)} now={now} />
              ))}
            </ul>
          ) : null}
          {personalised && rest.length > 0 ? (
            <h2 className="mb-3 label-md text-ink-muted uppercase">Across campus</h2>
          ) : null}
          {rest.length > 0 ? (
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
              {rest.map((e) => (
                <FeedCard key={e.id} event={e} category={categoryOf.get(e.club)} now={now} />
              ))}
            </ul>
          ) : null}
        </>
      )}
      <BackToTop />
    </>
  );
}
