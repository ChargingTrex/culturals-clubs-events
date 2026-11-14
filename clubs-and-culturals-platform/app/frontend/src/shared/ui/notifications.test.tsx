import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../api/client';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

const B = API_BASE;

describe('notifications bell', () => {
  it('shows the unread count, lists what was sent, and marks it read on opening', async () => {
    let marked = false;
    server.use(
      http.get(`${B}/governance/notifications/unread-count`, () =>
        HttpResponse.json({ unread: marked ? 0 : 1 }),
      ),
      http.get(`${B}/governance/notifications`, () =>
        HttpResponse.json({
          count: 2,
          next: null,
          previous: null,
          results: [
            {
              id: 'n-1',
              subject: '“Acoustic Sundown” was moved to Amphitheatre',
              body: 'Thu 26 Nov, 18:00 at Amphitheatre. Moved from Music Room. Reason: exam in the Music Room',
              kind: 'event.venue_changed',
              link: '/club/events/e1',
              read_at: null,
              created_at: '2026-11-14T10:00:00Z',
            },
            {
              id: 'n-2',
              subject: 'Returned for changes',
              body: '',
              kind: 'approval.returned',
              link: '',
              read_at: '2026-11-10T10:00:00Z',
              created_at: '2026-11-10T09:00:00Z',
            },
          ],
        }),
      ),
      http.post(`${B}/governance/notifications/mark-read`, () => {
        marked = true;
        return HttpResponse.json({ marked: 1 });
      }),
    );
    const user = userEvent.setup();
    renderAt('/club/events', { roles: ['student', 'club_president:club-lens'] });
    const bells = await screen.findAllByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bells[0]!);
    const sheet = await screen.findByRole('dialog', { name: 'Notifications' });
    const notices = await within(sheet).findAllByTestId('notice');
    expect(notices).toHaveLength(2);
    expect(within(notices[0]!).getByText('New')).toBeInTheDocument();
    expect(within(notices[0]!).getByText(/Moved from Music Room/)).toBeInTheDocument();
    expect(within(notices[1]!).queryByText('New')).toBeNull();
    await waitFor(() => expect(marked).toBe(true));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications' }).length).toBeGreaterThan(0),
    );
    // A notice with a link opens the page it is about.
    await user.click(within(notices[0]!).getByRole('button'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull());
  });
});
