/**
 * Screens for checklist row F-05. App.tsx mounts these; this slice edits only this folder.
 *
 * SCREENS: [page-table path, element] — guarded by the page table's capability.
 * EXTRA:   [route path, element] — detail routes not in the sidebar (the API still refuses).
 */
import type { Screen } from '../shared/nav/screens';
import { ApprovalDetailPage } from './ApprovalDetailPage';
import { ApprovalQueuePage } from './ApprovalQueuePage';
import { OverviewPage } from './OverviewPage';
import { ReportPage } from './ReportPage';
import { VenuesPage } from './VenuesPage';

export const SCREENS: Screen[] = [
  ['/staff/approvals/society', <ApprovalQueuePage key="q-society" stage="cultural_society" />],
  ['/staff/approvals/dean', <ApprovalQueuePage key="q-dean" stage="dean" />],
  ['/staff/approvals/vc', <ApprovalQueuePage key="q-vc" stage="vc" />],
  ['/staff/venues', <VenuesPage key="venues" />],
  ['/staff/overview', <OverviewPage key="overview" />],
  ['/staff/report', <ReportPage key="report" />],
];

export const EXTRA: Screen[] = [['/staff/approvals/:id', <ApprovalDetailPage key="approval" />]];
