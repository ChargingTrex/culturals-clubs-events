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
  president: [...STUDENT, 'Club events', 'New event', 'Budget', 'Members & roles', 'Join requests', 'Scan station', 'Calendar'],
  organiser: [...STUDENT, 'Club events', 'New event', 'Budget', 'Members & roles', 'Join requests', 'Scan station', 'Calendar'],
  society: ['Society approvals', 'Calendar', 'Society members', 'This semester', 'Semester report'],
  dean: ['Dean approvals', 'Venues', 'Calendar', 'Society members', 'This semester', 'Semester report'],
  vc: ['Above-threshold', 'Calendar', 'This semester', 'Semester report'],
};

describe('role-scoped page offers', () => {
  for (const [key, expected] of Object.entries(EXPECTED) as [PersonaKey, string[]][]) {
    it(`${key} is offered exactly: ${expected.join(', ')}`, () => {
      const titles = allowedPages(capabilitiesFromRoles([...PERSONAS[key]])).map((p) => p.title);
      expect(titles).toEqual(expected);
    });
  }

  it('matches the web-app page counts plus Feed, Clubs and Calendar (5 / 7 / 9 / 9 / 12 / 12 / 5 / 6 / 4)', () => {
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
      president: 12,
      organiser: 12,
      society: 5,
      dean: 6,
      vc: 4,
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

  it('keeps Management on aggregates: overview and report, no roster or individual records', () => {
    const caps = capabilitiesFromRoles(['vice_chancellor']);
    expect(caps.can_see_individual_records).toBe(false);
    expect(allowedPages(caps).map((p) => p.title)).toEqual(['Above-threshold', 'Calendar', 'This semester', 'Semester report']);
  });

  it('lands each persona on its first offered page', () => {
    expect(firstAllowedPath(capabilitiesFromRoles(['student']))).toBe('/feed');
    expect(firstAllowedPath(capabilitiesFromRoles(['dean']))).toBe('/staff/approvals/dean');
    expect(firstAllowedPath(capabilitiesFromRoles(['vice_chancellor']))).toBe(
      '/staff/approvals/vc',
    );
    expect(firstAllowedPath(null)).toBe('/events');
  });

  it('a plain Society member sees the work but holds no approval queue (AR-08)', () => {
    const titles = allowedPages(capabilitiesFromRoles(['cultural_society'])).map((p) => p.title);
    expect(titles).toEqual(['Calendar', 'Society members', 'This semester', 'Semester report']);
  });

  it('the Vice-Secretary is offered the Society approval queue (AR-08)', () => {
    const titles = allowedPages(capabilitiesFromRoles(['cultural_society_vice_secretary'])).map((p) => p.title);
    expect(titles).toContain('Society approvals');
  });
});
