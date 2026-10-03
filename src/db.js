/**
 * Storage.
 *
 * One JSON document, versioned, persisted per viewer. Runs in the browser against
 * localStorage and in Node against a memory shim, so the test suite drives exactly
 * the same code the pages do.
 */
const KEY = "culturals.v1";

/**
 * Bumped whenever the shape of the document changes. A tester who opened an
 * earlier pilot build has that build's data in their browser; reading it with
 * this build's rules would show them a world neither build produced, so a
 * mismatch is discarded and reseeded instead.
 */
export const SCHEMA_VERSION = 2;

const memory = new Map();
const storage = (() => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("__probe", "1");
      localStorage.removeItem("__probe");
      return localStorage;
    }
  } catch {
    // Private windows and blocked site data both land here. Falling back keeps the
    // app usable rather than throwing on first paint.
  }
  return {
    getItem: k => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
    removeItem: k => memory.delete(k),
  };
})();

let state = null;

/**
 * Set when another tab writes the document. The next db() call re-reads it, so a
 * mutation here never writes back a copy older than what the other tab saved —
 * last-write-wins would otherwise silently undo a Dean's approval made in the
 * neighbouring tab.
 */
let stale = false;
const externalListeners = new Set();

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", event => {
    if (event.key !== KEY) return;
    stale = true;
    for (const listener of externalListeners) {
      try { listener(); } catch {}
    }
  });
}

/** Called when another tab changes the data. Returns an unsubscribe function. */
export function onExternalChange(listener) {
  externalListeners.add(listener);
  return () => externalListeners.delete(listener);
}

function readStored() {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === SCHEMA_VERSION ? parsed : null;
  } catch {
    // A corrupt document is worth discarding rather than crashing every page.
    return null;
  }
}

function adopt(parsed) {
  state = parsed;
  // Continue numbering where the stored document left off. Every page is a fresh
  // load, so a counter that restarted at zero handed out ids already in use: two
  // events created on two page loads were both ev_0001.
  counter = Math.max(counter, Number(state.seq) || 0);
  return state;
}

export function load() {
  if (state && !stale) return state;
  stale = false;
  const parsed = readStored();
  return parsed ? adopt(parsed) : (state = null);
}

export function save() {
  if (!state) return;
  state.seq = Math.max(Number(state.seq) || 0, counter);
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or a private window. The session still works; it just will not survive
    // a reload, which is better than losing the current walkthrough to an exception.
  }
}

export function setState(next) {
  state = next;
  stale = false;
  save();
  return state;
}

export function db() {
  if (stale) {
    stale = false;
    const fresh = readStored();
    if (fresh) adopt(fresh);
  }
  if (!state) throw new Error("Store not initialised — call reset() or load() first.");
  return state;
}

export function reset() {
  state = null;
  stale = false;
  try {
    storage.removeItem(KEY);
  } catch {}
}

/**
 * Forget the in-memory copy and the id counter, exactly as navigating to another
 * page does. The stored document is untouched, so the next load() reads it back.
 * Tests use this to prove that state survives a page load intact.
 */
export function dropMemory() {
  state = null;
  stale = false;
  counter = 0;
}

/**
 * Deterministic ids, so a seeded dataset is identical on every machine. The
 * counter is persisted with the document (`seq`) and restored on load.
 */
let counter = 0;
export function uid(prefix) {
  counter += 1;
  if (state) state.seq = counter;
  return `${prefix}_${counter.toString(36).padStart(4, "0")}`;
}
export function resetIds() {
  counter = 0;
}

/** A seeded PRNG — the demo dataset must not change between reloads. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const find = (list, id) => list.find(x => x.id === id);
export const now = () => new Date().toISOString();
