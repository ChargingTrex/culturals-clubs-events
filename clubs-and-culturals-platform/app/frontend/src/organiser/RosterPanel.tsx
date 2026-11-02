import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { doorApi, rosterKey, type Roster } from './api';

type Show = 'all' | 'in' | 'out';

/** Names and PRNs: the API scopes this to the event's organisers, door staff and Dean. */
export function RosterPanel({ eventId }: { eventId: string }) {
  const [show, setShow] = useState<Show>('all');
  const [search, setSearch] = useState('');
  const roster = useQuery<Roster, ApiError>({
    queryKey: rosterKey(eventId),
    queryFn: () => doorApi.roster(eventId),
    refetchInterval: 15_000,
  });

  if (roster.isPending) return <Loading label="Loading the attendee list…" />;
  if (roster.error) return <ProblemView error={roster.error} />;

  const { counts, results } = roster.data;
  const needle = search.trim().toLowerCase();
  const rows = results
    .filter((a) => (show === 'in' ? a.attended : show === 'out' ? !a.attended : true))
    .filter(
      (a) =>
        !needle ||
        a.full_name.toLowerCase().includes(needle) ||
        a.prn.toLowerCase().includes(needle),
    );
  const pct = counts.registered > 0 ? Math.round((counts.attended / counts.registered) * 100) : 0;

  return (
    <section className="panel" aria-label="Attendee list" data-testid="roster">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2>Attendees</h2>
        <p className="text-[0.92rem] text-muted" data-testid="roster-counts">
          <strong className="text-ink">{counts.attended}</strong> of {counts.registered} checked in
          ({pct}%){counts.waitlisted ? ` · ${counts.waitlisted} waitlisted` : ''}
        </p>
      </div>
      <div className="meter mt-2.5">
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="roster-search">
            Find by name or PRN
          </label>
          <input
            id="roster-search"
            className="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. 23LA1041"
          />
        </div>
        <div role="group" aria-label="Show" className="flex gap-1.5">
          {(
            [
              ['all', 'All'],
              ['in', 'Checked in'],
              ['out', 'Not yet'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={show === value}
              className={`btn ${show === value ? 'btn-primary' : ''}`}
              onClick={() => setShow(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <Empty>
            {results.length === 0 ? 'Nobody has registered yet.' : 'No one matches that.'}
          </Empty>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[0.9rem]">
            <thead>
              <tr className="border-b border-line text-[0.78rem] tracking-[0.05em] text-muted uppercase">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">PRN</th>
                <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Programme</th>
                <th className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="py-2 pr-3 font-medium">{a.full_name}</td>
                  <td className="py-2 pr-3 font-mono text-[0.85rem]">{a.prn}</td>
                  <td className="hidden py-2 pr-3 text-muted sm:table-cell">
                    {a.programme} · Y{a.year}
                  </td>
                  <td className="py-2">
                    {a.attended ? (
                      <Pill tone="ok">
                        In{a.checked_in_at ? ` · ${fmtTime(a.checked_in_at)}` : ''}
                      </Pill>
                    ) : a.waitlisted ? (
                      <Pill tone="warn">Waitlisted</Pill>
                    ) : (
                      <Pill>Not yet</Pill>
                    )}
                    {a.source === 'spot' ? (
                      <span className="ml-1.5">
                        <Pill tone="gold">At the door</Pill>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
