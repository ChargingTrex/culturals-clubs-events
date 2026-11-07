/**
 * Light / dark / system theme.
 *
 * The design system's tokens (shared/ds/tokens.css) already switch on
 * `data-theme` on <html>: "light" and "dark" force a scheme, no attribute
 * follows the device. This module only stores the choice and sets that
 * attribute; every colour still comes from tokens.css.
 */
import { useSyncExternalStore } from 'react';
import { transition } from './transitions';

export type Theme = 'system' | 'light' | 'dark';
export const THEMES: Theme[] = ['system', 'light', 'dark'];

const KEY = 'culturals.theme';
const EVENT = 'culturals:theme';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readTheme(): Theme {
  const v = storage()?.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function apply(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') storage()?.removeItem(KEY);
    else storage()?.setItem(KEY, theme);
  } catch {
    /* private mode: still apply for this page */
  }
  transition('crossfade', () => apply(theme)); // §7.3: one --dur-md crossfade of the page
  window.dispatchEvent(new Event(EVENT));
}

/** Call once before the first render so the page never flashes the wrong theme. */
export function initTheme() {
  apply(readTheme());
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      apply(readTheme());
      onChange();
    }
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage); // another tab changed it
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => 'system');
}
