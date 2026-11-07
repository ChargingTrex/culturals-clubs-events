/**
 * Every page, and the capability that decides whether to OFFER it.
 *
 * Ported from web-app/src/ui.js `PAGES` + `isAllowed`, keyed on the backend's
 * own `/module/auth/me` capability names. Advisory only: hiding a page is not
 * a permission — the API refuses the call regardless. `probe` is the page's
 * own first call, which the route guard makes when the payload says "no", so
 * the screen shows the API's refusal rather than a blank.
 */
import type { ApprovalStage, Capabilities } from '../api/types';
import type { IconName } from '../ds';

export type PageNeed =
  | 'is_student'
  | 'is_dean'
  | 'is_vice_chancellor'
  | 'is_cultural_society'
  | 'is_admin'
  | 'can_see_overview'
  | 'can_see_individual_records'
  | 'can_see_all_clubs'
  | 'clubs'
  | 'clubs_with_budget_access'
  | 'clubs_can_assign_roles'
  | 'clubs_can_propose'
  | 'clubs_can_operate_events'
  | 'clubs_can_enter_spend'
  | 'clubs_door_staff'
  | 'organiser_events'
  | 'door'
  | 'report'
  | `stage:${ApprovalStage}`;

export type PageGroup = 'Student' | 'Club' | 'Door' | 'Approvals' | 'Staff';

export interface PageDef {
  path: string;
  title: string;
  group: PageGroup;
  need: PageNeed;
  probe: string;
  /** Design-system icon shown beside the title in the sidebar and bottom bar. */
  icon: IconName;
  /** Which checklist row builds the screen. */
  slice: 'F-02' | 'F-03' | 'F-04' | 'F-05' | 'F-06' | 'F-07';
}

export const PAGES: readonly PageDef[] = [
  {
    path: '/feed',
    icon: 'home',
    title: 'Feed',
    group: 'Student',
    need: 'is_student',
    probe: '/events?ordering=feed&page_size=1',
    slice: 'F-07',
  },
  {
    path: '/events',
    icon: 'calendar',
    title: "What's on",
    group: 'Student',
    need: 'is_student',
    probe: '/events?status=published,live&page_size=1',
    slice: 'F-02',
  },
  {
    path: '/passes',
    icon: 'ticket',
    title: 'My passes',
    group: 'Student',
    need: 'is_student',
    probe: '/participation/my-passes',
    slice: 'F-02',
  },
  {
    path: '/profile',
    icon: 'qr',
    title: 'Profile QR',
    group: 'Student',
    need: 'is_student',
    probe: '/participation/my-passes',
    slice: 'F-02',
  },
  {
    path: '/clubs',
    icon: 'clubs',
    title: 'Clubs',
    group: 'Student',
    need: 'is_student',
    probe: '/clubs?page_size=1',
    slice: 'F-06',
  },
  {
    path: '/club/events',
    icon: 'calendar',
    title: 'Club events',
    group: 'Club',
    need: 'clubs',
    probe: '/events?page_size=1',
    slice: 'F-04',
  },
  {
    path: '/club/events/new',
    icon: 'plus',
    title: 'New event',
    group: 'Club',
    need: 'clubs_can_propose',
    probe: '/budget/budget-templates',
    slice: 'F-04',
  },
  {
    path: '/club/budget',
    icon: 'wallet',
    title: 'Budget',
    group: 'Club',
    need: 'clubs_with_budget_access',
    probe: '/budget/budgets?page_size=1',
    slice: 'F-04',
  },
  {
    path: '/club/roster',
    icon: 'clubs',
    title: 'Members & roles',
    group: 'Club',
    need: 'clubs',
    probe: '/clubs?page_size=1',
    slice: 'F-04',
  },
  {
    path: '/scan',
    icon: 'qr',
    title: 'Scan station',
    group: 'Door',
    need: 'door',
    probe: '/events?status=published,live&page_size=1',
    slice: 'F-03',
  },
  {
    path: '/staff/approvals/society',
    icon: 'approval',
    title: 'Society approvals',
    group: 'Approvals',
    need: 'stage:cultural_society',
    probe: '/governance/approvals/queue',
    slice: 'F-05',
  },
  {
    path: '/staff/approvals/dean',
    icon: 'approval',
    title: 'Dean approvals',
    group: 'Approvals',
    need: 'stage:dean',
    probe: '/governance/approvals/queue',
    slice: 'F-05',
  },
  {
    path: '/staff/approvals/vc',
    icon: 'approval',
    title: 'Above-threshold',
    group: 'Approvals',
    need: 'stage:vc',
    probe: '/governance/approvals/queue',
    slice: 'F-05',
  },
  {
    path: '/staff/venues',
    icon: 'pin',
    title: 'Venues',
    group: 'Staff',
    need: 'is_dean',
    probe: '/venue-calendar',
    slice: 'F-05',
  },
  {
    path: '/staff/calendar',
    icon: 'calendar',
    title: 'Calendar',
    group: 'Staff',
    // Dean, admin and the Cultural Society (C-03); read-only for the Society.
    need: 'can_see_overview',
    probe: '/venue-calendar',
    slice: 'F-05',
  },
  {
    path: '/staff/overview',
    icon: 'eye',
    title: 'This semester',
    group: 'Staff',
    need: 'can_see_overview',
    probe: '/reporting/reports/overview',
    slice: 'F-05',
  },
  {
    path: '/staff/report',
    icon: 'sheet',
    title: 'Semester report',
    group: 'Staff',
    need: 'report',
    probe: '/reporting/reports/semester',
    slice: 'F-05',
  },
];

export function capabilityAllows(need: PageNeed, caps: Capabilities): boolean {
  if (need === 'door') {
    // NOT caps.clubs: a plain member and a Treasurer both hold a club role and
    // neither may work a door. The scan response carries names and PRNs.
    return caps.clubs_door_staff.length > 0 || caps.organiser_events.length > 0;
  }
  if (need === 'report') {
    return caps.is_dean || caps.is_vice_chancellor || caps.is_cultural_society;
  }
  if (need.startsWith('stage:')) {
    return caps.approval_stages.includes(need.slice(6) as ApprovalStage);
  }
  const value = caps[need as Exclude<PageNeed, 'door' | 'report' | `stage:${ApprovalStage}`>];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export const isAllowed = (page: PageDef, caps: Capabilities): boolean =>
  capabilityAllows(page.need, caps);

export const allowedPages = (caps: Capabilities): PageDef[] =>
  PAGES.filter((page) => isAllowed(page, caps));

export function firstAllowedPath(caps: Capabilities | null): string {
  const first = caps ? allowedPages(caps)[0] : undefined;
  return first ? first.path : '/events';
}

export function pageForPath(path: string): PageDef | undefined {
  return PAGES.find((page) => page.path === path);
}

export interface PageGroupDef {
  group: PageGroup;
  pages: PageDef[];
}

/** Consecutive pages of one group, in table order (same as the sidebar). */
export function groupPages(pages: PageDef[]): PageGroupDef[] {
  const groups: PageGroupDef[] = [];
  for (const page of pages) {
    const last = groups[groups.length - 1];
    if (last && last.group === page.group) last.pages.push(page);
    else groups.push({ group: page.group, pages: [page] });
  }
  return groups;
}
