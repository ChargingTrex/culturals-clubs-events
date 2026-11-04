import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { Capabilities, EventOut, Page } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';
import { fmtDate, fmtTime } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import {
  doorApi,
  rosterKey,
  stationKey,
  type OfflineSync,
  type QueuedScan,
  type ScanOutcome,
  type ScanStation,
} from './api';
import { newQueuedScan, readQueue, stationId, writeQueue } from './queue';
import { Button, Chip, ScanResult, Viewfinder } from '../shared/ds';
import { RosterPanel } from './RosterPanel';
import { cameraSupported, useCameraScanner } from './useCameraScanner';
import { Verdict, type LastScan } from './Verdict';

const OPEN = 'published,live';

/** Events this person may work a door for. The API re-checks on every scan. */
function doorEvents(events: EventOut[], caps: Capabilities): EventOut[] {
  if (caps.can_see_individual_records) return events;
  return events.filter(
    (e) => caps.organiser_events.includes(e.id) || caps.clubs_door_staff.includes(e.club),
  );
}

/** The browser's own view of the connection, kept current by its online/offline events. */
function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

function buzz(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
  } catch {
    // Not every device vibrates.
  }
}

export function ScanPage() {
  const { capabilities } = useCapabilities();
  const [params, setParams] = useSearchParams();

  const events = useQuery<Page<EventOut>, ApiError>({
    queryKey: ['events', 'list', 'door'],
    queryFn: () => api.events.list({ status: OPEN, ordering: 'starts_at' }),
  });

  const mine = useMemo(
    () => (events.data && capabilities ? doorEvents(events.data.results, capabilities) : []),
    [events.data, capabilities],
  );
  const selected = params.get('event') ?? mine[0]?.id ?? '';
  const event = mine.find((e) => e.id === selected) ?? null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Scan station</h1>
          <p className="mt-1.5 max-w-[62ch] text-ink-muted">
            Point the camera at a pass or profile QR. Every code is checked by the server; if the
            network drops, scans are kept on this device and replayed in arrival order.
          </p>
        </div>
        {mine.length > 0 ? (
          <div className="min-w-[240px]">
            <label className="label" htmlFor="door-event">
              Event at this door
            </label>
            <select
              id="door-event"
              className="field"
              value={selected}
              onChange={(e) => setParams({ event: e.target.value }, { replace: true })}
            >
              {mine.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {fmtDate(e.starts_at)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {events.isPending ? (
        <Loading />
      ) : events.error ? (
        <ProblemView error={events.error} />
      ) : !event ? (
        <Empty>
          {params.get('event')
            ? 'That event is not one you can work a door for, or it is not open.'
            : 'No published or live event of yours needs a door right now. Once an event is published it appears here.'}
        </Empty>
      ) : (
        <Station key={event.id} event={event} />
      )}
    </>
  );
}

function Station({ event }: { event: EventOut }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const station = useMemo(() => stationId(), []);
  const [last, setLast] = useState<LastScan | null>(null);
  const [queue, setQueue] = useState<QueuedScan[]>(() => readQueue(event.id));
  const [code, setCode] = useState('');
  const [prn, setPrn] = useState('');
  const codeInput = useRef<HTMLInputElement | null>(null);

  const state = useQuery<ScanStation, ApiError>({
    queryKey: stationKey(event.id),
    queryFn: () => doorApi.station(event.id),
    refetchInterval: 10_000,
  });

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: stationKey(event.id) }),
        queryClient.invalidateQueries({ queryKey: rosterKey(event.id) }),
      ]),
    [queryClient, event.id],
  );

  const enqueue = useCallback(
    (token: string) => {
      setQueue((current) => {
        const next = [...current, newQueuedScan(token)];
        writeQueue(event.id, next);
        return next;
      });
      setLast({ kind: 'queued', token, at: Date.now() });
      buzz(false);
    },
    [event.id],
  );

  const show = useCallback(
    (outcome: ScanOutcome) => {
      setLast({ kind: 'outcome', outcome, at: Date.now() });
      buzz(outcome.accepted);
      void refresh();
    },
    [refresh],
  );

  const scan = useMutation<ScanOutcome, ApiError, string>({
    mutationFn: (token) =>
      doorApi.scan(event.id, { token, station_id: station, scanned_at: new Date().toISOString() }),
    onSuccess: show,
    onError: (err, token) => {
      if (err.code === 'NETWORK_ERROR') enqueue(token);
    },
  });

  const checkIn = useMutation<ScanOutcome, ApiError, string>({
    mutationFn: (value) => doorApi.checkIn(event.id, { prn: value, station_id: station }),
    onSuccess: (outcome) => {
      show(outcome);
      setPrn('');
    },
  });

  const sync = useMutation<OfflineSync, ApiError, QueuedScan[]>({
    mutationFn: (scans) => doorApi.sync(event.id, { station_id: station, scans }),
    onSuccess: (res, sent) => {
      const sentRefs = new Set(sent.map((s) => s.ref));
      setQueue((current) => {
        const next = current.filter((s) => !sentRefs.has(s.ref));
        writeQueue(event.id, next);
        return next;
      });
      toast.show(
        `Synced ${res.synced}: ${res.accepted} checked in, ${res.duplicates} duplicate${res.duplicates === 1 ? '' : 's'}`,
      );
      void refresh();
    },
  });

  const syncNow = useCallback(() => {
    if (queue.length > 0 && !sync.isPending) sync.mutate(queue);
  }, [queue, sync]);

  // Back online → replay without being asked.
  useEffect(() => {
    window.addEventListener('online', syncNow);
    return () => window.removeEventListener('online', syncNow);
  }, [syncNow]);

  const submitToken = useCallback(
    (token: string) => {
      const value = token.trim();
      if (!value) return;
      scan.mutate(value);
    },
    [scan],
  );

  const {
    videoRef,
    state: cameraState,
    error: cameraError,
    start: startCamera,
    stop: stopCamera,
  } = useCameraScanner(submitToken);
  const cameraOn = cameraState === 'on' || cameraState === 'starting';
  const canUseCamera = cameraSupported();

  const counters = state.data?.counters;
  const capture = state.data?.capture;
  const filled =
    counters && counters.registered > 0
      ? Math.min(100, (counters.checked_in / counters.registered) * 100)
      : 0;
  const scanError = scan.error && scan.error.code !== 'NETWORK_ERROR' ? scan.error : null;

  const online = useOnline();

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2.5 text-body-md text-ink-muted">
        <StatusPill status={event.status} label={event.status_label} />
        <span>
          {event.club_name} · {event.venue_name} · {fmtTime(event.starts_at)}–
          {fmtTime(event.ends_at)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!online ? (
            <Chip tone="pending" icon="alert">
              Offline · {queue.length} queued
            </Chip>
          ) : queue.length > 0 ? (
            <Chip tone="pending" icon="upload">
              Online · {queue.length} to sync
            </Chip>
          ) : (
            <Chip tone="approved" live>
              Online
            </Chip>
          )}
          <span className="mono-sm">station {station}</span>
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <Verdict last={last} />
          {scanError ? <ProblemView error={scanError} /> : null}
          {checkIn.error ? <ProblemView error={checkIn.error} /> : null}

          <section className="cc-card flex flex-col gap-4 p-5" aria-label="Camera">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="title-md">Camera</h3>
              {cameraOn ? (
                <Button variant="outlined" size="sm" icon="x" onClick={stopCamera}>
                  Stop camera
                </Button>
              ) : (
                <Button
                  size="sm"
                  icon="qr"
                  onClick={() => void startCamera()}
                  disabled={!canUseCamera}
                >
                  Start camera
                </Button>
              )}
            </div>
            <Viewfinder
              className="aspect-[4/3]"
              scanning={cameraOn}
              hint={
                scan.isPending
                  ? 'Checking…'
                  : cameraOn
                    ? 'Point the camera at a pass'
                    : 'Camera off — enter a code below'
              }
            >
              <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full object-cover ${cameraOn ? '' : 'hidden'}`}
                muted
                playsInline
                aria-label="Camera preview"
              />
            </Viewfinder>
            {!canUseCamera ? (
              <p className="note">
                This browser cannot read QR codes from the camera (Chrome or Edge on Android, and
                Safari 17+, can). Type the code from the pass or look the student up by PRN below.
              </p>
            ) : cameraError ? (
              <p className="note">{cameraError}</p>
            ) : null}

            <div className="grid gap-4 border-t border-line pt-4">
              <form
                aria-label="Enter a code"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitToken(code);
                  setCode('');
                  codeInput.current?.focus();
                }}
              >
                <label className="label" htmlFor="scan-code">
                  Pass code
                </label>
                <div className="flex gap-2">
                  <input
                    id="scan-code"
                    ref={codeInput}
                    className="field mono-md"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    placeholder="Paste or type the code"
                  />
                  <Button type="submit" disabled={!code.trim() || scan.isPending}>
                    Check code
                  </Button>
                </div>
              </form>

              <form
                aria-label="Look up by PRN"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (prn.trim()) checkIn.mutate(prn.trim());
                }}
              >
                <label className="label" htmlFor="scan-prn">
                  No phone? PRN from their ID card
                </label>
                <div className="flex gap-2">
                  <input
                    id="scan-prn"
                    className="field mono-md uppercase"
                    value={prn}
                    onChange={(e) => setPrn(e.target.value)}
                    autoComplete="off"
                    placeholder="23LA1041"
                  />
                  <Button
                    type="submit"
                    variant="tonal"
                    icon="user"
                    disabled={!prn.trim() || checkIn.isPending}
                  >
                    Check in by PRN
                  </Button>
                </div>
              </form>
            </div>
          </section>
        </div>

        <div className="grid content-start gap-5">
          <section className="cc-card cc-att" aria-label="At the door">
            <div className="cc-att-head">
              <div className="cc-att-titles">
                <h3 className="title-md">At the door</h3>
                <div className="caption">{event.title}</div>
              </div>
              <Chip tone="approved" live>
                Live
              </Chip>
            </div>
            {state.error ? (
              <ProblemView error={state.error} />
            ) : !counters || !capture ? (
              <Loading />
            ) : (
              <>
                <dl className="cc-att-stats !grid-cols-2">
                  <div className="cc-att-stat cc-att-stat--in">
                    <dt className="label-md">Checked in</dt>
                    <dd className="figure-xl cc-num">
                      <span data-testid="checked-in">{counters.checked_in}</span>
                    </dd>
                  </div>
                  <div className="cc-att-stat">
                    <dt className="label-md">Registered</dt>
                    <dd className="figure-xl cc-num">{counters.registered}</dd>
                  </div>
                  <div className="cc-att-stat">
                    <dt className="label-md">Capacity</dt>
                    <dd className="figure-xl cc-num">{counters.capacity}</dd>
                  </div>
                  <div className="cc-att-stat">
                    <dt className="label-md">Capture rate</dt>
                    <dd className="figure-xl cc-num">
                      {capture.capture_rate === null
                        ? '—'
                        : `${Math.round(capture.capture_rate * 100)}%`}
                    </dd>
                  </div>
                </dl>
                <div
                  className="cc-progress"
                  role="progressbar"
                  aria-label="Checked in of registered"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(filled)}
                >
                  <span
                    className="cc-progress-seg cc-progress-seg--in"
                    style={{ width: `${filled}%` }}
                  />
                </div>
                <p className="cc-att-foot caption">
                  <b>
                    {capture.attempts} scan{capture.attempts === 1 ? '' : 's'}
                  </b>{' '}
                  · {capture.duplicates} duplicate{capture.duplicates === 1 ? '' : 's'} · failed
                  scans count too — the gap is the capture rate
                </p>
              </>
            )}
          </section>

          <section
            className={`cc-card p-5 ${queue.length > 0 ? '!border-warning' : ''}`}
            aria-label="Offline queue"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="title-md">Offline queue</h3>
              <span data-testid="queue">
                <Chip tone={queue.length > 0 ? 'pending' : 'neutral'} icon="upload">
                  {queue.length} waiting
                </Chip>
              </span>
            </div>
            <p className="mt-1.5 text-body-md text-ink-muted">
              {queue.length > 0
                ? 'These scans have not reached the server. They replay automatically when the connection returns.'
                : 'Nothing waiting. Scans made without a connection collect here.'}
            </p>
            {queue.length > 0 ? (
              <Button className="mt-3" icon="upload" onClick={syncNow} disabled={sync.isPending}>
                {sync.isPending ? 'Syncing…' : 'Sync now'}
              </Button>
            ) : null}
            {sync.error ? <ProblemView error={sync.error} /> : null}
          </section>

          <section className="cc-card p-5" aria-label="Recent scans">
            <h3 className="title-md mb-3">Recent scans</h3>
            {state.data && state.data.recent.length > 0 ? (
              <ul className="cc-att-list">
                {state.data.recent.slice(0, 8).map((r) => (
                  <ScanResult
                    key={r.id}
                    as="li"
                    compact
                    result={r.result}
                    label={r.result_label}
                    who={r.who ?? 'Unknown code'}
                    offline={r.was_offline}
                    at={fmtTime(r.scanned_at)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-body-md text-ink-muted">No scans yet.</p>
            )}
          </section>
        </div>
      </div>

      <RosterPanel eventId={event.id} />
    </div>
  );
}
