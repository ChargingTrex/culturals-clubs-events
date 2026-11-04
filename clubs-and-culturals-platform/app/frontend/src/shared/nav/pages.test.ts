/**
 * Port of web-app/tests/smoke.mjs §3: each persona is offered exactly its own
 * pages — and only those.
 */
import { describe, expect, it } from 'vitest';
import { PERSONAS, capabilitiesFromRoles, type PersonaKey } from '../../test/capabilities';
import { allowedPages, firstAllowedPath } from './pages';

const STUDENT = ['Feed', "What's on", 'My passes', 'Profile QR', 'Clubs'];
const EXPECTED: Record<PersonaKey, string[]> = {
  student: STUDENT,
  member: [...STUDENT, 'Club events', 'Members & roles'],
  secretary: [...STUDENT, 'Club events', 'New event', 'Members & roles', 'Scan station'],
  treasurer: [...STUDENT, 'Club events', 'New event', 'Budget', 'Members & roles'],
  president: [...STUDENT, 'Club events', 'New event', 'Budget', 'Members & roles', 'Scan station'],
  organiser: [...STUDENT, 'Club events', 'New event', 'Budget', 'Members & roles', 'Scan station'],
  society: ['Society approvals', 'This semester', 'Semester report'],
  dean: ['Dean approvals', 'Venues', 'This semester', 'Semester report'],
  vc: ['Above-threshold', 'Semester report'],
};

describe('role-scoped page offers', () => {
  for (const [key, expected] of Object.entries(EXPECTED) as [PersonaKey, string[]][]) {
    it(`${key} is offered exactly: ${expected.join(', ')}`, () => {
      const titles = allowedPages(capabilitiesFromRoles([...PERSONAS[key]])).map((p) => p.title);
      expect(titles).toEqual(expected);
    });
  }

  it('matches the web-app page counts plus Feed and Clubs (5 / 7 / 9 / 9 / 10 / 10 / 3 / 4 / 2)', () => {
    const counts = Object.fromEntries(
      (Object.keys(PERSONAS) as PersonaKey[]).map((k) => [
        k,
        allowedPages(capabilitiesFromRoles([...PERSONAS[k]])).length,
      ]),
    );
    expect(counts).toEqual({
      student: 5,
      member: 7,
      secretary: 9,
      treasurer: 9,
      president: 10,
      organiser: 10,
      society: 3,
      dean: 4,
      vc: 2,
    });
  });

  it('offers the scan station to an event organiser with no club role', () => {
    const caps = capabilitiesFromRoles(['student', 'event_organiser:ev-1']);
    expect(allowedPages(caps).map((p) => p.title)).toContain('Scan station');
  });

  it('never offers the scan station to a plain member or a treasurer (names and PRNs)', () => {
    for (const roles of [PERSONAS.member, PERSONAS.treasurer]) {
      const titles = allowedPages(capabilitiesFromRoles([...roles])).map((p) => p.title);
      expect(titles).not.toContain('Scan station');
    }
  });

  it('keeps Management on aggregates: no roster, no individual records page', () => {
    const caps = capabilitiesFromRoles(['vice_chancellor']);
    expect(caps.can_see_individual_records).toBe(false);
    expect(allowedPages(caps).map((p) => p.title)).toEqual(['Above-threshold', 'Semester report']);
  });

  it('lands each persona on its first offered page', () => {
    expect(firstAllowedPath(capabilitiesFromRoles(['student']))).toBe('/feed');
    expect(firstAllowedPath(capabilitiesFromRoles(['dean']))).toBe('/staff/approvals/dean');
    expect(firstAllowedPath(capabilitiesFromRoles(['vice_chancellor']))).toBe(
      '/staff/approvals/vc',
    );
    expect(firstAllowedPath(null)).toBe('/events');
  });
});
