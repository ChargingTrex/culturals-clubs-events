# Contributing

This build exists to collect feedback on a workflow, so **a clear description of
something that felt wrong is worth more than a patch**. You do not need to write code
to help.

---

## Giving feedback

The quickest way is the 💬 **Feedback** button on every page of the app. It asks for
the two things only you can say — what you were trying to do, and what happened —
and attaches your role, the page, the build and your last few actions, then opens a
pre-filled GitHub issue for you to submit. A copy stays in your browser, and *Copy
text* or *download all* work for testers without a GitHub account.

Or open an issue with the **Pilot feedback** form. The most useful ones say:

1. **Which role you were signed in as** — the app behaves differently for each, and
   that is usually the crux.
2. **What you were trying to do**, in the words you would use to a colleague.
3. **What happened**, including the exact message if the app refused you.

### Before filing "it refused me"

A lot of refusals are deliberate, and [APPFLOW.md](APPFLOW.md) lists them. The ones
people hit most:

| You saw | It is intentional because |
|---|---|
| A member cannot see the budget | Budget visibility begins at Treasurer |
| The Treasurer cannot close an event | Preparing a budget and running the night are different jobs |
| A proposal is not in the Dean's queue | It is still with the Cultural Society |
| The VC cannot restore the Dean's cut | A later gate may only reduce further |
| Cannot approve — venue clash | The Dean moves one event first |
| Management or the VC cannot open a roster | That tier gets aggregates, never individuals |
| Cannot settle yet | Sanction → event runs → settle, in that order |

**That does not make them right.** If a rule is wrong for how your college actually
works, say so — that is exactly the feedback worth having, and it is more valuable
than a bug report. Say what your process does instead.

### Labels that help us triage

- `rule-wrong` — the app enforces something your institution does differently
- `rule-missing` — something it lets you do that it should not
- `confusing` — the rule is right but the screen does not explain it
- `bug` — it did something inconsistent with its own rules
- `missing` — a step in your real process the app has no place for

---

## Running it locally

No build step, no dependencies to install. Node 18+ only for the tests.

```bash
git clone https://github.com/ChargingTrex/culturals-clubs-events
cd culturals-clubs-events
python3 -m http.server 4173      # or: npx serve, or any static server
```

Then open <http://127.0.0.1:4173/>.

**It must be served over HTTP, not opened as a `file://` path** — ES modules are
blocked on the file protocol.

```bash
npm run check    # smoke test, then the e2e suite
npm test         # e2e only
npm run smoke    # wiring only
```

These take a few seconds and need no install.

The **Robot Framework** suites drive the real pages in Chromium, the way a tester
would — sign in from the role buttons, approve at each gate, scan a pass at the door.
They catch what the Node suites cannot see: a page that renders an error box, a
button that does nothing, state lost between page loads.

```bash
pip install -r tests/robot/requirements.txt
rfbrowser init chromium
npm run robot            # all 85; starts a static server if none is running
npm run robot:smoke      # just the smoke suites
```

All of these run in CI on every push, and all must pass before a change is merged.
[TESTING.md](TESTING.md) has the detail.

---

## How the code is laid out

```
index.html              the sign-in page: one button per role, the guided journey
404.html                not-found page for GitHub Pages
<role>-<thing>.html      one page per view, no router, no framework
src/
  db.js                 the single state document, localStorage or memory
  seed.js               the pilot dataset
  bootstrap.js          drives the seed through the REAL engines
  roles.js              the role vocabulary and every capability set
  session.js            who the caller is, and what they may do
  api.js                the API surface — the only module pages talk to
  approvals.js          the gate chain and its thresholds
  budget.js             budget lifecycle and settlement rules
  attendance.js         registration, passes, the seven-branch resolver
  reporting.js          semester report and the Dean's overview
  tokens.js             HMAC-signed QR tokens
  errors.js             RFC 9457 problem details
  ui.js                 page chrome, the role-scoped sidebar, dialogs, helpers
  approval-queue.js     one approval queue, rendered for any of the four gates
  feedback.js           the in-app feedback form
  config.js             version, and where feedback goes
  qrcode.js             loads the vendored QR drawing and camera libraries
assets/vendor/          qrcode (MIT) and html5-qrcode (Apache-2.0), with licences
tests/
  harness.mjs           a dependency-free test harness
  e2e.*.mjs             the workflow suites
  smoke.mjs             wiring: imports, pages, per-role page offers
  robot/                Robot Framework: smoke and end-to-end in a browser
```

### Three conventions that matter

**Pages talk only to `api.js`.** They never import `db.js` to mutate state or reach
into an engine. If a page needs something the API does not expose, add it to the API.
That boundary is what keeps the tests meaningful: they drive the same functions the
pages do, so a passing test says something about the app and not about a parallel code
path.

**Permission rules live in one place per question.** `roles.js` holds the capability
sets, `session.js` answers questions about the caller, and `api.js` enforces. The
sidebar in `ui.js` only decides what to *offer* — it reads the same capability payload
the enforcement reads, so a menu and a rule cannot drift apart. That drift is a real
bug we already shipped once: the sidebar offered the scan station to Treasurers,
derived from "holds any club role", while the API correctly refused them.

**Hiding a page is not a permission.** Every refusal is enforced in `api.js`
regardless of what the sidebar shows. If you add a page, add its capability check to
the API too, and a `refuses(...)` test proving the wrong role is turned away.

---

## Writing a change

### Tests

Every rule change needs a test, and a rule *restriction* needs a wrong-role test —
one that calls it as somebody who should be refused and asserts the **code**, not just
that it threw:

```js
await refuses(() => api.budget.addLine(as.member, id, { head: "x", amountRequested: 1 }),
  { code: "NOT_FOUND", status: 404 });
```

Asserting only that it threw would pass on an unrelated bug, and the code is the part
a client branches on.

### Error codes

Refusals use RFC 9457 problem details, matching the production backend:

```js
throw conflict("BUDGET_LOCKED", "Budget is locked", "This budget is …");
```

`code` is `SCREAMING_SNAKE`, prefixed by its area. Clients branch on `code`, never on
the message text, so the message can be rewritten freely but the code is a contract.

Pick the status deliberately: `403` when the caller may not do it, **`404` when
knowing the thing exists is itself the disclosure** — another club's budget, another
student's record. A `403` there confirms the resource exists, which is sometimes all
an attacker needs.

### Comments

Comment the **why**, not the what. The reason a rule exists is the thing a reader
cannot recover from the code, and this codebase has a lot of rules that look arbitrary
until you know what they prevent. Compare:

```js
// Sort by scannedAt.                                      ← says nothing
// Sorted by the DEVICE's timestamp so the earliest scan wins: replaying in
// arrival order would award the check-in to whichever packet reached the
// server first, which is not who reached the door first.   ← says why
```

### Style

Two-space indent, double quotes, semicolons, ~90 columns. No build step and no
dependencies in `src/` — the app must keep running from a plain static server. The two
libraries for QR drawing and camera scanning are **vendored** in `assets/vendor/` and
**optional by design**: if they fail to load the pages fall back to showing the token
as text. They used to come from a CDN, which failed silently — the pinned version
shipped no browser build — and college networks block CDNs often enough that the door
must not depend on one.

Give anything a test needs to find a stable hook (`data-event-title`, `data-stage`,
`data-dialog`, …) rather than letting the Robot suites lean on wording or layout.

---

## Relationship to the production backend

This is the **pilot build**. There is a Django + DRF backend that runs the same
rules server-side, with real signing keys, real sessions and database constraints.
`api.js` is deliberately shaped like its REST endpoints so that pointing this frontend
at the real server is a change to one module.

If you change a **rule** here, say so in the pull request. The two must agree, and we
have already had them disagree in ways that only a careful reading caught.

---

## Scope

Good additions: anything in [APPFLOW.md §8](APPFLOW.md) under "not yet built" —
waitlists, feedback surveys, the annual handover of office bearers, fest sub-events,
external participants.

Please discuss first: new roles, changes to the approval chain, anything that moves a
permission boundary. Those decisions came from a stack of specification documents and
a few of them are load-bearing in ways the code cannot show you.

Not wanted: a framework, a build step, or a dependency in `src/`.
