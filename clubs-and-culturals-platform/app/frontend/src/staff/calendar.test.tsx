import { screen, within } from '@testing-library/react';
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
    await screen.findByRole('heading', { name: 'Calendar' });
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

  it('rounds a legacy half-hour booking outward to whole hours', () => {
    const halfPast = (h: number) => new Date(`${today}T${h}:30`).toISOString();
    expect(hoursOn({ starts_at: halfPast(17), ends_at: halfPast(19) }, today)).toEqual([
      17, 18, 19,
    ]);
  });
});
