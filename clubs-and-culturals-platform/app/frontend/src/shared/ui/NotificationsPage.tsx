/**
 * Notifications (/notifications): everything the system has told this person,
 * newest first — a proposal approved, sent on, returned or rejected, a booking
 * moved to another time or venue, a budget head the Dean sanctioned below the
 * request, a join request decided.
 *
 * A change made by an approver is drawn in the design system's edit colours:
 * violet "A" for the Cultural Society and the Dean, teal "M" for the
 * Vice-Chancellor, with the old value struck through. The same notice is mailed
 * to the person's institutional address. Opening the page marks them read; the
 * ones that were unread stay marked "New" for this visit.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ApiError, request } from '../api/client';
import type { components } from '../api/schema';
import { editRoleOf } from '../approvals';
import { Chip, EditLegend, EditMark, EditTag, cx, type ChipTone, type IconName } from '../ds';
import { fmtDate, fmtTime, roleLabel } from '../format';
import { Empty, Loading } from './Empty';
import { ProblemView } from './ProblemView';

type Notice = components['schemas']['Notification'];
type NoticePage = components['schemas']['PaginatedNotificationList'];

export const UNREAD_KEY = ['notifications', 'unread'] as const;
const LIST_KEY = ['notifications', 'list'] as const;

type Group = 'decision' | 'change' | 'other';
const KIND: Record<string, { label: string; tone: ChipTone; icon: IconName; group: Group }> = {
  'approval.approved': { label: 'Approved', tone: 'approved', icon: 'check', group: 'decision' },
  'approval.advanced': {
    label: 'Sent on',
    tone: 'in-review',
    icon: 'chevron-right',
    group: 'decision',
  },
  'approval.returned': {
    label: 'Returned for changes',
    tone: 'pending',
    icon: 'undo',
    group: 'decision',
  },
  'approval.rejected': { label: 'Rejected', tone: 'rejected', icon: 'x', group: 'decision' },
  'approval.pending': {
    label: 'Waiting for you',
    tone: 'in-review',
    icon: 'clock',
    group: 'decision',
  },
  'event.published': { label: 'Published', tone: 'approved', icon: 'calendar', group: 'other' },
  'registration.confirmed': {
    label: 'Registered',
    tone: 'approved',
    icon: 'check',
    group: 'other',
  },
  'registration.promoted': {
    label: 'Off the waitlist',
    tone: 'approved',
    icon: 'check',
    group: 'other',
  },
  'registration.waitlisted': {
    label: 'Waitlisted',
    tone: 'pending',
    icon: 'clock',
    group: 'other',
  },
  'feedback.requested': { label: 'Rate the event', tone: 'neutral', icon: 'clock', group: 'other' },
};
const CHANGE: Record<string, string> = {
  'event.venue_changed': 'Venue or time changed',
  'approval.sanction_changed': 'Budget changed',
};
const FILTERS: Array<{ key: 'all' | Group; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'decision', label: 'Decisions' },
  { key: 'change', label: 'Changes by approvers' },
];

const groupOf = (n: Notice): Group =>
  CHANGE[n.kind] ? 'change' : (KIND[n.kind]?.group ?? 'other');

/** "Sound: ₹12,000 → ₹10,800; Publicity: ₹2,000 → ₹1,000" as struck and coloured figures. */
function SanctionChanges({ notice }: { notice: Notice }) {
  const role = editRoleOf(notice.actor_role);
  const parts = (notice.body ?? '')
    .split('; ')
    .map((part) => /^(.*): (₹[\d,]+) → (₹[\d,]+)$/.exec(part));
  if (parts.some((p) => p === null))
    return <p className="text-body-md text-ink-muted">{notice.body}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-md">
      {parts.map((p) => (
        <li key={p![1]} className="flex flex-wrap items-center gap-x-2">
          <span className="text-ink-muted">{p![1]}</span>
          <EditMark role={role} kind="replaced" by={notice.actor_label} from={p![2]}>
            {p![3]}
          </EditMark>
        </li>
      ))}
    </ul>
  );
}

function NoticeRow({ notice, fresh }: { notice: Notice; fresh: boolean }) {
  const change = CHANGE[notice.kind];
  const kind = KIND[notice.kind];
  const role = editRoleOf(notice.actor_role);
  return (
    <li
      data-testid="notice"
      data-kind={notice.kind}
      className={cx(
        'rounded-lg border px-4 py-3.5',
        fresh ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {change ? (
          <span className={cx('flex items-center gap-1.5 label-md', `cc-role-label--${role}`)}>
            <EditTag role={role} />
            {change}
          </span>
        ) : kind ? (
          <Chip tone={kind.tone} icon={kind.icon}>
            {kind.label}
          </Chip>
        ) : (
          <Chip tone="neutral">Notice</Chip>
        )}
        {fresh ? <Chip tone="in-review">New</Chip> : null}
        <span className="caption ml-auto text-ink-muted">
          {fmtDate(notice.created_at)}, {fmtTime(notice.created_at)}
        </span>
      </div>
      <p className="title-sm mt-2">{notice.subject}</p>
      {notice.kind === 'approval.sanction_changed' ? (
        <div className="mt-1.5">
          <SanctionChanges notice={notice} />
        </div>
      ) : notice.body ? (
        <p className="mt-1 text-body-md text-ink-muted">{notice.body}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {notice.actor_label ? (
          <span className="caption">
            By <strong>{notice.actor_label}</strong>
            {notice.actor_role ? (
              <span className={cx('ml-1.5 label-md', `cc-role-label--${role}`)}>
                {roleLabel(notice.actor_role)}
              </span>
            ) : null}
          </span>
        ) : null}
        {notice.link ? (
          <Link to={notice.link} className="caption ml-auto text-primary hover:underline">
            Open it
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | Group>('all');
  const list = useQuery<NoticePage, ApiError>({
    queryKey: LIST_KEY,
    queryFn: () => request<NoticePage>('/governance/notifications', { query: { page_size: 100 } }),
  });
  // What was unread when the page opened keeps its "New" mark for this visit.
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  const markRead = useMutation<unknown, ApiError>({
    mutationFn: () => request('/governance/notifications/mark-read', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(UNREAD_KEY, { unread: 0 }),
  });
  const { mutate } = markRead;
  const results = list.data?.results;
  useEffect(() => {
    if (!results || fresh !== null) return;
    setFresh(new Set(results.filter((n) => !n.read_at).map((n) => n.id)));
    mutate();
  }, [results, fresh, mutate]);

  const all = results ?? [];
  const shown = filter === 'all' ? all : all.filter((n) => groupOf(n) === filter);
  const count = (key: 'all' | Group) =>
    key === 'all' ? all.length : all.filter((n) => groupOf(n) === key).length;

  return (
    <>
      <div className="mb-5">
        <h1>Notifications</h1>
        <p className="mt-1.5 max-w-[66ch] text-ink-muted">
          Decisions on your proposals and anything an approver changed. Each one is also mailed to
          your institutional address.
        </p>
      </div>
      <EditLegend className="mb-4" />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              'min-h-9 rounded-full border px-3.5 text-label-lg transition-colors duration-(--dur-sm)',
              filter === f.key
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-line bg-surface hover:border-primary',
            )}
          >
            {f.label} <span className="text-ink-muted">{count(f.key)}</span>
          </button>
        ))}
      </div>
      {list.isPending ? (
        <Loading label="Loading notifications…" />
      ) : list.error ? (
        <ProblemView error={list.error} />
      ) : shown.length === 0 ? (
        <Empty>
          {all.length === 0
            ? 'Nothing yet. Decisions and changes to your events appear here.'
            : 'Nothing of this kind.'}
        </Empty>
      ) : (
        <ul aria-label="Notifications" className="m-0 flex list-none flex-col gap-2.5 p-0">
          {shown.map((n) => (
            <NoticeRow key={n.id} notice={n} fresh={fresh?.has(n.id) ?? false} />
          ))}
        </ul>
      )}
    </>
  );
}
