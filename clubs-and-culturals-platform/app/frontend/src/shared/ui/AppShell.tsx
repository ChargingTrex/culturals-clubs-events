import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout, useSession } from '../auth/store';
import { useCapabilities } from '../auth/useCapabilities';
import { roleLabel } from '../format';
import { ErrorBoundary } from './ErrorBoundary';
import { Loading } from './Empty';
import { Nav } from './Nav';
import { ProblemView } from './ProblemView';

function Brand() {
  return (
    <div className="flex items-center gap-2 font-display text-[1.25rem] font-extrabold tracking-[-0.02em]">
      <span
        aria-hidden="true"
        className="h-[26px] w-[26px] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, var(--marigold) 0 38%, transparent 39%), repeating-conic-gradient(var(--marigold) 0 12deg, transparent 12deg 24deg)',
        }}
      />
      Culturals
    </div>
  );
}

export function AppShell() {
  const session = useSession();
  const { me, capabilities, isLoading, error } = useCapabilities();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await logout();
    queryClient.clear();
    navigate('/signin', { replace: true });
  };

  const whoRoles = (me?.roles ?? session?.claims.roles ?? [])
    .map((r) => roleLabel(r))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' · ');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-20 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 px-4 py-3 md:px-5">
          <Brand />
          <div className="ml-auto text-right text-[0.85rem] leading-tight">
            <strong className="block text-[0.92rem]">
              {me?.display_name ?? session?.claims.display_name ?? ''}
            </strong>
            <span className="text-[0.78rem] opacity-60">{whoRoles}</span>
          </div>
          <button
            type="button"
            className="btn btn-quiet text-[0.85rem] md:hidden"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 pt-4 pb-24 md:grid-cols-[210px_1fr] md:px-5 md:pt-6 md:pb-10">
        {capabilities ? (
          <Nav capabilities={capabilities} variant="sidebar" onSignOut={signOut} />
        ) : (
          <div className="hidden md:block" />
        )}
        <main id="main" className="min-w-0" tabIndex={-1}>
          <ErrorBoundary resetKey={location.pathname}>
            {error ? (
              <ProblemView error={error} />
            ) : isLoading && !capabilities ? (
              <Loading />
            ) : (
              <Outlet />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {capabilities ? (
        <Nav capabilities={capabilities} variant="bottom" onSignOut={signOut} />
      ) : null}
    </div>
  );
}
