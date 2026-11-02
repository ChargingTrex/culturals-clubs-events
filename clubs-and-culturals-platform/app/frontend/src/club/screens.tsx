/**
 * Screens for checklist row F-04. App.tsx mounts these; this slice edits only this folder.
 *
 * SCREENS: [page-table path, element] — guarded by the page table's capability.
 * EXTRA:   [route path, element] — detail routes not in the sidebar (the API still refuses).
 */
import type { Screen } from '../shared/nav/screens';
import { BudgetDetailPage } from './BudgetDetailPage';
import { BudgetPage } from './BudgetPage';
import { ClubEventDetailPage } from './ClubEventDetailPage';
import { ClubEventsPage } from './ClubEventsPage';
import { NewEventPage } from './NewEventPage';
import { RosterPage } from './RosterPage';

export const SCREENS: Screen[] = [
  ['/club/events', <ClubEventsPage key="club-events" />],
  ['/club/events/new', <NewEventPage key="club-new-event" />],
  ['/club/budget', <BudgetPage key="club-budget" />],
  ['/club/roster', <RosterPage key="club-roster" />],
];

export const EXTRA: Screen[] = [
  ['/club/events/:id', <ClubEventDetailPage key="club-event" />],
  ['/club/budget/:id', <BudgetDetailPage key="club-budget-detail" />],
];
