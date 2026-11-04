import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { Capabilities } from '../api/types';
import { BottomSheet, Icon, IconButton, cx } from '../ds';
import { allowedPages, groupPages, type PageDef } from '../nav/pages';

/** The bottom bar holds at most this many destinations (design system: 3–5). */
const BAR_MAX = 5;

/** Exact-match a link only when another page lives under its path (/club/events vs /club/events/new). */
const exact = (p: PageDef, all: PageDef[]) => all.some((o) => o.path.startsWith(p.path + '/'));

/**
 * Role-scoped navigation. Lists only what the capability payload allows.
 * Desktop and tablet: the left sidebar. Phones: the bottom tab bar, with any
 * pages past the fifth under "More". Never both at once.
 */
export function Nav({
  capabilities,
  variant,
  footer,
}: {
  capabilities: Capabilities;
  variant: 'sidebar' | 'bottom';
  footer?: React.ReactNode;
}) {
  const pages = allowedPages(capabilities);
  if (variant === 'bottom') return <BottomNav pages={pages} />;

  return (
    <nav
      aria-label="Your pages"
      data-testid="nav-sidebar"
      className="cc-sidebar sticky top-0 hidden h-dvh shrink-0 overflow-y-auto md:flex"
    >
      <div className="cc-sidebar-brand">
        <strong className="title-md">Culturals</strong>
        <span className="caption">Clubs &amp; events</span>
      </div>
      {groupPages(pages).map((g) => (
        <div key={g.group} className="flex flex-col gap-0.5">
          <span className="cc-sidebar-section label-md">{g.group}</span>
          {g.pages.map((p) => (
            <NavLink
              key={p.path}
              to={p.path}
              end={exact(p, pages)}
              className="cc-nav-item label-lg"
            >
              <Icon name={p.icon} />
              <span>{p.title}</span>
            </NavLink>
          ))}
        </div>
      ))}
      {footer ? <div className="cc-sidebar-foot lg:hidden">{footer}</div> : null}
    </nav>
  );
}

function BottomNav({ pages }: { pages: PageDef[] }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const overflow = pages.length > BAR_MAX;
  const onBar = overflow ? pages.slice(0, BAR_MAX - 1) : pages;
  const inMore = overflow ? pages.slice(BAR_MAX - 1) : [];
  const moreActive = inMore.some((p) => p.path === pathname);

  return (
    <>
      <nav aria-label="Your pages" data-testid="nav-bottom" className="cc-nav md:hidden">
        <ul className="cc-nav-list">
          {onBar.map((p) => (
            <li key={p.path}>
              <NavLink to={p.path} end={exact(p, pages)} className="cc-nav-dest">
                {({ isActive }) => (
                  <>
                    <span className="cc-nav-ind">
                      <Icon name={p.icon} size={24} strokeWidth={isActive ? 2.25 : 1.75} />
                    </span>
                    <span className="cc-nav-label label-md">{p.title}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          {overflow ? (
            <li>
              <button
                type="button"
                className={cx('cc-nav-dest', moreActive && 'cc-nav-dest--active')}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
              >
                <span className="cc-nav-ind">
                  <Icon name="more" size={24} />
                </span>
                <span className="cc-nav-label label-md">More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
      {moreOpen ? (
        <BottomSheet title="More pages" onClose={() => setMoreOpen(false)}>
          <nav aria-label="More pages" data-testid="nav-more" className="flex flex-col gap-0.5">
            {inMore.map((p) => (
              <NavLink
                key={p.path}
                to={p.path}
                end={exact(p, pages)}
                className="cc-nav-item label-lg"
                onClick={() => setMoreOpen(false)}
              >
                <Icon name={p.icon} />
                <span>{p.title}</span>
              </NavLink>
            ))}
          </nav>
        </BottomSheet>
      ) : null}
    </>
  );
}

/** Sign-out control for the sidebar footer and the phone top bar. */
export function SignOutButton({ onSignOut }: { onSignOut: () => void }) {
  return <IconButton icon="logout" label="Sign out" size="sm" onClick={onSignOut} />;
}
