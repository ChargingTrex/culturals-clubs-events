/**
 * Storage.
 *
 * One JSON document, versioned, persisted per viewer. Runs in the browser against
 * localStorage and in Node against a memory shim, so the test suite drives exactly
 * the same code the pages do.
 */
const KEY = "culturals.v1";

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

export function load() {
  if (state) return state;
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) {
        state = parsed;
        return state;
      }
    }
  } catch {
    // A corrupt document is worth discarding rather than crashing every page.
  }
  return null;
}

export function save() {
  if (!state) return;
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or a private window. The session still works; it just will not survive
    // a reload, which is better than losing the current walkthrough to an exception.
  }
}

export function setState(next) {
  state = next;
  save();
  return state;
}

export function db() {
  if (!state) throw new Error("Store not initialised — call reset() or load() first.");
  return state;
}

export function reset() {
  state = null;
  try {
    storage.removeItem(KEY);
  } catch {}
}

/** Deterministic ids, so a seeded dataset is identical on every machine. */
let counter = 0;
export function uid(prefix) {
  counter += 1;
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
