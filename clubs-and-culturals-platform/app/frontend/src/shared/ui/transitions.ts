/**
 * Transitions between pages (design system §7.5, docs/MOTION.html) for the SPA.
 *
 * React Router's declarative <BrowserRouter> has no view-transition support, so
 * the shell does it: every link click and history traversal it can see runs
 * inside document.startViewTransition with its kind (navKind) on
 * <html data-vt>. motion.css animates the root snapshot by kind and names the
 * nav bar and the top bar's row so they never move. Browsers without the API,
 * and tests, just navigate.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motionMs, navKind, type NavKind } from './motion';

const supported = () => typeof document !== 'undefined' && 'startViewTransition' in document;

let settle: (() => void) | null = null;

/** Resolves when the router commits its next location — or after --dur-lg, so a redirect never freezes rendering. */
function nextLocation(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      settle = null;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, motionMs('--dur-lg', 350));
    settle = done;
  });
}

/** Runs `update` inside a view transition of `kind`; plainly where the API is missing. */
export function transition(kind: NavKind, update: () => void | Promise<void>) {
  if (kind === 'none' || !supported()) {
    void update();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  const vt = document.startViewTransition(update);
  void vt.finished
    .catch(() => undefined)
    .then(() => {
      if (root.dataset.vt === kind) delete root.dataset.vt;
    });
}

/**
 * Mount once in the shell. `bar` holds the paths offered in the nav bar, so
 * moves between them fade through and everything else pushes or pops. After
 * each navigation, focus moves to the new page's title.
 */
export function usePageTransitions(bar: readonly string[]) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const shown = useRef({ path: pathname, idx: 0, bar });

  useEffect(() => {
    shown.current.bar = bar;
  }, [bar]);

  // The router committed a location: release the running transition, then move focus.
  useLayoutEffect(() => {
    settle?.();
    const prev = shown.current.path;
    shown.current.path = pathname;
    shown.current.idx = (history.state as { idx?: number } | null)?.idx ?? 0;
    if (prev === pathname) return; // first mount, or only the search/hash changed
    const title =
      document.querySelector<HTMLElement>('#main h1') ?? document.getElementById('main');
    if (!title) return;
    if (title.tabIndex < 0 && !title.hasAttribute('tabindex')) title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!supported()) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      if (a.origin !== window.location.origin) return;
      const kind = navKind(shown.current.path, a.pathname, shown.current.bar);
      if (kind === 'none') return;
      // shortcut: a <Link replace> or state= is navigated as a plain push; add them when a page needs one
      e.preventDefault(); // <Link> skips its own navigation once the default is prevented
      transition(kind, async () => {
        navigate(a.pathname + a.search + a.hash);
        await nextLocation();
      });
    };
    const onPop = (e: PopStateEvent) => {
      if (!e.isTrusted) return; // the copy dispatched below
      const idx = (history.state as { idx?: number } | null)?.idx ?? 0;
      const back = idx < shown.current.idx;
      const kind = navKind(shown.current.path, window.location.pathname, shown.current.bar, back);
      if (kind === 'none') return;
      e.stopImmediatePropagation(); // the router hears the copy, inside the transition
      transition(kind, async () => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        await nextLocation();
      });
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop, true);
    };
  }, [navigate]);
}
