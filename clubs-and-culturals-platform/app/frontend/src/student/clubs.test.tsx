/**
 * F-06 / F-07 / F-08 — the club directory, the feed order and the settings
 * switch, against the MSW stand-in (src/test/server.ts).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { API_BASE } from '../shared/api/client';
import { renderAt } from '../test/render';
import { problem, server, state } from '../test/server';

describe('clubs directory (F-06.1)', () => {
  it('joins an open club and shows the new standing', async () => {
    const user = userEvent.setup();
    renderAt('/clubs', { roles: ['student'] });
    expect(await screen.findByTestId('membership-strip')).toHaveTextContent("You're in 0 of 5");
    await user.click(await screen.findByRole('button', { name: 'Join Lens' }));
    await screen.findByText('You joined Lens');
    expect(state.roles).toContain('club_member:club-lens');
    const card = await screen.findByText('Lens').then((n) => n.closest('li')!);
    await waitFor(() => expect(within(card).getByText('Member')).toBeInTheDocument());
    expect(within(card).getByRole('button', { name: 'Leave Lens' })).toBeInTheDocument();
    expect(screen.getByTestId('membership-strip')).toHaveTextContent("You're in 1 of 5");
  });

  it('marks an approval club "Requested" after asking to join', async () => {
    const user = userEvent.setup();
    renderAt('/clubs', { roles: ['student'] });
    await user.click(await screen.findByRole('button', { name: 'Request to join Byte' }));
    await screen.findByText('Asked to join Byte');
    const card = screen.getByText('Byte').closest('li')!;
    await waitFor(() => expect(within(card).getByText('Requested')).toBeInTheDocument());
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });

  it('at the cap: every Join is disabled and the strip says why', async () => {
    renderAt('/clubs', {
      roles: [
        'student',
        'club_member:c-1',
        'club_member:c-2',
        'club_member:c-3',
        'club_member:c-4',
        'club_member:c-5',
      ],
    });
    expect(await screen.findByTestId('membership-strip')).toHaveTextContent(
      "You're in 5 of 5 clubs — leave one to join another.",
    );
    expect(await screen.findByRole('button', { name: 'Join Lens' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request to join Byte' })).toBeDisabled();
  });

  it('shows the API refusal when the server says the cap is reached', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE}/clubs/club-lens/join`, () =>
        problem(
          409,
          'CLUBS_MEMBERSHIP_LIMIT',
          'Club limit reached',
          'You can be a member of up to 5 clubs. Leave one to join another.',
        ),
      ),
    );
    renderAt('/clubs', { roles: ['student'] });
    await user.click(await screen.findByRole('button', { name: 'Join Lens' }));
    const refusal = await screen.findByTestId('problem');
    expect(refusal).toHaveAttribute('data-code', 'CLUBS_MEMBERSHIP_LIMIT');
    expect(refusal).toHaveTextContent('Leave one to join another.');
  });

  it('refuses Leave for an office bearer with the API message, and lets a member leave', async () => {
    const user = userEvent.setup();
    renderAt('/clubs', { roles: ['student', 'club_treasurer:club-lens', 'club_member:club-byte'] });
    await user.click(await screen.findByRole('button', { name: 'Leave Lens' }));
    await user.click(screen.getByRole('button', { name: 'Yes, leave' }));
    const refusal = await screen.findByTestId('problem');
    expect(refusal).toHaveAttribute('data-code', 'CLUBS_OFFICE_BEARER_CANNOT_LEAVE');
    expect(refusal).toHaveTextContent('You are Treasurer of Lens. Hand the office over');
    expect(state.roles).toContain('club_treasurer:club-lens');

    const byte = screen.getByText('Byte').closest('li')!;
    await user.click(within(byte).getByRole('button', { name: 'Leave Byte' }));
    await user.click(within(byte).getByRole('button', { name: 'Yes, leave' }));
    await screen.findByText('You left Byte');
    expect(state.roles).not.toContain('club_member:club-byte');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Request to join Byte' })).toBeInTheDocument(),
    );
  });
});

describe('feed (F-07)', () => {
  const order = () =>
    screen.getAllByTestId('feed-card').map((card) => card.getAttribute('data-event'));

  it('is campus-wide in date order when the preference is off', async () => {
    renderAt('/feed', { roles: ['student', 'club_member:club-byte'] });
    await screen.findAllByTestId('feed-card');
    expect(order()).toEqual(['e1', 'e2']);
    expect(screen.queryByText('From your clubs')).not.toBeInTheDocument();
  });

  it('puts my clubs first, with dividers, when the preference is on', async () => {
    state.preferences = { personalised_feed: true };
    renderAt('/feed', { roles: ['student', 'club_member:club-byte'] });
    await screen.findAllByTestId('feed-card');
    expect(order()).toEqual(['e2', 'e1']);
    expect(screen.getByText('From your clubs')).toBeInTheDocument();
    expect(screen.getByText('Across campus')).toBeInTheDocument();
  });

  it('searches server-side and points a clubless student at the directory', async () => {
    const user = userEvent.setup();
    renderAt('/feed', { roles: ['student'] });
    expect(await screen.findByTestId('no-clubs-note')).toHaveTextContent(
      'Nothing from your clubs yet',
    );
    expect(within(screen.getByTestId('no-clubs-note')).getByRole('link')).toHaveAttribute(
      'href',
      '/clubs',
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search the feed' }), 'hack{Enter}');
    await waitFor(() => expect(order()).toEqual(['e2']));
  });

  it('reads Live only between start and end', async () => {
    const now = Date.now();
    state.events[0]!.starts_at = new Date(now - 60_000).toISOString();
    state.events[0]!.ends_at = new Date(now + 60_000).toISOString();
    state.events[1]!.starts_at = new Date(now - 7_200_000).toISOString();
    state.events[1]!.ends_at = new Date(now - 3_600_000).toISOString();
    renderAt('/feed', { roles: ['student'] });
    const cards = await screen.findAllByTestId('feed-card');
    const byId = (id: string) => cards.find((c) => c.getAttribute('data-event') === id)!;
    expect(within(byId('e1')).getByText('Live')).toBeInTheDocument();
    expect(within(byId('e2')).getByText('Ended')).toBeInTheDocument();
  });
});

describe('profile settings (F-08.2)', () => {
  it('toggles the personalised feed with a PATCH and keeps the server answer', async () => {
    const user = userEvent.setup();
    renderAt('/profile?tab=settings', { roles: ['student'] });
    const toggle = await screen.findByRole('switch', { name: 'Personalised feed' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(state.preferences.personalised_feed).toBe(true));
    expect(screen.getByRole('switch', { name: 'Personalised feed' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('reverts the switch and shows the API error when the PATCH fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(`${API_BASE}/module/auth/preferences`, () =>
        problem(422, 'VALIDATION_FAILED', 'Validation failed', 'Not a preference.'),
      ),
    );
    renderAt('/profile?tab=settings', { roles: ['student'] });
    await user.click(await screen.findByRole('switch', { name: 'Personalised feed' }));
    const refusal = await screen.findByTestId('problem');
    expect(refusal).toHaveAttribute('data-code', 'VALIDATION_FAILED');
    expect(screen.getByRole('switch', { name: 'Personalised feed' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(state.preferences.personalised_feed).toBe(false);
  });

  it('lists my clubs with a role and pending requests', async () => {
    state.pendingJoins.add('club-byte');
    renderAt('/profile?tab=clubs', { roles: ['student', 'club_treasurer:club-lens'] });
    const list = await screen.findByTestId('my-clubs');
    expect(within(list).getByText('Lens')).toBeInTheDocument();
    expect(within(list).getByText(/Treasurer/)).toBeInTheDocument();
    const pending = screen.getByRole('region', { name: 'Pending requests' });
    expect(within(pending).getByText('Byte')).toBeInTheDocument();
  });

  it('keeps the QR tab as it was and lists attended events', async () => {
    state.registrations.push({ id: 'reg-5', event: 'e1', attended: true, pass_token: null });
    renderAt('/profile', { roles: ['student'] });
    expect(await screen.findByTestId('profile-token')).toHaveTextContent('profile-token-v1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Attendance' }));
    expect(await screen.findByText('Lens Heritage Photowalk')).toBeInTheDocument();
  });
});
