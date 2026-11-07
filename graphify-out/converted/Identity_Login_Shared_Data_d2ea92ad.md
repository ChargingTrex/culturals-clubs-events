<!-- converted from Identity_Login_Shared_Data.docx -->

SHARED SPECIFICATION
Identity, Login &
Shared Reference Data
PRN · names · email · roles · authentication
The fields both systems use constantly, defined once
Version 1.0  ·  Binding on both teams

# Table of Contents



# 1. Purpose
A small set of fields appears in almost every screen, query and report across both systems: who a person is, what their identifier is, what to call them, where to email them, and what they are allowed to do. This document defines those fields once, so the Clubs & Events module and the Student Management Portal cannot diverge on them.
Companion to the API Standards & Integration Contract, which covers transport, error format and versioning. This document covers the identity data itself and the login flows that produce it.
Why a separate document: identity fields are the ones that get copied, cached and assumed. A department code that means one thing in the portal and another in the module produces reports that are wrong without being obviously broken — which is the worst kind of wrong.
# 2. Identifiers — Which One, For What
Three identifiers exist. Using the wrong one is the most common and most damaging mistake in this area.
| Identifier | Use it for | Never use it for |
| --- | --- | --- |
| user_id (UUID) | Every foreign key, every join, every API path parameter | Anything shown to a human |
| PRN | Reconciling across systems, desk lookup, printed on ID cards, report labels | Foreign keys between tables |
| email | Contact, SSO subject matching at first login | Any key of any kind |
## 2.1 Rules
- UUID is the only key. Every relation in both systems joins on user_id or student_id. Neither PRN nor email ever appears in a foreign key column.
- PRN is the human key. It is what an organiser types at a check-in desk, what appears on an attendee list, and what lets someone reconcile a module report against enrolment records.
- PRN is immutable and never reused. Not after graduation, not after withdrawal, not ever. Reissuing a PRN silently merges two people's history.
- Email is never an identifier. It changes, it gets reassigned, and personal addresses are shared between family members. Treat it as contact data that happens to be unique today.
The failure this prevents: a system that keys on email inherits a broken record the day a student's address changes or an alumni address is recycled to a new intake. By then thousands of rows point at the wrong person and there is no clean way to unpick it.

# 3. Shared Identity Record
The canonical definition. The platform owns every field below; the module consumes and caches a subset.
## 3.1 Core fields
| Field | Type & format | Owner | Mutable? |
| --- | --- | --- | --- |
| user_id | UUID v4 | Platform core | Never |
| student_id | UUID v4; null for staff | Platform SIS | Never |
| prn | String, institutional format | Platform SIS | Never |
| full_name | Unicode string, 1–160 chars | Platform SIS | Yes, rarely |
| display_name | Unicode string, 1–80 chars | Platform SIS | Yes |
| email | RFC 5322, institutional domain | Platform core | Yes |
| personal_email | RFC 5322, any domain | Platform SIS | Yes |
| phone | E.164, +91… | Platform SIS | Yes |
| department | Code from the shared list | Platform SIS | Rarely |
| programme | Code from the shared list | Platform SIS | Rarely |
| year_of_study | Integer 1–5, null for staff | Platform SIS | Yes, annually |
| status | Enum, see 3.5 | Platform SIS | Yes |
| roles | Array of role strings | Platform core | Yes |
## 3.2 Names
Names cause more integration defects than any other field, because systems encode assumptions that are not true of the people using them.
- One field, not two. full_name is a single Unicode string. Do not split into first and last name. A large proportion of students in India have a single given name, an initial standing for a father's or place name, or a name order that does not map to first-and-last.
- display_name is what appears in lists and greetings, defaulting to full_name and settable by the student. It is never used on official documents.
- full_name is what appears on a transcript or certificate and changes only through a formal correction, recorded with the change.
- Store Unicode, and never transliterate or strip diacritics. Search should be accent-insensitive; storage should not be lossy.
- No initials expansion, no title casing on write. Store what the registrar entered.
Minimum validation only: full_name must be non-empty and under 160 characters. Any rule beyond that — requiring a space, requiring two words, rejecting single characters, rejecting dots — will reject real students. This has to be stated because the default instinct is to validate more.
## 3.3 Email
| Field | Purpose | Rules |
| --- | --- | --- |
| email | Institutional address; SSO and all system mail | Unique across active accounts. Never reassigned to a different person, even after graduation. |
| personal_email | Fallback contact, alumni communication | Not unique — siblings and families share addresses. Never used for login. |
- System notifications go to the institutional address while the account is active.
- On graduation the institutional address may be deactivated; alumni communication falls back to personal_email.
- Institutional addresses are never recycled. Reissuing a graduate's address to a new student delivers the new student's mail to whoever still has the old account configured, and silently corrupts any system that ever keyed on it.
## 3.4 PRN
Format:      institution-defined, fixed once and never changed
Example:     21CS1042
21   admission year
CS   department code
1042 sequence

Validation:  exact-match regex, agreed by both teams, stored in
shared config — NOT hard-coded in either codebase

Comparison:  case-insensitive, whitespace-trimmed on input,
stored in canonical upper case
- Both systems trim and upper-case PRN on input, so a desk operator typing lower case still matches.
- The regex lives in shared configuration. Hard-coding it in two codebases guarantees they drift when the format changes for a new intake.
- A PRN is assigned once at admission and survives every status change.
## 3.5 Status lifecycle
| Status | Meaning | Can log in? | Historical records |
| --- | --- | --- | --- |
| provisional | Admitted, not yet enrolled | No | None yet |
| active | Currently enrolled | Yes | Accumulating |
| on_leave | Temporarily away, still enrolled | Yes | Retained |
| graduated | Completed the programme | Read-only, time-limited | Retained permanently |
| withdrawn | Left without completing | No | Retained permanently |
| suspended | Access revoked, enrolment intact | No | Retained |
Records outlive accounts. A graduated or withdrawn student's registrations, attendance and memberships are never deleted — deleting them would silently change historical participation figures for semesters that were already reported. The account is deactivated; the rows remain.
# 4. Shared Reference Data
Code lists that both systems use for grouping and reporting. If these diverge, every departmental and programme split in every report is quietly wrong.
| List | Owner | Consumed by | Sync |
| --- | --- | --- | --- |
| Department codes | Platform SIS | Both, for report splits | Module refreshes daily; codes never redefined |
| Programme codes | Platform SIS | Both | Same |
| Academic calendar / semesters | Platform | Module report boundaries | Module reads, never defines |
| Role names | Platform core | Both | Fixed list; additions require agreement |
- Codes are never redefined. If CSE is split into two departments, new codes are created. Reusing an existing code with a new meaning makes every historical report retroactively wrong.
- The module stores codes, not names. It caches the display name for rendering but always groups and reports by code.
- The module never invents a code. An unrecognised code is surfaced as unknown and logged, never silently mapped to something plausible.

# 5. Authentication
## 5.1 Login flow — platform mode
1.  User opens either system
2.  Redirected to platform SSO (college email / LDAP / OIDC provider)
3.  Credentials verified by the institutional provider
4.  MFA challenge if the user holds any staff or admin role
5.  Platform issues access token (short-lived) + refresh token
6.  User returns to the originating system with the token
7.  That system validates the signature against the platform JWKS
8.  Claims are read; NO additional user lookup is needed for basic identity
Step 8 matters for performance. The token carries name, PRN, department, programme, year and roles precisely so that rendering a page does not require a call back to the platform. A directory lookup happens only when data beyond the claims is needed.
## 5.2 Login flow — standalone mode
Before the platform exists, the module authenticates on its own, issuing tokens with the identical claim structure.
1.  User logs in against the module's own user table
2.  Module issues a token with the SAME claims as section 5.4
3.  Module validates its own signature

Switching to platform mode changes only:
- where the token comes from
- which key validates it
Nothing downstream of claim-reading changes.
Keep the claim structure identical from day one. If standalone tokens carry a different shape, every piece of code that reads them has to be rewritten at integration. Identical claims mean integration is a configuration change.
## 5.3 Token lifetimes
| Token | Lifetime | Notes |
| --- | --- | --- |
| Access token | 15 minutes | Carried on every request; short so a leaked token expires quickly |
| Refresh token | 7 days, sliding | Rotated on use; reuse of a consumed refresh token revokes the family |
| Staff/admin session | 8 hours maximum | Shorter absolute cap regardless of activity |
| Scan-station session | Event duration + 4 hours | Long enough to survive an event without re-login at the door |
The scan station is a deliberate exception. An organiser cannot re-authenticate mid-queue, and a station that logs out during an event will be abandoned in favour of a paper list. The session is bound to the specific event and expires with it.
## 5.4 Claims — the fixed contract
{
"sub":          "<user_uuid>",
"iss":          "https://portal.college.edu",
"aud":          ["portal", "clubs"],
"iat":          1788996400,
"exp":          1788997300,
"email":        "student@college.edu",
"student_id":   "<student_uuid>" | null,
"prn":          "21CS1042" | null,
"display_name": "…",
"roles":        ["student", "club_president:<club_uuid>"],
"department":   "CSE" | null,
"programme":    "BTech-CSE" | null,
"year":         2 | null,
"mfa":          true | false
}
- Every claim above is present in both modes. Optional values are null, never omitted.
- full_name is deliberately absent — display_name covers rendering, and official name is fetched only where legally needed.
- mfa records whether the session was MFA-verified, so sensitive operations can require it independently of role.
## 5.5 MFA
- Mandatory for: registrar, administration, finance, Dean, Vice-Chancellor, IT admin.
- Optional and encouraged for faculty and club office bearers.
- Not required for students in ordinary use.
- Required regardless of role for: publishing results, sanctioning above the escalation threshold, and correcting a published mark.
## 5.6 Logout and revocation
- Logout revokes the refresh token immediately; the access token expires naturally within 15 minutes.
- Both systems honour a platform revocation signal — a suspended or withdrawn account loses access without waiting for expiry.
- A status change to suspended or withdrawn revokes all active sessions for that user in both systems.
# 6. Caching & Propagation
## 6.1 What the module may cache
| Field | Cache? | TTL | On change |
| --- | --- | --- | --- |
| user_id, student_id, prn | Yes, permanently | None — immutable | Never changes |
| display_name, full_name | Yes | 24 hours | Refreshed on next lookup |
| email | Yes | 24 hours | Refreshed on next lookup |
| department, programme | Yes | 24 hours | Rarely changes |
| year_of_study | Yes | 24 hours | Changes annually |
| status | Yes | 1 hour | Shorter — affects access |
| roles | No — read from the token | Token lifetime | Always current |
| phone, personal_email | No | — | Fetch when needed; do not hold |
Cache the immutable, refresh the rest, never cache what you do not need. The module holds identity fields to render an attendee list without a network call per row. It has no reason to hold a phone number, so it does not — an unnecessary copy of personal data is a liability with no benefit.
## 6.2 Change propagation
| Change | Propagation | Historical effect |
| --- | --- | --- |
| Name correction | Module refreshes within 24 hours | Past records show the current name; the name is not versioned per record |
| Email change | Module refreshes within 24 hours | Notifications already sent are unaffected |
| Year rollover | Annual, at semester boundary | Past reports keep the year the student was in at the time — snapshot on the record |
| Status to suspended/withdrawn | Immediate revocation signal | Records retained; access removed |
| Department change | Refresh within 24 hours | Past participation stays attributed to the department at the time |
Snapshot the grouping fields on the record. When a student moves from second to third year, last semester's report must still say second year. The module stores department, programme and year on the registration row at the time of the event, not by joining to the current student record at report time.
# 7. Who Can See What
| Field | Student | Club organiser | Dean | Management |
| --- | --- | --- | --- | --- |
| display_name | Own + public club members | Own event attendees | All | Aggregates only |
| prn | Own | Own event attendees | All | No |
| email | Own | No | All | No |
| phone | Own | No | All | No |
| department, programme, year | Own | Own event attendees | All | Aggregates only |
| status | Own | No | All | No |
- An organiser sees attendee identity for their own event only, and only while it is active plus a limited window.
- Management sees aggregates. There is no screen anywhere that shows an individual student's participation to the Vice-Chancellor.
- Every access to identity data beyond a user's own record is logged.
# 8. Implementation Checklist
### Both teams
☐  PRN regex stored in shared configuration, not hard-coded in either codebase
☐  PRN trimmed and upper-cased on input, stored canonically
☐  full_name is a single field; no first/last split anywhere
☐  Name validation limited to non-empty and length — no structural rules
☐  Unicode stored without transliteration; search is accent-insensitive
☐  No foreign key anywhere references email or PRN
☐  Department and programme codes read from the shared list, never invented
☐  Unknown code surfaces as unknown and logs; never silently mapped
☐  Claim structure identical in standalone and platform mode
☐  Optional claims present as null, never omitted
☐  Token lifetimes per section 5.3, including the scan-station exception
☐  MFA enforced for the roles and operations in section 5.5
☐  Revocation honoured on status change to suspended or withdrawn
☐  Grouping fields snapshotted onto participation records, not joined at report time
☐  Identity access beyond own record is logged
☐  Graduated and withdrawn students' historical records retained, not deleted
# 9. Open Items
| Ref | Question | Blocks | Owner |
| --- | --- | --- | --- |
| ID-01 | Exact PRN format and regex | All identity work in both systems | Registrar |
| ID-02 | Is PRN genuinely never reused, including across intakes | Reconciliation integrity | Registrar |
| ID-03 | Which provider backs SSO — Google Workspace, LDAP, other | Token issuance | IT |
| ID-04 | Institutional email domain and alumni policy | Email handling, alumni fallback | IT |
| ID-05 | Department and programme code list, current and historical | Report splits in both systems | Registrar |
| ID-06 | Graduated student access window before deactivation | Status lifecycle | Registrar |
| ID-07 | Is MFA available on the chosen identity provider today | Staff login design | IT |
ID-01 and ID-05 block work on both sides immediately. Neither team can write identity handling or reporting splits without them, and both are answerable in a single conversation with the registrar. They are the cheapest items on this list to resolve and the most expensive to get wrong.