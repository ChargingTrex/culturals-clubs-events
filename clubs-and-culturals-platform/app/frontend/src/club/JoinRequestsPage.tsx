import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../shared/api/client';
import { fmtDate } from '../shared/format';
import { Avatar, Button } from '../shared/ds';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { clubApi, type JoinRequest, type JoinRequests } from './api';
import { ClubPicker } from './ClubPicker';
import { useMyClubs, useSelectedClub } from './useMyClubs';

type Outcome = 'accept' | 'decline';
/** Per-row result after a decision: done, or the API's refusal message. */
type RowResult = { ok: true; outcome: Outcome } | { ok: false; message: string };

const refusal = (e: unknown) =>
  e instanceof ApiError ? e.detail || e.title : 'Could not reach the server.';

/**
 * AR-06: the club's join queue on its own page, decided one by one or in bulk.
 * Bulk sends one request per student, in turn, so each keeps its own cap check
 * and audit entry; a student already in five clubs is refused while the rest go
 * through. shortcut: one call per request — add a bulk endpoint if a club gets
 * hundreds at once.
 */
export function JoinRequestsPage() {
  const { clubs, isPending, error } = useMyClubs('clubs_can_assign_roles');
  const { selected, select } = useSelectedClub(clubs);
  const club = selected?.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();
  const requests = useQuery<JoinRequests, ApiError>({
    queryKey: ['clubs', club, 'join-requests'],
    queryFn: () => clubApi.clubs.joinRequests(club),
    enabled: club !== '',
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [busy, setBusy] = useState(false);

  if (isPending) return <Loading />;
  if (error) return <ProblemView error={error} />;
  if (!selected) return <Empty>Only a club's President or Vice-President decides join requests.</Empty>;

  const rows = requests.data?.results.filter((r) => r.state === 'pending' || results[r.id]) ?? [];
  const open = rows.filter((r) => !results[r.id]?.ok);
  const allPicked = open.length > 0 && open.every((r) => picked.has(r.id));

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function decide(targets: JoinRequest[], outcome: Outcome) {
    setBusy(true);
    let done = 0;
    let refused = 0;
    for (const r of targets) {
      try {
        await clubApi.clubs.decideJoin(club, r.id, outcome);
        done += 1;
        setResults((m) => ({ ...m, [r.id]: { ok: true, outcome } }));
      } catch (e) {
        refused += 1;
        setResults((m) => ({ ...m, [r.id]: { ok: false, message: refusal(e) } }));
      }
    }
    setPicked(new Set());
    setBusy(false);
    const verb = outcome === 'accept' ? 'approved' : 'declined';
    toast.show(refused ? `${done} ${verb}, ${refused} refused` : `${done} ${verb}`);
    void queryClient.invalidateQueries({ queryKey: ['clubs', club, 'members'] });
  }

  const chosen = open.filter((r) => picked.has(r.id));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{selected.name} join requests</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-muted">
            Students waiting to join. Approve or decline each one, or tick several and decide them
            together. <Link to={`/club/roster?club=${club}`}>Back to members</Link>
          </p>
        </div>
        <ClubPicker clubs={clubs} value={club} onChange={select} />
      </div>

      {requests.isPending ? (
        <Loading />
      ) : requests.error ? (
        <ProblemView error={requests.error} />
      ) : rows.length === 0 ? (
        <Empty>Nobody is waiting.</Empty>
      ) : (
        <section className="panel" aria-label="Join requests">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allPicked}
                disabled={busy || open.length === 0}
                onChange={() => setPicked(allPicked ? new Set() : new Set(open.map((r) => r.id)))}
              />
              Select all ({open.length} waiting)
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                icon="check"
                disabled={busy || chosen.length === 0}
                onClick={() => void decide(chosen, 'accept')}
              >
                Approve selected ({chosen.length})
              </Button>
              <Button
                size="sm"
                variant="outlined"
                disabled={busy || chosen.length === 0}
                onClick={() => void decide(chosen, 'decline')}
              >
                Decline selected ({chosen.length})
              </Button>
            </div>
          </div>
          <ul className="list-none p-0">
            {rows.map((r) => {
              const result = results[r.id];
              const decided = result?.ok === true;
              return (
                <li
                  key={r.id}
                  data-testid="join-row"
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0"
                >
                  <label className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.full_name}`}
                      checked={picked.has(r.id)}
                      disabled={busy || decided}
                      onChange={() => toggle(r.id)}
                    />
                    <Avatar name={r.full_name} size="sm" />
                    <span className="min-w-0">
                      <strong>{r.full_name}</strong>
                      <span className="block text-body-md text-ink-muted">
                        {r.prn} · {r.department} · year {r.year} · asked {fmtDate(r.created_at)}
                      </span>
                      {result && !result.ok ? (
                        <span className="block text-body-md text-danger" role="alert">
                          {result.message}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {decided ? (
                    <span className="text-body-md text-ink-muted">
                      {result.outcome === 'accept' ? 'Approved' : 'Declined'}
                    </span>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" icon="check" disabled={busy} onClick={() => void decide([r], 'accept')}>
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outlined"
                        disabled={busy}
                        onClick={() => void decide([r], 'decline')}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
