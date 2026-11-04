import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { fmtDate, roleLabel } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import {
  clubApi,
  OFFICES,
  ROLES,
  type ClubMembers,
  type ClubRole,
  type HandoverOut,
  type HandoverRequest,
  type JoinRequest,
  type JoinRequests,
  type Membership,
  type OfficeBearerHistory,
} from './api';
import { Avatar, Button, RevisionTimeline, ROLE_POSITION } from '../shared/ds';
import { ClubPicker } from './ClubPicker';
import { useMyClubs, useSelectedClub } from './useMyClubs';

const rosterKey = (club: string) => ['clubs', club, 'members'] as const;
const OFFICE_TONE: Partial<Record<ClubRole, 'info' | 'ok'>> = {
  club_president: 'info',
  club_vice_president: 'info',
  club_treasurer: 'ok',
  club_secretary: 'ok',
};

function RoleControl({ member, club }: { member: Membership; club: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<ClubRole>(member.role ?? 'club_member');
  const change = useMutation<Membership, ApiError, ClubRole>({
    mutationFn: (next) => clubApi.clubs.setRole(member.id, { role: next }),
    onSuccess: (m) => {
      toast.show(`${m.full_name} is now ${m.role_label}`);
      void queryClient.invalidateQueries({ queryKey: rosterKey(club) });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: () => setRole(member.role ?? 'club_member'),
  });
  return (
    <div>
      <select
        aria-label={`Role for ${member.full_name}`}
        className="field h-(--control-sm) py-0 text-body-md"
        value={role}
        disabled={change.isPending}
        onChange={(e) => {
          const next = e.target.value as ClubRole;
          setRole(next);
          change.mutate(next);
        }}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {change.error ? <ProblemView error={change.error} /> : null}
    </div>
  );
}

function JoinQueue({ club }: { club: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const requests = useQuery<JoinRequests, ApiError>({
    queryKey: ['clubs', club, 'join-requests'],
    queryFn: () => clubApi.clubs.joinRequests(club),
  });
  const decide = useMutation<
    JoinRequest,
    ApiError,
    { req: JoinRequest; outcome: 'accept' | 'decline' }
  >({
    mutationFn: ({ req, outcome }) => clubApi.clubs.decideJoin(club, req.id, outcome),
    onSuccess: (r, { outcome }) => {
      toast.show(`${r.full_name} ${outcome === 'accept' ? 'joined the club' : 'was declined'}`);
      void queryClient.invalidateQueries({ queryKey: ['clubs', club] });
    },
  });
  if (requests.isPending) return <Loading />;
  if (requests.error) return <ProblemView error={requests.error} />;
  const pending = requests.data.results.filter((r) => r.state === 'pending');
  return (
    <section className="panel" aria-label="Join requests">
      <h3>Join requests</h3>
      {pending.length === 0 ? (
        <p className="mt-1.5 text-body-md text-ink-muted">Nobody is waiting.</p>
      ) : (
        <ul className="mt-2 list-none p-0">
          {pending.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={r.full_name} size="sm" />
                <div className="min-w-0">
                  <strong>{r.full_name}</strong>
                  <span className="block text-body-md text-ink-muted">
                    {r.prn} · {r.department} · year {r.year} · asked {fmtDate(r.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  icon="check"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ req: r, outcome: 'accept' })}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ req: r, outcome: 'decline' })}
                >
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {decide.error ? <ProblemView error={decide.error} /> : null}
    </section>
  );
}

function localNow(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Handover({ club, members }: { club: string; members: Membership[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [effective, setEffective] = useState(localNow);
  const [picks, setPicks] = useState<Partial<Record<ClubRole, string>>>({});
  const history = useQuery<OfficeBearerHistory, ApiError>({
    queryKey: ['clubs', club, 'history'],
    queryFn: () => clubApi.clubs.history(club),
  });
  const run = useMutation<HandoverOut, ApiError>({
    mutationFn: () =>
      clubApi.clubs.handover(club, {
        effective_at: new Date(effective).toISOString(),
        assignments: Object.entries(picks)
          .filter(([, student]) => student)
          .map(([role, student]) => ({
            role: role as HandoverRequest['assignments'][number]['role'],
            student_id: student as string,
          })),
      }),
    onSuccess: (out) => {
      toast.show(
        `Handover recorded — ${out.terms.length} office${out.terms.length === 1 ? '' : 's'}`,
      );
      setPicks({});
      void queryClient.invalidateQueries({ queryKey: ['clubs', club] });
    },
  });
  const chosen = Object.values(picks).filter(Boolean).length;
  return (
    <section className="panel" aria-label="Handover">
      <h3>Handover</h3>
      <p className="mt-1.5 text-body-md text-ink-muted">
        Name next term&apos;s office bearers. The outgoing holders lose their permissions at the
        effective time.
      </p>
      <form
        className="mt-3 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        {OFFICES.map((office) => (
          <div key={office} className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
            <label className="text-body-md font-semibold" htmlFor={`ho-${office}`}>
              {ROLES.find((r) => r.value === office)?.label}
            </label>
            <select
              id={`ho-${office}`}
              className="field"
              value={picks[office] ?? ''}
              onChange={(e) => setPicks((p) => ({ ...p, [office]: e.target.value }))}
            >
              <option value="">— unchanged —</option>
              {members.map((m) => (
                <option key={m.id} value={m.student}>
                  {m.full_name} ({m.prn})
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
          <label className="text-body-md font-semibold" htmlFor="ho-effective">
            Effective
          </label>
          <input
            id="ho-effective"
            type="datetime-local"
            className="field"
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          icon="history"
          className="justify-self-start"
          disabled={run.isPending || chosen === 0}
        >
          Record handover
        </Button>
      </form>
      {run.error ? <ProblemView error={run.error} /> : null}

      <h3 className="mt-6">Office-bearer history</h3>
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <ProblemView error={history.error} />
      ) : history.data.results.length === 0 ? (
        <p className="mt-1.5 text-body-md text-ink-muted">No terms recorded yet.</p>
      ) : (
        <ul className="mt-2 list-none p-0 text-body-md">
          {history.data.results.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <Avatar name={t.full_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.full_name}</span>
                <span className="caption text-ink-muted">{t.role_label}</span>
              </span>
              <span className="mono-sm text-ink-muted">
                {fmtDate(t.starts_at)} – {t.ends_at ? fmtDate(t.ends_at) : 'now'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RosterPage() {
  const { clubs, isPending, error, capabilities } = useMyClubs('clubs');
  const { selected, select } = useSelectedClub(clubs);
  const club = selected?.id ?? '';
  const roster = useQuery<ClubMembers, ApiError>({
    queryKey: rosterKey(club),
    queryFn: () => clubApi.clubs.members(club),
    enabled: club !== '',
  });
  const canAssign =
    (roster.data?.can_assign_roles ?? false) ||
    (capabilities?.clubs_can_assign_roles.includes(club) ?? false);

  if (isPending) return <Loading />;
  if (error) return <ProblemView error={error} />;
  if (!selected) return <Empty>You are not in a club yet.</Empty>;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{roster.data?.club.name ?? selected.name} members</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-muted">
            {canAssign
              ? 'Assign roles here. Every change is recorded with who made it.'
              : 'Who is in the club, and who holds which office.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <ClubPicker clubs={clubs} value={club} onChange={select} />
          {roster.data ? (
            <Pill tone={roster.data.club.join_mode === 'open' ? 'ok' : 'warn'}>
              {roster.data.club.join_mode === 'open' ? 'Open to join' : 'Joining needs approval'}
            </Pill>
          ) : null}
          {roster.data?.pending_join_requests ? (
            <Pill tone="info">{roster.data.pending_join_requests} waiting to join</Pill>
          ) : null}
        </div>
      </div>

      {roster.isPending ? (
        <Loading />
      ) : roster.error ? (
        <ProblemView error={roster.error} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <section className="cc-card cc-sheet-wrap">
              <div className="cc-sheet-toolbar">
                <div>
                  <h3 className="title-md">Members</h3>
                  <div className="caption cc-sheet-sub">
                    {roster.data.results.length} in the club · office-bearers wear a gold ring
                  </div>
                </div>
              </div>
              <div className="cc-sheet-scroll">
                <table className="cc-sheet" data-testid="roster">
                  <thead>
                    <tr>
                      <th className="label-md" scope="col">
                        Name
                      </th>
                      <th className="label-md" scope="col">
                        PRN
                      </th>
                      <th className="label-md" scope="col">
                        Department
                      </th>
                      <th className="label-md" scope="col">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.data.results.map((m) => (
                      <tr key={m.id} data-testid="member-row">
                        <td className="body-md">
                          <span className="flex items-center gap-3 py-2">
                            <Avatar
                              name={m.full_name}
                              size="sm"
                              position={ROLE_POSITION[m.role ?? 'club_member']}
                            />
                            <span className="min-w-0">
                              {m.full_name}
                              <span className="block caption text-ink-muted">
                                {m.programme} · year {m.year}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="cc-cell--id mono-md">{m.prn}</td>
                        <td className="body-md">{m.department}</td>
                        <td className="body-md">
                          {canAssign ? (
                            <RoleControl key={`${m.id}-${m.role}`} member={m} club={club} />
                          ) : (
                            <Pill tone={OFFICE_TONE[m.role ?? 'club_member'] ?? 'plain'}>
                              {m.role_label}
                            </Pill>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {roster.data.recent_changes.length > 0 ? (
              <section className="panel mt-5" aria-label="Role changes">
                <h3 className="mb-4">Role changes</h3>
                <RevisionTimeline
                  items={roster.data.recent_changes.map((c) => {
                    const who = roster.data.results.find((m) => m.id === c.membership);
                    return {
                      role: 'member' as const,
                      name: c.actor_label,
                      roleLabel: 'Club',
                      at: fmtDate(c.created_at),
                      action: (
                        <>
                          {who?.full_name ?? 'A member'}: {roleLabel(c.from_role)} →{' '}
                          <strong>{roleLabel(c.to_role)}</strong>
                        </>
                      ),
                      comment: c.reason || undefined,
                    };
                  })}
                />
              </section>
            ) : null}
          </div>

          {canAssign ? (
            <div className="grid content-start gap-3.5">
              <JoinQueue club={club} />
              <Handover club={club} members={roster.data.results} />
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
