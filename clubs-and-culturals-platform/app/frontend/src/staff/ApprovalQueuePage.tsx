import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { fmtDate, fmtTime, inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import {
  STAFF_KEYS,
  STAGE_LABEL,
  ageLabel,
  staffApi,
  type ApprovalQueue,
  type ApprovalRequest,
  type ApprovalStage,
} from './api';

const INTRO: Record<ApprovalStage, string> = {
  cultural_society:
    'First gate. Check the plan is sound and the venue is free, then pass it to the Dean.',
  dean: 'Second gate. Sanction each budget line — you may reduce a head, never raise it. Approval here publishes the event unless it needs the Vice-Chancellor.',
  vc: 'Proposals above the escalation threshold. Approval needs a multi-factor-verified session.',
};

function QueueRow({ item, slaHours }: { item: ApprovalRequest; slaHours: number }) {
  return (
    <li
      data-testid="queue-row"
      className="grid gap-3 border-b border-line py-4 sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3>
            <Link to={`/staff/approvals/${item.id}`} className="hover:underline">
              {item.event_title}
            </Link>
          </h3>
          {item.escalated ? (
            <Pill tone="bad">Past SLA ({slaHours}h)</Pill>
          ) : (
            <Pill tone="plain">Waiting {ageLabel(item.age_hours)}</Pill>
          )}
          {item.requires_vc ? <Pill tone="warn">Needs VC</Pill> : null}
          {item.clashes.length > 0 ? <Pill tone="bad">Venue clash</Pill> : null}
          {item.nil_declaration ? <Pill tone="gold">Nil budget</Pill> : null}
        </div>
        <p className="text-[0.875rem] text-muted">
          {item.club} · {item.venue} · {fmtDate(item.starts_at)}, {fmtTime(item.starts_at)} ·{' '}
          {item.expected_attendance} expected
        </p>
        {item.escalated ? (
          <p className="mt-1 text-[0.85rem] text-bad">
            Waiting {ageLabel(item.age_hours)} at this gate.
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <span className="font-display text-[1.15rem] font-bold">{inr(item.amount_requested)}</span>
        <Link className="btn btn-primary" to={`/staff/approvals/${item.id}`}>
          Review
        </Link>
      </div>
    </li>
  );
}

export function ApprovalQueuePage({ stage }: { stage: ApprovalStage }) {
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const queue = useQuery<ApprovalQueue, ApiError>({
    queryKey: STAFF_KEYS.queue(escalatedOnly),
    queryFn: () => staffApi.queue(escalatedOnly),
  });

  const rows = (queue.data?.results ?? []).filter((r) => r.current_stage === stage);
  const delegated = queue.data?.stages_delegated_to_you.includes(stage) ?? false;
  const escalatedCount = rows.filter((r) => r.escalated).length;
  const total = rows.reduce((sum, r) => sum + Number(r.amount_requested ?? 0), 0);

  return (
    <>
      <div className="mb-5">
        <h1>{STAGE_LABEL[stage]} approvals</h1>
        <p className="mt-1.5 max-w-[66ch] text-muted">{INTRO[stage]}</p>
      </div>

      {delegated ? (
        <div className="note mb-4" data-testid="delegation-note">
          You are covering the <strong>{STAGE_LABEL[stage]}</strong> gate on someone else&apos;s
          behalf. The trail records both names, and every decision needs a multi-factor-verified
          session.
        </div>
      ) : null}

      {queue.data ? (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="panel !p-4">
            <span className="text-[0.78rem] font-semibold text-muted uppercase">Waiting</span>
            <b className="block font-display text-[1.7rem]">{rows.length}</b>
          </div>
          <div className="panel !p-4">
            <span className="text-[0.78rem] font-semibold text-muted uppercase">Past SLA</span>
            <b className={`block font-display text-[1.7rem] ${escalatedCount ? 'text-bad' : ''}`}>
              {escalatedCount}
            </b>
          </div>
          <div className="panel !p-4">
            <span className="text-[0.78rem] font-semibold text-muted uppercase">Requested</span>
            <b className="block font-display text-[1.7rem]">{inr(total)}</b>
          </div>
        </div>
      ) : null}

      <label className="mb-3 flex items-center gap-2 text-[0.9rem]">
        <input
          type="checkbox"
          checked={escalatedOnly}
          onChange={(e) => setEscalatedOnly(e.target.checked)}
        />
        Only items past the {queue.data?.sla_hours ?? ''}
        {queue.data ? 'h' : ''} SLA
      </label>

      {queue.isPending ? (
        <Loading />
      ) : queue.error ? (
        <ProblemView error={queue.error} />
      ) : rows.length === 0 ? (
        <Empty>
          {escalatedOnly
            ? 'Nothing past the SLA. Good.'
            : 'Nothing waiting at this gate. New proposals appear here, oldest first.'}
        </Empty>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {rows.map((item) => (
            <QueueRow key={item.id} item={item} slaHours={queue.data.sla_hours} />
          ))}
        </ul>
      )}
    </>
  );
}
