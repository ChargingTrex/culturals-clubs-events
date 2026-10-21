# PRD coverage audit — `web-app/` (Culturals walkthrough build)

**Date:** 2026-10-21
**Audited against:** `graphify-out/converted/Student_Life_Clubs_Events_PRD_V4_6d70ab4d.md` (PRD V4, 528 lines), sections 4, 5.1–5.20, 6.1–6.5 and 8 (non-functional). Section 7 (data model) is summarised but not counted.
**Precedence honoured:** MASTER_SPEC.md §9 (lines 1190–1282): faculty-advisor gate removed deliberately, Cultural Society gate added, Vice-Chancellor/Management sees aggregates only, Treasurer may propose, VP may record spend. AGENT_PROMPT.md §2: no SMS; organiser scans the student, never the reverse. These are marked DEVIATES-BY-DECISION, not MISSING.

**Counting method.** One row per bullet-level (or table-row-level) requirement in the PRD. Each row gets exactly one status: BUILT (behaviour present end to end, in rules and in a page), PARTIAL (a recognisable subset exists — often the rule in `src/` without a page, or a page with a stub), MISSING, DEVIATES-BY-DECISION (differs from the PRD because a recorded decision says so), N/A-CLIENT-ONLY (cannot exist in a browser-only build: email delivery, scheduled jobs, file storage, load). Evidence is `file:line` under `web-app/`. Test is the exact title string from `tests/*.mjs`, or "none". Tests were not run for this audit.

**What this build is.** A no-build, static ES-module site: 15 HTML pages, each importing `src/api.js`, which is shaped like the Django REST surface but runs every rule in the browser against one JSON document in `localStorage` (`src/db.js:8-36`). There is no server, no network call except two optional CDN scripts for QR drawing and camera scanning (`src/qrcode.js:10-11`), and a signing key that ships to the client (`src/tokens.js:16`). Demo passwords are published; any non-empty authenticator code passes. The README and APPFLOW §8 say so plainly, and they list what is deliberately not built: waitlists, feedback surveys, office-bearer handover, fest sub-events, external participants. Nothing here defends anything; it demonstrates workflow rules, and that is the lens for every status below.

---

## §4 Users & roles

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Dean: approve/reject events and budgets; view all data; publish reports | BUILT | `src/roles.js:64-68`, `src/session.js:127-135`, `src/api.js:843-857` | "the Dean is unaffected and still sees rosters" |
| Management: read-only executive dashboards and exports | DEVIATES-BY-DECISION | Also holds gate 3 above ₹50,000 (`src/approvals.js:13,37-41`); aggregates only (`src/session.js:131-135`) | "no PRN or student name appears in anything the VC can read" |
| Faculty Advisor: first-level approval, own-club oversight | DEVIATES-BY-DECISION | No such role anywhere in `src/roles.js`; MASTER_SPEC §9.2 | none |
| (Added) Cultural Society: gate 1 for cultural/literary clubs | DEVIATES-BY-DECISION | `src/approvals.js:16-27`; MASTER_SPEC §9.1 | "each gate sees only its own queue" |
| President / VP: run club, roster and roles, budget visibility | BUILT | `src/roles.js:43-58` | "only the President and VP may assign roles" |
| Treasurer: prepare requests, track sanction, record spend; no role assignment | BUILT | `src/roles.js:46-55` (may also propose, §9.3) | "the Treasurer cannot run the event they priced" |
| Other office bearer (Secretary): run events, registrations, reports | BUILT | `src/roles.js:55,58,61` | none (smoke: persona page offers) |
| Club member: view internals, register | BUILT | `src/api.js:30-35`, `src/roles.js:46` | "budget visibility begins at Treasurer" |
| Student: browse, register, attend, give feedback | PARTIAL | Browse/register/attend `src/api.js:699-716`; no feedback | "registering mints a one-time pass" |
| Student Life Office staff: venues, calendar, club records | MISSING | No role; venue work sits with the Dean (`src/api.js:225-228`) | none |

## §5.1 Club directory & profiles

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Public directory with category, description, logo, activity level | PARTIAL | `api.clubs.list` has category and member count (`src/api.js:296-302`); no page renders it; no description/logo | none |
| Official social handles on club profile | PARTIAL | `instagram` seeded (`src/seed.js:98`), never displayed; no LinkedIn | none |
| Club profile page (bearers, advisor, events, member count, photos) | MISSING | No club page exists | none |
| New-club registration workflow with Dean approval | MISSING | — | none |
| Status lifecycle proposed/active/dormant/archived, auto-dormancy | PARTIAL | Static `status:"active"` (`src/seed.js:97`); active/inactive derived from events this semester (`src/reporting.js:110-121`) | none |

## §5.2 Membership management

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Join / request to join; open and approval modes | MISSING | No join path in `src/api.js` | none |
| Roster with roles and tenure dates | PARTIAL | Roster with roles `src/api.js:304-333`; `joinedAt/endedAt` exist (`src/seed.js:112`) but are not shown | "only the President and VP may assign roles" |
| Membership history retained across years | PARTIAL | `endedAt` field only; nothing ever sets it; no history view | none |

## §5.3 Office-bearer succession

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Structured annual handover with effective dates | MISSING | README "Honest limits" | none |
| Documents, vendors, reports, budgets persist across handover | MISSING | — | none |
| Automatic permission transfer on handover date; historical record | MISSING | — | none |

## §5.4 Event lifecycle

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| 1 Proposal: title, description, date, venue, expected attendance, budget | PARTIAL | `src/api.js:83-149`; no description field | "an event can be created unpriced, and gets a budget shell" |
| 2 Approval: multi-level with comments (advisor → Dean) | DEVIATES-BY-DECISION | Society → Dean → VC, comments required to return/reject (`src/approvals.js:16-42,117-182`) | "the full three-gate chain publishes the event" |
| 3 Venue & resources: booked, conflicts detected, equipment reserved | PARTIAL | Venue held at proposal, clash detected (`src/approvals.js:234-246`); no equipment, no office role | "an unresolved venue clash blocks approval but not a return" |
| 4 Publication automatic on approval, notifications sent | BUILT | `src/approvals.js:169-176,260-268` | "the full three-gate chain publishes the event" |
| 5 Registration: capacity, waitlist, deadlines enforced | PARTIAL | Capacity `src/attendance.js:76-79`; no waitlist, no deadline | "registration is refused when the event is full" |
| 6 Attendance: QR or roster marking on mobile | BUILT | `src/attendance.js:165-295` | "1 — a valid pass is accepted" |
| 7 Feedback survey auto-triggered | MISSING | — | none |
| 8 Report with actuals: attendance, spend, photos, learnings | PARTIAL | `events.close` takes a photo count and links only (`src/api.js:176-200`) | "closing an event requires at least one photo" |

## §5.5 Event discovery

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Campus calendar with filters (category, club, date, department) | PARTIAL | Flat list of published/live events, no filters (`student-events.html:21-43`) | none |
| Personalised feed by memberships/interests/year | MISSING | — | none |
| In-app notifications (one of the two permitted channels) | BUILT | `src/approvals.js:249-274`, bell dialog `src/ui.js:152-177` | "submitting notifies the gate that holds it, and the club's officers" |
| Email channel for approvals/confirmations | N/A-CLIENT-ONLY | No delivery possible; copy says "in-app and email only" (`src/ui.js:166`) | none |
| Channel by purpose | PARTIAL | Only in-app exists | none |
| Per-user preferences; approval/confirmation emails always sent | MISSING | — | none |
| Event page with details, registration status, venue map, organiser contact | PARTIAL | List row shows club/venue/time/places (`student-events.html:27-40`); no detail page, map or contact | none |

## §5.6 Registration & attendance

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| One-tap registration; capacity; waitlist promotion | PARTIAL | `student-events.html:38-40`, `src/attendance.js:71-98`; no waitlist | "registration is refused when the event is full" |
| QR check-in at venue | BUILT | `src/attendance.js:165-260` | "1 — a valid pass is accepted" |
| Registered / attended / no-show distinguished | BUILT | `attended` flag; report counts attended only (`src/reporting.js:26-27`); roster `src/api.js:801-813` | "only reported events count, and absentees do not" |
| Offline-tolerant check-in that syncs | PARTIAL | `replayOffline` API (`src/attendance.js:303-313`, `src/api.js:757-769`); station page never queues (`organiser-scan.html:123-126`) | "the earliest device timestamp wins, not the arrival order" |

## §5.7.1 Budget template library

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Templates per event type (8 listed) loaded on selection | PARTIAL | 4 templates: Performance, Workshop, Competition, Exhibition (`src/seed.js:33-50`); no Fest, Sports, Guest Lecture, Social Service | none |
| Blank template | BUILT | "Price it later" creates an unpriced shell (`club-new-event.html:39`, `src/api.js:126-136`) | "an event can be created unpriced, and gets a budget shell" |

## §5.7.2 Template behaviour

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Suggested amount and unit basis per head, editable | BUILT | `src/seed.js:34-50`, `src/budget.js:116-141` | "entries freeze once an approver holds the budget" |
| Quantity-driven heads multiply by expected attendance | BUILT | `src/budget.js:263-265`, `src/api.js:523-527` | none |
| Contingency line at configurable % | BUILT | Constant 8% (`src/budget.js:10,272-279`) | none |
| Computes total and cost per expected participant | PARTIAL | Total `src/api.js:528-530`; cost per participant not computed or shown | none |
| Custom heads; frequent custom heads surfaced to the Office | PARTIAL | `addLine` (`src/budget.js:87-114`); nothing surfaces them | "the Treasurer adds entries and then it submits" |
| Prior-year reference (what it cost last time) | MISSING | — | none |
| Centrally maintained masters, not alterable by clubs | PARTIAL | Code constants (`src/seed.js:33`); nobody can edit, no office UI | none |

## §5.7.3 Request, sanction, reconciliation

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Budget attached to proposal, same chain | BUILT | `src/approvals.js:55-83` | "an unpriced proposal cannot be submitted" |
| Line-by-line sanction with comment | BUILT | Dean stage only (`src/approvals.js:141,184-205`) | "the Dean may reduce a head but never raise it" |
| Thresholds: small → advisor only, large → Dean | DEVIATES-BY-DECISION | Dean always; > ₹50,000 adds VC (`src/approvals.js:13,37`) | "above the threshold the route gains the VC gate" |
| Post-event actual spend per head with bill/receipt upload | PARTIAL | `setSpend` (`src/api.js:475-494`); receipt is a hard-coded filename, no file (`club-budget.html:168-169`) | "a receipt and a reason clear the blockers" |
| Variance per head: requested vs sanctioned vs spent | BUILT | `isOverspent` (`src/api.js:376-381`); columns (`club-budget.html:57-88`) | "blockers appear once settlement is reachable, all at once" |
| Annual club envelope with running utilisation | MISSING | — | none |

## §5.8 Feedback & surveys

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Automatic post-event form, configurable per type | MISSING | README "Honest limits" | none |
| Standard + club-defined questions | MISSING | — | none |
| Aggregated scores to organisers/Dean; anonymous to organisers | MISSING | — | none |

## §5.9.1 Venue inventory & booking

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Venue register: capacity, facilities, controlling department | PARTIAL | Name and capacity only (`src/seed.js:29-31,95`) | none |
| Provisional until approved, then confirmed | BUILT | `confirmed: status !== "submitted"` (`src/api.js:278`), `src/approvals.js:209-210` | "the venue calendar is staff-only" |
| Overlaps rejected at point of request | PARTIAL | Confirmed overlap refused; pending-vs-pending accepted and flagged for the Dean (`src/approvals.js:234-246`; APPFLOW §4 documents this choice) | "an unresolved venue clash blocks approval but not a return" |
| Setup buffer, configurable per venue | PARTIAL | Global 30 minutes (`src/approvals.js:208`) | none |
| Exam/academic blackout periods block booking | MISSING | — | none |

## §5.9.2 Dean's venue overview

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Master calendar, all venues, day/week/month, status shown | PARTIAL | Single-day view only (`dean-venues.html:24-69`) | "the venue calendar is staff-only" |
| Per-venue timeline | PARTIAL | One row per venue for one day (`dean-venues.html:62-68`) | none |
| Clash alerts, both events side by side with expected attendance | BUILT | `dean-venues.html:48-56`, `src/api.js:280-287` | none |
| Pressure view (demand exceeds venues) | MISSING | — | none |
| Utilisation per venue | BUILT | `src/reporting.js:131-135`, `dean-overview.html:47-50` | none |
| Filter by club/category/date/venue; export schedule | MISSING | — | none |

## §5.9.3 Reassigning a clashing event

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Move to a free, large-enough venue from the clash alert | PARTIAL | Free venues computed (`src/api.js:202-218`); page auto-picks the first, no choice (`dean-venues.html:95`) | "only the Dean may move an event between venues" |
| Propose a different time slot | MISSING | Page only says to (`dean-venues.html:91-92`) | none |
| Reason required and recorded | BUILT | `src/api.js:229-234,250-251` | "a move needs a reason the club can act on" |
| Club notified in-app and by email, old and new venue shown | PARTIAL | In-app with both names (`src/api.js:248-249`); email N/A | none |
| Registered students notified if published | MISSING | `notifyClub` reaches office bearers only (`src/approvals.js:260-268`) | none |
| Atomic release of the original slot | BUILT | Single synchronous mutation (`src/api.js:245-247`) | none |
| Reassignment history retained on the event | PARTIAL | Audit row (`src/approvals.js:276-281`); no per-event view | none |

## §5.10 Event photos & media

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Upload photos from mobile during/after event | MISSING | Only a count is stored (`src/api.js:195`; `club-events.html:76` uses `prompt()`) | none |
| Gallery with highlight images | MISSING | — | none |
| Report cannot be submitted without ≥1 photo | BUILT | `src/api.js:190-194` | "closing an event requires at least one photo" |
| Auto-tagging by event/club/date/semester | MISSING | — | none |
| Captions/credits; original stored, compressed served | N/A-CLIENT-ONLY | No storage | none |
| Consent notice at registration; removal request | MISSING | — | none |

## §5.11 Event templates & workflow automation

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Event type pre-fills proposal, budget, checklist, form | PARTIAL | Budget only (`club-new-event.html:38-42,69-84`) | none |
| Clone a past event | MISSING | — | none |
| Auto-generated task checklist | MISSING | — | none |
| Automated reminders (deadlines, SLAs, event day) | N/A-CLIENT-ONLY | No scheduler | none |
| Status automation driven by workflow | BUILT | draft → submitted → published → live → reported (`src/approvals.js:77,173`; `src/api.js:172,197`); `approved`/`completed` are never set | "the full three-gate chain publishes the event" |
| SLA escalation surfaced on Dean dashboard | MISSING | Overview has counts, no ages (`src/reporting.js:103-108`) | none |

## §5.12.1 Before the event

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Custom registration form builder | MISSING | — | none |
| Team/group registration | MISSING | — | none |
| Volunteer and crew roster | MISSING | — | none |
| Guest and speaker management | MISSING | — | none |
| Sponsorship tracker | MISSING | — | none |
| Publicity: auto-publish to calendar/feed, in-app + email to audience, poster | PARTIAL | Auto-publish and in-app to club officers (`src/approvals.js:167-176`); students not notified; no poster | none |

## §5.12.2 On the day

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| QR check-in with live count vs capacity | BUILT | `organiser-scan.html:52-57`, `src/api.js:729-734` | "every branch writes a record, and failures move the capture rate" |
| Spot registration at the desk | BUILT | `src/attendance.js:243-259` | "4 — a walk-in's profile QR registers and admits in one scan" |
| Multiple operators scanning without conflict | PARTIAL | Operator and station recorded (`src/attendance.js:128-135`); page fixes `GATE-1` (`src/api.js:748`, `organiser-scan.html:42`) | "the earliest device timestamp wins, not the arrival order" |
| Offline-tolerant operation | PARTIAL | API only (see §5.6) | "replaying the same queue twice does not double-record" |
| Session-level check-in for multi-session events | MISSING | — | none |

## §5.12.3 After the event

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Auto-drafted event report (counts pre-filled) | MISSING | Close is a `prompt()` for a photo count (`club-events.html:76-81`) | none |
| Participation certificates | MISSING | — | none |
| Feedback dispatch to attendees | MISSING | — | none |
| Learnings capture carried into clone | MISSING | — | none |
| Vendor record with rating | MISSING | — | none |

## §5.13 Approval configuration

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Chains per request type (event, budget, venue, new club), as configuration | PARTIAL | One chain for event+budget, a code constant (`src/approvals.js:16`); no venue/club chains | none |
| Amount-based routing thresholds | BUILT | `VC_THRESHOLD` (`src/approvals.js:13,37`) | "above the threshold the route gains the VC gate" |
| Delegation when approver unavailable, recorded | MISSING | — | none |
| Parallel or sequential steps | PARTIAL | Sequential only (`src/approvals.js:162-168`) | none |
| Full audit trail: who, when, comment | BUILT | Steps `src/approvals.js:143-147`; audit `src/approvals.js:276-281`; `src/api.js:634-640` | "the audit trail is Dean and admin only" |

## §5.14.1 Capturing post links

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Instagram and LinkedIn link fields, multiple per platform | PARTIAL | `socialLinks` string array (`src/api.js:117,196`); page hard-codes one Instagram URL (`club-events.html:80`) | none |
| Added at report stage or earlier | PARTIAL | Only at close | none |
| Each link stores URL, platform, date, who | PARTIAL | URL only | none |
| Configurable "mandatory before complete" | MISSING | Optional; chased on overview instead | none |
| Optional screenshot | MISSING | — | none |
| Club handles on profile for sense-checking | PARTIAL | `src/seed.js:98`, not displayed | none |

## §5.14.2 Tracking club social activity

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Per club: share of completed events with a link | MISSING | — | none |
| Per club: most recent post date | MISSING | — | none |
| Platform split | MISSING | — | none |
| Dean dashboard lists completed events missing links/photos | BUILT | `src/reporting.js:124-130`, `dean-overview.html:40-46` | "the Dean's overview chases missing evidence and shows the capture rate" |
| Semester report outreach line | PARTIAL | `socialLinks` returned per event (`src/reporting.js:85`) but `vc-report.html` does not render it | none |

## §5.15 Fests

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| 5.15.1 Fest parent record through the same workflow | PARTIAL | `festId` field and "part of a fest" VC routing (`src/api.js:114`, `src/approvals.js:38`); no fest entity, always null | none |
| 5.15.1 Sub-events inherit branding/window/venue | MISSING | — | none |
| 5.15.1 Participation, budget, photos roll up | MISSING | — | none |
| 5.15.1 One line in the semester report, expandable | MISSING | — | none |
| 5.15.1 Standalone events unaffected | BUILT | Trivially: nothing fest-related runs | none |
| 5.15.2 Public fest landing page | MISSING | — | none |
| 5.15.3 Fest organising team, time-bound, scoped roles | MISSING | Only a per-event `event_organiser` scope exists (`src/roles.js:38`) | none |
| 5.15.4 Fest budget envelope, shared costs, variance | MISSING | — | none |
| 5.15.5 External participants without SSO, separate store, retention | MISSING | `externalParticipants: 0` constant (`src/reporting.js:66`) | none |

## §5.16.1 How the scan station works

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Browser-based station on phone/tablet/laptop | BUILT | `organiser-scan.html`; camera via `src/qrcode.js:49-68` | none |
| Camera reads continuously, no tapping | BUILT | fps 10, debounced (`src/qrcode.js:55-63`) | none |
| Immediate feedback on screen and by sound, four distinguishable outcomes | PARTIAL | Colour-coded verdict with `aria-live` (`organiser-scan.html:50,111-121`); no sound | none |
| Sub-second recognition; parallel stations without conflict | PARTIAL | Local resolution; `stationId` supported but fixed in UI | none |
| Every scan records student, event, timestamp, station, operator | BUILT | `src/attendance.js:128-135` | "every branch writes a record, and failures move the capture rate" |
| Works offline, syncs on reconnect | PARTIAL | API only | "a replayed scan is flagged as offline" |

## §5.16.2 The student profile QR

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Always in profile, two taps | BUILT | `student-profile.html`, `src/api.js:657-679` | "the wallet shows the pass and a persistent profile QR" |
| Signed token; PRN not readable from the code | BUILT | `src/tokens.js:67-76,108`; `src/attendance.js:36-45` | "a tampered signature does not verify" |
| Scanning identifies instantly: registered → check in, else spot-register | BUILT | `src/attendance.js:236-259` | "3 — a registered student's profile QR is accepted" |
| High contrast, brightness raised automatically | PARTIAL | White holder (`assets/app.css:242-244`); `.bright` defined (`app.css:186`) but unused; no brightness control | none |
| Rotation by student or Student Life Office | PARTIAL | Student reissue (`src/attendance.js:47-57`); no office path | "reissuing the profile QR revokes the old one" |

## §5.16.3 Per-event passes

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Pass issued on registration, in app and by email | PARTIAL | In app (`src/attendance.js:59-69,96`; `student-passes.html`); email N/A | "registering mints a one-time pass" |
| Valid for that event only; single use | BUILT | `src/attendance.js:186-214` | "2 — the same pass twice is a duplicate, not an error" |
| Either code works at the gate | BUILT | `src/attendance.js:171-260` | "6 — a pass for another event is wrong_event, not invalid" |
| Multi-session passes | MISSING | — | none |

## §5.16.4 When the scan does not work

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| No phone: roster search by PRN/name, manual check-in | BUILT | `src/api.js:771-784,821-840`; `organiser-scan.html:173-196` | "manual check-in by PRN is still recorded with an operator" |
| Registered for a different event: mismatch shown | BUILT | `src/attendance.js:186-192` | "6 — a pass for another event is wrong_event, not invalid" |
| Already checked in: earlier time shown | BUILT | `src/attendance.js:146-151` | "2 — the same pass twice is a duplicate, not an error" |
| Walk-in: profile QR registers and checks in | BUILT | `src/attendance.js:243-259` | "4 — a walk-in's profile QR registers and admits in one scan" |
| Device failure: other device; paper list entered later, flagged | PARTIAL | Manual entries flagged `source:"manual"` (`src/attendance.js:281-291`); no bulk entry | none |
| No self-marking | BUILT | `src/api.js:646-654` | "a student cannot scan themselves in" |

## §5.16.5 Spot registration

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Single scan registers and checks in | BUILT | `src/attendance.js:243-259` | "4 — a walk-in's profile QR registers and admits in one scan" |
| Manual PRN entry, name confirmed from directory | BUILT | `organiser-scan.html:173-196` (name shown before "Check in") | "manual check-in by PRN is still recorded with an operator" |
| Short form for external fest visitors | MISSING | — | none |
| Capacity warning rather than silent overflow | BUILT | `src/attendance.js:244-247` | "a walk-in is refused once the event is full" |
| Spot registrations flagged | BUILT | `source:"spot"` (`src/attendance.js:250`); roster exposes it (`src/api.js:808`) | "an organiser gets the roster; a pass token never leaves its owner" |

## §5.17 Club console — live attendance view

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Live attendee list: name, PRN, programme, year, time, admission source | PARTIAL | All fields in `participation.roster` (`src/api.js:786-815`); page shows three waiting names and recent scans only (`organiser-scan.html:81-109`) | "an organiser gets the roster; a pass token never leaves its owner" |
| Running count vs capacity; registered-not-arrived | BUILT | `organiser-scan.html:52-57` | none |
| Search/filter by name, PRN, year, department | PARTIAL | Directory search by PRN/name across all students (`src/api.js:830-840`); no roster filter | none |
| Export attendee list | MISSING | — | none |
| Scoped to own club's events, limited window afterwards | PARTIAL | Scoped (`src/api.js:789-794`); no time window | "another club's president cannot work this door" |

## §5.18 Member roster & role assignment

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Pres/VP full roster; others a basic list | BUILT | `canAssignRoles` (`src/api.js:328`); `club-roster.html:41-45` (PRNs shown to all members) | "only the President and VP may assign roles" |
| Roles: member, core, treasurer, secretary, VP, president | BUILT | `src/roles.js:23-26`; `src/api.js:335-365` | "a second president is refused" |
| Assignment restricted to Pres/VP | BUILT | `src/api.js:339-342` | "only the President and VP may assign roles" |
| Every change recorded: who, when, effective date | PARTIAL | Who/when (`src/api.js:358-363`); no effective date | none |
| Permissions follow the role automatically | BUILT | Roles derived from memberships (`src/session.js:69-78`) | "each account resolves to the role it claims to be" |
| Roles carry an end date feeding handover | MISSING | `endedAt` never set | none |
| Advisor/Office see any roster; a President not another club's | DEVIATES-BY-DECISION | Dean/admin see all (`src/session.js:135`); outsiders get 404 (`src/api.js:307-310`) | "the VC cannot read any club roster" |

## §5.19.1 Approval stage tracker

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Stage shown per proposal (draft → submitted → review → sanctioned/returned/rejected → settled) | BUILT | `src/budget.js:12-25`; track `club-budget.html:26-35,43` | "a draft budget reports no blockers, only what it waits on" |
| "Advisor review" stage | DEVIATES-BY-DECISION | Society review instead (`src/budget.js:14`) | none |
| Days pending against expected turnaround | MISSING | — | none |
| Sanctioned amount per head with approver comments visible to club | PARTIAL | Amounts (`club-budget.html:72-73`); step comments returned by `governance.list` (`src/api.js:589-596`) but no club page renders them | none |
| Settled: requested/sanctioned/spent side by side with documents | BUILT | `club-budget.html:57-88` | "a receipt and a reason clear the blockers" |

## §5.19.2 What the three roles can do

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| View proposals and stage: P, VP, T | BUILT | `src/roles.js:46` | "budget visibility begins at Treasurer" |
| Create and submit a proposal: P, VP, T | BUILT | `src/roles.js:55` (MASTER_SPEC §9.3) | "the Treasurer adds entries and then it submits" |
| Record spend and receipts: P, VP, T | BUILT | `src/roles.js:52` (MASTER_SPEC §9.4) | "a receipt and a reason clear the blockers" |
| View annual envelope | MISSING | — | none |
| Assign roles: P, VP only | BUILT | `src/roles.js:43` | "only the President and VP may assign roles" |
| No club role approves its own budget | BUILT | `src/approvals.js:106-111` | "no club role approves its own budget" |

## §5.19.4 Receipts, invoices, supporting documents

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Attached per budget line | BUILT | `src/budget.js:251-257`; `club-budget.html:78-82` | "a receipt and a reason clear the blockers" |
| JPG/PNG/HEIC/PDF; multiple per line | PARTIAL | Array per line; no real file — `"receipt.pdf"` hard-coded (`club-budget.html:168-169`) | none |
| Capture photo in app at point of payment | MISSING | — | none |
| Each upload records file, amount, vendor, date, uploader | PARTIAL | fileName/byteSize/amount/at (`src/budget.js:252-253`); no vendor or uploader; page sends no amount | none |
| Compressed for storage, original retained | N/A-CLIENT-ONLY | — | none |
| Lines above a set amount need a document | BUILT | ₹5,000 (`src/budget.js:9,208-211`) | "blockers appear once settlement is reachable, all at once" |
| Treasurer primary; P/VP view and add | BUILT | `src/roles.js:52` | none |
| Advisor/Office/Dean view attachments at settlement | MISSING | No Dean settlement view; `approvalView` omits receipts (`src/api.js:547-576`) | none |
| Documents remain on the event afterwards | BUILT | Settled budgets lock (`src/api.js:482-485`); hint `src/budget.js:64` | none |

## §5.19.5 Ongoing visibility

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Annual envelope with utilisation | MISSING | — | none |
| Line-level variance across all the club's events | BUILT | All club budgets listed with columns (`club-budget.html:124-131`) | none |
| Outstanding items: events without spend, lines without docs | PARTIAL | Per-budget blockers (`src/budget.js:198-222`); no cross-event list; Dean chases photos/links, not spend | none |
| Notification on stage change, in-app and email | PARTIAL | In-app (`src/approvals.js:153-176`) | "submitting notifies the gate that holds it, and the club's officers" |

## §6.1 The semester report

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Produced on demand, no manual collation | BUILT | `src/reporting.js:21-97`; `vc-report.html` | "unique students and total attendance are different numbers" |
| Cover: semester, institution, date range, headline totals | PARTIAL | Semester name only (`vc-report.html:27`) | none |
| At a glance: events, participation, unique, active clubs | PARTIAL | Active clubs absent from report (`vc-report.html:32-36`; on overview only) | none |
| Trend vs previous semester | MISSING | Single semester seeded (`src/seed.js:150-154`) | none |
| By category split | MISSING | Category on `byClub` rows (`src/reporting.js:35`) but never aggregated; department split rendered instead | none |
| Club-wise summary with highlight photo | PARTIAL | `vc-report.html:45-48`; no photo | none |
| Fests as single entries | MISSING | — | none |
| Event highlights, photo-led | MISSING | Table with photo counts (`vc-report.html:58-71`) | none |
| Photo gallery | MISSING | — | none |
| PDF, PowerPoint, CSV | PARTIAL | `window.print()` only (`vc-report.html:30`) | none |

## §6.2 Core metrics

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Number of events | BUILT | `src/reporting.js:63` | "only reported events count, and absentees do not" |
| Total participation | BUILT | `src/reporting.js:64` | "unique students and total attendance are different numbers" |
| Unique students reached (led with) | BUILT | `src/reporting.js:29,65`; lead tile `vc-report.html:33` | "unique students and total attendance are different numbers" |
| Average attendance per event | BUILT | `src/reporting.js:67` | none |
| Events per club | BUILT | `src/reporting.js:31-39` | none |
| Participation by category | MISSING | Not aggregated | none |
| Fest participation own vs external | MISSING | `externalParticipants: 0` (`src/reporting.js:66`) | none |
| Semester-on-semester change | MISSING | — | none |

## §6.3 Dean dashboard

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Pending approvals with age | PARTIAL | Counts by stage, no age (`src/reporting.js:103-108`) | none |
| Events this week/month; upcoming venue conflicts | PARTIAL | Clash count only (`src/reporting.js:118`) | none |
| Active vs dormant clubs flagged | BUILT | `src/reporting.js:110-121`; `dean-overview.html:35-37` | none |
| Events missing photos, post links, closing report | BUILT | `src/reporting.js:124-130` | "the Dean's overview chases missing evidence and shows the capture rate" |
| Clubs with no social post in a window | MISSING | — | none |
| Running semester totals | PARTIAL | Not on overview; Dean can open the report page | none |

## §6.4 Management dashboard

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Live view of report figures for leadership | BUILT | VC reads `reports.semester` (`src/api.js:844-850`) | "the VC can read the report and the above-threshold queue" |
| Current vs previous semester | MISSING | — | none |
| Club-wise table sortable by events and reach | PARTIAL | Bars sorted by attendance (`src/reporting.js:68`); `eventsRun` not rendered; not sortable | none |
| Category split of participation | MISSING | — | none |
| Recent highlights with photos | MISSING | — | none |
| Export to PDF/PowerPoint | PARTIAL | Print only | none |

## §6.5 Making the numbers trustworthy

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| QR check-in gives actual count | BUILT | `src/attendance.js:153-158` | "every branch writes a record, and failures move the capture rate" |
| Registered/attended/no-show separate; report attended | BUILT | `src/reporting.js:26-27` | "only reported events count, and absentees do not" |
| Capture rate monitored | BUILT | `src/attendance.js:315-327`; `src/reporting.js:136-140` | "the Dean's overview chases missing evidence and shows the capture rate" |

## §7 Data model (not counted)

Present in the state document (`src/seed.js:156-171`, created by `src/api.js`/`src/attendance.js`): Club, Membership, Event, Registration (with department snapshot), StudentQRToken (`qrTokens`), EventPass (`passes`), ScanRecord (`scans`), Venue, Approval (with steps), BudgetTemplate (constants), BudgetLine, ReceiptDocument (stub), plus `notifications`, `audit`, `roleChanges`. Absent: OfficeBearerTerm, EventReport, Feedback, EventPhoto (count only), EventTemplate, Task, Volunteer, Sponsor, EventSocialPost (bare strings), Fest, FestRole, ExternalParticipant.

## §8 Non-functional requirements

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Performance: feed < 2 s, check-in < 1 s | N/A-CLIENT-ONLY | Local in-memory; unmeasurable here | none |
| Mobile-first | BUILT | Breakpoints and bottom nav (`assets/app.css:65-72,98,113,123,167,248-255`) | none |
| Offline tolerance for check-in | PARTIAL | API only (`src/api.js:757-769`) | "replaying the same queue twice does not double-record" |
| Peak registration load | N/A-CLIENT-ONLY | — | none |
| Scan throughput, parallel stations | PARTIAL | See §5.16.1 | none |
| Attendance integrity: organiser-only, one-time passes, duplicate rejection, rotatable tokens | BUILT | `src/api.js:646-654`; `src/attendance.js:203,238`; `src/attendance.js:47-57` | "a student cannot scan themselves in" |
| Privacy: purpose-limited, student notice, role-restricted individual records | PARTIAL | Strong role restriction with 404-not-403 (`src/session.js:135`, `src/api.js:307-310,789-794`); no DPDP notice; roster shows PRNs to every member | "no PRN or student name appears in anything the VC can read" |
| Accessibility WCAG 2.1 AA | PARTIAL | Labels, `:focus-visible` (`app.css:35`), `aria-live` gate, `aria-current`, reduced-motion (`app.css:134`), dark mode; but unlabeled in-table inputs, native `prompt()`/`confirm()`, emoji-only controls (see UI section) | none |
| Auditability of approvals, budget decisions, venue moves | BUILT | `src/approvals.js:276-281`; callers at `src/approvals.js:179`, `src/api.js:250,363,464,515` | "the audit trail is Dean and admin only" |
| In-app and email only; no SMS or third-party messaging | BUILT | Nothing but `notifications` exists; copy `src/ui.js:166-167`; AGENT_PROMPT §2 | none |
| Shared SSO, roles, notification services | N/A-CLIENT-ONLY | Local credentials designed to be swapped (`src/credentials.js:3-9`) | "a session survives a page load and carries the right claims" |

---

## Summary

| Subsection | Total | BUILT | PARTIAL | MISSING | DEVIATES | N/A |
|---|---:|---:|---:|---:|---:|---:|
| 4 Roles | 10 | 5 | 1 | 1 | 3 | 0 |
| 5.1 Directory & profiles | 5 | 0 | 3 | 2 | 0 | 0 |
| 5.2 Membership | 3 | 0 | 2 | 1 | 0 | 0 |
| 5.3 Succession | 3 | 0 | 0 | 3 | 0 | 0 |
| 5.4 Event lifecycle | 8 | 2 | 4 | 1 | 1 | 0 |
| 5.5 Discovery | 7 | 1 | 3 | 2 | 0 | 1 |
| 5.6 Registration & attendance | 4 | 2 | 2 | 0 | 0 | 0 |
| 5.7.1 Template library | 2 | 1 | 1 | 0 | 0 | 0 |
| 5.7.2 Template behaviour | 7 | 3 | 3 | 1 | 0 | 0 |
| 5.7.3 Sanction & reconciliation | 6 | 3 | 1 | 1 | 1 | 0 |
| 5.8 Feedback | 3 | 0 | 0 | 3 | 0 | 0 |
| 5.9.1 Venue inventory | 5 | 1 | 3 | 1 | 0 | 0 |
| 5.9.2 Venue overview | 6 | 2 | 2 | 2 | 0 | 0 |
| 5.9.3 Reassignment | 7 | 2 | 3 | 2 | 0 | 0 |
| 5.10 Photos | 6 | 1 | 0 | 4 | 0 | 1 |
| 5.11 Templates & automation | 6 | 1 | 1 | 3 | 0 | 1 |
| 5.12.1 Before the event | 6 | 0 | 1 | 5 | 0 | 0 |
| 5.12.2 On the day | 5 | 2 | 2 | 1 | 0 | 0 |
| 5.12.3 After the event | 5 | 0 | 0 | 5 | 0 | 0 |
| 5.13 Approval configuration | 5 | 2 | 2 | 1 | 0 | 0 |
| 5.14.1 Post links | 6 | 0 | 4 | 2 | 0 | 0 |
| 5.14.2 Social tracking | 5 | 1 | 1 | 3 | 0 | 0 |
| 5.15 Fests | 9 | 1 | 1 | 7 | 0 | 0 |
| 5.16.1 Scan station | 6 | 3 | 3 | 0 | 0 | 0 |
| 5.16.2 Profile QR | 5 | 3 | 2 | 0 | 0 | 0 |
| 5.16.3 Event passes | 4 | 2 | 1 | 1 | 0 | 0 |
| 5.16.4 Fallbacks | 6 | 5 | 1 | 0 | 0 | 0 |
| 5.16.5 Spot registration | 5 | 4 | 0 | 1 | 0 | 0 |
| 5.17 Club console | 5 | 1 | 3 | 1 | 0 | 0 |
| 5.18 Roster & roles | 7 | 4 | 1 | 1 | 1 | 0 |
| 5.19.1 Stage tracker | 5 | 2 | 1 | 1 | 1 | 0 |
| 5.19.2 Role matrix | 6 | 5 | 0 | 1 | 0 | 0 |
| 5.19.4 Receipts | 9 | 4 | 2 | 2 | 0 | 1 |
| 5.19.5 Ongoing visibility | 4 | 1 | 2 | 1 | 0 | 0 |
| 6.1 Semester report | 10 | 1 | 4 | 5 | 0 | 0 |
| 6.2 Core metrics | 8 | 5 | 0 | 3 | 0 | 0 |
| 6.3 Dean dashboard | 6 | 2 | 3 | 1 | 0 | 0 |
| 6.4 Management dashboard | 6 | 1 | 2 | 3 | 0 | 0 |
| 6.5 Trustworthy numbers | 3 | 3 | 0 | 0 | 0 | 0 |
| 8 Non-functional | 11 | 4 | 4 | 0 | 0 | 3 |
| **Grand total** | **235** | **80** | **69** | **72** | **7** | **7** |

- BUILT: 80 / 235 = **34.0 %**. BUILT + PARTIAL: 149 / 235 = **63.4 %**.
- Excluding N/A-CLIENT-ONLY (228 rows): BUILT 35.1 %, BUILT + PARTIAL 65.4 %. Excluding N/A and DEVIATES (221 rows): 36.2 % and 67.4 %.
- Where it is strong: §5.16 attendance capture (21 of 26 rows BUILT), §5.19.2 role matrix, §6.2/6.5 metric integrity, §5.7.3 sanctioning. Where it is thin: §5.1–5.3 (clubs as a thing students discover and join), §5.8, §5.10, §5.12, §5.15, and the narrative/visual half of §6.1.

---

## The 10 most significant gaps (priority order)

1. **An overspent line can never be settled from the UI.** `settlementProblems` demands a `varianceNote` (`src/budget.js:213-219`) but `club-budget.html:191-196` only ever sends `amountSpent`; no input exists for the note. The blocker is shown and cannot be cleared. Functional bug on the core money path.
2. **Sidebar pages that land on an error.** At seed, Swara has no published/live event, so the Swara President and Secretary are offered "Scan station" and get a 404 box (`organiser-scan.html:27-32`). `club-events.html:52-53` also shows a "Scan station" link on live events to every club role, including the Treasurer and member, who are then refused.
3. **Sanction inputs at the Society and Management gates are silently ignored.** `society-approvals.html:69-72` and `vc-queue.html:69-72` render editable "Sanction" fields, but `applySanctions` runs only at the Dean stage (`src/approvals.js:141`). An approver who reduces a head there sees a success toast and nothing changes.
4. **No feedback or surveys (§5.8, §5.12.3).** Half of "impact measurement" — outcomes rather than headcount — is absent, and the PRD makes it a Phase 2 item.
5. **No club directory, profile, or join flow (§5.1–5.2).** The "make discovery effortless for first-years" goal has no surface at all; `clubs.list` exists in the API but no page calls it.
6. **Photos and receipts are numbers and filenames, not evidence.** "Close with photos" is a `prompt()` for a count (`club-events.html:76`); receipts are a hard-coded `"receipt.pdf"` (`club-budget.html:168-169`). The gallery, highlight images, consent notice and Dean-side view of attachments are missing.
7. **Semester report is numerically right but structurally thin (§6.1, §6.4).** No trend vs previous semester, no category split (category is in the data but never aggregated), no fest line, no highlights/gallery, no PPTX/CSV; export is `window.print()`.
8. **Offline check-in and multi-station are API-only (§5.6, §5.12.2, §5.16.1).** `syncOffline` is tested but the station page never queues; `stationId` is fixed to `GATE-1`; no audible feedback.
9. **No annual envelope, no approval SLA age/escalation, no delegation (§5.7.3, §5.11, §5.13, §6.3).** The Dean dashboard shows counts, not ages; the chain is a code constant rather than configuration.
10. **Phase 4 and succession absent as documented (§5.3, §5.11–5.12, §5.15):** no handover or role end dates, no event cloning, task checklists, volunteers, sponsors, certificates, fests or external participants. Also notable: approver comments on a return/reject are only ever seen in a notification body — no club page shows them (`src/api.js:589-596` returns steps; nothing renders them).

---

## Test coverage

**Count.** Static count of `test(` registrations: `e2e.signin.mjs` 16 calls, two of which sit in a loop over three staff personas (`tests/e2e.signin.mjs:72-89`) → 20 cases; `e2e.budget-approvals.mjs` 32; `e2e.attendance.mjs` 32; `e2e.roles-reporting.mjs` 25. **109 cases in 16 `describe` blocks.** README, package.json and CONTRIBUTING say "89" — that figure is stale. All run against the real seed through `harness.mjs:93-102` (`world()` reseeds per test), with no DOM.

**Per file.**
- `e2e.signin.mjs` — credential verification, identical refusal for unknown/wrong, suspended accounts, mandatory MFA for dean/vc/society, whitespace not a factor, session persistence and sign-out, no plaintext passwords in state, every documented account installed.
- `e2e.budget-approvals.mjs` — unpriced shell, submit blocked until priced or nil, Treasurer builds and submits, member cannot see/add, duplicate heads, freeze under review, Treasurer cannot go live/close; nil declaration rules (reason, conflict with priced lines, withdrawal); per-gate queues, threshold adds VC, three-gate publish, wrong-stage 409, return/reject comments, resubmit after return, terminal rejection, reduce-not-raise sanction, untouched heads sanctioned as requested, self-approval refused, clash blocks approve but not return; settlement ordering, blockers reported together, receipt + reason clear them, nil settles.
- `e2e.attendance.mjs` — pass minting, wallet, profile reissue revokes, double registration, cancel revokes pass; all seven scan branches plus tampered, expired and replaced passes; every branch writes a record and moves capture rate; door permissions for president/student/member/treasurer/other club/dean/VC; roster and token exposure; manual PRN check-in recorded; PRN lookup refused to VC/student; offline replay ordering, idempotence, offline flag; capacity for walk-ins, registration, unpublished events.
- `e2e.roles-reporting.mjs` — budget visibility and 404 shape, role assignment limits, second-president conflict, member cannot propose, Dean-only reassign with reason, staff-only calendar, Dean/admin-only audit; VC reads report and queue but no roster/attendee list/overview, no PRN in anything VC sees; report: unique vs total, reported-only and absentees excluded, department snapshot, caveats and no individual rows, Dean overview chase list and capture rate; closing needs a photo; notifications to gate and officers, mark-read scoping.

**Smoke (`tests/smoke.mjs`).** Seven checks: every page file is listed in the sidebar and vice versa (`:22-35`); every relative import resolves to a real export (`:37-109`); each persona is offered exactly the expected pages (`:120-145`); each offered page's own API call does not refuse (`:147-184`); all nine demo credentials sign in, wrong password and missing MFA are refused (`:186-236`); DEMO_CREDENTIALS.md lists every account/password/code (`:238-256`); seed is substantial and has attendance overlap (`:258-278`). It covers every page's existence and wiring, not its rendering. Its scan-station probe returns `null` when a persona has no open door (`:164-168`), so gap #2 passes smoke.

**Browser (`tests/browser.sh` + `tests/boot.html`).** Optional headless-Chrome render of each page as an entitled persona, failing on an `.err` box or a missing heading. Needs Chrome and a running server; not wired into `.github/workflows/ci.yml`.

**User-facing behaviour with no test.** Everything DOM-level (buttons, prompts, redraws) except via the optional browser script; `GOVERNANCE_MFA_REQUIRED` for above-threshold approval without a verified session (all test sessions are verified); `EVENTS_END_BEFORE_START`, `EVENTS_OVER_CAPACITY`, `EVENTS_TITLE_REQUIRED`; `BUDGET_ALREADY_SETTLED`; `updateLine`/`removeLine`/`withdrawNil` API paths beyond one case; template arithmetic (`per_head`, 8 % contingency, `requiresVc` flag); `events.clashes` free-venue list and `EVENTS_VENUE_TOO_SMALL`; venue calendar contents and day selection; `deanOverview.venueUse`/`clubsInactive`; directory search matching; cancel of an attended registration; the variance-note settlement path from the page (gap #1 would have been caught by a page-level test); sanction edits at non-Dean gates (gap #3).

---

## UI/UX and quality

**Reachable-but-errors / broken flows.**
- Scan station for Swara President/Secretary at seed shows a red 404 box as its empty state (`organiser-scan.html:27-32`); `club-events.html:52-53` links non-door roles to it.
- Overspent lines cannot be settled (no variance-note input) — see gap #1.
- Society/VC sanction fields are decorative — see gap #3.
- Approver comments never surface to the club except as a notification line; `club-events.html` shows only "Returned"/"Rejected" pills.
- `notifyClub` reaches `BUDGET_VIEWERS` only (`src/approvals.js:263-264`), so a Secretary who submitted gets no outcome notification.
- Dean "Move" auto-selects the first free venue (`dean-venues.html:95`) with a native `prompt()` for the reason; no venue choice, no time-slot alternative.
- Closing an event asks for a photo count via `prompt()` and hard-codes an Instagram URL (`club-events.html:76-81`); receipts are a fixed filename.
- `index.html:58` links to `DEMO_CREDENTIALS.md`; on Netlify/Pages that serves `text/markdown`, which most browsers download rather than display.
- Internal links otherwise all resolve (`student-events`, `student-passes`, `club-budget`, `club-events`, `club-new-event`, `organiser-scan`, `index`). `club-new-event.html:18` imports `db` unused; `organiser-scan.html:158-169` reads `db()` directly, bypassing the API for tester convenience.

**Empty states.** Present and worded for the walkthrough: events (`student-events.html:42-43`), passes (`:35-37`), club events (`club-events.html:56-57`), budgets (`club-budget.html:130`), each approval queue ("All caught up at this gate"), recent scans, notifications. The venue page with no bookings leaves the day select empty but does not crash. The scan station's "no open door" case is an error, not an empty state.

**Mobile.** Single-column layout under 820 px with a fixed bottom nav that scrolls horizontally (`app.css:65-72,248-255`); `.layout` reserves 96 px; toasts sit above the nav (`app.css:183`); tables and the venue calendar scroll inside `.table-wrap` (`app.css:99-100,145`); tiles collapse 4→2 columns (`app.css:167`); ticket stub stacks (`app.css:123`); login columns stack (`app.css:217`). Risks: "Sign out" is the last item of a horizontally scrolling bottom bar and is easy to miss; the scan page's event `<select>` sits in the header row and wraps awkwardly at narrow widths; native `prompt()`/`confirm()` dialogs are poor on phones. No horizontal page overflow found in the CSS.

**Accessibility basics.** Good: `lang`, viewport, 16 px base, visible `:focus-visible` ring (`app.css:35`), `prefers-reduced-motion` and dark mode, `<label for>` on form fields in `index.html`, `club-new-event.html`, `club-budget.html` add-row, `organiser-scan.html` paste field, approval comment boxes; `aria-live="assertive"` on the gate verdict; `aria-current="page"` and `aria-label` on the nav; `tabindex="-1"` on `<main>`. Gaps: in-table inputs have no accessible name (`club-budget.html:63-77`, `dean-approvals.html:69-72`, `society-approvals.html:69-72`, `vc-queue.html:69-72`, `club-roster.html:42`); the remove button is "✕" with only a `title` (`club-budget.html:83`); emoji-prefixed buttons (🎫 🔁 🚶 📎 🔔); the PRN lookup field has no `<label>` (`organiser-scan.html:79`); no skip link; calendar block states rely on colour plus border style; contrast of `--muted` on `--paper` and the warn pill is borderline and unverified; `prompt()`/`confirm()` for consequential actions.

**Deployment readiness.**
- **Netlify:** `netlify.toml` present — publish `.`, no build command, explicit `text/javascript` for `/src/*.js`, `nosniff`, referrer policy, no-cache for HTML, 1 h for assets. Adequate. Consider a CSP that allows `cdn.jsdelivr.net` (QR and camera libraries) and `X-Frame-Options`. `.nojekyll` and a Pages workflow (`.github/workflows/pages.yml`) cover GitHub Pages; `ci.yml` runs smoke + e2e on Node 20 on every push/PR.
- **Vercel:** no `vercel.json` exists. None is strictly required (static root, no build script, correct JS MIME by default). To mirror the Netlify headers add:
  `{"headers":[{"source":"/(.*)\\.html","headers":[{"key":"Cache-Control","value":"public, max-age=0, must-revalidate"},{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"}]},{"source":"/assets/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=3600"}]}],"cleanUrls":false,"trailingSlash":false}`
  Keep `cleanUrls` off: every internal link targets `*.html` explicitly, including the `index.html?next=` redirect (`src/ui.js:190-191`).
- **Runtime dependencies:** two jsdelivr CDN scripts, loaded lazily with a text-token fallback (`src/qrcode.js:13-26`); Web Crypto required (`src/tokens.js:25-28`), so HTTPS or localhost only.
