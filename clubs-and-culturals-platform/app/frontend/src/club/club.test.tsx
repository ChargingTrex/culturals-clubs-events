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

  it('Treasurer uploads a CSV of entries and the sheet is replaced', async () => {
    state.events.push(draftEvent());
    let budget = makeBudget([line('Old line', '1.00')]);
    let sent: string | null = null;
    server.use(
      http.get(`${B}/budget/budgets/b1`, () => HttpResponse.json(budget)),
      http.post(`${B}/budget/budgets/b1/lines/import`, ({ request }) => {
        // Body not parsed: jsdom's File inside undici's formData() never resolves.
        sent = request.headers.get('content-type');
        budget = makeBudget([line('Sound', '12000.00'), line('Refreshments', '3000.00')]);
        return HttpResponse.json(budget);
      }),
    );
    const user = userEvent.setup();
    renderAt('/club/budget/b1', { roles: ['student', 'club_treasurer:club-lens'] });
    const file = new File(['head,amount\nSound,12000\nRefreshments,3000\n'], 'budget.csv', {
      type: 'text/csv',
    });
    await user.upload(await screen.findByLabelText(/Or upload a CSV/), file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(screen.getAllByTestId('budget-line')).toHaveLength(2));
    expect(sent).toMatch(/^multipart\/form-data/);
    expect(screen.getByTestId('total-requested')).toHaveTextContent('₹15,000');
  });

  it('Treasurer edits every entry at once and saves them together (AR-04)', async () => {
    state.events.push(draftEvent());
    let lines = [line('Sound', '8000.00'), line('Snacks', '2000.00')];
    const edits: Record<string, unknown> = {};
    server.use(
      http.get(`${B}/budget/budgets/b1`, () => HttpResponse.json(makeBudget(lines))),
      http.put(`${B}/budget/budgets/b1/lines/:lid/edit`, async ({ params, request }) => {
        const body = (await request.json()) as { head?: string; amount_requested?: string };
        edits[String(params.lid)] = body;
        lines = lines.map((l) =>
          l.id === params.lid
            ? { ...l, head: body.head ?? l.head, amount_requested: body.amount_requested ?? l.amount_requested }
            : l,
        );
        return HttpResponse.json(makeBudget(lines));
      }),
    );
    const user = userEvent.setup();
    renderAt('/club/budget/b1', { roles: ['student', 'club_treasurer:club-lens'] });
    await user.click(await screen.findByRole('button', { name: 'Edit all' }));
    await user.clear(screen.getByLabelText('Amount of entry 1'));
    await user.type(screen.getByLabelText('Amount of entry 1'), '9000');
    await user.clear(screen.getByLabelText('Head of entry 2'));
    await user.type(screen.getByLabelText('Head of entry 2'), 'Refreshments');
    await user.click(screen.getByRole('button', { name: 'Save all' }));
    expect(await screen.findByText('2 entries saved')).toBeInTheDocument();
    expect(edits).toEqual({
      'line-Sound': { amount_requested: '9000' },
      'line-Snacks': { head: 'Refreshments' },
    });
    expect(screen.getByTestId('total-requested')).toHaveTextContent('₹11,000');
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
    expect(screen.getByRole('link', { name: 'Open join requests' })).toHaveAttribute(
      'href',
      '/club/join-requests?club=club-lens',
    );

    await user.selectOptions(screen.getByLabelText('Role for Kabir Shah'), 'club_treasurer');
    await waitFor(() => expect(roleBody).toEqual({ role: 'club_treasurer' }));
    expect(await screen.findByText('Kabir Shah is now Treasurer')).toBeInTheDocument();
  });

  it('bulk-approves join requests; a student at the cap is refused on their own row', async () => {
    const req = (id: string, name: string) => ({
      id,
      club: 'club-lens',
      student: `s-${id}`,
      prn: `25CS10${id}`,
      full_name: name,
      department: 'CSE',
      programme: 'BTech-CSE',
      year: 1,
      state: 'pending' as const,
      note: '',
      decided_by_label: '',
      decided_at: null,
      created_at: '2026-10-30T00:00:00Z',
    });
    const pending = [req('01', 'Divya R'), req('02', 'Arjun K'), req('03', 'Sana M')];
    const accepted: string[] = [];
    server.use(
      http.get(`${B}/clubs/club-lens/join-requests`, () =>
        HttpResponse.json({ club: { id: 'club-lens', name: 'Lens', join_mode: 'approval' }, results: pending }),
      ),
      http.post(`${B}/clubs/club-lens/join-requests/:rid/accept`, ({ params }) => {
        const rid = String(params.rid);
        if (rid === '02') {
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Membership limit reached',
              status: 409,
              code: 'CLUBS_MEMBERSHIP_LIMIT',
              detail: 'Arjun K is already in 5 clubs.',
            },
            { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
          );
        }
        accepted.push(rid);
        return HttpResponse.json({ ...pending.find((p) => p.id === rid)!, state: 'accepted' });
      }),
    );

    const user = userEvent.setup();
    renderAt('/club/join-requests', { roles: ['student', 'club_president:club-lens'] });
    expect(await screen.findAllByTestId('join-row')).toHaveLength(3);
    await user.click(screen.getByLabelText(/Select all/));
    await user.click(screen.getByRole('button', { name: 'Approve selected (3)' }));

    expect(await screen.findByText('2 approved, 1 refused')).toBeInTheDocument();
    expect(accepted).toEqual(['01', '03']);
    expect(screen.getByRole('alert')).toHaveTextContent('Arjun K is already in 5 clubs.');
    expect(screen.getAllByText('Approved')).toHaveLength(2);
  });

  it('a President books a Wednesday open-block slot (AR-03)', async () => {
    const slot = (h: number) => ({
      starts_at: `2026-11-11T${h}:00:00+05:30`,
      ends_at: `2026-11-11T${h + 1}:00:00+05:30`,
      venues: [
        { id: 'v-1', name: 'Amphitheatre', booked_by: h === 15 ? 'Natya' : null, event: null },
        { id: 'v-2', name: 'Seminar Hall A', booked_by: null, event: null },
      ],
    });
    let booked: Record<string, string> | null = null;
    server.use(
      http.get(`${B}/open-block`, () =>
        HttpResponse.json({ date: '2026-11-11', slots: [slot(15), slot(16)] }),
      ),
      http.post(`${B}/open-block`, async ({ request }) => {
        booked = (await request.json()) as Record<string, string>;
        return HttpResponse.json(
          { id: 'ob-1', venue_name: 'Seminar Hall A', starts_at: slot(15).starts_at, ends_at: slot(15).ends_at },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderAt('/club/events', { roles: ['student', 'club_president:club-lens'] });
    const block = await screen.findByRole('region', { name: 'Open block' });
    const first = within(block).getAllByRole('combobox')[0]!;
    expect(within(first).queryByText('Amphitheatre')).toBeNull(); // taken by Natya
    await user.click(within(block).getAllByRole('button', { name: /^Book / })[0]!);
    await waitFor(() => expect(booked).not.toBeNull());
    expect(booked).toEqual({ club: 'club-lens', venue: 'v-2', starts_at: slot(15).starts_at });
  });

  it('the post-event report shows counted attendance and submits with outcomes (AR-01)', async () => {
    state.events.push(draftEvent({ id: 'e-live', status: 'live', status_label: 'Live now' }));
    const draft = {
      registered: 40, attended: 31, attended_students: 31, attended_external: 0, no_show: 9,
      walk_ins: 3, photos: 1, highlights: 0, social_posts: 0,
      feedback: { count: 0, average_rating: null }, budget: null,
      social_post_required: false, outcomes: '', learnings: '', submitted_at: null,
    };
    let closed: unknown = null;
    let postType: string | null = null;
    server.use(
      approvalsEmpty,
      http.get(`${B}/events/e-live/clashes`, () =>
        HttpResponse.json({ event: 'e-live', clashes: [], free_venues: [] }),
      ),
      http.get(`${B}/events/e-live/report`, () => HttpResponse.json(draft)),
      http.get(`${B}/events/e-live/photos`, () => HttpResponse.json([])),
      http.get(`${B}/events/e-live/social-posts`, () => HttpResponse.json([])),
      http.post(`${B}/events/e-live/social-posts`, ({ request }) => {
        // Body not parsed: jsdom's File inside undici's formData() never resolves.
        postType = request.headers.get('content-type');
        return HttpResponse.json(
          { id: 'sp1', platform: 'instagram', url: 'https://instagram.com/p/abc', screenshot_url: null, created_at: '2026-11-08T10:00:00Z' },
          { status: 201 },
        );
      }),
      http.post(`${B}/events/e-live/close`, async ({ request }) => {
        closed = await request.json();
        return HttpResponse.json(draftEvent({ id: 'e-live', status: 'reported' }));
      }),
    );
    const user = userEvent.setup();
    renderAt('/club/events/e-live', { roles: ['student', 'club_president:club-lens'] });
    const panel = await screen.findByRole('region', { name: 'Post-event report' });
    expect(within(panel).getByTestId('report-attendance')).toHaveTextContent('31');
    expect(within(panel).queryByLabelText(/Photos taken/)).toBeNull(); // the old count box is gone
    await user.type(within(panel).getByLabelText(/Post link/), 'https://instagram.com/p/abc');
    await user.upload(
      within(panel).getByLabelText(/Screenshot/),
      new File(['x'], 'post.png', { type: 'image/png' }),
    );
    await user.click(within(panel).getByRole('button', { name: 'Add link' }));
    await waitFor(() => expect(postType).toMatch(/^multipart\/form-data/));
    await user.type(within(panel).getByLabelText(/Outcomes \(required\)/), 'Thirty-one walked the old town.');
    await user.click(within(panel).getByRole('button', { name: 'Submit report' }));
    await waitFor(() => expect(closed).toEqual({ outcomes: 'Thirty-one walked the old town.', learnings: '' }));
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
    expect(screen.getByLabelText('Capacity')).toHaveValue(400);
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-12-05' } });
    await user.selectOptions(screen.getByLabelText('End hour'), '21');
    await user.selectOptions(await screen.findByLabelText('Template'), 'Cultural night');
    expect(await screen.findByTestId('template-total')).toHaveTextContent('₹13,200');
    await user.click(screen.getByRole('button', { name: 'Propose and send' }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({
      club: 'club-lens',
      title: 'Monsoon Unplugged',
      venue: 'venue-1',
      kind: 'performance',
      // Filled from the venue (seats 400), then lowered by hand.
      capacity: 250,
      expected_attendance: 80,
      budget_template: 'Cultural night',
      submit: true,
    });
    expect(posted!.starts_at).toBe(new Date('2026-12-05T18:00').toISOString());
    // The end date followed the start date; only the hour was changed.
    expect(posted!.ends_at).toBe(new Date('2026-12-05T21:00').toISOString());
    expect(await screen.findByRole('heading', { name: 'Monsoon Unplugged' })).toBeInTheDocument();
  });

  it('a President attaches the proposal and uploads the budget sheet, then it is sent (AR-10)', async () => {
    const calls: string[] = [];
    let posted: EventCreate | null = null;
    const multipart: string[] = [];
    server.use(
      http.get(`${B}/venues`, () =>
        HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [{ id: 'venue-1', name: 'Open Air Theatre', capacity: 400, location: '', active: true }],
        }),
      ),
      http.get(`${B}/budget/budget-templates`, () =>
        HttpResponse.json({ expected_attendance: 80, templates: [] }),
      ),
      http.post(`${B}/events`, async ({ request }) => {
        calls.push('create');
        posted = (await request.json()) as EventCreate;
        state.events.push(draftEvent({ id: 'e-new', title: posted.title }));
        return HttpResponse.json(
          { ...draftEvent({ id: 'e-new', title: posted.title }), soft_clashes: [], approval: null },
          { status: 201 },
        );
      }),
      // Bodies not parsed: jsdom's File inside undici's formData() never resolves.
      http.post(`${B}/events/e-new/proposal-document`, ({ request }) => {
        calls.push('document');
        multipart.push(request.headers.get('content-type') ?? '');
        return HttpResponse.json({ id: 'd-1', file_name: 'proposal.pdf' }, { status: 201 });
      }),
      http.post(`${B}/budget/budgets/b1/lines/import`, ({ request }) => {
        calls.push('sheet');
        multipart.push(request.headers.get('content-type') ?? '');
        return HttpResponse.json({});
      }),
      http.post(`${B}/events/e-new/submit`, () => {
        calls.push('submit');
        return HttpResponse.json({});
      }),
      approvalsEmpty,
    );

    const user = userEvent.setup();
    renderAt('/club/events/new', { roles: ['student', 'club_president:club-lens'] });

    await user.type(await screen.findByLabelText('Title'), 'Monsoon Unplugged');
    await user.selectOptions(await screen.findByLabelText('Venue'), 'venue-1');
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-12-05' } });
    await user.upload(
      screen.getByLabelText(/Proposal document/),
      new File(['%PDF'], 'proposal.pdf', { type: 'application/pdf' }),
    );
    await user.selectOptions(screen.getByLabelText('Template'), 'Upload the budget sheet (CSV)');
    // No sheet chosen yet: nothing can be saved in this mode.
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    await user.upload(
      screen.getByLabelText(/Budget sheet/),
      new File(['head,amount\nSound,12000\n'], 'budget.csv', { type: 'text/csv' }),
    );
    // AR-11: the chosen sheet can be read before anything is sent.
    await user.click(screen.getByRole('button', { name: 'Preview the sheet' }));
    const sheet = await screen.findByRole('dialog', { name: 'budget.csv' });
    expect(await within(sheet).findByRole('columnheader', { name: 'amount' })).toBeInTheDocument();
    expect(within(sheet).getByRole('cell', { name: '12000' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Propose and send' }));

    // The files go in while it is still a draft; only then is it sent.
    await waitFor(() => expect(calls).toEqual(['create', 'document', 'sheet', 'submit']));
    expect(posted).toMatchObject({ title: 'Monsoon Unplugged', submit: false });
    expect(posted).not.toHaveProperty('budget_template');
    expect(multipart).toHaveLength(2);
    for (const type of multipart) expect(type).toMatch(/^multipart\/form-data/);
  });

  it('a Secretary cannot upload a budget sheet, only attach the proposal (AR-10)', async () => {
    server.use(
      http.get(`${B}/venues`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
      http.get(`${B}/budget/budget-templates`, () =>
        HttpResponse.json({ expected_attendance: 80, templates: [] }),
      ),
    );
    renderAt('/club/events/new', { roles: ['student', 'club_secretary:club-lens'] });
    expect(await screen.findByLabelText(/Proposal document/)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Upload the budget sheet (CSV)' })).toBeNull();
    expect(screen.getByRole('option', { name: 'None — the Treasurer enters it' })).toBeInTheDocument();
  });

  it('an office bearer reads a Word proposal as text on the event page (AR-11)', async () => {
    state.events.push(
      draftEvent({
        proposal_document: {
          id: 'd-1',
          file_name: 'plan.docx',
          content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          byte_size: 20480,
          uploaded_by_label: 'Asha',
          uploaded_at: '2026-11-10T10:00:00Z',
          file_url: '/api/v1/events/e-draft/proposal-document/file',
          preview: 'text',
        },
      }),
    );
    server.use(
      http.get(`${B}/events/e-draft/proposal-document/preview`, () =>
        HttpResponse.json({
          file_name: 'plan.docx',
          truncated: false,
          blocks: [
            { kind: 'heading', text: 'Monsoon Unplugged' },
            { kind: 'paragraph', text: 'An acoustic evening.' },
            { kind: 'row', text: 'Sound | 12000' },
          ],
        }),
      ),
      approvalsEmpty,
    );
    const user = userEvent.setup();
    renderAt('/club/events/e-draft', { roles: ['student', 'club_president:club-lens'] });
    await user.click(await screen.findByRole('button', { name: 'Preview plan.docx' }));
    const dialog = await screen.findByRole('dialog', { name: 'plan.docx' });
    expect(await within(dialog).findByRole('heading', { name: 'Monsoon Unplugged' })).toBeInTheDocument();
    expect(within(dialog).getByText('Sound | 12000')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });

  it('shows what an approver moved, struck through and in the approver’s colour (AR-12)', async () => {
    state.events.push(
      draftEvent({
        status: 'submitted',
        status_label: 'Awaiting approval',
        venue_name: 'Amphitheatre',
        starts_at: '2026-11-30T12:30:00Z',
        ends_at: '2026-11-30T14:30:00Z',
        moves: [
          {
            id: 'm-1',
            from_venue_name: 'Music Room',
            to_venue_name: 'Amphitheatre',
            from_starts_at: '2026-11-30T11:30:00Z',
            from_ends_at: '2026-11-30T13:30:00Z',
            to_starts_at: '2026-11-30T12:30:00Z',
            to_ends_at: '2026-11-30T14:30:00Z',
            reason: 'The Music Room is needed for an exam.',
            actor_label: 'Nivedita Raman',
            actor_role: 'cultural_society_secretary',
            created_at: '2026-11-14T10:00:00Z',
          },
        ],
      }),
    );
    server.use(approvalsEmpty);
    renderAt('/club/events/e-draft', { roles: ['student', 'club_president:club-lens'] });
    const changes = await screen.findByRole('region', { name: 'Changes by approvers' });
    // Venue and time each get a row: old struck through, new in Admin violet, with the reason.
    const was = within(changes).getByText('Music Room');
    expect(was.tagName).toBe('DEL');
    expect(was).toHaveClass('cc-edit--admin');
    expect(within(changes).getByText('Amphitheatre').tagName).toBe('INS');
    expect(within(changes).getByText('“The Music Room is needed for an exam.”')).toBeInTheDocument();
    expect(within(changes).getAllByText('Nivedita Raman').length).toBeGreaterThan(0);
    expect(within(changes).getByRole('note', { name: 'Edit colour key' })).toBeInTheDocument();
    // The "When and where" card carries the same marks beside the current venue.
    const struck = screen.getAllByText('Music Room');
    expect(struck).toHaveLength(2);
    for (const el of struck) expect(el.tagName).toBe('DEL');
  });

  it('lists the club’s own events with a send button on drafts', async () => {
    state.events.push(draftEvent());
    renderAt('/club/events', { roles: ['student', 'club_secretary:club-lens'] });
    const rows = await screen.findAllByTestId('club-event-row');
    const draft = rows.find((r) => r.textContent?.includes('Monsoon Unplugged'))!;
    expect(within(draft).getByRole('button', { name: 'Send for approval' })).toBeInTheDocument();
  });
});
