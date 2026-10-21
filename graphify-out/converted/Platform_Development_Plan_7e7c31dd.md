<!-- converted from Platform_Development_Plan.docx -->

DEVELOPMENT PLAN
Platform Build Plan & Agent Roles
Student Management Portal
Phases, checkpoints, checklists, and how work is split across agents
Version 1.0  ·  Draft

# Table of Contents



# 1. How This Build Is Organised
Twelve modules built by squads over five phases. Work is split by module boundary, with a platform team owning everything shared. Each phase ends at a checkpoint that must be demonstrated, not self-reported.
## 1.1 Principles carried from the module build
- Shared core first. Phase 0 delivers nothing user-visible and must not be compressed. Every module inherits its defects.
- One schema owner. A single agent writes models and migrations across the whole project. Twelve squads generating migrations independently is unrecoverable.
- Contracts before implementation. OpenAPI published before frontend work begins, so frontend squads are never blocked on a running backend.
- Module boundaries are real. Apps talk through service interfaces, never by importing each other's models. This is what keeps a modular monolith modular.
The difference from the Clubs & Events build: this system holds marks, fees and statutory records. A defect in the attendance or examination module is not an inconvenience — it affects a student's record. Statutory modules carry a second reviewer and a reconciliation step in their definition of done.
# 2. Squads & Ownership
| Squad | Role | Owns |
| --- | --- | --- |
| S0 | Orchestrator / Architect | Contracts, reviews, merges, decision logs, cross-module arbitration |
| S1 | Data & Migrations | Every models.py and migration across all apps; seed fixtures; constraints and indexes |
| S2 | Core Platform | Identity, SSO, RBAC, notifications, audit, file storage, approval engine |
| S3 | SIS & Academics | Student records, enrolment, programmes, courses, timetable |
| S4 | Attendance & Examinations | Session attendance, shortfall rules, marks entry, results, transcripts |
| S5 | Fees & Finance | Fee structures, invoices, payments, reconciliation, finance-system integration |
| S6 | Campus Services | Hostel, mess, requests and approvals workflow engine |
| S7 | Campus Life | Clubs & Events module — separately specified |
| S8 | Reporting & Analytics | Dashboards per role, exports, scheduled reports |
| S9 | Frontend — Student & Parent | Student app, parent portal, mobile/PWA shell |
| S10 | Frontend — Faculty & Staff | Faculty console, admin screens, Django admin configuration |
| S11 | QA & Integrity | Test suites, fixtures, integrity and permission testing, CI gates |
| S12 | DevOps | Environments, CI/CD, backups, monitoring, migration tooling |
## 2.1 App boundaries
backend/
core/           identity, RBAC, notifications, audit, files   [S2]
sis/            Student, Enrolment, Programme                 [S3]
academics/      Course, Section, Timetable                    [S3]
attendance/     Session, AttendanceRecord, shortfall rules    [S4]
exams/          Assessment, Mark, Result, Transcript          [S4]
fees/           FeeStructure, Invoice, Payment                [S5]
campus/         Hostel, Mess, Room, Complaint                 [S6]
requests/       generic request + approval workflow engine    [S6]
clubs/ events/ participation/ budget/  (Clubs & Events)       [S7]
reporting/      aggregation, dashboards, exports              [S8]

All models.py and migrations/  →  owned by S1, no exceptions

# 3. Phases & Checkpoints
| Phase | Delivers | Checkpoint gate |
| --- | --- | --- |
| P0 | Shared core: identity, RBAC, notifications, audit, CI, schema | A user logs in; a role restriction fails correctly at the API |
| P1 | SIS, academics, Clubs & Events | A student intake is imported; an event runs end to end |
| P2 | Attendance, announcements, timetable | A term of attendance is marked and shortfall reports generate |
| P3 | Examinations, fees, requests | A result publishes; a fee is paid and reconciles |
| P4 | Hostel & mess, reporting depth, mobile | Room allocation runs; dashboards serve all roles |
## 3.1 Phase 0 — Shared Core
Goal: the foundation every module depends on. Nothing user-visible ships. Compressing this phase is the most expensive mistake available in this programme.
### S1 — Data
☐  Core schema: users, roles, permissions, audit, notification, file reference
☐  SIS skeleton: student, programme, enrolment, department, semester
☐  UUID keys, timestamps, money as NUMERIC(12,2), enums with CHECK constraints
☐  Seed fixtures covering every role and a representative student cohort
### S2 — Core Platform
☐  SSO against college email or LDAP, with local fallback
☐  RBAC: role assignment, per-module permissions, object-level scoping
☐  MFA for staff and administrative roles
☐  Notification service — in-app and email only, no other channel implemented
☐  Audit log written on every consequential write, append-only
☐  Generic approval engine reusable by every module
☐  File storage service with references in the database, binaries in object storage
### S12 — DevOps
☐  Environments: local, staging, production
☐  CI runs migrations, tests, lint on every push
☐  Automated backups with a restore actually tested, not merely configured
☐  Monitoring, centralised logs, error tracking
### Checkpoint 0
| Demonstrate | Passes when |
| --- | --- |
| Fresh migrate | Empty database to full schema, zero manual steps |
| SSO login | A user authenticates through the institutional provider |
| Permission denial | A wrong-role token is refused at the API, not merely hidden in the UI |
| Notification | A test notification arrives in-app and by email, and by no other channel |
| Restore | A backup is restored into a clean environment and the system runs |
The restore test is not optional. A backup that has never been restored is a hypothesis. This system will hold examination and fee records; discovering the backup was unusable at the moment it is needed is unrecoverable.
## 3.2 Phase 1 — SIS, Academics & Clubs
### S3 — SIS & Academics
☐  Student profile: personal details, admission data, documents, photo
☐  Bulk CSV import with validation, dry run and reconciliation report
☐  Enrolment: batch, section, programme assignment
☐  Programmes, courses, credit structure, academic calendar
☐  Faculty-course-section mapping
☐  Timetable generation and per-user timetable view
### S7 — Clubs & Events
☐  Delivered per the Clubs & Events Development Plan, phases P0 to P2
### Checkpoint 1
| Demonstrate | Passes when |
| --- | --- |
| Intake import | A full batch imports from CSV with a reconciliation report and zero silent failures |
| Timetable | A student and a faculty member each see their correct timetable |
| Event end to end | A club event is proposed, approved, attended and reported |
## 3.3 Phase 2 — Attendance & Communications
### S4 — Attendance
☐  Session-based marking, bulk and quick-mark modes, mobile-first
☐  Configurable rules: minimum percentage, condonation
☐  Student and parent attendance views with shortfall alerts
☐  Automated defaulter reports per section and department
☐  Correction procedure with audit trail — attendance is contestable and must be amendable with a record
### S2 — Communications
☐  Announcements targeted by role, department, batch
☐  Scheduling and read receipts
### Checkpoint 2
| Demonstrate | Passes when |
| --- | --- |
| Faculty marking | A full section marked on a phone in under a minute |
| Shortfall | A student below the threshold is correctly flagged to student and parent |
| Correction | A wrongly marked session is amended and the change is auditable |
## 3.4 Phase 3 — Examinations, Fees & Requests
The statutory phase. Everything here affects a student's record or the institution's money. Second reviewer mandatory on every change; reconciliation in the definition of done; no destructive migrations.
### S4 — Examinations
☐  Internal and continuous assessment entry by faculty
☐  Grade computation per the institution's documented rules
☐  Controlled result publication windows
☐  Marksheet and transcript PDF generation
☐  Revaluation request workflow
☐  Mark correction procedure with dual authorisation and full audit
### S5 — Fees
☐  Fee structures per programme and term; concessions and scholarships
☐  Invoice generation, dues tracking, partial payments
☐  Payment gateway integration with receipts and payment history
☐  Reconciliation report against the existing finance system
☐  Failed and duplicate payment handling — the most common real-world failure
### S6 — Requests
☐  Generic request engine: bonafide, leave, no-dues, corrections
☐  Multi-level approval chains with SLA tracking
### Checkpoint 3
| Demonstrate | Passes when |
| --- | --- |
| Result publication | Marks entered, computed, published in a controlled window, transcript generated |
| Payment | A fee is paid, receipted, and reconciles against the finance system |
| Duplicate payment | A duplicate is detected and handled without manual intervention |
| Mark correction | A correction requires two authorisations and is fully auditable |
## 3.5 Phase 4 — Campus Services, Reporting & Mobile
### S6 — Hostel & Mess
☐  Room allocation, occupancy, check-in and check-out
☐  Mess registration, menu, feedback
☐  Leave and outpass requests with approvals
☐  Complaint and maintenance ticketing
### S8 — Reporting
☐  Dashboards per role: student, faculty, HOD, administration, management
☐  Scheduled report delivery
☐  Exports across attendance, results, fees, occupancy
### S9 — Mobile
☐  PWA with offline-tolerant key views, or native app if in scope
### Checkpoint 4
| Demonstrate | Passes when |
| --- | --- |
| Allocation | A hostel block is allocated and occupancy is accurate |
| Dashboards | Every role sees a dashboard answering their primary question |
| Mobile | A student completes registration, timetable and attendance checks on a phone |
# 4. Definition of Done
## 4.1 All modules
☐  Merged, CI green, tests written by the implementing squad
☐  Permissions enforced server-side and proven with a wrong-role token test
☐  OpenAPI regenerated where the contract changed
☐  Notifications only in-app and email
☐  Audit entry on every consequential write
☐  No personal data exposed beyond the role's defined scope
☐  Decision log updated if a decision changed
## 4.2 Additional, for statutory modules (attendance, examinations, fees)
☐  Second reviewer sign-off recorded
☐  Reconciliation report produced and checked
☐  Correction procedure documented and tested
☐  No destructive migration; rollback tested on a production-shaped dataset
# 5. Risks
| Risk | Mitigation |
| --- | --- |
| Scope creep into LMS or ERP | P-04 holds the boundary; requests go to the sponsor, not a developer |
| Legacy data migration corrupts records | Staged import, dry runs, reconciliation reports, no unvalidated bulk load |
| Faculty do not adopt attendance | Mobile-first marking, minimum taps, phased rollout, measure marking rate as a metric |
| Statutory defect reaches production | Second reviewer, reconciliation, dual authorisation on corrections |
| Integration unknowns stall Phase 0 | Resolve PO-01 before Phase 0 identity work begins |
| Squads produce code that does not integrate | Contract-first APIs, cross-boundary integration tests from P0 |
| Maintainer turnover as students graduate | Documentation, code review, contributor guide, readable code — the DevCom model |
# 6. Open Items Blocking Work
| Ref | Question | Needed by |
| --- | --- | --- |
| PO-01 | Which systems must be integrated (finance, LDAP/email, LMS) | P0 — critical path |
| PO-02 | Self-hosted or managed cloud | P0 |
| PO-03 | Open source licence | P0, repository setup |
| PO-05 | Attendance rules: minimum percentage, condonation | P2 |
| PO-06 | Grading rules and result computation | P3 |
| PO-07 | Fee structures, concessions, gateway choice | P3 |
| PO-09 | Parent access scope and consent mechanism | P2 |
| PO-04 | Native mobile app or PWA only | P4, but affects frontend architecture in P0 |
Two are needed before anything starts: PO-01 and PO-02. Identity work in Phase 0 is built against whichever directory the institution already runs, and infrastructure choices shape deployment from the first commit. Both are answerable now and expensive to change later.