<!-- converted from API_Standards_Integration_Contract_1.docx -->

TECHNICAL STANDARD
API Standards &
Integration Contract
Student Management Portal  ·  Clubs & Events Application
How two independently built systems stay compatible
Version 1.0  ·  Binding on both teams

# Table of Contents



# 1. Why This Document Exists
The Clubs & Events application and the Student Management Portal are being built separately, by different teams, on different timelines. Each has its own PRD, decision log and development plan. This document is the one artefact binding on both.
The problem it solves: two systems built independently against informal assumptions will not fit together. Each will be internally coherent and mutually incompatible, and the incompatibility surfaces at integration — the point at which it is most expensive to fix. Everything below exists to make that failure impossible rather than merely unlikely.
## 1.1 Document map
| Set | Documents | Owner |
| --- | --- | --- |
| Clubs & Events module | Clubs & Events PRD · Event Flows · Database & Data Flow · Decision Log · Development Plan · Agent Prompt | Module team |
| Platform | Portal PRD · Platform Decision Log · Platform Development Plan · Platform Agent Prompt | Platform team |
| Shared | This document | Both — changes require agreement from both |
Rule: neither team changes this document unilaterally. A proposed change is raised, agreed, versioned, and only then implemented. Everything else in each set is that team's own business.
# 2. The Standalone-First Principle
The Clubs & Events module is being built first and must run before the platform exists. It therefore cannot call platform services at build time, but must be able to consume them later without rewriting.
## 2.1 The adapter requirement
The module defines interfaces for everything the platform will eventually provide, and ships two implementations of each.
module/integrations/
identity.py        IdentityProvider     (interface)
├─ LocalIdentityProvider     standalone: own user table, own login
└─ PlatformIdentityProvider  integrated: validates platform JWT

directory.py       StudentDirectory     (interface)
├─ LocalStudentDirectory     standalone: CSV-imported student list
└─ PlatformStudentDirectory  integrated: reads platform SIS

notifications.py   NotificationSender   (interface)
├─ LocalNotificationSender   standalone: direct SMTP + in-app table
└─ PlatformNotificationSender integrated: posts to core service

files.py           FileStore            (interface)
audit.py           AuditSink            (interface)

Selected by configuration:  INTEGRATION_MODE = local | platform
This is the single most important decision in this document. Without it, the module either waits for the platform (blocking the work you wanted to start now) or hard-codes its own identity and is rewritten at integration. The adapter costs a few days up front and removes an integration rewrite entirely.
## 2.2 What each mode means
| Concern | Standalone mode | Platform mode |
| --- | --- | --- |
| Login | Module's own user table and login screen | Platform SSO; module validates the platform JWT |
| Student records | CSV import into a local read-only student table | Read from platform SIS via service interface |
| Roles | Module-managed roles only | Platform roles plus module-specific club roles |
| Notifications | Module sends email directly; own in-app table | Posts to the platform notification service |
| Files | Module's own object-store bucket | Platform file service |
| Audit | Module's own audit table | Writes to module table and mirrors to platform audit |
The module's own data never moves. Clubs, events, registrations, budgets and photos stay in the module's tables in both modes. Only the shared concerns above switch implementation.

# 3. API Conventions — Binding on Both
## 3.1 Base paths and namespacing
Platform:   /api/v1/core/…      identity, roles, notifications, audit
/api/v1/sis/…       students, enrolment
/api/v1/academics/… courses, timetable
/api/v1/attendance/…
/api/v1/exams/…
/api/v1/fees/…
/api/v1/campus/…    hostel, mess
/api/v1/requests/…

Module:     /api/v1/clubs/…
/api/v1/events/…
/api/v1/participation/…
/api/v1/budget/…
/api/v1/fests/…

Reserved by the platform, never used by the module:
core, sis, academics, attendance, exams, fees,
campus, requests, admin, auth
Namespace collision is the cheapest integration failure to prevent and one of the most annoying to fix. The reserved list above is fixed; adding to it requires agreement.
## 3.2 Resource naming
- Plural nouns for collections: /events, /clubs, /registrations.
- Lowercase with hyphens for multi-word paths: /budget-lines, /scan-records.
- Nesting only one level deep: /events/{id}/registrations is fine; /clubs/{id}/events/{id}/registrations is not — use filters instead.
- Actions that are not CRUD use a verb sub-resource: POST /events/{id}/approve, POST /registrations/{id}/check-in.
- snake_case in JSON bodies. Never camelCase on the wire; the frontend converts if it wants to.
## 3.3 Methods and status codes
| Code | Used for |
| --- | --- |
| 200 | Successful GET, PATCH, or action returning a body |
| 201 | Resource created; Location header set |
| 204 | Successful DELETE or action with no body |
| 400 | Malformed request — syntax, unparseable body |
| 401 | No credentials, or invalid or expired token |
| 403 | Authenticated but not permitted — this is the role failure case |
| 404 | Not found, or found but not visible to this caller |
| 409 | Conflict — duplicate registration, venue clash, already checked in |
| 422 | Validation failed — well-formed but semantically invalid |
| 429 | Rate limited |
403 versus 404: where revealing existence is itself a disclosure — another club's budget, another student's record — return 404 rather than 403. A 403 confirms the resource exists, which is sometimes all an attacker needs.
## 3.4 Error format
Every error from either system uses the same shape, based on RFC 9457 problem details.
{
"type":     "https://portal.college.edu/errors/duplicate-check-in",
"title":    "Already checked in",
"status":   409,
"detail":   "This student was checked in at 10:32 at station GATE-2.",
"instance": "/api/v1/participation/scans",
"code":     "PARTICIPATION_DUPLICATE_CHECKIN",
"errors": [
{ "field": "token", "code": "ALREADY_USED", "message": "Pass already scanned." }
],
"trace_id": "01J8XQ…"
}
- code is machine-readable, SCREAMING_SNAKE, prefixed by the owning namespace. Clients branch on this, never on the message text.
- errors is present only for validation failures, one entry per field.
- trace_id appears in logs on both systems, which is what makes a cross-system failure traceable.
- detail is human-readable and may change; it is never parsed by a client.
## 3.5 Pagination, filtering, sorting
GET /api/v1/events?page=2&page_size=50&ordering=-starts_at&club=<uuid>

{
"count": 412,
"next": "/api/v1/events?page=3&page_size=50",
"previous": "/api/v1/events?page=1&page_size=50",
"results": [ … ]
}
- Default page_size 25, maximum 200. A request above the maximum is clamped, not rejected.
- ordering takes a field name, prefixed with a minus for descending.
- Filters are query parameters named for the field. Date ranges use _after and _before suffixes.
- Every list endpoint is paginated. No exceptions — an endpoint that returns everything today returns 25,000 rows in three years.
## 3.6 Data types on the wire
| Type | Representation | Example |
| --- | --- | --- |
| Identifier | UUID v4 string | "9f1c…" |
| Timestamp | ISO 8601, UTC, Z suffix | "2026-09-12T04:30:00Z" |
| Date | ISO 8601 date only | "2026-09-12" |
| Money | String, two decimals, never float | "12500.00" |
| Currency | ISO 4217, always explicit | "INR" |
| Enum | lower_snake_case string | "pre_registered" |
| Boolean | true / false, never 0 / 1 or "yes" | true |
| Absent value | null, never omitted and never "" | null |
Money as a string is deliberate. JSON numbers are IEEE floats in most parsers; a fee of 12500.10 can arrive as 12500.099999. Strings remove the class of bug entirely.
## 3.7 Idempotency
- Any POST that creates something with financial or attendance consequence accepts an Idempotency-Key header.
- Replaying the same key within 24 hours returns the original response rather than creating a second record.
- Required for: check-in scans, payment records, registration creation. This is what makes offline scan replay safe.

# 4. Authentication & Authorisation Contract
The most important compatibility surface. If the token contract is wrong, nothing else works.
## 4.1 Token
- Bearer JWT in the Authorization header. Access token short-lived, refresh token separate.
- Signed RS256. The platform publishes a JWKS endpoint; the module validates against it rather than sharing a secret.
- In standalone mode the module issues its own tokens with the identical claim structure, so no code path differs between modes except the key source.
## 4.2 Required claims — fixed
{
"sub":         "9f1c…",              platform user UUID, stable forever
"iss":         "https://portal.college.edu",
"aud":         ["portal", "clubs"],  audiences this token is valid for
"exp":         1789000000,
"iat":         1788996400,
"email":       "student@college.edu",
"student_id":  "3f2a…"  | null,      SIS student UUID; null for staff
"prn":         "21CS1042" | null,    canonical institutional identifier
"roles":       ["student", "club_president:<club_uuid>"],
"department":  "CSE" | null,
"programme":   "BTech-CSE" | null,
"year":        2 | null
}
prn is the cross-system key. It is the identifier a human reads off an ID card, types at a desk, and uses to reconcile the module against the platform. Both systems must agree it is canonical and immutable. This is an open question in both decision logs (O-08, PO-08) and must be settled before either team writes authentication code.
## 4.3 Role naming
| Pattern | Meaning | Example |
| --- | --- | --- |
| <role> | Institution-wide role | student, faculty, registrar, dean_student_affairs, vice_chancellor |
| <role>:<scope_uuid> | Role scoped to one object | club_president:9f1c…, faculty_section:3a2b… |
| module_<role> | Role meaningful only inside a module | module_club_member |
- Roles are lower_snake_case. The scope suffix after a colon is always a UUID.
- The module never invents an institution-wide role. If it needs one, it is raised to the platform team and added here.
- The platform never assigns club-internal roles. Club president and treasurer are the module's business; the platform only carries them in the token.
## 4.4 Authorisation is always local
A token proves identity and carries roles. It never grants access by itself. Each system decides what its own resources permit.
The rule that must not be broken: every restriction is enforced server-side by the system that owns the resource. A valid token carrying club_president does not authorise anything by itself — the module still checks that this president belongs to this club. Trusting a claim without checking scope is how a token from one club becomes access to another.
# 5. Core Service Interfaces
What the platform must expose, and exactly what the module expects. These signatures are binding; the platform team implements them, the module team codes against them.
## 5.1 Student directory
GET  /api/v1/sis/students/{id}
GET  /api/v1/sis/students?prn=21CS1042
GET  /api/v1/sis/students?ids=<uuid>,<uuid>,…     batch, max 200

200 {
"id": "3f2a…",  "prn": "21CS1042",
"full_name": "…",  "email": "…",
"department": "CSE",  "programme": "BTech-CSE",  "year": 2,
"status": "active" | "graduated" | "withdrawn"
}
- Batch lookup is required, not optional. A scan station resolving 400 attendees one request at a time is unusable.
- The module caches name, PRN, department, programme and year. It never stores anything else about a student.
- Read-only. The module has no write path into SIS, ever. Club participation never touches an academic record.
## 5.2 Notifications
POST /api/v1/core/notifications
{
"recipients": { "user_ids": [...] }  or  { "role": "dean_student_affairs" },
"channels":   ["in_app", "email"],        in_app and email ONLY
"template":   "event_approved",
"context":    { "event_title": "…", "venue": "…" },
"source":     "clubs",
"idempotency_key": "…"
}
202 { "notification_id": "…", "queued": 43 }
Channel enforcement is the platform's job. If a caller requests any channel other than in_app or email, the platform rejects the request with 422. A policy enforced only in each caller will eventually be broken by one of them.
## 5.3 Audit
POST /api/v1/core/audit
{
"actor_id": "…",  "action": "event.approved",
"target_type": "event",  "target_id": "…",
"source": "clubs",  "payload": { … },  "occurred_at": "…"
}
202 accepted
- Fire-and-forget and asynchronous. An audit write must never block or fail the operation it records.
- The module keeps its own audit table regardless, and mirrors upward in platform mode. Losing the audit trail because the platform was briefly unavailable is not acceptable.
## 5.4 Files
POST /api/v1/core/files/upload-url
{ "filename": "receipt.pdf", "content_type": "application/pdf",
"source": "clubs", "max_bytes": 10485760 }

200 { "upload_url": "https://…", "file_id": "…", "expires_at": "…" }

GET  /api/v1/core/files/{id}/download-url   → short-lived signed URL
Uploads go directly to object storage via a pre-signed URL. Neither system proxies file bytes through its application servers — a hall full of organisers uploading photos would otherwise saturate the API tier.
## 5.5 What the module exposes upward
GET /api/v1/participation/summary
?semester=<uuid>&group_by=department|programme|year

200 {
"semester": "…",
"events_run": 47,
"total_participation": 1600,
"unique_students": 612,
"external_participants": 180,
"groups": [ { "key": "CSE", "unique_students": 210 } ]
}

GET /api/v1/participation/students/{student_id}/summary
200 { "events_attended": 7, "clubs": 2 }
Aggregates only. The module exposes counts upward, never individual attendance rows. Platform reporting needs the figure, not the roster. Exposing per-event attendee lists across a system boundary creates a privacy surface with no corresponding need.

# 6. Versioning & Compatibility
## 6.1 What may change freely
- Adding a new optional field to a response.
- Adding a new optional request parameter with a safe default.
- Adding a new endpoint.
- Adding a new enum value — provided consumers were built to tolerate unknown values, which is required by section 6.3.
## 6.2 What is a breaking change
- Removing or renaming any field.
- Changing a field's type, or making an optional field required.
- Changing the meaning of an existing value.
- Removing an enum value, or changing a status code for an existing condition.
- Tightening validation on an existing endpoint.
Breaking changes require a new version path (/api/v2/…), a deprecation notice on the old version, and a minimum six-month overlap. Both teams must agree before either publishes a v2.
## 6.3 Consumer obligations
- Tolerate unknown fields. Never fail because a response contained something unexpected.
- Tolerate unknown enum values. Degrade to a sensible default and log; never crash.
- Never depend on field order or on the text of detail messages.
- Handle 429 and 5xx with backoff and retry, using the idempotency key so retries are safe.
Why 6.3 matters more than it looks: almost every rule in 6.1 depends on it. If a consumer crashes on an unknown enum value, adding one becomes a breaking change and the systems can never evolve independently — which defeats the point of building them separately.
# 7. Documentation Standards
## 7.1 OpenAPI is generated, never hand-written
- Both systems use drf-spectacular. The specification is generated from code, so it cannot drift from behaviour.
- Every endpoint carries a summary, a description, a tag matching its namespace, and at least one example response.
- Every error code the endpoint can return is listed.
- Generated specs are committed to the repository, and CI fails if the committed spec differs from the generated one.
## 7.2 Published artefacts
| Artefact | Path | Purpose |
| --- | --- | --- |
| OpenAPI JSON | /api/v1/schema/ | Machine-readable contract |
| Swagger UI | /api/v1/docs/ | Interactive exploration |
| ReDoc | /api/v1/redoc/ | Readable reference |
| Error code registry | /api/v1/errors/ | Every code, meaning and resolution |
| Changelog | CHANGELOG.md in each repo | Dated, categorised additive or breaking |
## 7.3 Error code registry
Both systems maintain a registry of every error code they emit, namespaced by module. A code is never reused for a different meaning, and never silently removed.
# 8. Proving Compatibility
## 8.1 Contract tests
The module publishes the expectations it holds about platform services. The platform runs those expectations against its implementation in its own CI. A platform change that would break the module fails the platform's build, not the module's integration.
module/contracts/platform/
sis_students.yaml        expected request → expected response shape
core_notifications.yaml
core_audit.yaml
core_files.yaml
auth_claims.yaml         required JWT claims

Platform CI:  run contract suite  →  fail build on mismatch
Module CI:    run against a mock built from the same contracts
This is what makes independent building safe. Without consumer-driven contracts, the platform team discovers it broke the module at integration, months after the change. With them, they discover it in the pull request that caused it.
## 8.2 Integration checklist
☐  Module runs fully in standalone mode, all tests passing
☐  Module runs fully in platform mode against a mock platform
☐  Switching INTEGRATION_MODE requires no code change, only configuration
☐  JWT issued by the platform validates in the module against the JWKS endpoint
☐  All required claims present; prn agreed and populated
☐  Batch student lookup returns 200 records within the latency budget
☐  Notification request with a disallowed channel is rejected by the platform with 422
☐  Module aggregate endpoints return figures matching the module's own report
☐  Namespace collision check: no path served by both systems
☐  Error format identical across both systems, verified by a shared test
☐  trace_id from a module request appears in platform logs for the same operation
☐  Contract suite green in both CI pipelines
# 9. Open Items
| Ref | Question | Blocks | Owner |
| --- | --- | --- | --- |
| API-01 | Is PRN the canonical, immutable cross-system identifier | Authentication on both sides — settle first | Registrar |
| API-02 | Platform base URL and whether both deploy under one domain | CORS, cookie scope, JWKS | IT |
| API-03 | Which identity provider backs platform SSO | Token issuance, claim availability | IT |
| API-04 | Shared department and programme code list | Reporting splits must match across systems | Registrar |
| API-05 | Semester and academic calendar as a platform service | Module report boundaries | Registrar |
| API-06 | Rate limits per consumer | Scan station burst handling | Both teams |
API-01 and API-04 are the ones that silently corrupt reporting. If the two systems disagree on the student identifier, participation cannot be reconciled against enrolment. If they disagree on department codes, every departmental split in every report is subtly wrong and nobody notices until someone checks a total by hand.