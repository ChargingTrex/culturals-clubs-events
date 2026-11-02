import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
          <p className="mt-1.5 max-w-[62ch] text-muted">
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2.5 text-[0.92rem] text-muted">
        <StatusPill status={event.status} label={event.status_label} />
        <span>
          {event.club_name} · {event.venue_name} · {fmtTime(event.starts_at)}–
          {fmtTime(event.ends_at)}
        </span>
        <span className="ml-auto font-mono text-[0.78rem]">station {station}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Verdict last={last} />
          {scanError ? <ProblemView error={scanError} /> : null}
          {checkIn.error ? <ProblemView error={checkIn.error} /> : null}

          <section className="panel" aria-label="Camera">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3>Camera</h3>
              {cameraOn ? (
                <button type="button" className="btn" onClick={stopCamera}>
                  Stop camera
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void startCamera()}
                  disabled={!canUseCamera}
                >
                  Start camera
                </button>
              )}
            </div>
            <div
              className={`relative mt-3 overflow-hidden rounded-md bg-ink ${cameraOn ? '' : 'hidden'}`}
            >
              <video
                ref={videoRef}
                className="block aspect-[4/3] w-full object-cover"
                muted
                playsInline
                aria-label="Camera preview"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[18%] rounded-md border-4 border-marigold/80"
              />
              {scan.isPending ? (
                <span className="absolute top-3 left-3 rounded-full bg-paper px-2.5 py-0.5 text-[0.8rem] font-semibold">
                  Checking…
                </span>
              ) : null}
            </div>
            {!canUseCamera ? (
              <p className="note mt-3">
                This browser cannot read QR codes from the camera (Chrome or Edge on Android, and
                Safari 17+, can). Type the code from the pass or look the student up by PRN below.
              </p>
            ) : cameraError ? (
              <p className="note mt-3">{cameraError}</p>
            ) : null}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <form
              className="panel"
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
              <input
                id="scan-code"
                ref={codeInput}
                className="field font-mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                placeholder="Paste or type the code"
              />
              <button
                type="submit"
                className="btn btn-primary mt-3"
                disabled={!code.trim() || scan.isPending}
              >
                Check code
              </button>
            </form>

            <form
              className="panel"
              aria-label="Look up by PRN"
              onSubmit={(e) => {
                e.preventDefault();
                if (prn.trim()) checkIn.mutate(prn.trim());
              }}
            >
              <label className="label" htmlFor="scan-prn">
                No phone? PRN from their ID card
              </label>
              <input
                id="scan-prn"
                className="field font-mono uppercase"
                value={prn}
                onChange={(e) => setPrn(e.target.value)}
                autoComplete="off"
                placeholder="23LA1041"
              />
              <button
                type="submit"
                className="btn mt-3"
                disabled={!prn.trim() || checkIn.isPending}
              >
                Check in by PRN
              </button>
            </form>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <section className="panel" aria-label="At the door">
            <h3>At the door</h3>
            {state.error ? (
              <ProblemView error={state.error} />
            ) : !counters || !capture ? (
              <Loading />
            ) : (
              <>
                <p className="mt-2 font-display text-[2.6rem] leading-none font-extrabold">
                  <span data-testid="checked-in">{counters.checked_in}</span>
                  <span className="text-[1.2rem] font-semibold text-muted">
                    {' '}
                    / {counters.registered} registered
                  </span>
                </p>
                <div className="meter mt-3">
                  <i style={{ width: `${filled}%` }} />
                </div>
                <p className="mt-1.5 text-[0.85rem] text-muted">Capacity {counters.capacity}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-[0.8rem]">
                  <Stat label="Scans" value={capture.attempts} />
                  <Stat label="Duplicates" value={capture.duplicates} />
                  <Stat
                    label="Capture"
                    value={
                      capture.capture_rate === null
                        ? '—'
                        : `${Math.round(capture.capture_rate * 100)}%`
                    }
                  />
                </dl>
              </>
            )}
          </section>

          <section
            className={`panel ${queue.length > 0 ? 'border-warn' : ''}`}
            aria-label="Offline queue"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3>Offline queue</h3>
              <span className={`pill ${queue.length > 0 ? 'pill-warn' : ''}`} data-testid="queue">
                {queue.length} waiting
              </span>
            </div>
            <p className="mt-1.5 text-[0.88rem] text-muted">
              {queue.length > 0
                ? 'These scans have not reached the server. They replay automatically when the connection returns.'
                : 'Nothing waiting. Scans made without a connection collect here.'}
            </p>
            {queue.length > 0 ? (
              <button
                type="button"
                className="btn btn-primary mt-3"
                onClick={syncNow}
                disabled={sync.isPending}
              >
                {sync.isPending ? 'Syncing…' : 'Sync now'}
              </button>
            ) : null}
            {sync.error ? <ProblemView error={sync.error} /> : null}
          </section>

          <section className="panel" aria-label="Recent scans">
            <h3>Recent scans</h3>
            {state.data && state.data.recent.length > 0 ? (
              <ul className="mt-2 grid gap-1.5 text-[0.88rem]">
                {state.data.recent.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {r.who ?? 'Unknown code'}
                      {r.was_offline ? <span className="text-muted"> · offline</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={`pill ${
                          r.result === 'accepted' || r.result === 'spot_registered'
                            ? 'pill-ok'
                            : r.result === 'duplicate'
                              ? 'pill-warn'
                              : 'pill-bad'
                        }`}
                      >
                        {r.result_label}
                      </span>
                      <span className="text-muted">{fmtTime(r.scanned_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[0.88rem] text-muted">No scans yet.</p>
            )}
          </section>
        </div>
      </div>

      <RosterPanel eventId={event.id} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-sm bg-sunk px-2 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-display text-[1.25rem] font-bold">{value}</dd>
    </div>
  );
}
