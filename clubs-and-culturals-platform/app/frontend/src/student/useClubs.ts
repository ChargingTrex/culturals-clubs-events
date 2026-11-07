/**
 * Club membership from the student's side (F-06.1, F-08.2): the club list and
 * join / leave. The controls built on these live in clubs.tsx.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { refreshSession, type ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { ClubOut, JoinRequestOut, MembershipOut, Page } from '../shared/api/types';
import { ME_QUERY_KEY } from '../shared/auth/useCapabilities';
import { POSITIONS, ROLE_POSITION } from '../shared/ds';
import { roleLabel } from '../shared/format';
import { useToast } from '../shared/ui/Toast';
import { EVENTS_KEY } from './useRegistration';

export const CLUBS_KEY = ['clubs'] as const;

export function useClubs() {
  return useQuery<Page<ClubOut>, ApiError>({
    queryKey: CLUBS_KEY,
    queryFn: () => api.clubs.list(),
    staleTime: 10 * 60_000,
  });
}

/** "President", "Club member" … for a `my_role` value. */
export function clubRoleLabel(role: string): string {
  const position = ROLE_POSITION[role];
  return position ? POSITIONS[position].label : roleLabel(role);
}

/**
 * Join or leave one club. Club roles travel in the token, so the session is
 * refreshed before `me`, the club list and the feed are re-read — otherwise
 * `my_role` and the "n of 5" strip would lag until the next refresh.
 */
export function useClubMembership(club: ClubOut) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const settle = async () => {
    await refreshSession();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CLUBS_KEY }),
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
    ]);
  };
  const join = useMutation<MembershipOut | JoinRequestOut, ApiError>({
    mutationFn: () => api.clubs.join(club.id),
    onSuccess: async (out) => {
      await settle();
      toast.show('state' in out ? `Asked to join ${club.name}` : `You joined ${club.name}`);
    },
  });
  const leave = useMutation<void, ApiError>({
    mutationFn: () => api.clubs.leave(club.id),
    onSuccess: async () => {
      await settle();
      toast.show(`You left ${club.name}`);
    },
  });
  return { join, leave };
}
