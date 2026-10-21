<!-- converted from Database_And_Data_Flow.docx -->

TECHNICAL DOCUMENT
Database & Data Flow
Clubs & Events Application
Schema, relationships, data flows, aggregation and retention
Version 1.0  ·  Draft
Django 5.x · Django REST Framework · PostgreSQL

# Table of Contents



# 1. Scope & Conventions
This document specifies the data layer for the Clubs & Events module: every table it owns, how those tables relate, how data moves through the system, how reporting figures are derived, and how long data is kept. It is the companion to the Clubs & Events PRD and the Event Flows document.
## 1.1 Platform
| Layer | Choice |
| --- | --- |
| Database | PostgreSQL |
| ORM and migrations | Django ORM with built-in migrations |
| API | Django REST Framework |
| File storage | S3-compatible object store; database holds references, never binary data |
| Background jobs | Celery for report generation, notification dispatch and scheduled purges |
| Cache | Redis for dashboard aggregates and scan-station lookups |
## 1.2 Conventions used throughout
- Primary keys. Every table has a UUID primary key. UUIDs avoid exposing record counts in URLs and make merging data across environments safe.
- Timestamps. Every table carries created_at and updated_at, set automatically.
- Soft deletion. Records that carry history — clubs, events, memberships — are archived with a status change, never hard-deleted. Only external participant data is genuinely purged, and only on schedule.
- Money. Stored as NUMERIC(12,2), never floating point. All amounts in INR.
- Enumerations. Stored as short text with a database-level CHECK constraint rather than integer codes, so raw table dumps stay readable.
- Time zone. All timestamps stored in UTC, rendered in IST.
## 1.3 What this module does not own
The module reads from the portal's shared core but never writes to it.
| Table | Owner | How it is used here |
| --- | --- | --- |
| Student | Portal core (SIS) | Referenced by foreign key for membership, registration and attendance. Never modified by this module. |
| User / auth | Portal core | Identity and login; roles for this module are layered on top. |
| Department / Programme | Portal core | Read for reporting splits. |
| AcademicCalendar / Semester | Portal core | Read to bound semester reports and block exam-period bookings. |
One-way dependency: club participation never writes into a student's academic record. This keeps the module's data self-contained and means a fault here can never corrupt institutional records.
# 2. Data Domains
Twenty-two tables across six domains.
| Domain | Tables | Purpose |
| --- | --- | --- |
| Clubs & people | Club, Membership, OfficeBearerTerm, ClubSocialHandle | Who the clubs are and who belongs to them |
| Events & fests | Fest, FestRole, Event, EventTemplate, Task, Volunteer, Sponsor, Venue, VenueBooking | What is being run |
| Participation | Registration, ExternalParticipant, StudentQRToken, EventPass, ScanRecord | Who took part — the source of every reported figure |
| Money | BudgetTemplate, BudgetLine, ReceiptDocument | What it cost |
| Evidence | EventPhoto, EventSocialPost, EventReport, Feedback | What it produced |
| Governance | ApprovalRequest, ApprovalStep, AuditLog | Who decided what, and when |
## 2.1 Relationship map
Club ──< Membership >── Student            (many-to-many over time)
Club ──< OfficeBearerTerm >── Student      (dated role history)
Club ──< Event
Fest ──< Event                             (optional parent; NULL = standalone)
Fest ──< FestRole >── Student

Event ──< Registration >── Student         (internal participants)
Event ──< Registration >── ExternalParticipant  (fest visitors)
Registration ──1 EventPass                 (one-time code)
Student ──1 StudentQRToken                 (persistent profile code)
Registration ──< ScanRecord                (every scan attempt, including failures)

Event ──< BudgetLine ──< ReceiptDocument
BudgetTemplate ──< (seeds) BudgetLine

Event ──< EventPhoto
Event ──< EventSocialPost
Event ──1 EventReport
Event ──< Feedback

ApprovalRequest ──< ApprovalStep           (generic; targets Event, Fest, Club or Budget)

# 3. Schema
## 3.1 Club
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No | Primary key |
| name | VARCHAR(120) | No | Unique |
| slug | SLUG | No | Unique; used in URLs |
| category | ENUM | No | technical / cultural / sports / social_service / literary |
| description | TEXT | Yes | Public profile text |
| logo_url | VARCHAR | Yes | Object-store reference |
| status | ENUM | No | proposed / active / dormant / archived |
| founded_on | DATE | Yes | Set on approval |
| annual_budget_envelope | NUMERIC(12,2) | Yes | Sanctioned yearly ceiling |
| dormant_after_days | INTEGER | Yes | Overrides the institution default |
| last_event_at | TIMESTAMP | Yes | Denormalised for the dormancy check |
Note: last_event_at is deliberately denormalised. Dormancy is checked across every club on each dashboard load, and recomputing it from the events table each time is wasteful for a value that changes only when an event completes.
## 3.2 Membership
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No | Primary key |
| club_id | FK Club | No | Cascade on club archive |
| student_id | FK Student | No | Portal core reference |
| role | ENUM | No | member / core / treasurer / secretary / vice_president / president |
| joined_on | DATE | No |  |
| ended_on | DATE | Yes | NULL means currently active |
| assigned_by_id | FK Student | Yes | Who granted the role — required for role changes above member |
| status | ENUM | No | pending / active / declined / ended |
- Unique constraint on (club_id, student_id) where ended_on IS NULL — a student holds one active membership per club.
- Role drives permissions directly; there is no separate permission table for club roles.
- Only president and vice_president may write the role field. Enforced in the API layer, not only the UI.
## 3.3 OfficeBearerTerm
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| club_id | FK Club | No |  |
| student_id | FK Student | No |  |
| position | ENUM | No | president / vice_president / treasurer / secretary |
| term_start | DATE | No |  |
| term_end | DATE | Yes | NULL while serving |
| handover_completed_at | TIMESTAMP | Yes | Set when the outgoing bearer confirms handover |
Why this is separate from Membership: Membership answers who holds a role now; OfficeBearerTerm answers who held it in 2024. Overwriting the role field would erase the history that makes handover and institutional memory work.
## 3.4 ClubSocialHandle
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| club_id | FK Club | No |  |
| platform | ENUM | No | instagram / linkedin |
| handle | VARCHAR(120) | No | Official account name |
| verified_at | TIMESTAMP | Yes | Set when the Student Life Office confirms it |
## 3.5 Fest
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| name | VARCHAR(160) | No |  |
| edition | VARCHAR(20) | Yes | e.g. 1.0 |
| theme | VARCHAR(200) | Yes |  |
| starts_on / ends_on | DATE | No | Date window sub-events inherit |
| hero_image_url | VARCHAR | Yes | Fest page banner |
| status | ENUM | No | draft / submitted / dean_approved / vc_approved / live / completed / archived |
| budget_envelope | NUMERIC(12,2) | Yes | Sanctioned at fest level |
| allows_external | BOOLEAN | No | Default true for inter-college fests |
| public_page_slug | SLUG | Yes | Unique; the shareable link |
Note on status: the fest status enum carries two approval states because a fest passes two gates — Dean, then Vice-Chancellor. Standard events have one.
## 3.6 Event
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| title | VARCHAR(200) | No |  |
| club_id | FK Club | No | Organising club |
| fest_id | FK Fest | Yes | NULL for standalone events |
| template_id | FK EventTemplate | Yes | What pre-filled it |
| category | ENUM | No | Inherited from club, overridable |
| starts_at / ends_at | TIMESTAMP | No |  |
| venue_id | FK Venue | Yes |  |
| capacity | INTEGER | Yes | NULL means uncapped |
| registration_closes_at | TIMESTAMP | Yes |  |
| allows_teams | BOOLEAN | No | Competition entries |
| status | ENUM | No | draft / submitted / approved / published / live / completed / reported / cancelled / rejected |
| expected_attendance | INTEGER | Yes | Drives per-head budget calculations |
| actual_attendance | INTEGER | Yes | Denormalised from Registration on completion |
| cancelled_reason | TEXT | Yes | Required when status is cancelled |
| created_by_id | FK Student | No | Organiser |
- CHECK constraint: ends_at must be later than starts_at.
- CHECK constraint: cancelled_reason must be present when status is cancelled.
- An event inheriting a fest_id inherits branding at render time; the fest date window is validated, not copied.
## 3.7 Registration
The single most important table in the system. Every participation figure in the semester report is derived from it.
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| event_id | FK Event | No |  |
| student_id | FK Student | Yes | NULL for external participants |
| external_participant_id | FK ExternalParticipant | Yes | NULL for internal students |
| registered_at | TIMESTAMP | No |  |
| source | ENUM | No | pre_registered / spot / manual |
| attended | BOOLEAN | No | Default false |
| checked_in_at | TIMESTAMP | Yes | NULL until scanned |
| checked_in_by_id | FK Student | Yes | Operator who processed the scan |
| station_id | VARCHAR(60) | Yes | Which scan station |
| waitlisted | BOOLEAN | No | Default false |
| team_name | VARCHAR(120) | Yes | Competition entries |
| team_captain_id | FK Registration | Yes | Self-reference for team members |
| custom_fields | JSONB | Yes | Answers to the event's custom form |
| cancelled_at | TIMESTAMP | Yes | Student withdrew, or event cancelled |
- CHECK constraint: exactly one of student_id or external_participant_id is set, never both and never neither.
- Unique constraint on (event_id, student_id) where cancelled_at IS NULL — prevents double registration and is what makes duplicate scans detectable.
- custom_fields is JSONB because each event defines its own form; a fixed column set cannot serve a t-shirt size, a dietary preference and a skill level at once.
attended, not registered: every reported figure counts rows where attended is true. Registered-but-absent rows stay in the table because no-show rate is itself a useful signal, but they must never be counted as participation.
## 3.8 ExternalParticipant
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| fest_id | FK Fest | No | External registration exists only for fests |
| full_name | VARCHAR(160) | No |  |
| college | VARCHAR(200) | No |  |
| email | VARCHAR(200) | No |  |
| phone | VARCHAR(20) | No |  |
| registration_ref | VARCHAR(20) | No | Unique; quoted at the desk |
| qr_token | VARCHAR(64) | No | Signed; emailed as a QR |
| purge_after | DATE | No | Set on creation from the retention policy |
Deliberately a separate table: external participants are not students and must never enter the student directory. Keeping them apart makes the retention purge a single scoped delete rather than a risky filtered operation across student records.
## 3.9 StudentQRToken
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| student_id | FK Student | No | Unique — one active token per student |
| token | VARCHAR(64) | No | Signed opaque value; indexed for scan lookup |
| issued_at | TIMESTAMP | No |  |
| rotated_at | TIMESTAMP | Yes | Set when reissued |
| revoked | BOOLEAN | No | Default false |
- The token is opaque and signed. The PRN is never encoded in the QR in readable form, so photographing a code exposes no identifier.
- Rotation issues a new token and marks the old one revoked; old ScanRecord rows keep their reference for audit.
## 3.10 EventPass
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| registration_id | FK Registration | No | Unique — one pass per registration |
| token | VARCHAR(64) | No | Signed; indexed |
| issued_at | TIMESTAMP | No |  |
| used_at | TIMESTAMP | Yes | Set on first successful scan |
| session_key | VARCHAR(40) | Yes | For multi-session fest events |
One-time semantics: a pass with used_at already set is rejected at the station. This is what stops a forwarded screenshot working twice.
## 3.11 ScanRecord
An append-only log of every scan attempt, successful or not.
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| event_id | FK Event | No |  |
| registration_id | FK Registration | Yes | NULL when the scan failed to resolve |
| scanned_token | VARCHAR(64) | Yes | What was presented |
| token_type | ENUM | Yes | profile_qr / event_pass |
| result | ENUM | No | accepted / duplicate / wrong_event / not_registered / unknown_code / spot_registered |
| station_id | VARCHAR(60) | Yes |  |
| operator_id | FK Student | Yes |  |
| scanned_at | TIMESTAMP | No | Device time |
| synced_at | TIMESTAMP | Yes | When an offline scan reached the server |
Why log failures too: the gap between scan attempts and successful check-ins is the capture-rate metric. Without failed attempts recorded, a station rejecting half the queue looks identical to a quiet event.
## 3.12 BudgetTemplate
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| name | VARCHAR(120) | No | e.g. Cultural Night |
| event_type | ENUM | No | Maps to EventTemplate |
| heads | JSONB | No | Array of standard heads with suggested amount and unit basis |
| contingency_pct | NUMERIC(5,2) | No | Added by default |
| is_active | BOOLEAN | No | Retired templates keep serving historical events |
heads structure: each entry holds label, suggested_amount, unit_basis (lump_sum / per_head / per_day), and whether it is mandatory. Stored as JSONB because the head list differs per template and is edited by the Student Life Office, not by developers.
## 3.13 BudgetLine
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| event_id | FK Event | No |  |
| fest_id | FK Fest | Yes | Set for fest-level shared costs not tied to a sub-event |
| head | VARCHAR(120) | No | e.g. Sound & lighting |
| unit_basis | ENUM | No | lump_sum / per_head / per_day |
| quantity | NUMERIC(10,2) | Yes | Head count or days |
| rate | NUMERIC(12,2) | Yes | Per unit |
| amount_requested | NUMERIC(12,2) | No | Computed or entered |
| amount_sanctioned | NUMERIC(12,2) | Yes | NULL until approved; may be reduced |
| amount_spent | NUMERIC(12,2) | Yes | NULL until settled |
| variance_note | TEXT | Yes | Required when spent exceeds sanctioned |
| settled_at | TIMESTAMP | Yes |  |
- Exactly one of event_id or fest_id carries the cost; a line is never charged to both.
- Variance is computed, never stored: requested minus sanctioned minus spent are all present, so any view can derive it.
## 3.14 ReceiptDocument
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| id | UUID | No |  |
| budget_line_id | FK BudgetLine | No | Attached per line, never bundled at event level |
| file_url | VARCHAR | No | Object store reference |
| file_type | ENUM | No | image / pdf |
| original_filename | VARCHAR(255) | Yes |  |
| amount_claimed | NUMERIC(12,2) | No |  |
| vendor | VARCHAR(200) | Yes |  |
| document_date | DATE | Yes | Date on the bill, not the upload date |
| uploaded_by_id | FK Student | No | Usually the Treasurer |
| uploaded_at | TIMESTAMP | No |  |
| superseded_by_id | FK ReceiptDocument | Yes | When an illegible document is replaced |
- Replacements supersede rather than overwrite, so the audit trail survives.
- A settlement rule blocks settled_at on lines above the configured amount with no attached document.
## 3.15 EventPhoto, EventSocialPost, EventReport, Feedback
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| EventPhoto.event_id | FK Event | No |  |
| EventPhoto.image_url | VARCHAR | No | Original retained; compressed variant served |
| EventPhoto.is_highlight | BOOLEAN | No | Marked for the semester report |
| EventPhoto.caption | VARCHAR(300) | Yes |  |
| EventSocialPost.platform | ENUM | No | instagram / linkedin |
| EventSocialPost.url | VARCHAR(500) | No | Stored only; never fetched via an API |
| EventSocialPost.screenshot_url | VARCHAR | Yes | Guards against later deletion |
| EventSocialPost.added_at | TIMESTAMP | No | Capture date, since links decay |
| EventReport.event_id | FK Event | No | Unique — one report per event |
| EventReport.outcomes | TEXT | No |  |
| EventReport.learnings | TEXT | Yes | Carried forward when the event is cloned |
| Feedback.event_id | FK Event | No |  |
| Feedback.rating | SMALLINT | No | CHECK between 1 and 5 |
| Feedback.comments | TEXT | Yes |  |
| Feedback.submitted_by_id | FK Student | Yes | Stored but never exposed to organisers |
Feedback anonymity is a query rule, not a storage rule: the submitter is stored so a student cannot respond twice, but organiser-facing serialisers must exclude it. This must be enforced in the API layer — storing it and hoping the UI hides it is how anonymity gets broken.
## 3.16 ApprovalRequest and ApprovalStep
One generic approval mechanism serves events, fests, budgets and new clubs.
| Field | Type | Null? | Notes |
| --- | --- | --- | --- |
| ApprovalRequest.id | UUID | No |  |
| ApprovalRequest.target_type | ENUM | No | event / fest / budget / club |
| ApprovalRequest.target_id | UUID | No | Generic reference |
| ApprovalRequest.submitted_by_id | FK Student | No |  |
| ApprovalRequest.submitted_at | TIMESTAMP | No | Start of the SLA clock |
| ApprovalRequest.status | ENUM | No | pending / approved / returned / rejected |
| ApprovalRequest.amount | NUMERIC(12,2) | Yes | Drives threshold routing |
| ApprovalStep.request_id | FK ApprovalRequest | No |  |
| ApprovalStep.sequence | SMALLINT | No | 1 = Dean, 2 = Vice-Chancellor |
| ApprovalStep.approver_role | ENUM | No | dean / vice_chancellor |
| ApprovalStep.approver_id | FK User | Yes | Who actually decided |
| ApprovalStep.decision | ENUM | Yes | approved / returned / rejected; NULL while pending |
| ApprovalStep.comment | TEXT | Yes | Required on return or rejection |
| ApprovalStep.decided_at | TIMESTAMP | Yes |  |
Chain configuration, confirmed: standard events and below-threshold budgets generate one step (Dean). Fests and above-threshold budgets generate two (Dean, then Vice-Chancellor). There is no faculty advisor step — the PRD draft still describes one and needs correcting.
A third fest gate: if a finance or registrar review exists between Dean and Vice-Chancellor, it is added as sequence 2 with the others shifting down. The table supports any chain length without schema change; only the configuration alters.
## 3.17 Supporting tables
| Table | Key fields | Purpose |
| --- | --- | --- |
| EventTemplate | event_type, default_tasks JSONB, default_form JSONB, budget_template_id | Pre-fills a new event proposal |
| Task | event_id, title, owner_id, due_offset_days, status | Checklist; due date computed backwards from event start |
| Volunteer | event_id, student_id, role, shift_start, shift_end | Crew roster |
| Sponsor | event_id or fest_id, name, amount, deliverables, status | Sponsorship obligations |
| Venue | name, capacity, facilities JSONB, controlled_by, is_bookable | Bookable spaces |
| VenueBooking | venue_id, event_id, starts_at, ends_at, status, buffer_before_min, buffer_after_min, reassigned_from_venue_id, reassigned_by_id, reassign_reason | Exclusion constraint prevents overlap; reassignment history retained |
| FestRole | fest_id, student_id, role, edition | Time-bound fest team |
| AuditLog | actor_id, action, target_type, target_id, payload JSONB, created_at | Append-only record of every consequential write |
Venue double-booking: enforced by a PostgreSQL exclusion constraint on the time range, not by application checks. Two organisers submitting simultaneously is exactly the case application-level checking misses. The range compared includes the setup and clearing buffers, so back-to-back bookings do not collide in practice.
Reassignment is atomic: moving an event to a new venue releases the old booking and creates the new one in a single transaction. Doing it in two steps leaves a window where the slot is held by both events or by neither.

# 4. Indexes & Constraints
## 4.1 Indexes that matter
| Index | Why |
| --- | --- |
| StudentQRToken (token) unique | Every scan is a lookup on this. Must be instant at the door. |
| EventPass (token) unique | Same path, same requirement. |
| Registration (event_id, attended) | Drives live counts and every attendance aggregate. |
| Registration (student_id, attended) | Unique-students-reached queries across a semester. |
| Registration (event_id, student_id) unique partial | Where cancelled_at IS NULL — prevents double registration. |
| Event (starts_at) | Calendar and feed queries. |
| Event (club_id, status) | Club dashboards and dormancy checks. |
| Event (fest_id) | Sub-event roll-ups. |
| VenueBooking (venue_id, starts_at) | Master venue calendar and clash detection across all venues. |
| BudgetLine (event_id) | Settlement and variance views. |
| ScanRecord (event_id, scanned_at) | Capture-rate analysis; append-heavy so keep indexes minimal. |
| ApprovalRequest (status, submitted_at) | Dean dashboard: pending items sorted by age. |
## 4.2 Integrity rules enforced in the database
- Registration: exactly one of student_id or external_participant_id.
- Registration: unique per event per student while not cancelled.
- BudgetLine: exactly one of event_id or fest_id.
- Event: ends_at after starts_at; cancelled_reason present when cancelled.
- Feedback: rating between 1 and 5; one response per student per event.
- VenueBooking: exclusion constraint on overlapping time ranges per venue.
- Membership: one active membership per student per club.
Enforce at the database, not only the API: these rules protect figures that management will act on. Application-level checks fail under concurrency — two simultaneous requests both pass validation, then both write. Constraints do not have that failure mode.
# 5. Data Flows
## 5.1 Registration
Student taps Register
→ capacity check against COUNT(Registration WHERE cancelled_at IS NULL)
→ if full: Registration created with waitlisted = true
→ else:    Registration created, source = pre_registered
→ EventPass generated with signed token
→ notification queued (in-app + email) via Celery
→ pass rendered in app and emailed
A cancellation sets cancelled_at, frees the capacity slot, and triggers waitlist promotion in the same transaction.
## 5.2 Check-in at the scan station
Camera reads code
→ resolve token: EventPass.token OR StudentQRToken.token

EventPass found, used_at NULL      → accept; set used_at
EventPass found, used_at set       → reject: duplicate
ProfileQR found, registered        → accept
ProfileQR found, not registered    → create Registration (source = spot); accept
ProfileQR found, already attended  → reject: duplicate
Token resolves to another event    → reject: wrong_event
Token unknown                      → reject: unknown_code

Every branch writes a ScanRecord with its result
On accept: Registration.attended = true, checked_in_at, operator, station
### Offline behaviour
- The station caches the event's registration list and valid tokens before going offline.
- Scans are queued locally with device timestamps.
- On reconnection each queued scan is replayed; synced_at is set and duplicates are resolved server-side.
Conflict rule for offline sync: if the same student was checked in at two stations while both were offline, the earliest scanned_at wins and the later becomes a duplicate ScanRecord. The attendance count stays correct because the unique constraint on Registration allows only one attended row.
## 5.3 Budget lifecycle
BudgetTemplate.heads  →  BudgetLine rows seeded on the event proposal
amount_requested computed: lump_sum | rate × expected_attendance | rate × days
contingency line appended at template percentage

Submit  → ApprovalRequest (target = budget, amount = SUM(requested))
→ routing: amount > threshold ? [Dean, VC] : [Dean]

Approve → amount_sanctioned written per line (may differ from requested)
Settle  → amount_spent + ReceiptDocument per line
→ blocked if amount_spent > receipt threshold and no document attached
→ variance_note required where spent > sanctioned
## 5.4 Event completion
Event ends
→ actual_attendance denormalised: COUNT(Registration WHERE attended)
→ Club.last_event_at updated
→ feedback surveys dispatched to attended participants only
→ EventReport draft created, pre-filled with attendance and sanctioned budget
→ report submission blocked until >= 1 EventPhoto exists
→ status: completed → reported
## 5.5 Semester report generation
Run as a Celery job, not in the request cycle. The report is assembled from Registration, Event, BudgetLine and EventPhoto within the semester date bounds read from the portal core.
events_run        = COUNT(Event WHERE status IN (completed, reported)
AND starts_at BETWEEN semester bounds)

total_participation = COUNT(Registration WHERE attended
AND event IN those events)

unique_students   = COUNT(DISTINCT Registration.student_id
WHERE attended AND student_id IS NOT NULL)

external_participants = COUNT(DISTINCT external_participant_id
WHERE attended)

avg_attendance    = total_participation / events_run
by_category       = GROUP BY Event.category
by_club           = GROUP BY Event.club_id
budget            = SUM(requested), SUM(sanctioned), SUM(spent)
highlights        = EventPhoto WHERE is_highlight, ordered by attendance
The distinction that matters: total_participation counts rows; unique_students counts distinct people. Twenty events attended by the same eighty students and twenty events reaching six hundred produce the same total_participation. Only the DISTINCT query separates them, and it is the figure the report leads with.
Own students and external participants are counted separately, never summed. Combining them produces a number that describes neither internal reach nor external draw.
## 5.6 Capture-rate check
A quality metric on the data itself, protecting every figure above.
capture_rate = COUNT(Registration WHERE attended AND source != 'manual')
/ COUNT(Registration WHERE attended)

A club with a persistently low ratio is marking attendance by hand
rather than scanning — visible on the Dean's dashboard.
# 6. Retention, Privacy & Access
## 6.1 Retention
| Data | Retention | Mechanism |
| --- | --- | --- |
| Participation records (students) | Retained while the student is enrolled | Archived with the student record; never purged mid-course |
| External participant details | Fest duration plus a defined period | purge_after date; scheduled Celery job deletes the row |
| Event photos | Retained indefinitely as institutional record | Removal on request per the photo-consent notice |
| Receipts | Retained per the institution's finance policy | Never deleted by the module |
| ScanRecord | Rolled up after one year, detail discarded | Aggregates retained; raw scan log trimmed |
| AuditLog | Retained in full | Append-only, never edited |
## 6.2 Access scoping
| Role | Can read | Cannot read |
| --- | --- | --- |
| Student | Own registrations, attendance, feedback | Anyone else's participation; any budget data |
| Club member | Club roster, club events, club photos | Budget figures; other clubs' internals |
| Organiser | Attendee identities for their own event, time-bound | Other clubs' events; institution-wide participation |
| President / VP / Treasurer | Own club's budget, roster, all own events | Other clubs' budgets |
| Dean | All clubs, all events, all budgets, aggregates, all venue bookings | — |
| Vice-Chancellor | Aggregates and above-threshold budget requests | Individual student participation records |
Attendee identity is the sensitive surface: an organiser needs names and PRNs at the door, which makes the live attendance view the most privacy-exposed screen in the module. Scope it to the organiser's own event and a limited window afterwards, and log access.
## 6.3 DPDP alignment
- Purpose limitation: participation data supports student-life reporting; it is not used for academic assessment.
- Notice at registration covers both participation recording and event photography.
- Data minimisation: external participants give only what registration and contact require.
- Retention is defined per category above rather than left open-ended.
# 7. Seeding & Migration
- Seed data required at launch: club categories, venues, budget templates, event templates, approval chain configuration, thresholds.
- Existing clubs are imported from whatever list the Student Life Office holds, with status set to active and last_event_at left NULL.
- Historical events are not back-loaded. The first semester's figures begin from live data; attempting to reconstruct past attendance would produce numbers nobody can stand behind.
Say this in the first report: because history is not back-loaded and some activity will still run outside the system early on, the first semester understates reality. Stating that in the report protects the credibility of every figure that follows.
# 8. Open Points
- Budget threshold amount that routes an approval to the Vice-Chancellor.
- Receipt-mandatory threshold per budget line.
- Retention period for external participant data after a fest closes.
- Whether a third approval gate exists between Dean and Vice-Chancellor for fests.
- Whether PRN or another identifier is the canonical student key for the profile QR.
- Whether cancelled events with committed spend require Dean sign-off on settlement.
- Venue precedence rule when two events clash: first submitted, largest attendance, fest priority, or Dean discretion.
- Default setup and clearing buffer per venue type.