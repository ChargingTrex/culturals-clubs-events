import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { EventOut, Page } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import { STAGE_ROLE, flowSteps } from '../shared/approvals';
import {
  ApprovalFlow,
  BudgetSummary,
  Button,
  Card,
  ClubIcon,
  Icon,
  RevisionTimeline,
  Stat,
  accentFor,
  buttonClass,
} from '../shared/ds';
import { fmtDate, fmtTime, inr, roleLabel } from '../shared/format';
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
    return <p className="mt-1.5 text-body-md text-ink-muted">Not sent for approval yet.</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-5 p-0">
      {mine.map((req) => (
        <li key={req.id} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill
              tone={
                req.state === 'approved'
                  ? 'ok'
                  : req.state === 'pending'
                    ? 'info'
                    : req.state === 'returned'
                      ? 'warn'
                      : 'bad'
              }
            >
              {req.state === 'pending' ? `With ${req.stage_label}` : req.state}
            </Pill>
            {req.requires_vc ? <Pill tone="warn">Needs the Vice-Chancellor</Pill> : null}
            {req.escalated ? <Pill tone="bad">Past SLA</Pill> : null}
            <span className="caption text-ink-muted">Sent {fmtDate(req.created_at)}</span>
          </div>
          {req.vc_reason ? <p className="text-body-md text-ink-muted">{req.vc_reason}</p> : null}
          <div className="overflow-x-auto rounded-md bg-surface-sunken px-3 py-4">
            <ApprovalFlow steps={flowSteps(req)} className="min-w-[560px]" />
          </div>
          {req.steps.length > 0 ? (
            <RevisionTimeline
              items={req.steps.map((st) => {
                const d = DECISION[st.decision] ?? { label: st.decision, tone: 'plain' as const };
                return {
                  role: STAGE_ROLE[st.stage],
                  name: st.actor_label,
                  roleLabel:
                    roleLabel(st.actor_role) +
                    (st.on_behalf_of_label ? ` for ${st.on_behalf_of_label}` : ''),
                  at: fmtDate(st.created_at),
                  tags: <Pill tone={d.tone}>{d.label}</Pill>,
                  action:
                    st.stage_label +
                    (Number(st.amount_sanctioned) > 0
                      ? ` · sanctioned ${inr(st.amount_sanctioned)}`
                      : ''),
                  comment: st.comment || undefined,
                };
              })}
            />
          ) : (
            <p className="text-body-md text-ink-muted">No decision yet.</p>
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
      <h3 className="flex items-center gap-2">
        <Icon name="calendar" /> Clash check
      </h3>
      {!asked ? (
        <>
          <p className="mt-1.5 text-body-md text-ink-muted">
            Other events at the same time, and venues that are free in this slot.
          </p>
          <Button variant="tonal" icon="search" className="mt-3" onClick={() => setAsked(true)}>
            Check clashes
          </Button>
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
            <ul className="mt-2 list-disc pl-5 text-body-md">
              {clashes.data.clashes.map((c) => (
                <li key={c.id}>
                  {c.title} ({c.club}) · {fmtTime(c.starts_at)}–{fmtTime(c.ends_at)} ·{' '}
                  {c.expected_attendance} expected
                </li>
              ))}
            </ul>
          )}
          {clashes.data.free_venues.length > 0 ? (
            <p className="mt-2 text-body-md text-ink-muted">
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
      <Button type="submit" disabled={close.isPending}>
        Close event
      </Button>
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
      <p className="mb-3 text-body-md">
        <Link
          to="/club/events"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Icon name="chevron-left" size={16} /> Club events
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          <ClubIcon name={e.club_name} accent={accentFor(e.club_name)} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1>{e.title}</h1>
              <StatusPill status={e.status} label={e.status_label} />
            </div>
            <p className="mt-1.5 text-ink-muted">
              {e.club_name} · {e.kind} · {e.venue_name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {propose && (e.status === 'draft' || e.status === 'returned') ? (
            <SubmitButton event={e} />
          ) : null}
          {operate && e.status === 'published' ? (
            <Button icon="flash" disabled={goLive.isPending} onClick={() => goLive.mutate()}>
              Go live
            </Button>
          ) : null}
          {operate && (e.status === 'published' || e.status === 'live') ? (
            <Link className={buttonClass('outlined')} to={`/scan?event=${e.id}`}>
              Scan station
            </Link>
          ) : null}
        </div>
      </div>
      {goLive.error ? <ProblemView error={goLive.error} /> : null}

      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-4 lg:gap-5">
        <Stat label="Capacity" value={e.capacity} />
        <Stat label="Expected" value={e.expected_attendance} />
        <Stat label="Registered" value={e.registered} />
        <Stat label="Attended" value={e.attended} tone={e.attended > 0 ? 'success' : undefined} />
      </div>

      <div className="grid gap-3.5 md:grid-cols-2 lg:gap-5">
        <Card title="When and where">
          <p className="flex items-center gap-2">
            <Icon name="clock" size={18} className="text-ink-muted" />
            {fmtDate(e.starts_at)}, {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-ink-muted">
            <Icon name="pin" size={18} />
            {e.venue_name}
          </p>
          {e.description ? <p className="mt-3 text-body-lg">{e.description}</p> : null}
        </Card>
        {e.budget && Number(e.budget.total_sanctioned) > 0 ? (
          <div className="flex flex-col gap-2">
            <BudgetSummary
              title="Budget"
              subtitle={`${e.budget.stage_label} · requested ${inr(e.budget.total_requested)}`}
              sanctioned={Number(e.budget.total_sanctioned)}
              spent={Number(e.budget.total_spent)}
            />
            <Link
              className={buttonClass('tonal', 'sm', false, 'self-start')}
              to={`/club/budget/${e.budget.id}`}
            >
              Open budget
            </Link>
          </div>
        ) : e.budget ? (
          <Card title="Budget" actions={<Pill>{e.budget.stage_label}</Pill>}>
            <p className="figure-xl cc-num">{inr(e.budget.total_requested)}</p>
            <p className="text-body-md text-ink-muted">requested · not sanctioned yet</p>
            <Link
              className={buttonClass('tonal', 'sm', false, 'mt-3')}
              to={`/club/budget/${e.budget.id}`}
            >
              Open budget
            </Link>
          </Card>
        ) : (
          <Card title="Budget">
            <p className="text-body-md text-ink-muted">No budget for this event.</p>
          </Card>
        )}
      </div>

      <section className="cc-card mt-5 p-5" aria-label="Approval trail">
        <h3 className="title-md mb-4">Approval trail</h3>
        <ApprovalTrail eventId={e.id} />
      </section>

      <div className="mt-5 grid gap-3.5 md:grid-cols-2 lg:gap-5">
        <ClashPanel eventId={e.id} />
        {operate && e.status === 'live' ? (
          <section className="panel" aria-label="Close event">
            <h3>Close the event</h3>
            <p className="mt-1.5 text-body-md text-ink-muted">
              Record the evidence. Attendance is taken from the scan station.
            </p>
            <CloseForm event={e} />
          </section>
        ) : null}
        {propose && deletable ? (
          <section className="panel" aria-label="Delete proposal">
            <h3>Delete this proposal</h3>
            <p className="mt-1.5 text-body-md text-ink-muted">
              Only drafts, returned and rejected proposals can be deleted.
            </p>
            {!confirmDelete ? (
              <Button
                variant="reject"
                icon="x"
                className="mt-3"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : (
              <span className="mt-3 flex flex-wrap items-center gap-2 text-body-md">
                Delete it for good?
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Yes, delete
                </Button>
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
