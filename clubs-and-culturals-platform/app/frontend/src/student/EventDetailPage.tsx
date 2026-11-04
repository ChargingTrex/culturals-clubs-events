import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { EventOut } from '../shared/api/types';
import { Button, ClubIcon, Icon, PosterArt, Stat, accentFor, buttonClass } from '../shared/ds';
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

  const accent = accentFor(e.club_name);

  return (
    <article>
      <p className="mb-3 text-body-md">
        <Link to="/events" className="inline-flex items-center gap-1 text-primary hover:underline">
          <Icon name="chevron-left" size={16} /> What&apos;s on
        </Link>
      </p>
      <div className="mb-5 flex items-start gap-4">
        <ClubIcon name={e.club_name} accent={accent} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{e.title}</h1>
            <StatusPill status={e.status} label={e.status_label} />
          </div>
          <p className="mt-1.5 text-ink-muted">
            {e.club_name} · {e.venue_name}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-xl shadow-elevation-1" aria-hidden="true">
            <PosterArt
              headline={e.club_name}
              kicker="Presents"
              sub={`${fmtDate(e.starts_at)} · ${fmtTime(e.starts_at)}`}
              accent={accent}
              ratio="21 / 9"
              headlineClassName="headline"
            />
          </div>
          <div className="panel">
            <h3>When and where</h3>
            <p className="mt-2 flex items-center gap-2">
              <Icon name="clock" size={18} className="text-ink-muted" />
              {fmtDate(e.starts_at)}, {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-ink-muted">
              <Icon name="pin" size={18} />
              {e.venue_name}
            </p>
            {e.description ? <p className="mt-3 text-body-lg">{e.description}</p> : null}
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <div className="grid grid-cols-2 gap-3.5">
            <Stat label="Places taken" value={`${e.registered}/${e.capacity}`} />
            <Stat label="Left" value={full ? 'Full' : left} tone={full ? 'danger' : undefined} />
          </div>
          <div className="panel">
            <h3>Capacity</h3>
            <div className="meter mt-2.5">
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-body-md text-ink-muted" data-testid="capacity">
              {e.registered} of {e.capacity} places taken ·{' '}
              {full ? <Pill tone="bad">Full</Pill> : `${left} left`}
            </p>
          </div>

          <section className="panel" aria-label="Your registration">
            {mine ? (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3>You are {mine.waitlisted ? 'on the waitlist' : 'registered'}</h3>
                  {mine.waitlisted ? (
                    <Pill tone="warn">Waitlisted</Pill>
                  ) : mine.attended ? (
                    <Pill tone="ok">Checked in</Pill>
                  ) : (
                    <Pill tone="info">Pass ready</Pill>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <Link className={buttonClass('filled')} to="/passes">
                    View pass
                  </Link>
                  {!confirmCancel ? (
                    <Button
                      variant="text"
                      disabled={mine.attended || cancel.isPending}
                      title={mine.attended ? 'Already checked in' : undefined}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel registration
                    </Button>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2 text-body-md">
                      Cancel it? Your pass stops working immediately.
                      <Button variant="danger" onClick={doCancel} disabled={cancel.isPending}>
                        Yes, cancel
                      </Button>
                      <Button variant="text" onClick={() => setConfirmCancel(false)}>
                        Keep it
                      </Button>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3>Register</h3>
                <p className="mt-1.5 text-body-md text-ink-muted">
                  {!open
                    ? 'Registration is not open for this event.'
                    : full
                      ? 'This event looks full. The server has the final word — you can still try.'
                      : 'One tap. Your pass appears under My passes.'}
                </p>
                <Button
                  block
                  size="lg"
                  className="mt-3"
                  disabled={!open || register.isPending}
                  onClick={doRegister}
                >
                  {register.isPending ? 'Registering…' : open ? 'Register' : 'Not open'}
                </Button>
              </>
            )}
            {actionError ? <ProblemView error={actionError} /> : null}
          </section>
        </div>
      </div>
    </article>
  );
}
