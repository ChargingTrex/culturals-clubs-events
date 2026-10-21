# Culturals / Club Management Platform — repository layout

Two systems are specified here. They are built separately, by different teams, on
different timelines, and each has its own PRD, decision log and development plan.
A small set of documents is binding on both.

## Start here

**[MASTER_SPEC.md](MASTER_SPEC.md)** — the consolidated reference: every role and what
it can do, the access matrix, the approval chain, user flows, data flow diagrams, and a
register of the places where the source documents contradict each other or the running
code. Read it before the individual documents below.

## `clubs-and-culturals-platform/`

The Clubs & Events application — Module 1, sponsored by the Dean of Student Life.
Events, participation, budgets, evidence and semester reporting.

| File | What it is |
|---|---|
| `AGENT_PROMPT.md` | Build prompt for agents working on the module |
| `Student_Life_Clubs_Events_PRD_1/_V2/_V3/_V4.docx` | PRD, V4 is current |
| `Event_Flows_Clubs_Events.docx`, `_V2.docx` | Process swimlanes and per-view chapters |
| `Database_And_Data_Flow.docx` | Schema, relationships, aggregation, retention |
| `Decision_Log.docx` | Module-level decisions and rejected alternatives |
| `Development_Plan_Agent_Roles.docx` | Phases, checkpoints, nine-agent split |
| `culturals-platform.html` | Self-contained clickable prototype |
| `qr-attendance-kit/` | Django QR attendance & certificate implementation |

## `student-management-platform/`

The wider portal — twelve modules on one shared core (identity, records, academics,
attendance, examinations, fees, hostel and mess, communications, campus life,
requests and approvals, reporting, administration). Clubs & Events is its first module.

| File | What it is |
|---|---|
| `PLATFORM_AGENT_PROMPT.md` | Build prompt for agents working platform-wide |
| `Platform_API_Reference.md` | Proposed API surface for all twelve modules; applies the shared contracts |
| `Platform_Decision_Log.docx` | Institution-wide decisions across all modules |
| `Platform_Development_Plan.docx` | Five phases, squad split, checkpoints |

## `shared/`

Binding on both teams — these define the seam between the two systems, so they
belong to neither folder alone.

| File | What it is |
|---|---|
| `API_Standards_Integration_Contract.docx` | How the two systems stay compatible |
| `API_Standards_Integration_Contract_1.docx` | Byte-identical duplicate of the above |
| `Identity_Login_Shared_Data.docx` | PRN, names, email, roles, auth — defined once |

## Root

`Minor_Approval_Request_Form (3).pdf` is project paperwork rather than a
specification for either system, so it stays here.
