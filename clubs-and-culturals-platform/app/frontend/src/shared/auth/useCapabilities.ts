import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import { api } from '../api/endpoints';
import type { Capabilities, Me } from '../api/types';
import { useSession } from './store';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export const meQuery = {
  queryKey: ME_QUERY_KEY,
  queryFn: () => api.auth.me(),
  staleTime: 5 * 60_000,
};

export function useMe() {
  const session = useSession();
  return useQuery<Me, ApiError>({ ...meQuery, enabled: session !== null });
}

export interface CapabilityState {
  me: Me | null;
  capabilities: Capabilities | null;
  isLoading: boolean;
  error: ApiError | null;
}

/**
 * The capability payload, cached. Advisory only: it decides what the UI
 * offers, and every one of these is re-checked by the API on the call itself.
 */
export function useCapabilities(): CapabilityState {
  const query = useMe();
  return {
    me: query.data ?? null,
    capabilities: query.data?.capabilities ?? null,
    isLoading: query.isPending && query.fetchStatus !== 'idle',
    error: query.error ?? null,
  };
}
