import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../shared/api/client';
import { renderAt } from '../test/render';
import { server } from '../test/server';
import type { CalendarBooking, VenueCalendar } from './api';
import { dayKey, hoursOn } from './calendarTime';

const today = dayKey(new Date().toISOString());
const at = (hour: number) => new Date(`${today}T${String(hour).padStart(2, '0')}:00`).toISOString();

const booking = (over: Partial<CalendarBooking>): CalendarBooking => ({
  id: 'b-1',
  title: 'Open Mic Night',
  club: 'Music Club',
  venue: 'v-2',
  venue_name: 'Seminar Hall A',
  starts_at: at(17),
  ends_at: at(19),
  status: 'submitted',
  confirmed: false,
  clash: false,
  can_move: false,
  ...over,
});

function serve(bookings: CalendarBooking[]) {
  const calendar: VenueCalendar = {
    buffer_minutes: '0',
    venues: [
      { id: 'v-1', name: 'Amphitheatre', capacity: 300, active: true },
      { id: 'v-2', name: 'Seminar Hall A', capacity: 150, active: true },
    ],
    bookings,
    clashes: [],
  };
  server.use(http.get(`${API_BASE}/venue-calendar`, () => HttpResponse.json(calendar)));
}

const cell = (venue: string, hour: number) =>
  screen
    .getAllByTestId('slot')
    .find((c) => c.dataset.venue === venue && c.dataset.hour === String(hour))!;

describe('events calendar (C-03)', () => {
  it('a 17:00–19:00 booking fills exactly the two hours it covers', async () => {
    serve([booking({})]);
    renderAt('/staff/calendar', { roles: ['cultural_society'] });
    await screen.findByRole('heading', { name: 'Semester event calendar' });
    await screen.findAllByTestId('slot');
    expect(within(cell('Seminar Hall A', 17)).getByText('Open Mic Night')).toBeInTheDocument();
    expect(within(cell('Seminar Hall A', 18)).getByText('Open Mic Night')).toBeInTheDocument();
    expect(within(cell('Seminar Hall A', 19)).queryByText('Open Mic Night')).toBeNull();
    expect(within(cell('Amphitheatre', 17)).queryByText('Open Mic Night')).toBeNull();
  });

  it('two bookings sharing an hour in one venue mark only that hour as a clash', async () => {
    serve([
      booking({ clash: true }),
      booking({
        id: 'b-2',
        title: 'Dance Workshop',
        starts_at: at(18),
        ends_at: at(20),
        clash: true,
      }),
    ]);
    renderAt('/staff/calendar', { roles: ['cultural_society'] });
    await screen.findAllByTestId('slot');
    expect(cell('Seminar Hall A', 18).dataset.clash).toBe('true');
    expect(within(cell('Seminar Hall A', 18)).getByText('Clash')).toBeInTheDocument();
    expect(cell('Seminar Hall A', 17).dataset.clash).toBe('false');
    expect(cell('Seminar Hall A', 19).dataset.clash).toBe('false');
  });

  it('is offered to the Cultural Society (students: see nav/pages.test.ts)', async () => {
    serve([]);
    renderAt('/staff/calendar', { roles: ['cultural_society'] });
    expect((await screen.findAllByRole('link', { name: /Calendar/ })).length).toBeGreaterThan(0);
  });

  it('the Society sees the calendar read-only: no Move (AR-02)', async () => {
    serve([booking({ status: 'approved', confirmed: true })]);
    renderAt('/staff/calendar', { roles: ['cultural_society'] });
    await screen.findAllByTestId('slot');
    expect(screen.queryByRole('button', { name: 'Move Open Mic Night' })).toBeNull();
  });

  it('a Society officer gets Move only on the booking the API marks movable (AR-08)', async () => {
    serve([
      booking({ can_move: true }),
      booking({
        id: 'b-2',
        title: 'Recital',
        venue: 'v-1',
        venue_name: 'Amphitheatre',
        status: 'published',
        confirmed: true,
      }),
    ]);
    renderAt('/staff/calendar', { roles: ['cultural_society_secretary'] });
    expect(await screen.findByRole('button', { name: 'Move Open Mic Night' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move Recital' })).toBeNull();
  });

  it('the Dean moves a booking to another hour and venue', async () => {
    serve([booking({ status: 'approved', confirmed: true, can_move: true })]);
    let body: Record<string, string> | null = null;
    server.use(
      http.post(`${API_BASE}/events/b-1/reassign`, async ({ request }) => {
        body = (await request.json()) as Record<string, string>;
        return HttpResponse.json({ id: 'r-1' });
      }),
    );
    const user = userEvent.setup();
    renderAt('/staff/calendar', { roles: ['dean'] });
    await user.click(await screen.findByRole('button', { name: 'Move Open Mic Night' }));
    const form = screen.getByRole('form', { name: 'Move Open Mic Night' });
    await user.selectOptions(within(form).getByLabelText('From'), '15');
    await user.selectOptions(within(form).getByLabelText('To'), '16');
    await user.selectOptions(within(form).getByLabelText('Venue'), 'v-1');
    await user.type(within(form).getByLabelText(/Reason/), 'Hall A closed for repairs');
    await user.click(within(form).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toEqual({
      to_venue: 'v-1',
      starts_at: at(15),
      ends_at: at(16),
      reason: 'Hall A closed for repairs',
    });
  });

  it('lists pending and approved bookings from later weeks and jumps to the day', async () => {
    const later = new Date(`${today}T12:00`);
    later.setDate(later.getDate() + 21);
    const laterDay = dayKey(later.toISOString());
    const pending = booking({
      id: 'b-9',
      title: 'test',
      starts_at: new Date(`${laterDay}T17:00`).toISOString(),
      ends_at: new Date(`${laterDay}T19:00`).toISOString(),
    });
    const approved = booking({
      id: 'b-10',
      title: 'Approved Recital',
      venue: 'v-2',
      status: 'published',
      confirmed: true,
      starts_at: new Date(`${laterDay}T10:00`).toISOString(),
      ends_at: new Date(`${laterDay}T12:00`).toISOString(),
    });
    // The week view asks for seven days; the look-ahead asks for months.
    server.use(
      http.get(`${API_BASE}/venue-calendar`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        const days = (Date.parse(q.get('to')!) - Date.parse(q.get('from')!)) / 86_400_000;
        const inRange = laterDay >= q.get('from')! && laterDay <= q.get('to')!;
        return HttpResponse.json({
          buffer_minutes: '0',
          venues: [{ id: 'v-2', name: 'Seminar Hall A', capacity: 150, active: true }],
          bookings: days > 7 || inRange ? [approved, pending] : [],
          clashes: [],
        });
      }),
    );
    const user = userEvent.setup();
    renderAt('/staff/calendar', { roles: ['dean'] });
    const list = await screen.findByRole('region', { name: 'Upcoming events' });
    // An approved event weeks away is listed too, marked as approved.
    const row = within(list).getByRole('button', { name: /Show Approved Recital/ });
    expect(within(row).getByText('Approved')).toBeInTheDocument();
    expect(
      within(within(list).getByRole('button', { name: /Show test/ })).getByText(
        'Awaiting approval',
      ),
    ).toBeInTheDocument();
    await screen.findAllByTestId('slot');
    expect(within(cell('Seminar Hall A', 17)).queryByText('test')).toBeNull();
    await user.click(within(list).getByRole('button', { name: /Show test/ }));
    await waitFor(() =>
      expect(within(cell('Seminar Hall A', 17)).getByText('test')).toBeInTheDocument(),
    );
    expect(within(cell('Seminar Hall A', 10)).getByText('Approved Recital')).toBeInTheDocument();
  });

  it('moves a month at a time, and to a chosen date', async () => {
    const asked: string[] = [];
    server.use(
      http.get(`${API_BASE}/venue-calendar`, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('from') ?? '');
        // A venue, so the day's grid renders beside its heading (the two once shared a key).
        return HttpResponse.json({
          buffer_minutes: '0',
          venues: [{ id: 'v-2', name: 'Seminar Hall A', capacity: 150, active: true }],
          bookings: [],
          clashes: [],
        });
      }),
    );
    const mondayOf = (d: Date) => {
      const m = new Date(d);
      m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      return dayKey(m.toISOString());
    };
    const next = new Date(`${today}T12:00`);
    const date = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(date, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    const user = userEvent.setup();
    renderAt('/staff/calendar', { roles: ['club_president:club-lens', 'student'] });
    await user.click(await screen.findByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(asked).toContain(mondayOf(next)));
    expect(screen.getByTestId('calendar-month')).toHaveTextContent(
      next.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    );
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    // Stepping back and forth leaves exactly one day heading and one grid on the page.
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(
      within(screen.getByRole('region', { name: 'Calendar' })).getAllByRole('heading', {
        level: 3,
        name: /day, \d{1,2} \w+ \d{4}$/,
      }),
    ).toHaveLength(1);
    expect(screen.getByLabelText('Go to date')).toHaveValue(today);
    fireEvent.change(screen.getByLabelText('Go to date'), { target: { value: '2027-03-17' } });
    await waitFor(() => expect(asked).toContain('2027-03-15'));
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('March 2027');
  });

  it('shades the Wednesday open-block hours, 15:00 and 16:00 (AR-03)', async () => {
    serve([]);
    const user = userEvent.setup();
    renderAt('/staff/calendar', { roles: ['cultural_society'] });
    const week = await screen.findByRole('group', { name: 'Week' });
    await user.click(within(week).getAllByRole('button')[2]!); // the week starts on Monday
    expect(cell('Seminar Hall A', 15).dataset.openBlock).toBe('true');
    expect(cell('Seminar Hall A', 16).dataset.openBlock).toBe('true');
    expect(cell('Seminar Hall A', 17).dataset.openBlock).toBe('false');
    expect(within(cell('Amphitheatre', 15)).getByText('Open block')).toBeInTheDocument();
  });

  it('rounds a legacy half-hour booking outward to whole hours', () => {
    const halfPast = (h: number) => new Date(`${today}T${h}:30`).toISOString();
    expect(hoursOn({ starts_at: halfPast(17), ends_at: halfPast(19) }, today)).toEqual([
      17, 18, 19,
    ]);
  });
});
