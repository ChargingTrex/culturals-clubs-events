import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { useCapabilities } from '../shared/auth/useCapabilities';
import { BudgetSummary, Button, EditTag, Icon, Stat, buttonClass, cx } from '../shared/ds';
import { fmtDate, inr } from '../shared/format';
import { Loading } from '../shared/ui/Empty';
import { Pill, StatusPill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { clubApi, type Budget, type BudgetLine, type Receipt } from './api';
import { EnvelopeMeter } from './BudgetPage';
import { STAGE_TONE, useEventIndex } from './budgetShared';
import { SubmitButton } from './ClubEventsPage';

const budgetKey = (id: string) => ['budget', 'detail', id] as const;

/** One mutation shape for every call that answers with the budget. */
function useBudgetAction<V>(id: string, fn: (v: V) => Promise<Budget>, done?: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<Budget, ApiError, V>({
    mutationFn: fn,
    onSuccess: (budget) => {
      queryClient.setQueryData(budgetKey(id), budget);
      void queryClient.invalidateQueries({ queryKey: ['budget', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['budget', 'envelope'] });
      void queryClient.invalidateQueries({ queryKey: ['events'] });
      if (done) toast.show(done);
    },
  });
}

/** One entry as a sheet row: head, basis, requested, sanctioned (an approver's cut is an edit). */
function LineRow({
  budget,
  line,
  index,
  editable,
}: {
  budget: Budget;
  line: BudgetLine;
  index: number;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [head, setHead] = useState(line.head);
  const [amount, setAmount] = useState(Number(line.amount_requested).toString());
  const edit = useBudgetAction(
    budget.id,
    () => clubApi.budget.editLine(budget.id, line.id, { head, amount_requested: amount }),
    'Entry updated',
  );
  const remove = useBudgetAction(
    budget.id,
    () => clubApi.budget.removeLine(budget.id, line.id),
    'Entry removed',
  );

  if (editing) {
    return (
      <tr>
        <td className="cc-rownum mono-sm">{index + 1}</td>
        <td className="cc-cell--text body-md" colSpan={2}>
          <input
            aria-label="Head"
            className="cc-cell-input"
            value={head}
            onChange={(e) => setHead(e.target.value)}
          />
        </td>
        <td className="cc-cell--money figure-md">
          <input
            aria-label="Amount"
            type="number"
            min={0}
            className="cc-cell-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </td>
        <td className="cc-cell--text body-md" colSpan={2}>
          <span className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              disabled={edit.isPending}
              onClick={() => edit.mutate(undefined, { onSuccess: () => setEditing(false) })}
            >
              Save
            </Button>
            <Button size="sm" variant="text" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </span>
          {edit.error ? <ProblemView error={edit.error} /> : null}
        </td>
      </tr>
    );
  }
  const cut =
    line.amount_sanctioned !== null &&
    Number(line.amount_sanctioned) < Number(line.amount_requested);
  return (
    <tr data-testid="budget-line">
      <td className="cc-rownum mono-sm">{index + 1}</td>
      <td className="cc-cell--text cc-cell--wrap body-md">{line.head}</td>
      <td className="cc-cell--text body-md text-ink-muted">
        {line.basis ? line.basis.replace('_', ' ') : '—'}
      </td>
      <td className="cc-cell--money figure-md">{inr(line.amount_requested)}</td>
      <td
        className={cx('cc-cell--money figure-md', cut && 'cc-cell--edited-admin')}
        title={cut ? `Cut by an approver — was ${inr(line.amount_requested)}` : undefined}
      >
        {line.amount_sanctioned === null ? (
          <span className="text-ink-muted">—</span>
        ) : (
          <>
            {cut ? (
              <>
                <EditTag role="admin" />
                <span className="cc-cell-was">{inr(line.amount_requested)}</span>
              </>
            ) : null}
            {inr(line.amount_sanctioned)}
            {cut ? <span className="cc-sr"> (cut by approver)</span> : null}
          </>
        )}
      </td>
      <td className="cc-cell--text body-md">
        {editable ? (
          <span className="flex items-center justify-end gap-1">
            <Button size="sm" variant="text" icon="edit" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="text"
              className="!text-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              Remove
            </Button>
          </span>
        ) : null}
        {remove.error ? <ProblemView error={remove.error} /> : null}
      </td>
    </tr>
  );
}

function AddLineForm({ budget }: { budget: Budget }) {
  const [head, setHead] = useState('');
  const [amount, setAmount] = useState('');
  const add = useBudgetAction(
    budget.id,
    () => clubApi.budget.addLine(budget.id, { head: head.trim(), amount_requested: amount }),
    'Entry added',
  );
  return (
    <form
      className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-[1fr_160px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(undefined, {
          onSuccess: () => {
            setHead('');
            setAmount('');
          },
        });
      }}
    >
      <div>
        <label className="label" htmlFor="line-head">
          Add an entry
        </label>
        <input
          id="line-head"
          className="field"
          placeholder="e.g. Sound & lighting"
          value={head}
          onChange={(e) => setHead(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="line-amount">
          Amount (₹)
        </label>
        <input
          id="line-amount"
          type="number"
          min={0}
          className="field"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <Button type="submit" icon="plus" disabled={add.isPending || !head.trim() || !amount}>
        Add
      </Button>
      {add.error ? (
        <div className="sm:col-span-3">
          <ProblemView error={add.error} />
        </div>
      ) : null}
    </form>
  );
}

function NilPanel({ budget }: { budget: Budget }) {
  const [reason, setReason] = useState('');
  const declare = useBudgetAction(
    budget.id,
    () => clubApi.budget.declareNil(budget.id, reason.trim()),
    'Declared: no budget required',
  );
  const withdraw = useBudgetAction(
    budget.id,
    () => clubApi.budget.withdrawNil(budget.id),
    'Nil declaration withdrawn',
  );
  if (budget.nil_declaration) {
    const nil = budget.nil_declaration;
    return (
      <div className="note m-4" data-testid="nil-declaration">
        <strong>{nil.head}</strong>
        <p className="mt-1">“{nil.reason}”</p>
        <p className="mt-1 text-body-md text-ink-muted">
          Declared by {nil.declared_by} on {fmtDate(nil.declared_at)}
        </p>
        {budget.is_editable ? (
          <button
            type="button"
            className="btn mt-2 text-body-md"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(undefined)}
          >
            Withdraw — price it instead
          </button>
        ) : null}
        {withdraw.error ? <ProblemView error={withdraw.error} /> : null}
      </div>
    );
  }
  if (!budget.is_editable || budget.lines.length > 0) return null;
  return (
    <form
      className="m-4 rounded-md border border-dashed border-line-strong p-4"
      onSubmit={(e) => {
        e.preventDefault();
        declare.mutate(undefined);
      }}
    >
      <label className="label" htmlFor="nil-reason">
        Or declare that this event needs no money
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="nil-reason"
          className="field flex-1"
          placeholder="Why — e.g. a talk in our own classroom"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="submit" className="btn" disabled={declare.isPending || !reason.trim()}>
          Declare nil
        </button>
      </div>
      {declare.error ? <ProblemView error={declare.error} /> : null}
    </form>
  );
}

function ReceiptUpload({ budget, line }: { budget: Budget; line: BudgetLine }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const upload = useMutation<Receipt, ApiError>({
    mutationFn: () => {
      const form = new FormData();
      if (file) form.append('file', file);
      if (line.amount_spent) form.append('amount', line.amount_spent);
      return clubApi.budget.attachReceipt(budget.id, line.id, form);
    },
    onSuccess: () => {
      toast.show('Receipt attached');
      setFile(null);
      setInputKey((k) => k + 1);
      void queryClient.invalidateQueries({ queryKey: budgetKey(budget.id) });
    },
  });
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          key={inputKey}
          aria-label={`Receipt for ${line.head}`}
          type="file"
          accept="application/pdf,image/*"
          className="text-body-md"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn text-body-md"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? 'Uploading…' : 'Attach'}
        </button>
      </div>
      {upload.error ? <ProblemView error={upload.error} /> : null}
    </div>
  );
}

function SpendRow({
  budget,
  line,
  canSpend,
}: {
  budget: Budget;
  line: BudgetLine;
  canSpend: boolean;
}) {
  const [spent, setSpent] = useState(line.amount_spent ? Number(line.amount_spent).toString() : '');
  const [note, setNote] = useState(line.variance_note ?? '');
  const [openError, setOpenError] = useState<unknown>(null);
  const save = useBudgetAction(
    budget.id,
    () =>
      clubApi.budget.setSpend(budget.id, line.id, {
        amount_spent: spent === '' ? null : spent,
        variance_note: note,
      }),
    'Spend saved',
  );
  const settled = budget.stage === 'settled';
  const over = line.amount_sanctioned !== null && Number(spent) > Number(line.amount_sanctioned);
  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0" data-testid="spend-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong>{line.head}</strong>
        <span className="text-body-md text-ink-muted">
          sanctioned {inr(line.amount_sanctioned ?? line.amount_requested)}
          {line.is_overspent ? (
            <>
              {' '}
              <Pill tone="bad">Over sanctioned</Pill>
            </>
          ) : null}
        </span>
      </div>
      {canSpend && !settled ? (
        <form
          className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <div>
            <label className="label" htmlFor={`spent-${line.id}`}>
              Spent (₹)
            </label>
            <input
              id={`spent-${line.id}`}
              type="number"
              min={0}
              className="field"
              value={spent}
              onChange={(e) => setSpent(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor={`note-${line.id}`}>
              {over ? 'Why it went over (required)' : 'Note'}
            </label>
            <input
              id={`note-${line.id}`}
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button type="submit" variant="tonal" disabled={save.isPending}>
            Save
          </Button>
        </form>
      ) : (
        <p className={cx('mt-1 text-body-md', line.is_overspent && 'font-semibold text-danger')}>
          {line.is_overspent ? <Icon name="alert" size={16} className="mr-1" /> : null}
          Spent {line.amount_spent === null ? '—' : inr(line.amount_spent)}
          {line.variance_note ? (
            <span className="text-ink-muted"> · {line.variance_note}</span>
          ) : null}
        </p>
      )}
      {save.error ? <ProblemView error={save.error} /> : null}
      {line.receipts.length > 0 ? (
        <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
          {line.receipts.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="pill cursor-pointer hover:underline"
                onClick={() => {
                  setOpenError(null);
                  clubApi.budget.openReceipt(r).catch(setOpenError);
                }}
              >
                <Icon name="draft" size={14} /> {r.file_name}
                {r.amount ? ` · ${inr(r.amount)}` : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {openError ? <ProblemView error={openError} /> : null}
      {canSpend && !settled ? <ReceiptUpload budget={budget} line={line} /> : null}
    </li>
  );
}

export function BudgetDetailPage() {
  const { id = '' } = useParams();
  const { capabilities } = useCapabilities();
  const events = useEventIndex();
  const budget = useQuery<Budget, ApiError>({
    queryKey: budgetKey(id),
    queryFn: () => clubApi.budget.get(id),
    enabled: id !== '',
  });
  const settle = useBudgetAction(id, () => clubApi.budget.settle(id), 'Budget settled');

  if (budget.isPending) return <Loading />;
  if (budget.error) return <ProblemView error={budget.error} />;
  const b = budget.data;
  const ev = b.event ? events.get(b.event) : undefined;
  const club = ev?.club ?? '';
  const canPrepare = capabilities?.clubs_with_budget_access.includes(club) ?? false;
  const canSpend = capabilities?.clubs_can_enter_spend.includes(club) ?? false;
  const canPropose = capabilities?.clubs_can_propose.includes(club) ?? false;
  const editable = b.is_editable && canPrepare;
  const spendPhase = ['sanctioned', 'settled'].includes(b.stage ?? '');
  const awaitingSubmit = ev && (ev.status === 'draft' || ev.status === 'returned');

  return (
    <article>
      <p className="mb-3 text-body-md">
        <Link
          to="/club/budget"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Icon name="chevron-left" size={16} /> Budget
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{ev?.title ?? 'Event budget'}</h1>
            <Pill tone={STAGE_TONE[b.stage ?? 'draft']}>{b.stage_label}</Pill>
          </div>
          {ev ? (
            <p className="mt-1.5 text-ink-muted">
              {ev.club_name} · {fmtDate(ev.starts_at)} ·{' '}
              <Link to={`/club/events/${ev.id}`} className="hover:underline">
                event page
              </Link>{' '}
              <StatusPill status={ev.status} label={ev.status_label} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-5">
        <div className="grid grid-cols-3 gap-3.5">
          <Stat
            label="Requested"
            value={<span data-testid="total-requested">{inr(b.total_requested)}</span>}
          />
          <Stat label="Sanctioned" value={inr(b.total_sanctioned)} />
          <Stat
            label="Spent"
            value={inr(b.total_spent)}
            tone={
              Number(b.total_sanctioned) > 0 && Number(b.total_spent) > Number(b.total_sanctioned)
                ? 'danger'
                : undefined
            }
          />
          {Number(b.total_requested) > b.thresholds.vc_threshold ? (
            <p className="col-span-3 text-body-md">
              <Pill tone="warn">
                Above {inr(b.thresholds.vc_threshold)} — the Vice-Chancellor signs too
              </Pill>
            </p>
          ) : null}
        </div>
        {spendPhase && Number(b.total_sanctioned) > 0 ? (
          <BudgetSummary
            title="Spend against sanction"
            subtitle={b.stage === 'settled' ? 'Settled' : 'Enter spend and attach receipts below'}
            sanctioned={Number(b.total_sanctioned)}
            spent={Number(b.total_spent)}
          />
        ) : (
          <EnvelopeMeter envelope={b.envelope} />
        )}
      </div>

      <section className="cc-card cc-sheet-wrap" aria-label="Budget entries">
        <div className="cc-sheet-toolbar">
          <div>
            <h3 className="title-md">Entries</h3>
            <div className="caption cc-sheet-sub">
              {b.is_editable
                ? 'Requested is what the club asks for. Approvers set what is sanctioned.'
                : spendPhase
                  ? 'Sanctioned. Record what was spent below.'
                  : 'Amounts are frozen while an approver holds the budget.'}
            </div>
          </div>
          <span className="cc-spacer" />
          {awaitingSubmit && canPropose && b.is_ready_to_submit && ev ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-md text-ink-muted">Priced — ready for the approvers.</span>
              <SubmitButton event={ev} compact />
            </div>
          ) : null}
        </div>
        {b.lines.length > 0 ? (
          <div className="cc-sheet-scroll">
            <table className="cc-sheet">
              <thead>
                <tr>
                  <th className="cc-rownum label-md" scope="col">
                    <span className="cc-sr">Row</span>
                  </th>
                  <th className="label-md" scope="col">
                    Head
                  </th>
                  <th className="label-md" scope="col">
                    Basis
                  </th>
                  <th className="label-md cc-al-right" scope="col">
                    Requested
                  </th>
                  <th className="label-md cc-al-right" scope="col">
                    Sanctioned
                  </th>
                  <th className="label-md" scope="col">
                    <span className="cc-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((line, i) => (
                  <LineRow key={line.id} budget={b} line={line} index={i} editable={editable} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="cc-rownum" />
                  <td className="label-lg" colSpan={2}>
                    Total
                  </td>
                  <td className="figure-md cc-cell--money">{inr(b.total_requested)}</td>
                  <td className="figure-md cc-cell--money">
                    {Number(b.total_sanctioned) > 0 ? inr(b.total_sanctioned) : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !b.nil_declaration ? (
          <p className="px-4 py-4 text-body-md text-ink-muted">
            No entries yet. A proposal cannot go for approval until it is priced or declared nil.
          </p>
        ) : null}
        <NilPanel budget={b} />
        {editable && !b.nil_declaration ? <AddLineForm budget={b} /> : null}
      </section>

      {spendPhase && b.lines.length > 0 ? (
        <section className="cc-card mt-5" aria-label="Spend and receipts">
          <div className="cc-sheet-toolbar">
            <div>
              <h3 className="title-md">Spend and receipts</h3>
              <div className="caption cc-sheet-sub">
                Receipts are required for anything above {inr(b.thresholds.receipt_threshold)}.
              </div>
            </div>
          </div>
          <ul className="m-0 list-none p-0">
            {b.lines.map((line) => (
              <SpendRow key={line.id} budget={b} line={line} canSpend={canSpend} />
            ))}
          </ul>
          <div className="border-t border-line px-4 py-4">
            {b.stage === 'settled' ? (
              <Pill tone="ok">Settled{b.settled_at ? ` on ${fmtDate(b.settled_at)}` : ''}</Pill>
            ) : (
              <>
                {b.settlement_problems.length > 0 ? (
                  <ul className="mb-3 list-disc pl-5 text-body-md text-warning">
                    {b.settlement_problems.map((p, i) => (
                      <li key={`${p.field}-${i}`}>{p.message}</li>
                    ))}
                  </ul>
                ) : null}
                {b.settlement_hint ? <p className="note mb-3">{b.settlement_hint}</p> : null}
                {canSpend ? (
                  <button
                    type="button"
                    className={buttonClass('filled')}
                    disabled={settle.isPending || !b.can_settle}
                    title={b.settlement_waiting_on ?? undefined}
                    onClick={() => settle.mutate(undefined)}
                  >
                    Settle budget
                  </button>
                ) : null}
                {settle.error ? <ProblemView error={settle.error} /> : null}
              </>
            )}
          </div>
        </section>
      ) : null}
    </article>
  );
}
