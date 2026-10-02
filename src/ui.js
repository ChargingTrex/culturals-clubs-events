/**
 * Page chrome: the role-scoped sidebar, the header, and render helpers.
 *
 * Every page is a separate HTML file that imports this and calls `page()`.
 */
import { ensureSeeded, reseed } from "./bootstrap.js";
import { PERSONAS, currentPersonaKey, savePersona, clearPersona, sessionFor }
  from "./session.js";

/** Every page, and the capability that decides whether to offer it. */
export const PAGES = [
  { file: "student-events.html", title: "What's on", group: "Student", need: "isStudent" },
  { file: "student-passes.html", title: "My passes", group: "Student", need: "isStudent" },
  { file: "student-profile.html", title: "Profile QR", group: "Student", need: "isStudent" },
  { file: "club-events.html", title: "Club events", group: "Club", need: "clubs" },
  { file: "club-new-event.html", title: "New event", group: "Club", need: "clubsCanPropose" },
  { file: "club-budget.html", title: "Budget", group: "Club", need: "clubsWithBudgetAccess" },
  { file: "club-roster.html", title: "Members & roles", group: "Club", need: "clubs" },
  { file: "organiser-scan.html", title: "Scan station", group: "Door", need: "door" },
  { file: "society-approvals.html", title: "Society approvals", group: "Approvals",
    need: "stage:cultural_society" },
  { file: "dean-approvals.html", title: "Dean approvals", group: "Approvals",
    need: "stage:dean" },
  { file: "vc-queue.html", title: "Above-threshold", group: "Approvals", need: "stage:vc" },
  { file: "dean-venues.html", title: "Venues", group: "Staff", need: "isDean" },
  { file: "dean-overview.html", title: "This semester", group: "Staff",
    need: "canSeeOverview" },
  { file: "vc-report.html", title: "Semester report", group: "Staff", need: "report" },
];

/**
 * Advisory only. Hiding a page is not a permission — the API refuses the call
 * regardless, and this decides what to OFFER.
 */
export function isAllowed(page, caps) {
  if (page.need === "door") {
    // NOT caps.clubs: a plain member and a Treasurer both hold a club role and
    // neither may work a door.
    return Boolean(caps.clubsDoorStaff.length || caps.organiserEvents.length);
  }
  if (page.need === "report") {
    return Boolean(caps.isDean || caps.isViceChancellor || caps.isCulturalSociety);
  }
  if (page.need.startsWith("stage:")) {
    return caps.approvalStages.includes(page.need.slice(6));
  }
  const value = caps[page.need];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export const allowedPages = caps => PAGES.filter(p => isAllowed(p, caps));

// --- helpers --------------------------------------------------------------
export const esc = v => String(v ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const inr = n => `₹${Number(n || 0).toLocaleString("en-IN",
  { maximumFractionDigits: 0 })}`;
export const fmtDate = d => new Date(d).toLocaleDateString("en-IN",
  { day: "numeric", month: "short", year: "numeric" });
export const fmtTime = d => new Date(d).toLocaleTimeString("en-IN",
  { hour: "2-digit", minute: "2-digit" });
export const dateBox = d => `<div class="date"><b>${new Date(d).getDate()}</b>`
  + `<span>${new Date(d).toLocaleDateString("en-IN", { month: "short" })}</span></div>`;

export const statusPill = s => ({
  draft: '<span class="pill">Draft</span>',
  submitted: '<span class="pill warn">Awaiting approval</span>',
  returned: '<span class="pill bad">Returned</span>',
  rejected: '<span class="pill bad">Rejected</span>',
  published: '<span class="pill ok">Published</span>',
  live: '<span class="pill gold">Live now</span>',
  completed: '<span class="pill">Completed</span>',
  reported: '<span class="pill ok">Reported</span>',
}[s] || esc(s));

/** QR rendering, drawn locally — no external API call, so it works offline. */
export async function qrImage(text, size = 160) {
  const { default: QR } = await import("./qrcode.js");
  return QR.toDataUrl(text, size);
}

/**
 * Render a refusal as itself.
 *
 * A demo that hides a 403 behind "something went wrong" throws away the most
 * interesting thing on the screen.
 */
export function showError(target, err) {
  const refused = err.status === 403 || err.status === 404;
  target.innerHTML = `<div class="err">
    <strong>${esc(err.title || "That did not work")}</strong>
    <p style="margin:6px 0 0">${esc(err.detail || err.message)}</p>
    ${err.code ? `<p style="margin:8px 0 0"><code>${err.status || ""} ·
      ${esc(err.code)}</code></p>` : ""}
    ${refused ? `<p class="small" style="margin:10px 0 0;opacity:.75">This is the rule
      refusing, not the page hiding a button. Sign in as another role to see it
      allowed.</p>` : ""}
    ${(err.errors || []).length ? `<ul style="margin:10px 0 0 18px">${err.errors.map(e =>
      `<li class="small">${esc(e.field)}: ${esc(e.message)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export function toast(text) {
  let host = document.querySelector(".toasts");
  if (!host) {
    host = document.createElement("div");
    host.className = "toasts";
    document.body.appendChild(host);
  }
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = text;
  host.appendChild(node);
  setTimeout(() => node.remove(), 3400);
}

// --- chrome ---------------------------------------------------------------
function header(session, caps) {
  const persona = PERSONAS.find(p => p.key === session.personaKey);
  return `
    <div class="demo-banner">Walkthrough build — data lives in this browser only.
      <a href="index.html">Switch role</a> · <button class="linkish" id="reseed">Reset
      data</button></div>
    <header class="top"><div class="top-inner">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Culturals</div>
      <span class="whoami">
        <strong>${esc(session.displayName)}</strong>
        <span>${esc(persona ? persona.blurb : "")}</span>
      </span>
      <button class="bell" id="bell" aria-label="Notifications">🔔<b id="bellCount"
        hidden>0</b></button>
    </div></header>`;
}

function sidebar(session, caps, activeFile) {
  const mine = allowedPages(caps);
  const groups = [];
  for (const page of mine) {
    const last = groups[groups.length - 1];
    if (last && last.group === page.group) last.pages.push(page);
    else groups.push({ group: page.group, pages: [page] });
  }
  return `
    ${groups.map(g => `<div class="nav-group">
      <span class="nav-head">${esc(g.group)}</span>
      ${g.pages.map(p => `<a href="${p.file}"
        ${p.file === activeFile ? 'aria-current="page"' : ""}>${esc(p.title)}</a>`)
        .join("")}</div>`).join("")}
    <a class="nav-signout" href="index.html">Sign out</a>`;
}

async function notifications(session) {
  const api = await import("./api.js");
  const unread = api.governance.unreadCount(session);
  const badge = document.getElementById("bellCount");
  if (badge) { badge.hidden = !unread; badge.textContent = String(unread); }
  const bell = document.getElementById("bell");
  if (!bell) return;
  bell.addEventListener("click", () => {
    const rows = api.governance.notifications(session);
    api.governance.markRead(session);
    if (badge) badge.hidden = true;
    const dialog = document.getElementById("dlg");
    document.getElementById("dlgBody").innerHTML = `
      <h2>Notifications</h2>
      <p class="small muted" style="margin:4px 0 12px">In-app and email only — no
        other channel exists.</p>
      <ul class="list">${rows.slice(0, 20).map(n => `<li class="small">
        <strong>${esc(n.subject)}</strong><br>${esc(n.body)}
        <br><span class="muted">${fmtDate(n.at)} ${fmtTime(n.at)}</span></li>`).join("")
        || `<li class="small muted">Nothing yet. Try submitting a proposal, then
            switch role.</li>`}</ul>
      <div class="row" style="margin-top:14px;justify-content:flex-end">
        <button class="btn" data-close-dlg>Close</button></div>`;
    dialog.showModal();
  });
}

/**
 * Boot a page: seed if needed, resolve the signed-in role, draw the chrome, then
 * hand `main` to the page's own render function.
 */
export async function page(activeFile, render) {
  await ensureSeeded();
  const key = currentPersonaKey();
  const session = key ? sessionFor(key) : null;
  if (!session) {
    // Not signed in. The login page is the only route in.
    location.replace("index.html");
    return;
  }
  const caps = session.capabilities();

  document.body.insertAdjacentHTML("afterbegin", header(session, caps));
  const nav = document.getElementById("nav");
  if (nav) nav.innerHTML = sidebar(session, caps, activeFile);

  document.getElementById("reseed").addEventListener("click", async () => {
    if (!confirm("Reset the walkthrough data in this browser?")) return;
    await reseed();
    location.reload();
  });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-close-dlg]")) document.getElementById("dlg").close();
  });
  await notifications(session);

  const main = document.querySelector("main");
  main.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    await render(main, session, caps);
  } catch (err) {
    showError(main, err);
  }
}

export { PERSONAS, savePersona, clearPersona, sessionFor, currentPersonaKey };
