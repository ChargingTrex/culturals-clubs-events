# Clubs & Events module — data model and API reference

Source of truth: `clubs-and-culturals-platform/app/backend/` (Django 5 + DRF) and its browser mirror `web-app/src/`. Everything below is transcribed from model, serializer, view, service and migration code; nothing is inferred from documents. Base path for every route is `/api/v1/`. Paths have **no trailing slash** (`DefaultRouter(trailing_slash=False)`). All responses are JSON; every error is RFC 9457 `application/problem+json` (`common/errors.py`).

Conventions that apply everywhere:

- Primary keys are UUIDs; every row has `created_at` / `updated_at` (`common/models.py: UUIDModel`). `User` declares the same three fields itself.
- Money is `DecimalField(max_digits=12, decimal_places=2)` (`MONEY`) and is serialised as a **string** (`"12000.00"`).
- Timestamps are stored UTC (`TIME_ZONE="UTC"`), rendered ISO-8601.
- Auth: `Authorization: Bearer <JWT>`; the view layer reads claims only (`identity/authentication.py: AuthContext`), never the DB.
- Pagination on list endpoints: `{count, next, previous, results}`, `page_size` query param, default 25, max 200 (`common/pagination.py`).
- Thresholds (`config/settings.py`, env-overridable): `VC_BUDGET_THRESHOLD=50000`, `RECEIPT_THRESHOLD=5000`, `VENUE_BUFFER_MINUTES=30`, `CONTINGENCY_PERCENT=8`, `APPROVAL_CHAIN=["cultural_society","dean"]`, `INTEGRATION_MODE="local"`, `DEMO_MODE=False` (refused when `DEBUG=False`), `QR_SIGNING_KEYS` (`v1:<secret>[,v2:...]`, dev default under DEBUG), `QR_ACTIVE_KEY_ID="v1"`, `TOKEN_LIFETIMES = {access: 15 min, refresh: 7 d, staff_session_cap: 8 h, scan_station_grace: 4 h}`, `APPROVAL_SLA_HOURS=48` (hours at one gate before an `ApprovalRequest` is `escalated`), `DELEGATION_MAX_DAYS=30` (longest `Delegation` window), `DORMANCY_DAYS=180` (a club with no `last_activity_at` for this long is flagged dormant by the `flag-dormant` job), `ORGANISER_GRACE_HOURS=4` (default life of an organiser grant past `event.ends_at`; the hard cap, event end + 7 days, is the constant `ORGANISER_GRANT_CAP` in `events/views.py`), `JOBS_TOKEN=""` (shared secret for `/api/v1/jobs/{name}`; empty **or shorter than 32 characters** disables the HTTP triggers with 503), `DISPLAY_TIME_ZONE="Asia/Kolkata"` (not env-overridable; decides the envelope year).
- Hosting env (`config/settings.py`): `DJANGO_ALLOWED_HOSTS` (default `localhost,127.0.0.1`), `CORS_ALLOWED_ORIGINS` (comma list, default `http://localhost:5173,http://127.0.0.1:5173`; `CORS_ALLOW_CREDENTIALS=True`), `CSRF_TRUSTED_ORIGINS` (comma list, default empty — only the Django admin and other cookie-authenticated POSTs need it; the bearer-token API is unaffected).

---

## 1. Entity relationship diagram

```mermaid
erDiagram
    User ||--o| Student : "student_record"
    User ||--o{ RefreshToken : "refresh_tokens"
    User ||--o{ Notification : "notifications"
    User ||--o{ Event : "events_created"
    User ||--o{ ApprovalRequest : "approvals_submitted"
    User ||--o{ Registration : "check_ins"
    User ||--o{ ScanRecord : "scans_taken"
    Student ||--o{ Membership : "memberships"
    Student ||--o{ Registration : "registrations"
    Student ||--o{ StudentQRToken : "qr_tokens"
    Club ||--o{ Membership : "memberships"
    Club ||--o{ Event : "events"
    Club ||--o{ Fest : "fests"
    Membership ||--o{ RoleChange : "changes"
    Fest ||--o{ Event : "events"
    Fest ||--o| Budget : "budget"
    Venue ||--o{ Event : "events"
    Venue ||--o{ VenueReassignment : "moves_out"
    Venue ||--o{ VenueReassignment : "moves_in"
    Event ||--o{ VenueReassignment : "reassignments"
    Event ||--o{ Registration : "registrations"
    Event ||--o{ ScanRecord : "scan_records"
    Event ||--o| Budget : "budget"
    Event ||--o{ ApprovalRequest : "approval_requests"
    ExternalParticipant ||--o{ Registration : "registrations"
    Registration ||--o{ EventPass : "passes"
    Registration ||--o{ ScanRecord : "scans"
    Budget ||--o{ BudgetLine : "lines"
    BudgetLine ||--o{ ReceiptDocument : "receipts"
    ReceiptDocument |o--o| ReceiptDocument : "superseded_by"
    BudgetTemplate ||--o{ BudgetTemplateLine : "lines"
    ApprovalRequest ||--o{ ApprovalStep : "steps"
    User ||--o{ Delegation : "delegations_given"
    User ||--o{ Delegation : "delegations_received"
    User ||--o{ ApprovalStep : "steps_delegated (on_behalf_of)"
    User ||--o{ ClubBudgetEnvelope : "envelopes_set"
    Student ||--o{ JoinRequest : "join_requests"
    Student ||--o{ OfficeBearerTerm : "office_bearer_terms"
    Student ||--o{ EventOrganiser : "organiser_roles"
    Student ||--o{ Feedback : "feedback"
    Club ||--o{ JoinRequest : "join_requests"
    Club ||--o{ OfficeBearerTerm : "office_bearer_terms"
    Club ||--o{ ClubBudgetEnvelope : "envelopes"
    Event ||--o{ EventOrganiser : "organisers"
    Event ||--o{ Feedback : "feedback"
    Registration ||--o{ Feedback : "feedback"

    User {
        uuid id PK
        string email UK
        string display_name
        string full_name
        json global_roles
        bool mfa_enabled
        string status "provisional|active|on_leave|graduated|withdrawn|suspended"
        bool is_staff
        bool is_active
    }
    Student {
        uuid id PK
        uuid user_id FK "OneToOne"
        string prn UK
        string full_name
        string department
        string programme
        int year_of_study "1..5 or null"
        string status "same enum as User"
    }
    ReferenceCode {
        uuid id PK
        string kind "department|programme"
        string code
        string name
        bool active
    }
    Semester {
        uuid id PK
        string name UK
        date starts_on
        date ends_on
        bool is_current
    }
    RefreshToken {
        uuid id PK
        uuid user_id FK
        string token_hash UK
        uuid family
        datetime expires_at
        datetime consumed_at
        datetime revoked_at
        bool mfa
    }
    Club {
        uuid id PK
        string name UK
        string slug UK
        string tag
        string category "cultural|literary|technical|sports|social"
        string instagram_handle
        string status "active|dormant|archived"
        string join_mode "open|approval"
        datetime last_activity_at
    }
    Membership {
        uuid id PK
        uuid club_id FK
        uuid student_id FK
        string role "club_president..club_member"
        datetime joined_at
        datetime ended_at "null = active"
    }
    RoleChange {
        uuid id PK
        uuid membership_id FK
        uuid actor_sub
        string actor_label
        string from_role
        string to_role
        string reason
    }
    JoinRequest {
        uuid id PK
        uuid club_id FK
        uuid student_id FK
        string state "pending|accepted|declined"
        uuid decided_by_id FK "nullable"
        datetime decided_at
        string note
    }
    OfficeBearerTerm {
        uuid id PK
        uuid club_id FK
        uuid student_id FK
        string role "president|vice_president|treasurer|secretary"
        datetime starts_at
        datetime ends_at "null = open-ended"
        uuid created_by_id FK "nullable"
    }
    Venue {
        uuid id PK
        string name UK
        int capacity
        string location
        bool active
    }
    Fest {
        uuid id PK
        string name UK
        uuid club_id FK
        date starts_on
        date ends_on
        string status "EventStatus enum"
    }
    Event {
        uuid id PK
        string title
        uuid club_id FK
        uuid fest_id FK "nullable"
        string kind "performance|workshop|competition|exhibition|talk"
        uuid venue_id FK
        datetime starts_at
        datetime ends_at
        int capacity
        int expected_attendance
        string status "EventStatus enum"
        datetime cancelled_at
        string cancelled_reason
        int photo_count
        json social_links
        datetime closed_at
        datetime submitted_at
        uuid created_by_id FK "nullable"
    }
    VenueReassignment {
        uuid id PK
        uuid event_id FK
        uuid from_venue_id FK
        uuid to_venue_id FK
        string reason
        uuid actor_sub
        string actor_label
    }
    EventOrganiser {
        uuid id PK
        uuid event_id FK
        uuid student_id FK
        uuid assigned_by_id FK "nullable"
        datetime ends_at "null = until removed"
    }
    Registration {
        uuid id PK
        uuid event_id FK
        uuid student_id FK "xor external"
        uuid external_id FK "xor student"
        string source "pre_registered|spot|manual|imported"
        datetime registered_at
        datetime cancelled_at
        bool waitlisted
        bool attended
        datetime checked_in_at
        uuid checked_in_by_id FK
        string station_id
        string department_at_event
        string programme_at_event
        int year_at_event
    }
    ExternalParticipant {
        uuid id PK
        string full_name
        string institution
        string email
        string phone
        date purge_after
        datetime purged_at
    }
    StudentQRToken {
        uuid id PK
        uuid student_id FK
        string token UK
        int version
        string key_id
        datetime revoked_at
    }
    EventPass {
        uuid id PK
        uuid registration_id FK
        string token UK
        datetime used_at
        datetime revoked_at
        string key_id
    }
    ScanRecord {
        uuid id PK
        uuid event_id FK
        uuid registration_id FK "nullable"
        string scanned_token "64-char prefix"
        string result "ScanResult enum"
        string station_id
        uuid operator_id FK "nullable"
        datetime scanned_at
        datetime synced_at
        string offline_ref
        string detail
    }
    BudgetTemplate {
        uuid id PK
        string name UK
        string event_kind
        int contingency_percent
    }
    BudgetTemplateLine {
        uuid id PK
        uuid template_id FK
        string head
        string basis "lump_sum|per_head|per_day"
        decimal rate
        int position
    }
    Budget {
        uuid id PK
        uuid event_id FK "OneToOne xor fest"
        uuid fest_id FK "OneToOne xor event"
        string stage "BudgetStage enum"
        datetime settled_at
        bool is_nil
        string nil_reason
        datetime nil_declared_at
        uuid nil_declared_by_sub
        string nil_declared_by_label
    }
    BudgetLine {
        uuid id PK
        uuid budget_id FK
        string head
        string basis
        decimal amount_requested
        decimal amount_sanctioned "null until approver acts"
        decimal amount_spent
        string variance_note
        int position
    }
    ReceiptDocument {
        uuid id PK
        uuid line_id FK
        string file_key
        string file_name
        string content_type
        int byte_size
        string sha256
        decimal amount
        string vendor
        date document_date
        uuid uploaded_by_sub
        uuid superseded_by_id FK "OneToOne self"
    }
    ClubBudgetEnvelope {
        uuid id PK
        uuid club_id FK
        int year
        decimal amount
        uuid set_by_id FK "nullable"
        string set_by_label
    }
    ApprovalRequest {
        uuid id PK
        uuid event_id FK
        json stages "ordered stage names"
        string current_stage "cultural_society|dean|vc"
        string state "pending|approved|returned|rejected|withdrawn"
        decimal amount_requested
        bool requires_vc
        string vc_reason
        uuid submitted_by_id FK "nullable"
        datetime resolved_at
        datetime stage_entered_at
    }
    ApprovalStep {
        uuid id PK
        uuid request_id FK
        string stage
        string decision "approve|return|reject"
        string comment
        uuid actor_sub
        string actor_label
        string actor_role
        bool mfa_verified
        decimal amount_sanctioned
        uuid on_behalf_of_id FK "nullable"
        string on_behalf_of_label
    }
    Delegation {
        uuid id PK
        string stage "cultural_society|dean|vc"
        uuid principal_user_id FK
        uuid delegate_user_id FK
        datetime starts_at
        datetime ends_at
        string reason
        uuid created_by_id FK "nullable"
        datetime revoked_at
        string revoked_by_label
    }
    Feedback {
        uuid id PK
        uuid event_id FK
        uuid registration_id FK
        uuid student_id FK
        int rating "1..5"
        bool would_recommend
        string comment
    }
    Notification {
        uuid id PK
        uuid user_id FK
        string subject
        string body
        string kind
        string link
        datetime read_at
    }
    AuditEntry {
        uuid id PK
        string actor_sub
        string actor_label
        string action
        string target_type
        string target_id
        json before
        json after
        string reason
    }
```

`reporting/` has no `models.py` and is not in `INSTALLED_APPS`; it only aggregates `Event`, `Registration`, `ScanRecord`, `ApprovalRequest` and `Club`. `jobs/` (wave 1) is in `INSTALLED_APPS` but has no models either: it updates `ExternalParticipant` and `Club`, and writes `Notification` and `AuditEntry` rows. `feedback/` (wave 1) has the one model above.

---

## 2. Entities

### Base model (`common/models.py`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| id | UUID | no | PK, `uuid4` default, not editable | on every model below unless stated |
| created_at | datetime | no | `auto_now_add` | |
| updated_at | datetime | no | `auto_now` | |

`MONEY = {"max_digits": 12, "decimal_places": 2}`.

### identity

**User** (`identity_user`; `AbstractBaseUser + PermissionsMixin`, not `UUIDModel` but declares the same `id/created_at/updated_at`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| email | EmailField | no | unique; `USERNAME_FIELD` | institutional address |
| personal_email | EmailField | blank | not unique | |
| display_name | char(80) | no | `REQUIRED_FIELDS` | defaults to `full_name` or email local part on save |
| full_name | char(160) | no | | single name field, never split |
| phone | char(20) | blank | | E.164 |
| global_roles | JSON list | no | default `[]` | strings from `GLOBAL_ROLES` |
| mfa_enabled | bool | no | default false | |
| status | char(16) | no | `Status`: provisional, active, on_leave, graduated, withdrawn, suspended; default active | `can_login` = `is_active and status in (active, on_leave, graduated)` |
| is_staff / is_active | bool | no | defaults false / true | Django admin flags |
| password, last_login, is_superuser, groups, user_permissions | | | | inherited from Django |

**Student** (`identity_student`, ordering `prn`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| user | OneToOne → User | no | PROTECT, related `student_record` | |
| prn | char(32) | no | unique; validated against `settings.PRN_REGEX` (`^[0-9]{2}[A-Z]{2,4}[0-9]{3,5}$`) | upper-cased and trimmed on save |
| full_name | char(160) | no | | |
| department | char(16) | no | code | from ReferenceCode list |
| programme | char(32) | no | code | |
| year_of_study | smallint | yes | CHECK `student_year_1_to_5` (1..5 or null) | |
| status | char(16) | no | same `Status` enum, default active | |

**ReferenceCode** (`identity_reference_code`): `kind` char(16) enum `department|programme`; `code` char(32); `name` char(160); `active` bool default true. UNIQUE (`kind`,`code`) `unique_code_per_kind`.

**Semester** (`identity_semester`, ordering `-starts_on`): `name` char(64) unique; `starts_on` date; `ends_on` date; `is_current` bool default false. CHECK `semester_ends_after_start` (`ends_on > starts_on`).

**RefreshToken** (`identity_refresh_token`): `user` FK CASCADE; `token_hash` char(64) unique (sha256 of raw); `family` UUID; `expires_at`; `consumed_at` null; `revoked_at` null; `mfa` bool. Indexes on `family` and (`user`,`revoked_at`). Rotated on use; replay revokes the family.

### clubs

**Club** (ordering `name`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| name | char(120) | no | unique | |
| slug | slug(140) | no | unique; read-only in API | not auto-generated by the model; set by seed/admin |
| tag | char(40) | blank | | "Music", "Dance" |
| category | char(16) | no | `Category`: cultural, literary, technical, sports, social | `under_cultural_society` = category in (cultural, literary) |
| description | text | blank | | |
| instagram_handle | char(64) | blank | | link capture only |
| status | char(16) | no | `Status`: active, dormant, archived; default active | DELETE sets archived (soft delete); `dormant` is set by the `flag-dormant` job and cleared by `services.touch_activity` |
| join_mode | char(16) | no | `JoinMode`: open, approval; default approval | writable via PUT/PATCH; switching approval → open accepts every pending `JoinRequest` on the spot (`services.settle_pending_on_open`, audited, student notified) |
| last_activity_at | datetime | yes | | read-only in the API. Set by `services.touch_activity`: event status reaching submitted/approved/published/live/completed/reported (`events/signals.py` post-save), self-service join, join accept, role change, handover. A touch on a `dormant` club flips it back to `active` (audit `club.reactivated`) |

**Membership** (ordering `club`,`role`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| club | FK Club | no | PROTECT | |
| student | FK Student | no | PROTECT | |
| role | char(32) | no | `ROLE_CHOICES` = club_president, club_vice_president, club_treasurer, club_secretary, club_core, club_member; default club_member | labels President, Vice-President, Treasurer, Secretary, Core team, Member |
| joined_at | datetime | no | auto_now_add | |
| ended_at | datetime | yes | | null = active (`is_active`) |

Constraints: partial UNIQUE (`club`,`student`) WHERE `ended_at IS NULL` → `one_active_membership_per_student_per_club`; partial UNIQUE (`club`) WHERE `role='club_president' AND ended_at IS NULL` → `one_active_president_per_club`. Index (`student`,`ended_at`).

**RoleChange** (ordering `-created_at`): `membership` FK CASCADE; `actor_sub` UUID; `actor_label` char(80); `from_role`, `to_role` char(32); `reason` char(280) blank. Also written by `apply_due_terms` (reason "Office-bearer term took effect", actor label `handover` when run by a job) and by `handover` (reason "Handover effective …").

**JoinRequest** (ordering `created_at`; PRD §5.2)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| club | FK Club | no | PROTECT | |
| student | FK Student | no | PROTECT | |
| state | char(16) | no | `State`: pending, accepted, declined; default pending | |
| decided_by | FK User | yes | SET_NULL | |
| decided_at | datetime | yes | | |
| note | char(280) | blank | | decider's note; set to "Already a member" when an accept finds a membership created by another route, "Club opened to all members" when settled by a `join_mode` switch |

Constraints: partial UNIQUE (`club`,`student`) WHERE `state='pending'` → `one_pending_join_request_per_student_per_club`. Index (`club`,`state`). Only written for clubs in `join_mode=approval`; an open club creates the `Membership` directly.

**OfficeBearerTerm** (ordering `-starts_at`; PRD §5.3/§5.18)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| club | FK Club | no | PROTECT | |
| student | FK Student | no | PROTECT | |
| role | char(32) | no | `Membership.ROLE_CHOICES`; the API only ever writes `OFFICE_BEARER_ROLES` = president, vice_president, treasurer, secretary | core/member have no term |
| starts_at | datetime | no | | |
| ends_at | datetime | yes | CHECK `office_bearer_term_ends_after_start` (`ends_at IS NULL OR ends_at > starts_at`) | null = open-ended |
| created_by | FK User | yes | SET_NULL | |

Index (`club`,`student`,`ends_at`). `is_current(now)` = `starts_at <= now < ends_at` (or no end). The term, not the Membership row, is what the token reads: `clubs/services.effective_role` returns the most senior current term for a (club, student) pair, `club_member` when every term has ended, and the Membership row's role only when the pair has no terms at all. `POST /memberships/{id}/role` closes the pair's current terms and opens one for the new office; `handover` closes the outgoing terms at `effective_at` and opens the incoming ones; `apply_due_terms` (management command, also run inside `handover` when `effective_at <= now`) rewrites `Membership.role` to match. **Open (B-17):** no scheduled job runs `apply_due_terms`, so after a future-dated handover's date passes the token and `services.current_office_bearers` are right but `GET /clubs/{id}/members` shows the stale row until the next handover or a manual `manage.py apply_due_terms`.

### events

**Venue** (ordering `name`): `name` char(120) unique; `capacity` positive int; `location` char(160) blank; `active` bool default true.

**Event** (ordering `starts_at`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| title | char(200) | no | | |
| club | FK Club | no | PROTECT | |
| fest | FK Fest | yes | SET_NULL | fest membership forces the VC gate |
| kind | char(20) | no | `Kind`: performance, workshop, competition, exhibition, talk; default performance | |
| description | text | blank | | |
| venue | FK Venue | no | PROTECT | |
| starts_at / ends_at | datetime | no | CHECK `event_ends_after_start` | |
| capacity | positive int | no | serializer: ≤ venue.capacity | |
| expected_attendance | positive int | no | serializer: ≤ capacity | drives per-head budget lines |
| status | char(16) | no | `EventStatus` (see §3); default draft | |
| cancelled_at | datetime | yes | | no endpoint sets it |
| cancelled_reason | char(280) | blank | CHECK `event_cancelled_needs_reason` | |
| photo_count | positive int | no | default 0 | set at close |
| social_links | JSON list | no | default `[]` | URLs, set at close |
| closed_at | datetime | yes | | |
| submitted_at | datetime | yes | | |
| created_by | FK User | yes | PROTECT | |

Indexes: (`status`,`starts_at`), (`club`,`starts_at`), (`venue`,`starts_at`). Status groups: `SLOT_HOLDING` = submitted, approved, published, live, completed, reported; `SLOT_CONFIRMED` = approved, published, live, completed, reported; `REPORTABLE` = completed, reported; `PUBLIC_STATUSES` (views) = published, live, completed, reported.

**Fest** (ordering `-starts_on`): `name` char(160) unique; `club` FK PROTECT; `starts_on`, `ends_on` date; `status` char(16) `EventStatus` default draft. No API endpoint creates or lists fests; `fest` is accepted as an id on event creation.

**VenueReassignment** (ordering `-created_at`): `event` FK CASCADE; `from_venue`, `to_venue` FK Venue PROTECT; `reason` char(280) required; `actor_sub` UUID; `actor_label` char(80).

**EventOrganiser** (ordering `created_at`; the `event_organiser:<event_id>` grant, B-00c)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| event | FK Event | no | CASCADE | |
| student | FK Student | no | PROTECT | need not be a member of the club |
| assigned_by | FK User | yes | SET_NULL | |
| ends_at | datetime | yes | | the API always sets one (default `event.ends_at + ORGANISER_GRACE_HOURS`, max `event.ends_at + 7 d`); null = until removed, legacy rows only |

Constraints: partial UNIQUE (`event`,`student`) WHERE `ends_at IS NULL` → `one_open_organiser_grant_per_student_per_event` (the API refuses a second *live* grant itself, since its rows always carry an end). Index (`student`,`ends_at`). `EventOrganiser.active()` = `ends_at IS NULL OR ends_at > now`; `active_event_ids(student)` feeds `identity/tokens.roles_for`, so an ended grant disappears from the token at the next refresh. DELETE on the grant sets `ends_at = now` rather than deleting the row.

**Venue booking constraint (Postgres only, migration `events/0004_venue_exclusion_constraint.py`).** `RunPython` guarded by `connection.vendor == "postgresql"`: `CREATE EXTENSION IF NOT EXISTS btree_gist`, then an `ExclusionConstraint` named `venue_confirmed_bookings_do_not_overlap` on `events_event`: `EXCLUDE USING gist (venue_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE status IN ('approved','published','live','completed','reported')` (the tuple `CONFIRMED` in the migration is a literal copy of `SLOT_CONFIRMED`). It is the floor (no literal overlap of confirmed bookings); the 30-minute buffer is applied by `events/services.assert_bookable` under a `select_for_update` on the `Venue` row in `EventViewSet.create`, `submit`, `reassign_venue` and the final `governance.decide` approval. On SQLite the migration is a no-op and the lock is all there is. The model's `Meta` does not declare the constraint, so `makemigrations --check` is clean on both vendors. The reverse migration drops the constraint `IF EXISTS` and leaves the extension.

### participation

**Registration** (ordering `-registered_at`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| event | FK Event | no | PROTECT | |
| student | FK Student | yes | PROTECT | exactly one of student/external |
| external | FK ExternalParticipant | yes | PROTECT (was CASCADE; `0003`) | a purge blanks the participant and never deletes the row |
| source | char(16) | no | `Source`: pre_registered, spot, manual, imported; default pre_registered | |
| registered_at | datetime | no | default now | |
| cancelled_at | datetime | yes | | never deleted; cancel sets this (idempotent: a second cancel is a no-op) |
| waitlisted | bool | no | default false; CHECK `waitlisted_never_attended` (`waitlisted=false OR attended=false`) | set when `confirmed_count >= capacity` at registration (PRD 5.6). A queue entry holds no place and no pass; `reissue-pass` refuses it; promotion is FIFO by (`created_at`,`registered_at`,`pk`) when a confirmed registration cancels; at the door it takes a free place regardless of queue position. Every admit path clears the flag before setting `attended` |
| attended | bool | no | default false | the only counted figure |
| checked_in_at | datetime | yes | CHECK `attended_requires_check_in_time` | |
| checked_in_by | FK User | yes | SET_NULL | operator |
| station_id | char(40) | blank | | |
| department_at_event / programme_at_event | char(16)/char(32) | blank | | snapshot at registration |
| year_at_event | smallint | yes | | snapshot |

Constraints: CHECK `registration_exactly_one_participant`; partial UNIQUE (`event`,`student`) WHERE `cancelled_at IS NULL AND student IS NOT NULL` → `one_active_registration_per_event_per_student` (no `waitlisted` term, so a student cannot be both queued and confirmed); CHECK `attended_requires_check_in_time`; CHECK `waitlisted_never_attended`. Indexes (`event`,`attended`), (`student`,`cancelled_at`). `Event.registered_count()` and `participation/services.confirmed_count()` both exclude waitlisted rows; `attended_count()` is unaffected.

**ExternalParticipant** (ordering `full_name`): `full_name` char(160); `institution` char(160) blank; `email` blank; `phone` char(20) blank; `purge_after` date null; `purged_at` datetime null. Purged by the `purge-external` job once `purge_after < today` and `purged_at IS NULL`: one UPDATE blanks `full_name/institution/email/phone` and sets `purged_at`; the row and its registrations stay, so a reported semester's `external_participants` does not move (QA W4 F1; the FK is PROTECT so a delete fails loudly). `participant_label` then reads "External participant (purged)". No API endpoint creates one. Note: `docs/CHECKLIST.md` decision E-09 still reads "delete (as specified)"; the code and the model docstring implement blanking.

**StudentQRToken** (ordering `-created_at`): `student` FK CASCADE; `token` char(512) unique; `version` positive int default 1; `key_id` char(16); `revoked_at` null. Partial UNIQUE (`student`) WHERE `revoked_at IS NULL` → `one_live_profile_qr_per_student`.

**EventPass** (ordering `-created_at`): `registration` FK CASCADE; `token` char(512) unique (subject = the pass id, not the registration); `used_at` null; `revoked_at` null; `key_id` char(16). Partial UNIQUE (`registration`) WHERE `used_at IS NULL AND revoked_at IS NULL` → `one_live_pass_per_registration`. Index (`registration`,`used_at`).

**ScanRecord** (ordering `-scanned_at`): `event` FK CASCADE; `registration` FK SET_NULL null; `scanned_token` char(64) (prefix only); `result` char(20) `ScanResult`; `station_id` char(40); `operator` FK User SET_NULL; `scanned_at` (device clock); `synced_at` default now; `offline_ref` char(64) blank (idempotency key); `detail` char(200). Partial UNIQUE (`event`,`offline_ref`) WHERE `offline_ref <> ''` → `one_record_per_offline_ref`. Indexes (`event`,`result`), (`event`,`station_id`), (`event`,`scanned_at`). `was_offline` = synced − scanned > 60 s.

### feedback

**Feedback** (`feedback_feedback`, ordering `created_at`; PRD 5.8)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| event | FK Event | no | PROTECT | |
| registration | FK Registration | no | PROTECT | the attended registration it was submitted against |
| student | FK Student | no | PROTECT | |
| rating | positive smallint | no | CHECK `feedback_rating_1_to_5` | serializer also enforces 1..5 |
| would_recommend | bool | no | | |
| comment | text | blank | serializer max 2000 | returned anonymously in the summary |

Constraints: UNIQUE (`event`,`student`) → `one_feedback_per_student_per_event` (the `IntegrityError` is mapped to `FEEDBACK_ALREADY_SUBMITTED`). Submission needs `event.status` in `REPORTABLE` (completed, reported) and an active registration with `attended=true` (`services.submit_feedback`). There is no read of individual rows: `services.summarise` returns `count`, `average_rating` (2 dp), `recommend_rate` (3 dp) and the non-empty `comments` in submission order, nothing else.

### budget

**BudgetTemplate** (ordering `name`): `name` char(80) unique; `event_kind` char(20) blank; `contingency_percent` smallint default 8.

**BudgetTemplateLine** (ordering `position`,`head`): `template` FK CASCADE; `head` char(120); `basis` `Basis`: lump_sum, per_head, per_day (default lump_sum); `rate` MONEY; `position` smallint. `amount_for()` = rate × max(1, expected_attendance) for per_head, rate × max(1, days) for per_day, else rate.

**Budget**

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| event | OneToOne Event | yes | CASCADE, related `budget` | exactly one of event/fest |
| fest | OneToOne Fest | yes | CASCADE, related `budget` | |
| stage | char(20) | no | `BudgetStage` (see §3); default draft | |
| settled_at | datetime | yes | | |
| is_nil | bool | no | default false | explicit "needs no money" declaration |
| nil_reason | char(400) | blank | CHECK `nil_budget_needs_a_reason` | |
| nil_declared_at | datetime | yes | | |
| nil_declared_by_sub | UUID | yes | | |
| nil_declared_by_label | char(80) | blank | | |

CHECK `budget_exactly_one_owner`. Derived (serialised): `total_requested/total_sanctioned/total_spent` (sums over lines), `is_ready_to_submit` (= is_nil or has lines), `is_editable` (stage in draft/returned/rejected), `settlement_waiting_on` (`"settled"` | `"sanction"` | `"event"` | null), `is_settleable` (= waiting_on is null), `settlement_hint`.

**BudgetLine** (ordering `position`,`head`): `budget` FK CASCADE; `head` char(120); `basis` char(16) default lump_sum (no choices enforced); `amount_requested` MONEY; `amount_sanctioned` MONEY null (null = not yet decided); `amount_spent` MONEY null; `variance_note` char(400) blank; `position` smallint. CHECKs `budget_line_requested_non_negative`, `budget_line_sanctioned_non_negative`, `budget_line_spent_non_negative`. `is_overspent` = spent > sanctioned (both non-null).

**ReceiptDocument** (ordering `-created_at`): `line` FK CASCADE; `file_key` char(400) (store reference, never bytes); `file_name` char(200); `content_type` char(80) (upload allowlist `RECEIPT_CONTENT_TYPES` = `application/pdf, image/jpeg, image/png, image/webp, image/heic`, exact match after stripping parameters); `byte_size` int; `sha256` char(64); `amount` MONEY null; `vendor` char(120) blank; `document_date` date null; `uploaded_by_sub` UUID null; `superseded_by` OneToOne self SET_NULL (related `supersedes`). `is_current` = superseded_by is null. The bytes are served by `GET …/receipts/{receipt_id}/file` (local store streams from disk after a path-containment check; platform store 302s to `FileStore.url_for`).

**ClubBudgetEnvelope** (ordering `-year`,`club__name`; PRD §5.7.3/§5.19.5, B-08)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| club | FK Club | no | CASCADE, related `envelopes` | |
| year | positive smallint | no | serializer/`validate_envelope_year`: 2000..2100 | **calendar** year of `event.starts_at` read in `DISPLAY_TIME_ZONE` (`services.envelope_year_of`; fest budgets use `fest.starts_on.year`) — decision E-11 |
| amount | MONEY | no | CHECK `envelope_amount_non_negative` | |
| set_by | FK User | yes | SET_NULL | |
| set_by_label | char(80) | blank | | |

UNIQUE (`club`,`year`) → `one_envelope_per_club_per_year`; `set_envelope` upserts under `select_for_update` and audits `budget.envelope_set` with the previous amount. Utilisation is never stored: `services.envelope_summary` sums `BudgetLine.amount_sanctioned` over the club's budgets in stage `sanctioned` or `settled` whose event (or fest) starts in that year (`sanctioned_to_date`), `amount_spent` over the settled ones (`settled_to_date`), and `remaining = amount − sanctioned_to_date` (null when no envelope is set). Fest-level budgets count today (QA W3 F7 notes the double-count once sub-events exist).

### governance

**ApprovalRequest** (ordering `-created_at`)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| event | FK Event | no | CASCADE | |
| stages | JSON list | no | ordered subset of `cultural_society, dean, vc` | frozen at submission |
| current_stage | char(20) | no | `ApprovalStage`: cultural_society, dean, vc | |
| state | char(16) | no | `ApprovalState`: pending, approved, returned, rejected, withdrawn; default pending | `withdrawn` is never set by code |
| amount_requested | MONEY | no | default 0 | budget total at submission |
| requires_vc | bool | no | | |
| vc_reason | char(120) | blank | | e.g. `"budget over 50000, part of a fest"` |
| submitted_by | FK User | yes | PROTECT | |
| resolved_at | datetime | yes | | |
| stage_entered_at | datetime | no | default now | when the request reached `current_stage`; reset in `decide()` on every advance, never on return/reject. Migration `0004` backfilled existing rows from the latest `ApprovalStep.created_at`, else `created_at` |

Partial UNIQUE (`event`) WHERE `state='pending'` → `one_pending_approval_per_event`. Indexes (`state`,`current_stage`), (`state`,`stage_entered_at`). Derived (serialised): `age_hours` = hours since `stage_entered_at` (to `resolved_at` once resolved), 1 dp; `escalated` = `state=pending AND unrounded age > APPROVAL_SLA_HOURS`. The queue filter `?escalated=true` and `services.escalated_requests()` use the same predicate in SQL (`stage_entered_at < now − SLA`).

**ApprovalStep** (ordering `created_at`): `request` FK CASCADE; `stage` `ApprovalStage`; `decision` `Decision`: approve, return, reject; `comment` text; `actor_sub` UUID; `actor_label` char(80); `actor_role` char(40) (the stage's role even when a delegate acted); `mfa_verified` bool; `amount_sanctioned` MONEY null (budget total after this step); `on_behalf_of` FK User SET_NULL null (related `steps_delegated`) and `on_behalf_of_label` char(80) blank — the principal when a delegate decided, else null/blank. CHECK `return_and_reject_need_a_comment` (`decision='approve' OR comment <> ''`).

**Delegation** (ordering `-starts_at`; MASTER_SPEC §11.3, PRD §5.13, B-06)

| field | type | null | constraint or enum | notes |
|---|---|---|---|---|
| stage | char(20) | no | `ApprovalStage` | the gate being covered |
| principal_user | FK User | no | CASCADE, related `delegations_given` | must hold `STAGE_ROLE[stage]` at creation (`GOVERNANCE_PRINCIPAL_NOT_HOLDER`) |
| delegate_user | FK User | no | CASCADE, related `delegations_received` | must be `is_active`; for the `vc` stage must be a staff account (`is_staff`, or `dean`/`admin` role) unless an admin created it |
| starts_at / ends_at | datetime | no | CHECK `delegation_window_ends_after_it_starts`; service: `ends_at − starts_at ≤ DELEGATION_MAX_DAYS` | half-open window `[starts_at, ends_at)` |
| reason | char(400) | blank | | |
| created_by | FK User | yes | SET_NULL | |
| revoked_at | datetime | yes | | set by `revoke`; a second revoke is `GOVERNANCE_DELEGATION_REVOKED` 409 |
| revoked_by_label | char(80) | blank | | |

CHECK `delegation_not_to_self` (`principal_user <> delegate_user`). Index (`stage`,`starts_at`,`ends_at`). **In-force rule** (`Delegation.objects.in_force(at, stage)`, the one predicate every reader uses — queue, `decide`, stage-holder notifications, the SLA job and the login MFA demand): `revoked_at IS NULL AND starts_at <= at < ends_at` in SQL, then `principal_still_holds` in Python (`principal_user.is_active AND STAGE_ROLE[stage] in principal_user.global_roles`; Python because `global_roles__contains` is Postgres-only). So a delegation goes inert the moment the principal loses the role, with no revoke needed, and comes back if the role is restored inside the window. Derived: `status` = revoked | scheduled (now < starts_at) | expired (now ≥ ends_at) | active; `is_active` additionally requires `principal_still_holds`, so a listed `status="active"` row can still be `is_active=false`. A delegate never holds the role, so cannot re-delegate; gets no other power of the principal (no venue reassign, no budget/roster/envelope reads); and every delegated decision needs `mfa=true` on the session.

**Notification** (ordering `-created_at`): `user` FK CASCADE; `subject` char(200); `body` text; `kind` char(40); `link` char(300); `read_at` null. Index (`user`,`read_at`).

**AuditEntry** (ordering `-created_at`, append-only): `actor_sub` char(64); `actor_label` char(80); `action` char(80); `target_type` char(60) (model class name); `target_id` char(64); `before` JSON; `after` JSON; `reason` char(400). Indexes (`target_type`,`target_id`), (`action`,`-created_at`). Actions emitted: `club.role_changed`, `club.joined`, `club.join_requested`, `club.join_accepted|declined`, `club.handover`, `club.roster.read`, `club.reactivated`, `club.flagged_dormant` (actor `None`), `event.created`, `event.submitted`, `event.deleted` (before-snapshot, inside the delete transaction), `event.closed`, `event.venue_reassigned`, `event.organiser_added|removed`, `roster.read` (`EventRosterView`, after authorisation, `after={rows, attended_only}`), `approval.approve|return|reject` (`after` carries `on_behalf_of` and `delegation` when a delegate acted), `delegation.created|revoked`, `budget.declared_nil`, `budget.nil_withdrawn`, `budget.settled`, `budget.settled_nil`, `budget.envelope_set`, `profile_qr.reissued`, `jobs.rollup_scans|purge_external|flag_dormant|escalate_sla` (actor `system:jobs` / "Scheduled job", target type `Job`, `after` = timestamps + counts only).

### jobs (no models)

`jobs/services.py` defines four plain functions, reachable as Celery tasks (`jobs/tasks.py`, names `jobs.rollup_scans|purge_external|flag_dormant|escalate_sla`, scheduled in `config/celery.py` `beat_schedule`: 03:00 / 03:15 / 03:30 UTC nightly and hourly on the hour) and as the HTTP trigger `POST|GET /api/v1/jobs/{name}` (`jobs/views.py`). Both go through `run_job(name)`, which writes one `AuditEntry` per run.

| job | what it does | result keys |
|---|---|---|
| `rollup-scans` | counts `ScanRecord`s with `scanned_at` older than 365 days per event; **deletes nothing** (decision E-10 — retention undecided; no `ScanRollup` table) | `cutoff, events, scan_records, deleted (always 0), per_event[], note` |
| `purge-external` | blanks `ExternalParticipant` rows with `purge_after < today AND purged_at IS NULL` (see participation) | `purged, registrations_removed (always 0), as_of` |
| `flag-dormant` | `clubs/services.flag_dormant`: active clubs with `last_activity_at < now − DORMANCY_DAYS` (or null and `created_at` that old) → `dormant`, audited per club | `flagged, ids[]` |
| `escalate-sla` | for every `governance/services.escalated_requests()` item, notifies holders of the stage's role ∪ active delegates for that stage ∪ every Dean (kind `approval.escalated`, link `/staff/approvals/{event_id}?request={id}&stage={stage}`), once per (user, request, stage) — the link is the dedup key; subject cut to 200 chars; one failing item is counted under `failed` and does not stop the run | `escalated, dean_recipients, notifications_sent, failed` |

Not scheduled anywhere: `apply_due_terms` (B-17 open; management command only). `vercel.json` has no `crons` block yet (H-03).

---

## 3. Enums and state machines

### Event status (`events.models.EventStatus`)

Values and labels: `draft` Draft · `submitted` Awaiting approval · `returned` Returned for changes · `rejected` Rejected · `approved` Approved · `published` Published · `live` Live now · `completed` Completed · `reported` Reported · `cancelled` Cancelled.

```mermaid
stateDiagram-v2
    [*] --> draft : POST /events
    draft --> submitted : POST /events/{id}/submit (or create with submit=true)
    returned --> submitted : POST /events/{id}/submit
    submitted --> returned : decide return
    submitted --> rejected : decide reject
    submitted --> published : decide approve at last gate
    published --> live : POST /events/{id}/go-live
    published --> reported : POST /events/{id}/close
    live --> reported : POST /events/{id}/close
    completed --> reported : POST /events/{id}/close
    note right of submitted : stays submitted while intermediate gates approve
    note right of published : approved, completed and cancelled exist in the enum but no API path writes them
```

Edits (PUT/PATCH) are allowed only in `draft` or `returned` (`EVENTS_LOCKED` otherwise). DELETE is allowed only in `draft`, `returned` or `rejected` (`DELETABLE_STATUSES`), by `PROPOSERS` of the owning club; anything else is `EVENT_NOT_DELETABLE` 409 — a published event is meant to be cancelled with a reason, but no cancel endpoint exists.

### Budget stage (`budget.models.BudgetStage`)

`draft` · `society_review` With the Cultural Society · `dean_review` With the Dean · `vc_review` With the Vice-Chancellor · `sanctioned` · `settled` · `returned` · `rejected`.

```mermaid
stateDiagram-v2
    [*] --> draft : ensure_budget at event creation
    draft --> society_review : submit (first stage = cultural_society)
    draft --> dean_review : submit (first stage = dean)
    returned --> society_review : resubmit
    returned --> dean_review : resubmit
    rejected --> society_review : resubmit (event must be draft/returned so unreachable in practice)
    society_review --> dean_review : approve
    dean_review --> vc_review : approve, requires_vc
    dean_review --> sanctioned : approve, last gate
    vc_review --> sanctioned : approve
    society_review --> returned : return
    dean_review --> returned : return
    vc_review --> returned : return
    society_review --> rejected : reject
    dean_review --> rejected : reject
    vc_review --> rejected : reject
    sanctioned --> settled : POST /budget/budgets/{id}/settle
```

Lines are editable only in `draft`, `returned`, `rejected` (`BUDGET_LOCKED`). Spend may be entered in any stage except `settled` (`BUDGET_ALREADY_SETTLED`), but `settle` requires `sanctioned` and the event in `live|completed|reported`.

### ApprovalRequest state and step decisions

State: `pending` → `approved` | `returned` | `rejected` (`withdrawn` defined, never set). Step `decision`: `approve`, `return`, `reject`. Route (`governance/services.build_route`): for each stage in `APPROVAL_CHAIN`: `cultural_society` is included only if `club.under_cultural_society`; `dean` always (appended even if missing from the setting); `vc` in the setting only adds reason `"configured"`. `vc` is appended if any reason: configured, `amount_requested > VC_BUDGET_THRESHOLD` ("budget over 50000"), or `event.fest_id` ("part of a fest").

```mermaid
stateDiagram-v2
    [*] --> pending : submit()
    pending --> pending : approve, remaining stages (current_stage advances)
    pending --> approved : approve at last stage (event→published, budget→sanctioned)
    pending --> returned : return (event→returned, budget→returned)
    pending --> rejected : reject (event→rejected, budget→rejected)
```

`decide()` refusals in order (the request row is locked first): `GOVERNANCE_ALREADY_RESOLVED` (409), `GOVERNANCE_WRONG_STAGE` (409, caller holds — by role or active delegation — another gate on this route), `GOVERNANCE_NOT_APPROVER` (403, neither the role nor an active delegation for `current_stage`), `GOVERNANCE_SELF_APPROVAL` (403, any club role in the submitting club — wins over a delegation too), `GOVERNANCE_MFA_REQUIRED` (403, a *delegated* decision of any kind at any amount without the `mfa` claim), `GOVERNANCE_COMMENT_REQUIRED` (422, return/reject without comment), `GOVERNANCE_MFA_REQUIRED` (403, approve when `stage == vc` or amount > threshold and `mfa` claim false). The event row is then locked; at the final gate `_assert_slot_still_free` also locks the venue row and re-runs `assert_bookable`, raising `GOVERNANCE_CLASH_UNRESOLVED` (409) if a confirmed booking now overlaps; an `IntegrityError` naming `venue_confirmed_bookings_do_not_overlap` (Postgres exclusion constraint) is mapped to the same 409. The step records `on_behalf_of` when a delegation was used; `stage_entered_at` is reset on advance. `sanctioned` amounts are applied only at the `dean` stage; untouched lines are sanctioned as requested; a sanction above request is `BUDGET_SANCTION_EXCEEDS_REQUEST` (422), unknown line id `BUDGET_UNKNOWN_LINE` (422).

### Delegation status (`governance.models.Delegation.status`)

```mermaid
stateDiagram-v2
    [*] --> scheduled : POST /governance/delegations (now < starts_at)
    [*] --> active : POST /governance/delegations (starts_at <= now)
    scheduled --> active : clock reaches starts_at
    active --> expired : clock reaches ends_at
    scheduled --> revoked : POST /delegations/{id}/revoke
    active --> revoked : POST /delegations/{id}/revoke
    expired --> revoked : revoke still allowed (idempotence refused)
    expired --> [*]
    revoked --> [*]
    note right of active : is_active additionally needs principal_still_holds — the row reads active but is inert while the principal lacks the role
```

### Registration source and attended flags

`source`: `pre_registered` (POST /participation/registrations), `spot` (walk-in via profile QR), `manual` (desk PRN entry), `imported` (never set by code).

```mermaid
stateDiagram-v2
    [*] --> registered : register, place free (waitlisted=false, pass minted, notify registration.confirmed)
    [*] --> waitlisted : register, confirmed_count >= capacity (waitlisted=true, no pass, notify registration.waitlisted)
    waitlisted --> registered : head of queue promoted when a confirmed registration cancels (pass minted, notify registration.promoted)
    waitlisted --> attended : profile QR / PRN / stray pass at the door AND a place is free (waitlisted cleared first, source stays as registered)
    waitlisted --> cancelled : POST registrations/{id}/cancel (no promotion — held no place)
    registered --> attended : scan/check-in (attended=true, checked_in_at set, pass used_at set)
    registered --> cancelled : POST registrations/{id}/cancel (cancelled_at set, live pass revoked, queue head promoted)
    attended --> attended : second scan → ScanRecord duplicate, no change
    attended --> [*]
    cancelled --> [*]
    note right of attended : cancel refused with PARTICIPATION_ALREADY_ATTENDED — a second cancel of a cancelled row is a 204 no-op
    note right of waitlisted : reissue-pass refused with PARTICIPATION_WAITLISTED — door with no free place → NOT_REGISTERED (On the waitlist, but no place has opened)
```

Register, cancel, promote and every door admission that reads capacity take the `Event` row lock first (`select_for_update`), then the registration/pass row; a confirmed-registration scan locks only its own row. Notifications to students are queued with `transaction.on_commit`, so a rolled-back registration or move sends nothing.

### ScanResult (`participation.models.ScanResult`)

| value | label | resolver branch |
|---|---|---|
| accepted | Checked in | valid event pass, or profile QR with a live registration |
| spot_registered | Registered at the door and checked in | profile QR, no registration, capacity left |
| duplicate | Already checked in | pass `used_at` set or registration already attended |
| wrong_event | Pass is for another event | pass payload `event_id` ≠ scanned event |
| unknown_code | Code not recognised | signature invalid, pass row missing, pass revoked ("Pass was replaced"), profile QR revoked ("Code was replaced") |
| not_registered | Not registered and cannot be | walk-in but event at capacity |
| expired | Pass expired | pass token past `exp` |
| cancelled | Registration was cancelled | pass belongs to a cancelled registration |

`ACCEPTING = (accepted, spot_registered)`; `tone` = `ok` (accepted) / `warn` (duplicate) / `bad` (other). `resolve()` writes a `ScanRecord` on every branch; a repeated `offline_ref` is silently a no-op.

### Membership role, club status, club category, user status

- Membership role (most senior first): `club_president`, `club_vice_president`, `club_treasurer`, `club_secretary`, `club_core`, `club_member`.
- Club status: `active` → `archived` (DELETE /clubs/{id}); `dormant` settable via PUT/PATCH only.
- Club category: `cultural`, `literary`, `technical`, `sports`, `social`.
- User/Student status: `provisional`, `active`, `on_leave`, `graduated`, `withdrawn`, `suspended`; login allowed for active/on_leave/graduated.

### Notification channel

Two channels only, both from one adapter call (`integrations/notifications.py: LocalNotificationSender.send`): an in-app `Notification` row plus an email to `user.email` via `send_mail(fail_silently=True)`. `PlatformNotificationSender` raises `NotImplementedError`. `kind` values emitted: `approval.pending` (link `/staff/approvals/{event_id}`; to holders of the stage's role plus active delegates for it), `approval.returned`, `approval.rejected`, `approval.advanced`, `approval.approved`, `approval.escalated` (the `escalate-sla` job), `delegation.granted`, `delegation.revoked` (to the delegate, link `/staff/approvals`), `event.published` and `event.venue_changed` (to every student with an active registration — waitlist included — via the `Event` post-save hook in `participation/signals.py`, link `/club/{club_id}/events/{event_id}`; `event.venue_changed` also goes to club officers from `EventViewSet.reassign`), `registration.confirmed`, `registration.promoted` (link `/me/passes`), `registration.waitlisted`, `club.join_requested` (to current President/VP by term), `club.join_accepted`, `club.join_declined` (to the applicant, link `/clubs/{club_id}`), `club.handover` (incoming and outgoing bearers, on commit). Approval-outcome club notifications go only to active members whose **Membership row** role is in `BUDGET_VIEWERS` (`_notify_club`); the join-queue notifier uses the term-derived `current_office_bearers` instead.

---

## 4. Database constraints

AGENT_PROMPT §4 "constraints that must exist in PostgreSQL" versus what the migrations create. Every constraint but one is a Django `CheckConstraint` or (partial) `UniqueConstraint`, emitted on both PostgreSQL and SQLite. The exception is `events/0004_venue_exclusion_constraint.py` (wave 1): a vendor-guarded `RunPython` that creates the `btree_gist` extension and the `ExclusionConstraint` `venue_confirmed_bookings_do_not_overlap` on PostgreSQL only; on SQLite it is a no-op and the `select_for_update` on the venue row is the only guard. The test suite's Postgres-only cases (`tests/test_event_integrity.py`) are skipped on SQLite, so the constraint is exercised only in CI/hosting with Postgres.

| §4 requirement | status | migration | constraint name | notes |
|---|---|---|---|---|
| Registration: exactly one of student_id / external_participant_id | present | `participation/0001_initial.py` | `registration_exactly_one_participant` | CHECK; FK is named `external`, column `external_id` |
| Registration: partial unique (event_id, student_id) WHERE cancelled_at IS NULL | present | `participation/0001_initial.py` | `one_active_registration_per_event_per_student` | condition also `student IS NOT NULL` |
| BudgetLine: exactly one of event_id / fest_id | **moved** | `budget/0002_initial.py` | `budget_exactly_one_owner` | ownership lives on `Budget` (OneToOne event xor fest); `BudgetLine` only has `budget_id` |
| Event: ends_at > starts_at | present | `events/0002_initial.py` | `event_ends_after_start` | |
| Event: cancelled_reason required when cancelled | present | `events/0002_initial.py` | `event_cancelled_needs_reason` | `NOT status='cancelled' OR cancelled_reason <> ''` |
| Feedback: rating 1..5; one per student per event | present | `feedback/0001_initial.py` | `feedback_rating_1_to_5`, `one_feedback_per_student_per_event` | CHECK + UNIQUE (event, student) |
| VenueBooking: exclusion constraint on overlapping ranges (buffer included) | **present, Postgres only, without the buffer** | `events/0004_venue_exclusion_constraint.py` | `venue_confirmed_bookings_do_not_overlap` | on `events_event`, not a `VenueBooking` table: `EXCLUDE USING gist (venue_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE status IN (approved, published, live, completed, reported)`. The 30-minute buffer is application-level (`events/services.assert_bookable`) under a `select_for_update` on the `Venue` row in create, submit, reassign and the publishing `decide`. Submitted-but-unconfirmed overlaps are allowed by design (soft clashes for the Dean). |
| Membership: one active membership per student per club | present | `clubs/0002_initial.py` | `one_active_membership_per_student_per_club` | partial unique |
| "enums as text with CHECK constraints" | **missing** | — | — | enum columns are plain `varchar` with Django `choices`; no CHECK on any status/enum column |

Constraints the migrations create beyond §4:

| model | migration | name | kind |
|---|---|---|---|
| Student | `identity/0001_initial.py` | `student_year_1_to_5` | CHECK |
| ReferenceCode | `identity/0001_initial.py` | `unique_code_per_kind` | UNIQUE (kind, code) |
| Semester | `identity/0001_initial.py` | `semester_ends_after_start` | CHECK |
| Membership | `clubs/0002_initial.py` | `one_active_president_per_club` | partial UNIQUE (club) WHERE president AND active |
| Registration | `participation/0001_initial.py` | `attended_requires_check_in_time` | CHECK |
| Registration | `participation/0003_…py` | `waitlisted_never_attended` | CHECK (`waitlisted=false OR attended=false`) |
| JoinRequest | `clubs/0003_join_requests_terms_dormancy.py` | `one_pending_join_request_per_student_per_club` | partial UNIQUE (club, student) WHERE state='pending' |
| OfficeBearerTerm | `clubs/0003_…py` | `office_bearer_term_ends_after_start` | CHECK (`ends_at IS NULL OR ends_at > starts_at`) |
| EventOrganiser | `events/0003_eventorganiser.py` | `one_open_organiser_grant_per_student_per_event` | partial UNIQUE (event, student) WHERE ends_at IS NULL |
| ClubBudgetEnvelope | `budget/0004_…py` | `one_envelope_per_club_per_year`, `envelope_amount_non_negative` | UNIQUE (club, year); CHECK |
| Delegation | `governance/0003_delegation_…py` | `delegation_window_ends_after_it_starts`, `delegation_not_to_self` | CHECK; CHECK |
| EventPass | `participation/0001_initial.py` | `one_live_pass_per_registration` | partial UNIQUE |
| StudentQRToken | `participation/0001_initial.py` | `one_live_profile_qr_per_student` | partial UNIQUE |
| ScanRecord | `participation/0001_initial.py` | `one_record_per_offline_ref` | partial UNIQUE (event, offline_ref) WHERE offline_ref <> '' |
| BudgetLine | `budget/0002_initial.py` | `budget_line_requested_non_negative`, `budget_line_sanctioned_non_negative`, `budget_line_spent_non_negative` | CHECK |
| Budget | `budget/0003_budget_is_nil_…py` | `nil_budget_needs_a_reason` | CHECK |
| ApprovalRequest | `governance/0002_initial.py` | `one_pending_approval_per_event` | partial UNIQUE (event) WHERE state='pending' |
| ApprovalStep | `governance/0002_initial.py` | `return_and_reject_need_a_comment` | CHECK |

Column-level uniques: `User.email`, `Student.prn`, `Semester.name`, `RefreshToken.token_hash`, `Club.name`, `Club.slug`, `Venue.name`, `Fest.name`, `StudentQRToken.token`, `EventPass.token`, `BudgetTemplate.name`, `ReceiptDocument.superseded_by` (OneToOne), `Budget.event`, `Budget.fest` (OneToOne). Also changed in wave 1: `Registration.external` is now `PROTECT` (was CASCADE). Postgres-only behaviour in code, not schema: `User.objects.with_global_role()` uses `global_roles__contains` on Postgres and filters in Python elsewhere.

---

## 5. Roles and capability sets

Source: `common/roles.py`; mirrored verbatim in `web-app/src/roles.js`.

**Global roles** (`GLOBAL_ROLES`): `student`, `cultural_society`, `dean`, `vice_chancellor`, `admin`.

**Object-scoped roles** (`SCOPED_ROLES`), carried as `"<name>:<uuid>"`:

- club-scoped (`CLUB_ROLES`, seniority order): `club_president`, `club_vice_president`, `club_treasurer`, `club_secretary`, `club_core`, `club_member` — scope is the club id.
- event-scoped: `event_organiser` — scope is the event id. `identity/tokens.roles_for()` builds `roles` from `User.global_roles` + `student` (if a Student record exists) + one scoped club role per active membership, taken from `clubs/services.active_club_roles` (office-bearer terms first, Membership row as fallback — an expired President's term yields `club_member`) + one `event_organiser:<event_id>` per live `EventOrganiser` row (`EventOrganiser.active_event_ids`). In local mode the grant is made by `POST /events/{id}/organisers` (President/VP) and reaches the token at the next login or refresh (≤ 15 min); the platform issues the scope directly in platform mode.

**Capability sets** (tuples of club role names):

| set | members | used by |
|---|---|---|
| `ROLE_ASSIGNERS` | president, vice_president | POST /memberships/{id}/role; `can_assign_roles` |
| `BUDGET_VIEWERS` | president, vice_president, treasurer | budget queryset, event `budget` field, club notifications |
| `BUDGET_PREPARERS` | president, vice_president, treasurer | add/edit/remove line, declare-nil, withdraw-nil |
| `BUDGET_SETTLERS` | president, vice_president, treasurer | set spend, receipts, settle |
| `PROPOSERS` | president, vice_president, secretary, treasurer | create/update/submit event |
| `EVENT_OPERATORS` | president, vice_president, secretary | go-live, close |
| `DOOR_STAFF` | president, vice_president, secretary, core | scan station, sync, check-in, roster, directory |
| `STAGE_ROLE` | `{"cultural_society": cultural_society, "dean": dean, "vc": vice_chancellor}` | approval gates |
| `MFA_REQUIRED_ROLES` | dean, vice_chancellor, admin, cultural_society | login demands `mfa_code` (so does `is_staff`, and any account with a `Delegation` in force — `identity/views.LoginView`); refresh cap 8 h |

`AuthContext` predicates: `can_see_all_clubs()` = dean | vice_chancellor | admin | cultural_society; `can_see_individual_records()` = dean | admin; `is_dean()`, `is_admin()`, `organiser_events()` = scopes of `event_organiser`; `club_role(club_id)` = most senior club role held there.

**JWT claims** (`identity/tokens.py`, HS256 with `SECRET_KEY`): `sub` (user id), `iss` (`PLATFORM_ISSUER`), `aud` (`PLATFORM_AUDIENCE`, default `"clubs"`), `email`, `student_id`, `prn`, `display_name`, `roles` (sorted list), `department`, `programme`, `year`, `mfa` (bool), `typ` (`"access"`), `iat`, `exp`, `jti`, and `scan_event` (event id, only on scan-station tokens). Login/refresh responses echo all claims except `typ` and `jti`.

**`GET /module/auth/me` payload** (`identity/views.MeView`):

```json
{
  "sub": "uuid", "display_name": "str", "prn": "str|null", "student_id": "uuid|null",
  "department": "str|null", "programme": "str|null", "year": "int|null",
  "roles": ["student", "club_president:<club uuid>", "..."], "mfa": false,
  "capabilities": {
    "can_see_individual_records": false, "can_see_all_clubs": false,
    "is_student": true, "is_dean": false, "is_vice_chancellor": false,
    "is_cultural_society": false, "is_admin": false,
    "clubs": ["<club uuid>"],
    "clubs_with_budget_access": [], "clubs_can_assign_roles": [],
    "clubs_can_propose": [], "clubs_can_operate_events": [],
    "clubs_can_enter_spend": [], "clubs_door_staff": [],
    "can_see_overview": false,
    "organiser_events": ["<event uuid>"],
    "approval_stages": ["cultural_society", "dean", "vc"]
  }
}
```

All `clubs_*` lists are sorted club ids derived from the corresponding capability set; `can_see_overview` = dean | admin | cultural_society; `approval_stages` lists the `STAGE_ROLE` keys whose role the caller holds **by role only** — stages held through a delegation are not in this payload (read `stages_delegated_to_you` on `GET /governance/approvals/queue`). Advisory only: every capability is re-checked server-side.

---

## 6. API endpoint catalogue

Error codes common to every authenticated route (omitted from rows): `AUTH_REQUIRED` 401 (missing/invalid bearer), `PERMISSION_DENIED` 403 (DRF permission class), `NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `VALIDATION_FAILED` 422 (serializer errors, flattened `errors[{field, code, message}]`), `INTERNAL_ERROR` 500. Problem body: `{type, title, status, detail, instance, code, trace_id, errors?}`.

Shape aliases used below:

- **EventOut** (`EventSerializer`): `id, title, club, club_name, fest, kind, description, venue, venue_name, starts_at, ends_at, capacity, expected_attendance, status, status_label, photo_count, social_links, registered, attended, budget, my_registration, submitted_at, closed_at`. `registered` = `Event.registered_count()`, which excludes waitlisted rows. `budget` = `{id, stage, stage_label, total_requested, total_sanctioned, total_spent}` or `null` when absent **or when the caller is not in `BUDGET_VIEWERS`/staff**. `my_registration` = `{id, attended, pass_token}` or `null`.
- **BudgetOut** (`BudgetSerializer`): `id, event, fest, stage, stage_label, lines[LineOut], total_requested, total_sanctioned, total_spent, settled_at, settlement_problems[{field, code, message}], thresholds{receipt_threshold, vc_threshold}, nil_declaration{head, reason, declared_by, declared_at}|null, is_editable, is_ready_to_submit, can_settle, settlement_waiting_on, settlement_hint, envelope{year, amount|null, sanctioned_to_date, settled_to_date, remaining|null}|null` (the club's envelope for the year the budget draws on; `null` only for a budget with neither event nor fest). **LineOut**: `id, head, basis, amount_requested, amount_sanctioned, amount_spent, variance_note, is_overspent, receipts[ReceiptOut], position`. **ReceiptOut**: `id, file_name, content_type, byte_size, amount, vendor, document_date, created_at, superseded_by, is_current, file_url` (current receipts only inside LineOut; `file_url` = `/api/v1/budget/budgets/{id}/lines/{line_id}/receipts/{receipt_id}/file`).
- **EnvelopeOut** (`EnvelopeView`): `club_id, club, year, amount|null, sanctioned_to_date, settled_to_date, remaining|null, set_by, updated_at|null` — money as strings.
- **ApprovalOut** (`ApprovalRequestSerializer`): `id, event, event_title, club, club_id, venue, starts_at, ends_at, expected_attendance, stages, current_stage, stage_label, state, amount_requested, requires_vc, vc_reason, steps[StepOut], lines[{id, head, amount_requested, amount_sanctioned}], clashes[{id, title, club, starts_at, ends_at, expected_attendance}], my_stage, requires_mfa, nil_declaration, stage_entered_at, age_hours, escalated, created_at`. `my_stage` is true when the caller holds `current_stage` by role **or active delegation**; `requires_mfa` reflects the amount/VC rule only (a delegate additionally always needs MFA). **StepOut**: `id, stage, stage_label, decision, comment, actor_label, actor_role, mfa_verified, amount_sanctioned, on_behalf_of (user id|null), on_behalf_of_label, created_at`.
- **DelegationOut** (`DelegationSerializer`): `id, stage, stage_label, principal_user, principal_label, delegate_user, delegate_label, starts_at, ends_at, reason, created_by, created_by_label, revoked_at, revoked_by_label, status (scheduled|active|expired|revoked), is_active, created_at`.
- **MembershipOut**: `id, club, student, prn, full_name, department, programme, year, role, role_label, joined_at, ended_at`. **RoleChangeOut**: `id, membership, actor_label, from_role, to_role, reason, created_at`.
- **ClubOut**: `id, name, slug, tag, category, description, instagram_handle, status, join_mode, last_activity_at, member_count, my_role` (`join_mode` writable; `last_activity_at` read-only). `my_role` comes from the token, i.e. the term-derived role.
- **JoinRequestOut**: `id, club, student, prn, full_name, department, programme, year, state, note, decided_by_label, decided_at, created_at`. **TermOut** (`OfficeBearerTermSerializer`): `id, club, student, prn, full_name, role, role_label, starts_at, ends_at, created_by_label, created_at`. **OrganiserOut** (`EventOrganiserSerializer`): `id, event, student, prn, full_name, assigned_by_label, ends_at, created_at`.
- **VenueOut**: `id, name, capacity, location, active`.
- **RegistrationOut**: `id, event, event_title, source, waitlisted, attended, checked_in_at, cancelled_at, pass_token, registered_at` (`pass_token` null unless the caller owns it, and always null while `waitlisted`).
- **FeedbackSummary**: `event{id, title}, count, average_rating|null, recommend_rate|null, comments[str]` — no ids, names or PRNs.
- **ScanOutcome**: `result, result_label, verdict, tone, accepted, detail, student{prn, full_name, department, programme, year}|null, registration_id|null`.
- **Session**: `access_token, refresh_token, token_type:"Bearer", expires_in (900), claims{...}`.
- **Page<T>**: `{count, next, previous, results: T[]}`.

### identity (`/api/v1/module/…`)

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/module/auth/mode` | anyone | — | `integration_mode, sso{enabled, issuer, authorize_url, audience}, password_login, approval_chain` | — |
| POST | `/module/auth/login` | anyone (local mode only) | `email, password, mfa_code?` | Session | `AUTH_SSO_REQUIRED` 400, `AUTH_INVALID_CREDENTIALS` 401, `AUTH_MFA_REQUIRED` 401 (errors on `mfa_code`), `AUTH_ACCOUNT_NOT_ACTIVE` 403 |
| POST | `/module/auth/refresh` | anyone | `refresh_token` | Session (rotated) | `AUTH_INVALID_CREDENTIALS` 401 (unknown, replayed, expired, revoked, account cannot log in) |
| POST | `/module/auth/logout` | authenticated | — | 204 | — |
| GET | `/module/auth/me` | authenticated | — | see §5 | — |
| GET | `/module/directory/students?q=` | dean, admin, holders of `event_organiser:*`, or any `DOOR_STAFF` club role | — | `results[{student_id, prn, full_name, department, programme, year}]` | `DIRECTORY_NOT_PERMITTED` 403 |
| GET | `/module/semesters` | authenticated | — | `[{id, name, starts_on, ends_on, is_current}]` (unpaginated) | — |
| GET | `/module/auth/demo/personas` | anyone — **DEMO_MODE only** | — | `demo_mode, personas[{key, label, sub, available, name}]` | `NOT_FOUND` 404 when off |
| POST | `/module/auth/demo/{persona}` | anyone — **DEMO_MODE only** | — | Session + `persona{key, label, sub}`; MFA granted for staff personas | `NOT_FOUND` 404, `DEMO_UNKNOWN_PERSONA` 404, `DEMO_PERSONA_UNAVAILABLE` 409 |

Persona keys: `student, organiser, president, treasurer, member, society, dean, vc`.

`mfa_code` is demanded at login when the account holds a `MFA_REQUIRED_ROLES` role, is `is_staff`, or is the delegate of a `Delegation` in force; omitting it is `AUTH_MFA_REQUIRED` **401** (not 403). Standalone mode accepts any non-empty code; the resulting session carries `mfa=true`.

### clubs (`/api/v1/…`)

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/clubs` | authenticated | — | Page<ClubOut> | — |
| POST | `/clubs` | dean, admin | `name, tag?, category, description?, instagram_handle?, status?` (`slug` read-only, must be set elsewhere) | ClubOut 201 | `CLUBS_NOT_PERMITTED` 403, `VALIDATION_FAILED` |
| GET | `/clubs/{id}` | authenticated | — | ClubOut | `NOT_FOUND` |
| PUT / PATCH | `/clubs/{id}` | dean, admin | same writable fields + `join_mode` | ClubOut; switching `approval` → `open` accepts every pending join request (each audited `club.join_accepted`, applicant notified) | `CLUBS_NOT_PERMITTED` 403 |
| DELETE | `/clubs/{id}` | dean, admin | — | 204; sets `status=archived` | `CLUBS_NOT_PERMITTED` 403 |
| GET | `/clubs/{id}/members` | dean, admin, or any club role in that club | — | `club{id, name, join_mode}, can_assign_roles, results[MembershipOut], recent_changes[RoleChangeOut] (10), pending_join_requests (int — only for President/VP or dean/admin)`; writes audit `club.roster.read` | `NOT_FOUND` 404 (deliberately not 403) |
| POST | `/clubs/{id}/join` | student (`student_id` claim with a local `Student` row) | — | open club: MembershipOut **201** (role `club_member`, audit `club.joined`); approval club: JoinRequestOut **202** (audit `club.join_requested`, current President/VP notified) | `CLUBS_STUDENTS_ONLY` 403, `CLUBS_NOT_A_STUDENT` 422 (platform-mode token with no local Student), `CLUBS_ARCHIVED` 409, `CLUBS_ALREADY_MEMBER` 409, `CLUBS_JOIN_PENDING` 409 (dormant clubs accept joins) |
| GET | `/clubs/{id}/join-requests?state=pending\|accepted\|declined\|all` | president or vice_president of the club | — | `club{id, name, join_mode}, results[JoinRequestOut]` (default `pending`) | `NOT_FOUND` 404 (no connection to the club), `CLUBS_ROLE_ASSIGN_DENIED` 403 (other club role, **and dean/admin** — B-18 open) |
| POST | `/clubs/{id}/join-requests/{request_id}/accept` | president or vice_president | `note? (≤280)` | JoinRequestOut (state accepted; membership created, or the existing one reused with note "Already a member"); applicant notified `club.join_accepted`; audit `club.join_accepted` | `NOT_FOUND` 404 (club, or request id not a UUID / not on this club), `CLUBS_ROLE_ASSIGN_DENIED` 403, `CLUBS_JOIN_ALREADY_DECIDED` 409 |
| POST | `/clubs/{id}/join-requests/{request_id}/decline` | president or vice_president | `note? (≤280)` | JoinRequestOut (state declined); applicant notified `club.join_declined` | as accept |
| POST | `/memberships/{id}/role` | president or vice_president of the membership's club | `role (club role), reason? (≤280)` | MembershipOut; also closes the pair's current `OfficeBearerTerm`s and opens one for an office role; touches club activity | `NOT_FOUND` 404 (not visible), `CLUBS_ROLE_ASSIGN_DENIED` 403, `CLUBS_PRESIDENT_EXISTS` 409, `VALIDATION_FAILED` |
| POST | `/clubs/{id}/handover` | president or vice_president | `effective_at (datetime), assignments[{student_id, role ∈ president\|vice_president\|treasurer\|secretary}]` | **201** `club{id, name}, effective_at, terms[TermOut]`. One transaction under a club row lock: every term for a named office or named student that is still open at `effective_at` is closed at `effective_at` (office holders with no term get a backfilled one), new terms open at `effective_at`, a `RoleChange` per assignment; if `effective_at <= now` the Membership rows are rewritten at once (`apply_due_terms`), otherwise the token changes on the date and the rows wait (B-17). Audit `club.handover`; incoming and outgoing bearers notified `club.handover` on commit | `NOT_FOUND` 404, `CLUBS_ROLE_ASSIGN_DENIED` 403 (incl. dean/admin — B-18 open), `CLUBS_HANDOVER_EMPTY` 422, `CLUBS_HANDOVER_DUPLICATE_ROLE` 422, `CLUBS_HANDOVER_DUPLICATE_STUDENT` 422, `CLUBS_HANDOVER_NOT_A_MEMBER` 422 (errors `assignments`/`NOT_A_MEMBER`), `CLUBS_HANDOVER_BACKDATED` 422 (an affected term started at or after `effective_at`; errors `effective_at`/`BEFORE_CURRENT_TERM`), `VALIDATION_FAILED` |
| GET | `/clubs/{id}/office-bearers/history` | dean, admin, or president/VP/treasurer/secretary of the club | — | `club{id, name}, current[TermOut], results[TermOut]` (newest first) | `NOT_FOUND` 404 (deliberately not 403) |

There is still no list/retrieve/create/delete for memberships (only the `role` action) and no endpoint to end a membership; `join` is the only way a membership is created through the API. `GET /clubs` has no filter parameters (B-16's `?category=` is open).

### events (`/api/v1/…`)

Visibility (`EventViewSet.get_queryset`): staff (`can_see_all_clubs`) see all; others see `PUBLIC_STATUSES` plus their own clubs' events plus organiser-scoped events — except for `DELETE`, where the queryset is the caller's own clubs only (a student or another club's officer gets 404 for a published event). Filters: `club`, `status` (comma list), `starts_at_after`, `starts_at_before`, `ordering` (default `starts_at`). No `category` filter (B-16 open).

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/events` | authenticated | — | Page<EventOut> | — |
| POST | `/events` | `PROPOSERS` of `club` | `title, club, kind?, description?, venue, starts_at, ends_at, capacity, expected_attendance, fest?, budget_template?, budget_lines?[{head, amount_requested, basis?}], submit? (default true)` | EventOut 201 + `soft_clashes[{id, title, club}]` + `approval{id, stages, current_stage, requires_vc, vc_reason}\|null`; `Location` header. The clash check and insert run under `select_for_update` on the `Venue` row | `EVENTS_PROPOSE_DENIED` 403, `EVENTS_VENUE_UNAVAILABLE` 409 (errors on `venue`), `BUDGET_UNKNOWN_TEMPLATE` 422, `GOVERNANCE_BUDGET_REQUIRED` 409 (submit with empty budget), `VALIDATION_FAILED` (ends_at, capacity > venue, expected > capacity) |
| GET | `/events/{id}` | per visibility | — | EventOut | `NOT_FOUND` |
| PUT / PATCH | `/events/{id}` | `PROPOSERS` of the club; status draft/returned | EventSerializer writable fields: `title, club, fest, kind, description, venue, starts_at, ends_at, capacity, expected_attendance` | EventOut | `EVENTS_EDIT_DENIED` 403, `EVENTS_LOCKED` 409 |
| DELETE | `/events/{id}` | `PROPOSERS` of the owning club; status `draft`/`returned`/`rejected` | — | 204; hard delete inside one transaction with a before-snapshot audit `event.deleted` (the `ApprovalRequest` trail cascades; `AuditEntry` rows survive) | `NOT_FOUND` 404 (not the caller's club — dean/VC/society/admin see the row and get 403), `EVENTS_DELETE_DENIED` 403, `EVENT_NOT_DELETABLE` 409 (wrong status, or registrations exist — FK PROTECT) |
| POST | `/events/{id}/submit` | `PROPOSERS` | — | `id, stages, current_stage, requires_vc, vc_reason, soft_clashes[{id, title, club}]`; slot re-checked under event-then-venue row locks for draft/returned | `EVENTS_PROPOSE_DENIED` 403, `EVENTS_VENUE_UNAVAILABLE` 409, `GOVERNANCE_ALREADY_SUBMITTED` 409, `GOVERNANCE_BUDGET_REQUIRED` 409 |
| POST | `/events/{id}/go-live` | `EVENT_OPERATORS` or dean | — | EventOut | `EVENTS_GO_LIVE_DENIED` 403, `EVENTS_NOT_PUBLISHED` 409 |
| POST | `/events/{id}/close` | `EVENT_OPERATORS`, organiser of this event, or dean | `photo_count (≥0), social_links?[url]` | EventOut (status reported) | `EVENTS_CLOSE_DENIED` 403, `EVENTS_EVIDENCE_REQUIRED` 409 (photo_count < 1), `EVENTS_NOT_CLOSEABLE` 409 |
| GET | `/events/{id}/clashes` | per visibility | — | `clashes[{id, title, club, starts_at, ends_at, status, expected_attendance}], free_venues[VenueOut]` | `NOT_FOUND` |
| POST | `/events/{id}/reassign` | dean | `to_venue (uuid), reason (5..280 chars)` | `id, event, from_venue, from_venue_name, to_venue, to_venue_name, reason, actor_label, created_at`; event row then target venue row locked; officers and registered students notified `event.venue_changed` | `EVENTS_REASSIGN_DENIED` 403, `NOT_FOUND` (venue), `EVENTS_SAME_VENUE` 409, `EVENTS_VENUE_TOO_SMALL` 409, `EVENTS_VENUE_UNAVAILABLE` 409 |
| GET | `/events/{id}/organisers` | dean, admin, any club role in the owning club, or an organiser of this event | — | `event{id, title}, results[OrganiserOut]` (live grants only) | `NOT_FOUND` 404 (deliberately not 403) |
| POST | `/events/{id}/organisers` | president or vice_president of the owning club | `student_id, ends_at?` (default `event.ends_at + ORGANISER_GRACE_HOURS`; max `event.ends_at + 7 d`; must be in the future) | OrganiserOut 201; audit `event.organiser_added`; the scope reaches the student's token at their next login/refresh | `EVENTS_ORGANISER_ASSIGN_DENIED` 403, `EVENTS_UNKNOWN_STUDENT` 422, `EVENTS_ORGANISER_GRANT_TOO_LONG` 422, `EVENTS_ORGANISER_ALREADY_ENDED` 422, `EVENTS_ORGANISER_EXISTS` 409, `VALIDATION_FAILED` |
| DELETE | `/events/{id}/organisers/{student_id}` | president or vice_president | — | 204; sets the live grant's `ends_at = now` (row kept); audit `event.organiser_removed` | `EVENTS_ORGANISER_ASSIGN_DENIED` 403, `NOT_FOUND` 404 (no live grant, or id not a UUID) |
| GET | `/venues` | authenticated | — | Page<VenueOut> (active only) | — |
| GET | `/venues/{id}` | authenticated | — | VenueOut | `NOT_FOUND` |
| GET | `/venue-calendar?date=YYYY-MM-DD&buffer=` | `can_see_all_clubs` | — | `buffer_minutes (echo of query or null), venues[VenueOut], bookings[{id, title, club, venue, venue_name, starts_at, ends_at, status, confirmed, clash}], clashes[{venue, events[{id, title, club, starts_at, ends_at, expected_attendance, status}] }]` | `EVENTS_CALENDAR_DENIED` 403 |

### participation (`/api/v1/participation/…`)

Door routes use `IsEventOrganiser` (`participation/permissions.py`): a scan-station token bound to another event is refused; allowed are `event_organiser:<event>`, `admin`, or `DOOR_STAFF` role in the owning club. Dean/VC/society are **not** allowed. Failure is `PERMISSION_DENIED` 403.

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/participation/registrations` | authenticated (student sees own; others empty) | — | Page<RegistrationOut> | — |
| POST | `/participation/registrations` | student (`student_id` claim) | `event` | RegistrationOut 201 — `waitlisted: false` with a pass minted and `registration.confirmed` sent, **or** `waitlisted: true` with no pass and `registration.waitlisted` sent when `confirmed_count >= capacity`. There is no "event full" refusal any more (`PARTICIPATION_EVENT_FULL` is not raised) | `PARTICIPATION_NOT_A_STUDENT` 403, `NOT_FOUND` 404 (event), `PARTICIPATION_NOT_OPEN` 409, `PARTICIPATION_ALREADY_REGISTERED` 409 (also when already waitlisted) |
| POST | `/participation/registrations/{id}/cancel` | owner | — | 204; under the event lock the row is re-read, the live pass revoked and — if the row held a place — the queue head promoted (pass minted, `registration.promoted`). Cancelling a waitlisted row promotes nobody; cancelling an already-cancelled row is a no-op 204 | `NOT_FOUND` 404, `PARTICIPATION_ALREADY_ATTENDED` 409 |
| POST | `/participation/registrations/{id}/reissue-pass` | owner | — | `token, image (data URI)` | `NOT_FOUND` 404, `PARTICIPATION_WAITLISTED` 409 |
| GET | `/participation/my-passes` (alias `/participation/me/qr`) | authenticated | — | `passes[{registration_id, event_id, title, club, venue, starts_at, ends_at, attended, waitlisted, token\|null, image\|null}], profile_qr{token, version, image}\|null, note` (non-students get `{passes:[], profile_qr:null}`; a waitlisted registration is listed with `waitlisted: true` and null token/image) | — |
| POST | `/participation/my-passes` (alias `/participation/me/qr`) | student | — | `token, version, image` (profile QR reissued, old revoked) | `PARTICIPATION_NOT_A_STUDENT` 403 |
| GET | `/participation/events/{event_id}/scan` | door (`IsEventOrganiser`) | — | `event{id, title, club, venue, status, starts_at, ends_at}, counters{checked_in, registered (= confirmed_count, waitlist excluded), capacity}, capture{attempts, accepted, duplicates, unknown, wrong_event, expired, capture_rate}, recent[{id, result, result_label, scanned_at, station_id, was_offline, who}] (12)` | `NOT_FOUND` |
| POST | `/participation/events/{event_id}/scan` | door | `token, station_id?, scanned_at?` | ScanOutcome — always 200, rejections included. A waitlisted student (profile QR, or a stray pass on a waitlisted row) is admitted as `spot_registered` only if a place is free, else `not_registered` "On the waitlist, but no place has opened" | `NOT_FOUND`, `VALIDATION_FAILED` |
| POST | `/participation/events/{event_id}/scan/sync` | door | `station_id?, scans[{token, scanned_at?, ref?}]` | `synced, accepted, duplicates, results[ScanOutcome], counters{checked_in, registered, capacity}` | `NOT_FOUND`, `VALIDATION_FAILED` |
| POST | `/participation/events/{event_id}/check-in` | door | `student_id? \| prn?, station_id?` | ScanOutcome (`source` manual on walk-in) | `PARTICIPATION_STUDENT_NOT_FOUND` 404, `VALIDATION_FAILED` |
| GET | `/participation/events/{event_id}/roster?attended=1` | dean, admin, organiser of the event, or `DOOR_STAFF` of the club | — | `event{id, title}, counts{registered (confirmed only), waitlisted, attended}, results[{id, prn, full_name, department, programme, year, source, waitlisted, attended, checked_in_at, station_id}]` (waitlisted rows are included in `results`); every read writes audit `roster.read` naming the reader | `NOT_FOUND` 404 (deliberately not 403) |
| POST | `/participation/events/{event_id}/scan-session` | door | — | `access_token, token_type, expires_at (unix), scan_event` — token valid until `ends_at + 4 h`, bound to this event | `NOT_FOUND` |

### feedback (`/api/v1/feedback/…`)

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| POST | `/feedback/events/{event_id}` | student with an attended, uncancelled registration; event `completed`/`reported` | `rating (1..5), would_recommend (bool), comment? (≤2000)` | `id, event, rating, would_recommend, comment, created_at` 201 | `NOT_FOUND` 404 (event), `FEEDBACK_NOT_ATTENDED` 403 (no `student_id` claim, or not checked in), `FEEDBACK_NOT_OPEN` 409, `FEEDBACK_ALREADY_SUBMITTED` 409, `VALIDATION_FAILED` |
| GET | `/feedback/events/{event_id}/summary` | dean, admin, cultural_society, or president/VP/secretary/treasurer of the event's club (`EVENT_OPERATORS ∪ BUDGET_VIEWERS`) — **not** the VC, members or attendees | — | FeedbackSummary | `NOT_FOUND` 404 (event, or deliberately instead of 403) |

No endpoint lists or reads individual feedback rows.

### budget (`/api/v1/budget/…`)

Visibility (`BudgetViewSet.get_queryset`): staff (`can_see_all_clubs`: dean, VC, admin, cultural_society) see all; otherwise only budgets of clubs where the caller is in `BUDGET_VIEWERS`; everyone else gets 404. A Dean-stage delegate is not staff and sees nothing here.

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/budget/budgets` | per visibility | — | Page<BudgetOut> | — |
| GET | `/budget/budgets/{id}` | per visibility | — | BudgetOut | `NOT_FOUND` |
| POST | `/budget/budgets/{id}/lines` | `BUDGET_PREPARERS` | `head (≤120), amount_requested, basis?` | BudgetOut 201 | `BUDGET_PREPARE_DENIED` 403, `BUDGET_LOCKED` 409, `BUDGET_LINE_HEAD_REQUIRED` 422, `BUDGET_LINE_NEGATIVE` 422, `BUDGET_LINE_DUPLICATE_HEAD` 409 |
| PUT | `/budget/budgets/{id}/lines/{line_id}/edit` | `BUDGET_PREPARERS` | `head?, amount_requested?, basis?` | BudgetOut | as above + `NOT_FOUND` (line) |
| DELETE | `/budget/budgets/{id}/lines/{line_id}/remove` | `BUDGET_PREPARERS` | — | BudgetOut (200) | `BUDGET_PREPARE_DENIED` 403, `BUDGET_LOCKED` 409, `NOT_FOUND` |
| POST | `/budget/budgets/{id}/declare-nil` | `BUDGET_PREPARERS` | `reason (5..400 chars)` | BudgetOut | `BUDGET_PREPARE_DENIED` 403, `BUDGET_LOCKED` 409, `BUDGET_NIL_REASON_REQUIRED` 422, `BUDGET_NIL_HAS_LINES` 409 |
| POST | `/budget/budgets/{id}/withdraw-nil` | `BUDGET_PREPARERS` | — | BudgetOut | `BUDGET_PREPARE_DENIED` 403, `BUDGET_LOCKED` 409 |
| PATCH | `/budget/budgets/{id}/lines/{line_id}` | `BUDGET_SETTLERS` | `amount_spent? (nullable), variance_note? (≤400)` | BudgetOut | `BUDGET_SPEND_DENIED` 403, `NOT_FOUND`, `BUDGET_ALREADY_SETTLED` 409 |
| POST | `/budget/budgets/{id}/lines/{line_id}/receipts` | `BUDGET_SETTLERS` | multipart: `file` (exact allowlist `application/pdf, image/jpeg, image/png, image/webp, image/heic` — `image/svg+xml` is refused), `amount?`, `vendor?`, `document_date? (YYYY-MM-DD)`, `supersedes?` (receipt id) | ReceiptOut 201 | `BUDGET_SPEND_DENIED` 403, `NOT_FOUND`, `BUDGET_RECEIPT_MISSING` 422, `BUDGET_RECEIPT_TYPE` 422, `BUDGET_RECEIPT_AMOUNT` 422, `BUDGET_RECEIPT_DATE` 422 |
| GET | `/budget/budgets/{id}/lines/{line_id}/receipts/{receipt_id}/file` | per visibility (`BUDGET_VIEWERS` of the club, dean, VC, society, admin) | — | the bytes: local store streams `FileResponse` with the stored `content_type` inline when it is on the allowlist, else `application/octet-stream` as attachment; headers `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`; platform store → 302 to `FileStore.url_for(key)` with `Cache-Control: private, no-store`. Superseded receipts are still served | `NOT_FOUND` 404 (budget/line/receipt), `BUDGET_RECEIPT_FILE_MISSING` 404 (key escapes the bucket, or file gone) |
| POST | `/budget/budgets/{id}/settle` | `BUDGET_SETTLERS` | — | BudgetOut (stage settled) | `BUDGET_SPEND_DENIED` 403, `BUDGET_NOT_SANCTIONED` 409, `BUDGET_EVENT_NOT_RUN` 409, `BUDGET_SETTLEMENT_INCOMPLETE` 422 (errors: `NO_SPEND_ENTERED`, `RECEIPT_REQUIRED` on `lines.{id}.receipts`, `VARIANCE_NOTE_REQUIRED` on `lines.{id}.variance_note`) |
| GET | `/budget/budget-templates?expected_attendance=80` | authenticated | — | `expected_attendance, templates[{name, event_kind, lines[{head, basis, rate, amount, explanation}], contingency{percent, amount}, total_requested, requires_vc, vc_threshold}]` | — |
| GET | `/budget/envelopes/{club_id}?year=` | `BUDGET_VIEWERS` of the club, dean, VC, society, admin | — | EnvelopeOut (default year = current calendar year in `DISPLAY_TIME_ZONE`; `amount`/`remaining` null when no envelope is set) | `NOT_FOUND` 404 (club, or deliberately instead of 403), `BUDGET_ENVELOPE_YEAR` 422 (not an int in 2000..2100) |
| PUT | `/budget/envelopes/{club_id}` | dean, admin | `year (2000..2100), amount (≥ 0, 2 dp)` | EnvelopeOut (upsert; audit `budget.envelope_set` with the previous amount) | `NOT_FOUND` 404, `BUDGET_ENVELOPE_DENIED` 403, `BUDGET_ENVELOPE_NEGATIVE` 422, `VALIDATION_FAILED` |

Settlement rules (`budget/services.settlement_problems`, only evaluated when `is_settleable` and not nil): at least one line with `amount_spent`; any line with `amount_spent > RECEIPT_THRESHOLD` needs a current receipt; any overspent line needs a non-empty `variance_note`. A nil budget settles unconditionally once sanctioned and the event has run.

### governance (`/api/v1/governance/…`)

Visibility: staff see all approval requests; club-role holders see their clubs'; an active delegate additionally sees the **pending** requests at the stage they cover (and loses sight of them once decided); others none. Filters `state`, `stage`.

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/governance/approvals` | per visibility | — | Page<ApprovalOut> | — |
| GET | `/governance/approvals/queue?escalated=1` | authenticated (empty unless a stage is held by role or active delegation) | — | `stages_you_hold[] (role ∪ delegated), stages_delegated_to_you[], sla_hours, escalated_only, count, results[ApprovalOut]` — pending at the caller's stages, **ordered by `stage_entered_at` then `created_at`** (oldest first, no longer by event start); `?escalated=1\|true` keeps only `stage_entered_at < now − APPROVAL_SLA_HOURS` | — |
| GET | `/governance/approvals/{id}` | per visibility | — | ApprovalOut | `NOT_FOUND` |
| POST | `/governance/approvals/{id}/decide` | holder of `current_stage`'s role **or its active delegate**, not holding any role in the submitting club; MFA for VC stage / above threshold, and always for a delegate | `decision (approve\|return\|reject), comment?, sanctioned?{<line_id>: amount}` | `step: StepOut, request: ApprovalOut` (step carries `on_behalf_of` for a delegated decision) | `NOT_FOUND`, `GOVERNANCE_CLASH_UNRESOLVED` 409 (view pre-check; also raised inside `decide` at the final gate under the venue lock, and for the Postgres exclusion constraint), `BUDGET_SANCTION_UNREADABLE` 422, `GOVERNANCE_ALREADY_RESOLVED` 409, `GOVERNANCE_WRONG_STAGE` 409, `GOVERNANCE_NOT_APPROVER` 403, `GOVERNANCE_SELF_APPROVAL` 403, `GOVERNANCE_MFA_REQUIRED` 403, `GOVERNANCE_COMMENT_REQUIRED` 422, `BUDGET_UNKNOWN_LINE` 422, `BUDGET_SANCTION_EXCEEDS_REQUEST` 422 |
| GET | `/governance/delegations?stage=&active=1` | authenticated: own (as principal or delegate); admin sees all | — | Page<DelegationOut> (`active=1` keeps rows `in_force` now) | — |
| GET | `/governance/delegations/{id}` | per visibility | — | DelegationOut | `NOT_FOUND` |
| POST | `/governance/delegations` | holder of the stage's role (for themselves) or admin (may name `principal_user`) | `stage, delegate_user (uuid), principal_user? (uuid, admin only), starts_at, ends_at, reason? (≤400)` | DelegationOut 201; audit `delegation.created`; delegate notified `delegation.granted` | `GOVERNANCE_DELEGATION_DENIED` 403 (no account record, not the role holder, or non-admin naming a principal), `GOVERNANCE_DELEGATE_UNKNOWN` 422, `GOVERNANCE_PRINCIPAL_UNKNOWN` 422, `GOVERNANCE_UNKNOWN_STAGE` 422, `GOVERNANCE_PRINCIPAL_NOT_HOLDER` 422, `GOVERNANCE_DELEGATE_IS_PRINCIPAL` 422, `GOVERNANCE_DELEGATE_INACTIVE` 422, `GOVERNANCE_DELEGATION_WINDOW` 422, `GOVERNANCE_DELEGATION_TOO_LONG` 422 (> `DELEGATION_MAX_DAYS`), `GOVERNANCE_DELEGATE_NOT_STAFF` 422 (`vc` stage, non-staff delegate, non-admin creator), `VALIDATION_FAILED` |
| POST | `/governance/delegations/{id}/revoke` | the principal, or admin (the delegate may see it but not end it) | — | DelegationOut (revoked); audit `delegation.revoked`; delegate notified `delegation.revoked` | `NOT_FOUND`, `GOVERNANCE_DELEGATION_DENIED` 403, `GOVERNANCE_DELEGATION_REVOKED` 409 |
| GET | `/governance/notifications?unread=1` | authenticated (own only) | — | Page<{id, subject, body, kind, link, read_at, created_at}> | — |
| GET | `/governance/notifications/unread-count` | authenticated | — | `unread` | — |
| POST | `/governance/notifications/mark-read` | authenticated | — | `marked` | — |
| GET | `/governance/audit?target_id=&action=` | dean, admin, vice_chancellor | — | `results[{id, actor, action, target_type, target_id, before, after, reason, created_at}]` (≤200, unpaginated) | `GOVERNANCE_AUDIT_DENIED` 403 |

### reporting (`/api/v1/reporting/…`)

All accept `?semester=<id>`; default is the `is_current` semester, else the first.

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| GET | `/reporting/reports/semester` | dean, vice_chancellor, admin, cultural_society | — | `semester{id, name, starts_on, ends_on}, events_run, total_participation, unique_students, external_participants, avg_attendance, by_club[{club_id, club, tag, category, events_run, attendance}], by_category[{category, clubs_active, events_run, attendance}], by_department[{department, students_reached, attendance}], money{requested, sanctioned, spent}, events[{id, title, club, starts_at, attended, registered, photos, social_links, sanctioned, spent}], caveats[]` — aggregates only, no PRNs. `by_category.clubs_active` = clubs in the category with ≥1 completed event this semester, not clubs registered in it; `events[].registered` excludes waitlisted rows | `REPORTING_DENIED` 403, `REPORTING_NO_SEMESTER` 422 |
| GET | `/reporting/reports/semester?format=csv` and `/reporting/reports/semester/csv` | same | — | `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="semester-report-YYYY-MM.csv"`, rendered from the same dict as the JSON (`reporting/export.py`): a UTF-8 BOM, then blocks tagged in a `section` column — `semester`, `totals` (events_run, total_participation, unique_students, external_participants, avg_attendance), `money`, `by_club`, `by_category`, `by_department`, `caveats`. **No `events` block** (no titles). Cells starting with `= + - @ \t \r` are prefixed with `'`. Errors on this route are still `application/problem+json` | as above |
| GET | `/reporting/reports/overview` | dean, admin, cultural_society | — | `semester (name), pending_approvals, pending_by_stage{stage: n}, escalated_approvals[{id, event_id, event_title, club, stage, age_hours, stage_entered_at, submitted_at}], venue_clashes, clubs_active, clubs_total, clubs_inactive[names] (active clubs with nothing completed this semester), dormant_clubs (count flagged by the job), missing_evidence[{id, title, club, missing[]}], events_missing_photos[{id, title, club}], events_missing_social_links[{id, title, club}], venue_use[{venue__name, bookings}], capture{scan_attempts, scans_accepted, scan_success_rate, attended, attended_by_scan, scan_capture_rate, capture_rate}` | `REPORTING_DENIED` 403, `REPORTING_NO_SEMESTER` 422 |

Two capture metrics (`reporting/serializers.CaptureMetricsSerializer`, B-11): `scan_success_rate` = `ScanRecord`s with result `accepted|spot_registered` / all `ScanRecord`s of the semester's reportable events (what the code computed before; manual PRN entries also write a `ScanRecord`, so they count as attempts); `scan_capture_rate` = attended uncancelled registrations with `source != manual` / attended (the documents' definition). `capture_rate` is an **alias of `scan_capture_rate`**, i.e. its meaning changed from the pre-wave-1 value. Both are `null` when the denominator is zero.

### jobs (`/api/v1/jobs/…`)

Outside the JWT scheme: `JobTriggerView` has `authentication_classes = permission_classes = throttle_classes = ()` and checks `Authorization: Bearer <JOBS_TOKEN>` itself with `hmac.compare_digest` (scheme case-insensitive, token whitespace-trimmed). A user's bearer token is refused. The GET form exists because Vercel Cron only issues GET and sends `Authorization: Bearer $CRON_SECRET`; set `JOBS_TOKEN` to the same value.

| method | path | who may call | request body | response | error codes |
|---|---|---|---|---|---|
| POST / GET | `/jobs/{name}` — `rollup-scans`, `purge-external`, `flag-dormant`, `escalate-sla` | holder of `JOBS_TOKEN` | — | `job, started_at, finished_at, result{…}` (per-job keys in §2 *jobs*); audit `jobs.<name>` | `JOBS_DISABLED` 503 (token unset or < 32 chars — checked before the header is read), `JOBS_UNAUTHORIZED` 401 (missing/wrong token; logged with the remote address), `JOBS_UNKNOWN` 404, `JOBS_NOT_WIRED` 501 (a job's dependency missing from the build — unreachable on main, both dependencies are merged) |

### infrastructure routes

| method | path | notes |
|---|---|---|
| GET | `/api/v1/schema`, `/api/v1/docs`, `/api/v1/redoc` | drf-spectacular OpenAPI, Swagger UI, Redoc |
| GET | `/api/v1/` | DRF router root of the first included router (clubs) |
| any | `/django-admin/` | Django admin (session auth) |
| GET | `/`, `/demo/`, `/demo/<path>` | **DEMO_MODE only**: redirect to `/demo/index.html`; static files from `backend/demo/` |

---

## 7. Browser mirror differences

The mirror (`web-app/src/api.js`) is an in-memory/localStorage model with camelCase keys (`clubId`, `startsAt`, `amountRequested`, …) and a `Session` object in place of a JWT; it is called as `api.<group>.<fn>(ctx, …)` rather than over HTTP. Store collections (`seed.js`): `users, students, clubs, venues, memberships, events, semester, templates, budgets, approvals, registrations, passes, qrTokens, scans, notifications, audit, staffIds, attendancePlan`.

**Exposed by the mirror but absent from the backend**

- `budget.forEvent(ctx, eventId)` — the backend has no "budget by event" route; clients must read `event.budget.id` from EventOut and call `GET /budget/budgets/{id}`.
- `events.create` returns `{event, budget, approval, softClashes}`; the backend returns EventOut with `soft_clashes` and `approval` merged into it and no full budget.
- `events.reassign` returns `{from, to, reason}`; backend returns a `VenueReassignment` record.
- Mirror-only error codes: `EVENTS_END_BEFORE_START`, `EVENTS_OVER_CAPACITY`, `EVENTS_TITLE_REQUIRED`, `EVENTS_REASON_REQUIRED`, `CLUBS_UNKNOWN_ROLE` (all `VALIDATION_FAILED` on the backend), `PARTICIPATION_STATION_DENIED` (backend: `PERMISSION_DENIED` from `IsEventOrganiser`) and **`PARTICIPATION_EVENT_FULL`** (`web-app/src/attendance.js` still refuses a full event with 409; the backend has no such code since wave 1 — it creates a `waitlisted` registration instead).
- `events.create` ignores `capacity` and copies `venue.capacity`; `expectedAttendance` is checked against the venue, not against `capacity`.
- BudgetOut gains `eventTitle` and `eventStatus`; `budget.templates()` has no `event_kind`; `participation.myPasses` passes carry no `image` data URI; `myRegistrations` is an unpaginated array with a `pass` object instead of `pass_token`.
- Default `stationId` is `"GATE-1"` on scan/sync/check-in; the backend defaults to `""`.
- Record shapes are thinner: approval steps lack `actorRole`/`amountSanctioned`; notifications lack `kind`/`link`; audit entries lack `targetType`/`before`; receipts lack `fileKey`/`contentType`/`sha256`/`uploadedBySub`; budgets have no `fest`/`nilDeclaredBySub`; events have no `cancelledAt`/`cancelledReason`/`description`; clubs use `instagram` not `instagram_handle` and have no `description`; club `category` values only `cultural`/`literary` are seeded.

**Exposed by the backend but absent from the mirror**

- Everything wave 1 added: the waitlist (`Registration.waitlisted`, promotion, `PARTICIPATION_WAITLISTED`), the `feedback` app, club join (`join_mode`, `JoinRequest`, `/clubs/{id}/join`, join-requests accept/decline), office-bearer terms, `/handover` and `/office-bearers/history`, dormancy (`last_activity_at`), organiser grants (`/events/{id}/organisers`), delegation (`/governance/delegations`, `on_behalf_of`), SLA fields (`stage_entered_at`, `age_hours`, `escalated`, `?escalated=`), the annual envelope (`/budget/envelopes/{club_id}`, `BudgetOut.envelope`), receipt `vendor`/`document_date` and the receipt file route, `by_category`, the CSV export, the two capture metrics, the `jobs` app, the delete-status rule and the registration/publication/venue-move/handover notifications. The mirror's `join` flow in `FLOWS.md` §11 describes a design, not mirror code.
- All of `/module/auth/*` (mode, login, refresh, logout, me, demo personas), `/module/semesters`, `/participation/events/{id}/scan-session`, `/participation/registrations/{id}/reissue-pass`.
- Club CRUD (`POST/PUT/PATCH/DELETE /clubs`, `GET /clubs/{id}`); mirror has only `clubs.list`, `clubs.roster`, `clubs.setRole`.
- `PUT/PATCH/DELETE /events/{id}`, `GET /venues/{id}`; event filters `starts_at_after`/`starts_at_before`.
- Approval list filters `state`/`stage`; audit filters `target_id`/`action`; report `semester` query parameter; `attended` roster filter; `expected_attendance` is accepted by both but the mirror has no `per_day` basis.
- Pagination envelopes (`count/next/previous/results`) — the mirror returns bare arrays.
- `Fest`, `ExternalParticipant`, `ReferenceCode`, `RefreshToken`, `VenueReassignment`, `BudgetTemplateLine`, `ReceiptDocument.superseded_by` chaining (mirror flags `supersededBy` but never sets it), `imported` registration source, `key_id` on QR tokens/passes, `checked_in_by`, `station_id` on registrations (mirror stores `stationId` but as a string default `""`).
- Server-side QR images (`image` data URIs) and receipt file storage (`integrations/files.py`).

---

## 8. Design-document tables not modelled

`Database_And_Data_Flow` §2 says "twenty-two tables across six domains" but names 28 in its domain table. Against the backend models:

| design table | backend | notes |
|---|---|---|
| Club | `clubs.Club` | no `logo_url`, `founded_on`; `annual_budget_envelope` lives per year in `budget.ClubBudgetEnvelope`; `dormant_after_days` is the setting `DORMANCY_DAYS`; `last_event_at` ≈ `last_activity_at` (also touched by membership changes); `join_mode` added; no `proposed` status; category `social` vs doc `social_service` |
| Membership | `clubs.Membership` | no `assigned_by_id`, no `status` enum (`pending/active/declined/ended` collapsed into `ended_at`; the `pending` state is now the separate `JoinRequest` row); role changes tracked in `RoleChange` instead |
| OfficeBearerTerm | `clubs.OfficeBearerTerm` | `starts_at/ends_at` datetimes; `role` limited to president/VP/treasurer/secretary; the token derives club roles from it |
| ClubSocialHandle | **missing** | reduced to `Club.instagram_handle` |
| Fest | `events.Fest` | no `edition`, `theme`, `hero_image_url`, `budget_envelope`, `allows_external`, `public_page_slug`; status reuses `EventStatus` |
| FestRole | **missing** | |
| Event | `events.Event` | no `template_id`, `category`, `registration_closes_at`, `allows_teams`, `actual_attendance` (derived at read time); `created_by` is a User not a Student; `kind` added |
| EventTemplate | **missing** | `BudgetTemplate` covers budget heads only |
| Task | **missing** | |
| Volunteer | **missing** | (no `VolunteerShift` exists in the doc either; the table is `Volunteer`) |
| Sponsor | **missing** | |
| Venue | `events.Venue` | no `facilities`, `controlled_by`, `is_bookable` (`active` instead) |
| VenueBooking | **missing** | booking is `Event.venue` + `starts_at/ends_at`; moves recorded in `VenueReassignment`; the exclusion constraint exists on `events_event` (Postgres only, confirmed statuses, no buffer — see §4) |
| Registration | `participation.Registration` | `waitlisted` added; no `team_name`, `team_captain_id`, `custom_fields`; `imported` source added; `checked_in_by` is a User |
| ExternalParticipant | `participation.ExternalParticipant` | no `fest_id`, `registration_ref`, `qr_token`; `college` renamed `institution`; `email/phone/purge_after` nullable; `purged_at` added (purge blanks, never deletes) |
| StudentQRToken | `participation.StudentQRToken` | adds `version`, `key_id`, `revoked_at` |
| EventPass | `participation.EventPass` | adds `revoked_at`, `key_id`; FK not OneToOne |
| ScanRecord | `participation.ScanRecord` | adds `offline_ref`, `synced_at`, `detail` |
| BudgetTemplate | `budget.BudgetTemplate` + `BudgetTemplateLine` | split into two tables |
| BudgetLine | `budget.BudgetLine` | owner moved to new `Budget` table (`event` xor `fest`); adds `is_nil` declaration on `Budget` |
| ReceiptDocument | `budget.ReceiptDocument` | adds `sha256`, `byte_size`, `superseded_by`; `vendor` and `document_date` added in wave 1 |
| EventPhoto | **missing** | reduced to `Event.photo_count` |
| EventSocialPost | **missing** | reduced to `Event.social_links` JSON list of URLs |
| EventReport | **missing** | no outcomes/learnings text anywhere |
| Feedback | `feedback.Feedback` | rating 1..5 CHECK, UNIQUE (event, student); adds `registration` FK and `would_recommend` |
| ApprovalRequest | `governance.ApprovalRequest` | event-only (no generic `target_type/target_id`); adds `stages`, `current_stage`, `requires_vc`, `vc_reason`; state adds `withdrawn` |
| ApprovalStep | `governance.ApprovalStep` | one row per decision taken (no pre-created pending steps, no `sequence`); adds `actor_role`, `mfa_verified`, `amount_sanctioned`, `on_behalf_of`; stage adds `cultural_society` |
| AuditLog | `governance.AuditEntry` | `before/after` JSON instead of `payload`; `actor_sub` is a string, not an FK |

Not in the design document but present in the backend: `identity.User`, `identity.Student` (the doc treats Student as SIS-owned), `identity.ReferenceCode`, `identity.Semester`, `identity.RefreshToken`, `clubs.RoleChange`, `clubs.JoinRequest`, `events.VenueReassignment`, `events.EventOrganiser`, `budget.Budget`, `budget.BudgetTemplateLine`, `budget.ClubBudgetEnvelope`, `governance.Notification`, `governance.Delegation`.

Names the brief expected that do not appear in the design document at all: `VolunteerShift` (doc: `Volunteer`), `Waitlist` (doc: `Registration.waitlisted` flag — now present), `BlackoutPeriod` (not mentioned, not built). Summary of design tables still missing after wave 1: **ClubSocialHandle, FestRole, EventTemplate, Task, Volunteer, Sponsor, VenueBooking (as a table — the constraint exists), EventPhoto, EventSocialPost, EventReport** (10 of 28). `OfficeBearerTerm` and `Feedback` were built in wave 1.
