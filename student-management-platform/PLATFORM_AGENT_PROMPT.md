# Build Prompt — Student Management Portal (Platform)

Paste the whole of this file into the agent. Fill in `ASSIGNED_SQUAD` and `CURRENT_PHASE` at the bottom before sending.

For work inside the Clubs & Events module specifically, use `../clubs-and-culturals-platform/AGENT_PROMPT.md` (the module prompt) instead — it carries detail this one does not.

---

## 1. What you are building

A student management portal for a college of ~1,500 students, designed to scale past 25,000 without re-architecture. Twelve modules on one shared core: identity, student records, academics, attendance, examinations, fees, hostel and mess, communications, campus life, requests and approvals, reporting, and administration.

**The problem it solves:** college operations run on spreadsheets, notice boards, WhatsApp and paper forms. Students have no single place to see their attendance, marks, fees or timetable. Faculty re-enter the same data in several places. Administration has no consolidated view. As enrolment grows, this fragmentation compounds into lost data and manual reconciliation.

**The architectural idea that matters:** one connected ecosystem, not twelve applications. Shared authentication, one API surface, shared notifications and audit. Siloed apps with separate logins is precisely what makes university software unmaintainable.

---

## 2. Fixed decisions — do not revisit

| Area | Decision |
|---|---|
| Backend | Python 3.12+, Django 5.x, Django REST Framework |
| Database | PostgreSQL, Django ORM + migrations |
| Frontend | React 18 + TypeScript + Vite + Tailwind + TanStack Query |
| Async | Celery + Redis |
| Files | S3-compatible object store — DB holds references only |
| Auth | SSO against college email/LDAP; django-allauth + SimpleJWT; MFA for staff |
| Architecture | **Modular monolith.** One Django project, strongly bounded apps. Not microservices. |
| Core services | Identity, RBAC, notifications, audit, approvals are **shared services**. No module builds its own. |
| Notifications | **In-app and email ONLY.** No SMS, no WhatsApp, no third-party messaging. |
| Out of scope | **No LMS. No ERP/accounting replacement. No HR/payroll.** Integrate, do not replace. |
| First module | Clubs & Events — lowest risk, exercises the whole core |
| Licensing | Open source release; specific licence still open |

If a requirement conflicts with one of these, stop and ask. Do not resolve it yourself.

---

## 3. Non-negotiable rules

1. **Only squad S1 writes models and migrations** — across the entire project, all apps. If you need a field, raise a schema request to S0 stating field, type, nullability and why. Never run `makemigrations` unless you are S1.
2. **Permissions are enforced server-side.** Hiding a button is not a permission. Every restriction must fail at the API when called with a wrong-role token.
3. **Integrity constraints live in the database.** Application checks fail under concurrency; constraints do not.
4. **Modules talk through service interfaces, never by importing another module's models.** This is what keeps a modular monolith modular and makes future extraction possible.
5. **Stay inside your owned app.** Changes elsewhere go through S0.
6. **Write the test with the code.** A restriction without a test proving it fails for the wrong role is not done.
7. **Never build a second notification channel, login, or permission system.** Use the core services.

---

## 4. Statutory modules carry a higher bar

**Attendance, examinations and fees** affect a student's record or the institution's money. A defect there is not an inconvenience.

If you are working on these modules, the definition of done additionally requires:

- [ ] Second reviewer sign-off recorded
- [ ] Reconciliation report produced and checked
- [ ] Correction procedure documented and tested — marks and attendance are contestable and must be amendable **with an audit trail**
- [ ] No destructive migration; rollback tested against a production-shaped dataset
- [ ] Dual authorisation on any correction to a published mark

**Fees specifically:** duplicate and failed payments are the most common real-world failure. Handle them explicitly rather than assuming the gateway behaves.

---

## 5. Data conventions

UUID primary keys · `created_at`/`updated_at` everywhere · money as `NUMERIC(12,2)`, never float · enums as text with CHECK constraints · UTC storage, IST display · soft-delete via status for anything carrying history.

**Legacy migration rule:** nothing is bulk-loaded without validation. Staged imports with dry runs and reconciliation reports. Historical activity data (past events, past attendance) is **not reconstructed at all** — reporting begins from live data, and the first period is explicitly caveated in any report.

---

## 6. Roles across the platform

| Role | Scope |
|---|---|
| Student | Own records only |
| Parent / Guardian | Read-only, their own ward only, consent required |
| Faculty | Write for assigned courses and sections; read their class data |
| HOD / Dept Admin | Read/write within department; approvals |
| Registrar / Administration | Students, courses, fees, calendar |
| Hostel / Mess Warden | Hostel and mess modules |
| Dean of Student Affairs | Approves club events and budgets; campus life oversight |
| Vice-Chancellor / Management | Aggregates and above-threshold approvals. No individual student records. |
| Super Admin / IT | Configuration, roles, integrations, audit |

Object-level scoping matters as much as role: a faculty member has write access to **their own sections**, not to the attendance table.

---

## 7. Definition of Done — all modules

- [ ] Merged to main, CI green
- [ ] Tests written by you, reviewed by S11
- [ ] Permissions enforced server-side, proven with a wrong-role token test
- [ ] OpenAPI regenerated if the contract changed
- [ ] Notifications only in-app and email
- [ ] Audit entry on every consequential write
- [ ] No personal data exposed beyond the role's defined scope
- [ ] Module boundaries respected — no cross-module model imports
- [ ] Decision log updated if a decision changed

---

## 8. How to work

1. **Read before writing.** Confirm the relevant section of the Portal PRD and Platform Decision Log before implementing.
2. **State your plan first** — files, endpoints, tests. Wait for confirmation on anything crossing a module boundary.
3. **Small commits**, each independently reviewable.
4. **Flag, don't guess.** Ambiguity in a statutory module is especially dangerous — a guessed grading rule produces confidently wrong transcripts. Stop and ask.
5. **Report against your phase checklist**, not in prose.

---

## 9. Known open questions

Genuinely unresolved. If your work depends on one, **stop and ask** — do not assume a value.

- **PO-01 — Which existing systems must be integrated** (finance, LDAP/email, LMS). *Critical path; blocks Phase 0 identity work.*
- **PO-02 — Self-hosted on campus or managed cloud.** *Blocks infrastructure.*
- PO-03 — Open source licence: MIT throughout, or AGPL backend with MIT frontend
- PO-04 — Native mobile app, or PWA only
- PO-05 — Attendance rules: minimum percentage, condonation policy
- PO-06 — Grading rules and result computation
- PO-07 — Fee structures, concessions, payment gateway choice
- PO-08 — Does club participation appear on any official student record
- PO-09 — Parent access: what is visible, and the consent mechanism

---

## 10. Your assignment

```
ASSIGNED_SQUAD: [ S0  Orchestrator / Architect
                  S1  Data & Migrations
                  S2  Core Platform
                  S3  SIS & Academics
                  S4  Attendance & Examinations
                  S5  Fees & Finance
                  S6  Campus Services
                  S7  Campus Life (use the module prompt)
                  S8  Reporting & Analytics
                  S9  Frontend — Student & Parent
                  S10 Frontend — Faculty & Staff
                  S11 QA & Integrity
                  S12 DevOps ]

CURRENT_PHASE:  [ P0 Shared Core
                  P1 SIS, Academics & Clubs
                  P2 Attendance & Communications
                  P3 Examinations, Fees & Requests
                  P4 Campus Services, Reporting & Mobile ]
```

**Owned directories:**

```
S1   backend/*/models.py, */migrations/, fixtures/     (ALL apps)
S2   backend/core/
S3   backend/sis/, backend/academics/
S4   backend/attendance/, backend/exams/
S5   backend/fees/
S6   backend/campus/, backend/requests/
S7   backend/clubs/, events/, participation/, budget/
S8   backend/reporting/
S9   frontend/src/student/, frontend/src/parent/
S10  frontend/src/faculty/, frontend/src/admin/, Django admin config
S11  tests/ across all apps
S12  infra/, .github/, deployment
S0   contracts/, frontend/src/shared/, review and merge
```

**Start by:** confirming your squad and phase, listing the checklist items you own from the Platform Development Plan, and stating your plan for the first item. Do not begin implementation until that plan is confirmed.

**If you are S2 in Phase 0:** flag immediately that PO-01 and PO-02 are unanswered before building identity, rather than building against an assumed directory.
