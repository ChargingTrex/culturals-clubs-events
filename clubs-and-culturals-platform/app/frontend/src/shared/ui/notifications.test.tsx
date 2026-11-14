import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../api/client';
import { renderAt } from '../../test/render';
import { server } from '../../test/server';

const B = API_BASE;

const notice = (over: Record<string, unknown>) => ({
  id: 'n-0',
  subject: '',
  body: '',
  kind: 'approval.approved',
  link: '/club/events/e1',
  actor_label: '',
  actor_role: '',
  read_at: '2026-11-10T10:00:00Z',
  created_at: '2026-11-10T09:00:00Z',
  ...over,
});

const NOTICES = [
  notice({
    id: 'n-1',
    kind: 'event.venue_changed',
    subject: '“Acoustic Sundown” was moved to Amphitheatre',
    body: 'Mon 30 Nov, 18:00 at Amphitheatre. Was Mon 30 Nov, 17:00 at Music Room. Reason: exam',
    actor_label: 'Nivedita Raman',
    actor_role: 'cultural_society_secretary',
    read_at: null,
  }),
  notice({
    id: 'n-2',
    kind: 'approval.sanction_changed',
    subject: 'The Dean changed the budget for “Founders’ Day Concert”',
    body: 'Sound & lighting: ₹12,000 → ₹10,200; Publicity: ₹2,000 → ₹1,000',
    actor_label: 'Dr. Revathi Srinivasan',
    actor_role: 'dean',
  }),
  notice({
    id: 'n-3',
    kind: 'approval.rejected',
    subject: '“Laser Light Night” was rejected',
    body: 'Vice-Chancellor: The laser rig has no safety clearance.',
    actor_label: 'Prof. K. Ramanathan',
    actor_role: 'vice_chancellor',
  }),
  notice({
    id: 'n-4',
    kind: 'approval.approved',
    subject: '“Founders’ Day Concert” is approved and published',
  }),
];

function serve() {
  let marked = false;
  server.use(
    http.get(`${B}/governance/notifications/unread-count`, () =>
      HttpResponse.json({ unread: marked ? 0 : 1 }),
    ),
    http.get(`${B}/governance/notifications`, () =>
      HttpResponse.json({ count: NOTICES.length, next: null, previous: null, results: NOTICES }),
    ),
    http.post(`${B}/governance/notifications/mark-read`, () => {
      marked = true;
      return HttpResponse.json({ marked: 1 });
    }),
  );
  return () => marked;
}

describe('notifications', () => {
  it('the bell shows the unread count and opens the page, which marks them read', async () => {
    const marked = serve();
    const user = userEvent.setup();
    renderAt('/club/events', { roles: ['student', 'club_president:club-lens'] });
    const bells = await screen.findAllByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bells[0]!);
    expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    const rows = await screen.findAllByTestId('notice');
    expect(rows).toHaveLength(4);
    // What was unread is marked New for this visit, and the server is told it was read.
    expect(within(rows[0]!).getByText('New')).toBeInTheDocument();
    expect(within(rows[1]!).queryByText('New')).toBeNull();
    await waitFor(() => expect(marked()).toBe(true));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications' }).length).toBeGreaterThan(0),
    );
  });

  it('draws approver changes in the edit colours: violet for the Society and Dean, teal for the VC', async () => {
    serve();
    renderAt('/notifications', { roles: ['student', 'club_president:club-lens'] });
    const rows = await screen.findAllByTestId('notice');
    expect(screen.getByRole('note', { name: 'Edit colour key' })).toBeInTheDocument();

    // A move by the Society's Secretary: an Admin (violet) change, attributed.
    const move = rows[0]!;
    expect(within(move).getByText('Venue or time changed')).toHaveClass('cc-role-label--admin');
    expect(within(move).getByText('Cultural society secretary')).toHaveClass(
      'cc-role-label--admin',
    );
    expect(within(move).getByText('Nivedita Raman')).toBeInTheDocument();

    // The Dean's cut: each head as struck old figure → new figure.
    const cut = rows[1]!;
    expect(within(cut).getByText('Budget changed')).toBeInTheDocument();
    expect(within(cut).getByText('₹12,000').tagName).toBe('DEL');
    expect(within(cut).getByText('₹10,200').tagName).toBe('INS');
    expect(within(cut).getByText('₹10,200')).toHaveClass('cc-edit--admin');
    expect(within(cut).getByText('Publicity')).toBeInTheDocument();

    // The Vice-Chancellor's rejection: a red Rejected chip, and the role in Management teal.
    const rejected = rows[2]!;
    expect(within(rejected).getByText('Rejected')).toBeInTheDocument();
    expect(within(rejected).getByText('Vice chancellor')).toHaveClass('cc-role-label--management');
    expect(within(rejected).getByRole('link', { name: 'Open it' })).toHaveAttribute(
      'href',
      '/club/events/e1',
    );
  });

  it('filters to decisions or to changes by approvers', async () => {
    serve();
    const user = userEvent.setup();
    renderAt('/notifications', { roles: ['student', 'club_president:club-lens'] });
    await screen.findAllByTestId('notice');
    await user.click(screen.getByRole('button', { name: /Changes by approvers 2/ }));
    expect(screen.getAllByTestId('notice').map((r) => r.dataset.kind)).toEqual([
      'event.venue_changed',
      'approval.sanction_changed',
    ]);
    await user.click(screen.getByRole('button', { name: /Decisions 2/ }));
    expect(screen.getAllByTestId('notice').map((r) => r.dataset.kind)).toEqual([
      'approval.rejected',
      'approval.approved',
    ]);
  });
});
