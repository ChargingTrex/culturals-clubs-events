import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { EventOut } from '../shared/api/types';
import { fmtDate, fmtTime } from '../shared/format';
import { Loading } from '../shared/ui/Empty';
import { Pill, StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { eventKey, useRegistration } from './useRegistration';

const OPEN_STATUSES = new Set(['published', 'live']);

export function EventDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const event = useQuery<EventOut, ApiError>({
    queryKey: eventKey(id),
    queryFn: () => api.events.get(id),
    enabled: id !== '',
  });
  const { register, cancel } = useRegistration(id);

  if (event.isPending) return <Loading />;
  if (event.error) return <ProblemView error={event.error} />;

  const e = event.data;
  const mine = e.my_registration;
  const open = OPEN_STATUSES.has(e.status);
  const full = e.registered >= e.capacity;
  const left = Math.max(0, e.capacity - e.registered);
  const pct = e.capacity > 0 ? Math.min(100, (e.registered / e.capacity) * 100) : 100;
  const actionError = register.error ?? cancel.error;

  const doRegister = () =>
    register.mutate(undefined, {
      onSuccess: () => toast.show('Registered — your pass is ready'),
    });

  const doCancel = () => {
    if (!mine) return;
    cancel.mutate(mine.id, {
      onSuccess: () => {
        setConfirmCancel(false);
        toast.show('Registration cancelled');
      },
    });
  };

  return (
    <article>
      <p className="mb-3 text-[0.875rem]">
        <Link to="/events" className="text-muted hover:underline">
          ← What&apos;s on
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{e.title}</h1>
            <StatusPill status={e.status} label={e.status_label} />
          </div>
          <p className="mt-1.5 text-muted">
            {e.club_name} · {e.venue_name}
          </p>
        </div>
      </div>

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
          <h3>Capacity</h3>
          <div className="meter mt-2.5">
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[0.875rem] text-muted" data-testid="capacity">
            {e.registered} of {e.capacity} places taken ·{' '}
            {full ? <Pill tone="bad">Full</Pill> : `${left} left`}
          </p>
        </div>
      </div>

      <section className="panel mt-3.5" aria-label="Your registration">
        {mine ? (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3>You are {mine.waitlisted ? 'on the waitlist' : 'registered'}</h3>
              {mine.waitlisted ? (
                <Pill tone="warn">Waitlisted</Pill>
              ) : mine.attended ? (
                <Pill tone="ok">Checked in</Pill>
              ) : (
                <Pill tone="gold">Pass ready</Pill>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Link className="btn btn-primary" to="/passes">
                View pass
              </Link>
              {!confirmCancel ? (
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={mine.attended || cancel.isPending}
                  title={mine.attended ? 'Already checked in' : undefined}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel registration
                </button>
              ) : (
                <span className="flex flex-wrap items-center gap-2 text-[0.9rem]">
                  Cancel it? Your pass stops working immediately.
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={doCancel}
                    disabled={cancel.isPending}
                  >
                    Yes, cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Keep it
                  </button>
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <h3>Register</h3>
            <p className="mt-1.5 text-[0.9rem] text-muted">
              {!open
                ? 'Registration is not open for this event.'
                : full
                  ? 'This event looks full. The server has the final word — you can still try.'
                  : 'One tap. Your pass appears under My passes.'}
            </p>
            <button
              type="button"
              className="btn btn-primary mt-3"
              disabled={!open || register.isPending}
              onClick={doRegister}
            >
              {register.isPending ? 'Registering…' : open ? 'Register' : 'Not open'}
            </button>
          </>
        )}
        {actionError ? <ProblemView error={actionError} /> : null}
      </section>
    </article>
  );
}
