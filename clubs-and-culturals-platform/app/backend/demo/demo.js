/* =====================================================================
   Shared demo runtime.

   Each view is its own page. They share this module for three things:
   persona switching, the API client, and small render helpers.

   Login is disabled for the demo: the persona picker calls
   /auth/demo/<persona>, which mints a REAL token with no password. Every
   permission check downstream still runs, which is the point — when the
   Vice-Chancellor's page shows "not available to this role", that is a
   genuine 403 from the API, not a UI pretence.
   ===================================================================== */
const API = "/api/v1";
const KEY = "culturals-demo-persona";

export const PAGES = [
  { file: "student-events.html",    title: "What's on",            role: "Student",   need: "is_student" },
  { file: "student-passes.html",    title: "My passes",            role: "Student",   need: "is_student" },
  { file: "student-profile.html",   title: "Profile QR",           role: "Student",   need: "is_student" },
  { file: "club-events.html",       title: "Club events",          role: "Club",      need: "clubs" },
  { file: "club-new-event.html",    title: "New event",            role: "Club",      need: "clubs_can_propose" },
  { file: "club-roster.html",       title: "Members & roles",      role: "Club",      need: "clubs" },
  { file: "club-budget.html",       title: "Budget",               role: "Club",      need: "clubs_with_budget_access" },
  { file: "organiser-scan.html",    title: "Scan station",         role: "Organiser", need: "door" },
  { file: "society-approvals.html", title: "Society approvals",    role: "Society",   need: "stage:cultural_society" },
  { file: "dean-approvals.html",    title: "Dean approvals",       role: "Dean",      need: "stage:dean" },
  { file: "dean-venues.html",       title: "Venues",               role: "Dean",      need: "is_dean" },
  { file: "dean-overview.html",     title: "This semester",        role: "Dean",      need: "can_see_overview" },
  { file: "vc-queue.html",          title: "Above-threshold",      role: "Management", need: "stage:vc" },
  { file: "vc-report.html",         title: "Semester report",      role: "Management", need: "report" },
];

/* ---------------- who may see which page ----------------
   Advisory only. Hiding a page is NOT a permission — every one of these checks
   is enforced again server-side on the request the page makes, and typing a
   hidden page's URL still reaches a real 403 or 404 from the API. This function
   decides what to OFFER, not what to allow.
   ------------------------------------------------------------------------- */
export function isAllowed(pageDef, caps) {
  const need = pageDef.need;
  if (need === "door") {
    // NOT caps.clubs — a plain member and a Treasurer both hold a club role and
    // neither may work a door. The server computes the door-staff set.
    return Boolean(caps.clubs_door_staff.length || caps.organiser_events.length);
  }
  if (need === "report") {
    return Boolean(caps.is_dean || caps.is_vice_chancellor || caps.is_cultural_society);
  }
  if (need.startsWith("stage:")) {
    return caps.approval_stages.includes(need.slice(6));
  }
  const value = caps[need];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function allowedPages(caps) {
  return PAGES.filter(p => isAllowed(p, caps));
}

/* ---------------- persona ---------------- */
export function currentPersona() {
  try { return localStorage.getItem(KEY) || "dean"; } catch { return "dean"; }
}
function setPersona(key) {
  try { localStorage.setItem(KEY, key); } catch {}
  sessionStorage.removeItem("culturals-demo-token");
  location.reload();
}

let tokenPromise = null;
async function token() {
  const cached = sessionStorage.getItem("culturals-demo-token");
  if (cached) return cached;
  if (!tokenPromise) {
    tokenPromise = fetch(`${API}/module/auth/demo/${currentPersona()}`, { method: "POST" })
      .then(async r => {
        if (!r.ok) throw await problem(r);
        const body = await r.json();
        sessionStorage.setItem("culturals-demo-token", body.access_token);
        sessionStorage.setItem("culturals-demo-claims", JSON.stringify(body.claims));
        sessionStorage.setItem("culturals-demo-label", body.persona.label + " — " + body.persona.sub);
        return body.access_token;
      })
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

async function problem(response) {
  let body = {};
  try { body = await response.json(); } catch {}
  const err = new Error(body.detail || body.title || response.statusText);
  err.status = response.status;
  err.code = body.code;
  err.title = body.title;
  err.errors = body.errors;
  return err;
}

/* ---------------- api ---------------- */
export async function api(path, options = {}) {
  const t = await token();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${t}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  if (!response.ok) throw await problem(response);
  return response.json();
}

export async function me() {
  if (!window.__me) window.__me = await api("/module/auth/me");
  return window.__me;
}

/* ---------------- chrome ---------------- */
export async function chrome(activeFile) {
  const personas = await fetch(`${API}/module/auth/demo/personas`).then(r => r.json());
  const header = document.createElement("div");
  header.innerHTML = `
    <div class="demo-banner">Demo mode — login disabled. Tokens are real, so every
      permission check below is genuine. <a href="index.html">All pages</a></div>
    <header class="top"><div class="top-inner">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Culturals</div>
      <span class="persona-who" id="whoami"></span>
    </div></header>
    <div class="persona-bar">
      <label for="persona">Viewing as</label>
      <select id="persona">${personas.personas.map(p =>
        `<option value="${p.key}" ${p.key === currentPersona() ? "selected" : ""}
          ${p.available ? "" : "disabled"}>${p.label}${p.available ? "" : " (not seeded)"}</option>`
      ).join("")}</select>
      <span class="persona-who" id="personaSub"></span>
      <span style="flex:1"></span>
      <a class="btn quiet" href="index.html">All pages</a>
    </div>`;
  document.body.prepend(header);
  document.getElementById("persona").addEventListener("change", e => setPersona(e.target.value));

  await token();
  const claims = JSON.parse(sessionStorage.getItem("culturals-demo-claims") || "{}");
  document.getElementById("whoami").textContent = claims.display_name || "";
  document.getElementById("personaSub").textContent =
    sessionStorage.getItem("culturals-demo-label") || "";

  await renderNav(activeFile, claims);
  return claims;
}

/* The sidebar lists only the pages this persona can open. Switch persona and the
   sidebar changes with it — a President never sees the Dean's queue in their nav. */
async function renderNav(activeFile, claims) {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const caps = (await me()).capabilities;
  const mine = allowedPages(caps);
  const current = activeFile || location.pathname.split("/").pop();
  const label = sessionStorage.getItem("culturals-demo-label") || "";
  const roleName = label.split("—")[0].trim();

  const groups = [];
  for (const p of mine) {
    const last = groups[groups.length - 1];
    if (last && last.role === p.role) last.pages.push(p);
    else groups.push({ role: p.role, pages: [p] });
  }

  nav.innerHTML = `
    <div class="who"><strong>${esc(claims.display_name || "")}</strong>${esc(roleName)}</div>
    ${groups.map(g => `
      <div class="nav-group">${g.pages.map(p => `
        <a href="${p.file}" ${p.file === current ? 'aria-current="page"' : ""}>${esc(p.title)}</a>`
      ).join("")}</div>`).join("")}
    <a href="index.html" class="nav-all"
      ${current === "index.html" ? 'aria-current="page"' : ""}>All your pages</a>`;
}

/* ---------------- helpers ---------------- */
export const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN",
  { maximumFractionDigits: 0 });
export const fmtDate = d => new Date(d).toLocaleDateString("en-IN",
  { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = d => new Date(d).toLocaleTimeString("en-IN",
  { hour: "2-digit", minute: "2-digit" });
export const dayNum = d => new Date(d).getDate();
export const monShort = d => new Date(d).toLocaleDateString("en-IN", { month: "short" });
export const dateBox = d => `<div class="date"><b>${dayNum(d)}</b><span>${monShort(d)}</span></div>`;

export const statusPill = s => ({
  reported: '<span class="pill ok">Reported</span>',
  completed: '<span class="pill">Completed</span>',
  live: '<span class="pill gold">Live now</span>',
  published: '<span class="pill ok">Published</span>',
  approved: '<span class="pill ok">Approved</span>',
  submitted: '<span class="pill warn">Awaiting approval</span>',
  returned: '<span class="pill bad">Returned</span>',
  rejected: '<span class="pill bad">Rejected</span>',
  draft: '<span class="pill">Draft</span>',
  cancelled: '<span class="pill bad">Cancelled</span>',
}[s] || esc(s));

/* Render an API failure as itself. A demo that hides a 403 behind "something
   went wrong" throws away the most interesting thing on the screen. */
export function showError(target, err) {
  const denied = err.status === 403 || err.status === 404;
  target.innerHTML = `<div class="err">
    <strong>${esc(err.title || "Request failed")}</strong>
    <p style="margin:6px 0 0">${esc(err.message)}</p>
    <p style="margin:8px 0 0"><code>HTTP ${err.status}${err.code ? " · " + esc(err.code) : ""}</code></p>
    ${denied ? `<p class="small" style="margin:10px 0 0;opacity:.75">This is the API
      refusing, not the page hiding a control. Switch persona above to see it allowed.</p>` : ""}
    ${err.errors?.length ? `<ul style="margin:10px 0 0 18px">${err.errors.map(e =>
      `<li class="small">${esc(e.field)}: ${esc(e.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export async function page(activeFile, render) {
  await chrome(activeFile);
  const main = document.querySelector("main");
  main.innerHTML = `<div class="loading">Loading…</div>`;
  try { await render(main); }
  catch (err) { showError(main, err); }
}
