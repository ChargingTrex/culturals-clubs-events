import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Avatar, SegmentedControl } from '../shared/ds';
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
    <section className="cc-card cc-sheet-wrap" aria-label="Attendee list" data-testid="roster">
      <div className="px-5 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2>Attendees</h2>
          <p className="text-body-md text-ink-muted" data-testid="roster-counts">
            <strong className="text-ink">{counts.attended}</strong> of {counts.registered} checked
            in ({pct}%){counts.waitlisted ? ` · ${counts.waitlisted} waitlisted` : ''}
          </p>
        </div>
        <div className="cc-progress mt-2.5" aria-hidden="true">
          <span className="cc-progress-seg cc-progress-seg--in" style={{ width: `${pct}%` }} />
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
          <SegmentedControl
            label="Show"
            value={show}
            onChange={(v) => setShow(v as typeof show)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'in', label: 'Checked in' },
              { value: 'out', label: 'Not yet' },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="m-5">
          <Empty>
            {results.length === 0 ? 'Nobody has registered yet.' : 'No one matches that.'}
          </Empty>
        </div>
      ) : (
        <div className="cc-sheet-scroll mt-4 border-t border-line">
          <table className="cc-sheet">
            <thead>
              <tr>
                <th className="label-md" scope="col">
                  Name
                </th>
                <th className="label-md" scope="col">
                  PRN
                </th>
                <th className="label-md hidden sm:table-cell" scope="col">
                  Programme
                </th>
                <th className="label-md" scope="col">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="body-md">
                    <span className="flex items-center gap-2.5 py-1.5">
                      <Avatar
                        name={a.full_name}
                        size="xs"
                        badge={a.attended ? 'checked-in' : null}
                      />
                      <span className="font-medium">{a.full_name}</span>
                    </span>
                  </td>
                  <td className="cc-cell--id mono-md">{a.prn}</td>
                  <td className="body-md hidden text-ink-muted sm:table-cell">
                    {a.programme} · Y{a.year}
                  </td>
                  <td className="body-md">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {a.attended ? (
                        <Pill tone="ok">
                          In{a.checked_in_at ? ` · ${fmtTime(a.checked_in_at)}` : ''}
                        </Pill>
                      ) : a.waitlisted ? (
                        <Pill tone="warn">Waitlisted</Pill>
                      ) : (
                        <Pill>Not yet</Pill>
                      )}
                      {a.source === 'spot' ? <Pill tone="info">At the door</Pill> : null}
                    </span>
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
