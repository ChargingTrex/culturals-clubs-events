/**
 * Screens for checklist row F-03. App.tsx mounts these; this slice edits only this folder.
 *
 * SCREENS: [page-table path, element] — guarded by the page table's capability.
 * EXTRA:   [route path, element] — detail routes not in the sidebar (the API still refuses).
 */
import type { Screen } from '../shared/nav/screens';
import { ScanPage } from './ScanPage';

export const SCREENS: Screen[] = [['/scan', <ScanPage key="scan" />]];
export const EXTRA: Screen[] = [];
