import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../shared/api/client';
import { renderAt } from '../test/render';
import { problem, server } from '../test/server';
import type { QueuedScan, Roster, ScanOutcome, ScanStation } from './api';
import { readQueue } from './queue';

const B = API_BASE;
const DOOR = ['student', 'club_secretary:club-lens'];

const STUDENT = {
  prn: '23LA1041',
  full_name: 'Meera Iyer',
  department: 'LAW',
  programme: 'BA-LLB',
  year: 3,
};

let checkedIn: Set<string>;
let syncedBatches: QueuedScan[][];

function outcome(token: string): ScanOutcome {
  if (token !== 'pass.reg-1') {
    return {
      result: 'unknown_code',
      result_label: 'Code not recognised',
      verdict: 'Code not recognised',
      tone: 'bad',
      accepted: false,
      detail: '',
      student: null,
      registration_id: null,
    };
  }
  if (checkedIn.has(token)) {
    return {
      result: 'duplicate',
      result_label: 'Already checked in',
      verdict: 'Already checked in',
      tone: 'warn',
      accepted: false,
      detail: 'First scanned at 10:31.',
      student: STUDENT,
      registration_id: 'reg-1',
    };
  }
  checkedIn.add(token);
  return {
    result: 'accepted',
    result_label: 'Checked in',
    verdict: 'Checked in',
    tone: 'ok',
    accepted: true,
    detail: '',
    student: STUDENT,
    registration_id: 'reg-1',
  };
}

const station = (): ScanStation => ({
  event: {
    id: 'e1',
    title: 'Lens Heritage Photowalk',
    club: 'Lens',
    venue: 'Open Air Theatre',
    status: 'published',
    starts_at: '2026-11-02T10:30:00Z',
    ends_at: '2026-11-02T12:30:00Z',
  },
  counters: { checked_in: checkedIn.size, registered: 38, capacity: 100 },
  capture: {
    attempts: 0,
    accepted: 0,
    duplicates: 0,
    unknown: 0,
    wrong_event: 0,
    expired: 0,
    capture_rate: null,
  },
  recent: [],
});

const roster = (): Roster => ({
  event: { id: 'e1', title: 'Lens Heritage Photowalk' },
  counts: { registered: 1, waitlisted: 0, attended: checkedIn.size },
  results: [
    {
      id: 'reg-1',
      prn: STUDENT.prn,
      full_name: STUDENT.full_name,
      department: STUDENT.department,
      programme: STUDENT.programme,
      year: STUDENT.year,
      source: 'pre_registered',
      waitlisted: false,
      attended: checkedIn.size > 0,
      checked_in_at: null,
    },
  ],
});

beforeEach(() => {
  checkedIn = new Set();
  syncedBatches = [];
  server.use(
    http.get(`${B}/participation/events/:id/scan`, () => HttpResponse.json(station())),
    http.post(`${B}/participation/events/:id/scan`, async ({ request }) => {
      const body = (await request.json()) as { token: string };
      return HttpResponse.json(outcome(body.token));
    }),
    http.get(`${B}/participation/events/:id/roster`, () => HttpResponse.json(roster())),
    http.post(`${B}/participation/events/:id/check-in`, async ({ request }) => {
      const body = (await request.json()) as { prn: string };
      if (body.prn !== STUDENT.prn) {
        return problem(404, 'PARTICIPATION_STUDENT_NOT_FOUND', 'No such student');
      }
      return HttpResponse.json(outcome('pass.reg-1'));
    }),
    http.post(`${B}/participation/events/:id/scan/sync`, async ({ request }) => {
      const body = (await request.json()) as { scans: QueuedScan[] };
      syncedBatches.push(body.scans);
      const results = body.scans.map((s) => outcome(s.token));
      return HttpResponse.json({
        synced: results.length,
        accepted: results.filter((r) => r.accepted).length,
        duplicates: results.filter((r) => r.result === 'duplicate').length,
        results,
        counters: station().counters,
      });
    }),
  );
});

async function scanCode(user: ReturnType<typeof userEvent.setup>, code: string) {
  await user.type(await screen.findByLabelText('Pass code'), code);
  await user.click(screen.getByRole('button', { name: 'Check code' }));
}

describe('scan station', () => {
  it('scan a pass → checked in; same pass again → duplicate', async () => {
    const user = userEvent.setup();
    renderAt('/scan', { roles: DOOR });

    await screen.findByRole('heading', { name: 'Scan station' });
    expect(await screen.findByLabelText('Event at this door')).toHaveValue('e1');

    await scanCode(user, 'pass.reg-1');
    await waitFor(() =>
      expect(screen.getByTestId('verdict')).toHaveAttribute('data-result', 'accepted'),
    );
    expect(screen.getByTestId('verdict')).toHaveTextContent('Checked in');
    expect(screen.getByTestId('verdict')).toHaveTextContent('Meera Iyer');

    await scanCode(user, 'pass.reg-1');
    await waitFor(() =>
      expect(screen.getByTestId('verdict')).toHaveAttribute('data-result', 'duplicate'),
    );
    expect(screen.getByTestId('verdict')).toHaveTextContent('Already checked in');
    await waitFor(() => expect(screen.getByTestId('checked-in')).toHaveTextContent('1'));
  });

  it('network down → the scan is queued, then synced', async () => {
    const user = userEvent.setup();
    server.use(http.post(`${B}/participation/events/:id/scan`, () => HttpResponse.error()));
    renderAt('/scan', { roles: DOOR });

    await scanCode(user, 'pass.reg-1');
    await waitFor(() =>
      expect(screen.getByTestId('verdict')).toHaveAttribute('data-result', 'queued'),
    );
    expect(screen.getByTestId('queue')).toHaveTextContent('1 waiting');
    expect(readQueue('e1')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('queue')).toHaveTextContent('0 waiting'));
    expect(syncedBatches).toHaveLength(1);
    expect(syncedBatches[0]?.[0]?.token).toBe('pass.reg-1');
    expect(readQueue('e1')).toHaveLength(0);
  });

  it('PRN lookup checks the student in; an unknown PRN shows the API problem', async () => {
    const user = userEvent.setup();
    renderAt('/scan', { roles: DOOR });

    await user.type(await screen.findByLabelText(/PRN from their ID card/), 'NOPE');
    await user.click(screen.getByRole('button', { name: 'Check in by PRN' }));
    expect(await screen.findByTestId('problem')).toHaveAttribute(
      'data-code',
      'PARTICIPATION_STUDENT_NOT_FOUND',
    );

    const input = screen.getByLabelText(/PRN from their ID card/);
    await user.clear(input);
    await user.type(input, '23LA1041');
    await user.click(screen.getByRole('button', { name: 'Check in by PRN' }));
    await waitFor(() =>
      expect(screen.getByTestId('verdict')).toHaveAttribute('data-result', 'accepted'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('roster-counts')).toHaveTextContent('1 of 1 checked in'),
    );
  });

  it('a plain student is not offered the door and the page says so', async () => {
    renderAt('/scan', { roles: ['student'] });
    expect(await screen.findByText(/No published or live event of yours/)).toBeInTheDocument();
  });
});
