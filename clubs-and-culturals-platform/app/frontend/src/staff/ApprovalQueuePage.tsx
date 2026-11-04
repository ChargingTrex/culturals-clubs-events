import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { fmtDate, fmtTime, inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { accentFor, buttonClass, Chip, ClubIcon, Stat, Switch } from '../shared/ds';
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

/** One request in the approver's queue: the design system's ApprovalCard. */
function QueueRow({ item, slaHours }: { item: ApprovalRequest; slaHours: number }) {
  return (
    <li data-testid="queue-row" className="cc-card cc-approval list-none">
      <div className="cc-approval-head">
        <ClubIcon name={item.club} accent={accentFor(item.club)} />
        <div className="cc-approval-club">
          <div className="title-sm">{item.club}</div>
          <div className="caption">
            {item.venue} · {fmtDate(item.starts_at)}, {fmtTime(item.starts_at)}
          </div>
        </div>
        {item.escalated ? (
          <Chip tone="rejected" icon="alert">
            Past SLA ({slaHours}h)
          </Chip>
        ) : (
          <Chip tone="in-review" icon="clock">
            Waiting {ageLabel(item.age_hours)}
          </Chip>
        )}
      </div>
      <h3 className="cc-approval-title title-md">
        <Link to={`/staff/approvals/${item.id}`} className="text-ink hover:underline">
          {item.event_title}
        </Link>
      </h3>
      <div className="cc-approval-amount">
        <span className="figure-xl cc-num">{inr(item.amount_requested)}</span>
        <span className="caption">requested · {item.expected_attendance} expected</span>
      </div>
      {item.requires_vc || item.clashes.length > 0 || item.nil_declaration ? (
        <div className="cc-approval-tags">
          {item.requires_vc ? <Pill tone="warn">Needs VC</Pill> : null}
          {item.clashes.length > 0 ? <Pill tone="bad">Venue clash</Pill> : null}
          {item.nil_declaration ? <Pill tone="info">Nil budget</Pill> : null}
        </div>
      ) : null}
      {item.escalated ? (
        <p className="cc-approval-meta text-body-md text-danger">
          Waiting {ageLabel(item.age_hours)} at this gate.
        </p>
      ) : null}
      <div className="cc-approval-actions">
        <Link className={buttonClass('filled', 'md')} to={`/staff/approvals/${item.id}`}>
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
        <p className="mt-1.5 max-w-[66ch] text-ink-muted">{INTRO[stage]}</p>
      </div>

      {delegated ? (
        <div className="note mb-4" data-testid="delegation-note">
          You are covering the <strong>{STAGE_LABEL[stage]}</strong> gate on someone else&apos;s
          behalf. The trail records both names, and every decision needs a multi-factor-verified
          session.
        </div>
      ) : null}

      {queue.data ? (
        <div className="mb-5 grid grid-cols-3 gap-3 lg:gap-5">
          <Stat label="Waiting" value={rows.length} />
          <Stat
            label="Past SLA"
            value={escalatedCount}
            tone={escalatedCount ? 'danger' : undefined}
          />
          <Stat label="Requested" value={inr(total)} />
        </div>
      ) : null}

      <div className="mb-4">
        <Switch
          label={`Only items past the ${queue.data?.sla_hours ?? ''}${queue.data ? 'h' : ''} SLA`}
          checked={escalatedOnly}
          onChange={setEscalatedOnly}
        />
      </div>

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
        <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2 lg:gap-5">
          {rows.map((item) => (
            <QueueRow key={item.id} item={item} slaHours={queue.data.sla_hours} />
          ))}
        </ul>
      )}
    </>
  );
}
