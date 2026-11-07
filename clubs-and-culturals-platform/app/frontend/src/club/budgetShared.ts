import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../shared/api/client';
import type { EventOut, Page } from '../shared/api/types';
import { clubApi } from './api';

export const BUDGETS_KEY = ['budget', 'list'] as const;

type Tone = 'plain' | 'ok' | 'warn' | 'bad' | 'info';
export const STAGE_TONE: Record<string, Tone> = {
  draft: 'plain',
  society_review: 'info',
  dean_review: 'info',
  vc_review: 'info',
  sanctioned: 'ok',
  settled: 'plain',
  returned: 'warn',
  rejected: 'bad',
};

/** Every event the caller can see, by id — budgets carry only the event id. */
export function useEventIndex() {
  const events = useQuery<Page<EventOut>, ApiError>({
    queryKey: ['events', 'club', 'all'],
    queryFn: () => clubApi.events.list(),
  });
  return new Map((events.data?.results ?? []).map((e) => [e.id, e]));
}
