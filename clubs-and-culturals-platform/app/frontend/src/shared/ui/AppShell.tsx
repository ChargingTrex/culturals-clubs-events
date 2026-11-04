import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { logout, useSession } from '../auth/store';
import { useCapabilities } from '../auth/useCapabilities';
import { Avatar, Icon, topPosition } from '../ds';
import { roleLabel } from '../format';
import { ErrorBoundary } from './ErrorBoundary';
import { Loading } from './Empty';
import { Nav, SignOutButton } from './Nav';
import { ProblemView } from './ProblemView';
import { ThemeToggle } from './ThemeToggle';

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Desktop search: finds events by title or club on "What's on" (?q=). */
function EventSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const current = pathname === '/events' ? (params.get('q') ?? '') : '';
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? current;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    setDraft(null);
    navigate(q ? `/events?q=${encodeURIComponent(q)}` : '/events');
  };
  return (
    <form role="search" onSubmit={submit} className="w-full max-w-[420px]">
      <label className="cc-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          className="body-md"
          placeholder="Search events and clubs"
          aria-label="Search events and clubs"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
    </form>
  );
}

/**
 * Three layouts from one shell:
 * - phones: compact top bar + bottom tab bar (Apple);
 * - tablets: left sidebar, the person at its foot;
 * - desktop (lg, ≥1024px): sidebar + a desktop top bar — greeting, search,
 *   the person — and a wider canvas for multi-column page layouts.
 */
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

  const roles = me?.roles ?? session?.claims.roles ?? [];
  const name = me?.display_name ?? session?.claims.display_name ?? '';
  const whoRoles = roles
    .map((r) => roleLabel(r))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' · ');
  const position = topPosition(roles);

  const who = (
    <>
      <Avatar name={name || undefined} size="sm" position={position} />
      <div className="min-w-0">
        <div className="label-lg truncate">{name}</div>
        <div className="caption cc-sidebar-role truncate">{whoRoles}</div>
      </div>
      <SignOutButton onSignOut={signOut} />
    </>
  );

  // "Dr. Revathi Srinivasan" → "Revathi": skip a title before the first name.
  const firstName = name.replace(/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/)[0] ?? '';
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="flex min-h-dvh bg-bg">
      {capabilities ? (
        <Nav
          capabilities={capabilities}
          variant="sidebar"
          footer={
            <>
              {who}
              <ThemeToggle />
            </>
          }
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone top bar: wordmark, then who is signed in. */}
        <header className="cc-bar cc-bar--small md:hidden">
          <div className="cc-bar-row">
            <strong className="title-md text-navy">Culturals</strong>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <ThemeToggle />
              {who}
            </div>
          </div>
        </header>

        {/* Desktop top bar (design system: small app bar with search and the person). */}
        <header className="cc-bar cc-bar--small hidden lg:block" data-testid="desktop-bar">
          <div className="cc-bar-row mx-auto w-full max-w-[1280px] gap-6 px-8">
            <div className="min-w-0 shrink-0">
              <div className="title-sm truncate">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </div>
              <div className="caption text-ink-muted">{today}</div>
            </div>
            <div className="flex flex-1 justify-center">
              {capabilities?.is_student ? <EventSearch /> : null}
            </div>
            <div className="flex min-w-0 shrink-0 items-center gap-3">
              <ThemeToggle />
              <div className="flex max-w-[280px] min-w-0 items-center gap-3">{who}</div>
            </div>
          </div>
        </header>

        <main
          id="main"
          className="mx-auto w-full max-w-[1080px] min-w-0 px-4 pt-4 pb-28 md:px-8 md:pt-10 md:pb-12 lg:max-w-[1280px] lg:pt-8"
          tabIndex={-1}
        >
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

      {capabilities ? <Nav capabilities={capabilities} variant="bottom" /> : null}
    </div>
  );
}
