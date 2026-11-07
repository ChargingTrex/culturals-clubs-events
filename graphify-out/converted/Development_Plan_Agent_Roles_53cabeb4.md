<!-- converted from Development_Plan_Agent_Roles.docx -->

DEVELOPMENT PLAN
Build Plan & Agent Roles
Clubs & Events Application
Phases, checkpoints, checklists, and how work is split across agents
Version 1.0  ·  Draft

# Table of Contents



# 1. How This Build Is Organised
Work is split across nine agents, each owning a bounded set of files. The split is by domain rather than by layer, so two agents rarely need the same file at the same time. Every phase ends at a checkpoint that must pass before the next begins.
## 1.1 Three rules that make parallel work possible
- Schema first, one owner. A single agent owns models and migrations. Everyone else reads the schema and never writes a migration. Two agents generating migrations against the same models produces conflicts that are painful to unpick.
- Contracts before implementation. API shapes are agreed and published as OpenAPI before frontend work starts. Frontend agents build against the contract, not against a running backend, so they are never blocked waiting.
- File ownership is exclusive. Each agent has a directory it owns. Changes outside that directory go through the orchestrator rather than being made directly.
The failure mode to design against: parallel agents producing plausible code that does not integrate. Most of the structure below exists to force integration to happen continuously rather than at the end of a phase, when unpicking it is most expensive.
## 1.2 Stack, fixed
| Layer | Choice |
| --- | --- |
| Backend | Python 3.12+, Django 5.x, Django REST Framework |
| Database | PostgreSQL; Django ORM and migrations |
| API docs | drf-spectacular, OpenAPI generated from code |
| Frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query |
| Async | Celery with Redis |
| Files | S3-compatible object store |
| Auth | django-allauth with SimpleJWT |
# 2. Agent Roles & Ownership
| Agent | Role | Owns | Never touches |
| --- | --- | --- | --- |
| A0 | Orchestrator / Architect | Contracts, reviews, merges, decision log updates | Feature implementation |
| A1 | Data & Migrations | All models, migrations, constraints, indexes, seed data | Views, serialisers, frontend |
| A2 | Backend — Clubs & Events | clubs/ and events/ apps: services, serialisers, viewsets | Models, migrations, other apps |
| A3 | Backend — Participation | participation/ app: registration, QR tokens, scan endpoints | Models, migrations, budget |
| A4 | Backend — Budget & Approvals | budget/ and governance/ apps: templates, lines, receipts, approval chain | Models, migrations, participation |
| A5 | Backend — Reporting | reporting/ app: aggregation queries, Celery jobs, exports | Models, migrations, write paths |
| A6 | Frontend — Student & Organiser | Student app, event pages, organiser console, scan station UI | Dashboards, backend |
| A7 | Frontend — Staff | Dean dashboard, venue calendar, Management view, Django admin config | Student app, backend |
| A8 | QA & Integrity | Test suites, fixtures, integrity checks, CI gates | Feature code (may open issues, not fix silently) |
## 2.1 Django app boundaries
backend/
core/            shared auth, roles, audit          [A1 models · A0 review]
clubs/           Club, Membership, OfficeBearerTerm  [A2]
events/          Event, Fest, Template, Task, Venue  [A2]
participation/   Registration, QR, Pass, ScanRecord  [A3]
budget/          BudgetTemplate, Line, Receipt       [A4]
governance/      ApprovalRequest, ApprovalStep       [A4]
reporting/       aggregation, semester report        [A5]

frontend/
src/student/     discovery, registration, profile QR [A6]
src/organiser/   event console, scan station         [A6]
src/staff/       Dean, venue calendar, Management    [A7]
src/shared/      design system, API client           [A0 owns; PRs from A6/A7]
A1 owns every models.py. Other agents describe the fields they need to A0, who assigns the change to A1. This is slower per change and far faster overall than resolving migration conflicts.

# 3. Phases & Checkpoints
Five phases. Each ends at a checkpoint with pass criteria that are demonstrable, not self-assessed.
| Phase | Delivers | Checkpoint gate |
| --- | --- | --- |
| P0 | Foundation: schema, auth, roles, CI, app shell | Schema migrates clean; a user can log in; CI green |
| P1 | Clubs, events, approvals, calendar | Dean approves an event end to end; it appears on the calendar |
| P2 | Registration, scan stations, photos, roster | A student is scanned in and the count is correct |
| P3 | Budget, receipts, semester report | A settled event with receipts appears in a generated report |
| P4 | Fests, external participants, venue oversight | A fest with sub-events and outside entrants runs end to end |
Checkpoints are demonstrations, not status updates. Each gate below is phrased as something someone performs in front of others. A phase that cannot be demonstrated has not finished, regardless of what the task board says.
## 3.1 Phase 0 — Foundation
Goal: nothing user-visible, everything else depends on it. Do not compress this phase; every later phase inherits its mistakes.
### A1 — Data & Migrations
☐  All 22 tables modelled per the Database & Data Flow document
☐  UUID primary keys, created_at and updated_at on every table
☐  Money fields NUMERIC(12,2), never float
☐  Enums as text with CHECK constraints
☐  Registration: exactly one of student_id or external_participant_id (DB constraint)
☐  Registration: partial unique on (event_id, student_id) where cancelled_at IS NULL
☐  BudgetLine: exactly one of event_id or fest_id
☐  VenueBooking: PostgreSQL exclusion constraint on overlapping ranges, buffers included
☐  Membership: one active membership per student per club
☐  Feedback: rating between 1 and 5; one response per student per event
☐  All indexes from the Database document created
☐  Seed fixtures: categories, venues, budget templates, event templates, approval config
### A0 — Orchestrator
☐  Repository structure and app boundaries created
☐  API contract published as OpenAPI stubs for every Phase 1 endpoint
☐  Shared design tokens and API client scaffolded in src/shared/
☐  Approval chain configured: one step (Dean) standard, two (Dean, VC) for fests and above-threshold
### A8 — QA
☐  CI runs migrations, tests and lint on every push
☐  Constraint tests: every rule above proven to reject bad data, not merely accept good data
☐  Test fixtures for students, clubs, events, and a full semester of participation
### Checkpoint 0 — pass criteria
| Demonstrate | Passes when |
| --- | --- |
| Fresh database migrates from empty | Zero errors, no manual steps |
| Constraint suite | Every integrity rule rejects invalid data in a test |
| Login | A seeded user authenticates and receives a token |
| CI | Green on a clean checkout |
## 3.2 Phase 1 — Clubs, Events & Approvals
### A2 — Backend, Clubs & Events
☐  Club CRUD, directory, profile, status lifecycle including dormancy flag
☐  Membership join, accept, decline; roster read
☐  Role assignment restricted to President and Vice-President — enforced in the API, not only the UI
☐  Event create from template, with proposal pre-fill
☐  Event status machine: draft, submitted, approved, published, live, completed, reported, cancelled, rejected
☐  Venue booking with conflict rejection and buffer handling
☐  Calendar and feed endpoints with filters
### A4 — Backend, Approvals
☐  Generic ApprovalRequest and ApprovalStep working for events
☐  Single-gate routing to Dean; threshold routing to VC prepared but unused until P3
☐  Approve, return with comment, reject; comment mandatory on return and reject
☐  Approval age tracked for SLA display
☐  Audit log written on every decision
### A6 / A7 — Frontend
☐  Student: club directory, club profile, event page, calendar, feed
☐  Organiser: event creation wizard, task checklist
☐  Dean: pending approvals queue sorted by age; approve, return, reject with comment
☐  Notifications rendered in-app; email templates for approval outcomes
### Checkpoint 1 — pass criteria
| Demonstrate | Passes when |
| --- | --- |
| Full approval path | A club submits an event, the Dean approves it, and it appears on the public calendar |
| Return path | A returned event carries the Dean's comment and can be revised and resubmitted |
| Role restriction | A Treasurer account is refused when attempting to assign a role, at the API level |
| Venue conflict | Two overlapping bookings — the second is rejected |
| Notification | Approval outcome arrives in-app and by email, and by no other channel |
## 3.3 Phase 2 — Participation & Attendance
The highest-risk phase. Everything management ever sees is derived from what happens here. A scan station that is slow or unreliable at the door will be abandoned by clubs, and then no figure in the system is trustworthy.
### A3 — Backend, Participation
☐  Registration with capacity enforcement and waitlist promotion
☐  Custom form fields stored as JSONB per event
☐  Team registration with captain and size limits
☐  StudentQRToken: signed opaque token, PRN never encoded readably, rotation supported
☐  EventPass: one-time, used_at set on first scan, rejected thereafter
☐  Scan resolution covering all seven branches: accepted, duplicate, wrong event, not registered, unknown code, spot registered, manual
☐  Spot registration in a single scan of the profile QR
☐  ScanRecord written for every attempt including failures
☐  Offline queue accepted on sync, with earliest scanned_at winning on conflict
### A6 — Scan station UI
☐  Continuous camera read in-browser, no per-scan tap
☐  Result states visually distinct at arm's length in a moving queue
☐  Sub-second feedback from read to result
☐  Roster search by PRN or name as fallback
☐  Works offline; queued scans visible; syncs on reconnect
☐  Multiple stations operating in parallel without conflict
☐  Profile QR in student profile with brightness boost on display
### A2 — Photos & roster
☐  Photo upload from mobile, auto-tagged with event, club, semester
☐  Highlight marking; event report blocked without at least one photo
☐  Social post link capture with platform, URL, capture date
### Checkpoint 2 — pass criteria
| Demonstrate | Passes when |
| --- | --- |
| Live check-in | Twenty people scanned in sequence with no queue building |
| Duplicate rejection | The same pass scanned twice is refused, with the first check-in time shown |
| Spot registration | An unregistered student is scanned and admitted in one action |
| Offline | Aeroplane mode, ten scans, reconnect — all ten present and no duplicates |
| Two stations | Simultaneous scanning of the same event, counts reconcile exactly |
| Count integrity | actual_attendance equals COUNT(Registration WHERE attended) |
## 3.4 Phase 3 — Budget, Receipts & Reporting
### A4 — Budget
☐  Budget template library seeded with the institution's real event types
☐  Per-head calculation: rate multiplied by expected attendance
☐  Contingency line appended at the template percentage
☐  Line-level sanctioning — an approver can reduce one head and approve the rest
☐  Threshold routing to Vice-Chancellor above the configured amount
☐  Settlement with per-line actual spend
☐  Receipt upload: image and PDF, per line, with amount, vendor and document date
☐  Settlement blocked above the receipt threshold with no attached document
☐  Variance note required where spend exceeds sanctioned
☐  Superseded receipts retained, never overwritten
### A5 — Reporting
☐  events_run, total_participation, unique_students, avg_attendance implemented as specified
☐  unique_students uses COUNT(DISTINCT student_id) — verified against a seeded dataset with known overlap
☐  Own students and external participants counted separately, never summed
☐  Splits by category and by club
☐  Semester bounds read from the portal core calendar
☐  Report generation runs as a Celery job, not in the request cycle
☐  Export to PDF and PowerPoint
☐  Capture-rate metric computed and exposed on the Dean dashboard
### Checkpoint 3 — pass criteria
| Demonstrate | Passes when |
| --- | --- |
| Budget end to end | Template to proposal to line-level sanction to settlement with receipts |
| Threshold escalation | A large budget routes to the VC; a small one does not |
| Receipt block | A line above threshold cannot settle without a document |
| Unique students | Seed 20 events attended by the same 80 students; the report shows 80, not 1,600 |
| Report generation | A full semester report generates with photos and exports to PDF and slides |
## 3.5 Phase 4 — Fests, External Participants & Venue Oversight
### A2 / A3 — Fests
☐  Fest parent record with two-gate approval: Dean then Vice-Chancellor
☐  Sub-events linked to parent, inheriting branding and date window
☐  Participation, budget and photos roll up to fest level
☐  Public fest page with hero banner, sub-event cards, schedule, sponsors, team
☐  External participant registration without an account; QR by email
☐  External data stored separately from the student directory, with purge_after set
☐  Session-level check-in for multi-session events
### A7 — Venue oversight
☐  Master calendar of all venues, by day, week and month
☐  Clash alerts showing both competing events with capacity against expected attendance
☐  Pressure view of over-subscribed dates
☐  Utilisation across venues
☐  Reassignment: only free and adequately sized venues offered
☐  Reassignment atomic — old booking released and new one created in one transaction
☐  Reason mandatory; club and registered students notified
☐  Reassignment history retained on the event
### Checkpoint 4 — pass criteria
| Demonstrate | Passes when |
| --- | --- |
| Fest end to end | Fest approved through both gates, sub-events created, page live |
| External entrant | An outside participant registers, receives a QR, and is scanned in |
| Separate counting | The report shows own students and visitors as distinct figures |
| Reassignment | A clashing event is moved; both clubs notified; no window where the slot is doubly held |
| Purge | External participant data past purge_after is removed by the scheduled job |
# 4. Definition of Done
Applies to every task, every agent. A task that misses any line is not done.
☐  Code merged to main, CI green
☐  Tests written by the implementing agent and reviewed by A8
☐  Permission rules enforced server-side, not only hidden in the UI
☐  OpenAPI regenerated where the contract changed
☐  Notifications go only through in-app and email
☐  No student personal data exposed beyond the scope defined for that role
☐  Audit log entry written for any consequential change
☐  Decision Log updated if the task changed a decision
The line that gets skipped most: server-side permission enforcement. Hiding a button is not a permission. Every restriction in these documents — role assignment, budget visibility, attendee identity scope — must fail at the API when tested with a wrong-role token.
# 5. Handoffs & Coordination
## 5.1 Standing handoff points
| From | To | Handoff | When |
| --- | --- | --- | --- |
| A1 | All | Migrated schema and seed fixtures | End of P0, and on any schema change |
| A0 | A6, A7 | OpenAPI contract for the phase | Before frontend work starts |
| A2 | A4 | Event and fest records approvals attach to | Early P1 |
| A3 | A5 | Registration and attendance data shape | Early P3 |
| A4 | A5 | Budget figures for report aggregation | Mid P3 |
| All | A8 | Feature complete, ready for integrity testing | Before each checkpoint |
## 5.2 Schema change protocol
Agent needs a field
→ raises a schema request to A0 stating field, type, nullability, why
→ A0 checks it against the Database document and the Decision Log
→ A1 writes the model change and migration
→ A1 publishes the migration; all agents rebase
→ A0 updates the Database document in the same cycle

No agent other than A1 writes a migration. Ever.
## 5.3 Risks specific to this build
| Risk | Mitigation |
| --- | --- |
| Agents produce code that does not integrate | Contract-first APIs; integration test suite from P0; A8 tests across boundaries, not within them |
| Migration conflicts | Single owner (A1); no exceptions |
| Scan station too slow, clubs abandon it | Performance target set at checkpoint 2 and demonstrated with twenty people, not one |
| Permission rules implemented in UI only | A8 tests every restricted endpoint with a wrong-role token as a standing suite |
| Reporting queries drift from the specification | Seeded dataset with known answers; unique-students figure asserted against it |
| Open decisions block work mid-phase | Resolve O-03 and O-05 before P1; the rest before the phase that needs them |
# 6. Open Items Blocking Work
From the Decision Log. Each must be answered before the phase that depends on it.
| Ref | Question | Needed by |
| --- | --- | --- |
| O-03 | Third approval gate for fests? | P4 — but affects approval config in P0 |
| O-05 | Venue precedence rule when two events clash | P4 |
| O-02 | Budget threshold escalating to the VC | P3 |
| O-06 | Receipt-mandatory threshold per line | P3 |
| O-04 | Cover when the Dean is unavailable | P1 |
| O-08 | Is PRN the canonical identifier for the profile QR | P2 |
| O-11 | Real event types and budget heads for templates | P3 |
| O-07 | External participant retention period | P4 |
Two are needed sooner than they look: O-03 shapes the approval configuration built in Phase 0, even though fests are Phase 4 work — a chain that must support three steps is worth knowing before the table is designed around two. O-08 must be settled before any QR work begins.