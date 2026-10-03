/**
 * Page chrome: the role-scoped sidebar, the header, and render helpers.
 *
 * Every page is a separate HTML file that imports this and calls `page()`.
 */
import { ensureSeeded, reseed } from "./bootstrap.js";
import { onExternalChange } from "./db.js";
import { PERSONAS, currentPersonaKey, savePersona, clearPersona, sessionFor }
  from "./session.js";
import { APP, buildInfo, buildLabel } from "./config.js";

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
  { file: "vc-queue.html", title: "VC approvals", group: "Approvals", need: "stage:vc" },
  { file: "management-queue.html", title: "Management approvals", group: "Approvals",
    need: "stage:management" },
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
    return Boolean(caps.isDean || caps.isViceChancellor || caps.isManagement
      || caps.isCulturalSociety);
  }
  if (page.need.startsWith("stage:")) {
    return caps.approvalStages.includes(page.need.slice(6));
  }
  const value = caps[page.need];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export const allowedPages = caps => PAGES.filter(p => isAllowed(p, caps));

/**
 * Where a role lands after signing in: the page it asked for if it may open it,
 * else its own home, else the first page it may open — never a refusal.
 */
export function landingFor(personaKey, requested = "") {
  const session = sessionFor(personaKey);
  if (!session) return "index.html";
  const mine = allowedPages(session.capabilities());
  const persona = PERSONAS.find(p => p.key === personaKey) || {};
  const pick = file => mine.find(p => p.file === file);
  return (pick(requested) || pick(persona.home) || mine[0]
    || { file: "student-events.html" }).file;
}

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

/**
 * A proposal's route as a row of gates: done, the one holding it now, and the
 * ones still to come — then "Published" once the last gate clears. This is the
 * picture a club needs to answer "where is our request?".
 */
export function routeTracker(route) {
  if (!route) return "";
  const icon = { done: "✓", now: "•", returned: "↩", rejected: "✕" };
  const published = route.state === "approved";
  return `<ol class="route" aria-label="Approval route">${route.stages.map((s, i) => `
    <li class="route-step ${s.status}" data-stage="${esc(s.stage)}"
      title="${esc(s.label)}${s.decidedBy ? ` — ${esc(s.decidedBy)}` : ""}">
      <span class="dot" aria-hidden="true">${icon[s.status] || i + 1}</span>
      <span class="route-label">${esc(s.short)}<span class="sr-only"> — ${
        esc(s.status === "now" ? "with them now" : s.status)}</span></span></li>`).join("")}
    <li class="route-step end ${published ? "done" : "upcoming"}">
      <span class="dot" aria-hidden="true">${published ? "✓" : "★"}</span>
      <span class="route-label">Published</span></li></ol>`;
}

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
  target.innerHTML = `<div class="err" role="alert">
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
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = text;
  host.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

// --- dialogs --------------------------------------------------------------
let settleOpenDialog = null;

/**
 * A small form in the page's <dialog>, resolving to the entered values, or null
 * if dismissed. Replaces window.prompt/confirm, which cannot validate, cannot
 * explain, and read as a demo rather than an application.
 *
 * `validate(values)` may return a message; the dialog then stays open and shows it.
 */
export function dialogForm({ title, intro = "", fields = [], submitLabel = "OK",
                             cancelLabel = "Cancel", tone = "primary", validate = null,
                             testId = "" }) {
  const dialog = document.getElementById("dlg");
  const body = document.getElementById("dlgBody");
  if (settleOpenDialog) settleOpenDialog(null);

  const field = f => {
    const id = `dlg-${f.name}`;
    const common = `id="${id}" name="${esc(f.name)}" ${f.required ? "required" : ""}
      ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}`;
    let control;
    if (f.type === "textarea") {
      control = `<textarea ${common} rows="${f.rows || 3}">${esc(f.value ?? "")}</textarea>`;
    } else if (f.type === "select") {
      control = `<select ${common}>${(f.options || []).map(o =>
        `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? "")
          ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    } else {
      control = `<input ${common} type="${f.type || "text"}" value="${esc(f.value ?? "")}"
        ${f.min != null ? `min="${f.min}"` : ""}>`;
    }
    return `<div class="dlg-field"><label for="${id}">${esc(f.label)}</label>${control}
      ${f.hint ? `<p class="small muted" style="margin-top:4px">${esc(f.hint)}</p>` : ""}
      </div>`;
  };

  // novalidate: the form's own validate() explains a problem in words; the
  // browser's bubble would block submit before that message could show.
  body.innerHTML = `<form method="dialog" class="stack" id="dlgForm" novalidate
      ${testId ? `data-dialog="${esc(testId)}"` : ""}>
    <h2>${esc(title)}</h2>
    ${intro ? `<p class="muted small">${intro}</p>` : ""}
    ${fields.map(field).join("")}
    <div id="dlgMsg"></div>
    <div class="row" style="justify-content:flex-end">
      <button type="button" class="btn" data-dlg-cancel>${esc(cancelLabel)}</button>
      <button type="submit" class="btn ${tone}" data-dlg-ok>${esc(submitLabel)}</button>
    </div></form>`;

  return new Promise(resolve => {
    const form = document.getElementById("dlgForm");
    const finish = value => {
      settleOpenDialog = null;
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onClose = () => finish(null);
    settleOpenDialog = finish;
    dialog.addEventListener("close", onClose);
    form.querySelector("[data-dlg-cancel]").addEventListener("click", () => finish(null));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const values = Object.fromEntries(fields.map(f =>
        [f.name, form.elements[f.name].value]));
      const problem = validate ? validate(values) : null;
      if (problem) {
        document.getElementById("dlgMsg").innerHTML =
          `<p class="note bad small" role="alert">${esc(problem)}</p>`;
        return;
      }
      finish(values);
    });
    dialog.showModal();
    const first = form.querySelector("input,textarea,select");
    if (first) first.focus();
  });
}

/** A yes/no question in the page's dialog. Resolves true or false. */
export async function confirmDialog({ title, message, confirmLabel = "Confirm",
                                      tone = "primary" }) {
  const result = await dialogForm({ title, intro: esc(message), submitLabel: confirmLabel,
    tone, testId: "confirm" });
  return result !== null;
}

// --- chrome ---------------------------------------------------------------
function banner() {
  return `
    <div class="pilot-banner" role="note">
      <span><b>${esc(APP.channel)}</b> <span id="buildLabel">v${esc(APP.version)}</span>
        · your data stays in this browser</span>
      <span class="pilot-actions">
        <button class="linkish" data-feedback>Give feedback</button> ·
        <a href="index.html">Switch role</a> ·
        <button class="linkish" id="reseed">Reset data</button></span></div>`;
}

/** "Treasurer, Swara" already says Treasurer; "Organiser · President, Lens" needs both. */
function roleLine(persona) {
  if (!persona) return "";
  return persona.blurb.toLowerCase().includes(persona.label.toLowerCase())
    ? persona.blurb : `${persona.label} · ${persona.blurb}`;
}

function header(session) {
  const persona = PERSONAS.find(p => p.key === session.personaKey);
  return `${banner()}
    <header class="top"><div class="top-inner">
      <a class="brand" href="${landingFor(session.personaKey)}">
        <span class="brand-mark" aria-hidden="true"></span>Culturals</a>
      <span class="whoami">
        <strong>${esc(session.displayName)}</strong>
        <span>${esc(roleLine(persona))}</span>
      </span>
      <button class="btn feedback-btn" data-feedback aria-label="Give feedback">💬
        <span>Feedback</span></button>
      <button class="bell" id="bell" aria-label="Notifications">🔔<b id="bellCount"
        hidden>0</b></button>
    </div></header>
    <div class="stale" id="stale" hidden role="status">
      <span>Something changed in another tab.</span>
      <button class="btn small" id="staleRefresh">Refresh</button></div>`;
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
    <a class="nav-signout" href="index.html?signout=1" data-signout>Sign out</a>`;
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
    if (settleOpenDialog) settleOpenDialog(null);
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

/** Wire every [data-feedback] control on the page to the feedback form. */
export function wireFeedback(context) {
  document.addEventListener("click", async event => {
    if (!event.target.closest("[data-feedback]")) return;
    event.preventDefault();
    const { openFeedback } = await import("./feedback.js");
    openFeedback(context());
  });
}

/**
 * Another tab saved the data. Re-rendering under somebody's half-typed comment
 * would throw it away, and a tab nobody is looking at can simply catch up when it
 * is next shown — so: refresh on return if nothing was typed, otherwise ask.
 */
function watchOtherTabs(main) {
  let typed = false;
  let behind = false;
  main.addEventListener("input", () => { typed = true; });
  const offer = () => { document.getElementById("stale").hidden = false; };
  const catchUp = () => {
    if (!behind) return;
    if (typed || document.getElementById("dlg").open) offer();
    else location.reload();
  };
  onExternalChange(() => {
    behind = true;
    if (document.hidden) return;
    offer();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) catchUp();
  });
  document.getElementById("staleRefresh").addEventListener("click",
    () => location.reload());
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
    // Not signed in. The login page is the only route in, and it brings the
    // tester back here afterwards.
    location.replace(`index.html?next=${encodeURIComponent(activeFile)}`);
    return;
  }
  const caps = session.capabilities();
  const pageTitle = (PAGES.find(p => p.file === activeFile) || {}).title || activeFile;

  document.body.insertAdjacentHTML("afterbegin", header(session));
  const nav = document.getElementById("nav");
  if (nav) nav.innerHTML = sidebar(session, caps, activeFile);
  buildInfo().then(info => {
    const label = document.getElementById("buildLabel");
    if (label) label.textContent = buildLabel(info);
  });

  document.getElementById("reseed").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reset the pilot data?",
      message: "Everything you have done in this browser is replaced by the starting "
        + "data — proposals, approvals, registrations and scans. Feedback you wrote "
        + "is kept.",
      confirmLabel: "Reset data", tone: "danger",
    });
    if (!ok) return;
    await reseed();
    location.reload();
  });
  document.addEventListener("click", e => {
    if (e.target.closest("[data-close-dlg]")) document.getElementById("dlg").close();
    if (e.target.closest("[data-signout]")) clearPersona();
  });
  wireFeedback(() => ({ session, page: { file: activeFile, title: pageTitle } }));
  await notifications(session);

  const main = document.querySelector("main");
  watchOtherTabs(main);
  main.innerHTML = `<div class="loading">Loading…</div>`;
  try {
    await render(main, session, caps);
  } catch (err) {
    showError(main, err);
  }
}

export { PERSONAS, savePersona, clearPersona, sessionFor, currentPersonaKey };
