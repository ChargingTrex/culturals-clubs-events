# API Reference — Student Management Portal

**Status: proposed.** Version 0.1 · Drafted 2026-09-24

This document proposes the platform's API surface across all twelve modules. It
is not binding. The two documents in `../shared/` are binding on both teams, and
where this reference and either of them disagree, they win:

| Binding document | What it fixes |
|---|---|
| `../shared/API_Standards_Integration_Contract.docx` | Namespaces, status codes, error format, pagination, wire types, idempotency, versioning |
| `../shared/Identity_Login_Shared_Data.docx` | Identifiers, name and email handling, PRN, status lifecycle, claims, token lifetimes, MFA, caching |

Everything below is the application of those rules to the platform's modules.
The conventions sections restate only what you need to read an endpoint table
without a second document open; the binding documents carry the reasoning.

Two things to know before reading further:

1. **The Clubs & Events module is the worked example.** It is being built first
   (P-06) against these same conventions, and its implementation is the
   reference for every core mechanism named in §3. Where this document says
   "as the module does", there is working code to copy.
2. **Open questions are marked inline, not collected at the end.** An endpoint
   whose behaviour depends on an unanswered question carries a **⚠ blocked by**
   line. Per PLATFORM_AGENT_PROMPT §9, do not assume a value for one of these —
   the endpoint is not implementable until it is answered.

---

## 1. Namespace map

The reserved namespaces in API_Standards §3.1 are fixed. Each of the twelve
modules maps onto one, except where noted.

| Module | Namespace | Squad |
|---|---|---|
| Identity | `/api/v1/auth/`, `/api/v1/core/` | S2 |
| Student records | `/api/v1/sis/` | S3 |
| Academics | `/api/v1/academics/` | S3 |
| Attendance | `/api/v1/attendance/` | S4 |
| Examinations | `/api/v1/exams/` | S4 |
| Fees | `/api/v1/fees/` | S5 |
| Hostel and mess | `/api/v1/campus/` | S6 |
| Requests and approvals | `/api/v1/requests/` | S6 |
| Administration | `/api/v1/admin/` | S10 / S12 |
| Campus life | `/api/v1/clubs/`, `/events/`, `/participation/`, `/budget/`, `/fests/` | S7 (module team) |
| **Communications** | **none reserved** — see below | S2 |
| **Reporting** | **none reserved** — see below | S8 |

### ⚠ Two modules have no namespace

API_Standards §3.1 reserves `core, sis, academics, attendance, exams, fees,
campus, requests, admin, auth`. Communications and reporting are both named as
modules in PLATFORM_AGENT_PROMPT §1 and both have an owning squad, but neither
has a path. That is a gap in the binding contract, not a decision this document
can take (§1.1: "neither team changes this document unilaterally").

This reference assumes, pending agreement:

- **Communications** lives under `/api/v1/core/` — notifications are already
  specified there (Contract §5.2), and announcements are the same service with a
  different recipient selector. No new namespace needed.
- **Reporting** needs its own: `/api/v1/reporting/`. It cannot live under `core`
  without making the shared core depend on every module it reports on, which
  inverts the dependency direction the modular monolith rests on (P-03).

**Raise as API-07 before S8 writes a path.** Adding `reporting` to the reserved
list requires both teams to agree, and the module team must confirm it does not
collide with anything they serve.

---

## 2. Conventions

Restated from API_Standards §3. Read that document for why.

**Paths.** Plural nouns; lowercase with hyphens; nesting one level only;
non-CRUD actions as a verb sub-resource (`POST /exams/{id}/publish`).

**Bodies.** `snake_case` on the wire, always. The frontend converts if it wants
camelCase.

**Types.** UUID v4 strings for every identifier · ISO 8601 UTC with `Z` for
timestamps · date-only strings for dates · **money as a string with two
decimals, never a JSON number** · ISO 4217 currency, always explicit ·
`lower_snake_case` enums · absent values as `null`, never omitted, never `""`.

**Status codes.** 200 · 201 (with `Location`) · 204 · 400 malformed · 401 no or
bad credentials · 403 authenticated but not permitted · 404 not found *or found
and not visible to this caller* · 409 conflict · 422 validation failed · 429
rate limited.

> **403 versus 404.** Where the existence of the object is itself a disclosure —
> another student's record, another department's marks, another club's budget —
> the queryset excludes it and the caller gets 404. A 403 confirms it exists.
> This is a query-level rule: scope the queryset, do not filter the response.

**Errors.** RFC 9457 problem details, identical in both systems:

```json
{
  "type":     "https://portal.college.edu/errors/mark-already-published",
  "title":    "Mark already published",
  "status":   409,
  "detail":   "CS201 results were published on 2026-05-14 and need a correction request.",
  "instance": "/api/v1/exams/marks/9f1c…",
  "code":     "EXAMS_MARK_PUBLISHED",
  "errors":   [ { "field": "score", "code": "IMMUTABLE", "message": "Raise a correction." } ],
  "trace_id": "01J8XQ…"
}
```

`code` is what clients branch on — SCREAMING_SNAKE, prefixed by the owning
namespace, never reused for a different meaning. `detail` is prose and may
change; nothing parses it. `errors` appears only on validation failures.
`trace_id` is echoed from `X-Trace-Id` when the caller supplies one, which is
what makes a failure that crosses the module boundary traceable.

**Pagination.** Every list endpoint, no exceptions. `?page=&page_size=&ordering=`
returning `{count, next, previous, results}`. Default 25, maximum 200, a larger
request clamped rather than rejected. Date range filters take `_after` and
`_before` suffixes.

**Idempotency.** Any POST with financial or attendance consequence accepts an
`Idempotency-Key` header and replays the original response for 24 hours. Required
on: check-in scans, payment records, registration creation, mark submission,
and every bulk import. This is what makes offline scan replay and gateway
retries safe.

**Unknown values.** Consumers tolerate unknown fields and unknown enum values
(Contract §6.3). An endpoint that crashes on a new enum value makes adding one a
breaking change, which defeats independent evolution.

---

## 3. What the shared core owns

P-02 and rule 7 of PLATFORM_AGENT_PROMPT §3: no module builds its own login,
notification channel or permission system. Concretely, `backend/core/` owns
these five mechanisms, and every other app imports them rather than reimplementing:

| Mechanism | What it does | Reference implementation in the module |
|---|---|---|
| Claims authentication | Turns a bearer token into a claims object; the view layer never learns which mode issued it | `../clubs-and-culturals-platform/app/backend/identity/authentication.py` |
| Problem-detail handler | Every error, from every app, in the RFC 9457 shape | `.../common/errors.py` |
| Standard pagination | 25 default, 200 maximum, clamped | `.../common/pagination.py` |
| Trace-id middleware | Honours inbound `X-Trace-Id`, echoes it on the response and into logs | `.../common/middleware.py` |
| Adapter registry | One configuration switch selecting an implementation per concern | `.../integrations/registry.py` |

The last one is the platform's inheritance from the standalone-first principle
(Contract §2). The module ships `local` and `platform` implementations of
identity, directory, notifications, files and audit. When the platform exists it
becomes the `platform` side of that switch — so **the platform's core services
must match those interface signatures**, not merely resemble them. They are in
Contract §5 and they are binding.

**Authorisation is always local (Contract §4.4).** A token carrying
`faculty_section:<uuid>` authorises nothing by itself. The owning module checks
that this section belongs to this faculty member, on the server, on every
request. Object-level scope is checked as often as role is.

---

## 4. Authentication — `/api/v1/auth/`

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/mode` | Which login flow this deployment uses; lets one frontend build serve SSO and password modes |
| GET | `/auth/authorize` | Begins the SSO redirect (platform mode) |
| POST | `/auth/callback` | Exchanges the provider's code for a portal token pair |
| POST | `/auth/refresh` | Rotates the refresh token, returns a new access token |
| POST | `/auth/logout` | Revokes the refresh token immediately; the access token expires naturally |
| GET | `/auth/me` | The caller's claims plus advisory capabilities |
| POST | `/auth/mfa/challenge` | Issues a second-factor challenge |
| POST | `/auth/mfa/verify` | Verifies it and re-issues the token with `mfa: true` |
| GET | `/auth/jwks` | Public keys; every module validates signatures against this, never a shared secret |

**Claims are the fixed contract** (Identity §5.4) — `sub`, `iss`, `aud`, `iat`,
`exp`, `email`, `student_id`, `prn`, `display_name`, `roles`, `department`,
`programme`, `year`, `mfa`. Every claim is present in both modes; optional values
are `null`, never omitted. `full_name` is deliberately absent.

**Lifetimes** (Identity §5.3): access 15 minutes · refresh 7 days sliding,
rotated on use, reuse of a consumed token revokes the whole family · staff and
admin capped at 8 hours absolute · scan-station sessions run event duration plus
4 hours and are bound to one event.

**MFA** is mandatory for registrar, administration, finance, Dean, VC and IT
admin, and — regardless of role — for publishing results, sanctioning above the
escalation threshold, and correcting a published mark. That last set is checked
from the `mfa` claim at the point of the action, independently of role.

**Revocation.** A status change to `suspended` or `withdrawn` revokes all active
sessions in both systems immediately, without waiting for expiry.

> ⚠ **Blocked by ID-03 / PO-01** (which provider backs SSO) and **ID-07** (is MFA
> available on it today). `/auth/authorize` and `/auth/callback` cannot be
> designed against an assumed directory. PLATFORM_AGENT_PROMPT §10 says S2 must
> flag this before building identity in Phase 0.

---

## 5. Core services — `/api/v1/core/`

### 5.1 Users, roles and reference data

| Method | Path | Purpose | Who |
|---|---|---|---|
| GET | `/core/users/{id}` | One user's identity record | Self, or staff with a reason logged |
| GET | `/core/users?ids=…` | Batch, max 200 | Any module service |
| GET | `/core/roles` | The fixed role vocabulary | Any authenticated caller |
| POST | `/core/users/{id}/roles` | Grant a role, optionally scoped | Super admin; registrar within scope |
| DELETE | `/core/users/{id}/roles/{role}` | Revoke | Same |
| GET | `/core/reference/departments` | Shared code list | Any |
| GET | `/core/reference/programmes` | Shared code list | Any |
| GET | `/core/config` | PRN regex, thresholds, feature flags, integration mode | Any |

**Role naming** (Contract §4.3): `student` · `club_president:<uuid>` ·
`module_club_member`. Institution-wide roles are the platform's; club-internal
roles are the module's and the platform only carries them in the token. Neither
side invents one belonging to the other.

**Codes are never redefined.** If CSE splits, new codes are created. A module
that meets an unrecognised code surfaces it as unknown and logs it — it never
maps it to something plausible.

> ⚠ **Blocked by ID-01** (PRN format and regex) and **ID-05** (department and
> programme code list). `/core/config` serves the PRN regex precisely so it is
> not hard-coded in two codebases, and it cannot serve a value nobody has agreed.
> Both are answerable in one conversation with the registrar and both block work
> on both sides today.

### 5.2 Notifications and announcements

| Method | Path | Purpose |
|---|---|---|
| POST | `/core/notifications` | Send to users or to a role. `202 {notification_id, queued}` |
| GET | `/core/notifications` | The caller's own inbox, paginated |
| POST | `/core/notifications/{id}/read` | Mark read |
| POST | `/core/notifications/read-all` | Mark all read |
| GET/POST | `/core/announcements` | Broadcast to an audience selector; drafts, scheduling, expiry |
| GET | `/core/templates` | Notification templates and their required context keys |

Request shape is fixed by Contract §5.2: `recipients` (either `user_ids` or a
`role`), `channels`, `template`, `context`, `source`, `idempotency_key`.

**Channels are `in_app` and `email` only, and the platform enforces it.** Any
other channel is rejected with 422 — a policy enforced only in each caller is
eventually broken by one of them. This is P-08 and it is not revisitable.

### 5.3 Audit

| Method | Path | Purpose |
|---|---|---|
| POST | `/core/audit` | Record a consequential write. `202`, fire-and-forget |
| GET | `/core/audit` | Search by actor, target, action, date range | Super admin, and statutory reviewers within their module |

An audit write never blocks or fails the operation it records. Modules keep their
own audit table regardless and mirror upward — losing the trail because the
platform was briefly unavailable is not acceptable.

Every consequential write carries an audit entry (Definition of Done). So does
every access to identity data beyond a caller's own record (Identity §7).

### 5.4 Files

| Method | Path | Purpose |
|---|---|---|
| POST | `/core/files/upload-url` | Pre-signed upload URL + `file_id` |
| GET | `/core/files/{id}/download-url` | Short-lived signed download URL |

Bytes go directly to object storage. Neither system proxies file content through
its application servers — a hall of organisers uploading photos would otherwise
saturate the API tier. The database holds references only.

---

## 6. Student records — `/api/v1/sis/`

| Method | Path | Purpose | Who |
|---|---|---|---|
| GET | `/sis/students/{id}` | One student | Self, guardian with consent, faculty for their sections, staff |
| GET | `/sis/students?prn=21CS1042` | Desk lookup by the human key | Staff, organisers for their own event |
| GET | `/sis/students?ids=…` | **Batch, max 200** | Any module service |
| PATCH | `/sis/students/{id}` | Correct a record; audited, name changes recorded | Registrar |
| POST | `/sis/students/{id}/status` | Status transition; emits the revocation signal | Registrar |
| GET | `/sis/students/{id}/guardians` | Linked guardians and consent state | Self, registrar |
| POST | `/sis/imports` | Staged import with `dry_run`, returns a reconciliation report | Registrar, S1 |
| GET | `/sis/imports/{id}` | Import status and its reconciliation report | Same |

**Batch lookup is required, not optional.** A scan station resolving 400
attendees one request at a time is unusable.

**SIS is read-only to every other module.** No module has a write path into a
student record. Club participation never touches an academic record.

**Names** (Identity §3.2): `full_name` is one Unicode field, never split into
first and last. Validation is non-empty and under 160 characters and nothing
more — every structural rule beyond that (requires a space, requires two words,
rejects dots) rejects real students. Store what the registrar entered; do not
transliterate, strip diacritics or title-case on write.

**Status lifecycle** (Identity §3.5): `provisional` · `active` · `on_leave` ·
`graduated` · `withdrawn` · `suspended`. Records outlive accounts — a graduated
or withdrawn student's registrations, attendance and memberships are never
deleted. The account is deactivated; the rows remain.

**Nothing is bulk-loaded without validation** (§5, legacy migration rule).
`/sis/imports` is staged with dry runs and a reconciliation report, and there is
no endpoint that skips it. Historical activity data is not reconstructed at all.

> ⚠ **Blocked by PO-09** (what a parent may see, and the consent mechanism) for
> `/sis/students/{id}/guardians` and for every guardian-scoped read elsewhere in
> this document.

---

## 7. Academics — `/api/v1/academics/`

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/academics/courses` | Course catalogue |
| GET/POST | `/academics/sections` | Sections of a course, with assigned faculty |
| GET/POST | `/academics/enrolments` | Student ↔ section |
| GET | `/academics/timetable?section=&student=&faculty=` | Resolved timetable for one viewer |
| GET/POST | `/academics/semesters` | The academic calendar |
| GET | `/academics/semesters/current` | What "this semester" means right now |

**The calendar is a platform service and the module reads it, never defines it**
(Identity §4). Every module that bounds a report by semester — participation,
attendance, fees — takes the boundary from here, so two modules cannot disagree
about when a semester ended.

Faculty write access is **to their own sections**, not to the sections table. The
queryset is scoped by the `faculty_section:<uuid>` claims the caller holds.

---

## 8. Attendance — `/api/v1/attendance/` · statutory

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/attendance/sessions` | A class occurrence for a section |
| POST | `/attendance/sessions/{id}/marks` | Record attendance. **Idempotency-Key required** |
| PATCH | `/attendance/marks/{id}` | Correction — reason mandatory, audited, never silent |
| GET | `/attendance/students/{id}/summary?semester=` | Per-student percentage |
| GET | `/attendance/sections/{id}/register` | The section register |
| GET | `/attendance/shortage?threshold=` | Students below the minimum |
| POST | `/attendance/corrections` | Request a correction to a closed period |
| POST | `/attendance/corrections/{id}/approve` | Second authorisation |

**Statutory bar** (PLATFORM_AGENT_PROMPT §4). Corrections are a documented,
tested procedure with an audit trail, not a PATCH nobody reviews. A correction to
a closed period needs a second authorisation. No destructive migration; rollback
tested against a production-shaped dataset.

> ⚠ **Blocked by PO-05** — minimum attendance percentage and condonation policy.
> `/attendance/shortage` computes a number that determines whether a student may
> sit an examination. A guessed threshold produces a confidently wrong list.

---

## 9. Examinations — `/api/v1/exams/` · statutory

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/exams/exams` | Examination definitions |
| GET/POST | `/exams/schedules` | Timetable, rooms, seating |
| POST | `/exams/marks` | Enter marks. **Idempotency-Key required** |
| POST | `/exams/marks/moderate` | Moderation pass, before publication |
| POST | `/exams/exams/{id}/publish` | **Requires `mfa: true`.** Marks become immutable |
| GET | `/exams/results?student=&semester=` | Results for one student |
| GET | `/exams/students/{id}/transcript` | Official transcript — uses `full_name`, never `display_name` |
| POST | `/exams/corrections` | Correction to a published mark |
| POST | `/exams/corrections/{id}/authorise` | **Dual authorisation.** Two distinct approvers, both recorded |

A published mark is immutable through `/exams/marks`; the only path to changing
one is a correction carrying two authorisations and an audit entry. Attempting
the direct write returns `409 EXAMS_MARK_PUBLISHED` pointing at the correction
endpoint.

> ⚠ **Blocked by PO-06** — grading rules and result computation. Do not implement
> a grade calculation against an assumed rule: "a guessed grading rule produces
> confidently wrong transcripts" (PLATFORM_AGENT_PROMPT §8.4).

---

## 10. Fees — `/api/v1/fees/` · statutory

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/fees/structures` | Fee heads and amounts per programme and year |
| GET/POST | `/fees/concessions` | Waivers and scholarships, with approval |
| GET | `/fees/invoices?student=` | A student's dues |
| POST | `/fees/payments` | Record a payment. **Idempotency-Key required** |
| POST | `/fees/payments/webhook` | Gateway callback — idempotent, signature-verified |
| GET | `/fees/payments/{id}/receipt` | Receipt document reference |
| POST | `/fees/refunds` | Refund against a payment; dual authorisation |
| GET | `/fees/reconciliation?period=` | Portal versus finance system |

**Money is a string with two decimals and an explicit ISO 4217 currency, on
every request and every response.** JSON numbers are IEEE floats in most
parsers; ₹12500.10 arriving as 12500.099999 is a class of bug this removes
entirely.

**Duplicate and failed payments are the most common real-world failure and are
handled explicitly** (PLATFORM_AGENT_PROMPT §4). A repeated gateway callback with
the same key returns the original result and creates nothing. A payment recorded
against an invoice already settled returns `409 FEES_ALREADY_SETTLED` rather than
a second row.

**The finance system remains authoritative for accounts** (P-05). The portal
collects and reconciles; it is not an accounting replacement.

> ⚠ **Blocked by PO-07** — fee structures, concessions and gateway choice.
> `/fees/payments/webhook` cannot be designed before the gateway is known; its
> signature scheme and retry semantics are the gateway's, not ours.

---

## 11. Hostel and mess — `/api/v1/campus/`

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/campus/hostels`, `/campus/rooms` | Blocks and rooms |
| GET/POST | `/campus/allocations` | Room allocation, with history |
| POST | `/campus/leave-requests` | Hostel leave; routes through `/requests/` |
| GET/POST | `/campus/mess-menus` | Menu by date and meal |
| GET/POST | `/campus/mess-subscriptions` | Opt-in periods |
| POST | `/campus/mess-feedback` | Per-meal feedback |

Allocation is historical, not current-state-only: a room allocation that is
overwritten loses the record of who was in which room last term, which is the
thing anyone actually asks for later.

---

## 12. Requests and approvals — `/api/v1/requests/`

| Method | Path | Purpose |
|---|---|---|
| GET | `/requests/types` | Configured request types and their chains |
| GET/POST | `/requests/requests` | Raise and list; filtered by the caller's scope |
| GET | `/requests/requests/{id}` | One request with its full chain state |
| POST | `/requests/requests/{id}/approve` | Approve the current stage |
| POST | `/requests/requests/{id}/return` | Return for changes — distinct from reject |
| POST | `/requests/requests/{id}/reject` | Reject; terminal |
| POST | `/requests/requests/{id}/delegate` | Delegate a stage, recorded |
| GET | `/requests/inbox` | What is waiting on the caller |

**Approvals are a shared service** (P-02). A module does not build its own chain
— the Clubs & Events approval flow is a configured chain here, not module code,
and the same is true of hostel leave and fee concessions.

`returned` and `rejected` are deliberately different states: returned means the
submitter may revise and resubmit, rejected means they may not. Collapsing them
loses the distinction the approver intended.

---

## 13. Reporting — `/api/v1/reporting/` *(namespace pending, see §1)*

| Method | Path | Purpose |
|---|---|---|
| GET | `/reporting/dashboards/{slug}` | A role's dashboard figures |
| POST | `/reporting/exports` | Start an export. `202 {job_id}` |
| GET | `/reporting/exports/{job_id}` | Status, then a signed download URL |
| GET | `/reporting/participation?semester=&group_by=` | Campus life aggregates, read from the module |

**Exports are asynchronous.** A synchronous export of 25,000 rows is a request
that times out in production and works on every developer's machine.

**Management sees aggregates.** There is no screen anywhere that shows an
individual student's participation to the Vice-Chancellor (Identity §7). The
module exposes counts upward and never individual attendance rows — the platform
reads `/api/v1/participation/summary`, not a roster.

**The first reporting period is explicitly caveated.** Historical activity is not
reconstructed (§5, legacy migration rule), so reporting begins from live data and
any report covering the boundary says so in the response, not only in a footnote
someone may remove.

---

## 14. Administration — `/api/v1/admin/`

| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | `/admin/config` | Institution configuration and thresholds |
| GET/PATCH | `/admin/feature-flags` | Per-module enablement |
| GET | `/admin/integrations` | Configured external systems and their health |
| GET/POST | `/admin/jobs` | Scheduled and async job status; retry |
| GET | `/admin/audit` | Cross-module audit search |

Configuration is data, not code. Thresholds, the PRN regex, approval chains and
grading parameters are institution config served from here and `/core/config` —
never constants in a codebase, which is how two deployments of the same software
quietly behave differently.

---

## 15. Campus life — the module's namespaces

`/api/v1/clubs/`, `/events/`, `/participation/`, `/budget/`, `/fests/` are owned
by the Clubs & Events team and specified in that module's own documents. The
platform's only interest in them is the seam:

| Direction | Contract |
|---|---|
| Module → platform | Consumes `/sis/students`, `/core/notifications`, `/core/audit`, `/core/files`, `/academics/semesters`, and validates tokens against `/auth/jwks` |
| Platform → module | Reads `/api/v1/participation/summary` and `/api/v1/participation/students/{id}/summary` — **aggregates only** |

The platform never assigns club-internal roles, and the module never invents an
institution-wide one. Neither namespace is served by both systems; the collision
check is on the integration checklist (Contract §8.2).

---

## 16. Error code registry

Contract §7.3 requires every system to maintain a registry of every code it
emits, served at `/api/v1/errors/`. Codes are namespaced by their owning module,
never reused for a different meaning, and never silently removed.

| Prefix | Owner | Examples |
|---|---|---|
| `AUTH_` | Identity | `AUTH_REQUIRED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_MFA_REQUIRED`, `AUTH_ACCOUNT_NOT_ACTIVE`, `AUTH_SSO_REQUIRED` |
| `CORE_` | Core services | `CORE_CHANNEL_NOT_ALLOWED`, `CORE_UNKNOWN_TEMPLATE`, `CORE_BATCH_TOO_LARGE` |
| `SIS_` | Student records | `SIS_PRN_INVALID`, `SIS_IMPORT_VALIDATION_FAILED`, `SIS_STATUS_TRANSITION_INVALID` |
| `ACADEMICS_` | Academics | `ACADEMICS_SECTION_FULL`, `ACADEMICS_NOT_YOUR_SECTION` |
| `ATTENDANCE_` | Attendance | `ATTENDANCE_PERIOD_CLOSED`, `ATTENDANCE_CORRECTION_REQUIRED` |
| `EXAMS_` | Examinations | `EXAMS_MARK_PUBLISHED`, `EXAMS_DUAL_AUTH_REQUIRED`, `EXAMS_MODERATION_PENDING` |
| `FEES_` | Fees | `FEES_ALREADY_SETTLED`, `FEES_DUPLICATE_PAYMENT`, `FEES_GATEWAY_UNVERIFIED` |
| `CAMPUS_` | Hostel and mess | `CAMPUS_ROOM_OCCUPIED`, `CAMPUS_SUBSCRIPTION_CLOSED` |
| `REQUESTS_` | Requests | `REQUESTS_NOT_YOUR_STAGE`, `REQUESTS_ALREADY_DECIDED` |
| `REPORTING_` | Reporting | `REPORTING_EXPORT_TOO_LARGE`, `REPORTING_PERIOD_INCOMPLETE` |
| `ADMIN_` | Administration | `ADMIN_CONFIG_LOCKED` |
| `CLUBS_` `EVENTS_` `PARTICIPATION_` `BUDGET_` | Campus life module | `EVENTS_VENUE_UNAVAILABLE`, `PARTICIPATION_DUPLICATE_CHECKIN` |

Generic codes for the transport-level failures — `REQUEST_MALFORMED`,
`PERMISSION_DENIED`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_FAILED`,
`RATE_LIMITED`, `INTERNAL_ERROR` — are shared and carry no prefix.

---

## 17. Versioning

**Freely addable:** a new optional response field · a new optional request
parameter with a safe default · a new endpoint · a new enum value, given §2's
consumer obligations.

**Breaking, and requiring `/api/v2/` with a deprecation notice and six months of
overlap:** removing or renaming a field · changing a type · making an optional
field required · changing the meaning of a value · removing an enum value ·
changing a status code for an existing condition · tightening validation on an
existing endpoint.

Both teams agree before either publishes a v2.

---

## 18. Documentation and proof

**OpenAPI is generated, never hand-written.** drf-spectacular, committed to the
repository, CI failing if the committed spec differs from the generated one. Every
endpoint carries a summary, a description, a tag matching its namespace, at least
one example response, and every error code it can return.

Published at `/api/v1/schema/` (JSON), `/api/v1/docs/` (Swagger),
`/api/v1/redoc/` (ReDoc) and `/api/v1/errors/` (the registry).

**Consumer-driven contract tests** (Contract §8.1). The module publishes its
expectations in `contracts/platform/` — `sis_students.yaml`,
`core_notifications.yaml`, `core_audit.yaml`, `core_files.yaml`,
`auth_claims.yaml` — and **the platform runs them in its own CI**. A platform
change that would break the module fails the platform's build, in the pull
request that caused it, rather than at integration months later.

**Definition of done for any endpoint** (PLATFORM_AGENT_PROMPT §7): permissions
proven server-side with a wrong-role token test · OpenAPI regenerated if the
contract changed · audit entry on every consequential write · no personal data
beyond the role's scope · no cross-module model import · decision log updated if
a decision changed.

---

## 19. Open questions, by what they block

Collected from the binding documents and PLATFORM_AGENT_PROMPT §9. This table is
a routing aid; the source lists are authoritative.

| Ref | Question | Blocks | Owner |
|---|---|---|---|
| ID-01 | PRN format and regex | `/core/config`, all identity work both sides | Registrar |
| ID-05 / API-04 | Department and programme code list | `/core/reference/*`, every report split | Registrar |
| API-01 | Is PRN the canonical immutable cross-system key | Authentication on both sides | Registrar |
| PO-01 / ID-03 / API-03 | Which systems integrate; which provider backs SSO | `/auth/*` — Phase 0 cannot start | IT |
| PO-02 | Self-hosted or managed cloud | Infrastructure, file storage, CORS | Sponsor |
| API-02 | Platform base URL, one domain or two | CORS, cookie scope, JWKS | IT |
| API-05 | Semester calendar as a platform service | `/academics/semesters`, all report boundaries | Registrar |
| API-06 | Rate limits per consumer | 429 behaviour, scan-station burst | Both teams |
| API-07 | Namespaces for communications and reporting | §1 — S8 cannot write a path | Both teams |
| PO-05 | Attendance minimum and condonation | `/attendance/shortage` | Registrar |
| PO-06 | Grading rules and result computation | `/exams/results`, transcripts | Registrar |
| PO-07 | Fee structures, concessions, gateway | `/fees/*`, webhook design | Finance |
| PO-08 | Does club participation appear on an official record | Module → SIS write path (currently: none) | Registrar |
| PO-09 | Parent access scope and consent mechanism | `/sis/students/{id}/guardians`, all guardian reads | Registrar |
| ID-06 | Graduated student access window | Status lifecycle, token issuance | Registrar |

**ID-01 and ID-05 are the cheapest to resolve and the most expensive to get
wrong.** If the two systems disagree on the student identifier, participation
cannot be reconciled against enrolment. If they disagree on department codes,
every departmental split in every report is subtly wrong and nobody notices until
someone checks a total by hand.
