# Orchestrator checklist — features required, status, verification

Maintained by ORCH (the orchestrating session). One row per feature or task. Status
vocabulary: `todo` · `in-progress` · `done-unverified` (worker says done) · `verified`
(ORCH ran the tests and read the diff) · `qa-pass` / `qa-rework` (QA review) · `accepted-risk`.
Existing-state column is the audit result on 2026-10-21 (BUILT / PARTIAL / MISSING / DEVIATES).

Backend = `clubs-and-culturals-platform/app/backend`. Web-app = `web-app/`. React = `clubs-and-culturals-platform/app/frontend`.

## A. Foundation (Wave 0)

| Id | Task | Owner | Status | Verification |
|---|---|---|---|---|
| A-01 | `git init` at project root, `.gitignore`, baseline commit | ORCH | verified | `git log` shows baseline | — commit b1433bf, web-app kept in its own repo
| A-02 | Backend runs on Python 3.12 venv; 143 tests green | ORCH | verified | run 2026-10-21 14:15 |
| A-03 | Web-app smoke + 109 e2e green | ORCH | verified | run 2026-10-21 14:12 |
| A-04 | Backend CI workflow (tests, `makemigrations --check`, `spectacular`) | W7 | done-unverified | green on clean checkout | — `.github/workflows/backend-ci.yml`; Postgres test step advisory until B-15
| A-05 | Snapshot of tree before parallel edits | ORCH | verified | scratchpad `baseline-20261021-1416.tgz` |

## B. Wave 1 — backend gaps (parallel, independent apps)

| Id | PRD § | Feature | Existing | Owner | Status | Acceptance test (must exist and pass) |
|---|---|---|---|---|---|---|
| B-00a | – | **Hotfix:** `EventViewSet.destroy` — only PROPOSERS of the owning club may delete, and only in `draft`/`returned`/`rejected`; everything else is `409`; cancel is the route for published events | MISSING (X-1) | W2 | qa-pass-with-findings | student 404/403 on DELETE of a published event; president cannot delete a published event |
| B-00b | §4 | **Hotfix:** venue booking integrity — `select_for_update` on the venue inside `EventViewSet.create`/`submit` clash check; Postgres `ExclusionConstraint` (btree_gist) migration on (venue, tstzrange with buffer) guarded by `vendor == postgresql` | MISSING (X-2) | W2 | qa-pass-with-findings | two concurrent creates for one slot: exactly one succeeds (threaded test on Postgres, skip on SQLite) |
| B-00c | – | Grant `event_organiser:<event_id>` in local mode via `POST /events/{id}/organisers` (President/VP) so the Organiser role is exercisable standalone (X-4) | MISSING | W2 | qa-pass-with-findings | organiser scans own event; refused at another |
| B-01 | 5.6 | Waitlist: `Registration.waitlisted`, join waitlist when full, FIFO promotion on cancellation, pass minted on promotion, notification | MISSING | W1 | qa-pass | full event → waitlisted; cancel → promoted + pass; wrong-role cannot promote |
| B-02 | 5.8 | Feedback: model (rating 1–5 CHECK, one per student per event UNIQUE), submit only if attended, aggregates for organiser/Dean, individual rows hidden from organisers | MISSING | W1 | verified | non-attendee 403; second submission 409; organiser aggregate has no student ids |
| B-03 | 5.2 | Club join: `Club.join_mode` (open/approval), `JoinRequest`, accept/decline by President/VP, roster shows pending | MISSING | W2 | qa-pass-with-findings | open club → member immediately; approval club → pending; Treasurer cannot accept |
| B-04 | 5.3, 5.18 | `OfficeBearerTerm` start/end; handover endpoint; token/role lookup ignores expired terms; history endpoint | MISSING | W2 | qa-rework | expired President refused on role assignment; history lists who held what when |
| B-05 | 5.1 | Dormancy: `Club.last_activity_at`, job flags dormant after `DORMANCY_DAYS` | PARTIAL (status only) | W2 | qa-pass-with-findings | job flips an inactive club; active club untouched |
| B-06 | 5.13, §11.3 | Delegation: `Delegation(from_role, to_user, starts_at, ends_at, reason)`; `assert_can_decide` honours it; step records delegate + principal | MISSING | W3 | qa-rework | delegate approves inside window; refused outside; self-approval still refused |
| B-07 | 5.11, 6.3 | SLA: `age_hours` on queue items, `APPROVAL_SLA_HOURS`, `escalated` flag on Dean overview | MISSING | W3 | qa-pass-with-findings | item older than SLA shows escalated |
| B-08 | 5.7.3, 5.19.5 | Annual envelope: `Club.annual_envelope`, utilisation = Σ sanctioned this year, on budget list and club profile | MISSING | W3 | qa-pass-with-findings | utilisation sums only sanctioned/settled; member cannot see it |
| B-09 | – | OpenAPI hygiene: `@extend_schema(responses=…)` on MeView, LoginView, RefreshView, ModeView, MyPassesView, reissue_pass, feedback and jobs views; `@extend_schema_field` on every SerializerMethodField (EventSerializer registered/attended/budget/my_registration/social_links, ClubSerializer member_count/my_role); `ENUM_NAME_OVERRIDES`; `spectacular --fail-on-warn` clean so the frontend can delete `src/shared/api/types.ts` overrides | 92 errors | W4 | todo (after wave-1 merge) | `manage.py spectacular --fail-on-warn` exits 0 |
| B-10 | 6.1, 10.2 | `jobs/` app: token-guarded `POST /api/v1/jobs/{dormancy,purge-external,rollup-scans,escalate-sla}`; CSV export of the semester report | MISSING | W4 | qa-pass | no token → 401; CSV has the same totals as JSON |
| B-11 | §7.6 | Two capture metrics under distinct names on the overview | DEVIATES | W4 | qa-pass | both present, documented |
| B-12 | 5.5, 5.16.3 | Registration confirmation: in-app + email with the pass on register and on waitlist promotion; registered students notified on publication and venue move | MISSING | W1 | verified | notification rows exist for the student after register; email backend receives one message |
| B-13 | 5.19.4 | Serve receipt files: `GET /budget/budgets/{id}/lines/{line_id}/receipts/{receipt_id}/file` via `FileStore.url_for`, BUDGET_VIEWERS + approvers only | MISSING | W3 | qa-rework | member 404; treasurer gets the bytes; superseded receipt still retrievable |
| B-14 | 8 auditability | Audit entry on every roster read (`EventRosterView`, `GET /clubs/{id}/members`) as the docstring promises | MISSING | W1 | verified | reading a roster writes an AuditEntry naming the reader |
| B-15 | §8 Postgres | `select_for_update` + `select_related` over a nullable FK fails on Postgres (10 tests): lock the row only (`of=("self",)`) and fetch related rows after | BUG | W1 | verified-sqlite-only | suite green on Postgres in CI; remove `continue-on-error` |
| B-16 | 5.5 | `GET /events?category=` server-side filter (W5 narrows client-side today) | MISSING | W2 | todo | filter returns only that category across pages |

## C. Wave 2 — React frontend and hosting

| Id | Feature | Owner | Status | Acceptance |
|---|---|---|---|---|
| F-01 | Vite+TS+Tailwind+TanStack scaffold, OpenAPI-generated client, auth + MFA + refresh, role-scoped nav | W5 | verified | every persona sees only its pages (port of `tests/smoke.mjs`) |
| F-02 | Student screens: events, event page, register/cancel/waitlist, passes, profile QR | W5 | verified | Playwright: register → pass visible |
| F-03 | Organiser scan station: camera read, seven verdicts, offline queue, PRN lookup, roster | W5 | todo | Playwright: scan pass → checked in; same again → duplicate |
| F-04 | Club screens: new event, budget, events, roster/roles, join requests, handover | W6 | todo | Playwright: treasurer prices and submits |
| F-05 | Staff screens: three queues, line sanction, venues + reassign, overview, report | W6 | todo | Playwright: Society → Dean → VC on a >50k event |
| H-01 | Backend on Vercel + Neon (seeded), React on Vercel, web-app on Netlify, `docs/HOSTING.md` | W7 | done-unverified | URLs reachable; `/api/v1/module/auth/mode` answers | — config + docs/HOSTING.md written; deploy needs the user's Neon/Vercel/Netlify accounts
| H-02 | Hosted run-through (DEMO_CREDENTIALS ten-minute script) | QA | todo | all steps pass |
| H-03 | `vercel.json` `crons` block for `/api/v1/jobs/{rollup-scans,purge-external,flag-dormant,escalate-sla}` with `JOBS_TOKEN` = Vercel `CRON_SECRET` (GET form exists) | W7 | todo | cron hits return 200 with a job result |

## D. Later waves (not yet assigned)

| Id | PRD § | Feature | Existing |
|---|---|---|---|
| D-01 | 5.10 | EventPhoto rows, object-store upload, highlights, captions, consent notice + removal | PARTIAL (count only) |
| D-02 | 5.14 | EventSocialPost rows (platform, url, date, who, screenshot), per-club activity, mandatory-link config | PARTIAL (JSON links) |
| D-03 | 5.11 | Event templates with task checklist, clone past event, reminders | PARTIAL (budget template only) |
| D-04 | 5.12.1 | Custom registration forms (JSONB), team registration, volunteer roster/shifts, speakers, sponsors | MISSING |
| D-05 | 5.12.3 | Auto-drafted event report, certificates, learnings, vendor record | MISSING |
| D-06 | 5.15 | Fest sub-events, roll-ups, fest page, FestRole, fest budget envelope | PARTIAL (Fest model) |
| D-07 | 5.15.5 | External participant public registration, QR by email, purge job | PARTIAL (model) |
| D-08 | 5.12.2 | Session-level check-in | MISSING |
| D-09 | 5.9 | Exam blackout periods, per-venue timeline, pressure view, utilisation, schedule export | MISSING |
| D-10 | 5.5 | Personalised feed, per-user notification preferences | MISSING |
| D-11 | 6.1, 6.4 | PDF + PPTX report with photos, trend vs previous semester, Management dashboard | MISSING |
| D-12 | 5.1 | New-club registration workflow with Dean approval | MISSING |
| D-13 | 4 | Student Life Office role (venues, calendar, templates, club records) | MISSING |
| D-14 | 8 | WCAG 2.1 AA audit; load test (registration burst, scan throughput) | not tested |
| D-15 | 5.13 | Approval chains per request type (venue, new club), parallel steps | PARTIAL (env config, events only) |
| D-16 | 5.7.2 | Prior-year cost reference on templates; custom-head surfacing to SLO | MISSING |
| D-17 | 5.17 | Attendee list export | MISSING |

## E. Decisions and open questions blocking work

| # | Question | Default in code | Blocks |
|---|---|---|---|
| E-01 | Third gate for fests between Dean and VC? | no | D-06 |
| E-02 | Venue precedence rule | none, Dean decides | D-09 |
| E-03 | Receipt-mandatory threshold | ₹5,000 | – |
| E-04 | VC threshold | ₹50,000 | – |
| E-05 | External participant retention | `purge_after` nullable | D-07 |
| E-06 | Cancelled event with committed spend — who signs off? | unhandled | D-05 |
| E-07 | Cultural Society gate stays? deputy? | on | B-06 |
| E-08 | Capture-rate definition | both shipped (B-11) | – |
| E-09 | Purging an external participant cascades to their registrations and changes an already-reported semester's `external_participants` (W4). Keep the row and blank PII, or accept the drift? | delete (as specified) | D-07 |
| E-10 | ScanRecord roll-up after one year: retention rule not recorded, so the job counts and deletes nothing | count only | B-10 |
| E-11 | Budget envelope year: calendar year (current) or academic year via `Semester`? | calendar, in DISPLAY_TIME_ZONE | B-08 |

## QA log

| Wave | Report | Result |
|---|---|---|
| 1 | `docs/qa/wave-1.md` | pending |
