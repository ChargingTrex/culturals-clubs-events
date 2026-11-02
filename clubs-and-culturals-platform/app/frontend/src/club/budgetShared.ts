import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../shared/api/client';
import type { EventOut, Page } from '../shared/api/types';
import { clubApi } from './api';

export const BUDGETS_KEY = ['budget', 'list'] as const;

type Tone = 'plain' | 'ok' | 'warn' | 'bad' | 'gold';
export const STAGE_TONE: Record<string, Tone> = {
  draft: 'plain',
  society_review: 'warn',
  dean_review: 'warn',
  vc_review: 'warn',
  sanctioned: 'gold',
  settled: 'ok',
  returned: 'bad',
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
