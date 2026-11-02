import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { useSession } from '../shared/auth/store';
import { fmtDate, fmtTime, inr, roleLabel } from '../shared/format';
import { Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import {
  STAFF_KEYS,
  STAGE_LABEL,
  STAGE_PATH,
  ageLabel,
  staffApi,
  type ApprovalRequest,
  type ApprovalStep,
  type DecideBody,
  type Decision,
  type DecisionOut,
} from './api';

const DECISION: Record<Decision, { label: string; tone: 'ok' | 'warn' | 'bad'; done: string }> = {
  approve: { label: 'Approved', tone: 'ok', done: 'Approved' },
  return: { label: 'Returned', tone: 'warn', done: 'Returned to the club' },
  reject: { label: 'Rejected', tone: 'bad', done: 'Rejected' },
};

const STATE_TONE = {
  pending: 'warn',
  approved: 'ok',
  returned: 'warn',
  rejected: 'bad',
  withdrawn: 'plain',
} as const;

function Trail({ steps }: { steps: ApprovalStep[] }) {
  if (steps.length === 0) {
    return <p className="mt-2 text-[0.9rem] text-muted">No decisions yet.</p>;
  }
  return (
    <ol className="mt-3 flex list-none flex-col gap-3 p-0" data-testid="trail">
      {steps.map((s) => (
        <li key={s.id} className="border-l-[3px] border-line pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{s.stage_label}</strong>
            <Pill tone={DECISION[s.decision].tone}>{DECISION[s.decision].label}</Pill>
            {s.mfa_verified ? <Pill tone="ok">MFA</Pill> : null}
            {Number(s.amount_sanctioned) > 0 ? (
              <span className="text-[0.85rem]">sanctioned {inr(s.amount_sanctioned)}</span>
            ) : null}
          </div>
          <p className="text-[0.85rem] text-muted">
            {s.actor_label} ({roleLabel(s.actor_role)})
            {s.on_behalf_of_label ? ` on behalf of ${s.on_behalf_of_label}` : ''} ·{' '}
            {fmtDate(s.created_at)} {fmtTime(s.created_at)}
          </p>
          {s.comment ? <p className="mt-1 text-[0.92rem]">“{s.comment}”</p> : null}
        </li>
      ))}
    </ol>
  );
}

function DecisionPanel({ item }: { item: ApprovalRequest }) {
  const session = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const canSanction = item.current_stage === 'dean' && item.lines.length > 0;
  const [sanction, setSanction] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      item.lines.map((l) => [
        l.id,
        String(Number(l.amount_sanctioned ?? l.amount_requested).toFixed(0)),
      ]),
    ),
  );

  const decide = useMutation<DecisionOut, ApiError, Decision>({
    mutationFn: (decision) => {
      const body: DecideBody = { decision, comment: comment.trim() };
      if (decision === 'approve' && canSanction) body.sanctioned = sanction;
      return staffApi.decide(item.id, body);
    },
    onSuccess: async (_out, decision) => {
      toast.show(`${DECISION[decision].done}: ${item.event_title}`);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      navigate(STAGE_PATH[item.current_stage]);
    },
  });

  const sanctionTotal = Object.values(sanction).reduce((s, v) => s + (Number(v) || 0), 0);
  const overLines = item.lines.filter(
    (l) => Number(sanction[l.id] ?? 0) > Number(l.amount_requested),
  );
  const noMfa = item.requires_mfa && session?.claims.mfa === false;

  return (
    <section className="panel mt-3.5" aria-label="Your decision">
      <h2>Your decision</h2>

      {canSanction ? (
        <div className="mt-3">
          <h3>Sanction by line</h3>
          <table className="mt-2 w-full text-[0.92rem]">
            <thead>
              <tr className="text-left text-[0.78rem] text-muted uppercase">
                <th className="py-1.5 font-semibold">Head</th>
                <th className="py-1.5 text-right font-semibold">Requested</th>
                <th className="py-1.5 text-right font-semibold">Sanction (₹)</th>
              </tr>
            </thead>
            <tbody>
              {item.lines.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="py-2">{l.head}</td>
                  <td className="py-2 text-right">{inr(l.amount_requested)}</td>
                  <td className="py-2 text-right">
                    <input
                      aria-label={`Sanction for ${l.head}`}
                      className="field ml-auto max-w-[140px] text-right"
                      inputMode="numeric"
                      value={sanction[l.id] ?? ''}
                      onChange={(e) => setSanction((s) => ({ ...s, [l.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{inr(item.amount_requested)}</td>
                <td className="py-2 text-right">{inr(sanctionTotal)}</td>
              </tr>
            </tbody>
          </table>
          {overLines.length > 0 ? (
            <p className="mt-2 text-[0.85rem] text-bad">
              {overLines.map((l) => l.head).join(', ')}: above what was requested — the server will
              refuse it.
            </p>
          ) : null}
        </div>
      ) : null}

      {noMfa ? (
        <div className="note mt-3">
          Approving this needs a multi-factor-verified session. Sign out and sign in again with your
          authenticator code.
        </div>
      ) : null}

      <label className="label mt-4" htmlFor="decide-comment">
        Comment <span className="font-normal text-muted">(required to return or reject)</span>
      </label>
      <textarea
        id="decide-comment"
        className="field min-h-[84px]"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What should the club change? The club sees this."
      />

      <div className="mt-3 flex flex-wrap gap-2.5">
        <button
          type="button"
          className="btn btn-primary"
          disabled={decide.isPending}
          onClick={() => decide.mutate('approve')}
        >
          Approve{item.current_stage === 'cultural_society' ? ' and send to Dean' : ''}
        </button>
        <button
          type="button"
          className="btn"
          disabled={decide.isPending}
          onClick={() => decide.mutate('return')}
        >
          Return for changes
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={decide.isPending}
          onClick={() => decide.mutate('reject')}
        >
          Reject
        </button>
      </div>
      {decide.error ? <ProblemView error={decide.error} /> : null}
    </section>
  );
}

export function ApprovalDetailPage() {
  const { id = '' } = useParams();
  const approval = useQuery<ApprovalRequest, ApiError>({
    queryKey: STAFF_KEYS.approval(id),
    queryFn: () => staffApi.approval(id),
    enabled: id !== '',
  });

  if (approval.isPending) return <Loading />;
  if (approval.error) return <ProblemView error={approval.error} />;
  const a = approval.data;
  const pending = a.state === 'pending' || a.state === undefined;

  return (
    <article>
      <p className="mb-3 text-[0.875rem]">
        <Link to={STAGE_PATH[a.current_stage]} className="text-muted hover:underline">
          ← {STAGE_LABEL[a.current_stage]} approvals
        </Link>
      </p>
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1>{a.event_title}</h1>
          <Pill tone={STATE_TONE[a.state ?? 'pending']}>
            {pending ? `At ${a.stage_label}` : (a.state ?? '')}
          </Pill>
          {a.escalated ? <Pill tone="bad">Past SLA · {ageLabel(a.age_hours)}</Pill> : null}
        </div>
        <p className="mt-1.5 text-muted">
          {a.club} · {a.venue} · {fmtDate(a.starts_at)}, {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}
        </p>
      </div>

      <div className="grid gap-3.5 md:grid-cols-3">
        <div className="panel">
          <span className="text-[0.78rem] font-semibold text-muted uppercase">Requested</span>
          <b className="block font-display text-[1.6rem]">{inr(a.amount_requested)}</b>
          {a.requires_vc ? (
            <p className="mt-1 text-[0.85rem] text-warn">
              Goes to the Vice-Chancellor{a.vc_reason ? `: ${a.vc_reason}` : ''}
            </p>
          ) : null}
        </div>
        <div className="panel">
          <span className="text-[0.78rem] font-semibold text-muted uppercase">Expected</span>
          <b className="block font-display text-[1.6rem]">{a.expected_attendance}</b>
          <p className="text-[0.85rem] text-muted">people</p>
        </div>
        <div className="panel">
          <span className="text-[0.78rem] font-semibold text-muted uppercase">At this gate</span>
          <b className="block font-display text-[1.6rem]">{ageLabel(a.age_hours)}</b>
          <p className="text-[0.85rem] text-muted">
            since {fmtDate(a.stage_entered_at ?? a.created_at)}
          </p>
        </div>
      </div>

      {a.clashes.length > 0 ? (
        <div className="mt-3.5 rounded-[10px] border border-bad bg-bad-soft/60 px-4 py-3.5">
          <strong>Venue clash</strong>
          <ul className="mt-1.5 ml-4 list-disc text-[0.9rem]">
            {a.clashes.map((c) => (
              <li key={c.id}>
                {c.title} ({c.club}) · {fmtDate(c.starts_at)} {fmtTime(c.starts_at)}–
                {fmtTime(c.ends_at)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.85rem]">
            It cannot be approved until one event moves.{' '}
            <Link to="/staff/venues" className="underline">
              Open the venue calendar
            </Link>
          </p>
        </div>
      ) : null}

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <section className="panel">
          <h3>Budget</h3>
          {a.nil_declaration ? (
            <p className="mt-2 text-[0.92rem]">
              <Pill tone="gold">Nil budget</Pill> {a.nil_declaration.reason}
              <span className="block text-[0.82rem] text-muted">
                Declared by {a.nil_declaration.declared_by}
              </span>
            </p>
          ) : a.lines.length === 0 ? (
            <p className="mt-2 text-[0.9rem] text-muted">No budget lines.</p>
          ) : (
            <table className="mt-2 w-full text-[0.92rem]">
              <tbody>
                {a.lines.map((l) => (
                  <tr key={l.id} className="border-t border-line first:border-t-0">
                    <td className="py-1.5">{l.head}</td>
                    <td className="py-1.5 text-right">{inr(l.amount_requested)}</td>
                    <td className="py-1.5 text-right text-muted">
                      {l.amount_sanctioned !== null ? `→ ${inr(l.amount_sanctioned)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <h3>Approval trail</h3>
          <Trail steps={a.steps} />
        </section>
      </div>

      {a.my_stage && pending ? (
        <DecisionPanel item={a} />
      ) : (
        <div className="note mt-3.5">
          {pending
            ? `This is waiting at the ${a.stage_label} gate, which is not yours.`
            : 'This request has been decided.'}
        </div>
      )}
    </article>
  );
}
