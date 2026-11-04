import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { useSession } from '../shared/auth/store';
import {
  ApprovalFlow,
  BudgetSheet,
  Button,
  Card,
  Chip,
  ClubIcon,
  Icon,
  RevisionTimeline,
  Stat,
  accentFor,
  formatINR,
  type RevisionItem,
  type SheetRow,
} from '../shared/ds';
import { GATE_NAME, STAGE_ROLE, flowSteps } from '../shared/approvals';
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

function Trail({ a }: { a: ApprovalRequest }) {
  if (a.steps.length === 0) {
    return <p className="text-body-md text-ink-muted">No decisions yet.</p>;
  }
  const items: RevisionItem[] = a.steps.map((s) => {
    const role = STAGE_ROLE[s.stage];
    const sanctioned = Number(s.amount_sanctioned);
    const reduced = sanctioned > 0 && sanctioned < Number(a.amount_requested);
    return {
      role,
      name: s.actor_label,
      roleLabel:
        roleLabel(s.actor_role) + (s.on_behalf_of_label ? ` for ${s.on_behalf_of_label}` : ''),
      at: `${fmtDate(s.created_at)} ${fmtTime(s.created_at)}`,
      tags: (
        <>
          <Pill tone={DECISION[s.decision].tone}>{DECISION[s.decision].label}</Pill>
          {s.mfa_verified ? <Pill tone="ok">MFA</Pill> : null}
        </>
      ),
      action: s.stage_label,
      ...(reduced
        ? { field: 'Sanctioned', from: inr(a.amount_requested), to: inr(s.amount_sanctioned) }
        : sanctioned > 0
          ? { action: `${s.stage_label} · sanctioned ${inr(s.amount_sanctioned)}` }
          : {}),
      comment: s.comment || undefined,
    };
  });
  return (
    <div data-testid="trail">
      <RevisionTimeline items={items} />
    </div>
  );
}

/** Budget lines as a sheet. A line sanctioned below its request is an edit. */
function budgetRows(a: ApprovalRequest): SheetRow[] {
  const sanctioner = [...a.steps].reverse().find((s) => Number(s.amount_sanctioned) > 0);
  return a.lines.map((l) => {
    const req = Number(l.amount_requested);
    const san = l.amount_sanctioned != null ? Number(l.amount_sanctioned) : null;
    const reduced = san != null && san < req;
    return {
      id: l.id,
      cells: { head: l.head, requested: req, sanctioned: san ?? '' },
      edits: reduced
        ? {
            sanctioned: {
              role: sanctioner ? STAGE_ROLE[sanctioner.stage] : 'admin',
              by: sanctioner?.actor_label,
              at: sanctioner ? fmtDate(sanctioner.created_at) : undefined,
              from: req,
            },
          }
        : undefined,
    };
  });
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
    <Card title="Your decision" className="mt-5" subtitle={`${GATE_NAME[item.current_stage]} gate`}>
      <section aria-label="Your decision" className="flex flex-col gap-4">
        {canSanction ? (
          <>
            <BudgetSheet
              title="Sanction by line"
              subtitle="You may reduce a head, never raise it. Lines you leave are sanctioned as requested."
              columns={[
                { key: 'head', label: 'Head', wrap: true },
                { key: 'requested', label: 'Requested', type: 'money' },
                { key: 'sanction', label: 'Sanction (₹)', type: 'money', width: 160 },
              ]}
              rows={item.lines.map((l) => {
                const v = sanction[l.id] ?? '';
                const reduced = v !== '' && Number(v) < Number(l.amount_requested);
                return {
                  id: l.id,
                  cells: {
                    head: l.head,
                    requested: Number(l.amount_requested),
                    sanction: (
                      <input
                        aria-label={`Sanction for ${l.head}`}
                        className="cc-cell-input"
                        inputMode="numeric"
                        value={v}
                        onChange={(e) => setSanction((s) => ({ ...s, [l.id]: e.target.value }))}
                      />
                    ),
                  },
                  edits: reduced
                    ? { sanction: { role: 'admin', by: 'you', from: Number(l.amount_requested) } }
                    : undefined,
                  over: { sanction: Number(v) > Number(l.amount_requested) },
                };
              })}
              totalValues={{
                requested: formatINR(Number(item.amount_requested)),
                sanction: formatINR(sanctionTotal),
              }}
            />
            {overLines.length > 0 ? (
              <p className="flex items-center gap-1.5 text-body-md text-danger">
                <Icon name="alert" size={16} />
                {overLines.map((l) => l.head).join(', ')}: above what was requested — the server
                will refuse it.
              </p>
            ) : null}
          </>
        ) : null}

        {noMfa ? (
          <div className="note">
            Approving this needs a multi-factor-verified session. Sign out and sign in again with
            your authenticator code.
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="decide-comment">
            Comment{' '}
            <span className="font-normal text-ink-muted">(required to return or reject)</span>
          </label>
          <textarea
            id="decide-comment"
            className="field min-h-[84px]"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What should the club change? The club sees this."
          />
        </div>

        {/* Approve is the only filled button; Reject is outlined in danger. */}
        <div className="cc-approval-actions">
          <Button
            variant="outlined"
            icon="undo"
            disabled={decide.isPending}
            onClick={() => decide.mutate('return')}
          >
            Return for changes
          </Button>
          <Button
            variant="reject"
            icon="x"
            disabled={decide.isPending}
            onClick={() => decide.mutate('reject')}
          >
            Reject
          </Button>
          <span className="cc-spacer" />
          <Button
            variant="approve"
            icon="check"
            disabled={decide.isPending}
            onClick={() => decide.mutate('approve')}
          >
            Approve{item.current_stage === 'cultural_society' ? ' and send to Dean' : ''}
          </Button>
        </div>
        {decide.error ? <ProblemView error={decide.error} /> : null}
      </section>
    </Card>
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
      <p className="mb-3 text-body-md">
        <Link
          to={STAGE_PATH[a.current_stage]}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <Icon name="chevron-left" size={16} /> {STAGE_LABEL[a.current_stage]} approvals
        </Link>
      </p>
      <div className="mb-5 flex items-start gap-4">
        <ClubIcon name={a.club} accent={accentFor(a.club)} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1>{a.event_title}</h1>
            <Pill tone={STATE_TONE[a.state ?? 'pending']}>
              {pending ? `At ${a.stage_label}` : (a.state ?? '')}
            </Pill>
            {a.escalated ? <Pill tone="bad">Past SLA · {ageLabel(a.age_hours)}</Pill> : null}
          </div>
          <p className="mt-1.5 text-ink-muted">
            {a.club} · {a.venue} · {fmtDate(a.starts_at)}, {fmtTime(a.starts_at)}–
            {fmtTime(a.ends_at)}
          </p>
        </div>
      </div>

      <section className="cc-card mb-5 overflow-x-auto px-4 py-5" aria-label="Route">
        <ApprovalFlow steps={flowSteps(a)} className="min-w-[560px]" />
      </section>

      <div className="grid gap-3.5 md:grid-cols-3 lg:gap-5">
        <Stat
          label="Requested"
          value={inr(a.amount_requested)}
          note={
            a.requires_vc ? (
              <span className="text-warning">
                Goes to the Vice-Chancellor{a.vc_reason ? `: ${a.vc_reason}` : ''}
              </span>
            ) : undefined
          }
        />
        <Stat label="Expected" value={a.expected_attendance} note="people" />
        <Stat
          label="At this gate"
          value={ageLabel(a.age_hours)}
          tone={a.escalated ? 'danger' : undefined}
          note={`since ${fmtDate(a.stage_entered_at ?? a.created_at)}`}
        />
      </div>

      {a.clashes.length > 0 ? (
        <div
          className="mt-5 rounded-md border border-danger bg-danger-soft px-4 py-3.5"
          role="alert"
        >
          <strong className="flex items-center gap-1.5 text-danger">
            <Icon name="alert" size={18} /> Venue clash
          </strong>
          <ul className="mt-1.5 ml-4 list-disc text-body-md">
            {a.clashes.map((c) => (
              <li key={c.id}>
                {c.title} ({c.club}) · {fmtDate(c.starts_at)} {fmtTime(c.starts_at)}–
                {fmtTime(c.ends_at)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-body-md">
            It cannot be approved until one event moves.{' '}
            <Link to="/staff/venues" className="underline">
              Open the venue calendar
            </Link>
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {a.nil_declaration ? (
          <Card title="Budget">
            <p className="text-body-md">
              <Pill tone="info">Nil budget</Pill> {a.nil_declaration.reason}
              <span className="block text-body-md text-ink-muted">
                Declared by {a.nil_declaration.declared_by}
              </span>
            </p>
          </Card>
        ) : a.lines.length === 0 ? (
          <Card title="Budget">
            <p className="text-body-md text-ink-muted">No budget lines.</p>
          </Card>
        ) : (
          <BudgetSheet
            title="Budget"
            subtitle={`${a.lines.length} lines`}
            legend={
              a.lines.some(
                (l) =>
                  l.amount_sanctioned != null &&
                  Number(l.amount_sanctioned) < Number(l.amount_requested),
              )
                ? true
                : undefined
            }
            columns={[
              { key: 'head', label: 'Head', wrap: true },
              { key: 'requested', label: 'Requested', type: 'money' },
              { key: 'sanctioned', label: 'Sanctioned', type: 'money' },
            ]}
            rows={budgetRows(a)}
            totals={['requested', 'sanctioned']}
          />
        )}
        <Card title="Approval trail">
          <Trail a={a} />
        </Card>
      </div>

      {a.my_stage && pending ? (
        <DecisionPanel item={a} />
      ) : (
        <div className="note mt-5 flex items-center gap-2">
          <Chip tone={pending ? 'pending' : 'neutral'} icon={pending ? 'clock' : 'check'}>
            {pending ? 'Waiting' : 'Decided'}
          </Chip>
          {pending
            ? `This is waiting at the ${a.stage_label} gate, which is not yours.`
            : 'This request has been decided.'}
        </div>
      )}
    </article>
  );
}
