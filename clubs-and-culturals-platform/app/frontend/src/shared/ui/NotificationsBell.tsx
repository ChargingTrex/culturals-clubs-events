/**
 * The bell in the top bar: what the system has told this person.
 *
 * Every notice the backend sends (a proposal returned or rejected, a booking moved
 * to another time or venue, a join request decided) is stored for the person and
 * mailed to their institutional address. This lists the stored ones, newest first.
 * Opening the list marks them read; the ones that were unread stay marked "New"
 * until it is closed, so the reader can tell what changed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ApiError, request } from '../api/client';
import type { components } from '../api/schema';
import { BottomSheet, Chip, IconButton, cx } from '../ds';
import { fmtDate, fmtTime } from '../format';
import { Empty, Loading } from './Empty';
import { ProblemView } from './ProblemView';

type NoticePage = components['schemas']['PaginatedNotificationList'];

const UNREAD_KEY = ['notifications', 'unread'] as const;
const LIST_KEY = ['notifications', 'list'] as const;

function NoticeList({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery<NoticePage, ApiError>({
    queryKey: LIST_KEY,
    queryFn: () => request<NoticePage>('/governance/notifications'),
  });
  const markRead = useMutation<unknown, ApiError>({
    mutationFn: () => request('/governance/notifications/mark-read', { method: 'POST' }),
    onSuccess: () => queryClient.setQueryData(UNREAD_KEY, { unread: 0 }),
  });
  const { mutate } = markRead;
  const loaded = list.isSuccess;
  // Read once the list is on screen, not when the bell is merely rendered.
  useEffect(() => {
    if (loaded) mutate();
  }, [loaded, mutate]);

  const notices = list.data?.results ?? [];
  if (list.isPending) return <Loading label="Loading notifications…" />;
  if (list.error) return <ProblemView error={list.error} />;
  if (notices.length === 0)
    return <Empty>Nothing yet. Decisions and changes to your events appear here.</Empty>;
  return (
    <ul aria-label="Notifications" className="m-0 flex list-none flex-col gap-2 p-0">
      {notices.map((n) => {
        const body = (
          <>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <strong className="min-w-0 flex-1">{n.subject}</strong>
              {n.read_at ? null : <Chip tone="in-review">New</Chip>}
            </span>
            {n.body ? <span className="block text-body-md text-ink-muted">{n.body}</span> : null}
            <span className="caption block text-ink-muted">
              {fmtDate(n.created_at)}, {fmtTime(n.created_at)}
            </span>
          </>
        );
        const cls = cx(
          'block w-full rounded-md border px-3 py-2.5 text-left',
          n.read_at ? 'border-line' : 'border-primary bg-primary-soft',
        );
        return (
          <li key={n.id} data-testid="notice">
            {n.link ? (
              <button
                type="button"
                className={cx(cls, 'transition-colors duration-(--dur-sm) hover:border-primary')}
                onClick={() => {
                  onClose();
                  navigate(n.link ?? '/');
                }}
              >
                {body}
              </button>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NotificationsBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const count = useQuery<{ unread: number }, ApiError>({
    queryKey: UNREAD_KEY,
    queryFn: () => request<{ unread: number }>('/governance/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const unread = count.data?.unread ?? 0;
  return (
    <>
      <IconButton
        icon="bell"
        size="sm"
        badge={unread}
        label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        data-testid="notifications-bell"
        onClick={() => setOpen(true)}
      />
      {open ? (
        <BottomSheet
          title="Notifications"
          onClose={() => {
            setOpen(false);
            // The list was read while open; the next opening shows it without the "New" marks.
            void queryClient.invalidateQueries({ queryKey: LIST_KEY });
          }}
        >
          <NoticeList onClose={() => setOpen(false)} />
        </BottomSheet>
      ) : null}
    </>
  );
}
