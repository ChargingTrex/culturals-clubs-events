import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../shared/api/client';
import { renderAt } from '../test/render';
import { server } from '../test/server';
import type { SocietyMember, SocietyRoster } from './api';

const member = (over: Partial<SocietyMember>): SocietyMember => ({
  user_id: 'u-1',
  display_name: 'Nivedita Raman',
  email: 'cultural.secretary@college.edu',
  role: 'cultural_society_secretary',
  role_label: 'Secretary',
  can_remove: false,
  ...over,
});

const plain = member({
  user_id: 'u-3',
  display_name: 'Sana Fathima',
  email: 'cultural.member@college.edu',
  role: 'cultural_society',
  role_label: 'Member',
  can_remove: true,
});

const URL = `${API_BASE}/module/cultural-society/members`;

function serve(roster: SocietyRoster) {
  server.use(http.get(URL, () => HttpResponse.json(roster)));
}

describe('Society members (AR-08)', () => {
  it('an officer adds a member by email and removes one, with a confirm step', async () => {
    serve({ members: [member({}), plain], can_manage: true, can_appoint_officers: false });
    let added: unknown = null;
    let removed = '';
    server.use(
      http.post(URL, async ({ request }) => {
        added = await request.json();
        return HttpResponse.json({ members: [member({}), plain], can_manage: true, can_appoint_officers: false }, { status: 201 });
      }),
      http.delete(`${URL}/:id`, ({ params }) => {
        removed = String(params.id);
        return HttpResponse.json({ members: [member({})], can_manage: true, can_appoint_officers: false });
      }),
    );
    const user = userEvent.setup();
    renderAt('/staff/society', { roles: ['cultural_society_secretary'] });
    const form = await screen.findByRole('form', { name: 'Add to the Society' });
    // Only the Dean appoints officers, so an officer is not offered a role to pick.
    expect(within(form).queryByLabelText('Role')).toBeNull();
    await user.type(within(form).getByLabelText('Institutional email'), 'new@college.edu');
    await user.click(within(form).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(added).toEqual({ email: 'new@college.edu', role: 'cultural_society' }));

    // The Secretary's own row has no Remove; the member's does.
    expect(screen.queryByRole('button', { name: 'Remove Nivedita Raman' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove Sana Fathima' }));
    expect(removed).toBe('');
    await user.click(screen.getByRole('button', { name: 'Confirm removing Sana Fathima' }));
    await waitFor(() => expect(removed).toBe('u-3'));
    await waitFor(() => expect(screen.queryByText('Sana Fathima')).toBeNull());
  });

  it('a plain member reads the roster and can change nothing', async () => {
    serve({ members: [member({}), { ...plain, can_remove: false }], can_manage: false, can_appoint_officers: false });
    renderAt('/staff/society', { roles: ['cultural_society'] });
    expect(await screen.findByText('Sana Fathima')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Add to the Society' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('the Dean is offered the officer roles', async () => {
    serve({ members: [member({ can_remove: true })], can_manage: true, can_appoint_officers: true });
    renderAt('/staff/society', { roles: ['dean'] });
    const form = await screen.findByRole('form', { name: 'Add to the Society' });
    expect(within(form).getByRole('option', { name: 'Vice-Secretary' })).toBeInTheDocument();
  });
});
