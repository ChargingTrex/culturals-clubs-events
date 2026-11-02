import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../shared/api/client';
import { renderAt } from '../test/render';
import { problem, server } from '../test/server';
import type { ApprovalRequest, DeanOverview, VenueCalendar } from './api';

const B = API_BASE;

const approval = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'ar-1',
  event: 'ev-1',
  event_title: 'Swara Monsoon Concert',
  club: 'Swara',
  club_id: 'club-swara',
  venue: 'Main Auditorium',
  starts_at: '2026-11-20T13:00:00Z',
  ends_at: '2026-11-20T16:00:00Z',
  expected_attendance: 400,
  current_stage: 'dean',
  stage_label: 'Dean',
  state: 'pending',
  amount_requested: '42000.00',
  requires_vc: false,
  vc_reason: '',
  steps: [
    {
      id: 'st-1',
      stage: 'cultural_society',
      stage_label: 'Cultural Society',
      decision: 'approve',
      comment: 'Plan is sound.',
      actor_label: 'Cultural Secretary',
      actor_role: 'cultural_society',
      mfa_verified: true,
      amount_sanctioned: null,
      on_behalf_of: null,
      on_behalf_of_label: '',
      created_at: '2026-11-01T09:00:00Z',
    },
  ],
  lines: [
    { id: 'l-1', head: 'Sound', amount_requested: '30000.00', amount_sanctioned: null },
    { id: 'l-2', head: 'Publicity', amount_requested: '12000.00', amount_sanctioned: null },
  ],
  clashes: [],
  my_stage: true,
  requires_mfa: false,
  nil_declaration: null,
  stage_entered_at: '2026-11-01T09:00:00Z',
  age_hours: 60,
  escalated: true,
  created_at: '2026-10-30T09:00:00Z',
  ...over,
});

describe('staff screens', () => {
  it('Dean queue lists an item and the Dean approves it with line sanctions', async () => {
    const user = userEvent.setup();
    let item = approval();
    let decided: unknown = null;
    server.use(
      http.get(`${B}/governance/approvals/queue`, () =>
        HttpResponse.json({
          stages_you_hold: ['dean'],
          stages_delegated_to_you: [],
          sla_hours: 48,
          escalated_only: false,
          count: decided ? 0 : 1,
          results: decided ? [] : [item],
        }),
      ),
      http.get(`${B}/governance/approvals/:id`, () => HttpResponse.json(item)),
      http.post(`${B}/governance/approvals/:id/decide`, async ({ request }) => {
        decided = await request.json();
        item = { ...item, state: 'approved' };
        return HttpResponse.json({ step: item.steps[0], request: item });
      }),
    );

    renderAt('/staff/approvals/dean', { roles: ['dean'] });
    await screen.findByRole('heading', { name: 'Dean approvals' });
    const row = await screen.findByTestId('queue-row');
    expect(within(row).getByText('Swara Monsoon Concert')).toBeInTheDocument();
    expect(within(row).getByText(/Past SLA/)).toBeInTheDocument();
    expect(within(row).getByText('₹42,000')).toBeInTheDocument();

    await user.click(within(row).getByRole('link', { name: 'Review' }));
    await screen.findByRole('heading', { name: 'Swara Monsoon Concert' });
    expect(within(screen.getByTestId('trail')).getByText('“Plan is sound.”')).toBeInTheDocument();

    const sound = screen.getByLabelText('Sanction for Sound');
    await user.clear(sound);
    await user.type(sound, '25000');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await screen.findByRole('heading', { name: 'Dean approvals' });
    expect(decided).toEqual({
      decision: 'approve',
      comment: '',
      sanctioned: { 'l-1': '25000', 'l-2': '12000' },
    });
    expect(
      await screen.findByText(
        'Nothing waiting at this gate. New proposals appear here, oldest first.',
      ),
    ).toBeInTheDocument();
  });

  it('a return without a comment shows the API refusal with its code', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${B}/governance/approvals/:id`, () => HttpResponse.json(approval())),
      http.post(`${B}/governance/approvals/:id/decide`, () =>
        problem(422, 'GOVERNANCE_COMMENT_REQUIRED', 'A comment is required', 'Say what to change.'),
      ),
    );
    renderAt('/staff/approvals/ar-1', { roles: ['dean'] });
    await user.click(await screen.findByRole('button', { name: 'Return for changes' }));
    expect(await screen.findByTestId('problem')).toHaveAttribute(
      'data-code',
      'GOVERNANCE_COMMENT_REQUIRED',
    );
  });

  it('overview renders KPI tiles and capture rates', async () => {
    const overview: DeanOverview = {
      semester: 'Monsoon 2026',
      pending_approvals: 4,
      pending_by_stage: { cultural_society: 4 },
      escalated_approvals: [],
      venue_clashes: 1,
      clubs_active: 4,
      clubs_total: 5,
      clubs_inactive: ['Drishti'],
      dormant_clubs: 0,
      missing_evidence: [],
      events_missing_photos: [],
      events_missing_social_links: [],
      venue_use: [{ venue__name: 'Seminar Hall A', bookings: 3 }],
      capture: {
        scan_attempts: 152,
        scans_accepted: 141,
        scan_success_rate: 0.928,
        attended: 141,
        attended_by_scan: 141,
        scan_capture_rate: 1,
        capture_rate: 1,
      },
    };
    server.use(http.get(`${B}/reporting/reports/overview`, () => HttpResponse.json(overview)));
    renderAt('/staff/overview', { roles: ['dean'] });
    await screen.findByRole('heading', { name: 'This semester' });
    expect(screen.getAllByTestId('tile')).toHaveLength(4);
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.getByText('93%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Drishti')).toBeInTheDocument();
  });

  it('venues renders bookings grouped by day and flags the clash', async () => {
    const calendar: VenueCalendar = {
      buffer_minutes: '30',
      venues: [
        { id: 'v-1', name: 'Amphitheatre', capacity: 300, active: true },
        { id: 'v-2', name: 'Seminar Hall A', capacity: 150, active: true },
      ],
      bookings: [
        {
          id: 'b-1',
          title: 'Drishti Street Play',
          club: 'Drishti',
          venue: 'v-1',
          venue_name: 'Amphitheatre',
          starts_at: '2099-11-12T17:00:00Z',
          ends_at: '2099-11-12T19:00:00Z',
          status: 'submitted',
          confirmed: false,
          clash: true,
        },
        {
          id: 'b-2',
          title: 'Natya Showcase',
          club: 'Natya',
          venue: 'v-1',
          venue_name: 'Amphitheatre',
          starts_at: '2099-11-12T18:00:00Z',
          ends_at: '2099-11-12T20:00:00Z',
          status: 'published',
          confirmed: true,
          clash: true,
        },
      ],
      clashes: [{ venue: 'Amphitheatre', events: [] }],
    };
    server.use(http.get(`${B}/venue-calendar`, () => HttpResponse.json(calendar)));
    renderAt('/staff/venues', { roles: ['dean'] });
    await screen.findByRole('heading', { name: 'Venues' });
    const bookings = await screen.findAllByTestId('booking');
    expect(bookings).toHaveLength(2);
    expect(bookings.every((b) => b.dataset.clash === 'true')).toBe(true);
    expect(screen.getByTestId('clash-count')).toHaveTextContent('1');
    expect(screen.getAllByRole('button', { name: 'Move venue' })).toHaveLength(2);
  });

  it('a student on a staff page sees the API refusal, not a blank', async () => {
    server.use(
      http.get(`${B}/governance/approvals/queue`, () =>
        problem(403, 'GOVERNANCE_DENIED', 'Not permitted', 'Approvals are for staff.'),
      ),
    );
    renderAt('/staff/approvals/dean', { roles: ['student'] });
    expect(await screen.findByTestId('problem')).toHaveAttribute('data-code', 'GOVERNANCE_DENIED');
  });
});
