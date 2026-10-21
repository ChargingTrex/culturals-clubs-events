# Backend implementation audit against PRD V4

**Date:** 2026-10-21
**Scope:** `clubs-and-culturals-platform/app/backend` (Django/DRF) under
`/Users/fi-it/Documents/projects/culturas:club management platform /`. Evidence paths below are relative to that backend directory unless prefixed.
**PRD:** `graphify-out/converted/Student_Life_Clubs_Events_PRD_V4_6d70ab4d.md` (528 lines, read in full).
**Precedence honoured:** MASTER_SPEC §9 (faculty-advisor gate removed on purpose; Cultural Society gate added by product owner; VC aggregates only; Treasurer may propose; VP may record spend) and AGENT_PROMPT §2 (no SMS; Dean-only chain plus VC for fests/above-threshold; organiser scans student; no self-marking; link capture only). These are marked DEVIATES-BY-DECISION, never MISSING.
**Gap register:** MASTER_SPEC §10 (2026-09-30) was used as a checklist and re-verified against the code on disk; where it is wrong today it is called out.

**Counting method.** One row per bullet- or sentence-level requirement in PRD §4, §5.1–§5.20 and §6.1–§6.5, plus the §8 NFR table (11 rows). Commentary paragraphs (e.g. §5.14.3 "limitations", "why line-level matters") are not counted. §7 data model and §9 phasing are shown as informational tables and excluded from totals so they do not double-count §5. Statuses are strict: a model field with no endpoint or behaviour is PARTIAL; a behaviour that needs a job is MISSING if no Celery task exists; a restriction with no wrong-role test gets "none". All 8,925 lines of application and test code were read directly; the CodeGraph CLI was not needed on top of that.

---

## §4 Users & Roles

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Dean: approve/reject events and budgets; view all data; publish reports | BUILT | governance/services.py:325-375, 388-483; identity/authentication.py:61-88; reporting/views.py:34-40 | test_society_then_dean_publishes_the_event, test_the_dean_can_see_every_budget |
| Management: read-only executive dashboards and exports | PARTIAL (semester-report JSON only; no dashboard endpoint, no export) | reporting/views.py:24-40; reporting/services.py:32-110 | test_vc_still_gets_the_semester_report |
| Faculty Advisor: first-level approval; view own club data | DEVIATES-BY-DECISION (MASTER_SPEC §9.2; no such role, and no advisor field on Club either) | common/roles.py:17-23; clubs/models.py:7-29 | none |
| President/VP: create/manage own club and events; assign roles; full budget view | PARTIAL (events, roles, budget all built; club record itself is editable only by Dean/admin) | clubs/views.py:26-45, 100-106; common/roles.py:54-57, 81 | test_the_president_may_assign_a_role, test_president_and_treasurer_can_see_the_budget |
| Treasurer: budget view and spend entry; no role-assignment rights | BUILT | common/roles.py:57, 73, 81; budget/views.py:152-178 | test_the_treasurer_may_not, test_the_treasurer_can_raise_a_proposal_with_its_budget, test_the_vice_president_can_record_spend |
| Other office bearer (Secretary): run events, manage registrations, submit reports | BUILT | common/roles.py:81, 89, 93; events/views.py:91, 185-191 | none for Secretary specifically (VP path: test_the_vice_president_can_close_an_event) |
| Club member: view club internals; register for events | BUILT | clubs/views.py:57; participation/views.py:130-142 | test_a_plain_member_cannot (budget hidden); none for roster read |
| Student: browse, register, attend, provide feedback | PARTIAL (feedback absent) | events/views.py:58-66; participation/views.py:130-142 | test_an_ordinary_attendee_cannot_scan_themselves_in |
| Student Life Office staff: manage venues, calendar, club records | MISSING (no role; Venue API is read-only; Venue/Club/BudgetTemplate not registered in Django admin) | events/views.py:263-266; identity/admin.py:1-21 | none |

## §5.1 Club Directory & Profiles

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Public directory with category, description, logo, activity level | PARTIAL (needs auth; no logo; no activity level; categories match PRD's five) | clubs/models.py:8-29; clubs/serializers.py:6-21; config/settings.py:121 | none |
| Official Instagram and LinkedIn handles on profile | PARTIAL (instagram_handle only) | clubs/models.py:26 | none |
| Profile: office bearers, faculty advisor, upcoming/past events, member count, photo highlights | PARTIAL (member_count; bearers via gated /members; events via /events?club=; no advisor, no photos) | clubs/serializers.py:16-21; clubs/views.py:47-71; events/views.py:68-69 | none |
| Club registration workflow for founding a club, Dean approval | MISSING (Dean/admin create directly; no proposed state, no approval) | clubs/views.py:32-34 | none |
| Lifecycle proposed/active/dormant/archived; dormancy auto-flagged after configurable inactivity | PARTIAL (active/dormant/archived; no `proposed`; no job; overview computes an "inactive this semester" proxy) | clubs/models.py:15-18; reporting/services.py:134-147 | none |

## §5.2 Membership Management

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Students join or request to join; open and approval-based modes | MISSING (MembershipViewSet has no create; memberships only via seed/shell) | clubs/views.py:74-84 | none |
| Roster with roles (member, core team, office bearer) and tenure dates | BUILT | clubs/models.py:58-72 | test_a_role_change_is_recorded_with_who_did_it, test_one_active_membership_per_student_per_club |
| Membership history retained per student across years | PARTIAL (ended_at retained; every endpoint filters to active only, no history view) | clubs/views.py:61, 79 | none |

## §5.3 Office-Bearer Succession

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Structured annual handover with effective dates | MISSING | — | none |
| Documents, vendor contacts, past reports, budgets persist across handovers | PARTIAL (events/budgets/receipts are never deleted; no documents or vendor model) | budget/models.py:229-231; participation/models.py:25-28 | none |
| Automatic permission transfer on handover date; history of who held which position | PARTIAL (RoleChange history; no scheduled transfer, no term end dates) | clubs/models.py:100-117 | test_a_role_change_is_recorded_with_who_did_it |

## §5.4 Event Lifecycle

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| 1 Proposal: title, description, date, venue, expected attendance, budget request | BUILT | events/views.py:82-145; events/serializers.py:78-104 | test_the_treasurer_can_raise_a_proposal_with_its_budget |
| 2 Multi-level review with comments; approve / reject / request changes | BUILT | governance/services.py:388-483; governance/models.py:103-109 | test_returning_lets_the_club_revise_and_resubmit, test_rejecting_is_terminal |
| 2 Chain is Faculty advisor → Dean | DEVIATES-BY-DECISION (Cultural Society → Dean [→ VC], configurable) | config/settings.py:203; governance/services.py:29-65 | test_cultural_club_routes_through_the_society_then_the_dean, test_society_gate_switches_off_in_configuration |
| 3 Venue booked, conflicts detected, equipment reserved (Student Life Office) | PARTIAL (clash detection; no equipment; no SLO role) | events/services.py:72-87 | test_a_confirmed_booking_blocks_a_new_request |
| 4 Publication automatic on approval; targeted notifications | PARTIAL (auto-publish in same transaction; only club officers notified, no students) | governance/services.py:293-304, 140-157 | test_society_then_dean_publishes_the_event |
| 5 Registration with capacity, waitlist, deadlines | PARTIAL (capacity under row lock; no waitlist, no deadline) | participation/services.py:90-116 | test_a_walk_in_is_refused_once_the_event_is_full (door path only) |
| 6 Attendance via QR or roster marking on mobile | BUILT | participation/services.py:174-297, 300-336 | SevenBranchTests (service level) |
| 7 Feedback survey automatically triggered | MISSING | — | none |
| 8 Outcome report with actuals: attendance, spend, photos, learnings | PARTIAL (close records photo_count + links; attendance from door; spend via settlement; no outcomes/learnings text) | events/services.py:137-159; budget/services.py:277-328 | test_the_vice_president_can_close_an_event |

## §5.5 Event Discovery

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Calendar filters by category, club, date, department | PARTIAL (club, status, date range only) | events/views.py:67-77 | none |
| Personalised feed (memberships, interests, year) | MISSING | events/views.py:58-66 (plain list) | none |
| In-app and email only; no SMS | BUILT | integrations/notifications.py:7-27; integrations/base.py:59-63 | none |
| Channel by purpose (in-app for discovery/reminders; email for approvals/confirmations) | PARTIAL (every notification goes to both channels, no routing) | integrations/notifications.py:16-27 | none |
| Per-user preferences; approval and registration-confirmation emails always sent | MISSING (no preferences; registration sends nothing) | participation/services.py:90-116 (no notifier call) | none |
| Event page: details, registration status, venue map, organiser contact | PARTIAL (details + my_registration; no map, no contact) | events/serializers.py:14-75 | none |

## §5.6 Registration & Attendance

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| One-tap registration; capacity; waitlist promotion | PARTIAL (waitlist absent; returns PARTICIPATION_EVENT_FULL) | participation/views.py:130-142; services.py:103-105 | none at API level |
| QR-code check-in at venue | BUILT | participation/services.py:174-297 | SevenBranchTests |
| Distinguish registered, attended, no-show | BUILT | participation/models.py:52-53; reporting/services.py:26-30 | test_registered_but_absent_is_not_counted_as_participation |
| Offline-tolerant check-in with sync | BUILT | participation/services.py:339-353; models.py:246-266 | OfflineReplayTests (3, service level) |

## §5.7.1 Budget template library

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Eight named templates (Workshop, Guest Lecture, Cultural Night, Inter-college Fest, Sports, Social Service, Hackathon, Blank) with standard heads | PARTIAL (model supports it; seed ships 4 differently-named templates; no Blank; no Inter-college Fest) | budget/models.py:6-48; identity/management/commands/seed_demo.py:50-59 | none |
| Selecting the event type loads the matching template | PARTIAL (caller passes a template *name*; `event_kind` unused for lookup) | events/views.py:112-119 | test_the_treasurer_can_raise_a_proposal_with_its_budget |

## §5.7.2 How templates behave

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Each head has suggested amount and unit basis, all editable | BUILT | budget/models.py:26-48; budget/services.py:110-138 | test_the_treasurer_can_edit_and_remove_a_line |
| Quantity-driven heads calculate automatically | PARTIAL (per_head × expected attendance works; per_day always uses days=1) | budget/models.py:43-48; services.py:16-35; events/views.py:120 | none |
| Contingency line at configurable percentage | BUILT | budget/services.py:30-34; config/settings.py:198 | none |
| Computes total requested and cost per expected participant | PARTIAL (total only) | budget/views.py:331-353 | none |
| Custom heads; frequently added customs surfaced to SLO | PARTIAL (custom heads yes; no surfacing) | budget/services.py:73-107 | test_the_treasurer_can_add_a_budget_line |
| Prior-year reference cost shown | MISSING | — | none |
| Templates maintained centrally; clubs cannot alter masters | PARTIAL (no write API or admin registration at all; only seed/shell can change them) | budget/urls.py:12-14; identity/admin.py | none |

## §5.7.3 Request, sanction and reconciliation

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Budget request attached to proposal, same approval chain | BUILT | governance/services.py:76-109 | test_an_unpriced_event_cannot_be_submitted, test_a_declared_nil_event_can_be_submitted_and_approved |
| Line-by-line sanction, reduce a head with comment | BUILT (Dean stage; reduce-only) | governance/services.py:321-349 | test_the_dean_may_reduce_a_head_but_not_raise_it, test_untouched_heads_are_sanctioned_as_requested |
| Thresholds: under amount → advisor only; larger → Dean | DEVIATES-BY-DECISION (Dean always; above VC_BUDGET_THRESHOLD adds VC) | config/settings.py:195; governance/services.py:58-59 | test_above_threshold_adds_the_vice_chancellor |
| Post-event actual spend per head with bill/receipt upload | BUILT | budget/views.py:244-304 | test_a_line_over_the_receipt_threshold_blocks_settlement, test_a_plain_member_cannot_enter_spend |
| Variance per head: requested vs sanctioned vs spent | BUILT | budget/views.py:23-35; budget/models.py:218-222 | test_an_overspend_needs_a_reason |
| Annual club budget envelope with running utilisation | MISSING | — | none |

## §5.8 Feedback & Surveys

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Automatic post-event feedback form, configurable per event type | MISSING (no Feedback model, view or task; AGENT_PROMPT §4 constraint "rating 1–5, one per student per event" unimplemented) | — | none |
| Standard + club-defined questions | MISSING | — | none |
| Aggregated scores to organisers/advisor/Dean; anonymous to organisers | MISSING | — | none |

## §5.9.1 Venue inventory and booking

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Venue register with capacity, facilities, controlling office | PARTIAL (name, capacity, location, active only) | events/models.py:7-17 | none |
| Provisional hold until approved, then confirmed | BUILT | events/models.py:39-47; events/views.py:306 | test_a_pending_request_does_not_block_another_one |
| Overlapping bookings rejected at request time | PARTIAL (application check + row lock; the Postgres exclusion constraint AGENT_PROMPT §4 mandates does not exist in any migration, contrary to README/settings/MASTER_SPEC §10.3) | events/services.py:72-87; events/migrations/0002_initial.py:104-116 (only two CheckConstraints) | test_a_confirmed_booking_blocks_a_new_request |
| Buffer configurable per venue | PARTIAL (single global VENUE_BUFFER_MINUTES) | config/settings.py:197; events/services.py:14-17 | test_the_setup_buffer_counts_as_part_of_the_booking |
| Exam/academic blackout periods block booking | MISSING | — | none |

## §5.9.2 Dean's venue overview

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Master calendar by day/week/month showing event, club, status | PARTIAL (single `?date=` day filter; status + confirmed flag present) | events/views.py:268-311 | test_vc_still_sees_events_and_the_venue_calendar (access only) |
| Per-venue timeline | PARTIAL (bookings carry venue id; no venue filter) | events/views.py:302-310 | none |
| Clash alerts side by side with capacity vs expected | BUILT | events/views.py:288-298; events/services.py:60-69 | test_each_clashing_pair_is_reported_once, test_the_approval_card_surfaces_the_clash |
| Pressure view (demand > venues) | MISSING | — | none |
| Utilisation per venue | BUILT (bookings count) | reporting/services.py:148-152 | none |
| Filter by club/category/date range/venue; export schedule | PARTIAL (date only; no export) | events/views.py:284-285 | none |

## §5.9.3 Reassigning a clashing event

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Dean moves event; only free and large-enough venues offered | BUILT | events/services.py:122-134; events/views.py:218-260 | test_the_dean_may_move_an_event, test_a_venue_too_small_for_the_expected_crowd_is_refused, test_the_club_president_may_not |
| Alternatively propose a different time slot | MISSING | — | none |
| Reason required and recorded | BUILT | events/serializers.py:117-126; events/models.py:143-160 | test_a_reason_is_required_because_the_club_is_shown_it |
| Club notified in-app + email with old and new venue | BUILT | events/views.py:253-257 | none |
| Registered students notified if already published | MISSING (`_notify_club` reaches office bearers only) | governance/services.py:140-157 | none |
| Original booking released atomically | BUILT | events/services.py:90-119 | test_the_slot_is_never_held_by_neither_venue, test_moving_into_an_occupied_venue_is_refused |
| Reassignment history retained on the event | PARTIAL (rows kept; never exposed on event payload or any list) | events/models.py:143-160; events/serializers.py:25-31 | test_the_move_records_where_it_came_from_and_why |
| Precedence rule stated | BUILT (Dean's discretion, deliberately; AGENT_PROMPT §9 open question) | events/views.py:238-240 | none |

## §5.10 Event Photos & Media

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Organisers upload photos to event page from mobile | MISSING (Event.photo_count integer; no EventPhoto, no upload route) | events/models.py:79-80 | none |
| Gallery; mark highlight images | MISSING | — | none |
| Report cannot be submitted without ≥1 photo | PARTIAL (enforced on a self-reported count, no file) | events/services.py:146-150 | none (close tested only for permission) |
| Auto-tagging with event, club, date, semester | MISSING | — | none |
| Captions/credits; original stored, compressed served | MISSING | — | none |
| Photo consent notice at registration; removal request route | MISSING | — | none |

## §5.11 Event Templates & Workflow Automation

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Event templates pre-fill proposal, budget, checklist, registration form | PARTIAL (budget template only) | events/views.py:112-119 | none |
| Clone a past event with dates shifted | MISSING | — | none |
| Auto-generated task checklist with owners and back-dated due dates | MISSING | — | none |
| Automated reminders (tasks, SLAs, registration close, event day) | MISSING (no Celery task exists anywhere; `config/celery.py` is the only Celery code) | config/celery.py:1-8 | none |
| Status automation draft→submitted→approved→published→live→completed→reported | PARTIAL (approval auto-publishes; go-live is manual; `completed` is never set, close goes live→reported) | governance/services.py:297-304; events/views.py:201-216; events/services.py:151-158 | test_society_then_dean_publishes_the_event |
| SLA escalation surfaced on Dean dashboard | MISSING (count only, no age) | reporting/services.py:137-143 | none |

## §5.12.1 Before the event

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Custom registration form builder | MISSING | — | none |
| Team/group registration with size limits | MISSING | — | none |
| Volunteer and crew roster with shifts | MISSING | — | none |
| Guest and speaker management | MISSING | — | none |
| Sponsorship tracker | MISSING | — | none |
| Publicity: auto to calendar/feed, targeted notifications, email announcement, poster download | PARTIAL (published events appear in list; nothing else) | governance/services.py:293-304 | none |

## §5.12.2 On the day

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| QR check-in with live count against capacity | BUILT | participation/views.py:233-253 | none (counters not asserted) |
| Spot registration at the desk | BUILT | participation/services.py:286-297 | test_branch_4_profile_qr_of_a_walk_in_registers_and_admits |
| Multiple check-in operators without conflicts | BUILT (row locks + partial unique constraints; station_id/operator recorded) | participation/models.py:80-84; services.py:225, 277 | test_branch_2_the_same_pass_twice_is_a_duplicate (sequential, not concurrent) |
| Offline-tolerant operation | BUILT | participation/services.py:339-353 | OfflineReplayTests |
| Session-level check-in for multi-session events | MISSING | — | none |

## §5.12.3 After the event

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Auto-drafted event report (attendance, registrations, sanctioned pre-filled) | PARTIAL (figures on event payload; no report object, no outcomes text) | events/serializers.py:33-37; events/views.py:180-199 | none |
| Participation certificates, bulk, from template | MISSING (only a token purpose helper, no model/endpoint) | qrkit/tokens.py:205-207 | none |
| Feedback dispatch to attendees | MISSING | — | none |
| Learnings capture carried forward | MISSING | — | none |
| Vendor record with rating | MISSING | — | none |

## §5.13 Approval Configuration

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Chains per request type (event, budget, venue, new club) | PARTIAL (one configured chain covering event+budget; nothing for venue or club) | config/settings.py:203; governance/services.py:29-65 | test_society_gate_switches_off_in_configuration |
| Amount-based routing thresholds | BUILT | config/settings.py:195; governance/services.py:58 | test_above_threshold_adds_the_vice_chancellor |
| Delegation when approver unavailable, recorded | MISSING (role-based notification is the only cover) | governance/services.py:116-137 | none |
| Parallel or sequential steps | PARTIAL (sequential only) | governance/models.py:76-82 | test_the_dean_cannot_act_while_it_is_with_the_society |
| Full audit trail: who, when, comment | BUILT | governance/models.py:85-109, 138-160; services.py:311-317 | test_returning_without_a_comment_is_refused |

## §5.14.1 Capturing post links

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Instagram and LinkedIn link fields, multiple per platform | PARTIAL (untyped `social_links` URL list) | events/models.py:80; events/serializers.py:129-132 | none |
| Added at report stage and also earlier | PARTIAL (only at close) | events/views.py:180-199 | none |
| Each link stores URL, platform, date added, who | PARTIAL (URL only) | events/services.py:155-156 | none |
| Configurable: link mandatory before completion | MISSING (photo is required; links never) | events/services.py:146-150 | none |
| Optional screenshot attachment | MISSING | — | none |
| Club handles for sense-checking | PARTIAL (instagram_handle only; no check) | clubs/models.py:26 | none |

## §5.14.2 Tracking club social activity

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Per club: share of completed events with a link | MISSING | — | none |
| Per club: most recent post date | MISSING | — | none |
| Platform split | MISSING | — | none |
| Dean dashboard: completed events missing links/photos/reports | BUILT (links and photos) | reporting/services.py:125-132 | none |
| Semester report outreach line | PARTIAL (per-event links listed; no aggregate) | reporting/services.py:93-101 | none |

## §5.15.1 Fest as a parent record

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Fest with name, theme, edition, dates, description, status via approval workflow | PARTIAL (model has name/club/dates/status; no theme/edition/description; **no Fest endpoints at all**; approval targets events only) | events/models.py:121-139; events/urls.py:9-15; governance/models.py:47-48 | none |
| Sub-events belong to fest, inherit branding/window/venue | PARTIAL (nullable FK only; it drives the VC gate) | events/models.py:62-63; governance/services.py:60-61 | test_a_fest_takes_the_vc_gate_whatever_the_amount |
| Participation, budget, photos roll up automatically | MISSING | — | none |
| Fest as one expandable line in semester report | MISSING | reporting/services.py:32-110 | none |
| Standalone events unaffected | BUILT | events/models.py:62 | ChainRoutingTests |

## §5.15.2 The fest page

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Public shareable landing page (hero, about, sub-events, schedule, registration, prizes, sponsors, team, venue, gallery) | MISSING | — | none |
| Hero/theme artwork uploaded per fest, carried to sub-events | MISSING | — | none |
| Previous editions archived and viewable | MISSING | — | none |

## §5.15.3 Fest organising team

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Convenor and scoped sub-event heads | MISSING (`event_organiser:<id>` scope is checked but never issued by the local provider) | common/roles.py:45; identity/tokens.py:28-44 | none |
| Time-bound fest roles recorded per edition | MISSING | — | none |

## §5.15.4 Fest budget

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Shared costs at fest level plus sub-event budgets | PARTIAL (Budget.fest OneToOne exists; no API creates or approves one) | budget/models.py:68-71; governance/models.py:47-48 | none |
| Inter-college Fest template at fest level | MISSING (no such template) | seed_demo.py:50-59 | none |
| Single-envelope sanctioning with draw-down | MISSING | — | none |
| Variance: fest total and location of overrun | MISSING | — | none |

## §5.15.5 External participants

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Register without SSO with name, college, email, phone | PARTIAL (model fields exist; no public endpoint) | participation/models.py:107-128 | none |
| Registration reference and QR by email, no account | MISSING | — | none |
| Stored separately from student directory | BUILT | participation/models.py:42-45, 70-76 | test_external_participants_are_counted_separately_never_summed |
| Mixed internal/external team entries | MISSING | — | none |
| Retention period then purge | PARTIAL (`purge_after` field; no job) | participation/models.py:122 | none |
| Report own students and visitors separately | BUILT | reporting/services.py:40-43, 77-78 | test_external_participants_are_counted_separately_never_summed |

## §5.16.1 How the station works

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Browser-based station on club device | PARTIAL (API complete; UI only in throwaway demo page) | participation/views.py:223-268; demo/organiser-scan.html | DoorPermissionTests (API) |
| Continuous camera read, no tapping/typing | MISSING (frontend) | — | none |
| Immediate distinguishable feedback (accepted / already / wrong event / not registered) | BUILT (result, verdict, tone) | participation/views.py:85-98; services.py:137-153 | test_branch_6_a_pass_for_another_event_is_wrong_event_not_invalid |
| Sub-second recognition; parallel stations | PARTIAL (no benchmark; concurrency safety via constraints) | participation/models.py:80-84 | none |
| Every scan records student, event, timestamp, station, operator | BUILT | participation/models.py:227-266 | test_every_branch_writes_a_scan_record_including_the_failures |
| Works offline, syncs later | BUILT | participation/services.py:339-353 | OfflineReplayTests |

## §5.16.2 The student profile QR

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Personal QR in profile, always available | BUILT | participation/services.py:32-39; views.py:166-204 | RevokedProfileQrTests |
| Signed token; PRN not readable from the code | BUILT | qrkit/tokens.py:96-136, 187-189 | test_a_tampered_signature_does_not_verify |
| Scan identifies student; registered → check-in, else spot-register | BUILT | participation/services.py:253-297 | test_branch_3_…, test_branch_4_… |
| Removes typing at the desk | BUILT | same | same |
| High-contrast display, brightness raised | PARTIAL (server renders larger image; no UI) | participation/views.py:200-201 | none |
| Token rotatable by student or by Student Life Office | PARTIAL (student only; no staff rotation route) | participation/views.py:206-217; services.py:42-53 | test_reissuing_produces_a_different_token, test_the_revoked_profile_qr_is_refused |

## §5.16.3 Per-event passes

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Pass issued in app and by email on registration | PARTIAL (in app only; no email) | participation/services.py:115; views.py:166-204 | test_a_pass_token_is_only_returned_to_its_owner |
| Valid for that event only; cannot be reused once scanned | BUILT | participation/services.py:217-249; models.py:186-192 | test_branch_1_…, test_branch_2_…, test_branch_6_… |
| Either code works at the gate | BUILT | participation/services.py:200-297 | test_branch_1_…, test_branch_3_… |
| Multi-session passes scanned per session | MISSING | — | none |

## §5.16.4 When the scan does not work

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| No phone: roster search by PRN/name, manual check-in | BUILT | identity/views.py:204-232; participation/views.py:296-317; services.py:300-336 | none (manual path untested; only the URL appears in a permission test) |
| Different event: mismatch shown; redirect or spot-register | BUILT | participation/services.py:210-224 | test_branch_6_… |
| Already checked in: earlier time shown | BUILT | participation/services.py:156-161 | test_branch_5_… |
| Walk-in: profile QR, one action | BUILT | participation/services.py:286-297 | test_branch_4_… |
| Device fails: other device; paper list entered afterwards, flagged manual | PARTIAL (manual source flagged; no back-dated or bulk entry) | participation/services.py:300-336 | none |
| No self-marking | BUILT | participation/permissions.py:21-91 | test_an_ordinary_attendee_cannot_scan_themselves_in, test_a_plain_club_member_may_not_scan |

## §5.16.5 Spot registration

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Walk-in handled in a single scan | BUILT | participation/services.py:286-297 | test_branch_4_… |
| Manual PRN entry with name confirmation | BUILT | participation/views.py:304-317; integrations/directory.py:19-22 | none |
| External visitor short form, no account | MISSING | — | none |
| Capacity warning at the station | BUILT | participation/services.py:287-290 | test_a_walk_in_is_refused_once_the_event_is_full |
| Spot registrations flagged; reports distinguish planned vs walk-in | PARTIAL (source flag; no report split) | participation/models.py:31-35 | none |

## §5.17 Club Console

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Live attendee list: name, PRN, programme, year, check-in time, admission mode | BUILT | participation/views.py:50-60, 320-350 | test_the_dean_still_reads_rosters_and_attendee_lists |
| Running count vs capacity; registered-not-arrived | BUILT | participation/views.py:241-243 | none |
| Search/filter by name, PRN, year, department | PARTIAL (`attended` filter only) | participation/views.py:343-344 | none |
| Export attendee list; figures flow to semester report | PARTIAL (JSON only; report flow yes) | reporting/services.py:26-30 | none |
| Access scoped to own club, time-limited, logged | PARTIAL (club scope yes; no time window on roster; roster reads are not audited although authentication.py:85-86 claims they are) | participation/views.py:335-340 | test_another_clubs_president_may_not_scan, test_vc_cannot_read_an_attendee_list |

## §5.18 Member Roster & Role Assignment

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Pres/VP see full roster; others a basic list | PARTIAL (same payload incl. PRN to every member; only `can_assign_roles` differs) | clubs/views.py:47-71 | none |
| Roles assignable: member, core, treasurer, secretary, VP, President | BUILT | clubs/models.py:58-65 | test_the_president_may_assign_a_role |
| Assignment restricted to President/VP | BUILT | clubs/views.py:100-106 | test_the_treasurer_may_not, test_the_vice_president_may_too |
| Every change recorded with who, when, effective date | PARTIAL (no effective date) | clubs/models.py:100-117 | test_a_role_change_is_recorded_with_who_did_it |
| Permissions follow the role automatically | BUILT (on next token issue) | identity/tokens.py:28-44 | test_club_roles_travel_as_scoped_strings |
| Roles carry an end date feeding handover | MISSING (`ended_at` exists but no API sets it, no expiry) | clubs/models.py:72 | none |
| Advisor and SLO view any roster; a President cannot view another club's | PARTIAL (Dean/admin can; cross-club is 404; advisor DEVIATES; SLO missing) | clubs/views.py:57-60 | test_vc_cannot_read_a_club_roster, test_the_dean_still_reads_rosters_and_attendee_lists |

## §5.19.1 Approval stage tracker

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Draft: editable, not submitted | BUILT | budget/models.py:160-171 | test_lines_freeze_once_an_approver_holds_the_budget |
| Submitted: date, who | BUILT | governance/models.py:56-58; events/models.py:83 | none |
| Advisor review with days pending | DEVIATES-BY-DECISION (`society_review` instead; no days-pending anywhere) | budget/models.py:52-60 | none |
| Dean review with days pending | PARTIAL (stage yes; no age) | budget/models.py:55 | none |
| Sanctioned: per-head amounts with approver comments | BUILT | governance/views.py:19-25, 52-62 | test_the_dean_may_reduce_a_head_but_not_raise_it |
| Rejected/returned with reason | BUILT | governance/models.py:103-109 | test_returning_without_a_comment_is_refused |
| Settled: requested/sanctioned/spent side by side with documents per line | BUILT | budget/views.py:23-59 | test_a_settled_budget_says_so_rather_than_listing_blockers |

## §5.19.2 What the three roles can do

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| View proposals and stage: P/VP/T | BUILT | common/roles.py:57; budget/views.py:117-135 | test_president_and_treasurer_can_see_the_budget |
| Create and submit: P/VP/T | BUILT | common/roles.py:81 | test_the_treasurer_can_raise_a_proposal_with_its_budget |
| Record spend and receipts: P/VP/T | BUILT | common/roles.py:73 | test_the_vice_president_can_record_spend |
| View annual envelope and utilisation | MISSING | — | none |
| Assign roles: P/VP only | BUILT | common/roles.py:54 | test_the_treasurer_may_not |
| No club role approves its own budget | BUILT | governance/services.py:203-210 | test_the_club_president_cannot_approve_their_own_proposal, test_the_treasurer_still_cannot_approve_it |

## §5.19.4 Receipts, invoices and supporting documents

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Receipts attached per budget line | BUILT | budget/models.py:225-256 | test_a_line_over_the_receipt_threshold_blocks_settlement |
| JPG/PNG/HEIC and PDF; multiple per line | BUILT (`image/*` + PDF) | budget/views.py:285-288 | none |
| Photo captured in app at point of payment | PARTIAL (upload endpoint; no UI) | budget/views.py:269-304 | none |
| Each upload records file, amount, vendor, date, uploader | PARTIAL (no vendor) | budget/models.py:236-243 | none |
| Compressed for storage, original retained | PARTIAL (original only, no compression) | integrations/files.py:22-32 | none |
| Configurable rule: lines above amount need a document | BUILT | config/settings.py:196; budget/services.py:256-265 | test_a_line_over_the_receipt_threshold_blocks_settlement |
| Treasurer primary; President/VP can view and add | BUILT | common/roles.py:73 | test_the_vice_president_can_record_spend |
| Advisor/SLO/Dean can view attachments | PARTIAL (Dean sees metadata; no download route — `url_for` unused, no `/media/` URL) | integrations/files.py:34-35; config/urls.py | test_the_dean_can_see_every_budget |
| Documents remain attached afterwards | BUILT | budget/models.py:229-231, 243-245 | none |

## §5.19.5 Ongoing visibility

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Annual envelope with running utilisation | MISSING | — | none |
| Line-level variance across all the club's events | PARTIAL (per budget; no club aggregate) | budget/views.py:114-150 | none |
| Outstanding items: unsettled events, lines missing documents | PARTIAL (per-budget `settlement_problems`; no club or Dean list) | budget/services.py:235-273 | test_all_blockers_are_reported_at_once |
| Notification to club on stage change, in-app + email | BUILT | governance/services.py:140-157, 266-304 | none |

## §6.1 The semester report

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Cover: semester, date range, headline totals | BUILT | reporting/services.py:73-80 | test_total_and_unique_are_different_numbers |
| At a glance: events, participation, unique students, active clubs | PARTIAL (active clubs only in overview, not report) | reporting/services.py:75-79 | same |
| Trend vs previous semester | MISSING | — | none |
| By category split | PARTIAL (by_department instead; category only on by_club rows) | reporting/services.py:45-65 | test_department_split_uses_the_snapshot_not_the_current_record |
| Club-wise summary with one highlight photo | PARTIAL (no photo) | reporting/services.py:80-85 | none |
| Fests as single entries | MISSING | — | none |
| Event highlights, photo-led | PARTIAL (events with counts; photo_count only) | reporting/services.py:92-101 | none |
| Photo gallery | MISSING | — | none |
| PDF, PowerPoint, CSV formats | MISSING (JSON only; no Celery report job) | reporting/views.py:24-40 | none |

## §6.2 Core metrics

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Number of events (completed in semester) | BUILT | reporting/services.py:18-23, 36 | test_total_and_unique_are_different_numbers |
| Total participation | BUILT | reporting/services.py:37 | test_registered_but_absent_is_not_counted_as_participation |
| Unique students reached | BUILT | reporting/services.py:40-41 | test_total_and_unique_are_different_numbers |
| Average attendance per event | BUILT | reporting/services.py:79 | none |
| Events per club | BUILT | reporting/services.py:45-54 | none |
| Participation by category | PARTIAL (no category aggregate) | reporting/services.py:45-54 | none |
| Fest participation split own vs external | PARTIAL (global external count; not per fest) | reporting/services.py:42-43, 78 | test_external_participants_are_counted_separately_never_summed |
| Semester-on-semester change | MISSING | — | none |

## §6.3 Dean of Student Life dashboard

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Pending approvals with age | PARTIAL (count by stage, no age) | reporting/services.py:137-143 | none |
| Events this week/month; upcoming venue conflicts | PARTIAL (clash count only) | reporting/services.py:144 | none |
| Active vs dormant clubs, flagged | PARTIAL (computed "no completed events" proxy, no flagging) | reporting/services.py:134-147 | none |
| Events missing photos, social links, closing report | PARTIAL (photos/links among reported events; events stuck LIVE/COMPLETED never appear) | reporting/services.py:125-132 | none |
| Clubs with no social post in a configurable window | MISSING | — | none |
| Running semester totals | PARTIAL (via the report endpoint, not the overview) | reporting/views.py:24-51 | none |

## §6.4 Management dashboard

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Current vs previous semester | MISSING | — | none |
| Club-wise table sortable by events and reach | PARTIAL (sorted by attendance in JSON) | reporting/services.py:45-54 | test_vc_still_gets_the_semester_report |
| Category split of participation | PARTIAL (department split) | reporting/services.py:58-65 | none |
| Recent highlights with photos | MISSING | — | none |
| Export to PDF or PowerPoint | MISSING | — | none |

## §6.5 Making the numbers trustworthy

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| QR check-in gives actual count | BUILT | participation/services.py:174-297 | SevenBranchTests |
| Registered / attended / no-show recorded separately; report attended | BUILT | reporting/services.py:26-30 | test_registered_but_absent_is_not_counted_as_participation |
| Check-in capture rate monitored | PARTIAL (accepted ÷ attempts; formula differs from the Database doc per MASTER_SPEC §10.3 and is still undecided) | participation/services.py:356-375; reporting/services.py:157-171 | none |

## §8 Non-Functional Requirements

| Requirement | Status | Evidence | Test |
|---|---|---|---|
| Feed/calendar < 2 s; check-in < 1 s | PARTIAL (no measurement; EventSerializer issues two COUNT queries per event, an N+1 on the list) | events/serializers.py:33-37 | none |
| Mobile-first | MISSING (no frontend) | app/frontend/src (empty dirs) | none |
| Offline tolerance | BUILT | participation/services.py:339-353 | OfflineReplayTests |
| Peak registration bursts | PARTIAL (row lock on event; no throttling configured) | participation/services.py:99; config/settings.py:119-127 | none |
| Scan throughput, parallel stations | PARTIAL (no benchmark) | participation/models.py:80-84 | none |
| Attendance integrity: organiser-only, one-time passes, duplicate rejection, rotatable tokens | BUILT | participation/permissions.py; models.py:186-192; services.py:42-53 | test_branch_2_…, test_a_replaced_pass_stops_working, test_the_revoked_profile_qr_is_refused, test_an_ordinary_attendee_cannot_scan_themselves_in |
| Privacy (DPDP): purpose-limited, student notice, role-restricted individual records | PARTIAL (role restriction strong; no notice; no access log) | identity/authentication.py:72-88 | VCDashboardOnlyTests (13) |
| WCAG 2.1 AA | MISSING (no frontend) | — | none |
| Auditability of approvals, budget decisions, venue reassignments | BUILT | governance/models.py:85-109, 138-160; events/models.py:143-160 | test_the_move_records_where_it_came_from_and_why |
| In-app and email only; no SMS/third-party | BUILT | integrations/base.py:59-63; notifications.py | none |
| Shared SSO, roles, notification services | PARTIAL (adapter seam exists; platform implementations raise NotImplementedError) | integrations/directory.py:50-53; notifications.py:36-39; files.py:39-43 | test_password_login_is_refused_in_platform_mode |

## §7 Data model (informational, not counted)

Present as tables: Club, Membership, Event (incl. fest FK), Registration, StudentQRToken, EventPass, ScanRecord, Venue, Approval (ApprovalRequest + ApprovalStep), BudgetTemplate, BudgetLine, ReceiptDocument, Fest (minimal), ExternalParticipant, plus Notification, AuditEntry, VenueReassignment, RoleChange.
Absent: OfficeBearerTerm, EventReport, Feedback, EventPhoto, EventTemplate, Task, Volunteer, Sponsor, EventSocialPost, FestRole. (26 models in migrations vs 24 PRD entities; 10 PRD entities missing.)

## §9 Delivery phasing (informational, not counted)

| Phase | Status |
|---|---|
| 1 Foundation: directory, profiles, membership, roles; event creation, approval, publication, calendar | Mostly BUILT: approvals/publication/calendar strong; directory and membership PARTIAL (no join, no club founding) |
| 2 Participation: registration, scan stations, console, feedback; roster/roles; feed and notifications | PARTIAL: scan/console/roles BUILT; feedback and personalised feed MISSING; registration emails MISSING |
| 3 Impact and governance: dashboards, photo upload, budget templates/sanctioning/variance, stage tracker, PDF/PPTX report | PARTIAL: budget side BUILT; photos, trend, category split, exports MISSING |
| 4 Depth: event templates, cloning, checklists, volunteers, sponsors, certificates, social tracking, fests, venue mgmt, succession | Largely MISSING: venue management BUILT; fests, succession, social tracking PARTIAL at model level only |

---

## Summary

| Subsection | Total | BUILT | PARTIAL | MISSING | DEVIATES |
|---|---|---|---|---|---|
| §4 Roles | 9 | 4 | 3 | 1 | 1 |
| 5.1 Directory | 5 | 0 | 4 | 1 | 0 |
| 5.2 Membership | 3 | 1 | 1 | 1 | 0 |
| 5.3 Succession | 3 | 0 | 2 | 1 | 0 |
| 5.4 Lifecycle | 9 | 3 | 4 | 1 | 1 |
| 5.5 Discovery | 6 | 1 | 3 | 2 | 0 |
| 5.6 Registration/attendance | 4 | 3 | 1 | 0 | 0 |
| 5.7.1 Template library | 2 | 0 | 2 | 0 | 0 |
| 5.7.2 Template behaviour | 7 | 2 | 4 | 1 | 0 |
| 5.7.3 Sanction/reconcile | 6 | 4 | 0 | 1 | 1 |
| 5.8 Feedback | 3 | 0 | 0 | 3 | 0 |
| 5.9.1 Venue booking | 5 | 1 | 3 | 1 | 0 |
| 5.9.2 Venue overview | 6 | 2 | 3 | 1 | 0 |
| 5.9.3 Reassignment | 8 | 5 | 1 | 2 | 0 |
| 5.10 Photos | 6 | 0 | 1 | 5 | 0 |
| 5.11 Templates/automation | 6 | 0 | 2 | 4 | 0 |
| 5.12.1 Before event | 6 | 0 | 1 | 5 | 0 |
| 5.12.2 On the day | 5 | 4 | 0 | 1 | 0 |
| 5.12.3 After event | 5 | 0 | 1 | 4 | 0 |
| 5.13 Approval config | 5 | 2 | 2 | 1 | 0 |
| 5.14.1 Post links | 6 | 0 | 4 | 2 | 0 |
| 5.14.2 Social tracking | 5 | 1 | 1 | 3 | 0 |
| 5.15.1 Fest record | 5 | 1 | 2 | 2 | 0 |
| 5.15.2 Fest page | 3 | 0 | 0 | 3 | 0 |
| 5.15.3 Fest team | 2 | 0 | 0 | 2 | 0 |
| 5.15.4 Fest budget | 4 | 0 | 1 | 3 | 0 |
| 5.15.5 External participants | 6 | 2 | 2 | 2 | 0 |
| 5.16.1 Station | 6 | 3 | 2 | 1 | 0 |
| 5.16.2 Profile QR | 6 | 4 | 2 | 0 | 0 |
| 5.16.3 Event passes | 4 | 2 | 1 | 1 | 0 |
| 5.16.4 Fallbacks | 6 | 5 | 1 | 0 | 0 |
| 5.16.5 Spot registration | 5 | 3 | 1 | 1 | 0 |
| 5.17 Club console | 5 | 2 | 3 | 0 | 0 |
| 5.18 Roster/roles | 7 | 3 | 3 | 1 | 0 |
| 5.19.1 Stage tracker | 7 | 5 | 1 | 0 | 1 |
| 5.19.2 Role matrix | 6 | 5 | 0 | 1 | 0 |
| 5.19.4 Receipts | 9 | 5 | 4 | 0 | 0 |
| 5.19.5 Ongoing visibility | 4 | 1 | 2 | 1 | 0 |
| 6.1 Semester report | 9 | 1 | 4 | 4 | 0 |
| 6.2 Core metrics | 8 | 5 | 2 | 1 | 0 |
| 6.3 Dean dashboard | 6 | 0 | 5 | 1 | 0 |
| 6.4 Management dashboard | 5 | 0 | 2 | 3 | 0 |
| 6.5 Trustworthy numbers | 3 | 2 | 1 | 0 | 0 |
| §8 NFRs | 11 | 4 | 5 | 2 | 0 |
| **Grand total** | **247** | **86** | **87** | **70** | **4** |

**BUILT: 86/247 = 34.8%.  BUILT + PARTIAL: 173/247 = 70.0%.** (Excluding the 4 DEVIATES-BY-DECISION rows: 35.4% and 71.2%.)

The shape is clear: the money-and-door core (§5.7.3, §5.12.2, §5.16, §5.19) is 65-85% BUILT with real wrong-role tests; the evidence, engagement and depth layers (§5.8, §5.10, §5.11, §5.12.1/3, §5.14.2, §5.15) are 0-20% BUILT.

---

## Top 12 gaps (priority order)

1. **No frontend at all** — `app/frontend/src/{student,organiser,shared,staff}` are empty directories; the only UI is the throwaway `demo/` harness and a separate browser-only mock at `web-app/` (package "culturals-walkthrough", zero API calls). Every mobile, accessibility and "student discovers on phone" requirement is blocked on this.
2. **Feedback domain absent (§5.8, §5.4 stage 7, §5.12.3)** — no model, endpoint or dispatch; a named AGENT_PROMPT §4 DB constraint is unimplemented. MASTER_SPEC §10.2 #2 still true.
3. **Photos are an integer (§5.10, §6.1)** — `Event.photo_count`; no upload, gallery, highlights, tagging or consent. The semester report, "the reason the module exists", cannot be photo-led. §10.2 #6 still true.
4. **No Celery tasks of any kind** — reminders, SLA escalation, dormancy flagging, external-participant purge, ScanRecord roll-up and report generation all require jobs; `config/celery.py` is the only Celery code. §10.2 #11, #14, #15, #16 still true.
5. **Venue exclusion constraint does not exist in Postgres either** — README, `settings.py:81-83`, `.env.example` and MASTER_SPEC §10.3 all say it is "Postgres-only, skipped on SQLite"; no migration contains it. Concurrent proposals can double-book on the target database. AGENT_PROMPT §3 rule 3 violated.
6. **Membership join and club founding flows missing (§5.1, §5.2)** — no student can join a club and no club can be proposed through the API; everything comes from `seed_demo`. §10.2 #10 still true.
7. **Succession / role end dates missing (§5.3, §5.18)** — outgoing bearers keep access indefinitely; `event_organiser` scopes are defined and checked but never issued. §10.2 #3 still true; live access-control gap.
8. **Report formats and trend (§6.1, §6.2, §6.4)** — JSON only; no PDF/PPTX/CSV, no previous-semester comparison, no category split (department split instead), no fest line.
9. **Fests are a bare FK (§5.15)** — `Fest` model with no endpoints, no roll-up, no page, no team, no external registration flow, no fest budget route. §10.2 #5, #9 still true.
10. **Registration confirmations and audience notifications (§5.5, §5.9.3, §5.12.1)** — registering sends no email or pass by email; publication and venue moves notify club officers only, never registered students; no per-user preferences.
11. **Receipts cannot be retrieved (§5.19.4)** — files are written to `media/` and `FileStore.url_for` exists, but no URL serves them and the Dean's "view attachments" is metadata only. Also no vendor field and no compression.
12. **Student Life Office role and venue/template administration (§4, §5.7.2, §5.9.1)** — no SLO role; Venue, Club, BudgetTemplate are not registered in Django admin and have no write API, so operations depend on `manage.py shell`. §10.2 #4 still true.

Smaller but notable: no waitlist (§5.6; §10.2 #1 still true); `completed` status never set; roster reads not audited despite the docstring; no social-link typing/date/author; per-day template basis never scales; management report exposes `by_department` rather than category.

---

## Test coverage

**143 test functions** in 6 files (MASTER_SPEC §10 said 97; the suite has grown): test_budget_and_roles 48, test_scan 25, test_approvals 21, test_reporting 21, test_venues 16, test_auth_claims 12. Factories log in over the API so tokens are real.

**Areas with wrong-role tests (restriction proven at the API):** approval decisions (student, self-approval by president, VC below threshold, wrong stage, treasurer); approval queue visibility (plain member); budget visibility (member, other club, 404-not-403, Dean); spend entry (member); budget building (member); role assignment (treasurer, second president); proposing (member); event close (treasurer); scan door (plain member, other club's president, attendee self-scan, station token bound to another event, VC, Dean, Cultural Society); roster and PRN lookup for the VC plus a PRN-leak sweep; semester report (student); venue reassignment (president); MFA on above-threshold sanction; password login in platform mode; refresh-token replay.

**Areas with no tests at all:** club CRUD and archive gating (Dean/admin); membership listing; student registration API (`POST /registrations`, cancel, reissue-pass, `my-passes`); offline sync and scan endpoints over HTTP (SevenBranchTests and OfflineReplayTests call `services.*` directly; only DoorPermissionTests hit the URLs); manual check-in behaviour; directory search (only the VC 403); notifications endpoints; audit endpoint access; budget-templates preview arithmetic; semesters endpoint; Dean overview contents; event-list visibility scoping (student vs officer drafts); `EVENTS_LOCKED` edit rule; go-live permission; photo-required-to-close rule; soft-clash flag on create; demo-mode guards; receipt upload content-type rule; `.env`/settings guards (QR keys outside DEBUG, DEMO_MODE with DEBUG off).

---

## Environment and quality

- **Directory name** contains `:` and a trailing space. `venv` cannot be created inside it and `PYTHONPATH` cannot express it (README and MASTER_SPEC §10.4 both say rename). No venv exists anywhere obvious: `/usr/bin/python3` is 3.9.6 and `/usr/local/bin/python3.{12,14,15}` all lack Django, so `manage.py check`, `migrate --check` and `spectacular` could not be run for this audit and the "18 drf-spectacular schema errors" claim is unverified (the cause it names — plain `APIView`s returning ad-hoc dicts — is still present in reporting, participation, identity and events views, so it is almost certainly still true).
- **Not a git repository.** No history; RECONCILIATION.md documents an unrecoverable overwrite between two parallel drafts. `git init` before further work.
- **Database:** `DATABASE_URL` unset in `.env`, so it runs on the committed `db.sqlite3` (1.2 MB, 2 Oct). PostgreSQL is mandatory per AGENT_PROMPT §2 and `User.with_global_role` has a Python fallback for SQLite. With no exclusion constraint in migrations there is nothing Postgres-specific to lose, which is the problem, not a comfort.
- **Secrets and switches in the committed `.env`:** `DJANGO_SECRET_KEY` still equals the `.env.example` placeholder `change-me-in-production`; `DJANGO_DEBUG=1`; `DEMO_MODE=1` (passwordless token minting for named personas); `QR_SIGNING_KEYS` unset so the hard-coded dev key at settings.py:181 signs every pass. Settings refuse DEMO_MODE and missing QR keys only when `DEBUG=0`. MFA accepts any non-empty code in local mode (identity/views.py:110-113).
- **Celery:** `CELERY_TASK_ALWAYS_EAGER = DEBUG` and a Redis broker URL, but no task modules exist and no worker is needed yet; `PlatformAuditSink` has a TODO for Celery retry.
- **Media:** receipts land in `media/` on local disk (four demo PDFs committed); `media/` is not served by any URL and `PlatformFileStore` raises `NotImplementedError`.
- **Django admin** registers only User, Student, ReferenceCode, Semester. Clubs, venues, budget templates, events have no admin and (for the first three) no write API.
- **Throttling/pagination:** no DRF throttle classes configured; pagination defaults to 25/200, fine.
- **Migrations** are consistent with the models read (26 models, all named constraints present); 3 apps have "0001/0002_initial" pairs from the reconciliation, plus `budget/0003` for the nil-budget fields. Whether `makemigrations --check` is clean could not be run.
- **Frontend:** `app/frontend/src/` contains four empty directories. `web-app/` at the repo root is a browser-only mock walkthrough with its own fake `db.js`; it does not call this backend and should not be mistaken for the React client AGENT_PROMPT §2 specifies.
