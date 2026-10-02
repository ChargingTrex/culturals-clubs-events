/**
 * Smoke test.
 *
 * The e2e suite proves the rules. This proves the app is wired together: that every
 * page exists, imports only things that exist, imports only names its modules
 * actually export, and offers each role exactly the pages it can open.
 *
 * `node --check` cannot see any of that — it parses one file at a time.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];
const fail = m => problems.push(m);
const note = m => notes.push(m);

const pageFiles = readdirSync(root).filter(f => f.endsWith(".html")).sort();

// --- 1. the pages exist, and match the sidebar's list ---------------------
const { PAGES } = await import("../src/ui.js");
for (const page of PAGES) {
  if (!existsSync(join(root, page.file))) {
    fail(`ui.js lists ${page.file}, but the file does not exist`);
  }
}
for (const file of pageFiles) {
  if (file === "index.html") continue;
  if (!PAGES.some(p => p.file === file)) {
    fail(`${file} exists but no sidebar entry points at it — unreachable page`);
  }
}
note(`${pageFiles.length} pages, all listed in the sidebar`);

// --- 2. every import resolves, and every named import is exported ---------
const exportsOf = new Map();
function moduleExports(path) {
  if (exportsOf.has(path)) return exportsOf.get(path);
  const source = readFileSync(path, "utf8");
  const names = new Set();
  for (const m of source.matchAll(
    /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default/m.test(source)) names.add("default");
  for (const m of source.matchAll(/^export\s+\*\s+from\s+["']([^"']+)["']/gm)) {
    for (const n of moduleExports(resolve(dirname(path), m[1]))) names.add(n);
  }
  exportsOf.set(path, names);
  return names;
}

function checkImports(file, source, baseDir) {
  const pattern = /import\s+(?:([A-Za-z0-9_$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([A-Za-z0-9_$]+)|([A-Za-z0-9_$]+))?\s*from\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(pattern)) {
    const named = m[2];
    const defaultOnly = m[1] || m[4];
    const spec = m[5];
    if (!spec || !spec.startsWith(".")) continue;
    const target = resolve(baseDir, spec);
    if (!existsSync(target)) {
      fail(`${file} imports ${spec}, which does not exist`);
      continue;
    }
    const available = moduleExports(target);
    if (defaultOnly && !available.has("default")) {
      fail(`${file} default-imports ${spec}, which has no default export`);
    }
    for (const part of (named || "").split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!available.has(name)) {
        fail(`${file} imports { ${name} } from ${spec}, which does not export it`);
      }
    }
  }
}

for (const file of pageFiles) {
  const html = readFileSync(join(root, file), "utf8");
  const script = html.split('<script type="module">')[1];
  if (!script) { fail(`${file} has no module script`); continue; }
  checkImports(file, script.split("</script>")[0], root);
  if (!html.includes("assets/app.css")) fail(`${file} does not load the stylesheet`);
  // index.html is the login page: no sidebar and no <main>, by design.
  if (file !== "index.html") {
    if (!html.includes('<main id="main"')) fail(`${file} has no <main id="main">`);
    if (!html.includes('id="nav"')) fail(`${file} has no sidebar container`);
  } else if (!html.includes('id="roles"')) {
    fail("index.html has no role picker");
  }
}
for (const file of readdirSync(join(root, "src"))) {
  if (!file.endsWith(".js")) continue;
  checkImports(`src/${file}`, readFileSync(join(root, "src", file), "utf8"),
    join(root, "src"));
}
note("every relative import resolves and names a real export");

// --- 3. each role is offered exactly what it can open --------------------
const { reset, db } = await import("../src/db.js");
const { seedAll } = await import("../src/bootstrap.js");
const { sessionFor } = await import("../src/session.js");
const { allowedPages } = await import("../src/ui.js");

reset();
await seedAll();

const EXPECTED = {
  student: ["What's on", "My passes", "Profile QR"],
  member: ["What's on", "My passes", "Profile QR", "Club events", "Members & roles"],
  secretary: ["What's on", "My passes", "Profile QR", "Club events", "New event",
              "Members & roles", "Scan station"],
  treasurer: ["What's on", "My passes", "Profile QR", "Club events", "New event",
              "Budget", "Members & roles"],
  president: ["What's on", "My passes", "Profile QR", "Club events", "New event",
              "Budget", "Members & roles", "Scan station"],
  organiser: ["What's on", "My passes", "Profile QR", "Club events", "New event",
              "Budget", "Members & roles", "Scan station"],
  society: ["Society approvals", "This semester", "Semester report"],
  dean: ["Dean approvals", "Venues", "This semester", "Semester report"],
  vc: ["Above-threshold", "Semester report"],
};

for (const [key, expected] of Object.entries(EXPECTED)) {
  const session = sessionFor(key);
  if (!session) { fail(`persona ${key} does not resolve to anyone`); continue; }
  const titles = allowedPages(session.capabilities()).map(p => p.title);
  const missing = expected.filter(t => !titles.includes(t));
  const extra = titles.filter(t => !expected.includes(t));
  if (missing.length) fail(`${key} should be offered but is not: ${missing.join(", ")}`);
  if (extra.length) fail(`${key} is offered but should not be: ${extra.join(", ")}`);
}
note("every persona is offered exactly its own pages");

// --- 4. the sidebar never offers a page the rules refuse -----------------
const api = await import("../src/api.js");

const PROBE = {
  "student-events.html": s => api.events.list(s, { status: "published,live" }),
  "student-passes.html": s => api.participation.myPasses(s),
  "student-profile.html": s => api.participation.myPasses(s),
  "club-events.html": s => api.events.list(s, { club: s.capabilities().clubs[0] }),
  "club-new-event.html": () => api.budget.templates(),
  "club-budget.html": s => api.budget.list(s),
  "club-roster.html": s => api.clubs.roster(s, s.capabilities().clubs[0]),
  "society-approvals.html": s => api.governance.queue(s),
  "dean-approvals.html": s => api.governance.queue(s),
  "vc-queue.html": s => api.governance.queue(s),
  "dean-venues.html": s => api.venues.calendar(s),
  "dean-overview.html": s => api.reports.overview(s),
  "vc-report.html": s => api.reports.semester(s),
  "organiser-scan.html": s => {
    const event = api.events.list(s, { status: "live,published" }).find(
      e => s.capabilities().clubsDoorStaff.includes(e.clubId));
    return event ? api.participation.station(s, event.id) : null;
  },
};

for (const key of Object.keys(EXPECTED)) {
  const session = sessionFor(key);
  for (const page of allowedPages(session.capabilities())) {
    const probe = PROBE[page.file];
    if (!probe) continue;
    try {
      await probe(session);
    } catch (err) {
      fail(`${key} is offered "${page.title}" but its own call is refused: `
        + `${err.code || err.message}`);
    }
  }
}
note("no role is offered a page whose own call would refuse it");

// --- 5. the dataset is substantial enough to demonstrate anything --------
const state = db();
const checks = [
  [state.events.length >= 10, "at least 10 events"],
  [state.students.length >= 40, "at least 40 students"],
  [state.approvals.some(a => a.stages.length === 3), "a three-gate route to show"],
  [state.approvals.some(a => a.state === "pending"), "something pending to decide"],
  [state.budgets.some(b => b.stage === "settled"), "a settled budget"],
  [state.scans.some(s => s.result === "unknown_code"),
   "a failed scan, so the capture rate is not a meaningless 1.0"],
  [state.registrations.filter(r => r.attended).length > 50, "real attendance"],
];
for (const [ok, what] of checks) {
  if (!ok) fail(`the seeded dataset lacks ${what}`);
}
const report = api.reports.semester(sessionFor("dean"));
if (!(report.uniqueStudents < report.totalParticipation)) {
  fail("the seed has no attendance overlap, so unique vs total proves nothing");
}
note(`seed: ${state.events.length} events, ${report.totalParticipation} attendances `
  + `from ${report.uniqueStudents} unique students`);

// --- report --------------------------------------------------------------
process.stdout.write("\n  Culturals — smoke test\n\n");
for (const n of notes) process.stdout.write(`    \u001b[32m✓\u001b[0m ${n}\n`);
for (const p of problems) process.stdout.write(`    \u001b[31m✗\u001b[0m ${p}\n`);
process.stdout.write(problems.length
  ? `\n  ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`
  : "\n  All clear.\n");
process.exit(problems.length ? 1 : 0);
