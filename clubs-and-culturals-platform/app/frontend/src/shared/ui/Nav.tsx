import { NavLink } from 'react-router-dom';
import type { Capabilities } from '../api/types';
import { allowedPages, groupPages } from '../nav/pages';

/**
 * Role-scoped navigation. Lists only what the capability payload allows.
 * Rendered twice: as the sidebar on wide screens, as the bottom bar on phones.
 */
export function Nav({
  capabilities,
  variant,
  onSignOut,
}: {
  capabilities: Capabilities;
  variant: 'sidebar' | 'bottom';
  onSignOut: () => void;
}) {
  const groups = groupPages(allowedPages(capabilities));
  if (variant === 'bottom') {
    return (
      <nav
        aria-label="Your pages"
        data-testid="nav-bottom"
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-line bg-surface px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] md:hidden"
      >
        {groups.flatMap((g) =>
          g.pages.map((p) => (
            <NavLink key={p.path} to={p.path} className="nav-link-bottom">
              {p.title}
            </NavLink>
          )),
        )}
      </nav>
    );
  }
  return (
    <nav
      aria-label="Your pages"
      data-testid="nav-sidebar"
      className="sticky top-[90px] hidden flex-col gap-0.5 self-start md:flex"
    >
      {groups.map((g) => (
        <div key={g.group} className="flex flex-col gap-0.5 [&+&]:mt-3">
          <span className="px-3 pb-1 text-[0.68rem] font-bold tracking-[0.09em] text-muted uppercase">
            {g.group}
          </span>
          {g.pages.map((p) => (
            <NavLink key={p.path} to={p.path} className="nav-link">
              {p.title}
            </NavLink>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 block w-full cursor-pointer border-t border-line pt-3 pl-3 text-left text-[0.84rem] text-ink-2 opacity-70 hover:opacity-100"
      >
        Sign out
      </button>
    </nav>
  );
}
