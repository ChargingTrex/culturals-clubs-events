/**
 * Feedback from inside the app.
 *
 * A tester who has to remember which role they were, which page they were on and
 * which build they were using, then find the repository and write it all up,
 * mostly does not bother. So the form asks only for the two things only a person
 * can say — what they were trying to do, and what happened — and attaches the rest.
 *
 * Nothing is sent from here. The form opens a pre-filled GitHub issue (or an email,
 * when one is configured) for the tester to submit themselves, and keeps a copy in
 * this browser so nothing is lost if they close the tab first.
 */
import { APP, FEEDBACK, buildInfo, buildLabel } from "./config.js";
import { PERSONAS } from "./session.js";
import { esc, toast } from "./ui.js";

const STORE = "culturals.feedback";

/** The kinds CONTRIBUTING.md asks for, in the words a tester would use. */
export const KINDS = [
  { key: "rule-wrong", label: "A rule is wrong for how we work" },
  { key: "rule-missing", label: "It let me do something it should not" },
  { key: "confusing", label: "Confusing — the screen did not explain it" },
  { key: "bug", label: "Bug — something broke or contradicted itself" },
  { key: "missing", label: "A step in our real process is missing" },
  { key: "idea", label: "Idea or praise" },
];

export function savedFeedback() {
  try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; }
}

function keep(entry) {
  try {
    const all = savedFeedback();
    all.unshift(entry);
    localStorage.setItem(STORE, JSON.stringify(all.slice(0, 100)));
  } catch {}
}

function browserLabel() {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "";
  return `${name}${os ? ` on ${os}` : ""}, ${window.innerWidth}×${window.innerHeight}`;
}

/** The caller's last few recorded actions, so a report arrives with its steps. */
async function recentActivity(session) {
  if (!session) return [];
  try {
    const { db } = await import("./db.js");
    return db().audit.filter(a => a.actorSub === session.sub).slice(0, 5)
      .map(a => `${a.at.slice(11, 16)} ${a.action}${a.reason ? ` — ${a.reason}` : ""}`);
  } catch {
    return [];
  }
}

function contextText({ session, page, build, activity }) {
  const persona = session ? PERSONAS.find(p => p.key === session.personaKey) : null;
  return [
    `Role: ${persona ? `${persona.label} (${session.displayName}, ${persona.blurb})`
      : "not signed in"}`,
    `Page: ${page ? `${page.title} (${page.file})` : "sign-in"}`,
    `Build: ${buildLabel(build)}${build && build.builtAt ? `, built ${build.builtAt}` : ""}`,
    `Browser: ${browserLabel()}`,
    `When: ${new Date().toISOString()}`,
    ...(activity.length ? ["Recent actions:", ...activity.map(a => `- ${a}`)] : []),
  ].join("\n");
}

function issueUrl(entry) {
  const kind = KINDS.find(k => k.key === entry.kind);
  const params = new URLSearchParams({
    template: FEEDBACK.issueTemplate,
    title: `[${kind ? kind.label.split(" — ")[0] : "Feedback"}] ${entry.summary}`
      .slice(0, 120),
    kind: kind ? kind.label : "",
    role: entry.role,
    page: entry.page,
    tried: entry.tried,
    happened: entry.happened,
    context: entry.context,
  });
  return `https://github.com/${FEEDBACK.repo}/issues/new?${params}`;
}

const asText = entry => [
  `Feedback — ${APP.name} ${APP.channel.toLowerCase()}`,
  `Kind: ${(KINDS.find(k => k.key === entry.kind) || {}).label || entry.kind}`,
  `${entry.name ? `From: ${entry.name}\n` : ""}`,
  "What I was trying to do:", entry.tried, "",
  "What happened, and what I expected:", entry.happened, "",
  entry.context,
].join("\n");

function download(filename, text) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
}

/**
 * Open the feedback form. `context` is `{ session, page }`; both may be absent on
 * the sign-in page.
 */
export async function openFeedback({ session = null, page = null } = {}) {
  const dialog = document.getElementById("dlg");
  const body = document.getElementById("dlgBody");
  const [build, activity] = await Promise.all([buildInfo(), recentActivity(session)]);
  const context = contextText({ session, page, build, activity });
  const persona = session ? PERSONAS.find(p => p.key === session.personaKey) : null;
  const earlier = savedFeedback();

  body.innerHTML = `<form class="stack feedback" id="fbForm" data-dialog="feedback"
    novalidate>
    <h2>Tell us what you think</h2>
    <p class="small muted">The most useful feedback says what you were trying to do
      and what happened. <strong>“This rule is wrong for how we actually work”</strong>
      is exactly the kind we want.</p>
    <fieldset class="chips"><legend>What kind of feedback?</legend>
      ${KINDS.map((k, i) => `<label class="chip"><input type="radio" name="kind"
        value="${k.key}" ${i === 0 ? "checked" : ""}><span>${esc(k.label)}</span></label>`)
        .join("")}</fieldset>
    <div><label for="fbTried">What were you trying to do?</label>
      <textarea id="fbTried" rows="2" required
        placeholder="e.g. Approve a budget as the Dean but cut the sound budget"></textarea></div>
    <div><label for="fbHappened">What happened, and what did you expect?</label>
      <textarea id="fbHappened" rows="3" required
        placeholder="e.g. It said the venue clashes, but I could not see which event"></textarea></div>
    <div><label for="fbName">Your name or email <span class="muted">(optional)</span></label>
      <input id="fbName" autocomplete="name"></div>
    <details class="small"><summary>Attached automatically</summary>
      <pre class="tokenbox" id="fbContext">${esc(context)}</pre></details>
    <div id="fbMsg"></div>
    <div class="row" style="justify-content:flex-end">
      <button type="button" class="btn" data-fb="cancel">Cancel</button>
      <button type="button" class="btn" data-fb="copy">Copy text</button>
      ${FEEDBACK.email ? `<button type="button" class="btn" data-fb="email">Send by
        email</button>` : ""}
      <button type="submit" class="btn primary" data-fb="github">Open as GitHub
        issue</button></div>
    <p class="small muted">GitHub opens in a new tab with everything filled in — press
      <em>Create</em> there to send it. No GitHub account? Use
      ${FEEDBACK.email ? "email, or " : ""}copy the text to whoever is running your
      session. A copy is kept in this browser either way${earlier.length
        ? ` (${earlier.length} so far — <button type="button" class="linkish"
          data-fb="download">download all</button>)` : ""}.</p>
  </form>`;
  dialog.showModal();
  document.getElementById("fbTried").focus();

  const form = document.getElementById("fbForm");
  const collect = () => {
    const tried = document.getElementById("fbTried").value.trim();
    const happened = document.getElementById("fbHappened").value.trim();
    if (!tried || !happened) {
      document.getElementById("fbMsg").innerHTML = `<p class="note bad small"
        role="alert">Say what you were trying to do and what happened — those two are
        the whole point.</p>`;
      return null;
    }
    const name = document.getElementById("fbName").value.trim();
    return {
      at: new Date().toISOString(),
      kind: form.elements.kind.value,
      summary: tried.split(/\n|\. /)[0].slice(0, 80),
      tried, happened, name,
      role: persona ? persona.label : "Not signed in",
      page: page ? page.title : "Sign-in page",
      context: name ? `${context}\nFrom: ${name}` : context,
    };
  };

  const done = (entry, message) => {
    keep(entry);
    dialog.close();
    toast(message);
  };

  form.addEventListener("submit", event => {
    event.preventDefault();
    const entry = collect();
    if (!entry) return;
    window.open(issueUrl(entry), "_blank", "noopener");
    done(entry, "Opened GitHub — press Create there to send it. Thank you!");
  });
  form.addEventListener("click", async event => {
    const action = event.target.closest("[data-fb]");
    if (!action || action.dataset.fb === "github") return;
    if (action.dataset.fb === "cancel") {
      dialog.close();
      return;
    }
    if (action.dataset.fb === "download") {
      download(`culturals-feedback-${new Date().toISOString().slice(0, 10)}.md`,
        savedFeedback().map(asText).join("\n\n---\n\n"));
      return;
    }
    const entry = collect();
    if (!entry) return;
    if (action.dataset.fb === "email") {
      const kind = KINDS.find(k => k.key === entry.kind);
      location.href = `mailto:${FEEDBACK.email}?subject=${encodeURIComponent(
        `[${APP.name} feedback] ${kind ? kind.label : ""}: ${entry.summary}`)}&body=${
        encodeURIComponent(asText(entry))}`;
      done(entry, "Your email app should open with the feedback filled in.");
    } else {
      try {
        await navigator.clipboard.writeText(asText(entry));
        done(entry, "Copied — paste it wherever your session collects feedback.");
      } catch {
        download("culturals-feedback.md", asText(entry));
        done(entry, "Could not copy, so it was downloaded as a file instead.");
      }
    }
  });
}

/** Exposed for tests: the URL a given entry would open. */
export const feedbackIssueUrl = issueUrl;
