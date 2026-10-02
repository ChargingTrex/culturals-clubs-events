# Culturals

Clubs and events for a college student portal: event proposals, budget requests
through the Cultural Society, the Dean, the Vice-Chancellor and Management, and QR
attendance at the door.

**This is a pilot build.** Everything runs in your browser — no server, no account,
no data leaving the page. Pick a role, walk the workflow, and tell us where it is
wrong for how your college actually works.

- **Try it:** <https://chargingtrex.github.io/culturals-clubs-events/> — sign in as
  any role from the sign-in page; there is no password.
- **Give feedback:** the 💬 **Feedback** button on every page opens a pre-filled
  GitHub issue with your role, page and build already attached.
- **[APPFLOW.md](APPFLOW.md)** — how work moves through the app, who touches it, and
  what it refuses on purpose. Read this before filing feedback.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to give feedback, run it locally, and
  send a change. **[TESTING.md](TESTING.md)** — the two test layers.

---

## What you can do

| As | You can |
|---|---|
| **Student** | Browse events, register, hold a pass and a profile QR |
| **Club member** | See club internals — but never the budget |
| **Secretary** | Raise proposals, run events, work the door |
| **Treasurer** | Build the budget, request it, record spend, settle it |
| **President** | All of the club's work, plus assigning roles |
| **Organiser** | Run the live event and its scan station |
| **Cultural Society** | Gate 1, for cultural and literary clubs — recommends |
| **Dean** | Gate 2 — the mandatory one, where money is sanctioned. Venues, overview |
| **Vice-Chancellor** | Gate 3, for budgets over ₹50,000 and fests. Aggregates only |
| **Management** | Gate 4, for budgets over ₹2,00,000. Aggregates only |

The sidebar shows only the pages your role can open. **Hiding a page is not the
permission**, though — the rules refuse the action regardless, so if a page turns you
away that is the rule talking and not a missing button.

The sign-in page also has a **guided walk through the whole workflow**: eight steps,
switching role at each, with progress taken from what you actually did.

---

## The workflow in one picture

```
 propose ─► price it (or declare it needs nothing) ─► Cultural Society ─► Dean
                                                                           │
                                       over ₹50,000 or a fest ─► Vice-Chancellor
                                                                           │
                                             over ₹2,00,000 ─► Management  │
                                                                           ▼
                                                                       PUBLISHED
                                                                           │
                             register ─► pass ─► scan at the door ─► attended
                                                                           │
                                              close with photos ─► settle spend
                                                                           │
                                                                    semester report
```

Four things this is opinionated about:

- **A bigger budget travels further, never around.** The Dean sanctions every budget;
  the Vice-Chancellor is added above ₹50,000 and Management above ₹2,00,000. A later
  gate may cut the figures it was sent, never restore what an earlier gate cut.
- **A zero-budget event says so explicitly**, with a reason and an author. An empty
  budget and a genuinely free event look identical to an approver, and they call for
  opposite responses.
- **Every scan is recorded, including every failure.** The failures *are* the capture
  rate — without them a station rejecting half its queue looks like a quiet event,
  and every figure in the report derives from attendance.
- **The report leads with unique students, not total attendance.** Twenty events
  attended by the same eighty students and twenty reaching six hundred both report
  1,600 attendances. Only the unique count tells them apart.

---

## Running it

No build step. Node 18+ for the rule tests; Python 3 for the browser tests.

```bash
python3 -m http.server 4173      # or any static server
```

Open <http://127.0.0.1:4173/>. It must be served over HTTP — ES modules do not run
from a `file://` path.

```bash
npm run check    # Node: smoke test + 105 end-to-end rule tests, ~4 seconds
npm run robot    # Robot Framework: 85 smoke and end-to-end tests in Chromium, ~1 minute
```

[TESTING.md](TESTING.md) has the setup for the Robot Framework suites.

---

## Deploying

Every push runs both test layers in GitHub Actions (`.github/workflows/ci.yml`). A
push to `main` that passes both is published to **GitHub Pages**, together with the
Robot Framework report it passed (linked from the sign-in page) and a `build.json`
naming the commit — so feedback always says which build it is about.

The site is static, so it also works on Netlify (`netlify.toml` is included; publish
directory `.`, no build command), Cloudflare Pages or any CDN.

---

## Honest limits

This build is for feeling out the workflow, not for running a college.

- **The rules run in the browser**, so they shape the workflow faithfully but defend
  nothing. A production backend (Django + DRF) runs the identical rules server-side,
  where a tampered client is refused anyway. `src/api.js` is shaped like its REST
  endpoints so that switching is a change to one module.
- **Data lives in one browser.** Two tabs share it (each can hold a different role),
  but two people on two machines each have their own copy.
- **The QR signing key ships to the browser.** The signature keeps the data
  *structure* honest — purposes, event binding, single use — and protects nothing.
- **Staff sessions skip the second factor**, because a pilot cannot read an
  authenticator app.
- **Receipts stay on your device.** Only the file name is recorded.
- **Not yet built:** waitlists, feedback surveys, the annual handover of office
  bearers, fest sub-events, external participants.

---

## Feedback

Use the **Feedback** button in the app, or open an issue with the *Pilot feedback*
form. **"This rule is wrong for how we actually work"** is the most useful kind. Say
which role you were signed in as, what you were trying to do, and what happened.
[CONTRIBUTING.md](CONTRIBUTING.md) has the detail.

MIT licensed. Vendored libraries: [qrcode](https://github.com/soldair/node-qrcode)
(MIT) and [html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0), with
their licences in `assets/vendor/`.
