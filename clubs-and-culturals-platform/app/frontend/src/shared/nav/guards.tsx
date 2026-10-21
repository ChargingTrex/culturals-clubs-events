import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { request, type ApiError } from '../api/client';
import { useSession } from '../auth/store';
import { useCapabilities } from '../auth/useCapabilities';
import { Loading } from '../ui/Empty';
import { ProblemView } from '../ui/ProblemView';
import { capabilityAllows, type PageNeed } from './pages';

/** Not signed in → the sign-in page, which returns here afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}`} replace />;
  }
  return <>{children}</>;
}

interface GuardProps {
  need: PageNeed;
  /** The page's own first call. Made only when the payload says "no". */
  probe: string;
  children: ReactNode;
}

/**
 * Does not hide. If the capability payload does not allow the page, the guard
 * makes the page's own call and renders the API's own problem (403/404 with
 * its code). If that call unexpectedly succeeds — the payload is advisory —
 * the page renders.
 */
export function RequireCapability({ need, probe, children }: GuardProps) {
  const { capabilities, isLoading } = useCapabilities();
  const allowed = capabilities ? capabilityAllows(need, capabilities) : false;

  const probeQuery = useQuery<unknown, ApiError>({
    queryKey: ['probe', probe],
    queryFn: () => request<unknown>(probe),
    enabled: capabilities !== null && !allowed,
    retry: false,
    staleTime: 60_000,
  });

  if (!capabilities) return isLoading ? <Loading /> : null;
  if (allowed) return <>{children}</>;
  if (probeQuery.isPending) return <Loading label="Checking with the server…" />;
  if (probeQuery.error) return <ProblemView error={probeQuery.error} />;
  return <>{children}</>;
}
