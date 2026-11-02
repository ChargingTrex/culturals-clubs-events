/**
 * F-04 club screens against MSW: the Treasurer prices a draft and sends it,
 * the roster renders with role controls for the President, and a Secretary's
 * proposal posts the form as the API expects it.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../shared/api/client';
import type { EventOut } from '../shared/api/types';
import { renderAt } from '../test/render';
import { server, state } from '../test/server';
import type { Budget, BudgetLine, ClubMembers, EventCreate } from './api';

const B = API_BASE;

const draftEvent = (over: Partial<EventOut> = {}): EventOut => ({
  ...state.events[0]!,
  id: 'e-draft',
  title: 'Monsoon Unplugged',
  club: 'club-lens',
  club_name: 'Lens',
  status: 'draft',
  status_label: 'Draft',
  registered: 0,
  budget: {
    id: 'b1',
    stage: 'draft',
    stage_label: 'Draft',
    total_requested: '0.00',
    total_sanctioned: '0.00',
    total_spent: '0.00',
  },
  ...over,
});

const makeBudget = (lines: BudgetLine[] = []): Budget => {
  const total = lines.reduce((s, l) => s + Number(l.amount_requested), 0);
  return {
    id: 'b1',
    event: 'e-draft',
    fest: null,
    stage: 'draft',
    stage_label: 'Draft',
    lines,
    total_requested: total.toFixed(2),
    total_sanctioned: '0.00',
    total_spent: '0.00',
    settled_at: null,
    settlement_problems: [],
    thresholds: { receipt_threshold: 2000, vc_threshold: 50000 },
    nil_declaration: null,
    is_editable: true,
    is_ready_to_submit: lines.length > 0,
    can_settle: false,
    settlement_waiting_on: null,
    settlement_hint: null,
    envelope: {
      year: 2026,
      amount: '100000.00',
      sanctioned_to_date: '25000.00',
      settled_to_date: '20000.00',
      remaining: '75000.00',
    },
  };
};

const line = (head: string, amount: string): BudgetLine => ({
  id: `line-${head}`,
  head,
  basis: 'lump_sum',
  amount_requested: amount,
  amount_sanctioned: null,
  amount_spent: null,
  variance_note: '',
  is_overspent: false,
  receipts: [],
  position: 0,
});

const approvalsEmpty = http.get(`${B}/governance/approvals`, () =>
  HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
);

describe('F-04 club screens', () => {
  it('Treasurer adds a budget line, then sends the proposal for approval', async () => {
    state.events.push(draftEvent());
    let budget = makeBudget();
    let submitted = false;
    server.use(
      http.get(`${B}/budget/budgets/b1`, () => HttpResponse.json(budget)),
      http.post(`${B}/budget/budgets/b1/lines`, async ({ request }) => {
        const body = (await request.json()) as { head: string; amount_requested: string };
        budget = makeBudget([line(body.head, `${body.amount_requested}.00`)]);
        return HttpResponse.json(budget, { status: 201 });
      }),
      http.post(`${B}/events/e-draft/submit`, () => {
        submitted = true;
        return HttpResponse.json({
          id: 'ar-1',
          stages: ['cultural_society', 'dean'],
          current_stage: 'cultural_society',
          requires_vc: false,
          vc_reason: '',
          soft_clashes: [],
        });
      }),
    );

    const user = userEvent.setup();
    renderAt('/club/budget/b1', { roles: ['student', 'club_treasurer:club-lens'] });

    expect(await screen.findByRole('heading', { name: 'Monsoon Unplugged' })).toBeInTheDocument();
    expect(screen.getByTestId('envelope')).toHaveTextContent('₹75,000 left of ₹1,00,000');
    expect(screen.queryByRole('button', { name: 'Send for approval' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Add an entry'), 'Sound & lighting');
    await user.type(screen.getByLabelText('Amount (₹)'), '12000');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByTestId('budget-line')).toHaveTextContent('Sound & lighting');
    expect(screen.getByTestId('total-requested')).toHaveTextContent('₹12,000');

    await user.click(await screen.findByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(submitted).toBe(true));
    expect(await screen.findByText(/Sent for approval — 2 gates/)).toBeInTheDocument();
  });

  it('shows the API refusal when a line cannot be added', async () => {
    state.events.push(draftEvent());
    server.use(
      http.get(`${B}/budget/budgets/b1`, () => HttpResponse.json(makeBudget())),
      http.post(`${B}/budget/budgets/b1/lines`, () =>
        HttpResponse.json(
          {
            title: 'Not permitted',
            status: 403,
            code: 'BUDGET_PREPARE_DENIED',
            detail: 'Only the President, Vice-President or Treasurer may build the budget.',
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAt('/club/budget/b1', { roles: ['student', 'club_treasurer:club-lens'] });
    await user.type(await screen.findByLabelText('Add an entry'), 'Snacks');
    await user.type(screen.getByLabelText('Amount (₹)'), '500');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const problem = await screen.findByTestId('problem');
    expect(problem).toHaveAttribute('data-code', 'BUDGET_PREPARE_DENIED');
  });

  it('renders the roster, with role controls and the join queue for the President', async () => {
    const roster: ClubMembers = {
      club: { id: 'club-lens', name: 'Lens', join_mode: 'approval' },
      can_assign_roles: true,
      results: [
        {
          id: 'm1',
          club: 'club-lens',
          student: 's1',
          prn: '23LA1041',
          full_name: 'Meera Iyer',
          department: 'LAW',
          programme: 'BA-LLB',
          year: 3,
          role: 'club_president',
          role_label: 'President',
          joined_at: '2026-06-01T00:00:00Z',
          ended_at: null,
        },
        {
          id: 'm2',
          club: 'club-lens',
          student: 's2',
          prn: '24EC1003',
          full_name: 'Kabir Shah',
          department: 'ECE',
          programme: 'BTech-ECE',
          year: 2,
          role: 'club_member',
          role_label: 'Member',
          joined_at: '2026-07-01T00:00:00Z',
          ended_at: null,
        },
      ],
      recent_changes: [],
      pending_join_requests: 1,
    };
    let roleBody: unknown = null;
    server.use(
      http.get(`${B}/clubs/club-lens/members`, () => HttpResponse.json(roster)),
      http.get(`${B}/clubs/club-lens/join-requests`, () =>
        HttpResponse.json({
          club: roster.club,
          results: [
            {
              id: 'jr1',
              club: 'club-lens',
              student: 's3',
              prn: '25CS1005',
              full_name: 'Divya R',
              department: 'CSE',
              programme: 'BTech-CSE',
              year: 1,
              state: 'pending',
              note: '',
              decided_by_label: '',
              decided_at: null,
              created_at: '2026-10-30T00:00:00Z',
            },
          ],
        }),
      ),
      http.get(`${B}/clubs/club-lens/office-bearers/history`, () =>
        HttpResponse.json({ club: { id: 'club-lens', name: 'Lens' }, current: [], results: [] }),
      ),
      http.post(`${B}/memberships/m2/role`, async ({ request }) => {
        roleBody = await request.json();
        return HttpResponse.json({
          ...roster.results[1],
          role: 'club_treasurer',
          role_label: 'Treasurer',
        });
      }),
    );

    const user = userEvent.setup();
    renderAt('/club/roster', { roles: ['student', 'club_president:club-lens'] });

    expect(await screen.findByRole('heading', { name: 'Lens members' })).toBeInTheDocument();
    const rows = await screen.findAllByTestId('member-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText('24EC1003')).toBeInTheDocument();
    expect(screen.getByText('1 waiting to join')).toBeInTheDocument();
    expect(await screen.findByText('Divya R')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Role for Kabir Shah'), 'club_treasurer');
    await waitFor(() => expect(roleBody).toEqual({ role: 'club_treasurer' }));
    expect(await screen.findByText('Kabir Shah is now Treasurer')).toBeInTheDocument();
  });

  it('a plain member sees the roster read-only', async () => {
    server.use(
      http.get(`${B}/clubs/club-lens/members`, () =>
        HttpResponse.json({
          club: { id: 'club-lens', name: 'Lens', join_mode: 'open' },
          can_assign_roles: false,
          results: [],
          recent_changes: [],
        } satisfies ClubMembers),
      ),
    );
    renderAt('/club/roster', { roles: ['student', 'club_member:club-lens'] });
    expect(await screen.findByRole('heading', { name: 'Lens members' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Handover' })).not.toBeInTheDocument();
  });

  it('a Secretary proposes an event from a template and it posts the form', async () => {
    let posted: EventCreate | null = null;
    server.use(
      http.get(`${B}/venues`, () =>
        HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            { id: 'venue-1', name: 'Open Air Theatre', capacity: 400, location: '', active: true },
          ],
        }),
      ),
      http.get(`${B}/budget/budget-templates`, ({ request }) => {
        const expected = Number(new URL(request.url).searchParams.get('expected_attendance'));
        return HttpResponse.json({
          expected_attendance: expected,
          templates: [
            {
              name: 'Cultural night',
              event_kind: 'performance',
              lines: [
                {
                  head: 'Sound & lighting',
                  basis: 'lump_sum',
                  rate: '12000',
                  amount: '12000.00',
                  explanation: 'lump sum',
                },
              ],
              contingency: { percent: 10, amount: '1200.00' },
              total_requested: '13200.00',
              requires_vc: false,
              vc_threshold: 50000,
            },
          ],
        });
      }),
      http.post(`${B}/events`, async ({ request }) => {
        posted = (await request.json()) as EventCreate;
        state.events.push(draftEvent({ id: 'e-new', title: posted.title, status: 'submitted' }));
        return HttpResponse.json(
          {
            ...draftEvent({ id: 'e-new', title: posted.title, status: 'submitted' }),
            soft_clashes: [],
            approval: {
              id: 'ar-2',
              stages: ['cultural_society', 'dean'],
              current_stage: 'cultural_society',
              requires_vc: false,
              vc_reason: '',
            },
          },
          { status: 201 },
        );
      }),
      approvalsEmpty,
    );

    const user = userEvent.setup();
    renderAt('/club/events/new', { roles: ['student', 'club_secretary:club-lens'] });

    await user.type(await screen.findByLabelText('Title'), 'Monsoon Unplugged');
    await user.selectOptions(await screen.findByLabelText('Venue'), 'venue-1');
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-12-05T18:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-12-05T21:00' } });
    await user.selectOptions(await screen.findByLabelText('Template'), 'Cultural night');
    expect(await screen.findByTestId('template-total')).toHaveTextContent('₹13,200');
    await user.click(screen.getByRole('button', { name: 'Propose and send' }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      club: 'club-lens',
      title: 'Monsoon Unplugged',
      venue: 'venue-1',
      kind: 'performance',
      capacity: 100,
      expected_attendance: 80,
      budget_template: 'Cultural night',
      submit: true,
    });
    expect(posted!.starts_at).toBe(new Date('2026-12-05T18:00').toISOString());
    expect(await screen.findByRole('heading', { name: 'Monsoon Unplugged' })).toBeInTheDocument();
  });

  it('lists the club’s own events with a send button on drafts', async () => {
    state.events.push(draftEvent());
    renderAt('/club/events', { roles: ['student', 'club_secretary:club-lens'] });
    const rows = await screen.findAllByTestId('club-event-row');
    const draft = rows.find((r) => r.textContent?.includes('Monsoon Unplugged'))!;
    expect(within(draft).getByRole('button', { name: 'Send for approval' })).toBeInTheDocument();
  });
});
