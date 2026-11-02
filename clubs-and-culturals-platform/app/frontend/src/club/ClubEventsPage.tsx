import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import type { EventOut, Page } from '../shared/api/types';
import { fmtDate, fmtTime, inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill, StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { clubApi, type SubmitOut } from './api';
import { ClubPicker } from './ClubPicker';
import { useMyClubs, useSelectedClub } from './useMyClubs';

const CLUB_EVENTS_KEY = ['events', 'club'] as const;

const SUBMITTABLE = new Set(['draft', 'returned']);

export function SubmitButton({ event, compact }: { event: EventOut; compact?: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const submit = useMutation<SubmitOut, ApiError>({
    mutationFn: () => clubApi.events.submit(event.id),
    onSuccess: (out) => {
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      const stages = out.stages.length;
      toast.show(
        `Sent for approval — ${stages} gate${stages === 1 ? '' : 's'}${out.requires_vc ? ', including the Vice-Chancellor' : ''}`,
      );
    },
  });
  return (
    <>
      <button
        type="button"
        className={`btn btn-primary ${compact ? 'text-[0.85rem]' : ''}`}
        disabled={submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? 'Sending…' : 'Send for approval'}
      </button>
      {submit.error ? (
        <div className="basis-full">
          <ProblemView error={submit.error} />
        </div>
      ) : null}
    </>
  );
}

function ClubEventRow({ event }: { event: EventOut }) {
  return (
    <li
      data-testid="club-event-row"
      className="grid gap-3 border-b border-line py-4 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3>
            <Link to={`/club/events/${event.id}`} className="hover:underline">
              {event.title}
            </Link>
          </h3>
          <StatusPill status={event.status} label={event.status_label} />
          {event.budget ? <Pill>{event.budget.stage_label}</Pill> : null}
        </div>
        <p className="text-[0.875rem] text-muted">
          {fmtDate(event.starts_at)} · {fmtTime(event.starts_at)}–{fmtTime(event.ends_at)} ·{' '}
          {event.venue_name}
        </p>
        <p className="text-[0.875rem] text-muted">
          {event.registered} registered of {event.capacity}
          {event.status === 'completed' || event.status === 'reported'
            ? ` · ${event.attended} attended`
            : ''}
          {event.budget ? ` · requested ${inr(event.budget.total_requested)}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {SUBMITTABLE.has(event.status) ? <SubmitButton event={event} compact /> : null}
        <Link className="btn text-[0.85rem]" to={`/club/events/${event.id}`}>
          Open
        </Link>
      </div>
    </li>
  );
}

export function ClubEventsPage() {
  const { clubs, isPending, error, capabilities } = useMyClubs('clubs');
  const { selected, select } = useSelectedClub(clubs);
  const events = useQuery<Page<EventOut>, ApiError>({
    queryKey: [...CLUB_EVENTS_KEY, selected?.id ?? 'all'],
    queryFn: () => clubApi.events.list(selected?.id),
    enabled: !isPending,
  });
  const canPropose = (capabilities?.clubs_can_propose.length ?? 0) > 0;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Club events</h1>
          <p className="mt-1.5 max-w-[62ch] text-muted">
            Every event {selected ? selected.name : 'your club'} has proposed — drafts, those with
            approvers, and those already run.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <ClubPicker clubs={clubs} value={selected?.id} onChange={select} />
          {canPropose ? (
            <Link className="btn btn-primary" to="/club/events/new">
              New event
            </Link>
          ) : null}
        </div>
      </div>

      {error ? <ProblemView error={error} /> : null}
      {events.isPending ? (
        <Loading />
      ) : events.error ? (
        <ProblemView error={events.error} />
      ) : events.data.results.length === 0 ? (
        <Empty
          action={
            canPropose ? (
              <Link className="btn btn-primary" to="/club/events/new">
                Propose the first one
              </Link>
            ) : undefined
          }
        >
          No events yet.
        </Empty>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {events.data.results.map((e) => (
            <ClubEventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </>
  );
}
