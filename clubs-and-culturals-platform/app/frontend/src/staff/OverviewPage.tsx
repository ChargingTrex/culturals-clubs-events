import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { STAFF_KEYS, STAGE_LABEL, ageLabel, pct, staffApi, type DeanOverview } from './api';

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'bad' | 'ok';
}) {
  return (
    <div className="panel !p-4" data-testid="tile">
      <span className="text-[0.75rem] font-semibold tracking-[0.04em] text-muted uppercase">
        {label}
      </span>
      <b
        className={`block font-display text-[1.9rem] leading-tight ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : ''}`}
      >
        {value}
      </b>
      {hint ? <span className="text-[0.82rem] text-muted">{hint}</span> : null}
    </div>
  );
}

function Rate({ label, rate, help }: { label: string; rate: number | null; help: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-[0.92rem]">{label}</strong>
        <span className="font-display text-[1.2rem] font-bold">{pct(rate)}</span>
      </div>
      <div className="meter mt-1.5">
        <i style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
      </div>
      <p className="mt-1 text-[0.8rem] text-muted">{help}</p>
    </div>
  );
}

function ChaseList({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: string; title: string; club: string; extra?: string }[];
  empty: string;
}) {
  return (
    <section className="panel">
      <h3>
        {title} <span className="font-normal text-muted">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[0.9rem] text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 flex list-none flex-col gap-1.5 p-0 text-[0.92rem]">
          {items.slice(0, 8).map((i) => (
            <li key={i.id}>
              <strong>{i.title}</strong> <span className="text-muted">· {i.club}</span>
              {i.extra ? <span className="text-muted"> · {i.extra}</span> : null}
            </li>
          ))}
          {items.length > 8 ? <li className="text-muted">and {items.length - 8} more</li> : null}
        </ul>
      )}
    </section>
  );
}

export function OverviewPage() {
  const overview = useQuery<DeanOverview, ApiError>({
    queryKey: STAFF_KEYS.overview,
    queryFn: () => staffApi.overview(),
  });

  if (overview.isPending) return <Loading />;
  if (overview.error) return <ProblemView error={overview.error} />;
  const o = overview.data;
  const maxUse = Math.max(1, ...o.venue_use.map((v) => v.bookings));
  const byStage = Object.entries(o.pending_by_stage)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${STAGE_LABEL[s as keyof typeof STAGE_LABEL] ?? s} ${n}`)
    .join(' · ');

  return (
    <>
      <div className="mb-5">
        <h1>This semester</h1>
        <p className="mt-1.5 text-muted">{o.semester} — running totals and what needs chasing.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Pending approvals" value={o.pending_approvals} hint={byStage || 'None'} />
        <Tile
          label="Past SLA"
          value={o.escalated_approvals.length}
          tone={o.escalated_approvals.length ? 'bad' : 'ok'}
          hint="waiting too long at a gate"
        />
        <Tile
          label="Venue clashes"
          value={o.venue_clashes}
          tone={o.venue_clashes ? 'bad' : 'ok'}
          hint={<Link to="/staff/venues">Open calendar</Link>}
        />
        <Tile
          label="Active clubs"
          value={`${o.clubs_active}/${o.clubs_total}`}
          hint={`${o.dormant_clubs} dormant`}
        />
      </div>

      <section className="panel mt-3.5">
        <h3>Attendance capture</h3>
        <div className="mt-3 grid gap-5 md:grid-cols-2">
          <Rate
            label="Scan success"
            rate={o.capture.scan_success_rate}
            help={`${o.capture.scans_accepted} of ${o.capture.scan_attempts} door scans accepted`}
          />
          <Rate
            label="Scan capture"
            rate={o.capture.scan_capture_rate}
            help={`${o.capture.attended_by_scan} of ${o.capture.attended} attendances recorded by a scan, not by hand`}
          />
        </div>
      </section>

      {o.escalated_approvals.length > 0 ? (
        <section className="panel mt-3.5">
          <h3>Waiting past the SLA</h3>
          <ul className="mt-2 flex list-none flex-col gap-1.5 p-0 text-[0.92rem]">
            {o.escalated_approvals.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <Link to={`/staff/approvals/${e.id}`} className="font-semibold hover:underline">
                  {e.event_title}
                </Link>
                <span className="text-muted">· {e.club}</span>
                <Pill tone="bad">
                  {STAGE_LABEL[e.stage as keyof typeof STAGE_LABEL] ?? e.stage} ·{' '}
                  {ageLabel(e.age_hours)}
                </Pill>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-3">
        <ChaseList
          title="Missing evidence"
          items={o.missing_evidence.map((m) => ({ ...m, extra: m.missing.join(', ') }))}
          empty="Every completed event has its report."
        />
        <ChaseList
          title="No photos"
          items={o.events_missing_photos}
          empty="Every event has photos."
        />
        <ChaseList
          title="No social links"
          items={o.events_missing_social_links}
          empty="Every event has a post."
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <section className="panel">
          <h3>Venue use</h3>
          {o.venue_use.length === 0 ? (
            <p className="mt-2 text-[0.9rem] text-muted">No bookings yet.</p>
          ) : (
            <ul className="mt-2.5 flex list-none flex-col gap-2 p-0 text-[0.9rem]">
              {o.venue_use.map((v) => (
                <li
                  key={v.venue__name}
                  className="grid grid-cols-[1fr_2fr_auto] items-center gap-3"
                >
                  <span className="truncate">{v.venue__name}</span>
                  <span className="meter">
                    <i style={{ width: `${(v.bookings / maxUse) * 100}%` }} />
                  </span>
                  <b>{v.bookings}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>
            Inactive clubs{' '}
            <span className="font-normal text-muted">({o.clubs_inactive.length})</span>
          </h3>
          {o.clubs_inactive.length === 0 ? (
            <p className="mt-2 text-[0.9rem] text-muted">Every club has run something.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {o.clubs_inactive.map((c) => (
                <Pill key={c}>{c}</Pill>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
