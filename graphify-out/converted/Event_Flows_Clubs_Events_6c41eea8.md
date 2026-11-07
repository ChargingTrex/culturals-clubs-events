<!-- converted from Event_Flows_Clubs_Events.docx -->

PROCESS DOCUMENT
Event Flows
Clubs & Events Application
Swimlanes for each process, and a chapter for each view
Version 1.0  ·  Draft
Companion to the Student Life — Clubs, Events & Impact PRD

# Table of Contents



# 1. Basis of These Flows
This document turns the Clubs & Events PRD into operational flows. Part A gives swimlanes for the four processes that matter; Part B gives a chapter per view, describing what each role sees and does.
## 1.1 Confirmed approval chain
The flows below use the approval chain as it actually works, which differs from the PRD draft.
| Request type | Approval chain |
| --- | --- |
| Standard club event | Dean of Student Affairs only — single gate, no faculty advisor step |
| Event budget below threshold | Dean of Student Affairs only |
| Budget above threshold | Dean of Student Affairs, then Vice-Chancellor |
| Fest | Dean of Student Affairs, then Vice-Chancellor / Management |
Correction needed in the PRD: PRD section 5.13 assumes a faculty advisor reviews before the Dean. That step does not exist here. The PRD should be updated so the two documents agree — otherwise the build team will implement an approval stage nobody uses.
One gap still open: the fest chain was described as three levels, but two were named — Dean of Student Affairs and Vice-Chancellor / Management. The fest swimlane below marks where a third gate would sit if one exists (a finance or registrar review is the usual candidate). Confirm before build.
## 1.2 Who acts and who receives
| Role | Acts in the flow? | What they do |
| --- | --- | --- |
| Student | Yes | Discovers, registers, attends, gives feedback |
| Club member | Yes | As a student, plus internal club visibility |
| Organiser | Yes | Runs the event and the scan station |
| President / Vice-President | Yes | Submits proposals, manages roster and roles |
| Treasurer | Yes | Owns budget entry, spend and receipts |
| Dean of Student Affairs | Yes — decision maker | Approves or rejects every event and budget |
| Vice-Chancellor / Management | Only above threshold | Approves large budgets and fests; receives semester reports |
| Student Life Office | Yes — operational | Venues, templates, club records |
Note on Management: in most flows the Vice-Chancellor does not appear at all. Management is a recipient of the semester report, not a participant in day-to-day events. They enter the flow only for budgets above the threshold and for fests.

# Part A — Process Swimlanes
## 2. Standard Event — End to End
The default path. One approval gate, and no Management involvement unless the budget crosses the threshold.
| Stage | Club (organiser / President) | Dean of Student Affairs | Student | System |
| --- | --- | --- | --- | --- |
| 1. Propose | Selects event type; template pre-fills proposal, checklist and budget. Submits. | — | — | Validates dates and venue availability; notifies Dean |
| 2. Approve | Sees stage change; can revise if returned | Reviews proposal and budget. Approves, returns for changes, or rejects — line-level on budget | — | Records decision, timestamps it, notifies club by app and email |
| 3. Venue | Confirms booking, reserves equipment | — | — | Detects double-booking; blocks exam blackout dates |
| 4. Publish | Adds description and cover image | — | Sees it on calendar and personalised feed | Publishes automatically on approval; targeted in-app and email announcement |
| 5. Register | Monitors numbers against capacity | — | Registers in one tap; receives event pass in app and by email | Enforces capacity, manages waitlist, issues pass |
| 6. Check in | Runs scan station at the door; handles walk-ins | — | Presents event pass or profile QR to the camera | Validates, rejects duplicates, records attendance, works offline and syncs |
| 7. Feedback | Reviews aggregate scores | — | Receives survey, submits rating and comments | Sends automatically to those who actually attended |
| 8. Report | Enters outcomes, uploads photos and social links, records actual spend with receipts | Sees completed report; chases anything outstanding | — | Pre-fills attendance and sanctioned budget; blocks submission without a photo |
The two stages that carry the whole system: stage 6 produces a counted attendance figure instead of an estimate, and stage 8 forces photos and actual spend before an event can close. Every number in the semester report comes from these two.
## 3. Fest — Sub-events and External Participants
A fest adds a second approval gate, a parent record, and a class of participant who has no login.
| Stage | Fest team | Dean of Student Affairs | Vice-Chancellor / Management | System |
| --- | --- | --- | --- | --- |
| 1. Fest proposal | Convenor submits fest: theme, dates, sub-event list, combined budget | Reviews and endorses, or returns | — | Creates parent fest record; routes onward |
| [ Third gate — confirm ] | — | — | — | Slot reserved if a finance or registrar review sits between Dean and VC |
| 2. Fest approval | Responds to queries | — | Approves fest and budget envelope, possibly reduced | Records decision; notifies fest team |
| 3. Set up sub-events | Sub-event heads create competitions under the fest; each inherits branding and dates | Visibility only | — | Links sub-events to parent; rolls up budget and participation |
| 4. Fest page | Uploads hero banner, schedule, rules, sponsor logos | — | — | Generates public shareable page; archives previous editions |
| 5. Registration | Monitors entries per sub-event | — | — | Own students register with login; external participants register without an account and receive a QR by email |
| 6. Check in | Scan stations per sub-event or entrance | — | — | Session-level check-in; own students and external participants recorded separately |
| 7. Settlement | Sub-event heads submit reports; Treasurer settles shared and sub-event costs with receipts | Reviews settlement | Sees final spend against sanctioned envelope | Aggregates to fest total; shows variance by head |
| 8. Report | Fest report with photos and totals | Receives | Receives in semester report as one entry | Fest appears as a single line, expandable to sub-events |
Report the two participant groups separately: own-student reach is the student-life metric; external participation measures the fest's draw. Combined into one figure, neither is legible to Management.
## 4. Club Setup, Roster and Handover
### 4.1 Starting a new club
| Stage | Proposing students | Dean of Student Affairs | Student Life Office | System |
| --- | --- | --- | --- | --- |
| 1. Apply | Submit club proposal: purpose, category, founding members, proposed President | — | — | Creates club record in proposed status |
| 2. Decide | Respond to queries | Approves or rejects | — | Records decision and notifies |
| 3. Set up | President and VP appointed | — | Confirms record, adds to directory | Club becomes active; roster opens; social handles recorded |
### 4.2 Members joining and role assignment
| Actor | Action | Who can do it | System |
| --- | --- | --- | --- |
| Student | Requests to join a club from its profile page | Any student | Open or approval-based joining per club setting |
| President / VP | Accepts or declines join requests | President, VP only | Adds to roster with joined date |
| President / VP | Assigns roles: member, core, Treasurer, Secretary, VP, President | President, VP only | Permissions follow the role automatically; change logged with who, when, effective date |
| Treasurer | Cannot assign roles | Blocked | Budget access granted by role, not self-selected |
| Member | Views club internals and roster (no controls) | Any member | Read-only view |
### 4.3 Annual handover
| Stage | Outgoing bearers | Incoming bearers | System |
| --- | --- | --- | --- |
| 1. Nominate | Record successors with effective date | Accept the role | Holds pending role change |
| 2. Transfer | Confirm handover of documents, vendor list, past reports | Gain access | Permissions move automatically on the effective date |
| 3. Close out | Access ends | Full access | Old roles carry an end date; history of who held what is retained |
Why the effective date matters: without it, outgoing bearers keep permissions indefinitely and nobody notices. Dated roles mean access expires on its own rather than depending on someone remembering to revoke it.
## 5. Exception Paths
What happens when the normal path fails. These are the flows most likely to be improvised if they are not specified.
### 5.1 Proposal rejected or returned
| Trigger | What happens | Who is notified |
| --- | --- | --- |
| Dean returns for changes | Proposal reverts to draft with comments attached; club revises and resubmits; history retained | Club President and submitter |
| Dean rejects outright | Event closed with reason recorded; cannot be resubmitted unchanged | Club President and submitter |
| Budget reduced at line level | Event proceeds; sanctioned amount differs from requested and is visible per head | President, VP, Treasurer |
| Approval overdue | Escalates on the Dean's dashboard showing days pending | Dean; Student Life Office |
### 5.2 Event cancelled or postponed
| Trigger | What happens | Who is notified |
| --- | --- | --- |
| Club cancels before the event | Event marked cancelled with reason; venue released; registrations voided; passes invalidated | All registered students, by app and email |
| Postponed | New date proposed; venue rechecked for conflicts; existing registrations carried or reopened | All registered students |
| Cancelled after spend committed | Event closes as cancelled but settlement still required — spend and receipts recorded against the club | Dean, Treasurer |
Do not let a cancelled event skip settlement: money is often already spent on a cancelled event. If cancellation closes the record without a settlement step, that spend disappears from the budget picture entirely.
### 5.3 Check-in problems at the door
| Situation | Organiser action | How it is recorded |
| --- | --- | --- |
| Student has no phone or a dead battery | Search roster by PRN or name and check in manually | Marked as manual entry |
| Profile QR will not scan | Raise screen brightness; if it still fails, search the roster | Normal or manual entry |
| Code already scanned for this event | Station shows the earlier check-in time; organiser resolves in person | Duplicate rejected, not double-counted |
| Student registered for a different event | Station shows the mismatch; redirect or spot-register for this one | Spot registration if admitted |
| Walk-in with no registration | Scan profile QR — registers and checks in together | Flagged as spot registration |
| Camera or device fails entirely | Switch to another device; last resort is a paper list entered afterwards | Flagged as manually entered |
| No connectivity at the venue | Continue scanning — the station works offline | Syncs automatically when connection returns |
There is no self-marking path: attendance is only ever recorded by a scan or by an organiser at the station. A student cannot mark themselves present from elsewhere, because that would prove only that they knew about the event.
### 5.4 Missing receipts and unsettled budgets
| Trigger | What happens | Who is notified |
| --- | --- | --- |
| Event completed, spend not entered | Appears as outstanding on the club's budget view and the Dean's dashboard | Treasurer, President, VP |
| Line above threshold has no receipt | Line cannot be settled; settlement blocked until a document is attached | Treasurer |
| Receipt illegible or disputed | Dean or Student Life Office requests a replacement; line stays unsettled | Treasurer |
| Spend exceeds sanctioned amount | Variance flagged per head; explanation required before settlement | Treasurer, President, Dean |
| Club repeatedly leaves budgets unsettled | Visible on the Dean's dashboard as a governance signal | Dean |
### 5.5 Missing photos or reports
| Trigger | What happens |
| --- | --- |
| Event report submitted without a photo | Blocked — at least one photo is required to close an event |
| Event completed but no report after a set period | Flagged on the Dean's dashboard and the club's own view |
| No social post link recorded | Flagged where required for the event size; does not block closure by default |

# Part B — Views
What each role sees, what they can do, and what they never see.
## 6. Student View
### Journey
Discover → register → attend → give feedback.
### What they see
- Personalised feed and campus calendar, filtered by category, club, date and department.
- Event pages: details, capacity, venue, organiser contact, registration status.
- Club directory and profiles; join requests.
- Their profile QR — always available, two taps after login, used at any event.
- Their own registrations, event passes, and attendance history.
- Notifications by in-app and email only.
### What they can do
- Register and cancel; join a waitlist; join clubs; submit feedback.
### What they never see
- Other students' attendance, any budget information, approval decisions, or club internals for clubs they have not joined.
## 7. Club Member View
Everything a student sees, plus internal club visibility. No administrative controls.
- Club roster (names and roles), internal announcements, and the club's upcoming events.
- Past event reports and photo galleries for their club.
- May volunteer for event roles and shifts when an organiser opens a roster.
Members do not see budget figures. Budget visibility begins at Treasurer, Vice-President and President. A member sees what the club is doing, not what it costs.
## 8. Organiser View
A member running a specific event. Scope is the event, not the club.
### Before the event
- Create the event from a template; task checklist with owners and dates counted back from event day.
- Build a custom registration form; open team entries where relevant.
- Assign volunteers to roles and shifts; manage speakers and sponsor deliverables.
### At the door — the scan station
- Runs in a browser on any device with a camera; students present a pass to it like a metro gate.
- Immediate accepted / duplicate / wrong-event / not-registered feedback, readable at a glance in a queue.
- Spot registration in a single scan of the student's profile QR.
- Roster search by PRN or name as the manual fallback.
- Works offline; several stations can run in parallel.
### Live attendance view
- Attendee list with name, PRN, programme and year, check-in time, and how they were admitted.
- Running count against capacity; registered-but-not-arrived.
### After the event
- Auto-drafted report with attendance and sanctioned budget pre-filled; adds outcomes, photos, social links and learnings.
Access is scoped and time-bound: an organiser sees attendee identities only for their own club's event, and only while it is active plus a limited window afterwards. This is student personal data, not a browsable directory.
## 9. Club Leadership View — President, Vice-President, Treasurer
### 9.1 Roster and roles
- President and VP open the full roster and assign roles; every change is logged with effective dates.
- Treasurer and Secretary cannot assign roles.
- Roles carry end dates and feed the annual handover.
### 9.2 Budget
All three see the club's budget. What differs is who owns entry.
| Action | President | Vice-President | Treasurer |
| --- | --- | --- | --- |
| View proposals and approval stage | Yes | Yes | Yes |
| Create and submit a proposal | Yes | Yes | Yes |
| Record actual spend, upload receipts | Yes | Yes | Yes — primary owner |
| View annual envelope and utilisation | Yes | Yes | Yes |
| Assign member roles | Yes | Yes | No |
| Approve the club's own budget | No | No | No |
### 9.3 Approval stage tracker
Draft → Submitted → Dean review → (Vice-Chancellor, if above threshold) → Sanctioned → Settled. Rejected or returned can occur at any gate. Days pending are shown at each stage so nobody has to chase for an update.
### 9.4 Settlement and receipts
- Receipts attached per budget line, not bundled — a hospitality bill sits under the hospitality head.
- Phone photographs (JPG, PNG, HEIC) and PDF invoices; multiple files per line.
- Each upload records amount, vendor, date and uploader.
- Lines above the configured amount cannot settle without a document.
- Outstanding settlements are visible to the club before the Dean has to ask.
## 10. Dean of Student Affairs View
The decision maker in every flow, and the only approval gate for standard events.
### 10.1 Actions
- Approve, return, or reject every event proposal.
- Sanction budgets — at line level, not only in total — and escalate above the threshold to the Vice-Chancellor.
- Approve new clubs.
- Endorse fests before they go to Management.
### 10.2 Operational dashboard
- Pending approvals with age, so nothing sits unactioned.
- Events this week and this month; venue conflicts flagged before they become collisions.
- Active versus dormant clubs; clubs with no recent event or social post.
- Events missing photos, reports, or settlement.
- Running semester totals — events and participation to date.
- Budget utilisation against the annual envelope.
### 10.3 Venue oversight
- Master calendar of every venue and every booking, by day, week or month, showing event, club and whether the booking is provisional or confirmed.
- Clash alerts showing both competing events side by side, with capacity against expected attendance.
- Pressure view: dates where demand exceeds available venues, visible far enough ahead to stagger events.
- Utilisation across venues, so an event can be redirected to a space that is free and adequate.
- Direct reassignment: move a clashing event to another venue or time slot, with a required reason; the affected club and any registered students are notified automatically.
| Trigger | Dean action | System |
| --- | --- | --- |
| Two proposals want the same venue and time | Reviews both; reassigns one | Offers only venues free at that time and large enough; releases the old slot in the same transaction |
| Venue demand spikes on one date | Staggers events across the week | Pressure view surfaces the date in advance |
| An event outgrows its venue | Moves it to a larger space | Filters by capacity against expected attendance |
| Reassignment made | Enters the reason | Notifies club and registered students by app and email; records history on the event |
Precedence needs a stated rule: the system can enforce first-submitted, largest-attendance, fest-over-event, or Dean's discretion — but the rule has to be chosen. Without one, every clash becomes an individual negotiation.
### 10.4 What the Dean does not do
- Does not run scan stations, manage rosters, or enter spend. Those sit with clubs.
Single-gate approval is a throughput risk: with no advisor step, every event in the institution passes through one person. Approval-age tracking and delegation during absence are what keep this from becoming a bottleneck — worth confirming who covers when the Dean is unavailable.
## 11. Management View — Vice-Chancellor
Largely a recipient. Management does not appear in the standard event flow at all.
### 11.1 When Management acts
- Approves budgets above the configured threshold, after the Dean.
- Approves fests, after the Dean's endorsement.
### 11.2 What Management receives
- The semester report: events run, total participation, unique students reached, average attendance, split by category, comparison with the previous semester, photo-led highlights, and budget asked against sanctioned against spent.
- A live dashboard of the same figures, viewable at any time rather than only at semester end.
- Fests as single entries, expandable to sub-events, with own students and external participants shown separately.
- Export to PDF or slides.
Lead the report with unique students reached: twenty events attended by the same eighty students and twenty events reaching six hundred both report 1,600 total attendance. Only the unique figure distinguishes them, and only the second justifies the budget.
## 12. Student Life Office View
- Maintains venues, budget templates, event templates and approval configuration.
- Manages club records and the directory; can view any club's roster.
- Handles venue conflicts and the calendar, including exam blackout periods.
- Reviews receipts during settlement; requests replacements where illegible.
- Spot-checks social post links rather than validating them automatically.
## 13. Registration View
| Actor | What they see | What they can do |
| --- | --- | --- |
| Student | Event page with capacity, deadline, and their own status | Register, cancel, join waitlist, complete custom form fields, enter as a team |
| External fest participant | Public fest page; no login | Register with name, college, email, phone; receives QR by email |
| Organiser | Registration list with counts against capacity | Close registration early, adjust capacity, promote from waitlist, spot-register at the door |
| Club leadership | Registration numbers across the club's events | No direct registration control unless also the organiser |
| Dean | Registration and attendance totals only | No individual-level access outside their own oversight need |
## 14. Attendance View
### 14.1 The two codes
| Code | Where it lives | Used for | Reusable? |
| --- | --- | --- | --- |
| Profile QR | Student's profile, always available after login | Any event; the universal path and the spot-registration route | Yes — persistent, rotatable if compromised |
| Event pass | Issued on registration, in app and by email | That event only; the fast path for pre-registered students | No — one-time, rejected on second scan |
### 14.2 What each role sees
| Role | Attendance visibility |
| --- | --- |
| Student | Their own attendance history only |
| Organiser | Full attendee list with names and PRNs, for their own event, time-bound |
| Club leadership | Attendance totals across the club's events; individual lists for their own events |
| Dean | Totals, trends, and capture rate per club — not routine individual browsing |
| Management | Aggregate figures only, in the semester report |
Attendance capture rate is itself a metric: a club marking attendance poorly makes every downstream number wrong. Tracking what proportion of an event's attendees were actually scanned makes that visible and correctable rather than silently distorting the semester report.
# 15. Open Points to Confirm
- Is there a third approval gate for fests between the Dean and the Vice-Chancellor?
- What budget amount triggers escalation to the Vice-Chancellor?
- Who approves when the Dean is unavailable — is delegation permitted?
- When two events want the same venue, what decides which one yields?
- Above what amount must a budget line carry a receipt before settlement?
- Should PRD section 5.13 be rewritten to remove the faculty advisor step entirely, or retained as configurable for future use?
- For a cancelled event with committed spend, who signs off the settlement?