<!-- converted from Decision_Log.docx -->

DECISION LOG
Decisions & Rationale
Student Portal · Clubs & Events Application
What was decided, why, what was rejected, and what remains open
Version 1.0  ·  Living document

# Table of Contents



# 1. Purpose & How to Use This
This log records every significant decision taken on the portal and the Clubs & Events module, with the reasoning behind it and the alternatives that were rejected. It exists so that a decision made once is not relitigated every time a new person joins, and so that when circumstances change it is clear what a reversal would cost.
- Each record states what was decided and why, what was rejected, and what would justify revisiting it.
- Superseded decisions are struck through in status, not deleted. The history is the point.
- Open items are listed separately in section 6 and should be resolved before the affected work begins.
## 1.1 Decision index
| ID | Decision | Status |
| --- | --- | --- |
| D-01 | Backend framework: Django + DRF | Decided |
| D-02 | Frontend: React + TypeScript | Decided |
| D-03 | Database: PostgreSQL | Decided |
| D-04 | IIT Bombay DevCom repositories as reference base | Decided |
| D-05 | Project released as open source | Decided; licence choice open |
| D-06 | Streamlit for prototyping only, never production | Decided |
| D-07 | Clubs & Events as the first module built | Decided |
| D-08 | Impact reporting scope: semester reports, not accreditation | Decided |
| D-09 | Notification channels: in-app and email only | Decided |
| D-10 | Approval chain: Dean only; two gates for fests and large budgets | Decided |
| D-11 | Attendance: organiser scans the student | Decided |
| D-12 | Two code types: persistent profile QR and one-time event pass | Decided |
| D-13 | No self-marking of attendance | Decided |
| D-14 | Budget templates with line-level sanctioning | Decided |
| D-15 | Receipts attached per budget line | Decided |
| D-16 | Fest as a parent record with external participants held separately | Decided |
| D-17 | Role assignment restricted to President and Vice-President | Decided |
| D-18 | Social posts: link capture only, no platform integration | Decided |
| D-19 | Dean owns venue oversight and reassignment | Decided |
| D-20 | No back-loading of historical event data | Decided |

# 2. Technology Decisions
## D-01 — Backend framework: Django + Django REST Framework
| Decision | Build the backend on Django 5.x with Django REST Framework, on Python. |
| --- | --- |
| Why | The volume of mature, plug-and-play components mapping directly onto requirements. Django admin delivers most of the back-office console on day one; django.contrib.auth provides the RBAC foundation; django-import-export, django-otp, django-allauth, django-auditlog and django-tenants each replace weeks of custom work. It also aligns with instiapp-api, making the reference base genuinely reusable. |
| Rejected | FastAPI — faster, async-native, auto OpenAPI. Its main advantage over Django is matched by drf-spectacular, and it offers no admin console, so every back-office screen would be custom React. |
| Trade-off accepted | Django's async support is weaker. For CRUD, forms, approvals and reporting rather than real-time streaming, this is not expected to constrain the system at 25,000 students. Heavy work runs on Celery regardless. |
| Revisit if | The system takes on real-time or high-concurrency streaming workloads. |
## D-02 — Frontend: React + TypeScript
| Decision | React 18 with TypeScript and Vite for all student- and staff-facing interfaces. |
| --- | --- |
| Why | A role-rich portal with a future mobile app needs component reuse, a large ecosystem, PWA support, and a path to React Native. |
| Rejected | Django templates and Python UI frameworks such as Streamlit — suited to internal dashboards, not a student-facing product at scale. |
| Note | Django admin still serves registrar and back-office roles. It is not a student-facing interface. |
## D-03 — Database: PostgreSQL
| Decision | PostgreSQL as the single system of record, with Redis for caching and queues and an S3-compatible object store for files. |
| --- | --- |
| Why | Reliable relational store with the constraint features this system leans on — exclusion constraints for venue booking, partial unique indexes for registration integrity, JSONB for custom event forms. |
| Note | The database holds file references only, never binary data. |
## D-04 — Reference base: IIT Bombay DevCom
| Decision | Adopt the DevCom-IITB repositories as the architectural reference for module boundaries, data modelling and contributor practice. |
| --- | --- |
| Why | A proven, live university codebase solving the same problems, with the sustainability practices that keep student-built software alive through annual maintainer turnover. |
| Licensing verified | instiapp-api is AGPL-3.0; ResoBin, instiapp-flutter and UniPortal-Backend are MIT; instiapp-angular is MPL-2.0; UniPortal-Frontend and mess-i-dashboard carry no licence file and must be treated as all rights reserved. |
| Constraint | Reusing instiapp-api code directly obliges our backend to be AGPL-3.0. Architecture and ideas may be studied freely regardless. |
## D-05 — Open source release
| Decision | The project will be released as open source. |
| --- | --- |
| Why | Removes the AGPL constraint from D-04 as a blocker, allows other institutions to reuse the work, and matches the DevCom model the project is built on. |
| Still open | Licence choice. MIT throughout is simplest and most permissive. AGPL-3.0 backend with MIT frontend mirrors DevCom's own split and guarantees hosted forks stay open. AGPL becomes mandatory rather than optional if instiapp-api code is reused directly. |
| Consideration | AGPL may deter corporate or vendor partners; MIT is more permissive if hosting the portal for other colleges is a future goal. |
## D-06 — Streamlit for prototyping only
| Decision | Streamlit may be used to prototype and validate workflows. It will never serve as the production frontend. |
| --- | --- |
| Why | It stands up working screens in days for stakeholder validation, and can call the same Django APIs the React app will use, so backend work is not wasted. |
| Limits | No real multi-user auth or RBAC, single-session model, poor concurrency, limited UI control, no mobile path. |
| Risk named | The common failure is that a prototype quietly becomes production. Treat it as throwaway. |
# 3. Product & Scope Decisions
## D-07 — Clubs & Events built first
| Decision | The Clubs & Events module is the first module of the student portal to be built. |
| --- | --- |
| Why | Lowest institutional risk — it touches no marks, fees or statutory records. High visibility with students, building goodwill for harder modules. It exercises the shared core (login, roles, notifications, approvals) so the foundation is validated early. And it answers a question management is already asking. |
| Rejected | Starting with attendance or examinations, where an early misstep carries real consequences. |
## D-08 — Impact scope: semester reporting, not accreditation
| Decision | Impact measurement means semester-wise reports to management showing events run, participation and photographs. Accreditation extracts, co-curricular transcripts, club scorecards and student-level assessment are out of scope. |
| --- | --- |
| Why | Management's stated need is a periodic, visual report. Accreditation formats and assessment-style measurement add scope without serving that need. |
| Removed from earlier drafts | NAAC/NIRF extracts, co-curricular transcript, achievement tracking for accreditation, club health scorecard, cost-per-participant, non-participant and wellbeing analysis. |
| Headline metric | Unique students reached, not total footfall. Twenty events attended by the same eighty students and twenty events reaching six hundred report identical totals; only the distinct count separates them. |
## D-09 — Communication channels: in-app and email only
| Decision | All notifications go through in-app notifications and email. No SMS gateway, no third-party messaging integrations. |
| --- | --- |
| Why | Removes per-message cost, telecom compliance overhead (DLT registration of sender IDs, templates and consent under the TRAI regime), and vendor dependency. |
| Channel by purpose | In-app for discovery, reminders and status changes. Email for approvals, confirmations and anything needing a durable record. |
| Open | Whether push notifications to a closed mobile app (FCM/APNs) count as in-app for this purpose. To confirm before Phase 2. |
## D-18 — Social media: link capture, not integration
| Decision | Instagram and LinkedIn post URLs are recorded against completed events. The portal does not connect to those platforms' APIs, post on a club's behalf, or read engagement figures. |
| --- | --- |
| Why | Gives completed events evidence of outreach and shows which clubs maintain an active presence, without taking on platform integration or the no-third-party-integration conflict from D-09. |
| Limits acknowledged | Links decay as posts are deleted; the portal cannot verify a URL relates to the event; a link proves a post exists, not that anyone saw it. Reach must never be reported. |
| Caution | Making a link mandatory reliably produces links, not good social media. Suggested for larger events only. |
## D-20 — No back-loading of historical data
| Decision | Past events are not reconstructed into the system. Reporting begins from live data. |
| --- | --- |
| Why | Reconstructed attendance figures cannot be defended, and one indefensible number taints an entire report. |
| Consequence to manage | The first semester understates reality, since some activity will still run outside the system. This must be stated in the first report rather than left for management to discover. |
# 4. Process & Governance Decisions
## D-10 — Approval chain
| Decision | Standard club events and below-threshold budgets: Dean of Student Affairs only, a single gate. Fests and above-threshold budgets: Dean of Student Affairs, then Vice-Chancellor / Management. |
| --- | --- |
| Source | Confirmed against actual institutional practice, which differs from the initial PRD draft. |
| Correction required | PRD section 5.13 still describes a faculty advisor review before the Dean. That step does not exist and must be removed, or the build team will implement an approval stage nobody uses. |
| Management's role | Vice-Chancellor does not appear in the standard event flow. Management receives the semester report and approves above the threshold and for fests. |
| Risk named | Single-gate approval means every event passes through one person. Approval-age tracking helps; cover during absence is unresolved. |
| Still open | The escalation threshold amount. Whether a third gate exists for fests between Dean and Vice-Chancellor. Whether delegation is permitted. |
## D-11 — Attendance capture: organiser scans the student
| Decision | A club-operated device with a camera reads codes presented by students, in the manner of a metro ticket gate. Any device with a camera runs it in a browser. |
| --- | --- |
| Rejected | Students scanning a club-displayed QR. Faster at the door, but it opens a proxy-attendance weakness — a photographed poster code can be scanned by anyone, anywhere. |
| Why it matters | Every figure in the semester report derives from attendance. Capture method is therefore a reporting decision, not only an operational one. |
## D-12 — Two code types
| Decision | A persistent profile QR available in every student's profile after login, plus a one-time event pass issued on registration. Either works at the gate. |
| --- | --- |
| Why | The profile QR removes typing at the desk entirely, so walk-ins move as fast as pre-registered attendees. The event pass is one-time and cannot be reused, giving stronger integrity where a student registered in advance. |
| Security | The profile code carries a signed opaque token; the PRN is never encoded readably, so photographing a code exposes no identifier. Tokens can be rotated if compromised. |
| Trade-off accepted | A persistent code is reusable, so a screenshot could in principle be passed to a friend. Mitigated by organiser-operated scanning with the person present, duplicate rejection per student per event, and token rotation. This is an inherent weakness of any reusable code. |
## D-13 — No self-marking of attendance
| Decision | Attendance is recorded only by a scan or by an organiser at the station. There is no route for a student to mark themselves present from elsewhere. |
| --- | --- |
| Rejected | Students entering an event ID in their own app. Considered and removed. |
| Why | An event-ID entry proves only that someone knew the event ID, not that they attended. Since every reported figure rests on attendance, the integrity of the input matters more than the convenience. |
## D-14 — Budget templates with line-level sanctioning
| Decision | Standard budget templates per event type, with heads pre-populated, per-head quantities calculated automatically and a contingency line added by default. Approvers sanction line by line, not only in total. |
| --- | --- |
| Why | Clubs currently start from a blank page, forget line items and under-budget. A single sanctioned total tells nobody why an event overran; head-level variance shows whether it was hospitality, prizes or publicity — which makes the next estimate accurate. |
| Guard | Every template field is editable and custom heads may be added. Templates are a starting point, not a constraint. |
## D-15 — Receipts attached per budget line
| Decision | Receipts and invoices attach to individual budget lines, not as a bundle at event level. Phone photographs and PDFs accepted, captured at the point of payment. Lines above a configured amount cannot be settled without a document. |
| --- | --- |
| Why | The common failure is not missing receipts but receipts arriving weeks late, by which time nobody recalls which bill belongs to which head. |
| Replacements | An illegible document is superseded, never overwritten, so the audit trail survives. |
## D-16 — Fest as a parent record
| Decision | A fest is a parent record holding sub-events, with its own page, team, budget envelope and shared costs. External participants register without an account and are stored separately from the student directory. |
| --- | --- |
| Why | Modelling sub-events as unrelated standalone events loses the shared branding, combined budget view and single public page that make a fest a fest. Retrofitting a hierarchy after a fest has run is far harder than building it in. |
| Reporting rule | Own students and visiting participants are counted separately, never summed. Combined, the figure describes neither internal reach nor external draw. |
| Privacy | External participant data is purged on a defined schedule and never enters student records. |
## D-17 — Role assignment restricted to President and Vice-President
| Decision | Only the President and Vice-President may assign club roles. Treasurer and Secretary cannot. No club role approves its own budget. |
| --- | --- |
| Why | Prevents self-promotion and self-sanctioning. Budget approval sits with the Dean; the club view is for visibility and accountability. |
| Continuity | Roles carry effective and end dates, so access expires on its own rather than depending on someone remembering to revoke it. |
## D-19 — Dean owns venue oversight and reassignment
| Decision | The Dean of Student Affairs has a master calendar of every venue and every booking, with clash alerts, a pressure view of over-subscribed dates, utilisation across venues, and the ability to reassign a clashing event to a different venue or time. |
| --- | --- |
| Why | Venue clashes are the most common avoidable event failure and they surface late, usually when two clubs arrive at the same hall. Overlap is rejected at booking time; the Dean resolves the cases that still collide rather than sending both clubs away to negotiate. |
| Mechanics | Reassignment requires a reason, notifies the club and any registered students automatically, and releases the old booking in the same transaction so there is no window where both or neither hold the slot. Setup and clearing buffers are included in the overlap check. |
| Still open | The precedence rule when two events want the same venue — first submitted, largest expected attendance, fest priority, or Dean's discretion. The system can enforce any of these, but the rule must be stated or every clash becomes an individual argument. |
# 5. Superseded Decisions
Recorded so that reasoning is not repeated.
| Was | Now | Why it changed |
| --- | --- | --- |
| Backend on FastAPI | Django + DRF (D-01) | Plug-and-play ecosystem and the admin console outweighed FastAPI's async and documentation advantages |
| Faculty advisor reviews before the Dean | Dean only (D-10) | Confirmed against actual institutional practice; the advisor step does not exist |
| Students enter an event ID to mark attendance | Removed (D-13) | Proves knowledge of the event ID, not attendance |
| Students scan a club-displayed QR | Organiser scans the student (D-11) | Proxy-attendance weakness in a publicly displayed code |
| Accreditation extracts and co-curricular transcript | Semester reporting only (D-08) | Not the stated management need |
| SMS for critical alerts | In-app and email only (D-09) | Cost, DLT compliance overhead, vendor dependency |
| Auto-sharing events to social platforms | Link capture only (D-18) | Conflicts with the no-third-party-integration position |
# 6. Open Decisions
These block or shape work that has not yet started. Each needs an owner and a date.
| # | Open question | Blocks | Who decides |
| --- | --- | --- | --- |
| O-01 | Open source licence: MIT throughout, or AGPL backend with MIT frontend | Repository setup | Project sponsor |
| O-02 | Budget amount that escalates approval to the Vice-Chancellor | Approval configuration | Dean and Management |
| O-03 | Is there a third approval gate for fests between Dean and Vice-Chancellor | Fest flow build | Dean |
| O-04 | Who approves when the Dean is unavailable; is delegation permitted | Approval configuration | Dean |
| O-05 | Venue precedence rule when two events clash | Venue module (D-19) | Dean |
| O-06 | Receipt-mandatory threshold per budget line | Settlement rules | Dean and finance |
| O-07 | Retention period for external participant data after a fest | Privacy configuration | Dean and legal |
| O-08 | Is PRN the canonical identifier for the profile QR, and is it on ID cards | Attendance build | Registrar |
| O-09 | Do push notifications to a closed mobile app fall within D-09 | Phase 2 notifications | Project sponsor |
| O-10 | Cancelled event with committed spend: who signs off settlement | Settlement rules | Dean |
| O-11 | Real event types and standard budget heads for the template library | Template seeding | Student Life Office |
| O-12 | Devices for scan stations: club-owned or a shared pool | Phase 2 rollout | Student Life Office |
The two most urgent: O-03 and O-05. Both shape flows that are already specified, and both are quick answers from the Dean. Leaving them open means building a placeholder and reworking it.
# 7. Documents Governed by This Log
| Document | Covers |
| --- | --- |
| Student Management Portal PRD | The whole portal: all modules, architecture, phasing |
| Student Life — Clubs, Events & Impact PRD | The Clubs & Events module in full |
| Event Flows — Clubs & Events Application | Swimlanes per process and a chapter per view |
| Database & Data Flow | Schema, relationships, data flows, retention |
| Clubs & Events Application Proposal (deck) | The pitch to management |
When a decision here changes, check each document above for consequences. The faculty advisor correction in D-10 is a live example: it is settled here but still wrong in the PRD.