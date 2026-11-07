import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { Capabilities, ClubOut, Page } from '../shared/api/types';
import { useCapabilities } from '../shared/auth/useCapabilities';

type ClubList = keyof Pick<
  Capabilities,
  | 'clubs'
  | 'clubs_with_budget_access'
  | 'clubs_can_assign_roles'
  | 'clubs_can_propose'
  | 'clubs_can_operate_events'
  | 'clubs_can_enter_spend'
>;

export interface MyClub {
  id: string;
  name: string;
}

/**
 * The caller's clubs for one capability, named. The capability payload holds
 * ids only; names come from the public club list. Staff who see every club
 * (`can_see_all_clubs`) get the whole list.
 */
export function useMyClubs(which: ClubList = 'clubs') {
  const { capabilities } = useCapabilities();
  const clubs = useQuery<Page<ClubOut>, ApiError>({
    queryKey: ['clubs'],
    queryFn: () => api.clubs.list(),
    staleTime: 10 * 60_000,
  });
  const ids = capabilities?.[which] ?? [];
  const byId = new Map((clubs.data?.results ?? []).map((c) => [c.id, c.name]));
  const mine: MyClub[] =
    ids.length === 0 && capabilities?.can_see_all_clubs
      ? (clubs.data?.results ?? []).map((c) => ({ id: c.id, name: c.name }))
      : ids.map((cid) => ({ id: cid, name: byId.get(cid) ?? 'Your club' }));
  return { clubs: mine, isPending: clubs.isPending, error: clubs.error, capabilities };
}

/** The selected club, kept in `?club=` so a reload or a shared link keeps it. */
export function useSelectedClub(clubs: MyClub[]) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('club');
  const selected = clubs.find((c) => c.id === wanted) ?? clubs[0] ?? null;
  const select = (clubId: string) =>
    setParams(
      (p) => {
        p.set('club', clubId);
        return p;
      },
      { replace: true },
    );
  return { selected, select };
}
