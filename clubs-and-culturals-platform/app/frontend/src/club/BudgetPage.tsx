import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import type { Page } from '../shared/api/types';
import { fmtDate, inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { clubApi, type Budget, type Envelope } from './api';
import { BUDGETS_KEY, STAGE_TONE, useEventIndex } from './budgetShared';
import { useMyClubs } from './useMyClubs';

export function EnvelopeMeter({
  envelope,
  title,
}: {
  envelope: Envelope | Budget['envelope'];
  title?: string;
}) {
  if (!envelope) return null;
  const amount = envelope.amount === null ? null : Number(envelope.amount);
  const used = Number(envelope.sanctioned_to_date);
  const pct = amount ? Math.min(100, (used / amount) * 100) : 0;
  return (
    <div data-testid="envelope">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-[0.95rem]">{title ?? `${envelope.year} envelope`}</strong>
        <span className="text-[0.85rem] text-muted">
          {amount === null
            ? 'No envelope set'
            : `${inr(envelope.remaining)} left of ${inr(amount)}`}
        </span>
      </div>
      {amount !== null ? (
        <div className={`meter mt-2 ${pct > 90 ? '[&>i]:bg-bad' : ''}`}>
          <i style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="mt-1 text-[0.8rem] text-muted">
        Sanctioned {inr(envelope.sanctioned_to_date)} · settled {inr(envelope.settled_to_date)}
      </p>
    </div>
  );
}

export function BudgetPage() {
  const { clubs } = useMyClubs('clubs_with_budget_access');
  const events = useEventIndex();
  const budgets = useQuery<Page<Budget>, ApiError>({
    queryKey: BUDGETS_KEY,
    queryFn: () => clubApi.budget.list(),
  });
  const envelopes = useQueries({
    queries: clubs.map((c) => ({
      queryKey: ['budget', 'envelope', c.id],
      queryFn: () => clubApi.budget.envelope(c.id),
    })),
  });

  const rows = [...(budgets.data?.results ?? [])].sort((a, b) => {
    const ea = a.event ? events.get(a.event)?.starts_at : undefined;
    const eb = b.event ? events.get(b.event)?.starts_at : undefined;
    return (eb ?? '').localeCompare(ea ?? '');
  });

  return (
    <>
      <div className="mb-5">
        <h1>Budget</h1>
        <p className="mt-1.5 max-w-[62ch] text-muted">
          Price each event line by line before it goes for approval; after the event, enter what was
          spent, attach receipts and settle.
        </p>
      </div>

      {clubs.length > 0 ? (
        <div className="mb-5 grid gap-3.5 md:grid-cols-2">
          {envelopes.map((q, i) => (
            <div key={clubs[i]?.id ?? i} className="panel">
              {q.isPending ? (
                <Loading />
              ) : q.error ? (
                <ProblemView error={q.error} />
              ) : (
                <EnvelopeMeter
                  envelope={q.data}
                  title={`${clubs[i]?.name ?? 'Club'} · ${q.data.year} envelope`}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {budgets.isPending ? (
        <Loading />
      ) : budgets.error ? (
        <ProblemView error={budgets.error} />
      ) : rows.length === 0 ? (
        <Empty>No budgets yet. Each proposed event gets one.</Empty>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {rows.map((b) => {
            const ev = b.event ? events.get(b.event) : undefined;
            return (
              <li
                key={b.id}
                data-testid="budget-row"
                className="grid gap-3 border-b border-line py-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3>
                      <Link to={`/club/budget/${b.id}`} className="hover:underline">
                        {ev?.title ?? 'Event budget'}
                      </Link>
                    </h3>
                    <Pill tone={STAGE_TONE[b.stage ?? 'draft']}>{b.stage_label}</Pill>
                    {b.nil_declaration ? <Pill>No budget required</Pill> : null}
                    {b.can_settle ? <Pill tone="gold">Settlement due</Pill> : null}
                  </div>
                  <p className="text-[0.875rem] text-muted">
                    {ev ? `${ev.club_name} · ${fmtDate(ev.starts_at)} · ` : ''}
                    {b.lines.length} line{b.lines.length === 1 ? '' : 's'} · requested{' '}
                    {inr(b.total_requested)}
                    {Number(b.total_sanctioned) > 0
                      ? ` · sanctioned ${inr(b.total_sanctioned)}`
                      : ''}
                    {Number(b.total_spent) > 0 ? ` · spent ${inr(b.total_spent)}` : ''}
                  </p>
                </div>
                <Link className="btn text-[0.85rem]" to={`/club/budget/${b.id}`}>
                  {b.is_editable ? 'Price it' : b.can_settle ? 'Settle' : 'Open'}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
