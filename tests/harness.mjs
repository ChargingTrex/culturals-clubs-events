/**
 * A dependency-free test harness.
 *
 * No framework on purpose: this repo is meant to be cloned and run by anyone with
 * Node and no patience for an install step. `node tests/run.mjs` is the whole story.
 */
import { reset } from "../src/db.js";
import { seedAll } from "../src/bootstrap.js";
import { sessionFor } from "../src/session.js";

const suites = [];
let current = null;

export function describe(name, fn) {
  current = { name, tests: [], before: null };
  suites.push(current);
  fn();
  current = null;
}

export function test(name, fn) {
  if (!current) throw new Error("test() outside describe()");
  current.tests.push({ name, fn });
}

export function beforeEach(fn) {
  if (!current) throw new Error("beforeEach() outside describe()");
  current.before = fn;
}

class AssertionError extends Error {}

export function expect(actual) {
  const fail = message => { throw new AssertionError(message); };
  return {
    toBe(expected) {
      if (actual !== expected) fail(`expected ${fmt(expected)}, got ${fmt(actual)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual); const b = JSON.stringify(expected);
      if (a !== b) fail(`expected ${b}, got ${a}`);
    },
    toBeTruthy() { if (!actual) fail(`expected truthy, got ${fmt(actual)}`); },
    toBeFalsy() { if (actual) fail(`expected falsy, got ${fmt(actual)}`); },
    toBeNull() { if (actual !== null) fail(`expected null, got ${fmt(actual)}`); },
    toContain(needle) {
      const ok = Array.isArray(actual)
        ? actual.includes(needle)
        : String(actual).includes(needle);
      if (!ok) fail(`expected ${fmt(actual)} to contain ${fmt(needle)}`);
    },
    notToContain(needle) {
      const ok = Array.isArray(actual)
        ? actual.includes(needle)
        : String(actual).includes(needle);
      if (ok) fail(`expected ${fmt(actual)} NOT to contain ${fmt(needle)}`);
    },
    toHaveLength(n) {
      if (actual.length !== n) fail(`expected length ${n}, got ${actual.length}`);
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) fail(`expected ${fmt(actual)} > ${n}`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) fail(`expected ${fmt(actual)} < ${n}`);
    },
  };
}

const fmt = v => (typeof v === "string" ? `"${v}"` : JSON.stringify(v));

/**
 * Assert that a call is refused, and with WHICH code.
 *
 * Checking only that it threw would pass on an unrelated bug, and the code is the
 * part a client branches on.
 */
export async function refuses(fn, { code, status } = {}) {
  let caught = null;
  try { await fn(); } catch (err) { caught = err; }
  if (!caught) throw new AssertionError("expected a refusal, but the call succeeded");
  if (code && caught.code !== code) {
    throw new AssertionError(
      `expected code ${code}, got ${caught.code} (${caught.message})`);
  }
  if (status && caught.status !== status) {
    throw new AssertionError(`expected status ${status}, got ${caught.status}`);
  }
  return caught;
}

/** A fresh seeded world plus a session per persona. */
export async function world() {
  reset();
  await seedAll();
  const as = {};
  for (const key of ["student", "member", "secretary", "treasurer", "president",
                     "organiser", "society", "dean", "vc", "management"]) {
    as[key] = sessionFor(key);
  }
  return as;
}

export async function run() {
  let passed = 0; const failures = [];
  const t0 = Date.now();

  for (const suite of suites) {
    process.stdout.write(`\n  ${suite.name}\n`);
    for (const unit of suite.tests) {
      let context = {};
      try {
        if (suite.before) context = (await suite.before()) || {};
        await unit.fn(context);
        passed += 1;
        process.stdout.write(`    \u001b[32m✓\u001b[0m ${unit.name}\n`);
      } catch (err) {
        failures.push({ suite: suite.name, test: unit.name, err });
        process.stdout.write(`    \u001b[31m✗\u001b[0m ${unit.name}\n`);
        process.stdout.write(`        ${err.message}\n`);
      }
    }
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(2);
  process.stdout.write(`\n  ${passed} passed, ${failures.length} failed  (${seconds}s)\n`);
  if (failures.length) {
    process.stdout.write("\n  FAILURES\n");
    for (const f of failures) {
      process.stdout.write(`    ${f.suite} › ${f.test}\n`);
      if (!(f.err instanceof AssertionError)) {
        process.stdout.write(`${f.err.stack}\n`);
      }
    }
  }
  return failures.length === 0;
}
