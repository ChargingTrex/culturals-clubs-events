# Completion plan — remaining PRD features, testing and test hosting

Written 2026-10-21. Companion files: `AUDIT_2026-10-21.md` (what exists),
`CHECKLIST.md` (the orchestrator's live task board), `FLOWS.md` (diagrams),
`API_DATA_MODELS.md` (entities and endpoints).

## 1. Where we start

Two codebases implement the same rules:

| Codebase | What it is | State on 2026-10-21 |
|---|---|---|
| `clubs-and-culturals-platform/app/backend` | Django 5.2 + DRF, the production backend the spec fixes | 54 API paths, 143 tests green on Python 3.12, no git history, no React frontend |
| `web-app/` | Browser-only ES-module walkthrough mirroring the backend rules | 15 pages, smoke + 109 e2e tests green, Netlify-ready |
| `clubs-and-culturals-platform/app/frontend` | The React 18 + TS + Vite + Tailwind + TanStack Query app AGENT_PROMPT §2 fixes | **empty directories** |

Strategy: **the backend is the product; the web-app is the reference UI.** Remaining
features are built in the backend first (server-side rules, wrong-role tests), then a
React frontend is built against the backend and ported screen-by-screen from the
web-app, which already encodes the role-scoped navigation and refusal behaviour that
testers signed off on.

## 2. Test hosting (Vercel / Netlify)

| Piece | Host | How | Notes |
|---|---|---|---|
| `web-app` walkthrough | **Netlify** | `netlify.toml` already present; publish dir `.`; no build | Keep live as the "reference behaviour" site for testers |
| Django backend | **Vercel** (Python runtime) | `api/index.py` exporting the WSGI `app`; `vercel.json` routes `/(.*)` → `api/index.py`; `requirements.txt` at the Vercel root | Vercel functions are stateless: no Celery worker, no local media. See constraints below |
| Postgres | Neon (or Supabase) | `DATABASE_URL` env in Vercel | Needed: the venue exclusion constraint and partial unique indexes are Postgres-only |
| Receipts / photos | S3-compatible bucket (Cloudflare R2 or Supabase Storage) | `integrations/files.py` already has the adapter seam | DB stores references only (AGENT_PROMPT §2) |
| React frontend | **Vercel** (static Vite build) | `VITE_API_BASE` → backend URL; backend `CORS_ALLOWED_ORIGINS` includes the Vercel domain | Preview deploys per PR |
| CI | GitHub Actions | backend: `manage.py test --settings=config.settings_test` + `makemigrations --check` + `spectacular --fail-on-warn`; web-app: existing `ci.yml`; frontend: `tsc && vitest && playwright` | Requires `git init` at the project root (see §6) |

Backend-on-Vercel constraints and the decisions they force:
- **Celery**: no long-running worker. Test hosting runs `CELERY_TASK_ALWAYS_EAGER=1`; scheduled jobs (dormancy flag, retention purge, scan roll-up, SLA escalation) are exposed as `POST /api/v1/jobs/<name>` guarded by a `JOBS_TOKEN` and triggered by Vercel Cron. Production (later) runs a real worker on any host.
- **DEMO_MODE** refuses to start with `DEBUG=0`, and a public host must run `DEBUG=0`. Test hosting therefore uses `INTEGRATION_MODE=local`, real login with the seeded accounts, MFA code accepted as any non-empty string (already the case), and `DEMO_MODE=0`. The `/demo/` pages stay a local-only harness.
- **Cold starts**: Django on a function is 1–3 s cold; acceptable for testing, not for the sub-second scan NFR. The scan station keeps its offline queue so a cold start never blocks a door. Production hosting is a separate decision (Render/Fly/VM).
- **Secrets**: `DJANGO_SECRET_KEY`, `QR_SIGNING_KEYS` (32+ bytes), `DATABASE_URL`, `JOBS_TOKEN`, `EMAIL_*` set in Vercel; never committed.

## 3. Agent roster

The Development Plan's nine-agent split (A0–A8) is kept, with one change: because
there is no shared migration owner in this session, **each backend worker owns the
models and migrations of its own apps**, and QA runs `makemigrations --check` and a
clean `migrate` on every wave so cross-app drift is caught immediately.

| Agent | Role | Owns (exclusive) | Never touches |
|---|---|---|---|
| **ORCH** (A0) | Orchestrator — this session | `docs/CHECKLIST.md`, `docs/*.md`, contracts, merge/verify, decision log entries | Feature code |
| **W1** (A3) | Backend — Participation | `backend/participation/`, new `backend/feedback/` | budget, governance |
| **W2** (A2) | Backend — Clubs & Events | `backend/clubs/`, `backend/events/` | participation, budget |
| **W3** (A4) | Backend — Budget & Governance | `backend/budget/`, `backend/governance/` | participation, clubs |
| **W4** (A5) | Backend — Reporting, jobs, API hygiene | `backend/reporting/`, `backend/jobs/`, `config/celery.py`, response serializers for schema errors | write paths in other apps |
| **W5** (A6) | Frontend — Student & Organiser | `frontend/` scaffold, `src/shared/`, `src/student/`, `src/organiser/` | backend |
| **W6** (A7) | Frontend — Staff | `frontend/src/staff/` (Dean, Society, VC, venues) | backend, student screens |
| **W7** | DevOps & hosting | `vercel.json`, `api/index.py`, `.github/workflows/`, `netlify.toml`, env docs, seed for hosted DB | feature code |
| **QA** (A8) | Quality & strength review | `backend/tests/`, `frontend/tests/`, review reports in `docs/qa/` | Feature code (opens findings, does not fix silently) |

Protocol
0. Workers run in their own git worktrees (branch `wave1/<worker>` off the baseline commit); ORCH merges each branch after verification, so two workers never write the same tree.
1. ORCH writes each task in `CHECKLIST.md` with: id, PRD §, owner, acceptance test, status (`todo` → `in-progress` → `done-unverified` → `verified` / `rework`).
2. A worker edits only its owned paths, adds the test with the code, runs its app's tests, and reports back against the checklist ids with file:line evidence.
3. ORCH verifies: runs the full suite, reads the diff, checks the acceptance test exists and the restriction fails with a wrong-role token, then marks `verified` or `rework` with a reason.
4. QA reviews every `verified` item for code quality and strength: concurrency (locks, constraints), 404-not-403 discipline, personal-data exposure, N+1 queries, error contract, test adequacy. QA findings go to `docs/qa/wave-N.md`; ORCH turns each finding into a `rework` or an accepted risk.
5. Nothing is `done` until ORCH and QA have both signed it.

## 4. Waves

Each wave ends at a demonstrable checkpoint (Development Plan §3), not a status update.

### Wave 0 — Foundation for parallel work (ORCH + W7, hours)
- `git init` at the project root, `.gitignore`, baseline commit (the Reconciliation incident happened because there was no history).
- `docs/` as the single place for plan, checklist, flows, data models, QA reports.
- Backend CI on push; web-app CI already exists.
- **Gate:** `git log` shows a baseline; CI green on a clean checkout.

### Wave 1 — Backend gaps that are small, well-specified and independent (W1–W4, parallel)
| Id | Feature (PRD §) | Owner |
|---|---|---|
| B-01 | Waitlist: `waitlisted` registrations, FIFO promotion on cancellation, pass minted on promotion, notification (5.6) | W1 |
| B-02 | Feedback: `Feedback` model (rating 1–5, one per student per event, DB check + unique), `POST /participation/events/{id}/feedback`, aggregates for organiser/Dean, anonymous to organisers (5.8) | W1 |
| B-03 | Club join requests: `join_mode` open/approval, `JoinRequest` model, accept/decline by President/VP, roster shows pending (5.2) | W2 |
| B-04 | Office-bearer terms and handover: `OfficeBearerTerm` with start/end, permission expiry on end date, `POST /clubs/{id}/handover`, history endpoint (5.3, 5.18) | W2 |
| B-05 | Dormancy auto-flag job + club `last_activity_at` (5.1) | W2 |
| B-06 | Approval delegation: `Delegation` (from role, to user, window, reason), honoured by `assert_can_decide`, recorded on the step (5.13, §11.3) | W3 |
| B-07 | SLA age and escalation: `age_days` on queue, `APPROVAL_SLA_HOURS`, escalation flag surfaced on the Dean overview (5.11, 6.3) | W3 |
| B-08 | Annual budget envelope per club with utilisation on the budget list (5.7.3, 5.19.5) | W3 |
| B-09 | Schema hygiene: response serializers so `spectacular` runs with zero errors; `ENUM_NAME_OVERRIDES` (needed before W5/W6 generate a client) | W4 |
| B-10 | Report exports: CSV now; PDF via WeasyPrint-free HTML-to-PDF later; `jobs/` app with token-guarded job endpoints for Vercel Cron (6.1, 10.2 #14–16) | W4 |
| B-11 | Capture-rate decision: ship both metrics under distinct names (`scan_success_rate`, `scan_capture_rate`) on the overview (§7.6) | W4 |
- **Gate:** a student joins a waitlist and is promoted when someone cancels; a returned proposal shows its age; a delegate approves while the Dean is away and the step records both names; `spectacular` reports 0 errors.

### Wave 2 — React frontend vertical slices + hosting (W5, W6, W7, parallel; QA after)
| Id | Feature | Owner |
|---|---|---|
| F-01 | Vite + TS + Tailwind + TanStack Query scaffold; typed client generated from the OpenAPI schema; auth (login, MFA, refresh rotation, `me` capabilities), role-scoped navigation ported from `web-app/src/ui.js` | W5 |
| F-02 | Student: events list, event page, register/cancel, passes, profile QR with brightness boost | W5 |
| F-03 | Organiser: scan station with continuous camera read (`BarcodeDetector` with ZXing fallback), the seven verdicts at arm's length, offline queue, PRN lookup, roster | W5 |
| F-04 | Club: new event, budget (lines, nil, receipts, settle), events, roster + roles, join requests, handover | W6 |
| F-05 | Staff: Society/Dean/VC queues with line sanction, venue calendar + reassign, Dean overview, semester report | W6 |
| H-01 | Backend on Vercel + Neon, seeded; React on Vercel; web-app on Netlify; URLs in `docs/HOSTING.md` | W7 |
| H-02 | Playwright e2e against the hosted stack: the ten-minute run-through from `DEMO_CREDENTIALS.md` | QA |
- **Gate:** the DEMO_CREDENTIALS run-through completes on the hosted stack with every role.

### Wave 3 — Evidence, media and automation (W2, W4)
Photos as rows with upload to object storage, highlights, captions, consent notice and removal request (5.10); social posts as rows with platform/date/who/screenshot and per-club activity (5.14); event templates with task checklist and clone (5.11); volunteer roster and team registration (5.12); auto-drafted event report; reminders; Celery/cron jobs for retention (ScanRecord roll-up, external purge).

### Wave 4 — Fests and external participants (W1, W2, W5)
Sub-events under a `Fest`, roll-ups, fest page, time-bound `FestRole`, fest-level budget envelope, external participant public registration with QR by email and `purge_after` job, session-level check-in (5.15, 5.12.2).

### Wave 5 — Reporting depth and NFRs (W4, W6, QA)
PDF and PowerPoint export with photos, trend vs previous semester, Management dashboard, Dean dashboard completeness (missing photos/links/reports, pressure view, utilisation), per-user notification preferences, personalised feed, exam blackout periods, WCAG 2.1 AA pass, load test of registration burst and scan throughput.

Out of scope until decided (MASTER_SPEC §11): third gate for fests, venue precedence rule, cancelled-event settlement sign-off, external retention period, Student Life Office as a distinct role (currently Dean/admin).

## 5. Testing strategy

| Layer | Tool | Rule |
|---|---|---|
| Backend unit/API | Django `TestCase` (143 today) | Every restriction has a wrong-role token test; every DB constraint has a rejects-bad-data test |
| Backend contract | `drf-spectacular --fail-on-warn` | Schema is the frontend's source of truth; zero errors |
| Backend integrity | `makemigrations --check`, clean `migrate` on Postgres in CI | Catches cross-app model drift from parallel workers |
| web-app | existing smoke + e2e (109) | Stays green; it is the reference behaviour |
| React | Vitest for rules/hooks; Playwright for the DEMO_CREDENTIALS run-through against a Vercel preview | Role-scoped navigation and refusals asserted per persona, mirroring `tests/smoke.mjs` |
| Strength (QA) | Review + targeted tests: concurrent registration at capacity, two offline stations same student, replay idempotency, sanction above request, self-approval with dual roles, VC sweep for PRN/name | Findings in `docs/qa/` |
| Performance | k6 against the hosted backend: 200 registrations in 10 s; 5 stations × 1 scan/s | NFR §8 |

## 6. Immediate actions (this session)
1. `git init` + baseline commit so parallel edits are recoverable.
2. Launch Wave 1 workers W1–W4 and W7 (CI + Vercel config) in parallel; QA after the first merges.
3. ORCH verifies each item against `CHECKLIST.md`; QA writes `docs/qa/wave-1.md`.
