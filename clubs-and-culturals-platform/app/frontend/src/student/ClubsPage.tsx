/**
 * F-06.1 — the club directory: every active club as a card, grouped by
 * category, with the caller's own standing on each (member, role, requested)
 * and the membership cap from the capability payload.
 */
import { useState } from 'react';
import type { ClubOut } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import {
  accentFor,
  buttonClass,
  CATEGORY_GLYPH,
  Chip,
  ClubIcon,
  ClubTag,
  cx,
  Icon,
} from '../shared/ds';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { JoinControl, LeaveControl } from './clubs';
import { clubRoleLabel, useClubs } from './useClubs';

/** Section order and headings; committees are a standing body, not an interest. */
const CATEGORIES: Array<[ClubOut['category'], string]> = [
  ['cultural', 'Cultural'],
  ['literary', 'Literary'],
  ['technical', 'Technical'],
  ['sports', 'Sports'],
  ['social', 'Social service'],
  ['committee', 'Committees'],
];

function ClubCard({ club, atCap }: { club: ClubOut; atCap: boolean }) {
  const accent = accentFor(club.name);
  return (
    <li className="panel flex flex-col gap-3" data-testid="club-card" data-club={club.id}>
      <div className="flex items-start gap-3">
        <ClubIcon
          name={club.name}
          accent={accent}
          category={CATEGORY_GLYPH[club.category]}
          size="lg"
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate">{club.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {club.tag ? <ClubTag accent={accent}>{club.tag}</ClubTag> : null}
            {club.status === 'dormant' ? <Chip tone="draft">Dormant</Chip> : null}
            {club.my_role ? (
              <Chip tone="approved" icon="check">
                {club.my_role === 'club_member' ? 'Member' : clubRoleLabel(club.my_role)}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>
      {club.description ? (
        <p className="line-clamp-2 text-body-md text-ink-muted">{club.description}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="caption text-ink-muted">
          {club.member_count} {club.member_count === 1 ? 'member' : 'members'} ·{' '}
          {club.join_mode === 'open' ? 'Open to all' : 'By approval'}
        </span>
        {club.my_role ? <LeaveControl club={club} /> : <JoinControl club={club} atCap={atCap} />}
      </div>
    </li>
  );
}

export function ClubsPage() {
  const { capabilities } = useCapabilities();
  const clubs = useClubs();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('');

  const count = capabilities?.my_clubs_count ?? 0;
  const max = capabilities?.max_club_memberships ?? 5;
  const atCap = count >= max;

  const needle = q.trim().toLowerCase();
  const visible = (clubs.data?.results ?? []).filter(
    (c) =>
      c.status !== 'archived' &&
      (!category || c.category === category) &&
      (!needle ||
        c.name.toLowerCase().includes(needle) ||
        (c.tag ?? '').toLowerCase().includes(needle)),
  );
  const present = new Set((clubs.data?.results ?? []).map((c) => c.category));
  const sections = CATEGORIES.map(([key, label]) => ({
    key,
    label,
    clubs: visible.filter((c) => c.category === key),
  })).filter((s) => s.clubs.length > 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Clubs</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-muted">
            Every club and committee on campus. Join an open club at once, or ask to join one that
            vets its members.
          </p>
        </div>
      </div>

      <div
        className={cx(
          'note mb-5 flex flex-wrap items-center justify-between gap-2',
          atCap && 'border-warning',
        )}
        data-testid="membership-strip"
      >
        <span>
          You&apos;re in <b className="cc-num">{count}</b> of <b className="cc-num">{max}</b> clubs
          {atCap ? ' — leave one to join another.' : '.'}
        </span>
      </div>

      <form role="search" className="mb-5 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <label className="cc-search max-w-[420px]">
          <Icon name="search" size={18} />
          <input
            type="search"
            className="body-md"
            placeholder="Search clubs by name or tag"
            aria-label="Search clubs by name or tag"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {[['', 'All'] as const, ...CATEGORIES.filter(([k]) => present.has(k))].map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={category === key}
                className={buttonClass(category === key ? 'tonal' : 'outlined', 'sm')}
                onClick={() => setCategory(key)}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </form>

      {clubs.isPending ? (
        <Loading />
      ) : clubs.error ? (
        <ProblemView error={clubs.error} />
      ) : sections.length === 0 ? (
        <Empty>
          {clubs.data.results.length === 0 ? 'No clubs yet.' : 'No club matches that search.'}
        </Empty>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="mb-7" aria-labelledby={`cat-${s.key}`}>
            <h2 id={`cat-${s.key}`} className="mb-3">
              {s.label}
            </h2>
            <ul className="m-0 grid list-none gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {s.clubs.map((c) => (
                <ClubCard key={c.id} club={c} atCap={atCap} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
