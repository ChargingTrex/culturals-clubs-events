import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { RegistrationOut } from '../shared/api/types';

export const EVENTS_KEY = ['events'] as const;
export const WALLET_KEY = ['participation', 'wallet'] as const;
export const eventKey = (id: string) => ['events', id] as const;

/** Register / cancel for one event, refreshing every screen that shows it. */
export function useRegistration(eventId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
      queryClient.invalidateQueries({ queryKey: WALLET_KEY }),
    ]);

  const register = useMutation<RegistrationOut, ApiError>({
    mutationFn: () => api.participation.register(eventId),
    onSuccess: invalidate,
  });

  const cancel = useMutation<void, ApiError, string>({
    mutationFn: (registrationId) => api.participation.cancel(registrationId),
    onSuccess: invalidate,
  });

  return { register, cancel };
}
