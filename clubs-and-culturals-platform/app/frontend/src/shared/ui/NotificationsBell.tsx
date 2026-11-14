/** The bell in the top bar: the unread count, and the way to the Notifications page. */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { type ApiError, request } from '../api/client';
import { IconButton } from '../ds';
import { UNREAD_KEY } from './NotificationsPage';

export function NotificationsBell() {
  const navigate = useNavigate();
  const count = useQuery<{ unread: number }, ApiError>({
    queryKey: UNREAD_KEY,
    queryFn: () => request<{ unread: number }>('/governance/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const unread = count.data?.unread ?? 0;
  return (
    <IconButton
      icon="bell"
      size="sm"
      badge={unread}
      label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      data-testid="notifications-bell"
      onClick={() => navigate('/notifications')}
    />
  );
}
