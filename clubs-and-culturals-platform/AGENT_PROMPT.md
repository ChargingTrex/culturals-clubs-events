# Build Prompt — Clubs & Events Application

Paste the whole of this file into the agent. Fill in `ASSIGNED_ROLE` and `CURRENT_PHASE` at the bottom before sending.

---

## 1. What you are building

A Clubs & Events module for a college student portal. It is the first module of a wider student management portal. The college has ~1,500 students today; the system must scale to 25,000+ without re-architecture.

**The purpose in one sentence:** the college runs good events but has no record of them, so it cannot show anyone what they added up to. This system captures events, participation, money and photographs so a semester report can be generated instead of assembled by hand.

**The load-bearing idea:** every figure management ever sees derives from attendance records. If attendance capture is unreliable, nothing else in the system matters. Treat it accordingly.

---

## 2. Fixed decisions — do not revisit

These were decided deliberately. Do not propose alternatives, do not "improve" them, do not silently deviate.

| Area | Decision |
|---|---|
| Backend | Python 3.12+, Django 5.x, Django REST Framework |
| Database | PostgreSQL, Django ORM + migrations |
| API docs | drf-spectacular, OpenAPI generated from code |
| Frontend | React 18 + TypeScript + Vite + Tailwind + TanStack Query |
| Async | Celery + Redis |
| Files | S3-compatible object store — DB stores references only, never binary |
| Auth | django-allauth + SimpleJWT |
| Notifications | **In-app and email ONLY.** No SMS, no WhatsApp, no third-party messaging. |
| Approvals | **Dean of Student Affairs only** for standard events. Two gates (Dean → Vice-Chancellor) for fests and above-threshold budgets. **There is no faculty advisor step.** |
| Attendance | **Organiser scans the student**, metro-turnstile style. Never the reverse. |
| Codes | Persistent profile QR (signed token, in student profile) + one-time event pass |
| Self-marking | **Does not exist.** No route for a student to mark themselves present. |
| Social | Link capture only. No Instagram/LinkedIn API calls, ever. |

If a requirement seems to conflict with one of these, stop and ask. Do not resolve it yourself.

---

## 3. Non-negotiable rules

1. **Only agent A1 writes models and migrations.** If you need a field, raise a schema request to A0 stating field, type, nullability and why. Never run `makemigrations` unless you are A1.
2. **Permissions are enforced server-side.** Hiding a button is not a permission. Every restriction must fail at the API when called with a wrong-role token.
3. **Integrity constraints live in the database**, not only in application code. Application checks fail under concurrency; constraints do not.
4. **Never write to portal core tables.** Student, User, Department, Semester are read-only here. Club participation never touches academic records.
5. **Stay inside your owned directory.** Changes elsewhere go through A0.
6. **Count `attended`, never `registered`.** Registered-but-absent rows stay in the table (no-show rate is useful) but are never counted as participation.
7. **Own students and external participants are counted separately, never summed.**
8. **Write the test with the code.** A feature without a test that proves its restriction is not done.

---

## 4. Data model essentials

22 tables across six domains: clubs & people, events & fests, participation, money, evidence, governance.

**Conventions:** UUID primary keys · `created_at`/`updated_at` everywhere · money as `NUMERIC(12,2)` never float · enums as text with CHECK constraints · UTC storage, IST display · soft-delete via status, except external participant data which is genuinely purged.

**Constraints that must exist in PostgreSQL:**

```
Registration   exactly one of student_id or external_participant_id
Registration   partial unique (event_id, student_id) where cancelled_at IS NULL
BudgetLine     exactly one of event_id or fest_id
Event          ends_at > starts_at; cancelled_reason required when cancelled
Feedback       rating between 1 and 5; one response per student per event
VenueBooking   exclusion constraint on overlapping ranges (buffers included)
Membership     one active membership per student per club
```

**Registration is the most important table in the system.** Every reported figure derives from it.

---

## 5. The flows you must get right

### Check-in resolution — all seven branches

```
Camera reads code → resolve against EventPass.token OR StudentQRToken.token

EventPass, used_at NULL       → accept; set used_at
EventPass, used_at set        → reject: duplicate
ProfileQR, registered         → accept
ProfileQR, not registered     → create Registration (source=spot); accept
ProfileQR, already attended   → reject: duplicate
Token resolves to other event → reject: wrong_event
Token unknown                 → reject: unknown_code

EVERY branch writes a ScanRecord — including failures.
Failures are the capture-rate metric. Without them, a station
rejecting half the queue looks identical to a quiet event.

On accept: Registration.attended=true, checked_in_at, operator, station
```

**Offline:** station caches roster + valid tokens, queues scans with device timestamps, replays on reconnect. Conflict rule: earliest `scanned_at` wins, later becomes a duplicate ScanRecord.

### Semester report aggregation

```
events_run          = COUNT(Event WHERE status IN (completed, reported)
                              AND starts_at BETWEEN semester bounds)
total_participation = COUNT(Registration WHERE attended)
unique_students     = COUNT(DISTINCT Registration.student_id
                            WHERE attended AND student_id IS NOT NULL)
external            = COUNT(DISTINCT external_participant_id WHERE attended)
avg_attendance      = total_participation / events_run
```

**`unique_students` is the headline figure.** 20 events attended by the same 80 students and 20 events reaching 600 both give `total_participation = 1600`. Only the DISTINCT count separates them. Verify this against a seeded dataset with known overlap — do not assume the query is right because it runs.

### Budget lifecycle

```
BudgetTemplate.heads → BudgetLine rows seeded on proposal
  amount_requested: lump_sum | rate × expected_attendance | rate × days
  contingency line appended at template percentage

Submit  → ApprovalRequest; routing: amount > threshold ? [Dean, VC] : [Dean]
Approve → amount_sanctioned per line (may be reduced per head)
Settle  → amount_spent + ReceiptDocument per line
          blocked above receipt threshold with no document
          variance_note required where spent > sanctioned
```

Receipts attach **per budget line**, never bundled at event level. Replacements supersede, never overwrite.

### Venue reassignment

Dean sees a master calendar of all venues. Reassignment must be **atomic** — release old booking and create new one in one transaction. Two steps leaves a window where the slot is held by both events or neither.

---

## 6. Roles and what each can do

| Role | Key permissions |
|---|---|
| Student | Own registrations, own attendance, own profile QR. Nothing else. |
| Club member | Club roster and internals. **No budget visibility.** |
| Organiser | Attendee identities for **their own event only**, time-bound |
| President / VP | Roster + **role assignment**, budget visibility, submit proposals |
| Treasurer | Budget visibility, spend entry, receipts. **Cannot assign roles.** |
| Dean of Student Affairs | Approves everything; all clubs, budgets, venues, aggregates |
| Vice-Chancellor | Above-threshold budgets, fests, semester report. No individual records. |

**No club role approves its own budget.** Approval sits with the Dean.

---

## 7. Definition of Done

- [ ] Merged to main, CI green
- [ ] Tests written by you, reviewed by A8
- [ ] Permissions enforced server-side and proven with a wrong-role token test
- [ ] OpenAPI regenerated if the contract changed
- [ ] Notifications only in-app and email
- [ ] No personal data exposed beyond the role's defined scope
- [ ] Audit log entry for any consequential change
- [ ] Decision Log updated if a decision changed

---

## 8. How to work

1. **Read before writing.** Confirm the relevant section of the PRD, Event Flows and Database documents before implementing.
2. **State your plan first** — files you will create or modify, endpoints, tests. Wait for confirmation on anything touching a boundary.
3. **Small commits**, each independently reviewable.
4. **Flag, don't guess.** If a spec is ambiguous or contradicts another document, stop and say so. Guessing produces plausible code that encodes the wrong rule, which is worse than a delay.
5. **Report against the checklist** for your phase, not in prose.

---

## 9. Known open questions

These are genuinely unresolved. If your work depends on one, **stop and ask** — do not assume a value.

- Budget threshold escalating to the Vice-Chancellor
- Whether a third approval gate exists for fests between Dean and VC
- Venue precedence rule when two events clash
- Receipt-mandatory threshold per budget line
- Whether PRN is the canonical identifier for the profile QR
- External participant retention period
- Cover when the Dean is unavailable

---

## 10. Your assignment

```
ASSIGNED_ROLE:  [ A0 Orchestrator | A1 Data & Migrations |
                  A2 Backend Clubs & Events | A3 Backend Participation |
                  A4 Backend Budget & Approvals | A5 Backend Reporting |
                  A6 Frontend Student & Organiser | A7 Frontend Staff |
                  A8 QA & Integrity ]

CURRENT_PHASE:  [ P0 Foundation | P1 Clubs Events Approvals |
                  P2 Participation | P3 Budget & Reporting |
                  P4 Fests & Venues ]
```

**Your owned directory:**

```
A1  backend/*/models.py, migrations/, fixtures/
A2  backend/clubs/, backend/events/   (excluding models.py)
A3  backend/participation/            (excluding models.py)
A4  backend/budget/, backend/governance/  (excluding models.py)
A5  backend/reporting/
A6  frontend/src/student/, frontend/src/organiser/
A7  frontend/src/staff/, Django admin config
A8  tests/ across all apps
A0  contracts, frontend/src/shared/, review and merge
```

**Start by:** confirming your role and phase, listing the checklist items you own from the Development Plan, and stating your plan for the first item. Do not begin implementation until that plan is confirmed.
