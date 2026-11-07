<!-- converted from Platform_Decision_Log.docx -->

DECISION LOG
Platform Decisions & Rationale
Student Management Portal
Institution-wide decisions governing all modules
Version 1.0  ·  Living document

# Table of Contents



# 1. Scope of This Log
This log records decisions that apply to the whole Student Management Portal — architecture, scope boundaries, data handling and sequencing across all twelve modules. Decisions specific to one module live in that module's own log.
| Log | Covers |
| --- | --- |
| Platform Decision Log (this document) | Stack, architecture, scope boundaries, integration policy, privacy, module sequencing |
| Clubs & Events Decision Log | Decisions internal to the Clubs & Events module: attendance capture, budget templates, fest handling, venue oversight |
Where they overlap: stack and licensing decisions were first taken for the Clubs & Events module and are restated here as platform-wide, because every later module inherits them. Where a decision appears in both, this log is the parent.
## 1.1 Index
| ID | Decision | Status |
| --- | --- | --- |
| P-01 | Django + DRF backend, React + TypeScript frontend, PostgreSQL | Decided |
| P-02 | Shared-core architecture: one identity, one API surface | Decided |
| P-03 | Modular monolith, not microservices | Decided |
| P-04 | Scope boundaries: no LMS, no ERP/finance replacement, no HR/payroll | Decided |
| P-05 | Integrate with existing systems rather than replace them | Decided |
| P-06 | Clubs & Events built first | Decided |
| P-07 | Module sequencing after the first | Decided |
| P-08 | Notification channels: in-app and email only | Decided |
| P-09 | Open source release | Decided; licence open |
| P-10 | IIT Bombay DevCom as architectural reference | Decided |
| P-11 | Scale target 25,000+ without re-architecture | Decided |
| P-12 | Statutory data (marks, fees) held to a higher bar than other modules | Decided |
| P-13 | DPDP alignment from the start, not retrofitted | Decided |
| P-14 | Legacy data migrated in stages, never bulk-loaded unvalidated | Decided |

# 2. Architecture Decisions
## P-01 — Stack
| Decision | Django 5.x with DRF on PostgreSQL; React 18 with TypeScript on the frontend; Celery with Redis for asynchronous work; S3-compatible object storage. |
| --- | --- |
| Why | Django's plug-and-play ecosystem maps directly onto portal requirements — admin console, RBAC, bulk import, audit logging, multi-tenancy — replacing weeks of custom work per module. React is required for a role-rich, student-facing product with a future mobile app. |
| Rejected | FastAPI (no admin console, every back-office screen becomes custom React). Django templates or Streamlit for the frontend (internal-dashboard tools, not a product at scale). |
| Inherits to | Every module. Not revisited per module. |
## P-02 — Shared-core architecture
| Decision | Identity, user directory, roles, notifications and audit are single services every module consumes. No module implements its own login, messaging or permission system. |
| --- | --- |
| Why | The central lesson from the DevCom reference model: siloed applications with separate logins are what makes a university's software unmaintainable. One identity and one authenticated API surface is what lets twelve modules behave as one product. |
| Consequence | The shared core must be built and stable before any module depends on it, which is why Phase 0 delivers nothing user-visible. |
## P-03 — Modular monolith, not microservices
| Decision | One Django project with strongly bounded apps per module, deployed as a single application. Not separate services. |
| --- | --- |
| Why | At 1,500 students growing to 25,000, a monolith scales horizontally by adding instances. Microservices would add deployment, network and consistency overhead that the load does not justify, and would be far harder for student contributors to run locally. |
| Boundaries still matter | Apps communicate through defined service interfaces, not by reaching into each other's models. If a module ever needs extraction, clean boundaries make it possible. |
| Revisit if | A single module develops load characteristics genuinely incompatible with the rest. |
# 3. Scope Decisions
## P-04 — What the portal is not
| Decision | Out of scope: full accounting or ERP replacement, learning management (content delivery, quizzes, grading rubrics), and HR or payroll for staff. |
| --- | --- |
| Why | Each is a mature product category in its own right. Building any of them would consume the programme and deliver worse software than what already exists. |
| Consequence | Where these functions are needed, the portal integrates. See P-05. |
| Guard | Scope creep into LMS or ERP territory is the most likely way this programme fails. Any request in that direction goes to the sponsor, not to a developer. |
## P-05 — Integrate, do not replace
| Decision | Existing finance systems, email or LDAP directories, and any LMS in use are integrated with rather than replaced. |
| --- | --- |
| Why | Replacing a working finance system to gain portal consistency trades a real risk for a cosmetic benefit. Integration keeps the system of record where it already is. |
| Applies to | Fee reconciliation (portal collects, finance system remains authoritative for accounts), identity (college email or LDAP as an SSO provider), and course content if an LMS exists. |
| Still open | Which systems exist today and which must be integrated. This is the single biggest unknown in the programme. |
## P-06 — Clubs & Events built first
| Decision | The Clubs & Events module is the first built, ahead of SIS, attendance, examinations and fees. |
| --- | --- |
| Why | Lowest institutional risk — it touches no marks, fees or statutory records, so an early mistake is recoverable. High student visibility, building goodwill for harder modules. It exercises the entire shared core (login, roles, approvals, notifications, reporting) so the foundation is proven before anything consequential depends on it. |
| Rejected | Starting with attendance or examinations, where an early defect has real consequences for students and no goodwill has been banked. |
## P-07 — Module sequencing
| Decision | Phase 1 — Clubs & Events, plus SIS and academics as the records everything else references. Phase 2 — attendance and announcements. Phase 3 — examinations, fees, requests and approvals. Phase 4 — hostel and mess, reporting depth, mobile. Phase 5 — integrations and open-source contributor onboarding. |
| --- | --- |
| Why | Records before the things that reference them; low-stakes before statutory; internal before parent- and management-facing. |
| Note | SIS is unavoidably early because attendance, examinations and fees all reference student and enrolment records. |
# 4. Data & Compliance Decisions
## P-12 — Statutory data held to a higher bar
| Decision | Marks, examination results and fee records carry stricter requirements than other modules: no destructive migrations, mandatory reconciliation reports, full audit trail on every write, and a documented correction procedure. |
| --- | --- |
| Why | A wrong club attendance figure is an embarrassment. A wrong mark or a lost fee payment affects a student's record and the institution's finances. The same engineering standard for both would be either wasteful or dangerous. |
| Practical effect | These modules require a second reviewer on every change, and a reconciliation step in their definition of done. |
## P-13 — DPDP alignment from the start
| Decision | Purpose limitation, data minimisation, stated retention per category, consent where required, and role-scoped access are designed in from Phase 0 rather than retrofitted. |
| --- | --- |
| Why | Retrofitting privacy into a system holding fifteen thousand students' academic, financial and health-adjacent records is far more expensive than building it in, and may be impossible without migration. |
| Specifics | Parent access requires consent and is scoped to their own ward. External participants in fests are purged on schedule. Participation data is never used for academic assessment. |
## P-14 — Staged legacy migration
| Decision | Existing data from spreadsheets and legacy systems is migrated in validated stages with dry runs and reconciliation reports. Nothing is bulk-loaded without validation. |
| --- | --- |
| Why | Legacy spreadsheet data is reliably inconsistent — duplicate students, missing identifiers, contradictory records. Loading it unvalidated makes the new system inherit and legitimise those errors. |
| Rule | Historical activity data (past events, past attendance) is not reconstructed at all. Reporting begins from live data, and the first period is explicitly caveated. |
# 5. Superseded
| Was | Now | Why |
| --- | --- | --- |
| Backend on FastAPI | Django + DRF (P-01) | Admin console and package ecosystem outweighed async and auto-docs advantages |
| Faculty advisor approval step | Dean only for standard requests | Confirmed against actual institutional practice |
| SMS for critical alerts | In-app and email only (P-08) | Per-message cost, DLT compliance overhead, vendor dependency |
| Accreditation reporting in scope | Semester reporting only | Not the stated management need |
# 6. Open Platform Decisions
| Ref | Question | Blocks | Owner |
| --- | --- | --- | --- |
| PO-01 | Which existing systems must be integrated — finance, LDAP/email, LMS | Integration design; affects P0 | Sponsor + IT |
| PO-02 | Self-hosted on campus, or managed cloud | Infrastructure setup | IT |
| PO-03 | Open source licence: MIT throughout, or AGPL backend with MIT frontend | Repository setup | Sponsor |
| PO-04 | Native mobile app in scope, or PWA only | Frontend architecture | Sponsor |
| PO-05 | Attendance rules: minimum percentage, condonation policy | Attendance module | Registrar |
| PO-06 | Grading rules and result computation | Examinations module | Registrar |
| PO-07 | Fee structures, concessions, and payment gateway | Fees module | Finance |
| PO-08 | Does participation appear on any official student record | SIS and reporting | Registrar |
| PO-09 | Parent access: what is visible, and consent mechanism | Parent portal | Dean + legal |
PO-01 is the critical path. Until it is known which systems exist and must be integrated, the fees and identity modules cannot be designed, and Phase 0 identity work risks being built against the wrong assumption. It is worth answering before anything else on this list.