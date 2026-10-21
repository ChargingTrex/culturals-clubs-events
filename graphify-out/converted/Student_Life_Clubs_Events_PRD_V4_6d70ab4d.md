<!-- converted from Student_Life_Clubs_Events_PRD_V4.docx -->

PRODUCT REQUIREMENTS DOCUMENT · MODULE 1
Student Life
Clubs, Events & Impact Measurement
Giving the Dean of Student Life and management evidence of what clubs and events actually deliver
Version 1.0  ·  Draft  ·  Starting-point module
Extracted from the Student Management Portal PRD (§4.9)

# Table of Contents



# 1. Overview
| Field | Detail |
| --- | --- |
| Module | Student Life — Clubs, Events & Impact |
| Primary sponsor | Dean of Student Life |
| Secondary audience | Management / senior leadership (impact and budget justification) |
| Relationship to main PRD | Expands §4.9 of the Student Management Portal PRD into a full module spec |
| Scale | 1,500 students today; designed for 25,000+ |
| Stack | Django + DRF backend, React frontend (consistent with parent PRD §6) |
| Status | Draft — proposed as the first module to build |
## 1.1 Why this module first
This module is recommended as the starting point for the wider portal programme, for reasons that are practical rather than sentimental:
- Low institutional risk. It touches no marks, fees, or statutory records, so an early misstep has limited consequences — unlike attendance or examinations.
- High visibility, fast payback. Students see and use it immediately, which builds goodwill for the harder modules that follow.
- It proves the shared core. Login, roles, notifications, and approvals all get exercised here, so the foundation every later module depends on is validated early.
- It answers a question management is already asking. Clubs consume budget and student time; today nobody can quantify the return.
# 2. Problem Statement
Club and event activity currently runs on WhatsApp groups, Instagram posts, notice boards, and paper approval forms. The consequences fall on three groups:
| Who | What goes wrong today |
| --- | --- |
| Dean of Student Life | No consolidated view of what clubs are doing. Approvals arrive on paper with no history. Cannot answer 'which clubs are active?' or 'how many students are we actually reaching?' without manual surveys. |
| Management | Budget is allocated to clubs with no participation data to justify it. Semester reports are assembled by hand each time — chasing clubs for numbers and photos, then pasting them into slides. |
| Students | Miss events they would have attended. No single place to discover clubs, especially first-years. Participation is invisible on any record they can show a recruiter. |
| Club office bearers | Institutional memory is lost every year at handover. Each committee rebuilds processes, contact lists, and vendor knowledge from scratch. |
The core gap: the institution invests in student life but has no evidence of what that investment produces. This module's central purpose is to close that gap — event management is the means, impact measurement is the end.
# 3. Goals & Success Metrics
## 3.1 Goals
- Give the Dean a live operational picture of every club, event, and pending approval.
- Give management defensible impact data linking club activity and spend to student participation and outcomes.
- Make discovery effortless for students, particularly first-years choosing clubs.
- Digitise the approval and budget trail so requests are traceable and auditable.
- Preserve institutional memory across annual office-bearer turnover.
## 3.2 Success metrics
| Metric | Baseline today | Target |
| --- | --- | --- |
| Events created and managed in the portal | 0% (informal channels) | > 90% within two terms |
| Students with at least one recorded participation | Unknown — not measured | > 70% of enrolled students per year |
| First-year students joining ≥1 club | Unknown | > 60% within first term |
| Approval turnaround (proposal to decision) | Days, untracked | < 48 hours, measured |
| Clubs submitting end-of-event reports | Ad hoc | > 95% |
| Time to produce the semester report | Weeks, manual | Generated on demand |
| Events with photos uploaded | Ad hoc, scattered | > 90% |
| Completed events with a social post link | Not tracked | > 75% of larger events |
Note on baselines: several baselines are genuinely unknown, which is itself the strongest argument for this module. Establishing measurement in term one is a deliverable in its own right; targets should be revisited once real data exists rather than treated as firm commitments.
# 4. Users & Roles
| Role | Needs from this module | Key permissions |
| --- | --- | --- |
| Dean of Student Life | Oversight of all clubs and events; approvals; impact reporting | Approve/reject events and budgets; view all data; publish reports |
| Management / Leadership | Evidence of participation, reach, and spend effectiveness | Read-only executive dashboards and exports |
| Faculty Advisor | Oversight of assigned clubs; first-level approval | Approve for own clubs; view own club data |
| President / Vice-President | Run the club; manage the member roster and assign roles; own budget proposals | Create/manage own club and events; assign member roles; full budget visibility |
| Treasurer | Prepare budget requests, track sanctioned amounts, record actual spend | Budget view and spend entry for own club; no role-assignment rights |
| Club Office Bearer (other) | Run events, manage registrations, submit reports | Create/manage own club events; submit requests |
| Club Member | Participate, see internal club updates | View club internals; register for events |
| Student (all) | Discover clubs and events; register; give feedback | Browse, register, attend, provide feedback |
| Student Life Office Staff | Day-to-day coordination, venue booking, records | Manage venues, calendar, and club records |
# 5. Functional Requirements
## 5.1 Club Directory & Profiles
- Public directory of all clubs with category (technical, cultural, sports, social service, literary), description, logo, and activity level.
- Official club social handles (Instagram, LinkedIn) recorded on the club profile — see §5.14.
- Club profile page: office bearers, faculty advisor, upcoming and past events, member count, photo highlights.
- Club registration workflow for founding a new club, with Dean approval.
- Club status lifecycle: proposed, active, dormant, archived — dormancy flagged automatically after a configurable period of inactivity.
## 5.2 Membership Management
- Students join or request to join clubs; open and approval-based joining modes.
- Member roster with roles (member, core team, office bearer) and tenure dates.
- Membership history retained per student across years — the basis for participation records.
## 5.3 Office-Bearer Succession
Directly addresses the institutional-memory problem, and mirrors the maintainer-turnover lesson from the DevCom reference model.
- Structured annual handover: outgoing bearers transfer roles with effective dates.
- Club documents, vendor contacts, past event reports, and budgets persist across handovers.
- Automatic permission transfer on the handover date; historical record of who held which position when.
## 5.4 Event Lifecycle
The core workflow. Each stage is tracked, timestamped, and reportable.
| Stage | What happens | Who acts |
| --- | --- | --- |
| 1. Proposal | Club submits event: title, description, date, venue, expected attendance, budget request | Club office bearer |
| 2. Approval | Multi-level review with comments; approve, reject, or request changes | Faculty advisor → Dean |
| 3. Venue & resources | Venue booked, conflicts detected, equipment reserved | Student Life Office |
| 4. Publication | Event goes live on calendar and feed; targeted notifications sent | Automatic on approval |
| 5. Registration | Students register; capacity, waitlist, and deadlines enforced | Students |
| 6. Attendance | Check-in via QR code or roster marking on mobile | Organisers |
| 7. Feedback | Post-event survey automatically triggered to attendees | Attendees |
| 8. Report | Outcome report with actuals: attendance, spend, photos, learnings | Club office bearer |
## 5.5 Event Discovery
- Campus-wide event calendar with filters by category, club, date, and department.
- Personalised feed based on club memberships, interests, and year of study — the InstiApp pattern.
- Notifications and reminders delivered through two channels only: in-app notifications and email. No SMS, and no dependence on external messaging platforms.
- Channel by purpose: in-app for discovery, reminders, and status changes; email for approvals, confirmations, and anything needing a durable record.
- Per-user notification preferences, with approval and registration-confirmation emails always sent.
- Event pages with details, registration status, venue map, and organiser contact.
## 5.6 Registration & Attendance
- One-tap registration for logged-in students; capacity limits and waitlist promotion.
- QR-code check-in at venue for accurate attendance without manual roll-call — specified in full in section 5.16.
- Distinguish registered, attended, and no-show — no-show rate is itself a useful signal.
- Offline-tolerant check-in that syncs when connectivity returns, since venues often have poor coverage.
## 5.7 Budget Templates & Requests
Clubs today start a budget from a blank page, which produces inconsistent requests, missed line items, and actuals that overshoot the sanctioned amount. Templates fix this at source.
### 5.7.1 Budget template library
Pre-built, editable templates per event type. Selecting the event type loads the appropriate template with standard heads already populated.
| Template | Typical heads included |
| --- | --- |
| Workshop / Training | Trainer honorarium, trainer travel, materials & kits, refreshments, printing, venue setup, certificates |
| Guest Lecture / Seminar | Speaker honorarium, travel & accommodation, refreshments, printing, banner & backdrop, memento |
| Cultural Night / Performance | Sound & lighting, stage & decoration, costumes, artist fees, refreshments, prizes, publicity |
| Inter-college Fest | Venue, sound & lighting, hospitality for outstation teams, prize money, trophies, publicity, printing, judges' honorarium, contingency |
| Sports Tournament | Ground & equipment hire, referees, first aid, refreshments, trophies & medals, kit, printing |
| Social Service Drive | Transport, materials & supplies, refreshments, printing, safety equipment |
| Competition / Hackathon | Prize money, platform or software costs, refreshments, mentor honorarium, certificates, printing |
| Blank | Empty template for anything not covered above |
### 5.7.2 How templates behave
- Each head carries a suggested amount and unit basis (per head, per day, lump sum), all editable.
- Quantity-driven heads calculate automatically — refreshments at a per-head rate multiply by expected attendance.
- A contingency line is added by default at a configurable percentage, since under-budgeting is the common failure.
- The template computes total requested and cost per expected participant as the club fills it in.
- Clubs may add custom heads; frequently added custom heads are surfaced to the Student Life Office so templates can be improved over time.
- Prior-year reference: when a similar event has run before, the template shows what it actually cost last time.
- Templates are maintained centrally by the Student Life Office — clubs use them but cannot alter the master versions.
### 5.7.3 Request, sanction and reconciliation
- Budget request is attached to the event proposal and moves through the same approval chain.
- Approvers can sanction line by line, not just in total — reducing one head while approving the rest, with a comment.
- Configurable approval thresholds: requests under a set amount route to the faculty advisor only; larger requests escalate to the Dean.
- Post-event actual spend is entered against the same heads, with bill and receipt upload.
- Variance is shown per head — requested against sanctioned against spent — so overruns are visible where they occurred.
- Annual club budget envelope with running utilisation, so a club can see what remains before proposing the next event.
Why line-level matters: a single total tells nobody why an event overran. Head-level variance shows whether the problem was hospitality, prize money, or publicity — which is what makes the next template better and the next estimate more accurate.
## 5.8 Feedback & Surveys
- Automatic post-event feedback form to attendees, configurable per event type.
- Standard questions (rating, would-recommend, open comments) plus club-defined custom questions.
- Aggregated scores visible to organisers, advisor, and Dean; individual responses kept anonymous to organisers.
## 5.9 Venue & Calendar Management
Venue clashes are the most common avoidable failure in campus events, and they surface late — usually when two clubs arrive at the same hall. The system prevents them at booking time and gives the Dean the overview needed to resolve the ones that slip through.
### 5.9.1 Venue inventory and booking
- Venue register with capacity, facilities, and the departments or offices that control each space.
- Booking is requested as part of the event proposal and held provisionally until the event is approved, then confirmed.
- Overlapping bookings for the same venue are rejected at the point of request, not discovered later.
- Buffer time before and after an event for setup and clearing, configurable per venue, so back-to-back bookings do not collide in practice.
- Examination and academic blackout periods block booking entirely.
### 5.9.2 Dean's venue overview
A single view of every venue and everything booked in it, so the Dean can see clashes forming rather than hearing about them afterwards.
- Master calendar. All venues on one screen, by day, week or month, with each booking showing event, club, and status (provisional or confirmed).
- Per-venue timeline. One venue at a time, to see how heavily a particular hall or ground is used.
- Clash alerts. Any overlapping or near-overlapping request is flagged with both events shown side by side, including capacity against expected attendance.
- Pressure view. Dates where demand exceeds available venues, visible in advance so the Dean can stagger events rather than reject them late.
- Utilisation. Which venues are heavily booked and which are barely used — useful when redirecting an event that does not need the main auditorium.
- Filter by club, category, date range or venue, and export the schedule.
### 5.9.3 Reassigning a clashing event
Where two events genuinely collide, the Dean resolves it directly rather than sending both clubs away to negotiate.
- From the clash alert, the Dean can move an event to a different venue, showing only venues that are free at that time and large enough for the expected attendance.
- Alternatively the Dean can propose a different time slot in the same venue.
- A reason is required for any reassignment, and it is recorded against the event.
- The affected club is notified by in-app notification and email, with the old and new venue both shown.
- Registered students are notified automatically if the event was already published.
- The original booking is released for the other event in the same action, so the resolution is atomic — there is no window where both or neither hold the slot.
- Reassignment history is retained on the event, so a pattern of one club repeatedly being moved is visible.
Precedence is a policy decision, not a technical one: when two events want the same venue, something has to decide which yields — first submitted, larger expected attendance, fest over standalone event, or Dean's discretion each time. The system can enforce any of these, but the rule has to be stated. Left undefined, it becomes a series of individual arguments.
## 5.10 Event Photos & Media
Photos are the raw material of the semester report, so capture is treated as part of the event workflow rather than an afterthought.
- Organisers upload photos directly to the event page, from mobile, during or right after the event.
- Each event supports a photo gallery; organisers mark two or three as highlight images for reporting.
- Automatic prompt at event close: the event report cannot be submitted without at least one photo.
- Photos are tagged automatically with event, club, date, and semester — so report generation needs no manual sorting.
- Captions and credits supported; original resolution stored, compressed versions served.
Photo consent: students appear in event photographs. A simple, visible notice at registration that event photos may be used in college reports and communications is sufficient and worth having in place from day one. Provide a straightforward way for a student to request removal of a specific image.
## 5.11 Event Templates & Workflow Automation
Most events an institution runs are variations on a handful of formats. Templates and automation remove the repetitive setup that consumes an organiser's time.
- Event templates. Selecting an event type pre-fills the proposal, the budget template (§5.7), the task checklist, and the registration form — so a workshop proposal starts nine-tenths complete.
- Clone a past event. Annual events are recreated from last year's record, carrying forward the task list, budget, vendors, and learnings, with dates shifted.
- Auto-generated task checklist. Each template carries a standard task list with owners and due dates calculated backwards from the event date — permissions, venue, publicity, materials, volunteer briefing.
- Automated reminders. Task deadlines, approval SLAs, registration close, and event day all trigger reminders without anyone chasing.
- Status automation. Events move between draft, submitted, approved, published, live, completed, and reported based on workflow events rather than manual updates.
- Escalation. Approvals pending beyond the configured SLA are escalated and surfaced on the Dean's dashboard.
## 5.12 Event Operations Toolkit
The built-in features organisers need while actually running an event, so clubs stop improvising across spreadsheets and chat groups.
### 5.12.1 Before the event
- Custom registration forms. Form builder for event-specific fields — team name, meal preference, t-shirt size, skill level, consent declarations — without developer involvement.
- Team and group registration. Competitions accept team entries with a captain and members, enforcing minimum and maximum team size.
- Volunteer and crew roster. Assign volunteers to roles and shifts — registration desk, hospitality, stage, logistics — with their own view of duties.
- Guest and speaker management. Speaker details, travel and accommodation needs, session timing, and required documents held against the event.
- Sponsorship tracker. External sponsors with committed amount, deliverables promised (logo placement, stall, mentions), and status — so obligations are not forgotten.
- Publicity within the portal. Approved events publish automatically to the campus calendar and student feed, with targeted in-app notifications and an email announcement to the relevant audience. A poster image can be downloaded for anyone who wants it, but onward distribution is outside the portal.
### 5.12.2 On the day
- QR check-in with live count. Organisers see attendance building in real time against capacity.
- Spot registration. Walk-in attendees registered at the desk so they are counted, not lost.
- Multiple check-in operators. Several volunteers scanning simultaneously without conflicts.
- Offline-tolerant operation. Check-in continues through poor connectivity and syncs on reconnection — venues frequently have weak coverage.
- Session-level check-in. Multi-session events such as fests track attendance per session, not merely at the entrance.
### 5.12.3 After the event
- Auto-drafted event report. Attendance figures, registration counts, and sanctioned budget are pre-filled; the organiser adds outcomes, photos, and learnings rather than compiling numbers.
- Participation certificates. Bulk-generated certificates for attendees, and separately for volunteers and winners, issued from a configurable template.
- Feedback dispatch. Post-event survey sent automatically to those who actually attended (§5.8).
- Learnings capture. A short structured note — what worked, what to change — carried forward when the event is cloned next year. This is how institutional memory survives office-bearer turnover.
- Vendor record. Vendors used, amounts paid, and a simple quality rating retained against the club for future reference.
## 5.13 Approval Configuration
Approval behaviour is configuration, not code, so the Student Life Office can adjust it without a development cycle.
- Define approval chains per request type — event, budget, venue, new club.
- Amount-based routing thresholds for budget requests.
- Delegation when an approver is unavailable, with the delegation recorded.
- Parallel or sequential approval steps as required.
- Full audit trail: who approved what, when, with what comment.
## 5.14 Social Media Post Tracking
Clubs promote their events on Instagram and LinkedIn. The portal records links to those posts so that completed events carry evidence of outreach, and so the Student Life Office can see which clubs maintain an active public presence.
Scope: this is link capture, not integration. The portal stores URLs that organisers paste in — it does not connect to Instagram or LinkedIn accounts, post on a club's behalf, or read engagement figures through their APIs. This keeps the no-third-party-integration position in Section 8 intact.
### 5.14.1 Capturing post links
- Each event record holds fields for an Instagram post link and a LinkedIn post link; multiple links per platform are allowed for events promoted more than once.
- Links are added at the event-report stage (§5.12.3), alongside photos and outcomes, and can also be added earlier for pre-event promotion.
- Each link stores the URL, platform, the date it was added, and who added it.
- Configurable requirement: the Student Life Office can make at least one social post link mandatory before an event is marked complete, in the same way a photo is required.
- An optional screenshot may be attached alongside the link, since posts are sometimes taken down or archived later.
- Club profiles hold the club's official Instagram and LinkedIn handles, so links can be sense-checked against the club that submitted them.
### 5.14.2 Tracking club social activity
- Per club: proportion of completed events that have at least one social post link.
- Per club: date of the most recent recorded post, so dormant social presence is visible.
- Platform split — how many events were promoted on Instagram, on LinkedIn, or on both.
- Dean dashboard surfaces completed events still missing post links, alongside those missing photos or reports.
- Semester report includes a short outreach line: how many events were publicly promoted and by which clubs.
### 5.14.3 Limitations to be honest about
- Links decay. Posts are deleted, accounts go private, and URLs break. The stored capture date and optional screenshot preserve the record, but a link checked a year later may no longer resolve.
- The portal cannot verify content. It stores whatever URL is pasted in and cannot confirm the post actually concerns that event. Occasional spot checks by the Student Life Office are the practical control, not automated validation.
- Presence is not engagement. A recorded link shows a post exists; it says nothing about who saw it. Without platform API access there is no reliable reach or engagement figure, and none should be reported as if there were.
A caution on making this mandatory: requiring a post link before an event can be closed will reliably produce post links. It will not reliably produce good social media. If the field becomes a box to tick, clubs will paste a link to any post. Consider making it required only for larger events, and treating the club-level activity view as a prompt for a conversation rather than a compliance score.
## 5.15 Fests — Multi-Event Umbrellas
A fest is not one event. It is a container holding many sub-events under shared branding, a shared budget, a shared team, and a single public page. Modelling fest sub-events as ordinary standalone events loses all of that — the sub-events appear unrelated, there is no combined budget view, and there is no single page a visitor can be sent to.
Why this matters here: an inter-college technical fest may run eight or ten competitions across a few days. Without a parent record, the calendar shows ten disconnected entries, the Dean cannot see the fest's total cost or total participation, and outside participants have nowhere to land.
### 5.15.1 Fest as a parent record
- Fest holds name, theme, edition (e.g. 1.0), date range, description, and status through the same proposal and approval workflow as an event.
- Sub-events belong to the fest and inherit its branding, date window, and venue context, while keeping their own schedule, capacity, registration form, and organiser.
- Participation, budget, and photos roll up from sub-events to the fest automatically — no manual totalling.
- A fest appears as one line in the semester report with its aggregate figures, and can also be expanded to show sub-event detail.
- Ordinary standalone events continue to work exactly as before; the fest layer is optional and used only when an event has children.
### 5.15.2 The fest page
A single public landing page, generated from the fest record, that participants and sponsors can be pointed to.
| Element | Contents |
| --- | --- |
| Hero banner | Fest name, edition, theme artwork, dates, and a primary call to action to register |
| About | Theme, what the fest is, who can participate, host institution |
| Sub-events | Card per competition or session with format, eligibility, team size, prizes, and its own registration link |
| Schedule | Day-wise timetable across all sub-events, with parallel tracks visible |
| Registration | Register for the fest, then select individual sub-events; team entries where applicable |
| Prizes & rules | Prize structure and rulebook per sub-event, downloadable |
| Sponsors | Sponsor logos by tier, fulfilling the deliverables tracked in section 5.12.1 |
| Organising team | Fest convenor, sub-event heads, and contacts for queries |
| Venue & travel | Campus location, directions, and accommodation notes for outstation teams |
| Gallery | Photos from the current and previous editions |
- The hero banner and theme artwork are uploaded per fest and carry through to sub-event pages, so branding stays consistent without re-uploading.
- The page is public and shareable by link — this is what gets circulated to other colleges, and what club social posts (section 5.14) point to.
- Previous editions are archived and remain viewable, giving the next organising team a reference and the fest a visible history.
### 5.15.3 Fest organising team
- Fest convenor with overall ownership; sub-event heads owning individual competitions.
- Roles are scoped: a sub-event head manages only their own event's registrations, volunteers, and report.
- Fest-level roles are time-bound to the fest edition and expire afterwards, rather than persisting as standing permissions.
- The team is recorded against the fest edition, so next year's organisers can see who ran what.
### 5.15.4 Fest budget
- Fest budget combines shared costs (stage, sound and lighting, hospitality, publicity, security) with each sub-event's own budget.
- Shared costs sit at fest level rather than being arbitrarily assigned to one sub-event.
- The Inter-college Fest budget template (section 5.7.1) applies at fest level; sub-events use the template matching their own format.
- Sanctioning may be done at fest level as a single envelope, with sub-event heads drawing against it.
- Variance reporting shows both the fest total and where within it an overrun occurred.
### 5.15.5 External participants
An inter-college fest brings in participants from other institutions who have no account in the portal and never will. This is a genuine architectural consideration, not a detail.
- External participants register without institutional SSO, providing name, college, email, and phone.
- They receive a registration reference and QR code by email for check-in, with no portal account created.
- External registrations are stored separately from the student directory and are not written into student records.
- Team entries may mix internal and external members, with the captain responsible for the entry.
- Retention: external participant data is kept for the fest and a defined period afterwards, then purged.
Report the two separately: fest attendance should distinguish own students from visiting participants. Both are worth reporting — reach among your own students is the student-life metric, while external participation is the measure of the fest's draw — but combining them into one number tells management neither.
## 5.16 Attendance Capture — Scan Stations
Attendance is the number every figure in Section 6 depends on, so capture is specified in detail rather than left as an implementation choice.
The model: organisers scan the student, not the other way round. A device with a camera sits at the entrance and students present their pass to it — the same interaction as a metro ticket gate. The scanner is operated by the club; the student only has to hold up a code.
### 5.16.1 How the station works
- A club device (phone, tablet, or laptop with webcam) runs the scan station in a browser — no dedicated hardware to buy.
- The camera reads continuously; the student holds up their pass and walks through. No tapping, no typing, no handing over a phone.
- Immediate feedback on screen and by sound: accepted, already checked in, wrong event, or not registered — distinguishable at a glance in a moving queue.
- Sub-second recognition so a queue keeps moving; several stations can run in parallel at different entrances without conflicting.
- Every scan records the student, event, timestamp, and which station and operator processed it.
- Works offline and syncs when connectivity returns — venues frequently have weak coverage.
### 5.16.2 The student profile QR
Every student has a personal QR code generated from their unique student identifier (PRN), available in the profile section of the app once they log in. It is always there, needs no registration, and works at any event.
- Found under the student's profile — no need to search email or find a booking; a student who opens the app has it in two taps.
- The code carries a signed token that resolves to the student server-side. The PRN is not written into the code in readable form, so a photographed code does not expose anyone's identifier.
- Scanning it at a station identifies the student instantly: if they are registered for the event they are checked in, and if they are not they are spot-registered and checked in together (section 5.16.4).
- This removes typing at the desk entirely — the walk-in queue moves at the same speed as the registered queue.
- Displayed at high contrast with screen brightness raised automatically, so it scans reliably in a dim venue or bright sunlight.
- The token can be rotated by the student or by the Student Life Office if a code is thought to be compromised, invalidating the old one.
### 5.16.3 Per-event passes for pre-registered students
- On registering for an event, a student also receives an event-specific pass in the app and by email.
- That pass is valid for that event only and cannot be reused once scanned.
- Either code works at the gate: the event pass is the faster path for someone who registered in advance, the profile QR is the universal fallback that always works.
- Passes for multi-session events such as fests work across sessions, with each session scanned separately.
A trade-off worth naming: the profile QR is persistent, so a student could in principle send a screenshot to a friend to be marked present. Three things limit this: the code is scanned by an organiser with the person standing there, a second scan of the same student for one event is rejected as a duplicate, and tokens can be rotated. It is a real weakness of any reusable code, and the practical control is that a human is looking at whoever presents it.
### 5.16.4 When the scan does not work
Every practical fallback below is operator-driven, so nobody is turned away and nothing is self-reported without supervision.
| Situation | What the organiser does |
| --- | --- |
| No phone or dead battery | Search the roster by PRN or name on the station device and check the student in manually |
| Registered for a different event | Station shows the mismatch; organiser redirects or spot-registers for this event |
| Already checked in | Station shows the earlier check-in time, so duplicate entry is visible rather than silently double-counted |
| Walk-in, never registered | Scan their profile QR — registered and checked in in one action (section 5.16.5) |
| Camera or device fails entirely | Fall back to marking the roster on any other device; the last resort is a paper list entered afterwards, flagged as manually entered |
No self-marking: attendance is only ever recorded by a scan or by an organiser at the station. There is no route for a student to mark themselves present from elsewhere, because that would prove only that they knew about the event, not that they attended it — and every figure in Section 6 rests on attendance being real.
### 5.16.5 Spot registration
- Walk-ins are handled in a single scan: the organiser scans the student's profile QR, and registration plus check-in are recorded together with no typing.
- If the student cannot show the code at all, the organiser can still enter the PRN manually and confirm the name pulled from the directory.
- For fest visitors from other institutions, a short form captures name, college, email and phone — no portal account is created (section 5.15.5).
- Capacity limits still apply; the station warns when the event is at capacity rather than silently exceeding it.
- Spot registrations are flagged as such, so reports can distinguish planned attendance from walk-in interest — a useful signal about how well an event was publicised.
## 5.17 Club Console — Live Attendance View
What the organising club sees while an event is running and afterwards.
- Live attendee list showing name, PRN, programme and year, check-in time, and how they were admitted (pre-registered, spot registration, or manual entry).
- Running count against capacity, and registered-but-not-yet-arrived, so organisers know what to expect.
- Search and filter by name, PRN, year, or department.
- Export the attendee list for the event report; the figures also flow automatically into the semester report.
Access is scoped: an organiser sees attendee identities only for their own club's events, and only while that event is active plus a limited period afterwards. This is student personal data — visible to those running the event, not browsable across the institution.
## 5.18 Member Roster & Role Assignment
The club's own membership management, controlled by its senior office bearers.
- President and Vice-President can open the full member roster for their club; other members see a basic list without administrative controls.
- Roles assignable from the roster: member, core team, treasurer, secretary, Vice-President, President.
- Role assignment is restricted to President and Vice-President. A treasurer or secretary cannot promote themselves or others.
- Every role change is recorded with who made it, when, and the effective date — giving a clean history of who held which position.
- Permissions follow the role automatically: appointing a treasurer grants budget access without any separate administrative step.
- Roles carry an end date and feed the annual handover process (section 5.3), so outgoing bearers lose access when their term ends rather than retaining it indefinitely.
- The faculty advisor and the Student Life Office can view any club's roster; a President cannot view another club's.
## 5.19 Budget Visibility for Office Bearers
President, Vice-President and Treasurer share a budget view for their club, so the people accountable for money can see its status without asking the office.
### 5.19.1 Approval stage tracker
Each budget proposal shows exactly where it stands, so nobody has to chase for an update.
| Stage | What it means | Visible detail |
| --- | --- | --- |
| Draft | Being prepared by the club | Editable; not yet submitted |
| Submitted | Sent for review | Date submitted, who submitted |
| Advisor review | With the faculty advisor | Days pending, against the expected turnaround |
| Dean review | Escalated past the threshold amount | Days pending |
| Sanctioned | Approved, possibly at a reduced amount | Sanctioned amount per head, with approver comments |
| Rejected / returned | Declined or sent back for changes | Reason and comments, so it can be revised |
| Settled | Actual spend recorded, receipts attached and reconciled | Requested, sanctioned and spent side by side, with supporting documents against each line |
### 5.19.2 What the three roles can do
| Action | President | Vice-President | Treasurer |
| --- | --- | --- | --- |
| View budget proposals and stage | Yes | Yes | Yes |
| Create and submit a proposal | Yes | Yes | Yes |
| Record actual spend and upload receipts | Yes | Yes | Yes (primary owner) |
| View annual envelope and utilisation | Yes | Yes | Yes |
| Assign member roles | Yes | Yes | No |
| Approve the club's own budget | No | No | No |
Note: no club role approves its own budget. Approval sits with the faculty advisor and, above the configured threshold, the Dean (section 5.13). The club view is for visibility and accountability, not self-sanctioning.
### 5.19.4 Receipts, invoices and supporting documents
Settlement requires evidence, not just a number typed into a box.
- Receipts and invoices are attached against individual budget lines, not dumped as one bundle at the end — so a hospitality bill sits under the hospitality head.
- Accepted formats: photographs taken on a phone (JPG, PNG, HEIC) and PDF invoices. Multiple files per line where a head has several bills.
- Photographs can be captured directly in the app at the point of payment, which is when the paper receipt is actually in hand.
- Each upload records the file, amount claimed, vendor, date, and who uploaded it.
- Files are compressed for storage but the original is retained; a legible copy is what an audit needs.
- Configurable rule: lines above a set amount cannot be settled without at least one attached document.
- The Treasurer is the primary owner of uploads, with President and Vice-President able to view and add.
- The faculty advisor, Student Life Office and Dean can view attachments when reviewing a settlement.
- Documents remain attached to the event record afterwards, so a query months later does not depend on someone still having the paper.
Practical note: the common failure is not missing receipts but receipts that arrive weeks late, by which time nobody remembers which bill belongs to which head. Capturing the photograph at the moment of payment, against the line it belongs to, is what makes reconciliation possible at all.
### 5.19.5 Ongoing visibility
- Annual envelope with running utilisation, so the club knows what remains before proposing the next event.
- Line-level variance across all the club's events — requested, sanctioned, spent.
- Outstanding items: events completed but with actual spend not yet recorded, or lines still missing supporting documents.
- Notification to the club when a proposal changes stage, by in-app notification and email (section 5.5).

# 6. Semester Reporting — The Management View
This section is the reason the module exists. Everything in Section 5 exists to make the semester report generate itself. The report is visual: how many events ran, how many students took part, and what it looked like.
## 6.1 The semester report
The primary management deliverable. Produced on demand at the end of each semester — or at any point mid-semester — with no manual collation.
Structure of the generated report:
| Section | Contents |
| --- | --- |
| Cover | Semester, institution, date range, headline totals |
| At a glance | Total events, total participation, unique students reached, number of active clubs |
| Trend | Events and participation compared with the previous semester |
| By category | Events and participation split across technical, cultural, sports, social service, literary |
| Club-wise summary | Each club: events held, students reached, with one highlight photo |
| Fests | Each fest as a single entry with total sub-events, participation, and hero image |
| Event highlights | Photo-led spread of major events with attendance figures and a short description |
| Photo gallery | Curated images across the semester |
Formats: PDF for circulation and printing, PowerPoint for presenting to management, and CSV for anyone who wants the underlying numbers.
## 6.2 Core metrics
Deliberately few. These are the numbers management asked for, and each is directly derived from event registrations and check-ins.
| Metric | Definition | Why it is reported |
| --- | --- | --- |
| Number of events | Events completed in the semester | The headline activity figure |
| Total participation | Sum of attendances across all events | Overall volume of engagement |
| Unique students reached | Distinct students who attended at least one event | Breadth — distinguishes reaching 600 students from the same 80 attending repeatedly |
| Average attendance per event | Total participation ÷ events held | Indicates typical event size |
| Events per club | Events held by each club | Shows which clubs are active |
| Participation by category | Attendance split by club category | Where student interest actually sits |
| Fest participation | Attendance across a fest, split own students vs external | Shows internal reach and the external draw separately |
| Semester-on-semester change | Current vs previous semester on the above | Direction of travel |
On unique students reached: this is the figure worth leading with. Twenty events attended by the same eighty students is a very different result from twenty events reaching six hundred — and only the raw participation total would make them look identical.
## 6.3 Dean of Student Life dashboard
Operational and current-state, for running the semester rather than reporting on it:
- Pending approvals with age, so nothing sits unactioned.
- Events this week and this month; upcoming venue conflicts.
- Active vs dormant clubs, with dormancy flagged for follow-up.
- Events still missing photos, social post links, or a closing report.
- Clubs with no recorded social post in a configurable window.
- Running semester totals — events and participation to date.
## 6.4 Management dashboard
A live view of the same figures that appear in the semester report, so leadership can look at any time without waiting for semester end:
- Events and participation, current semester to date, against the previous semester.
- Club-wise activity table, sortable by events held and students reached.
- Category split of participation.
- Recent event highlights with photos.
- Export to PDF or PowerPoint at any point.
## 6.5 Making the numbers trustworthy
The reported figures are only as good as attendance capture, which makes Section 5.6 the most important technical detail in this module.
- QR check-in gives an actual attendance count rather than an organiser's estimate.
- Registered, attended, and no-show are recorded separately — report on attended, not registered.
- Check-in capture rate is itself monitored, so a club marking attendance poorly is visible and correctable.
Worth stating in the first report: figures reflect events run through the portal. In the first semester some activity will still happen outside it, so early numbers understate reality. Say so explicitly rather than letting management read a low first figure as a decline.
# 7. Data Model (Outline)
| Entity | Key fields | Relationships |
| --- | --- | --- |
| Club | name, category, description, status, founded date, annual budget | has Members, Events, OfficeBearers, FacultyAdvisor |
| Membership | student, club, role, joined date, ended date | links Student ↔ Club over time |
| OfficeBearerTerm | student, club, position, term start, term end | historical succession record |
| Event | title, club, category, datetime, venue, capacity, status, budget, parent fest (optional) | belongs to Club; optionally belongs to a Fest; has Registrations, Feedback, Report |
| Registration | student, event, registered at, attended (bool), check-in time | links Student ↔ Event; basis for all participation metrics |
| EventReport | event, actual attendance, outcomes, spend, attachments | one per completed Event |
| Feedback | event, student (anonymised to organisers), rating, comments | many per Event |
| StudentQRToken | student, signed token, issued at, rotated at | persistent profile QR resolving to the student |
| EventPass | registration, QR token, issued at, used at | one-time pass for pre-registered entry |
| ScanRecord | registration, event, station, operator, timestamp, result | audit trail of every scan attempt |
| Venue | name, capacity, facilities | booked by Events |
| Approval | target (event/budget/club), approver, decision, comment, timestamps | generic; reused across request types |
| EventPhoto | event, image, caption, is highlight, uploaded by | feeds the semester report gallery |
| BudgetTemplate | event type, standard heads, suggested amounts, unit basis | master templates maintained centrally |
| BudgetLine | event, head, requested, sanctioned, spent | line-level variance tracking |
| ReceiptDocument | budget line, file (image or PDF), amount, vendor, date, uploaded by | evidence attached per line at settlement |
| EventTemplate | event type, default tasks, form, budget template | pre-fills new event proposals |
| Task | event, title, owner, due date, status | auto-generated checklist per event |
| Volunteer | event, student, role, shift | crew roster |
| Sponsor | event, name, amount, deliverables, status | sponsorship obligations |
| EventSocialPost | event, platform, URL, added by, date added, optional screenshot | outreach record per event |
| Fest | name, edition, theme, date range, hero image, status, budget envelope | parent of many Events; owns the fest page |
| FestRole | fest, student, role (convenor, sub-event head), edition | time-bound fest team |
| ExternalParticipant | name, college, email, phone, fest, registration ref | non-student fest entrants, kept apart from student records |
Note: Registration is the pivotal table — nearly every metric in Section 6 derives from it. Getting attendance capture right (Section 5.6) is therefore the highest-value technical detail in this module.
# 8. Non-Functional Requirements
| Category | Requirement |
| --- | --- |
| Performance | Event feed and calendar load < 2 s; check-in response < 1 s at venue |
| Mobile | Mobile-first — students discover and register on phones; check-in happens on phones at venues |
| Offline tolerance | Check-in works with intermittent connectivity and syncs on reconnect |
| Peak load | Registration spikes when a popular event opens; handle bursts without failure |
| Scan throughput | Sub-second recognition per scan, multiple parallel stations, queue must not build at the entrance |
| Attendance integrity | Organiser-operated scanning only; one-time event passes, duplicate-scan rejection per student per event, and rotatable profile tokens |
| Privacy | Participation data is personal data under the DPDP Act; purpose-limited access, student notice, and role-restricted visibility of individual records |
| Accessibility | WCAG 2.1 AA; event information legible and navigable for all students |
| Auditability | Every approval, budget decision and venue reassignment timestamped and attributable |
| Communication channels | In-app notifications and email only. No SMS gateway and no third-party messaging integrations — removes per-message cost, telecom compliance (DLT registration), and vendor dependency |
| Integration | Uses the portal's shared SSO, roles, and notification services — no separate login |
# 9. Delivery Phasing
### Phase 1 — Foundation (Weeks 1–5)
- Club directory, profiles, membership, office-bearer roles.
- Event creation, approval workflow, publication, campus calendar.
- Outcome: the Dean sees all clubs and events in one place; paper approvals end.
### Phase 2 — Participation (Weeks 6–10)
- Registration, scan stations with spot registration and roster fallback (section 5.16), club console (section 5.17), post-event feedback.
- Member roster and role assignment (section 5.18).
- Personalised student feed and notifications.
- Outcome: participation data starts accumulating — the prerequisite for all impact reporting.
### Phase 3 — Impact & governance (Weeks 11–15)
- Dean and management dashboards; photo upload and curation.
- Budget templates, line-level sanctioning, actual-spend tracking, variance reports.
- Office-bearer budget view with approval stage tracker (section 5.19).
- Semester report generation in PDF and PowerPoint.
- Outcome: management can see impact and justify allocation.
### Phase 4 — Depth (Weeks 16+)
- Event templates and cloning, task checklists, volunteer roster, sponsorship tracker, certificates.
- Social post link capture and club social activity tracking (§5.14) — simple enough to pull into Phase 2 if wanted.
- Fest umbrella records, fest pages, and external participant registration (section 5.15) — pull earlier if a fest is planned before Phase 4.
- Venue booking and conflict management; succession tooling; richer photo curation.
Sequencing note: the impact dashboards in Phase 3 are only as good as the participation data from Phase 2, which needs at least a term of real events behind it. Expect the first dashboards to look sparse — that is expected, not a defect. Set that expectation with management before Phase 3 is demonstrated.
# 10. Risks & Mitigations
| Risk | Mitigation |
| --- | --- |
| Clubs keep using WhatsApp and Instagram | Make the portal the only route to approval, venue, and budget — participation follows the workflow, not exhortation. Clubs may still promote informally on social platforms; the portal does not integrate with them, and attendance counts only via check-in |
| Photos not uploaded, leaving the report thin | Block event-report submission without at least one photo; mobile upload during the event; Dean dashboard flags events missing photos |
| Attendance data is incomplete, undermining every metric | Make QR check-in faster than the manual alternative; allow bulk roster marking as fallback; monitor capture rate as a health metric in its own right |
| Event counts used to judge small clubs unfairly | Report events alongside students reached and category, so a niche club serving thirty students well is not read as underperforming next to a large cultural club |
| Office-bearer turnover breaks adoption | Structured handover (§5.3), short training at handover, persistent documentation, and event cloning with learnings carried forward (§5.12.3) |
| Templates too rigid for real events | Every template field is editable and custom heads/tasks can be added; templates are a starting point, not a constraint |
| Social post links become box-ticking | Require only for larger events; spot-check rather than automate; use club activity view to prompt discussion, not to score clubs |
| Fest sub-events modelled as flat events | Build the fest parent record from the outset; retrofitting a hierarchy after a fest has run is far harder than building it in |
| External participant data handled loosely | Separate store from student records, stated retention period, collect only what registration needs |
| Queue builds at the entrance and clubs abandon scanning | Sub-second scanning, several parallel stations, and a roster-search fallback so nobody is stuck; measure check-in capture rate per event |
| Passes or profile codes shared between students | Event passes are one-time; a repeat scan of the same student for one event is rejected at the station; profile tokens can be rotated; scanning is always done by an organiser with the person present |
| Attendee lists browsed beyond the organising club | Scope visibility to the club’s own event and a limited window afterwards; log access |
| Privacy concerns over participation tracking | Clear student notice, purpose limitation, role-restricted access, DPDP alignment from the start |
| Approval workflow becomes a bottleneck | SLA tracking and reminders; delegation during absence; measure turnaround as a metric |
| Venue clashes discovered on the day | Overlap rejected at booking; setup buffers; Dean’s master calendar with clash alerts and direct reassignment (section 5.9) |
# 11. Open Questions
- How many clubs exist today, and is there a current authoritative list to seed the directory?
- What is the existing approval chain — does it run through faculty advisors, the Dean, or both?
- Is there an annual club budget envelope, and who sanctions it?
- Who receives the semester report, in what format, and on what date each semester?
- Is there an existing report template or house style the generated report should follow?
- What are the typical event types and their standard budget heads, so the template library reflects real practice?
- What budget amount should trigger escalation from faculty advisor to Dean?
- Do clubs raise external sponsorship today, and does it require separate approval?
- Do all clubs have official Instagram and LinkedIn handles today, or would some need to create them?
- Is PRN the right unique identifier to base the student profile QR on, and is it printed on student ID cards as a fallback?
- Above what amount should a budget line require an attached receipt before it can be settled?
- Do clubs have devices for scan stations, or does the Student Life Office need a shared pool?
- Should a social post link be mandatory before closing an event, and if so above what event size?
- Are venues centrally managed today, or booked informally per department?
- When two events want the same venue, what decides which one yields?
- Is an inter-college fest planned within the first year? If so, the fest module needs to move ahead of Phase 4.
- For external fest participants, is a registration fee involved — and if so, does that pull payments into this module?
# 12. Reference
InstiApp (IIT Bombay DevCom) is the closest working analogue for the discovery and feed portions of this module — a campus feed combining events, club updates, and body calendars. Its Django API (instiapp-api, AGPL-3.0) is our reference base per the parent PRD §11. Note that InstiApp emphasises student-facing discovery; the impact and governance layer in Section 6 is specific to this institution's requirement and has no direct equivalent there.
Parent document: Student Management Portal PRD — this module expands §4.9 and consumes the shared core (§4.1 identity, §4.8 notifications, §4.10 approvals) defined there.