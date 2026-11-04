/**
 * Motion helpers for the design system's Section 7 (docs/MOTION.html).
 *
 * The CSS in shared/ds/motion.css does the moving; this module covers what CSS
 * can't: timers that must match the tokens, a list's first load, the
 * reduce-motion switch, and which page transition a navigation gets.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

/** A duration token in ms. `fallback` is only for environments without the stylesheet (tests). */
export function motionMs(token: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : n * 1000;
}

/**
 * `cc-enter` while a list's first load plays (the enter duration plus the
 * capped stagger), '' ever after: rows stagger in once and never on a filter,
 * sort or refresh (§7.4).
 *   <ul className={cx('cc-listgroup-items', useFirstLoad(!!data))}>
 */
export function useFirstLoad(ready = true): string {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    if (!ready || !entering) return;
    const t = setTimeout(
      () => setEntering(false),
      motionMs('--dur-md', 250) + 5 * motionMs('--stagger', 30),
    );
    return () => clearTimeout(t);
  }, [ready, entering]);
  return ready && entering ? 'cc-enter' : '';
}

/* ---------- Reduce motion (§7.6): the device setting, or an explicit choice ---------- */
export type Motion = 'system' | 'full' | 'reduced';
const KEY = 'culturals.motion';
const EVENT = 'culturals:motion';

export function readMotion(): Motion {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'full' || v === 'reduced' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(motion: Motion) {
  if (typeof document === 'undefined') return;
  if (motion === 'system') delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = motion;
}

/** Sets <html data-motion>; motion.css honours "reduced" exactly like prefers-reduced-motion. */
export function setMotion(motion: Motion) {
  try {
    if (motion === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, motion);
  } catch {
    /* private mode: still apply for this page */
  }
  apply(motion);
  window.dispatchEvent(new Event(EVENT));
}

export function initMotion() {
  apply(readMotion());
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function useMotion(): Motion {
  return useSyncExternalStore(subscribe, readMotion, () => 'system');
}

/* ---------- Transitions between pages (§7.5) ---------- */
export type NavKind = 'tab' | 'push' | 'pop' | 'crossfade' | 'none';

/**
 * How one page hands over to the next. `bar` holds the paths offered in the
 * nav bar (peers); `back` says the navigation is a history traversal backwards.
 * Same path (a search or hash change) is no page transition at all.
 */
export function navKind(from: string, to: string, bar: readonly string[], back = false): NavKind {
  if (from === to) return 'none';
  if (from === '/signin' || to === '/signin') return 'crossfade';
  if (bar.includes(from) && bar.includes(to)) return 'tab';
  if (back || from.startsWith(to + '/')) return 'pop';
  if (bar.includes(to)) return 'tab';
  return 'push';
}
