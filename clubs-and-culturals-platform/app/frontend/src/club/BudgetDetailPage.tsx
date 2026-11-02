import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { useCapabilities } from '../shared/auth/useCapabilities';
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

function LineRow({
  budget,
  line,
  editable,
}: {
  budget: Budget;
  line: BudgetLine;
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
      <tr className="border-b border-line">
        <td className="py-2 pr-2">
          <input
            aria-label="Head"
            className="field"
            value={head}
            onChange={(e) => setHead(e.target.value)}
          />
        </td>
        <td className="py-2 pr-2">
          <input
            aria-label="Amount"
            type="number"
            min={0}
            className="field text-right"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </td>
        <td className="py-2 text-right whitespace-nowrap" colSpan={2}>
          <button
            type="button"
            className="btn btn-primary text-[0.85rem]"
            disabled={edit.isPending}
            onClick={() => edit.mutate(undefined, { onSuccess: () => setEditing(false) })}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-quiet text-[0.85rem]"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
          {edit.error ? <ProblemView error={edit.error} /> : null}
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-line" data-testid="budget-line">
      <td className="py-2.5 pr-2">
        {line.head}
        {line.basis ? (
          <span className="block text-[0.75rem] text-muted">{line.basis.replace('_', ' ')}</span>
        ) : null}
      </td>
      <td className="py-2.5 pr-2 text-right">{inr(line.amount_requested)}</td>
      <td className="py-2.5 pr-2 text-right">
        {line.amount_sanctioned === null ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            {inr(line.amount_sanctioned)}
            {Number(line.amount_sanctioned) < Number(line.amount_requested) ? (
              <span className="block text-[0.72rem] text-warn">cut by approver</span>
            ) : null}
          </>
        )}
      </td>
      <td className="py-2.5 text-right whitespace-nowrap">
        {editable ? (
          <>
            <button
              type="button"
              className="btn btn-quiet text-[0.85rem]"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-quiet text-[0.85rem] text-bad"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              Remove
            </button>
            {remove.error ? <ProblemView error={remove.error} /> : null}
          </>
        ) : null}
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
      className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end"
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
      <button
        type="submit"
        className="btn btn-primary"
        disabled={add.isPending || !head.trim() || !amount}
      >
        Add
      </button>
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
      <div className="note mt-3" data-testid="nil-declaration">
        <strong>{nil.head}</strong>
        <p className="mt-1">“{nil.reason}”</p>
        <p className="mt-1 text-[0.82rem] text-muted">
          Declared by {nil.declared_by} on {fmtDate(nil.declared_at)}
        </p>
        {budget.is_editable ? (
          <button
            type="button"
            className="btn mt-2 text-[0.85rem]"
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
      className="mt-4 rounded-sm border border-dashed border-line p-3"
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
          className="text-[0.82rem]"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          className="btn text-[0.82rem]"
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
    <li className="border-b border-line py-3" data-testid="spend-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong>{line.head}</strong>
        <span className="text-[0.85rem] text-muted">
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
          <button type="submit" className="btn" disabled={save.isPending}>
            Save
          </button>
        </form>
      ) : (
        <p className="mt-1 text-[0.9rem]">
          Spent {line.amount_spent === null ? '—' : inr(line.amount_spent)}
          {line.variance_note ? <span className="text-muted"> · {line.variance_note}</span> : null}
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
                📎 {r.file_name}
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
      <p className="mb-3 text-[0.875rem]">
        <Link to="/club/budget" className="text-muted hover:underline">
          ← Budget
        </Link>
      </p>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{ev?.title ?? 'Event budget'}</h1>
            <Pill tone={STAGE_TONE[b.stage ?? 'draft']}>{b.stage_label}</Pill>
          </div>
          {ev ? (
            <p className="mt-1.5 text-muted">
              {ev.club_name} · {fmtDate(ev.starts_at)} ·{' '}
              <Link to={`/club/events/${ev.id}`} className="hover:underline">
                event page
              </Link>{' '}
              <StatusPill status={ev.status} label={ev.status_label} />
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-3.5 grid gap-3.5 md:grid-cols-[1fr_320px]">
        <div className="panel grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[0.78rem] text-muted uppercase">Requested</p>
            <p className="font-display text-[1.4rem] font-bold" data-testid="total-requested">
              {inr(b.total_requested)}
            </p>
          </div>
          <div>
            <p className="text-[0.78rem] text-muted uppercase">Sanctioned</p>
            <p className="font-display text-[1.4rem] font-bold">{inr(b.total_sanctioned)}</p>
          </div>
          <div>
            <p className="text-[0.78rem] text-muted uppercase">Spent</p>
            <p className="font-display text-[1.4rem] font-bold">{inr(b.total_spent)}</p>
          </div>
          {Number(b.total_requested) > b.thresholds.vc_threshold ? (
            <p className="col-span-3 text-[0.85rem]">
              <Pill tone="warn">
                Above {inr(b.thresholds.vc_threshold)} — the Vice-Chancellor signs too
              </Pill>
            </p>
          ) : null}
        </div>
        <div className="panel">
          <EnvelopeMeter envelope={b.envelope} />
        </div>
      </div>

      <section className="panel" aria-label="Budget entries">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3>Entries</h3>
          {awaitingSubmit && canPropose && b.is_ready_to_submit && ev ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.85rem] text-muted">Priced — ready for the approvers.</span>
              <SubmitButton event={ev} compact />
            </div>
          ) : null}
        </div>
        {b.lines.length > 0 ? (
          <table className="mt-3 w-full text-[0.92rem]">
            <thead>
              <tr className="border-b border-line text-left text-[0.78rem] text-muted uppercase">
                <th className="py-2 font-semibold">Head</th>
                <th className="py-2 text-right font-semibold">Requested</th>
                <th className="py-2 text-right font-semibold">Sanctioned</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {b.lines.map((line) => (
                <LineRow key={line.id} budget={b} line={line} editable={editable} />
              ))}
            </tbody>
          </table>
        ) : !b.nil_declaration ? (
          <p className="mt-2 text-[0.9rem] text-muted">
            No entries yet. A proposal cannot go for approval until it is priced or declared nil.
          </p>
        ) : null}
        <NilPanel budget={b} />
        {editable && !b.nil_declaration ? <AddLineForm budget={b} /> : null}
        {!b.is_editable && !spendPhase ? (
          <p className="mt-3 text-[0.85rem] text-muted">
            Amounts are frozen while an approver holds the budget.
          </p>
        ) : null}
      </section>

      {spendPhase && b.lines.length > 0 ? (
        <section className="panel mt-3.5" aria-label="Spend and receipts">
          <h3>Spend and receipts</h3>
          <p className="mt-1 text-[0.85rem] text-muted">
            Receipts are required for anything above {inr(b.thresholds.receipt_threshold)}.
          </p>
          <ul className="m-0 mt-2 list-none p-0">
            {b.lines.map((line) => (
              <SpendRow key={line.id} budget={b} line={line} canSpend={canSpend} />
            ))}
          </ul>
          {b.stage === 'settled' ? (
            <p className="mt-3">
              <Pill tone="ok">Settled{b.settled_at ? ` on ${fmtDate(b.settled_at)}` : ''}</Pill>
            </p>
          ) : (
            <div className="mt-4">
              {b.settlement_problems.length > 0 ? (
                <ul className="mb-3 list-disc pl-5 text-[0.88rem] text-warn">
                  {b.settlement_problems.map((p, i) => (
                    <li key={`${p.field}-${i}`}>{p.message}</li>
                  ))}
                </ul>
              ) : null}
              {b.settlement_hint ? <p className="note mb-3">{b.settlement_hint}</p> : null}
              {canSpend ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={settle.isPending || !b.can_settle}
                  title={b.settlement_waiting_on ?? undefined}
                  onClick={() => settle.mutate(undefined)}
                >
                  Settle budget
                </button>
              ) : null}
              {settle.error ? <ProblemView error={settle.error} /> : null}
            </div>
          )}
        </section>
      ) : null}
    </article>
  );
}
