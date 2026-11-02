import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { EventOut, Page } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import { fmtDate, fmtTime, inr } from '../shared/format';
import { Loading } from '../shared/ui/Empty';
import { Pill, StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { clubApi, type ApprovalRequest, type Clashes } from './api';
import { SubmitButton } from './ClubEventsPage';

const DECISION: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'plain' }> = {
  approve: { label: 'Approved', tone: 'ok' },
  return: { label: 'Returned', tone: 'warn' },
  reject: { label: 'Rejected', tone: 'bad' },
};

function ApprovalTrail({ eventId }: { eventId: string }) {
  const approvals = useQuery<Page<ApprovalRequest>, ApiError>({
    queryKey: ['approvals', 'club'],
    queryFn: () => clubApi.approvals(),
  });
  if (approvals.isPending) return <Loading label="Loading the approval trail…" />;
  if (approvals.error) return <ProblemView error={approvals.error} />;
  const mine = approvals.data.results
    .filter((a) => a.event === eventId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (mine.length === 0) {
    return <p className="mt-1.5 text-[0.9rem] text-muted">Not sent for approval yet.</p>;
  }
  return (
    <ol className="mt-2 list-none space-y-3 p-0">
      {mine.map((req) => (
        <li key={req.id} className="rounded-sm border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-[0.92rem]">
              {(req.stages as string[]).map((s) => s.replace('_', ' ')).join(' → ')}
            </strong>
            <Pill tone={req.state === 'approved' ? 'ok' : req.state === 'pending' ? 'gold' : 'bad'}>
              {req.state === 'pending' ? `With ${req.stage_label}` : req.state}
            </Pill>
            {req.requires_vc ? <Pill tone="warn">Needs the Vice-Chancellor</Pill> : null}
            {req.escalated ? <Pill tone="bad">Past SLA</Pill> : null}
          </div>
          {req.vc_reason ? <p className="mt-1 text-[0.85rem] text-muted">{req.vc_reason}</p> : null}
          {req.steps.length > 0 ? (
            <ul className="mt-2 list-none space-y-1.5 p-0 text-[0.9rem]">
              {req.steps.map((s) => {
                const d = DECISION[s.decision] ?? { label: s.decision, tone: 'plain' as const };
                return (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-2">
                    <Pill tone={d.tone}>{d.label}</Pill>
                    <span>
                      {s.stage_label} · {s.actor_label}
                      {s.on_behalf_of_label ? ` for ${s.on_behalf_of_label}` : ''}
                    </span>
                    {Number(s.amount_sanctioned) > 0 ? (
                      <span className="text-muted">sanctioned {inr(s.amount_sanctioned)}</span>
                    ) : null}
                    <span className="text-[0.8rem] text-muted">{fmtDate(s.created_at)}</span>
                    {s.comment ? (
                      <p className="basis-full text-[0.875rem] text-ink-2">“{s.comment}”</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-[0.85rem] text-muted">No decision yet.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function ClashPanel({ eventId }: { eventId: string }) {
  const [asked, setAsked] = useState(false);
  const clashes = useQuery<Clashes, ApiError>({
    queryKey: ['events', eventId, 'clashes'],
    queryFn: () => clubApi.events.clashes(eventId),
    enabled: asked,
  });
  return (
    <section className="panel" aria-label="Clashes">
      <h3>Clash check</h3>
      {!asked ? (
        <>
          <p className="mt-1.5 text-[0.9rem] text-muted">
            Other events at the same time, and venues that are free in this slot.
          </p>
          <button type="button" className="btn mt-3" onClick={() => setAsked(true)}>
            Check clashes
          </button>
        </>
      ) : clashes.isPending ? (
        <Loading />
      ) : clashes.error ? (
        <ProblemView error={clashes.error} />
      ) : (
        <>
          {clashes.data.clashes.length === 0 ? (
            <p className="mt-1.5">
              <Pill tone="ok">No clashes</Pill>
            </p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-[0.9rem]">
              {clashes.data.clashes.map((c) => (
                <li key={c.id}>
                  {c.title} ({c.club}) · {fmtTime(c.starts_at)}–{fmtTime(c.ends_at)} ·{' '}
                  {c.expected_attendance} expected
                </li>
              ))}
            </ul>
          )}
          {clashes.data.free_venues.length > 0 ? (
            <p className="mt-2 text-[0.875rem] text-muted">
              Free in this slot: {clashes.data.free_venues.map((v) => v.name).join(', ')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function CloseForm({ event }: { event: EventOut }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState('0');
  const [links, setLinks] = useState('');
  const close = useMutation<EventOut, ApiError>({
    mutationFn: () =>
      clubApi.events.close(event.id, {
        photo_count: Number(photos) || 0,
        social_links: links
          .split(/\s+/)
          .map((l) => l.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.show('Event closed');
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        close.mutate();
      }}
    >
      <div>
        <label className="label" htmlFor="close-photos">
          Photos taken
        </label>
        <input
          id="close-photos"
          type="number"
          min={0}
          className="field"
          value={photos}
          onChange={(e) => setPhotos(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="close-links">
          Social posts (links, space separated)
        </label>
        <input
          id="close-links"
          className="field"
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          placeholder="https://instagram.com/p/…"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={close.isPending}>
        Close event
      </button>
      {close.error ? (
        <div className="sm:col-span-3">
          <ProblemView error={close.error} />
        </div>
      ) : null}
    </form>
  );
}

export function ClubEventDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const event = useQuery<EventOut, ApiError>({
    queryKey: ['events', id],
    queryFn: () => api.events.get(id),
    enabled: id !== '',
  });
  const goLive = useMutation<EventOut, ApiError>({
    mutationFn: () => clubApi.events.goLive(id),
    onSuccess: () => {
      toast.show('Event is live — the scan station can open');
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
  const remove = useMutation<void, ApiError>({
    mutationFn: () => clubApi.events.remove(id),
    onSuccess: () => {
      toast.show('Proposal deleted');
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      navigate('/club/events', { replace: true });
    },
  });

  if (event.isPending) return <Loading />;
  if (event.error) return <ProblemView error={event.error} />;
  const e = event.data;
  const operate = capabilities?.clubs_can_operate_events.includes(e.club) ?? false;
  const propose = capabilities?.clubs_can_propose.includes(e.club) ?? false;
  const deletable = ['draft', 'returned', 'rejected'].includes(e.status);

  return (
    <article>
      <p className="mb-3 text-[0.875rem]">
        <Link to="/club/events" className="text-muted hover:underline">
          ← Club events
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{e.title}</h1>
            <StatusPill status={e.status} label={e.status_label} />
          </div>
          <p className="mt-1.5 text-muted">
            {e.club_name} · {e.kind} · {e.venue_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {propose && (e.status === 'draft' || e.status === 'returned') ? (
            <SubmitButton event={e} />
          ) : null}
          {operate && e.status === 'published' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={goLive.isPending}
              onClick={() => goLive.mutate()}
            >
              Go live
            </button>
          ) : null}
          {operate && (e.status === 'published' || e.status === 'live') ? (
            <Link className="btn" to={`/scan?event=${e.id}`}>
              Scan station
            </Link>
          ) : null}
        </div>
      </div>
      {goLive.error ? <ProblemView error={goLive.error} /> : null}

      <div className="grid gap-3.5 md:grid-cols-2">
        <div className="panel">
          <h3>When and where</h3>
          <p className="mt-1.5">
            {fmtDate(e.starts_at)}, {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)}
          </p>
          <p className="text-muted">{e.venue_name}</p>
          {e.description ? <p className="mt-3 text-[0.95rem]">{e.description}</p> : null}
        </div>
        <div className="panel">
          <h3>Numbers</h3>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-[0.92rem]">
            <dt className="text-muted">Capacity</dt>
            <dd>{e.capacity}</dd>
            <dt className="text-muted">Expected</dt>
            <dd>{e.expected_attendance}</dd>
            <dt className="text-muted">Registered</dt>
            <dd>{e.registered}</dd>
            <dt className="text-muted">Attended</dt>
            <dd>{e.attended}</dd>
          </dl>
          {e.budget ? (
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <strong>Budget</strong>
                <Pill>{e.budget.stage_label}</Pill>
              </div>
              <p className="mt-1 text-[0.9rem] text-muted">
                Requested {inr(e.budget.total_requested)} · sanctioned{' '}
                {inr(e.budget.total_sanctioned)} · spent {inr(e.budget.total_spent)}
              </p>
              <Link className="btn mt-2 text-[0.85rem]" to={`/club/budget/${e.budget.id}`}>
                Open budget
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <section className="panel mt-3.5" aria-label="Approval trail">
        <h3>Approval trail</h3>
        <ApprovalTrail eventId={e.id} />
      </section>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <ClashPanel eventId={e.id} />
        {operate && e.status === 'live' ? (
          <section className="panel" aria-label="Close event">
            <h3>Close the event</h3>
            <p className="mt-1.5 text-[0.9rem] text-muted">
              Record the evidence. Attendance is taken from the scan station.
            </p>
            <CloseForm event={e} />
          </section>
        ) : null}
        {propose && deletable ? (
          <section className="panel" aria-label="Delete proposal">
            <h3>Delete this proposal</h3>
            <p className="mt-1.5 text-[0.9rem] text-muted">
              Only drafts, returned and rejected proposals can be deleted.
            </p>
            {!confirmDelete ? (
              <button
                type="button"
                className="btn btn-danger mt-3"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            ) : (
              <span className="mt-3 flex flex-wrap items-center gap-2 text-[0.9rem]">
                Delete it for good?
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Yes, delete
                </button>
                <button
                  type="button"
                  className="btn btn-quiet"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep it
                </button>
              </span>
            )}
            {remove.error ? <ProblemView error={remove.error} /> : null}
          </section>
        ) : null}
      </div>
    </article>
  );
}
