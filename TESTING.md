# Testing

Two layers, and each catches what the other cannot.

| Layer | What it proves | Runs in | Count | Time |
|---|---|---|---|---|
| **Node** (`tests/*.mjs`) | The rules: who may do what, what each refusal says, the figures the report leads with | Node, no DOM | smoke + 105 e2e | ~4 s |
| **Robot Framework** (`tests/robot/`) | The pages let people follow those rules: every role signs in, every page renders, the workflow can be walked by clicking | Chromium | 59 smoke + 26 e2e | ~1 min |

The Node suites call the same `api.*` functions the pages call, so a passing test says
something about the app. But they cannot see a page that renders an error box, a
button wired to nothing, or state lost between two page loads — the Robot suites
exist for exactly those. (Two of the bugs fixed in this pilot were of that kind: ids
reused across page loads, and scan-station buttons that went dead after one click.)

---

## Node

```bash
npm run check    # smoke, then e2e
npm run smoke    # wiring: imports, pages, per-role sidebar offers, the seed
npm test         # e2e: budgets, the four gates, attendance, roles, reporting
```

No install. The harness is `tests/harness.mjs`; a restriction needs a wrong-role test
that asserts the refusal **code**, not just that it threw — see CONTRIBUTING.md.

---

## Robot Framework

```bash
pip install -r tests/robot/requirements.txt    # Robot Framework + Browser library
rfbrowser init chromium                        # Playwright's Chromium, once

npm run robot              # everything
npm run robot:smoke        # smoke suites only
npm run robot:e2e          # end-to-end suites only
tests/robot/run.sh --include attendance        # any robot option passes through
```

`run.sh` serves the repository on port 4173 if nothing is serving it already, runs
the suites, and writes `results/robot/report.html` and `log.html` (screenshots of any
failure included). Already have a Chromium? `CHROMIUM=/path/to/chrome npm run robot`
skips the download.

| Suite | Tags | What it walks |
|---|---|---|
| `01__smoke_signin` | smoke | Ten role buttons in two groups; every role lands on its own work; deep links survive sign-in; sign-out forgets the role; QR codes draw without a CDN; reset; the 404 page |
| `02__smoke_pages` | smoke | Every page renders for a role that may open it, with no error box |
| `03__smoke_roles` | smoke | Each role's sidebar offers exactly its own pages |
| `04__smoke_refusals` | smoke | Opened directly, pages refuse the wrong role — the rule answers, with its code |
| `05__smoke_phone` | smoke, phone | At phone size, no page scrolls sideways — most pilot testers will use a phone |
| `10__e2e_budget_approvals` | e2e, budget, approvals | Draft → price → send; a ₹2 lakh+ budget through Society, Dean, VC and Management to published; returns, rejections, sanction cuts, venue clashes, nil budgets, settlement with receipts |
| `20__e2e_qr_attendance` | e2e, attendance, qr | Register → pass → scan once, then duplicate; forged codes counted; walk-ins; wrong event; reissued profile QR; PRN lookup; who may work a door |
| `30__e2e_full_journey` | e2e, journey | The whole workflow in one test: request → four gates → register → check in → close → settle → semester report → journey complete |
| `40__e2e_feedback_and_tabs` | e2e, feedback | Feedback opens a pre-filled GitHub issue; two tabs hold two roles and stay in step |

Every test starts from a fresh browser context — empty storage — so the app seeds the
same starting world each time and tests never depend on each other.

### Writing one

Use the keywords in `tests/robot/resources/culturals.resource` (`Sign In As`,
`Create Event`, `Approve At Gate`, `Scan At Door`, …) and find elements by the data
hooks the pages expose (`data-event-title`, `data-stage`, `data-result`,
`data-dialog`), never by layout or wording that a copy edit would break. If a page
lacks a hook a test needs, add one.

---

## In CI

`.github/workflows/ci.yml` runs both layers on every push. On `main`, the deploy job
runs only after both pass, and publishes the Robot report next to the app at
`/test-report/report.html` — linked from the sign-in page — so anyone can see what the
build they are testing passed. Each run also keeps the report as an artifact for 30
days.
