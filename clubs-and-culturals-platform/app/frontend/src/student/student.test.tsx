import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../test/capabilities';
import { renderAt } from '../test/render';
import { state } from '../test/server';

describe('student journey', () => {
  it('register → pass visible under My passes', async () => {
    const user = userEvent.setup();
    renderAt('/events/e1', { roles: ['student'] });

    await screen.findByRole('heading', { name: 'Lens Heritage Photowalk' });
    await user.click(await screen.findByRole('button', { name: 'Register' }));

    await screen.findByRole('heading', { name: 'You are registered' });
    expect(screen.getByText('Registered — your pass is ready')).toBeInTheDocument();
    expect(state.registrations).toHaveLength(1);

    await user.click(screen.getByRole('link', { name: 'View pass' }));
    await screen.findByRole('heading', { name: 'My passes' });
    const pass = await screen.findByTestId('pass');
    expect(within(pass).getByText('Lens Heritage Photowalk')).toBeInTheDocument();
    expect(within(pass).getByText('Valid — not yet used')).toBeInTheDocument();
    const qr = await within(pass).findByRole('img', {
      name: 'Pass QR for Lens Heritage Photowalk',
    });
    expect(qr).toHaveAttribute('data-qr-value', 'pass.reg-1');

    // Tap → full-screen bright view with the same code.
    await user.click(within(pass).getByRole('button', { name: /full screen/ }));
    const bright = await screen.findByTestId('bright-view');
    expect(within(bright).getByRole('img')).toHaveAttribute('data-qr-value', 'pass.reg-1');
  });

  it('event full → the API 409 is shown as a message with its code', async () => {
    const user = userEvent.setup();
    renderAt('/events/e2', { roles: ['student'] });

    await screen.findByRole('heading', { name: 'Byte Hack Night' });
    expect(screen.getByTestId('capacity')).toHaveTextContent('40 of 40 places taken');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    const problem = await screen.findByTestId('problem');
    expect(problem).toHaveAttribute('data-code', 'PARTICIPATION_EVENT_FULL');
    expect(problem).toHaveTextContent('This event is full.');
    expect(problem).toHaveTextContent('409 · PARTICIPATION_EVENT_FULL');
    expect(state.registrations).toHaveLength(0);
  });

  it('cancel → registration gone and pass removed', async () => {
    const user = userEvent.setup();
    state.registrations.push({
      id: 'reg-9',
      event: 'e1',
      attended: false,
      pass_token: 'pass.reg-9',
    });
    renderAt('/events/e1', { roles: ['student'] });

    await screen.findByRole('heading', { name: 'You are registered' });
    await user.click(screen.getByRole('button', { name: 'Cancel registration' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    await screen.findByRole('heading', { name: 'Register' });
    expect(state.registrations).toHaveLength(0);
  });

  it('reissue → old token gone, new version shown', async () => {
    const user = userEvent.setup();
    renderAt('/profile', { roles: ['student'] });

    expect(await screen.findByTestId('profile-token')).toHaveTextContent('profile-token-v1');
    expect(screen.getByTestId('profile-version')).toHaveTextContent('v1');
    expect(await screen.findByRole('img', { name: 'Profile QR' })).toHaveAttribute(
      'data-qr-value',
      'profile-token-v1',
    );

    await user.click(screen.getByRole('button', { name: 'Lost your phone? Reissue' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reissue' }));

    await waitFor(() =>
      expect(screen.getByTestId('profile-token')).toHaveTextContent('profile-token-v2'),
    );
    expect(screen.queryByText('profile-token-v1')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-version')).toHaveTextContent('v2');
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Profile QR' })).toHaveAttribute(
        'data-qr-value',
        'profile-token-v2',
      ),
    );
    expect(screen.getByText('Reissued — the old code no longer works')).toBeInTheDocument();
  });

  it("lists what's on with filters by club", async () => {
    const user = userEvent.setup();
    renderAt('/events', { roles: ['student'] });
    expect(await screen.findAllByTestId('event-row')).toHaveLength(2);
    await user.selectOptions(await screen.findByLabelText('Club'), 'club-byte');
    await waitFor(() => expect(screen.getAllByTestId('event-row')).toHaveLength(1));
    expect(screen.getByText('Byte Hack Night')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Club'), '');
    await user.selectOptions(screen.getByLabelText('Category'), 'cultural');
    await waitFor(() => expect(screen.getAllByTestId('event-row')).toHaveLength(1));
    expect(screen.getByText('Lens Heritage Photowalk')).toBeInTheDocument();
  });

  it('desktop search: finds events by title or club, and clears', async () => {
    const user = userEvent.setup();
    renderAt('/events', { roles: ['student'] });
    expect(await screen.findAllByTestId('event-row')).toHaveLength(2);

    await user.type(
      screen.getByRole('searchbox', { name: 'Search events and clubs' }),
      'hack{Enter}',
    );
    await waitFor(() => expect(screen.getAllByTestId('event-row')).toHaveLength(1));
    expect(screen.getByText('Byte Hack Night')).toBeInTheDocument();

    // Matches the club name too.
    const box = screen.getByRole('searchbox', { name: 'Search events and clubs' });
    await user.clear(box);
    await user.type(box, 'lens{Enter}');
    await waitFor(() => expect(screen.getAllByTestId('event-row')).toHaveLength(1));
    expect(screen.getByText('Lens Heritage Photowalk')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(screen.getAllByTestId('event-row')).toHaveLength(2));
  });
});

describe('sign-in', () => {
  it('reveals the MFA field after AUTH_MFA_REQUIRED and then signs the Dean in', async () => {
    const user = userEvent.setup();
    renderAt('/signin');

    expect(screen.queryByTestId('mfa-row')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Institutional email'), 'dean@college.edu');
    await user.type(screen.getByLabelText('Password'), 'culturals-demo');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const problem = await screen.findByTestId('problem');
    expect(problem).toHaveAttribute('data-code', 'AUTH_MFA_REQUIRED');
    const mfa = await screen.findByLabelText(/Authenticator code/);
    expect(mfa).toHaveFocus();

    await user.type(mfa, '123456');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    // The Dean lands on the first page the role is offered.
    await screen.findByRole('heading', { name: 'Dean approvals' });
  });

  it('shows a wrong password as the API says it', async () => {
    const user = userEvent.setup();
    renderAt('/signin');
    await user.type(screen.getByLabelText('Institutional email'), 'meera@college.edu');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('problem')).toHaveAttribute(
      'data-code',
      'AUTH_INVALID_CREDENTIALS',
    );
    expect(screen.queryByTestId('mfa-row')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to /signin and back afterwards', async () => {
    const user = userEvent.setup();
    renderAt('/passes');
    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText('Institutional email'), 'meera@college.edu');
    await user.type(screen.getByLabelText('Password'), 'culturals-demo');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'My passes' });
  });
});

describe('navigation and guards', () => {
  it('offers a student exactly three pages', async () => {
    renderAt('/events', { roles: ['student'] });
    const nav = await screen.findByTestId('nav-sidebar');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(["What's on", 'My passes', 'Profile QR']);
  });

  it('offers a president eight pages on phones: four on the bottom bar, four under More', async () => {
    const user = userEvent.setup();
    renderAt('/events', { roles: [...PERSONAS.president] });
    const nav = await screen.findByTestId('nav-bottom');
    // Design system: a bottom bar holds at most five destinations.
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    await user.click(within(nav).getByRole('button', { name: 'More' }));
    const more = await screen.findByTestId('nav-more');
    expect(within(more).getAllByRole('link')).toHaveLength(4);
  });

  it("renders the API's own refusal when a student opens a staff page", async () => {
    renderAt('/staff/report', { roles: ['student'] });
    const problem = await screen.findByTestId('problem');
    expect(problem).toHaveAttribute('data-code', 'REPORTING_DENIED');
    expect(problem).toHaveTextContent('This is the rule refusing');
  });
});
