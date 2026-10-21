# Demo pages — one page per view

Fifteen standalone pages, each rendering one view of the platform against the real
API. Served at `/demo/` by Django itself, so they are same-origin and need no CORS.

## Running

```bash
# .env must contain DEMO_MODE=1
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 8001
```

Open <http://127.0.0.1:8001/demo/index.html> — or just `/`, which redirects there.

## Login is disabled — but auth is not

The persona dropdown calls `POST /api/v1/module/auth/demo/<persona>`, which mints a
**real** token with no password. Same claims, same expiry, same signature.

This matters: **every permission check still runs.** When the Vice-Chancellor opens
`club-roster.html` and gets "not available to this role", that is a genuine `404` from
the API, printed with its `code` and status. Stubbing auth out would have produced a
demo that proves nothing about the access control, which is the part worth showing.

Switch persona on any page and the same page changes what it shows — or refuses.

## Role-scoped navigation

The sidebar on every page, and the index, list **only the pages this persona can
open**. A President never sees the Dean's queue; a plain member never sees Budget.
Switch persona and the sidebar changes with it.

| Persona | Pages offered |
|---|---|
| Student | 3 — What's on, My passes, Profile QR |
| Club member | 5 — the student three, plus Club events and Members & roles |
| Treasurer | 7 — adds New event and Budget. **No scan station** |
| President / Organiser | 8 — adds the scan station |
| Cultural Society | 3 — Society approvals, This semester, Semester report |
| Dean | 4 — Dean approvals, Venues, This semester, Semester report |
| Management | 2 — Above-threshold, Semester report |

**Hiding a page is not a permission.** The nav decides what to *offer*; the API decides
what is *allowed*, and typing a hidden page's address still reaches a real `403` or
`404`. The two are deliberately computed from the same server-supplied capability
payload (`GET /module/auth/me`) so they cannot drift:

```
clubs_door_staff          who may work a check-in desk  (excludes member AND treasurer)
clubs_can_propose         who may raise a proposal      (includes treasurer)
clubs_can_operate_events  who may go live / close        (excludes treasurer)
clubs_can_enter_spend     who may record spend
clubs_with_budget_access  who may see money at all
can_see_individual_records  names and PRNs               (excludes the VC)
can_see_overview          the Dean's operational dashboard
approval_stages           which gates this caller holds
```

Deriving door access client-side from "holds any club role" was wrong and briefly
shipped that way: it offered the scan station to plain members and Treasurers, both of
whom the API refuses. `clubs_door_staff` exists so the client cannot guess.

## Three guards on `DEMO_MODE`

1. Off unless `DEMO_MODE` is explicitly truthy.
2. **Refuses to start** if `DEBUG=False` — `ImproperlyConfigured`, not a warning.
3. Both demo endpoints and all `/demo/` pages **404 when it is off**, so they are not
   discoverable on a normal deployment.

A demo switch left on is a public account, so it is made hard to leave on by accident.

## The pages

| Page | Role | Shows |
|---|---|---|
| `index.html` | any | Every page, greying out the ones this persona genuinely cannot open |
| `student-events.html` | Student | Published events, register and cancel |
| `student-passes.html` | Student | Event passes with their QR images |
| `student-profile.html` | Student | Persistent profile QR, and reissuing it |
| `club-events.html` | Club | The club's events; go-live and close for `EVENT_OPERATORS` |
| `club-new-event.html` | Club | Proposal form with server-computed budget preview |
| `club-roster.html` | Club | Roster; role controls only for President and VP |
| `club-budget.html` | Club | **Add / edit / remove entries, declare nil**, spend, settlement blockers |
| `organiser-scan.html` | Organiser | Scan station, PRN lookup, capture rate, forged-code button |
| `society-approvals.html` | Society | Approval gate 1, line-level sanctioning |
| `dean-approvals.html` | Dean | Approval gate 2 — the same code, a different queue |
| `dean-venues.html` | Dean | Master calendar, clashes, atomic reassignment |
| `dean-overview.html` | Dean | Running totals and what needs chasing |
| `vc-queue.html` | Management | Above-threshold gate 3 |
| `vc-report.html` | Management | Semester report, aggregates only |

## Worth demonstrating

- **Same endpoint, different queues.** `society-approvals.html` and
  `dean-approvals.html` are the same code with one constant changed. The queue scopes
  itself to the stages the caller holds, so each sees only its own work.
- **Budget visibility begins at Treasurer.** Open `club-budget.html` as `member` — the
  API returns nothing, and the page says why. As `treasurer`, three budgets.
- **The Treasurer raises budget requests** but cannot run events: `club-new-event.html`
  works, and the go-live/close buttons on `club-events.html` are absent *and* refused.
- **Management gets a dashboard.** As `vc`, `vc-report.html` renders, but
  `club-roster.html` and `organiser-scan.html` are refused by the API.
- **Create an event, then price it.** `club-new-event.html` → choose "Price it later",
  which creates a draft with an empty budget. Submitting it is refused
  (`GOVERNANCE_BUDGET_REQUIRED`). Switch to `treasurer`, add entries on
  `club-budget.html`, and it submits. Add one more after submission and the API
  answers `409 BUDGET_LOCKED`.
- **A zero-budget event says so explicitly.** On an unpriced budget, use "this event
  needs no budget — why?". The approval queue then shows **"No budget required"** with
  the reason and who declared it, where the figures would be. A blank table cannot tell
  an approver whether the event is free or simply unpriced.
- **Settlement is the last step, and the page says so.** A draft budget shows a stage
  track (Submitted → Sanctioned → Event runs → Settled) and one line explaining what it
  is waiting for — not a list of blockers it cannot act on yet. Spend inputs and the
  Settle button appear only once the budget is sanctioned *and* the event has run.
- **Failures are data.** The scan station's "Try a forged code" button writes a
  `ScanRecord` and moves the capture rate — which is the whole reason failures are
  recorded.

## Not a production frontend

These pages are a demo harness: no build step, no router, no state management, ES
modules straight from `demo.js`. The React + TypeScript + Vite frontend that
`AGENT_PROMPT.md` §2 specifies has not been built. Deliberate — these were needed for a
walkthrough, and they are throwaway.
