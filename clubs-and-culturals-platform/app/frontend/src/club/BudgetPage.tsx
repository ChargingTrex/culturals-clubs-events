import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import type { Page } from '../shared/api/types';
import { BudgetSheet, Chip, accentFor, buttonClass, ClubIcon, cx, formatINR } from '../shared/ds';
import { fmtDate, inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { clubApi, type Budget, type Envelope } from './api';
import { BUDGETS_KEY, STAGE_TONE, useEventIndex } from './budgetShared';
import { useMyClubs } from './useMyClubs';

/**
 * A club's yearly envelope as a design-system budget card: what is left in
 * words, a meter that turns amber at 85 % and red over 100 %, and the
 * sanctioned and settled figures under it.
 */
export function EnvelopeMeter({
  envelope,
  title,
  clubName,
}: {
  envelope: Envelope | Budget['envelope'];
  title?: string;
  clubName?: string;
}) {
  if (!envelope) return null;
  const amount = envelope.amount === null ? null : Number(envelope.amount);
  const used = Number(envelope.sanctioned_to_date);
  const ratio = amount ? used / amount : 0;
  const over = amount !== null && used > amount;
  const near = !over && ratio >= 0.85;
  const name = title ?? `${envelope.year} envelope`;
  return (
    <section className="cc-card cc-budget" data-testid="envelope">
      <div className="cc-budget-head">
        {clubName ? <ClubIcon name={name} accent={accentFor(clubName)} size="md" /> : null}
        <div className="cc-budget-titles">
          <h3 className="title-md">{name}</h3>
          <p className="caption">
            {amount === null
              ? 'No envelope set'
              : `${inr(envelope.remaining)} left of ${inr(amount)}`}
          </p>
        </div>
        {amount === null ? null : over ? (
          <Chip tone="rejected" icon="alert">
            Over by {formatINR(used - amount)}
          </Chip>
        ) : near ? (
          <Chip tone="pending" icon="alert">
            {Math.round(ratio * 100)}% used
          </Chip>
        ) : (
          <Chip tone="approved" icon="check">
            Within envelope
          </Chip>
        )}
      </div>
      {amount !== null ? (
        <div
          className={cx('cc-progress', near && 'cc-progress--near', over && 'cc-progress--over')}
          role="progressbar"
          aria-label="Envelope used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, ratio) * 100)}
        >
          <span
            className="cc-progress-seg cc-progress-seg--spent"
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      ) : null}
      <div className="cc-budget-legend caption">
        <span>
          <i className="cc-swatch cc-swatch--spent" />
          Sanctioned <b className="cc-num">{inr(envelope.sanctioned_to_date)}</b>
        </span>
        <span>
          <i className="cc-swatch cc-swatch--left" />
          Settled <b className="cc-num">{inr(envelope.settled_to_date)}</b>
        </span>
      </div>
    </section>
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
        <p className="mt-1.5 max-w-[62ch] text-ink-muted">
          Price each event line by line before it goes for approval; after the event, enter what was
          spent, attach receipts and settle.
        </p>
      </div>

      {clubs.length > 0 ? (
        <div className="mb-5 grid gap-3.5 md:grid-cols-2 lg:gap-5">
          {envelopes.map((q, i) =>
            q.isPending ? (
              <Loading key={clubs[i]?.id ?? i} />
            ) : q.error ? (
              <ProblemView key={clubs[i]?.id ?? i} error={q.error} />
            ) : (
              <EnvelopeMeter
                key={clubs[i]?.id ?? i}
                envelope={q.data}
                clubName={clubs[i]?.name}
                title={`${clubs[i]?.name ?? 'Club'} · ${q.data.year} envelope`}
              />
            ),
          )}
        </div>
      ) : null}

      {budgets.isPending ? (
        <Loading />
      ) : budgets.error ? (
        <ProblemView error={budgets.error} />
      ) : rows.length === 0 ? (
        <Empty>No budgets yet. Each proposed event gets one.</Empty>
      ) : (
        <BudgetSheet
          title="Event budgets"
          subtitle={`${rows.length} budget${rows.length === 1 ? '' : 's'}, newest event first`}
          columns={[
            { key: 'event', label: 'Event', wrap: true },
            { key: 'stage', label: 'Stage' },
            { key: 'lines', label: 'Lines', type: 'number' },
            { key: 'requested', label: 'Requested', type: 'money' },
            { key: 'sanctioned', label: 'Sanctioned', type: 'money' },
            { key: 'spent', label: 'Spent', type: 'money' },
            { key: 'action', label: <span className="cc-sr">Action</span>, align: 'right' },
          ]}
          rows={rows.map((b) => {
            const ev = b.event ? events.get(b.event) : undefined;
            return {
              id: b.id,
              cells: {
                event: (
                  <div className="py-2" data-testid="budget-row">
                    <Link to={`/club/budget/${b.id}`} className="title-sm text-ink hover:underline">
                      {ev?.title ?? 'Event budget'}
                    </Link>
                    <span className="block caption text-ink-muted">
                      {ev ? `${ev.club_name} · ${fmtDate(ev.starts_at)}` : ''}
                    </span>
                  </div>
                ),
                stage: (
                  <span className="flex flex-wrap gap-1.5">
                    <Pill tone={STAGE_TONE[b.stage ?? 'draft']}>{b.stage_label}</Pill>
                    {b.nil_declaration ? <Pill>No budget required</Pill> : null}
                    {b.can_settle ? <Pill tone="info">Settlement due</Pill> : null}
                  </span>
                ),
                lines: b.lines.length,
                requested: Number(b.total_requested),
                sanctioned: Number(b.total_sanctioned) > 0 ? Number(b.total_sanctioned) : '',
                spent: Number(b.total_spent) > 0 ? Number(b.total_spent) : '',
                action: (
                  <Link
                    className={buttonClass(
                      b.is_editable || b.can_settle ? 'filled' : 'outlined',
                      'sm',
                    )}
                    to={`/club/budget/${b.id}`}
                  >
                    {b.is_editable ? 'Price it' : b.can_settle ? 'Settle' : 'Open'}
                  </Link>
                ),
              },
            };
          })}
        />
      )}
    </>
  );
}
