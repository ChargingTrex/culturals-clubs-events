# Culturals

Clubs and events for a college student portal: event proposals, budget requests
through three approval gates, and QR attendance at the door.

**This is a walkthrough build.** Everything runs in your browser — no server, no
account, no data leaving the page. Pick a role, use the app, and tell us where the
workflow is wrong.

- **Try it:** sign in as any role from the landing page; there is no password.
- **[APPFLOW.md](APPFLOW.md)** — how work moves through the app, who touches it, and
  what it refuses on purpose. Read this before filing feedback.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to give feedback, run it locally, and
  send a change.

---

## What you can do

| As | You can |
|---|---|
| **Student** | Browse events, register, hold a pass and a profile QR |
| **Club member** | See club internals — but never the budget |
| **Secretary** | Raise proposals, run events, work the door |
| **Treasurer** | Build the budget, record spend, settle it |
| **President** | All of the club's work, plus assigning roles |
| **Organiser** | Run the live event and its scan station |
| **Cultural Society** | Approval gate 1, for cultural and literary clubs |
| **Dean** | Gate 2 — the mandatory one. Venues, and the semester overview |
| **Management** | Gate 3 for large budgets. Aggregate reporting only |

The sidebar shows only the pages your role can open. **Hiding a page is not the
permission**, though — the rules refuse the action regardless, so if a page turns you
away that is the rule talking and not a missing button.

---

## The workflow in one picture

```
 propose ─► price it (or declare it needs nothing) ─► Cultural Society ─► Dean
                                                                           │
                                            over ₹50,000 or a fest ────────┤
                                                      │                    │
                                                 Management                │
                                                      └────────┬───────────┘
                                                               ▼
                                                           PUBLISHED
                                                               │
                             register ─► pass ─► scan at the door ─► attended
                                                               │
                                              close with photos ─► settle spend
                                                               │
                                                        semester report
```

Three things this is opinionated about:

- **A zero-budget event says so explicitly**, with a reason and an author. An empty
  budget and a genuinely free event look identical to an approver, and they call for
  opposite responses.
- **Every scan is recorded, including every failure.** The failures *are* the capture
  rate — without them a station rejecting half its queue looks like a quiet event, and
  every figure in the report derives from attendance.
- **The report leads with unique students, not total attendance.** Twenty events
  attended by the same eighty students and twenty reaching six hundred both report
  1,600 attendances. Only the unique count tells them apart.

---

## Running it

No build step. Node 18+ only for the tests.

```bash
python3 -m http.server 4173      # or any static server
```

Open <http://127.0.0.1:4173/>. It must be served over HTTP — ES modules do not run
from a `file://` path.

```bash
npm run check    # smoke test + 89 end-to-end tests, about 2 seconds
```

---

## Deploying

A static publish with no build. Works on Netlify, GitHub Pages, Cloudflare Pages or
any CDN.

- **Netlify** — `netlify.toml` is included; publish directory `.`, no build command.
- **GitHub Pages** — serve the repository root; `.nojekyll` is included so the
  `src/` directory is not swallowed.

---

## Honest limits

This build is for feeling out the workflow, not for running a college.

- **The rules run in the browser**, so they shape the workflow faithfully but defend
  nothing. A production backend (Django + DRF) runs the identical rules server-side,
  where a tampered client is refused anyway. `src/api.js` is shaped like its REST
  endpoints so that switching is a change to one module.
- **The QR signing key ships to the browser.** The signature keeps the data
  *structure* honest — purposes, event binding, single use — and protects nothing.
- **Staff sessions skip the second factor**, because a walkthrough cannot read an
  authenticator app.
- **Not yet built:** waitlists, feedback surveys, the annual handover of office
  bearers, fest sub-events, external participants.

---

## Feedback

Issues welcome, and **"this rule is wrong for how we actually work"** is the most
useful kind. Say which role you were signed in as, what you were trying to do, and
what happened. [CONTRIBUTING.md](CONTRIBUTING.md) has the detail.

MIT licensed.
