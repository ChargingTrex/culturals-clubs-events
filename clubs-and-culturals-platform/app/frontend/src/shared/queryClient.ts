import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api/client';

/** Retry only what a retry can fix: network blips and 5xx. Never a 4xx. */
export function createQueryClient(overrides: { retry?: boolean } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry:
          overrides.retry === false
            ? false
            : (count, error) =>
                count < 1 && (!isApiError(error) || error.status === 0 || error.status >= 500),
      },
      mutations: { retry: false },
    },
  });
}
