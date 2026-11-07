import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../shared/api/client';
import { api } from '../shared/api/endpoints';
import type { Wallet } from '../shared/api/types';
import { WALLET_KEY } from './useRegistration';

/** `GET /participation/my-passes` — passes plus the profile QR, one query. */
export function useWallet() {
  return useQuery<Wallet, ApiError>({
    queryKey: WALLET_KEY,
    queryFn: () => api.participation.myPasses(),
  });
}
