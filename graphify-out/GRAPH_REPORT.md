# Graph Report - culturas:club management platform   (2026-10-21)

## Corpus Check
- 198 files · ~178,388 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .css 2, .example 1)

## Summary
- 2747 nodes · 6598 edges · 150 communities (101 shown, 49 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 576 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Event Views & Models
- Budget API Views
- Scan Tests & Fixtures
- Participation Views & Adapters
- Identity & Login Spec
- Seed, Factories & Role Tests
- Club & Membership Models
- QR Kit Scan Service
- Event Flows & Decisions
- Identity Models
- Governance Services & Tests
- Identity Views & Auth
- Participation Models & Resolver
- Budget Services
- Decision Log & Open Items
- Event Flows Role Views
- PRD Attendance & NFRs
- Test Factories
- Web-app Approvals & Reporting
- Nil Budget Tests
- Database Design Spec
- PRD Fests & Templates
- Development Plan Phases
- QR Kit Token Core
- Design Data Model Tables
- Reporting & Error Services
- PRD Operations Toolkit
- Reporting & Receipt Decisions
- Approval API Views
- API Standards Contract
- QR Kit Tokens (vendored)
- qrkit Tokens
- Web-app Role Constants
- QR Rendering
- AGENT_PROMPT Approval Rules
- Approval Flow Tests
- Web-app Attendance Logic
- Web-app Budget Logic
- Web-app DB & Seed
- Web-app UI & Session
- Prototype Render & Budget
- PRD Functional Requirements
- E2E Test Harness
- Migrations
- Demo Shared Helpers
- Auth Context
- JWT Issuing & Refresh
- Identity Providers
- AGENT_PROMPT Fixed Decisions
- Smoke Import Checks
- Web-app Credentials
- Reconciliation Record
- VC Privacy Tests
- QR Kit Licensing
- QR Kit Scan Outcomes
- API Standards Conventions
- Stack Decisions
- Platform Open Decisions
- Web-app API Layer
- DRF Permission Classes
- Signed Token Design
- QR Data URIs
- PRD Data Model Outline
- Venue Reassignment Tests
- Platform Decision Log
- Platform Shared Core
- Demo Capabilities & Nav
- Platform Squads & Phases
- Notifications API
- Backend Dependencies
- Core Service Interfaces
- PRD Risks & Privacy
- Web-app Package Manifest
- Web-app Token Signing
- Chain Routing Tests
- Prototype Approvals & Report
- Platform Squad Ownership
- Backend README
- Integrity Constraints Spec
- Treasurer Permission Tests
- Prototype Event Handlers
- Platform Build Risks
- PRD Reporting & Phasing
- Seven-Branch Check-in Spec
- File Store Adapters
- Student Directory Adapters
- Scan Resolution Rationale
- PRD Users & Roles
- Problem Details Middleware
- Audit Sink Adapters
- Login Tests
- Budget Visibility Tests
- Settlement Sequence Tests
- Web-app Session Roles
- Notification Adapters
- Role Assignment Tests
- Clubs & People Domain
- Platform Governance Rules
- Identity Policy & Demo Accounts
- Clash Detection Tests
- Prototype Venue Clashes
- Dean Venue Oversight
- Fees & Finance Squad
- PRD Open Questions
- PRD Overview & References
- PRD Event Lifecycle
- Walkthrough Build Notes
- Adapter Base Interfaces
- VC Privacy Boundary
- Settlement Gates & Receipts
- Settlement Tests
- JWT Claim Contract
- API Namespaces & Errors
- Privacy & Retention Rules
- Shared Core Architecture
- Platform Student Directory
- Claim Contract Tests
- Unique vs Total Tests
- Identity Adapter Principle
- PRN & Shared Reference Data
- User Manager
- Refresh Rotation Tests
- Standard Pagination
- SIS Students Contract
- Definition of Done
- Browser Check Script
- Club Secretary Role

## God Nodes (most connected - your core abstractions)
1. `Student Life — Clubs, Events & Impact Measurement PRD (V2)` - 202 edges
2. `Student Life — Clubs, Events & Impact Measurement PRD (V3)` - 202 edges
3. `Student Life — Clubs, Events & Impact Measurement PRD (V1)` - 169 edges
4. `ProblemDetail` - 70 edges
5. `db()` - 68 edges
6. `as_user()` - 56 edges
7. `Event Flows — Clubs & Events Application` - 47 edges
8. `Event Flows — Clubs & Events Application (V2)` - 46 edges
9. `EventStatus` - 44 edges
10. `Decision Log — Decisions & Rationale` - 43 edges

## Surprising Connections (you probably didn't know these)
- `Budget lifecycle (template → request → sanction → settle)` --semantically_similar_to--> `Settlement gates and the fixed sanction→run→settle sequence`  [INFERRED] [semantically similar]
  clubs-and-culturals-platform/AGENT_PROMPT.md → MASTER_SPEC.md
- `Pass token names the EventPass row id` --semantically_similar_to--> `Pass token subject is the EventPass row id`  [INFERRED] [semantically similar]
  MASTER_SPEC.md → clubs-and-culturals-platform/app/RECONCILIATION.md
- `Check-in resolution — all seven branches` --semantically_similar_to--> `Seven-branch check-in resolution`  [INFERRED] [semantically similar]
  clubs-and-culturals-platform/AGENT_PROMPT.md → MASTER_SPEC.md
- `Permissions enforced server-side` --semantically_similar_to--> `Hiding a page is not the permission`  [INFERRED] [semantically similar]
  student-management-platform/PLATFORM_AGENT_PROMPT.md → web-app/README.md
- `Offline station queueing and replay` --semantically_similar_to--> `ScanRecord.offline_ref unique constraint (replay idempotency)`  [INFERRED] [semantically similar]
  MASTER_SPEC.md → clubs-and-culturals-platform/app/RECONCILIATION.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Scan resolution flow (token verify -> seven branches -> logged outcome)** — clubs_and_culturals_platform_culturals_platform_scan, clubs_and_culturals_platform_culturals_platform_resolve, clubs_and_culturals_platform_culturals_platform_verifytoken, clubs_and_culturals_platform_culturals_platform_ok, clubs_and_culturals_platform_culturals_platform_dup, clubs_and_culturals_platform_culturals_platform_mkreg, clubs_and_culturals_platform_culturals_platform_scan_result_enum, clubs_and_culturals_platform_qr_attendance_kit_readme_scanservice [EXTRACTED 1.00]
- **Event approval and budget workflow (submit -> dean -> VC -> settle)** — clubs_and_culturals_platform_culturals_platform_submitevent, clubs_and_culturals_platform_culturals_platform_decide, clubs_and_culturals_platform_culturals_platform_vcdecide, clubs_and_culturals_platform_culturals_platform_settle, clubs_and_culturals_platform_culturals_platform_requiresvc, clubs_and_culturals_platform_culturals_platform_vc_threshold, clubs_and_culturals_platform_culturals_platform_approval_workflow [EXTRACTED 1.00]
- **Licensing provenance of the QR kit (MIT derivation vs GPL reference-only)** — clubs_and_culturals_platform_qr_attendance_kit_docs_licensing_cert_repo, clubs_and_culturals_platform_qr_attendance_kit_docs_licensing_attendance_repo, clubs_and_culturals_platform_qr_attendance_kit_docs_licensing_derivation_policy, clubs_and_culturals_platform_qr_attendance_kit_docs_licensing_d05_licence_decision, clubs_and_culturals_platform_qr_attendance_kit_notice_hmac_signed_token_design, clubs_and_culturals_platform_qr_attendance_kit_readme_tokens_py [EXTRACTED 1.00]
- **Approval chain: single Dean gate, two gates for fests and above-threshold budgets** — graphify_out_converted_decision_log_3373b55c_d_10, graphify_out_converted_database_and_data_flow_8c1c75d8_approval_chain_configuration, graphify_out_converted_database_and_data_flow_8c1c75d8_approval_request, graphify_out_converted_database_and_data_flow_8c1c75d8_approval_step, graphify_out_converted_event_flows_clubs_events_6c41eea8_confirmed_approval_chain, graphify_out_converted_event_flows_clubs_events_v2_556cdb7c_confirmed_approval_chain, graphify_out_converted_decision_log_3373b55c_o_03, graphify_out_converted_decision_log_3373b55c_o_02 [INFERRED 0.85]
- **Attendance capture: organiser-operated scan of profile QR or one-time event pass, logged per attempt** — graphify_out_converted_decision_log_3373b55c_d_11, graphify_out_converted_decision_log_3373b55c_d_12, graphify_out_converted_decision_log_3373b55c_d_13, graphify_out_converted_database_and_data_flow_8c1c75d8_student_qr_token, graphify_out_converted_database_and_data_flow_8c1c75d8_event_pass, graphify_out_converted_database_and_data_flow_8c1c75d8_scan_record, graphify_out_converted_database_and_data_flow_8c1c75d8_check_in_flow, graphify_out_converted_event_flows_clubs_events_6c41eea8_scan_station, graphify_out_converted_database_and_data_flow_8c1c75d8_capture_rate_metric [INFERRED 0.85]
- **Standalone-first adapter pattern selected by INTEGRATION_MODE** — graphify_out_converted_api_standards_integration_contract_1_0102f62c_standalone_first_principle, graphify_out_converted_api_standards_integration_contract_1_0102f62c_adapter_requirement, graphify_out_converted_api_standards_integration_contract_1_0102f62c_identity_provider, graphify_out_converted_api_standards_integration_contract_1_0102f62c_student_directory, graphify_out_converted_api_standards_integration_contract_1_0102f62c_notification_sender, graphify_out_converted_api_standards_integration_contract_1_0102f62c_file_store, graphify_out_converted_api_standards_integration_contract_1_0102f62c_audit_sink, graphify_out_converted_api_standards_integration_contract_1_0102f62c_consumer_driven_contract_tests [EXTRACTED 1.00]
- **Attendance capture integrity pipeline (scan station → QR/pass → Registration → core metrics)** — graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_16_attendance_capture_scan_stations, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_16_2_the_student_profile_qr, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_16_3_per_event_passes_for_pre_registered_students, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_16_5_spot_registration, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_registration_entity, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_scanrecord_entity, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_6_2_core_metrics, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_6_5_making_the_numbers_trustworthy, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_no_self_marking_of_attendance [EXTRACTED 1.00]
- **Club budget lifecycle (template → request → line-level sanction → settlement with receipts → variance)** — graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_7_1_budget_template_library, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_7_3_request_sanction_and_reconciliation, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_19_1_approval_stage_tracker, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_5_19_4_receipts_invoices_and_supporting_documents, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_budgetline_entity, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_receiptdocument_entity, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_configurable_approval_threshold_faculty_advisor_vs_dean_escalation, graphify_out_converted_student_life_clubs_events_prd_v4_6d70ab4d_annual_club_budget_envelope_with_running_utilisation [EXTRACTED 1.00]
- **Shared identity contract: standalone and platform login produce identical claims consumed by portal and module** — graphify_out_converted_identity_login_shared_data_d2ea92ad_5_4_claims_the_fixed_contract, graphify_out_converted_identity_login_shared_data_d2ea92ad_5_1_login_flow_platform_mode, graphify_out_converted_identity_login_shared_data_d2ea92ad_5_2_login_flow_standalone_mode, graphify_out_converted_identity_login_shared_data_d2ea92ad_identical_claim_structure_from_day_one, graphify_out_converted_platform_decision_log_d192f2c1_p_02_shared_core_architecture_one_identity_one_api_surface, graphify_out_converted_platform_development_plan_7e7c31dd_s2_core_platform, graphify_out_converted_platform_development_plan_7e7c31dd_sso_against_college_email_or_ldap_with_local_fallback [INFERRED 0.85]

## Communities (150 total, 49 thin omitted)

### Community 0 - "Event Views & Models"
Cohesion: 0.05
Nodes (38): create_lines(), ensure_budget(), seed_from_template(), Event, Kind, Meta, EventStatus, Fest (+30 more)

### Community 1 - "Budget API Views"
Cohesion: 0.06
Nodes (16): Budget, Meta, ReceiptDocument, Meta, BudgetLineSerializer, Meta, BudgetSerializer, Meta (+8 more)

### Community 2 - "Scan Tests & Fixtures"
Cohesion: 0.06
Nodes (14): StudentQRToken, Meta, _active_key_id(), issue_pass(), live_pass(), profile_token_for(), register_student(), reissue_pass() (+6 more)

### Community 3 - "Participation Views & Adapters"
Cohesion: 0.06
Nodes (25): audit_sink(), _get(), identity_provider(), _mode(), notifier(), reset(), student_directory(), event_club_id() (+17 more)

### Community 4 - "Identity & Login Spec"
Cohesion: 0.07
Nodes (47): §2 Identifiers — Which One, For What, §3.1 Core identity fields table, §3.3 Email — institutional vs personal_email, §3.4 PRN format and validation, §3.5 Status lifecycle, §3 Shared Identity Record, §4 Shared Reference Data, §5.1 Login flow — platform mode (+39 more)

### Community 5 - "Seed, Factories & Role Tests"
Cohesion: 0.08
Nodes (6): BudgetTemplate, Meta, seniority(), split_role(), ctx_for(), Claims

### Community 6 - "Club & Membership Models"
Cohesion: 0.08
Nodes (19): Club, Category, Meta, Status, Membership, Meta, RoleChange, Meta (+11 more)

### Community 7 - "QR Kit Scan Service"
Cohesion: 0.07
Nodes (13): EventPass, Meta, ScanOutcome, ScanResult, ScanService, EventRosterView, OfflineSyncView, _payload() (+5 more)

### Community 8 - "Event Flows & Decisions"
Cohesion: 0.08
Nodes (21): One-time event pass, O-12 Devices for scan stations: club-owned or shared pool, Persistent profile QR, Student Life Office, frontend/src/student, Attendance view, Event Flows — Clubs & Events Application, Event pass (one-time, that event only, rejected on second scan) (+13 more)

### Community 9 - "Identity Models"
Cohesion: 0.05
Nodes (14): StudentAdmin, UserAdmin, Command, ReferenceCode, Kind, Meta, Semester, Meta (+6 more)

### Community 10 - "Governance Services & Tests"
Cohesion: 0.09
Nodes (18): Migration, BudgetStage, ApprovalRequest, Meta, ApprovalStage, ApprovalState, ApprovalStep, Meta (+10 more)

### Community 11 - "Identity Views & Auth"
Cohesion: 0.07
Nodes (17): ClaimsUser, _auth_failed(), _capabilities(), _club_officer(), DemoLoginView, DemoPersonasView, _first_student_without_club_role(), LoginSerializer (+9 more)

### Community 12 - "Participation Models & Resolver"
Cohesion: 0.07
Nodes (16): at(), ExternalParticipant, Meta, Registration, Meta, Source, ScanRecord, Meta (+8 more)

### Community 13 - "Budget Services"
Cohesion: 0.08
Nodes (19): BudgetLine, Meta, BudgetTemplateLine, Basis, Meta, add_line(), _assert_editable(), attach_receipt() (+11 more)

### Community 14 - "Decision Log & Open Items"
Cohesion: 0.10
Nodes (26): Clubs & Events PRD, Database open points, Student Life — Clubs, Events & Impact PRD, Dean and Finance, Dean and Legal, Dean of Student Affairs, Decision Log — Decisions & Rationale, DLT / TRAI SMS compliance overhead (+18 more)

### Community 15 - "Event Flows Role Views"
Cohesion: 0.09
Nodes (20): Access scoping by role, Vice-Chancellor / Management, Attendance view, Dean operational dashboard (pending approvals with age, venue conflicts, dormant clubs, missing photos/reports/settlement, semester totals, budget utilisation), Event Flows — Clubs & Events Application (V2), Event pass (one-time, that event only, rejected on second scan), Profile QR (persistent, rotatable, universal path and spot-registration route), Registration view by actor (+12 more)

### Community 16 - "PRD Attendance & NFRs"
Cohesion: 0.11
Nodes (39): Student Life — Clubs, Events & Impact Measurement PRD (V2), §3.2 Success metrics, §5.12.2 On the day, §5.16.1 How the station works, §5.16.2 The student profile QR, §5.16.3 Per-event passes for pre-registered students, §5.16.4 When the scan does not work, §5.16.5 Spot registration (+31 more)

### Community 17 - "Test Factories"
Cohesion: 0.18
Nodes (8): budget(), club(), event(), member(), semester(), student(), user(), venue()

### Community 18 - "Web-app Approvals & Reporting"
Cohesion: 0.13
Nodes (34): approvalView(), allClashes(), applySanctions(), APPROVAL_CHAIN, assertBookable(), assertCanDecide(), audit(), BUFFER_MINUTES (+26 more)

### Community 19 - "Nil Budget Tests"
Cohesion: 0.12
Nodes (5): as_user(), token_for(), BudgetBuildingTests, NilBudgetTests, ReportAccessTests

### Community 20 - "Database Design Spec"
Cohesion: 0.10
Nodes (23): Celery background jobs, Database & Data Flow, Django ORM with migrations, Domain: Participation, DPDP alignment, EventPass, ExternalParticipant, Indexes that matter (+15 more)

### Community 21 - "PRD Fests & Templates"
Cohesion: 0.12
Nodes (35): Student Life — Clubs, Events & Impact Measurement PRD (V1), §5.11 Event Templates & Workflow Automation, §5.15.1 Fest as a parent record, §5.15.2 The fest page, §5.15.3 Fest organising team, §5.15.4 Fest budget, §5.15.5 External participants, §5.15 Fests — Multi-Event Umbrellas (+27 more)

### Community 22 - "Development Plan Phases"
Cohesion: 0.10
Nodes (27): OpenAPI generated from code (drf-spectacular), drf-spectacular, A0 Orchestrator / Architect, A1 Data & Migrations, A2 Backend — Clubs & Events, A3 Backend — Participation, A4 Backend — Budget & Approvals, A6 Frontend — Student & Organiser (+19 more)

### Community 23 - "QR Kit Token Core"
Cohesion: 0.11
Nodes (14): _b64d(), _b64e(), issue(), issue_certificate_token(), issue_event_pass(), issue_profile_token(), _secret(), TokenError (+6 more)

### Community 24 - "Design Data Model Tables"
Cohesion: 0.13
Nodes (26): ApprovalRequest, ApprovalStep, BudgetLine, BudgetTemplate, Domain: Events & fests, Domain: Evidence, Domain: Governance, Domain: Money (+18 more)

### Community 25 - "Reporting & Error Services"
Cohesion: 0.10
Nodes (8): _attended(), _capture_overview(), dean_overview(), _reportable_events(), semester_report(), DeanOverviewView, _semester(), SemesterReportView

### Community 26 - "PRD Operations Toolkit"
Cohesion: 0.12
Nodes (29): Student Life — Clubs, Events & Impact Measurement PRD (V3), §5.12.1 Before the event, §5.12.3 After the event, §5.17 Club Console — Live Attendance View, §5.19.4 Receipts, invoices and supporting documents, §6.2 Core metrics, Auto-drafted event report, Clone a past event (+21 more)

### Community 27 - "Reporting & Receipt Decisions"
Cohesion: 0.09
Nodes (13): Seeding & migration, Standard budget templates per event type, External participants stored separately, Fest parent record, Line-level budget sanctioning, O-11 Real event types and standard budget heads for the template library, Receipt attached per budget line, Semester report to management (+5 more)

### Community 28 - "Approval API Views"
Cohesion: 0.11
Nodes (9): ProblemDetail, Decision, ApprovalRequestSerializer, Meta, ApprovalStepSerializer, Meta, ApprovalViewSet, AuditView (+1 more)

### Community 29 - "API Standards Contract"
Cohesion: 0.10
Nodes (13): API Standards & Integration Contract, AuditSink interface, Breaking-change policy and v2 path, Error code registry, FileStore interface, IdentityProvider interface (Local / Platform), Integration checklist, NotificationSender interface (Local / Platform) (+5 more)

### Community 30 - "QR Kit Tokens (vendored)"
Cohesion: 0.12
Nodes (13): _b64d(), _b64e(), issue(), issue_certificate_token(), issue_event_pass(), issue_profile_token(), _secret(), TokenError (+5 more)

### Community 31 - "qrkit Tokens"
Cohesion: 0.12
Nodes (13): _b64d(), _b64e(), issue(), issue_certificate_token(), issue_event_pass(), issue_profile_token(), _secret(), TokenError (+5 more)

### Community 32 - "Web-app Role Constants"
Cohesion: 0.07
Nodes (24): ADMIN, BUDGET_PREPARERS, BUDGET_SETTLERS, BUDGET_VIEWERS, CLUB_CORE, CLUB_MEMBER, CLUB_PRESIDENT, CLUB_ROLE_LABELS (+16 more)

### Community 33 - "QR Rendering"
Cohesion: 0.11
Nodes (10): certificate_qr_data_uri(), event_pass_qr_data_uri(), make_qr_data_uri(), make_qr_png(), profile_qr_data_uri(), certificate_qr_data_uri(), event_pass_qr_data_uri(), make_qr_data_uri() (+2 more)

### Community 34 - "AGENT_PROMPT Approval Rules"
Cohesion: 0.11
Nodes (22): Known open questions (stop and ask), APPROVAL_CHAIN as data, not branching, Stated deviation — the Cultural Society gate, GOVERNANCE_WRONG_STAGE was unreachable, Three-gate approval chain (Society → Dean → VC), Budget entries freeze once an approver holds them (409 BUDGET_LOCKED), BUDGET_PREPARERS (President, VP, Treasurer), Cultural Society role (approval gate 1) (+14 more)

### Community 35 - "Approval Flow Tests"
Cohesion: 0.11
Nodes (3): ctx_for(), ApprovalFlowTests, MfaOnHighValueTests

### Community 36 - "Web-app Attendance Logic"
Cohesion: 0.20
Nodes (25): decorateEvent(), ACCEPTING, attendedCount(), cancelRegistration(), captureStats(), checkInManually(), duplicateOf(), isAccepting() (+17 more)

### Community 37 - "Web-app Budget Logic"
Cohesion: 0.16
Nodes (21): RFC-9457, addLine(), assertEditable(), canSettle(), clearNil(), CONTINGENCY_PERCENT, declareNil(), ensureBudget() (+13 more)

### Community 38 - "Web-app DB & Seed"
Cohesion: 0.18
Nodes (22): ensureSeeded(), officer(), reseed(), seedAll(), sessionFromStudent(), staffSession(), find(), load() (+14 more)

### Community 39 - "Web-app UI & Session"
Cohesion: 0.14
Nodes (20): store, clearPersona(), clubIdByName(), currentPersonaKey(), officerOf(), PERSONAS, resolvePersona(), studentWithNoClubRole() (+12 more)

### Community 40 - "Prototype Render & Budget"
Cohesion: 0.12
Nodes (24): Demo receipt PDF: Stage & decoration, Demo receipt PDF: Sound & lighting, afterRender (draw QR codes), canAssignRoles, document change handler, changeRole, clubRole, drawBudgetPreview (+16 more)

### Community 41 - "PRD Functional Requirements"
Cohesion: 0.14
Nodes (23): §5.12 Event Operations Toolkit, §5.13 Approval Configuration, §5.14 Social Media Post Tracking, §5.18 Member Roster & Role Assignment, §5.19.1 Approval stage tracker, §5.19.5 Ongoing visibility, §5.19 Budget Visibility for Office Bearers, §5.1 Club Directory & Profiles (+15 more)

### Community 42 - "E2E Test Harness"
Cohesion: 0.21
Nodes (16): reset(), sessionFor(), freeStudent(), liveEvent(), publishedEvent(), inDays(), newDraft(), AssertionError (+8 more)

### Community 43 - "Migrations"
Cohesion: 0.10
Nodes (10): Migration, Migration, Migration, Migration, Migration, Migration, Migration, Migration (+2 more)

### Community 44 - "Demo Shared Helpers"
Cohesion: 0.17
Nodes (18): allowedPages(), api(), chrome(), currentPersona(), dateBox(), dayNum(), esc(), isAllowed() (+10 more)

### Community 46 - "JWT Issuing & Refresh"
Cohesion: 0.16
Nodes (11): RefreshToken, Meta, access_token(), _base_claims(), hash_refresh(), issue_refresh(), revoke_all(), roles_for() (+3 more)

### Community 47 - "Identity Providers"
Cohesion: 0.14
Nodes (5): ClaimsAuthentication, _claims_from_payload(), InvalidCredential, LocalIdentityProvider, PlatformIdentityProvider

### Community 48 - "AGENT_PROMPT Fixed Decisions"
Cohesion: 0.12
Nodes (14): Check-in resolution — all seven branches, Fixed decisions — do not revisit, Notifications: in-app and email only, Attendance: the organiser scans the student, never the reverse, Persistent profile QR plus one-time event pass, Semester report aggregation queries, Social: link capture only, no platform API calls, StudentQRToken with versioned revocation (+6 more)

### Community 50 - "Smoke Import Checks"
Cohesion: 0.11
Nodes (15): checkImports(), checks, credsFile, EXPECTED, exportsOf, fail(), listed, moduleExports() (+7 more)

### Community 51 - "Web-app Credentials"
Cohesion: 0.17
Nodes (17): authFailed(), buildSession(), currentSession(), DEMO_ACCOUNTS, DEMO_MFA_CODE, demoAccountList(), derive(), enc (+9 more)

### Community 52 - "Reconciliation Record"
Cohesion: 0.15
Nodes (19): Nine-agent split (A0–A8) and owned directories, Only agent A1 writes models and migrations, Backend layout — config, common, integrations, identity, clubs, events, participation, qrkit, budget, governance, reporting, tests, EventPass as FK with a partial unique index, EventPass.key_id records the minting signing key, Gap — no /verify/{token} certificate portal, Pass token subject is the EventPass row id, PURPOSE_CERTIFICATE kept in the signing format (+11 more)

### Community 54 - "QR Kit Licensing"
Cohesion: 0.20
Nodes (12): Licensing guide for qr-attendance-kit source projects, ChargingTrex/Google-sheet-qr-attendance- (GPL-3.0), ChargingTrex/qr-certificate-verification-system (MIT, Arun Balaji S, SAIU FOSS 2026), LICENSING.md (verbatim duplicate of docs/LICENSING.md), NOTICE.md (attribution for derived work), QR Attendance & Certificate Kit README (self-hostable Django), certificates/ verification portal, README copy.md (verbatim duplicate of qr-attendance-kit README) (+4 more)

### Community 55 - "QR Kit Scan Outcomes"
Cohesion: 0.20
Nodes (3): ScanOutcome, ScanResult, ScanService

### Community 56 - "API Standards Conventions"
Cohesion: 0.12
Nodes (17): Agent Prompt (module), API-06 Rate limits per consumer, API Standards & Integration Contract, HTTP methods and status codes, Idempotency-Key header, Module team, Pagination, filtering, sorting, Platform Agent Prompt (+9 more)

### Community 57 - "Stack Decisions"
Cohesion: 0.12
Nodes (13): Django REST Framework, AGPL-3.0 licence, IIT Bombay DevCom repositories, Django admin, Django 5.x + Django REST Framework, Django ecosystem packages (allauth, otp, import-export, auditlog, tenants), FastAPI (rejected), instiapp-api (AGPL-3.0) (+5 more)

### Community 58 - "Platform Open Decisions"
Cohesion: 0.16
Nodes (17): §6 Open Platform Decisions (PO-01 to PO-09), PO-02 Self-hosted on campus, or managed cloud, PO-03 Open source licence: MIT throughout, or AGPL backend with MIT frontend, PO-04 Native mobile app in scope, or PWA only, PO-05 Attendance rules: minimum percentage, condonation policy, PO-06 Grading rules and result computation, PO-07 Fee structures, concessions, and payment gateway, PO-08 Does participation appear on any official student record (+9 more)

### Community 59 - "Web-app API Layer"
Cohesion: 0.13
Nodes (18): budget, budgetOr404(), budgetView(), clubs, commit(), directory, events, governance (+10 more)

### Community 60 - "DRF Permission Classes"
Cohesion: 0.11
Nodes (7): HasGlobalRole, IsApprover, IsDean, IsStudent, IsViceChancellor, MFAVerified, ReadOnly

### Community 61 - "Signed Token Design"
Cohesion: 0.16
Nodes (13): python-dotenv 1.0.1, Culturals Club & Events Prototype (single-file HTML app), attendedBy, b64d (URL-safe base64 decode), b64e (URL-safe base64 encode), cyrb53 (non-cryptographic hash), issueToken, issueTokenStable (+5 more)

### Community 62 - "QR Data URIs"
Cohesion: 0.15
Nodes (10): certificate_qr_data_uri(), event_pass_qr_data_uri(), make_qr_data_uri(), make_qr_png(), profile_qr_data_uri(), loaded, loadScript(), startCamera() (+2 more)

### Community 63 - "PRD Data Model Outline"
Cohesion: 0.22
Nodes (18): §7 Data Model (Outline), BudgetLine entity, Club entity, Event entity, EventPass entity, EventPhoto entity, EventReport entity, EventSocialPost entity (+10 more)

### Community 65 - "Platform Decision Log"
Cohesion: 0.15
Nodes (6): §5 Superseded decisions, Clubs & Events Decision Log, IIT Bombay DevCom reference model, Platform Decision Log, Student Management Portal (twelve modules), Risk: maintainer turnover as students graduate

### Community 66 - "Platform Shared Core"
Cohesion: 0.20
Nodes (16): Phase 0 shared core (nothing user-visible), PO-01 Which existing systems must be integrated — finance, LDAP/email, LMS, §4.1 Definition of Done — all modules, Append-only audit log on every consequential write, Checkpoint 0, File storage service (DB references, binaries in object storage), Generic approval engine reusable by every module, MFA for staff and administrative roles (+8 more)

### Community 67 - "Demo Capabilities & Nav"
Cohesion: 0.17
Nodes (11): Capability payload at GET /module/auth/me, clubs_door_staff capability field, Three guards on DEMO_MODE, Demo pages — one page per view, Role-scoped navigation, DOOR_STAFF excludes the Treasurer, Club Member role, Club Treasurer role (+3 more)

### Community 68 - "Platform Squads & Phases"
Cohesion: 0.17
Nodes (16): §2.1 App boundaries (backend/ layout), academics app, Bulk CSV import with validation, dry run and reconciliation report, campus app, Checkpoint 1, Clubs & Events Development Plan, clubs / events / participation / budget apps, core app (+8 more)

### Community 69 - "Notifications API"
Cohesion: 0.20
Nodes (5): Notification, Meta, NotificationSerializer, Meta, NotificationViewSet

### Community 70 - "Backend Dependencies"
Cohesion: 0.14
Nodes (11): Backend requirements.txt, celery 5.4.0, cryptography 44.0.0, Django>=5.2,<6.0, django-cors-headers 4.6.0, djangorestframework 3.15.2, djangorestframework-simplejwt 5.3.1, drf-spectacular 0.28.0 (+3 more)

### Community 71 - "Core Service Interfaces"
Cohesion: 0.15
Nodes (14): AuditSink interface (audit.py), POST /api/v1/core/audit, core_audit.yaml, POST /api/v1/core/files/upload-url and GET download-url, core_files.yaml, POST /api/v1/core/notifications, core_notifications.yaml, Core Service Interfaces (binding signatures) (+6 more)

### Community 72 - "PRD Risks & Privacy"
Cohesion: 0.15
Nodes (13): DPDP Act, Venue inventory, double-booking detection and institutional calendar (V1-V3 brief form), §10 Risks & Mitigations, §5.14.1 Capturing post links, §5.9.1 Venue inventory and booking, §5.9.2 Dean's venue overview, §5.9 Venue & Calendar Management, Configurable mandatory social post link before event completion (+5 more)

### Community 73 - "Web-app Package Manifest"
Cohesion: 0.13
Nodes (14): description, engines, node, license, name, private, scripts, browser (+6 more)

### Community 74 - "Web-app Token Signing"
Cohesion: 0.24
Nodes (14): b64d(), b64e(), enc, issue(), issueEventPass(), issueProfileToken(), PURPOSE_PASS, PURPOSE_PROFILE (+6 more)

### Community 76 - "Prototype Approvals & Report"
Cohesion: 0.22
Nodes (13): computeReport, decide (dean approve/return/reject), mkReg (create registration + pass token), openReview (dean review dialog), RECEIPT_THRESHOLD (5000), requiresVC, seed (demo data generator), total (sum budget lines by key) (+5 more)

### Community 77 - "Platform Squad Ownership"
Cohesion: 0.18
Nodes (13): §2 Squads & Ownership, §3 Phases & Checkpoints, Checkpoint 4, Dashboards per role (student, faculty, HOD, administration, management), Phase 4 — Campus Services, Reporting & Mobile, PWA with offline-tolerant key views, or native app if in scope, reporting app, S0 Orchestrator / Architect (+5 more)

### Community 78 - "Backend README"
Cohesion: 0.17
Nodes (9): Build Prompt — Clubs & Events Application, Definition of Done checklist, Scale target — 1,500 students today, 25,000+ without re-architecture, Backend overview — 6 apps, 47 API paths, 97 tests, Demo accounts and seeded personas, INTEGRATION_MODE identity adapter seam (local / platform), Environment issue — project directory name contains ':' and a trailing space, MFA requirement for staff roles and above-threshold sanctioning (+1 more)

### Community 79 - "Integrity Constraints Spec"
Cohesion: 0.15
Nodes (11): Data model essentials — 22 tables across six domains, Constraints that must exist in PostgreSQL, Venue reassignment must be atomic, SQLite fallback degrades the venue exclusion constraint, ExternalParticipant and Registration.external, User.objects.with_global_role() avoids a Postgres-only JSONField lookup, Atomic venue reassignment under a row lock, Comment required to return or reject (+3 more)

### Community 81 - "Prototype Event Handlers"
Cohesion: 0.27
Nodes (11): document click handler (data-* action router), doReassign, doScan, goOnline (replay offline queue), notify (in-app notification), openClose (close event dialog), setView, submitEvent (+3 more)

### Community 82 - "Platform Build Risks"
Cohesion: 0.22
Nodes (8): §1.1 Principles carried from the module build, §4.2 Definition of Done — statutory modules, §5 Risks and mitigations, Platform Build Plan & Agent Roles, Risk: faculty do not adopt attendance, Risk: legacy data migration corrupts records, Risk: squads produce code that does not integrate, Risk: statutory defect reaches production

### Community 83 - "PRD Reporting & Phasing"
Cohesion: 0.22
Nodes (13): §5.10 Event Photos & Media, §5.14.2 Tracking club social activity, §6.1 The semester report, §6.3 Dean of Student Life dashboard, §6.4 Management dashboard, §6 Semester Reporting — The Management View, §9 Delivery Phasing, Event report requires at least one photo (+5 more)

### Community 84 - "Seven-Branch Check-in Spec"
Cohesion: 0.18
Nodes (10): Distinct TokenInvalid / TokenExpired / TokenWrongPurpose exceptions, IsEventOrganiser checks the station token's scan_event, ScanResult at module level, plus ACCEPTING, Capture rate — two conflicting definitions under one name, Manual PRN/name fallback lookup by the organiser, Organiser role (scoped to one event, time-bound), Pass token names the EventPass row id, ScanRecord written on every branch including failures (+2 more)

### Community 85 - "File Store Adapters"
Cohesion: 0.17
Nodes (3): FileStore, LocalFileStore, PlatformFileStore

### Community 87 - "Scan Resolution Rationale"
Cohesion: 0.21
Nodes (9): psycopg[binary] 3.2.4 (PostgreSQL driver), dup (duplicate result builder), ok (accepted result builder), resolve (seven scan-resolution branches), resultLabel (scan result pills), scan (log every attempt), Scan result enum (accepted, spot_registered, duplicate, wrong_event, not_registered, unknown_code), Scan result enum (accepted, spot_registered, duplicate, wrong_event, not_registered, unknown_code, expired) (+1 more)

### Community 88 - "PRD Users & Roles"
Cohesion: 0.24
Nodes (12): Club Office Bearer, §4 Users & Roles, §5.19.2 What the three roles can do, Club Member, Club Office Bearer (other), Dean of Student Life, Event stage 2 Approval, Faculty Advisor (+4 more)

### Community 89 - "Problem Details Middleware"
Cohesion: 0.18
Nodes (5): _body(), _flatten_validation(), problem_detail_handler(), current_trace_id(), TraceIdMiddleware

### Community 90 - "Audit Sink Adapters"
Cohesion: 0.24
Nodes (4): AuditEntry, Meta, LocalAuditSink, PlatformAuditSink

### Community 95 - "Notification Adapters"
Cohesion: 0.20
Nodes (3): NotificationSender, LocalNotificationSender, PlatformNotificationSender

### Community 97 - "Clubs & People Domain"
Cohesion: 0.36
Nodes (7): Club, ClubSocialHandle, Domain: Clubs & people, Membership, OfficeBearerTerm, Student (portal core / SIS), backend/clubs

### Community 98 - "Platform Governance Rules"
Cohesion: 0.20
Nodes (4): Platform open questions (PO-01..PO-09), Squad and phase ownership map, API namespace map, Open questions by what they block

### Community 101 - "Prototype Venue Clashes"
Cohesion: 0.33
Nodes (8): allClashes, BUFFER_MIN (30 min setup/clear buffer), clashesFor, LIVEISH statuses (submitted/approved/published/live), openReassign, overlaps (same venue/date, buffered time overlap), vOverview (dean semester overview), vVenues (venue calendar)

### Community 102 - "Dean Venue Oversight"
Cohesion: 0.33
Nodes (3): Master venue calendar, Venue reassignment by Dean, Dean operational dashboard (pending approvals with age, venue conflicts, dormant clubs, missing photos/reports/settlement, semester totals, budget utilisation)

### Community 103 - "Fees & Finance Squad"
Cohesion: 0.25
Nodes (7): Checkpoint 3, Failed and duplicate payment handling, fees app, Mark correction with dual authorisation and full audit, Reconciliation report against the existing finance system, Risk: scope creep into LMS or ERP, S5 Fees & Finance

### Community 104 - "PRD Open Questions"
Cohesion: 0.22
Nodes (6): §11 Open Questions, §5.9.3 Reassigning a clashing event, NFR Communication channels in-app and email only, Open question: budget amount triggering escalation to Dean, Open question: existing approval chain — faculty advisors, Dean, or both, Open question: when two events want the same venue, what decides which yields

### Community 105 - "PRD Overview & References"
Cohesion: 0.28
Nodes (8): §12 Reference, §1 Overview, §2 Problem Statement, §3.1 Goals, Django + DRF backend, React frontend, InstiApp (IIT Bombay DevCom) / instiapp-api, Student Life — Clubs, Events & Impact Measurement PRD (V4), Student Management Portal PRD (§4.9, §6, §11)

### Community 106 - "PRD Event Lifecycle"
Cohesion: 0.25
Nodes (8): §5.4 Event Lifecycle, §5.6 Registration & Attendance, Event stage 1 Proposal, Event stage 3 Venue & resources, Event stage 4 Publication, Event stage 5 Registration, Event stage 6 Attendance, Risk: attendance data incomplete, undermining every metric

### Community 109 - "VC Privacy Boundary"
Cohesion: 0.29
Nodes (7): Budget lifecycle (template → request → sanction → settle), Roles and what each can do, can_see_all_clubs() predicate, can_see_individual_records() predicate, Master Specification (consolidated roles, access, approvals), Resolved defect — the VC could read rosters, attendee lists, PRN lookup and the door, Vice-Chancellor / Management role (dashboard only)

### Community 110 - "Settlement Gates & Receipts"
Cohesion: 0.29
Nodes (7): Content-addressed receipt fixture (1-byte placeholder), Demo receipt for Refreshments (content-addressed fixture), BUDGET_SETTLERS (President, VP, Treasurer), Receipts attach per budget line, never bundled, Settlement gates and the fixed sanction→run→settle sequence, settlement_waiting_on / settlement_hint, Vice-President role

### Community 112 - "JWT Claim Contract"
Cohesion: 0.29
Nodes (7): API-02 Platform base URL / single domain (CORS, cookie scope, JWKS), auth_claims.yaml, Authentication & Authorisation Contract, Bearer JWT token contract (RS256, JWKS), Required JWT claims (sub, iss, aud, exp, iat, email, student_id, prn, roles, department, programme, year), Role naming (<role>, <role>:<scope_uuid>, module_<role>), django-allauth with SimpleJWT

### Community 113 - "API Namespaces & Errors"
Cohesion: 0.29
Nodes (8): Base paths and namespacing (/api/v1/...), Error code registry, Integration checklist, Module namespaces (clubs, events, participation, budget, fests), Reserved platform namespaces (core, sis, academics, attendance, exams, fees, campus, requests, admin, auth), RFC 9457 Problem Details, Error format (RFC 9457 problem details), trace_id cross-system correlation

### Community 114 - "Privacy & Retention Rules"
Cohesion: 0.25
Nodes (7): Gap — annual handover / OfficeBearerTerm not built, AuditEntry — append-only, no API path updates or deletes it, Club lifecycle and annual handover, DPDP alignment (purpose limitation, notice, minimisation), Identifier discipline (user_id vs PRN vs email), The live attendance view — the most privacy-exposed surface, Retention policy per data category

### Community 120 - "Identity Adapter Principle"
Cohesion: 0.29
Nodes (5): API-03 Which identity provider backs platform SSO, IdentityProvider interface (identity.py), LocalIdentityProvider — own user table, own login, PlatformIdentityProvider — validates platform JWT, Standalone mode vs Platform mode concerns

### Community 121 - "PRN & Shared Reference Data"
Cohesion: 0.29
Nodes (6): API-01 Is PRN the canonical, immutable cross-system identifier, API-04 Shared department and programme code list, API-05 Semester and academic calendar as a platform service, AcademicCalendar / Semester (portal core), Department / Programme (portal core), Registrar

### Community 126 - "SIS Students Contract"
Cohesion: 0.40
Nodes (5): LocalStudentDirectory — CSV-imported student list, PlatformStudentDirectory — reads platform SIS, GET /api/v1/sis/students (single, by prn, batch max 200), sis_students.yaml, StudentDirectory interface (directory.py)

## Ambiguous Edges - Review These
- `Decision Log — Decisions & Rationale` → `Event Flows — Clubs & Events Application (V2)`  [AMBIGUOUS]
  graphify-out/converted/Decision_Log_3373b55c.md · relation: references
- `D-19 Dean owns venue oversight and reassignment` → `V2 revision omits Dean venue oversight section (10.3) and the venue precedence open point`  [AMBIGUOUS]
  graphify-out/converted/Event_Flows_Clubs_Events_V2_556cdb7c.md · relation: references
- `Superseded: Faculty advisor approval step` → `Event stage 2 Approval`  [AMBIGUOUS]
  graphify-out/converted/Student_Life_Clubs_Events_PRD_V4_6d70ab4d.md · relation: conceptually_related_to
- `Minor Approval Request Form (project paperwork PDF)` → `Three-gate approval chain (Society → Dean → VC)`  [AMBIGUOUS]
  Minor_Approval_Request_Form (3).pdf · relation: conceptually_related_to

## Knowledge Gaps
- **104 isolated node(s):** `RFC-9457`, `Culturals Club & Events Prototype (single-file HTML app)`, `b64e (URL-safe base64 encode)`, `b64d (URL-safe base64 decode)`, `load (localStorage read)` (+99 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 784 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `make_qr_png()` connect `QR Rendering` to `QR Data URIs`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Student Life — Clubs, Events & Impact Measurement PRD (V2)` (e.g. with `Student Life — Clubs, Events & Impact Measurement PRD (V1)` and `Student Life — Clubs, Events & Impact Measurement PRD (V3)`) actually correct?**
  _`Student Life — Clubs, Events & Impact Measurement PRD (V2)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-9457`, `Culturals Club & Events Prototype (single-file HTML app)`, `b64e (URL-safe base64 encode)` to the rest of the system?**
  _104 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Event Views & Models` be split into smaller, more focused modules?**
  _Cohesion score 0.048426812585499315 - nodes in this community are weakly interconnected._
- **Why does `EventStatus` connect `Event Views & Models` to `Budget API Views`, `Scan Tests & Fixtures`, `Participation Views & Adapters`, `Seed, Factories & Role Tests`, `Identity Models`, `Governance Services & Tests`, `Participation Models & Resolver`, `Budget Services`, `Test Factories`, `Nil Budget Tests`, `Reporting & Error Services`, `Approval Flow Tests`, `VC Privacy Tests`, `Venue Reassignment Tests`, `Treasurer Permission Tests`, `Budget Visibility Tests`, `Settlement Sequence Tests`, `Clash Detection Tests`, `Settlement Tests`, `Unique vs Total Tests`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Decision Log — Decisions & Rationale` and `Event Flows — Clubs & Events Application (V2)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `D-19 Dean owns venue oversight and reassignment` and `V2 revision omits Dean venue oversight section (10.3) and the venue precedence open point`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._