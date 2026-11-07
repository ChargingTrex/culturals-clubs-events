# Master specification — roles, access, approvals and flows

**Clubs & Events application** · consolidated from every document in this repository
· generated 2026-09-24

This is the single place to look up **who can do what, when, and what they see**.
It consolidates nine source documents that each hold part of the answer, and it
records the four places where those documents **contradict each other** (§9) and the
sixteen places where the running code **diverges from the documents** (§10). Neither
list is editorial: both are things a build team will otherwise discover by shipping
the wrong rule.

## Contents

| § | Section |
|---|---|
| 1 | [How to use this, and which document wins](#1-how-to-use-this-and-which-document-wins) |
| 2 | [The cast — every role at a glance](#2-the-cast--every-role-at-a-glance) |
| 3 | [Role detail — powers, actions, visibility](#3-role-detail--powers-actions-visibility) |
| 4 | [Access control matrix](#4-access-control-matrix) |
| 5 | [Approvals](#5-approvals) — incl. §5.6 budget building and nil declarations |
| 6 | [User flows](#6-user-flows) |
| 7 | [Data flow diagrams](#7-data-flow-diagrams) |
| 8 | [Data ownership, retention and privacy](#8-data-ownership-retention-and-privacy) |
| 9 | [Where the documents disagree](#9-where-the-documents-disagree) |
| 10 | [Implementation status and gap register](#10-implementation-status-and-gap-register) |
| 11 | [Open questions](#11-open-questions) |

---

## 1. How to use this, and which document wins

Nine documents describe this system, and they were written at different times. When
two disagree, resolve in this order — **later and more specific beats earlier and
more general**:

```
 1. shared/API_Standards_Integration_Contract.docx   ─┐ binding on BOTH teams,
 2. shared/Identity_Login_Shared_Data.docx           ─┘ neither changes unilaterally

 3. clubs-and-culturals-platform/AGENT_PROMPT.md       "fixed decisions — do not revisit"
 4. .../Event_Flows_Clubs_Events_V2.docx               operational truth; corrects the PRD
 5. .../Database_And_Data_Flow.docx                    data layer truth
 6. .../Student_Life_Clubs_Events_PRD_V4.docx          product intent; superseded in places
 7. .../Decision_Log.docx                              why, and what was rejected
 8. app/RECONCILIATION.md                              two merged backend drafts
 9. app/README.md                                      how to run what exists
```

**Why this order matters.** Event_Flows_V2 §1.1 states in its own words that the PRD
is wrong about approvals: *"Correction needed in the PRD: PRD section 5.13 assumes a
faculty advisor reviews before the Dean. That step does not exist here. The PRD should
be updated so the two documents agree — otherwise the build team will implement an
approval stage nobody uses."* That correction has **not** yet been made to the PRD. If
you read the PRD alone you will build a faculty-advisor gate that nobody uses.

### Vocabulary

Two names for one person, used interchangeably across the documents:

- **Dean of Student Life** (PRD) = **Dean of Student Affairs** (AGENT_PROMPT, Event
  Flows) — the same single approver. This document uses *Dean of Student Affairs*.
- **Management** (PRD, Event Flows) = **Vice-Chancellor** — the same above-threshold
  approver and report recipient. This document uses *Vice-Chancellor*.

---

## 2. The cast — every role at a glance

Eleven roles. Nine come from the documents; one (**Cultural Society**) was added by
the product owner after them, and one (**Faculty Advisor**) was removed by
Event_Flows_V2 and should be deleted from the PRD.

| Role | Scope | Approves? | Sees money? | Sees who attended? | Built? |
|---|---|---|---|---|---|
| **Student** | Self | — | No | Own history only | Yes |
| **Club Member** | One club | — | **No** | No | Yes |
| **Organiser** | **One event**, time-bound | — | No | **Yes — own event only** | Yes |
| **Club Secretary** | One club | — | No | Own club's events | Yes |
| **Club Treasurer** | One club | No — never own club | **Yes**, own club | Own club's events | Yes |
| **Vice-President** | One club | No — never own club | **Yes**, own club | Own club's events | Yes |
| **President** | One club | No — never own club | **Yes**, own club | Own club's events | Yes |
| **Cultural Society** | Cultural + literary clubs | **Gate 1** | Yes, those clubs | Totals only | Yes — *added, see §9.1* |
| **Dean of Student Affairs** | Institution | **Gate 2 — the only mandatory gate** | Yes, everything | Totals and capture rate | Yes |
| **Vice-Chancellor** | Institution | **Gate 3 — above threshold / fests only** | Yes, aggregates | **No individual records** | Yes |
| **Student Life Office** | Institution, operational | No | Reviews receipts | Any roster | **No — see §10** |
| ~~Faculty Advisor~~ | ~~Assigned clubs~~ | ~~First-level~~ | — | — | No — **deliberately absent** |

### The two rules that shape every row above

1. **No club role approves its own budget.** Not the President, not the Treasurer, not
   a Vice-President. Approval always sits outside the club. *(AGENT_PROMPT §6,
   PRD §5.19.2, Event Flows §9.2 — all three agree.)*
2. **Budget visibility begins at Treasurer.** A Club Member sees what the club is
   doing, never what it costs. *(Event Flows §7: "A member sees what the club is doing,
   not what it costs.")*

---

## 3. Role detail — powers, actions, visibility

Each card below is: **who they are · what they can do · what they see · what they
never see · how it is enforced**.

### 3.1 Student

Every enrolled student, by default, with no club affiliation required.

**Can do**
- Browse the club directory and the campus calendar; filter by category, club, date,
  department
- Register for a published event; cancel their own registration; join a waitlist
- Request to join a club
- Present their **profile QR** at any event — always available, two taps after login
- Present a **one-time event pass** for an event they pre-registered for
- Submit feedback after attending
- Reissue their own profile QR if their phone is lost

**Sees** — a personalised feed; event pages with capacity, venue and organiser
contact; their own registrations, passes and attendance history; their own
notifications (in-app and email only).

**Never sees** — another student's attendance or registrations; **any** budget figure;
approval decisions; internals of clubs they have not joined.

**Critically, cannot do:** mark themselves present. *There is no route, anywhere in
the system, by which a student records their own attendance* (AGENT_PROMPT §2:
"Self-marking does not exist"). The organiser scans the student, metro-turnstile
style, never the reverse.

**Enforced by** — `RegistrationViewSet.get_queryset()` filters to
`student_id == caller`; the scan endpoint requires `IsEventOrganiser`. Test:
`test_an_ordinary_attendee_cannot_scan_themselves_in`.

### 3.2 Club Member

Everything a Student sees, plus internal visibility of clubs they have joined. **No
administrative controls.**

**Can do** — view the club roster (names and roles), internal announcements, the
club's upcoming events, past event reports and photo galleries; volunteer for event
roles and shifts when an organiser opens a roster.

**Never sees** — **budget figures of any kind**, including their own club's; other
clubs' internals.

**Enforced by** — `EventSerializer.get_budget()` returns `None` unless the caller
holds a `BUDGET_VIEWERS` role for that club; `BudgetViewSet.get_queryset()` excludes
the club entirely, so a direct fetch is **404, not 403** — a 403 would confirm the
budget exists. Tests: `test_a_plain_member_cannot`,
`test_the_event_payload_omits_budget_for_a_member`.

### 3.3 Organiser

**A member running one specific event. The scope is the event, not the club** — this
is the most privacy-exposed role in the system and the most tightly bounded.

**Can do**
- Create an event from a template; work the task checklist
- Build a custom registration form; open team entries
- Assign volunteers to roles and shifts
- **Run the scan station**: accept / duplicate / wrong-event / not-registered
  verdicts, readable at a glance in a moving queue
- **Spot-register a walk-in** in a single scan of their profile QR
- Search the roster by PRN or name as the manual fallback
- Close the event with photos, social links and outcomes

**Sees** — the full attendee list for **their own event**: name, PRN, programme,
year, check-in time, and how each person was admitted; running count against
capacity; registered-but-not-arrived.

**Never sees** — other clubs' events; institution-wide participation; any budget.

**The boundary that matters** — access to attendee identities is **scoped to their own
event and time-bound** to the event plus a limited window. Event Flows §8: *"This is
student personal data, not a browsable directory."*

**Enforced by** — the `event_organiser:<event_id>` scoped role, and a scan-station
session token **bound to one event**. A station token issued for event X is refused at
event Y outright, whatever else its holder is — binding that does not restrict is
decoration. Test: `test_a_station_token_for_one_event_is_refused_at_another`.

### 3.4 Club Secretary

Club office bearer without money rights. Can submit proposals and run events.
**Cannot** assign roles and **cannot** see the budget.

### 3.5 Club Treasurer

**Owns budget entry for the club.** The primary owner of spend and receipts.

**Can do** — **raise a proposal**; **build its budget** — add, edit and remove entries,
or declare that the event needs no budget at all (§5.6); view every proposal and its
approval stage; record actual spend per line; upload receipts per line; view the annual
envelope and utilisation; settle the budget once evidence is complete.

**Cannot do** — **assign member roles** (PRD §5.19.2 and Event Flows §9.2 both say
No); **approve the club's own budget**; or **run the event** — marking an event live and
closing it with evidence sit with `EVENT_OPERATORS` (§9.3).

**Enforced by** — `ROLE_ASSIGNERS = (President, Vice-President)` only; the refusal
happens **on save**, not by hiding the control. Test: `test_the_treasurer_may_not`
asserts `403 CLUBS_ROLE_ASSIGN_DENIED` *and* that the role did not change.

### 3.6 Vice-President

As President for roster and budget purposes, including **role assignment**. The
second of the two roles that can promote and demote.

### 3.7 President

Runs the club.

**Can do** — everything a Vice-President can: manage the roster and **assign roles**
(member, core team, secretary, treasurer, Vice-President, President); submit event
proposals; full budget visibility; record spend; open the scan station for the club's
own events; close events.

**Never** — approves the club's own budget.

**Constraint** — **one active President per club**, enforced by a partial unique index.
Two Presidents would mean two people each holding the role that assigns roles. The
current holder must be stepped down first; the API answers
`409 CLUBS_PRESIDENT_EXISTS` with that instruction rather than a bare integrity error.

**Every role change is recorded** with who made it, from what, to what, when, and why.
Role assignment grants budget access with no separate administrative step — appointing
a treasurer *is* granting budget visibility.

### 3.8 Cultural Society

> **Added after the source documents.** See §9.1 before relying on this role.

The cultural secretary / society office bearer. **Approval gate 1** for events from
clubs in the **cultural** and **literary** categories. A technical or sports club's
event does not queue behind them.

**Can do** — approve, return (comment required) or reject a proposal from a club in
scope; read the semester report and the Dean's overview.

**Cannot do** — act at the Dean's gate or the VC's gate; approve an event from a club
they hold a role in (the self-approval bar applies to them as to anyone); run a scan
station; enter spend.

**Enforced by** — `APPROVAL_CHAIN` places the gate; `Club.under_cultural_society`
decides which clubs it applies to; `assert_can_decide` refuses any other stage.

### 3.9 Dean of Student Affairs

**The decision maker in every flow, and the only mandatory approval gate.**

**Can do**
- Approve, return or reject **every** event proposal
- **Sanction budgets at line level**, not only in total — a head may be reduced, never
  raised above what was requested
- Approve new clubs
- Endorse fests before they reach the Vice-Chancellor
- **Move an event to another venue** to resolve a clash, with a reason the club is shown
- Read the audit trail

**Operational dashboard** — pending approvals **with age**, so nothing sits
unactioned; events this week and month; venue conflicts; active versus dormant clubs;
events missing photos, reports or settlement; running semester totals; budget
utilisation; **capture rate per club**.

**Explicitly does not** — run scan stations, manage rosters, or enter spend. Event
Flows §10.3: *"Those sit with clubs."*

> **Known throughput risk, flagged in the source.** Event Flows §10.3: *"with no
> advisor step, every event in the institution passes through one person."* Approval-age
> tracking exists. **Delegation during absence does not** — it is open question §11.3,
> and it is the single most likely operational failure in this design.

### 3.10 Vice-Chancellor / Management

**Largely a recipient. Does not appear in the standard event flow at all.**

**Acts only when** — a budget is above the configured threshold (after the Dean), or
the item is a fest (after the Dean's endorsement).

**Receives** — the semester report: events run, **unique students reached** (the
headline), total participation, average attendance, splits by category and
department, comparison with the previous semester, photo-led highlights, and
budget asked / sanctioned / spent. Plus a live dashboard of the same figures and
export to PDF or slides.

**Never sees** — **individual student participation records.** Aggregates only. No
club roster, no attendee list, no PRN lookup, and no scan station.

**Enforced by** — `can_see_individual_records()`, which deliberately excludes the VC;
`SemesterReportView` returns aggregates with no per-student rows. Tests:
`VCDashboardOnlyTests` (13 cases, incl. a sweep asserting no PRN or name appears in any
response the VC can read) and `test_the_report_carries_no_individual_records`.

> This was a real defect until 2026-09-24 — one over-broad predicate gave Management
> the roster, the attendee list, PRN search and the door. See §10.5.

### 3.11 Student Life Office

Operational staff. **Not yet built — see §10.**

**Would do** — maintain venues, budget templates, event templates and approval
configuration; manage club records and the directory; view any club's roster; handle
venue conflicts and the calendar including **exam blackout periods**; review receipts
during settlement and request replacements where illegible; spot-check social post
links.

Currently these powers sit with the `admin` role or with the Dean.

### 3.12 Faculty Advisor — deliberately absent

PRD §5.13 and §5.19.2 describe a faculty advisor giving first-level approval.
**Event_Flows_V2 §1.1 removed this step** and AGENT_PROMPT §2 states: *"There is no
faculty advisor step."*

**The product owner has confirmed this was a deliberate simplification for the
prototype**, not something overlooked. Re-introducing the gate later costs one stage
name in `APPROVAL_CHAIN`, exactly as the Cultural Society gate was added.

A faculty advisor is still recorded on the **club profile** as a contact
(PRD §5.1) — the person exists, the approval step does not.

**Action required:** PRD §5.13 should be rewritten so it stops describing a gate
nobody implements, and `Decision_Log.docx` should record the simplification. Open
question §11.5 — delete outright, or retain as configurable — stays open, but nothing
is blocked on it.

---

## 4. Access control matrix

`✓` full · `◐` scoped, see note · `✗` denied · `—` not applicable

### 4.1 Events

| Action | Student | Member | Organiser | Secr. | Treas. | VP | Pres. | Society | Dean | VC |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Browse published events | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| See own club's drafts | ✗ | ✗ | ◐¹ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create / submit proposal | ✗ | ✗ | ✗ | ✓ | **✓** | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit a draft / returned proposal | ✗ | ✗ | ✗ | ✓ | **✓** | ✓ | ✓ | ✗ | ✗ | ✗ |
| Edit a *submitted* proposal | ✗ | ✗ | ✗ | ✗³ | ✗ | ✗³ | ✗³ | ✗ | ✗ | ✗ |
| Approve / return / reject | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐⁴ | ✓ | ◐⁵ |
| Mark event live | ✗ | ✗ | ✗ | ✓ | ✗² | ✓ | ✓ | ✗ | ✓ | ✗ |
| Close event with evidence | ✗ | ✗ | ◐¹ | ✓ | ✗² | ✓ | ✓ | ✗ | ✓ | ✗ |
| Move event to another venue | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| View master venue calendar | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |

¹ their own event only · ² the Treasurer raises the budget request but does not run
the event — `EVENT_OPERATORS` is narrower than `PROPOSERS`, see §9.3 · ³ locked while an
approver holds it — they must approve something other than what they read ·
⁴ cultural and literary clubs only · ⁵ above threshold or fests only

### 4.2 Participation and attendance

| Action | Student | Member | Organiser | Club leadership | Dean | VC |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Register for an event | ✓ | ✓ | ✓ | ✓ | — | — |
| Cancel own registration | ✓ | ✓ | ✓ | ✓ | — | — |
| Hold a profile QR | ✓ | ✓ | ✓ | ✓ | — | — |
| Reissue own profile QR | ✓ | ✓ | ✓ | ✓ | — | — |
| **Mark anyone present** | ✗ | ✗ | ◐¹ | ◐² | ✗³ | ✗ |
| Run a scan station | ✗ | ✗ | ◐¹ | ◐² | ✗³ | ✗ |
| Spot-register a walk-in | ✗ | ✗ | ◐¹ | ◐² | ✗ | ✗ |
| Manual check-in by PRN | ✗ | ✗ | ◐¹ | ◐² | ✗ | ✗ |
| See attendee names + PRNs | ✗ | ✗ | ◐¹ | ◐² | ✗⁴ | ✗ |
| See own attendance history | ✓ | ✓ | ✓ | ✓ | — | — |
| See attendance **totals** | ✗ | ✗ | ◐¹ | ✓ | ✓ | ✓ |
| See capture rate | ✗ | ✗ | ◐¹ | ✓ | ✓ | ✗ |

¹ own event, time-bound · ² own club's events; **President, VP, Secretary and Core
team only — Treasurer and plain Members excluded**, because the scan response carries
names and PRNs · ³ *the Dean approves events; the Dean does not mark attendance* — enforced, §10.5 ·
⁴ totals, trends and capture rate — **not routine individual browsing**

> ✅ **Enforced as written since 2026-09-24.** The Vice-Chancellor gets a dashboard:
> no roster, no attendee list, no PRN lookup, and no scan station. Previously one
> over-broad predicate granted all four — see §10.5.

### 4.3 Budget

| Action | Member | Secretary | Treasurer | VP | President | Society | Dean | VC |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Add / edit / remove an entry** | ✗ | ✗ | **✓** | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Declare "no budget required"** | ✗ | ✗ | **✓** | ✓ | ✓ | ✗ | ✗ | ✗ |
| See that a budget exists | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐¹ |
| View lines: requested / sanctioned / spent | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐¹ |
| View approval stage and days pending | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐¹ |
| Record actual spend | ✗ | ✗ | ✓ | **✓** | ✓ | ✗ | ✗ | ✗ |
| Upload receipts per line | ✗ | ✗ | ✓ | **✓** | ✓ | ✗ | ✗ | ✗ |
| Write a variance note | ✗ | ✗ | ✓ | **✓** | ✓ | ✗ | ✗ | ✗ |
| Settle the budget | ✗ | ✗ | ✓ | **✓** | ✓ | ✗ | ✗ | ✗ |
| **Sanction** amounts (line level) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ◐¹ |
| **Approve own club's budget** | ✗ | ✗ | **✗** | **✗** | **✗** | **✗** | — | — |
| See another club's budget | ✗ | ✗ | ✗ | ✗ | ✗ | ◐³ | ✓ | ◐¹ |

¹ above-threshold requests and aggregates only · ³ clubs in society scope

> Denials in this table are **404, not 403**, where the existence of the record is
> itself the disclosure — another club's budget, another student's record.
> *(API_Standards §3.3: "A 403 confirms the resource exists, which is sometimes all an
> attacker needs.")*

### 4.4 Roster, roles and reporting

| Action | Member | Secretary | Treasurer | VP | President | Society | Dean | VC | SLO |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| View own club roster | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| View **any** club roster | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| **Assign club roles** | ✗ | **✗** | **✗** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Approve a new club | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Read semester report | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| Read Dean's overview | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Read audit trail | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Manage venues / templates | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |

### 4.5 How a role is carried

Roles travel **inside the access token**, so checking one costs no database query
*(Identity_Login_Shared_Data §5.1 step 8)*. Two shapes:

```
"dean"                              global   — institution-wide
"club_president:<club_uuid>"        scoped   — this club only
"event_organiser:<event_uuid>"      scoped   — this event only, time-bound
```

```
roles: ["student",
        "club_treasurer:7f3a…",     ← Treasurer of one club
        "club_member:9b21…",        ← ordinary member of another
        "event_organiser:c4e8…"]    ← running one specific event
```

A person is routinely several of these at once. Seniority resolves conflicts: the
**most senior club role held in that club** decides, so someone who is both Member and
President is treated as President.

**MFA** is mandatory for Dean, Vice-Chancellor, Cultural Society and admin
*(Identity §5.5)*, and is separately required — **regardless of role** — for
sanctioning above the escalation threshold. The `mfa` claim records whether the
session was verified, so a sensitive action can demand it independently.

---

## 5. Approvals

### 5.1 The chain

```
                    ┌─────────────────────────────────────────┐
                    │  Club submits proposal + budget         │
                    └────────────────┬────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────┐
                    │  GATE 1  Cultural Society               │  ◄── added after the
                    │  only if club is cultural or literary   │      source documents
                    └────────────────┬────────────────────────┘      (§9.1)
                                     │ approve
                    ┌────────────────▼────────────────────────┐
                    │  GATE 2  Dean of Student Affairs        │  ◄── the ONLY
                    │  ALWAYS. Sanctions line by line.        │      mandatory gate
                    └────────────────┬────────────────────────┘
                                     │ approve
                         ┌───────────┴───────────┐
                  below  │                       │  above threshold
              threshold  │                       │  OR part of a fest
                         ▼                       ▼
                   ┌──────────┐      ┌────────────────────────┐
                   │PUBLISHED │      │ GATE 3  Vice-Chancellor│
                   └──────────┘      └───────────┬────────────┘
                                                 │ approve
                                                 ▼
                                           ┌──────────┐
                                           │PUBLISHED │
                                           └──────────┘

   At ANY gate:  RETURN (comment required) → club revises → resubmits
                 REJECT (comment required) → terminal, cannot resubmit
```

### 5.2 What triggers each gate

| Gate | Who | When it applies | Can be configured away? |
|---|---|---|---|
| 1 | Cultural Society | Club category is `cultural` or `literary` | **Yes** — `APPROVAL_CHAIN=dean` |
| 2 | **Dean of Student Affairs** | **Always, every event** | **No.** A chain without it would publish events with nobody accountable for the money |
| 3 | Vice-Chancellor | Budget **>** threshold (default ₹50,000) **OR** event belongs to a fest | Follows the threshold setting |

The two reasons for gate 3 are recorded **separately** (`vc_reason`), because
"over threshold" and "it's a fest" call for different conversations at that level.

### 5.3 Rules that hold at every gate

| Rule | Consequence if violated | Where enforced |
|---|---|---|
| Comment required to **return** or **reject** | `422 GOVERNANCE_COMMENT_REQUIRED` | Also a DB check constraint — `return_and_reject_need_a_comment` |
| **No club role approves its own budget** | `403 GOVERNANCE_SELF_APPROVAL` | Checked even if the actor also holds an approval role |
| An approver may act **only at the current stage** | `409 GOVERNANCE_WRONG_STAGE` naming who holds it | — |
| Holding **no** gate on this route | `403 GOVERNANCE_NOT_APPROVER` | — |
| A **venue clash** blocks approval | `409 GOVERNANCE_CLASH_UNRESOLVED` | Move one event first. *Returning is still allowed* — a clash must not trap a proposal |
| Sanction **may reduce, never raise** above requested | `422 BUDGET_SANCTION_EXCEEDS_REQUEST` | A sanction above the request is a data-entry error |
| Heads the approver did not touch are sanctioned **as requested** | — | A null there would read as "not yet decided" *after* the decision |
| Above-threshold sanctioning requires **MFA** | `403 GOVERNANCE_MFA_REQUIRED` | Independent of role |
| **One pending request per event** | DB unique constraint | Two open requests = two approvers approving different versions |
| The route is **frozen at submission** | — | If the threshold changed mid-flight, recomputing could drop a gate already passed |

### 5.4 Budget stages the club sees

```
Draft → Submitted → [Society review] → Dean review → [VC review] → Sanctioned → Settled
                            │               │             │
                            └───── Returned / Rejected ───┘   (at any gate)
```

**Days pending are shown at each stage, so nobody has to chase for an update**
(Event Flows §9.3).

### 5.5 Settlement gates

Settlement is a second approval-like control, run against evidence rather than a person.
**It is the last step of a fixed sequence, and the sequence is not optional:**

```
   priced or declared nil
            │
            ▼
      SANCTIONED            ← an approver has set the amounts
            │
            ▼
   the event actually runs   ← spend settles against what happened,
            │                  not against what was planned
            ▼
        SETTLED              ← spend + receipts + variance notes
```

`settlement_waiting_on` names where a budget sits, because "not yet" has distinct
causes and the club needs to know which:

| Value | Meaning | Whose move |
|---|---|---|
| `"sanction"` | Not sanctioned yet | An approver's |
| `"event"` | Sanctioned, event has not run | The calendar's |
| `null` | Settlement is the next step | The Treasurer's |
| `"settled"` | Done | — |

**Blockers are reported only once settlement is reachable.** Before then
`settlement_problems` is empty and `settlement_hint` explains what it is waiting for.
Listing "enter what was actually spent" against a *draft* budget presents the normal
order of work as a fault in the club's — which is what it did until 2026-10-02.

Once reachable, every blocker is reported at once:

| Blocker | Rule |
|---|---|
| No spend entered | At least one line must carry an amount |
| Line over receipt threshold (default ₹5,000) with no document | Cannot settle |
| Line spent > sanctioned with no variance note | Cannot settle |
| Event has not run yet | `409 BUDGET_EVENT_NOT_RUN` — enforced server-side, not just hidden |
| Budget not yet sanctioned | `409 BUDGET_NOT_SANCTIONED` |
| A nil budget | Nothing to settle; goes straight to `settled` |

**All blockers are reported at once**, not one per attempt: a treasurer fixing one
problem per round trip gives up and settles on paper.

Receipts attach **per budget line, never bundled** — a hospitality bill sits under
the hospitality head, because a bundle cannot answer "what was the ₹14,000 on sound
spent with". Replacements **supersede, never overwrite**; the old row stays and points
at the new one.

### 5.6 Building the budget, and the nil declaration

Pricing happens **after** the event exists, not inline at creation. Every event gets an
empty budget shell, and the President, Vice-President or Treasurer
(`BUDGET_PREPARERS`) fills it in.

| Action | Endpoint | Who |
|---|---|---|
| Add an entry | `POST /budget/budgets/{id}/lines` | President, VP, **Treasurer** |
| Edit a head or amount | `PUT /budget/budgets/{id}/lines/{line}/edit` | same |
| Remove an entry | `DELETE /budget/budgets/{id}/lines/{line}/remove` | same |
| Declare no budget needed | `POST /budget/budgets/{id}/declare-nil` | same |
| Withdraw that declaration | `POST /budget/budgets/{id}/withdraw-nil` | same |

**A proposal cannot be submitted until the budget is either priced or declared nil.**

#### Why a zero-budget event carries an explicit entry

An event that genuinely costs nothing and an event nobody has priced yet are
indistinguishable if the only evidence is an absence of lines — and they call for
opposite responses from an approver: decide, or send it back. So a zero-cost event
carries a **declaration**, not a blank:

```
  head         "No budget required"
  reason       required, ≥5 characters — the approver reads this instead of figures
  declared_by  who said so
  declared_at  when
```

The approval queue renders it where the line table would be, so the Dean sees a
statement somebody made rather than an empty table.

Rules that keep the two states from contradicting each other:

| Rule | Consequence |
|---|---|
| A declaration needs a reason | `422 BUDGET_NIL_REASON_REQUIRED`, **and** a DB check constraint |
| Cannot declare nil while priced lines exist | `409 BUDGET_NIL_HAS_LINES`, naming the heads |
| Adding a priced line withdraws the declaration | Silent — the two statements cannot both stand |
| A nil budget settles with nothing to settle | Goes straight to `settled`; no receipts, no variance notes |
| Amount 0 is below every threshold | So a nil event never reaches the VC gate |

#### Entries freeze once an approver holds the budget

`is_editable` is true only in `draft`, `returned` and `rejected`. Editing a budget while
a reviewer holds it would mean they sanction something other than what they read, so
adding a line to a submitted proposal is `409 BUDGET_LOCKED`. A **return** reopens it,
which is the point of returning.

Removal is a hard delete — the only one in this codebase. An unsubmitted line is a draft
nobody has relied on, so there is no history to preserve; once sanctioned, the path is
closed.

### 5.7 Other approvals

| What | Approver | Notes |
|---|---|---|
| New club | Dean | Status lifecycle: proposed → active → dormant → archived |
| Club join request | President / VP | Open or approval-based joining modes |
| Role assignment | President / VP | Not an approval flow; immediate, logged |
| Fest | Dean endorses → VC | **Possible third gate unconfirmed — §11.1** |
| Cancelled event with committed spend | **Unresolved — §11.6** | |

---

## 6. User flows

### 6.1 Student — discover to feedback

```
 STUDENT                          SYSTEM                        ORGANISER
   │                                │                              │
   │ browse feed / calendar         │                              │
   ├───────────────────────────────►│ published + live events only │
   │                                │                              │
   │ tap Register                   │                              │
   ├───────────────────────────────►│ lock event row               │
   │                                │ capacity check               │
   │                                │ create Registration          │
   │                                │ mint EventPass (signed)      │
   │                                │ queue in-app + email         │
   │◄───────────────────────────────┤ pass appears in wallet       │
   │                                │                              │
   │ arrive at venue, show pass     │                              │
   ├────────────────────────────────┼─────────────────────────────►│ scans it
   │                                │◄─────────────────────────────┤
   │                                │ resolve → accept             │
   │                                │ attended=true, used_at set   │
   │                                │ write ScanRecord             │
   │◄───────────────────────────────┤ "Checked in"                 │
   │                                │                              │
   │                                │ event closes                 │
   │◄───────────────────────────────┤ feedback survey              │
   │ submit feedback                │  (attendees only)            │
   └───────────────────────────────►│                              │
```

**Lost phone / flat battery:** the profile QR works at every event, and the organiser
can look the student up by PRN. Neither path lets the student mark themselves.

### 6.2 Club — proposal to settlement

```
 CLUB (Pres/VP/Secretary)      SYSTEM                SOCIETY      DEAN        VC
   │                             │                      │          │          │
   │ pick event type             │                      │          │          │
   ├────────────────────────────►│ template pre-fills   │          │          │
   │                             │ budget + checklist   │          │          │
   │                             │ (per-head lines      │          │          │
   │                             │  scale by expected)  │          │          │
   │◄────────────────────────────┤ shows total, and     │          │          │
   │                             │ warns if over the    │          │          │
   │                             │ VC threshold         │          │          │
   │ submit                      │                      │          │          │
   ├────────────────────────────►│ validate dates       │          │          │
   │                             │ HARD clash? reject   │          │          │
   │                             │ SOFT clash? flag     │          │          │
   │                             │ freeze route         │          │          │
   │                             ├─────────────────────►│ notify   │          │
   │                             │                      │ review   │          │
   │                             │◄─────────────────────┤ approve  │          │
   │                             ├─────────────────────────────────►│ notify  │
   │                             │                      │          │ sanction │
   │                             │                      │          │ line by  │
   │                             │                      │          │ line     │
   │                             │◄─────────────────────────────────┤         │
   │                             │                                 │         │
   │                             │ over threshold? ────────────────────────► │
   │                             │◄──────────────────────────────────────────┤
   │◄────────────────────────────┤ PUBLISHED, registration opens   │         │
   │                             │                                 │         │
   │ [event runs, scan station]  │                                 │         │
   │ close with photos + links   │                                 │         │
   ├────────────────────────────►│ status → reported               │         │
   │                             │                                 │         │
   │ TREASURER enters spend      │                                 │         │
   ├────────────────────────────►│ per line                        │         │
   │ attach receipts per line    │                                 │         │
   ├────────────────────────────►│ >threshold needs a document     │         │
   │ settle                      │ overspend needs a reason        │         │
   ├────────────────────────────►│ ALL blockers at once            │         │
   │◄────────────────────────────┤ SETTLED                         │         │
```

### 6.3 Approval decision — the three outcomes

```
                    ┌──────────────────────────┐
                    │ Approver opens proposal  │
                    └────────────┬─────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
            ┌─────────┐   ┌─────────────┐  ┌──────────┐
            │ APPROVE │   │   RETURN    │  │  REJECT  │
            └────┬────┘   └──────┬──────┘  └─────┬────┘
                 │               │ comment       │ comment
      clash? ────┤               │ REQUIRED      │ REQUIRED
      409 ◄──────┤               │               │
                 │               ▼               ▼
      MFA? ──────┤        status=RETURNED   status=REJECTED
      403 ◄──────┤        club may revise   TERMINAL
                 │        and resubmit      cannot resubmit
                 ▼
        more gates on route?
         ├── yes → advance, notify next gate + club
         └── no  → PUBLISHED + budget SANCTIONED
                   (same transaction — an "approved but not
                    published" limbo is a state nobody watches,
                    and proposals rot in it)
```

### 6.4 Scan station — the seven branches

```
                        Camera / paste reads a code
                                    │
                      ┌─────────────▼──────────────┐
                      │ verify HMAC signature      │
                      │ (constant-time compare)    │
                      └─────────────┬──────────────┘
                                    │
        ┌───────────┬───────────┬───┴────┬──────────┬────────────┐
        ▼           ▼           ▼        ▼          ▼            ▼
   bad sig /    EXPIRED    wrong event  PASS     PROFILE QR   unknown
   malformed       │            │      purpose    purpose      subject
        │          │            │        │           │            │
        ▼          ▼            ▼        │           │            ▼
  ① UNKNOWN   ② EXPIRED   ③ WRONG_EVENT │           │      ① UNKNOWN
    _CODE                               │           │        _CODE
                                        │           │
                    ┌───────────────────┘           └──────────────┐
                    ▼                                              ▼
            pass already used?                          student registered?
             ├── yes → ④ DUPLICATE                       ├── yes, attended
             ├── revoked → ① UNKNOWN                     │     → ④ DUPLICATE
             │   (a newer pass exists)                   ├── yes, not attended
             ├── registration cancelled                  │     → ⑤ ACCEPTED
             │   → ⑥ CANCELLED                           └── no
             └── else → ⑤ ACCEPTED                             ├── at capacity
                        set used_at                            │  → ⑦ NOT_REGISTERED
                        attended=true                          └── else
                        checked_in_at, operator, station           → ⑤ SPOT_REGISTERED
                                                                      create Registration
                                                                      source=spot
   ═══════════════════════════════════════════════════════════════════════════
   EVERY branch above writes a ScanRecord — including every failure.
   The failures ARE the capture-rate metric. Without them, a station
   rejecting half its queue looks identical to a quiet event.
   ═══════════════════════════════════════════════════════════════════════════
```

**Manual fallback** — PRN or name lookup, still performed by the organiser, still
recorded with an operator, still writing a ScanRecord. A manual entry that left no
trace would be indistinguishable from a scan that never happened.

### 6.5 Offline station and replay

```
 STATION (no signal)                          SERVER
   │
   │ caches roster + valid tokens BEFORE going offline
   │
   │ scan ──► queue locally with DEVICE timestamp
   │ scan ──► queue locally
   │ scan ──► queue locally
   │
   │ ═══ reconnects ═══════════════════════════►│
   │                                            │ sort queue by scanned_at
   │                                            │ (device clock, NOT arrival)
   │                                            │ replay each in that order
   │                                            │ set synced_at
   │◄───────────────────────────────────────────┤ "Synced 14 — 12 in, 2 duplicate"
```

**Conflict rule:** if the same student was checked in at two stations while both were
offline, **the earliest `scanned_at` wins** and the later becomes a duplicate
ScanRecord. Replaying in arrival order instead would award the check-in to whichever
packet reached the server first, which is not who reached the door first.

**Replay is idempotent** — a station whose sync response is lost will retry, and
`offline_ref` carries a unique constraint so the same scan is never recorded twice.

### 6.6 Venue clash resolution

```
 Two clubs want one hall at overlapping times (buffer included)
                        │
        ┌───────────────▼────────────────┐
        │ Was the other booking CONFIRMED?│
        └───────┬───────────────┬─────────┘
                │ yes           │ no — the other is merely SUBMITTED
                ▼               ▼
      REJECT the request    ACCEPT both, FLAG the clash
      409 VENUE_            │  Two clubs may both want Friday evening;
      UNAVAILABLE           │  which one gets it is the Dean's call,
                            │  not a validation error.
                            ▼
                  Dean sees it on the master calendar
                  and on the approval card itself
                            │
                  ┌─────────▼──────────┐
                  │ Dean MOVES one     │  atomic: release old slot and
                  │ with a REASON      │  take new one in ONE transaction,
                  │ (club is shown it) │  under a row lock
                  └─────────┬──────────┘
                            ▼
                  Approval unblocks

   Venue PRECEDENCE when two clash is an OPEN QUESTION (§11.7).
   The system therefore does not pick a winner — it surfaces the clash
   and the Dean decides.
```

### 6.7 Club lifecycle and annual handover

```
 Founding:   Apply ──► Dean decides ──► Set up (roster, advisor, handles)
             status: proposed ──────────► active

 Ongoing:    active ──► dormant (auto-flagged after configurable inactivity)
                    ──► archived (soft delete — never hard, or the club's past
                        events and attendance vanish from semesters already
                        reported)

 Handover:   Nominate ──► Transfer on effective date ──► Close out
             Outgoing bearers LOSE access on the end date rather than
             retaining it indefinitely. Permissions follow the role
             automatically — no separate administrative step.
```

> **Not built.** `Membership.ended_at` exists, but `OfficeBearerTerm`, effective
> dating and the handover workflow do not. See §10.

---

## 7. Data flow diagrams

### 7.1 Level 0 — context

```
  ┌──────────┐                                          ┌───────────────────┐
  │ Student  │──register, present QR, feedback──────────►│                   │
  └──────────┘◄─passes, notifications──────────────────  │                   │
                                                         │                   │
  ┌──────────┐                                           │                   │
  │Organiser │──scan codes, close event────────────────► │                   │
  └──────────┘◄─verdicts, attendee list───────────────── │   CLUBS & EVENTS  │
                                                         │      MODULE       │
  ┌──────────┐                                           │                   │
  │  Club    │──proposals, spend, receipts────────────► │                   │
  │leadership│◄─stage, sanctioned amounts─────────────── │                   │
  └──────────┘                                           │                   │
                                                         │                   │
  ┌──────────┐                                           │                   │
  │ Society  │──decisions───────────────────────────────►│                   │
  │  Dean    │◄─queues, dashboard, capture rate───────── │                   │
  │   VC     │◄─semester report (aggregates only)─────── │                   │
  └──────────┘                                           └─────┬──────┬──────┘
                                                               │      │
                        ┌──────────────────────────────────────┘      │
                        ▼                                             ▼
         ┌──────────────────────────────┐              ┌──────────────────────┐
         │   STUDENT MANAGEMENT PORTAL  │              │  Object store (S3)   │
         │   ─ identity / SSO (JWKS)    │              │  receipts, photos    │
         │   ─ SIS: students, enrolment │              │  DB holds REFERENCES │
         │   ─ academic calendar        │              │  only, never bytes   │
         │   ─ notifications, audit     │              └──────────────────────┘
         │                              │
         │   READ-ONLY to this module.  │              ┌──────────────────────┐
         │   Portal core tables are     │              │   SMTP (email)       │
         │   NEVER written here.        │              │   in-app + email     │
         └──────────────────────────────┘              │   ONLY — no SMS,     │
                                                       │   no WhatsApp, ever  │
                                                       └──────────────────────┘
```

### 7.2 Level 1 — the module's own stores

```
   ┌─────────┐   1. propose      ┌──────────────────┐
   │  Club   │──────────────────►│ P1  Proposal &   │
   │leadership│                  │     budgeting    │
   └─────────┘◄──────────────────└────┬────────┬────┘
                   stage              │        │
                                      ▼        ▼
                              ┌──────────┐  ┌──────────┐
                              │ D1 Event │  │ D2 Budget│
                              │  Venue   │  │  Line    │
                              │  Fest    │  │  Receipt │
                              └────┬─────┘  └────┬─────┘
                                   │             │
   ┌─────────┐   2. decide         ▼             ▼
   │ Society │────────────►┌──────────────────────────┐
   │  Dean   │             │ P2  Approval routing     │
   │   VC    │◄────────────└────────────┬─────────────┘
   └─────────┘   queue                  │
                                        ▼
                               ┌─────────────────┐
                               │ D3 ApprovalReq  │
                               │    ApprovalStep │
                               └─────────────────┘
                                        │
   ┌─────────┐   3. register            ▼
   │ Student │────────────►┌──────────────────────────┐
   └─────────┘◄────────────│ P3  Registration &       │
                pass       │     pass issuing         │
                           └────────────┬─────────────┘
                                        ▼
                               ┌─────────────────┐
                               │ D4 Registration │
                               │    EventPass    │
                               │    StudentQRTok │
                               └────────┬────────┘
                                        │
   ┌─────────┐   4. scan               ▼
   │Organiser│────────────►┌──────────────────────────┐
   └─────────┘◄────────────│ P4  Check-in resolution  │
                verdict    │     (7 branches)         │
                           └────────────┬─────────────┘
                                        ▼
                               ┌─────────────────┐
                               │ D5 ScanRecord   │ ◄── every attempt,
                               └────────┬────────┘     failures included
                                        │
                                        ▼
                           ┌──────────────────────────┐
                           │ P5  Aggregation          │
                           │     (Celery, NOT in the  │
                           │      request cycle)      │
                           └────────────┬─────────────┘
                                        │
                        reads D1+D2+D4+D5 within semester bounds
                                        │
                                        ▼
                           ┌──────────────────────────┐        ┌──────┐
                           │ Semester report          │───────►│  VC  │
                           │ AGGREGATES ONLY          │        │ Dean │
                           └──────────────────────────┘        └──────┘

   ┌──────────────────────────────────────────────────────────────────┐
   │ D6  AuditEntry — append-only. No API path updates or deletes it. │
   │     Written by P1, P2, P4 and role changes.                      │
   └──────────────────────────────────────────────────────────────────┘
```

### 7.3 Registration data flow

```
  Student taps Register
        │
        ▼
  SELECT ... FOR UPDATE on Event          ← without the lock, two simultaneous
        │                                    registrations both read "one place
        ▼                                    left" and both take it
  status is published or live?
        ├── no ──► 409 PARTICIPATION_NOT_OPEN
        ▼
  COUNT(Registration WHERE cancelled_at IS NULL) >= capacity?
        ├── yes ─► 409 PARTICIPATION_EVENT_FULL
        │          (documents specify a WAITLIST here — not built, §10)
        ▼
  INSERT Registration (source=pre_registered)
        │  snapshot department / programme / year AT THIS MOMENT
        │  ← a student who changes department must not retroactively
        │    move their past attendance, or a report already issued
        │    would give different numbers when re-run
        │
        ├── partial unique index violation? ──► 409 ALREADY_REGISTERED
        │        (the constraint firing IS the correct answer,
        │         not a bug to work around)
        ▼
  INSERT EventPass (row first, empty token)
        │
        ▼
  mint token naming the PASS ROW id ──► UPDATE EventPass.token
        │  ← the pass row carries used_at, so the token names exactly
        │    the thing that gets spent
        ▼
  queue notification (in-app + email) via Celery
        ▼
  pass rendered in app, QR generated LOCALLY (no external API call)
```

### 7.4 Budget lifecycle data flow

```
  BudgetTemplate.lines
        │
        ▼  seeded on proposal, per line:
  amount_requested = lump_sum
                   | rate × expected_attendance      ← scales automatically
                   | rate × days
        │
        ▼  + contingency line at template percentage
  BudgetLine rows                              stage: DRAFT
        │
        ▼  submit
  ApprovalRequest (amount = SUM(requested))
  route frozen: [Society?] → Dean → [VC?]      stage: SOCIETY/DEAN_REVIEW
        │
        ▼  approve at Dean gate
  amount_sanctioned written PER LINE           stage: SANCTIONED
        │  may be reduced, never raised above requested
        │  untouched heads := requested
        │
        ▼  event runs and closes
  amount_spent entered per line                stage: SANCTIONED
  ReceiptDocument attached PER LINE
        │  (never bundled; replacements supersede, never overwrite)
        │
        ▼  settle — all blockers reported at once
  spent > receipt threshold and no document?  ──► blocked
  spent > sanctioned and no variance_note?    ──► blocked
  no spend on any line?                       ──► blocked
  event has not run?                          ──► blocked
        │
        ▼
  stage: SETTLED, settled_at recorded, AuditEntry written
```

### 7.5 Semester report aggregation

```
  Celery job (NOT the request cycle)
        │
        ▼
  semester bounds ◄── READ from the portal's academic calendar.
        │              The module reads it and NEVER defines it.
        ▼
  Event WHERE status IN (completed, reported)
        AND starts_at BETWEEN bounds
        │
        ├──► events_run            = COUNT(events)
        │
        ├──► total_participation   = COUNT(Registration WHERE attended)
        │                             ↑ counts ROWS
        │
        ├──► unique_students       = COUNT(DISTINCT student_id
        │                                  WHERE attended AND student_id NOT NULL)
        │                             ↑ counts PEOPLE  ◄══ THE HEADLINE FIGURE
        │
        ├──► external_participants = COUNT(DISTINCT external_participant_id
        │                                  WHERE attended)
        │                             ↑ NEVER summed with unique_students
        │
        ├──► avg_attendance        = total_participation / events_run
        ├──► by_club / by_category = GROUP BY
        ├──► by_department         = GROUP BY department_at_event
        │                             ↑ the SNAPSHOT, not the current record
        └──► budget                = SUM(requested), SUM(sanctioned), SUM(spent)

  ╔══════════════════════════════════════════════════════════════════════╗
  ║ 20 events attended by the same 80 students, and 20 events reaching   ║
  ║ 600, both produce total_participation = 1600.                       ║
  ║ Only the DISTINCT count separates them — and only the second        ║
  ║ justifies the budget. Lead the report with unique_students.          ║
  ╚══════════════════════════════════════════════════════════════════════╝
```

### 7.6 Capture rate — the check on everything above

```
  Every figure in §7.5 derives from attendance records.
  If attendance capture is unreliable, nothing else in the system matters.

  Documents (Database_And_Data_Flow §5.6) define it as:

      capture_rate = COUNT(Registration WHERE attended AND source != 'manual')
                     ──────────────────────────────────────────────────────────
                     COUNT(Registration WHERE attended)

      "A club with a persistently low ratio is marking attendance by hand
       rather than scanning — visible on the Dean's dashboard."

  The code currently computes something DIFFERENT (see §10):

      capture_rate = COUNT(ScanRecord WHERE result IN (accepted, spot_registered))
                     ──────────────────────────────────────────────────────────
                     COUNT(ScanRecord)                    ← all attempts

  Both are useful and they answer different questions:
      documents → "are they scanning, or hand-entering?"
      code      → "how many scan attempts succeeded at the door?"

  ACTION: pick one for the Dean's dashboard, or ship both under distinct names.
```

---

## 8. Data ownership, retention and privacy

### 8.1 What this module owns, and what it must not touch

| Owned by this module | Read-only from the portal |
|---|---|
| Club, Membership, RoleChange | User, Student, PRN, names, email |
| Event, Venue, Fest, reassignments | Department and programme **codes** |
| Registration, EventPass, StudentQRToken, ScanRecord | Academic calendar / semesters |
| Budget, BudgetLine, ReceiptDocument | Role name list |
| ApprovalRequest, ApprovalStep, Notification, AuditEntry | |

**Never write portal core tables.** Student, User, Department and Semester are
read-only here, and club participation never touches academic records
*(AGENT_PROMPT rule 4)*.

**The module stores codes, not names.** It caches a display name for rendering but
always groups and reports by code. **Codes are never redefined** — if CSE splits, new
codes are created; reusing one with a new meaning makes every historical report
retroactively wrong. An unrecognised code is surfaced as unknown and logged, never
silently mapped to something plausible.

### 8.2 Identifiers — using the wrong one is the most damaging mistake here

| Identifier | Use for | **Never** use for |
|---|---|---|
| `user_id` / `student_id` (UUID) | Every foreign key, join, API path | Anything shown to a human |
| **PRN** | Desk lookup, ID cards, report labels, reconciliation | **Any foreign key** |
| `email` | Contact, SSO subject matching at first login | **Any key of any kind** |

PRN is immutable and **never reused** — not after graduation, not ever; reissuing one
silently merges two people's history. Email is contact data that happens to be unique
today: a system keyed on it inherits a broken record the day an address is reassigned.

### 8.3 Retention

| Data | Retention | Mechanism |
|---|---|---|
| Student participation records | While enrolled; **never purged mid-course** | Archived with the student record |
| **External participant details** | Fest duration + defined period | `purge_after` date; **genuinely deleted** by a scheduled job |
| Event photos | Indefinite institutional record | Removal on request per the consent notice |
| Receipts | Per institution finance policy | **Never deleted by the module** |
| ScanRecord | Rolled up after one year | Aggregates kept, raw log trimmed |
| AuditEntry | **Full, forever** | Append-only, never edited |

**Records outlive accounts.** A graduated or withdrawn student's registrations,
attendance and memberships are never deleted — deleting them would silently change
participation figures for semesters already reported. The account is deactivated; the
rows remain. Soft delete via status everywhere, **except** external participant data,
which is genuinely purged.

### 8.4 The most privacy-exposed surface

**The live attendance view.** An organiser needs names and PRNs at the door, which
makes it the highest-exposure screen in the module.

Controls: scoped to the organiser's **own event**; **time-bound** to the event plus a
limited window; access logged; and a pass token is returned **only to the student it
belongs to**, never to an organiser reading a roster — an organiser gets identities,
never a credential they could present on someone's behalf.

**DPDP alignment** — purpose limitation (participation data supports student-life
reporting, **not academic assessment**); notice at registration covering both
participation recording and photography; data minimisation for external participants;
retention defined per category rather than left open-ended.

---

## 9. Where the documents disagree

Four genuine contradictions. Each needs a decision recorded in `Decision_Log.docx`.

### 9.1 The Cultural Society gate — code vs AGENT_PROMPT

| Source | Says |
|---|---|
| `AGENT_PROMPT.md` §2 | "**Dean of Student Affairs only** for standard events… **There is no faculty advisor step.**" |
| `Event_Flows_V2` §1.1 | "Dean of Student Affairs only — single gate, no faculty advisor step" |
| **Product owner (verbal, 2026-09-23)** | Add a Cultural Society approval tier |
| **Code** | Implements it as `APPROVAL_CHAIN=cultural_society,dean` |

**Status:** implemented as **configuration**, defaulting ON, with tests covering both
settings. `APPROVAL_CHAIN=dean` restores the documented chain with no code change.

**Why this matters beyond bookkeeping:** AGENT_PROMPT's stated reason for a single
gate is throughput. Adding a gate to the only module-wide approval path doubles the
number of people who must act before any cultural event is published, and the source
documents already flag the Dean alone as a bottleneck risk. **Confirm the Society has
the capacity and a named deputy before this ships.**

**Action:** record in `Decision_Log.docx`; amend `AGENT_PROMPT.md` §2 or turn the gate off.

### 9.2 Faculty advisor — resolved: a deliberate simplification

| Source | Says |
|---|---|
| `PRD_V4` §4, §5.13, §5.19.2 | Faculty Advisor gives **first-level approval** |
| `Event_Flows_V2` §1.1 | "That step **does not exist** here. The PRD **should be updated**" |
| `AGENT_PROMPT.md` §2 | "There is **no** faculty advisor step" |
| **Product owner (2026-09-24)** | **Confirmed: omitted deliberately to simplify the prototype.** Not an oversight |
| **Code** | No such role |

**Status: resolved.** The faculty-advisor gate was left out on purpose to keep the
prototype simple, and the implementation follows Event_Flows and AGENT_PROMPT. This is
a decision, not a gap.

A faculty advisor is still recorded on the **club profile** as a contact (PRD §5.1) —
the person exists, the approval step does not.

**Remaining action:** rewrite PRD §5.13 so it stops describing a gate that nobody
implements, and record the decision in `Decision_Log.docx`. Open question §11.5 —
whether to delete the section outright or keep it as configurable for future use —
stays open, but nothing is blocked on it: re-introducing the gate later means adding
one stage name to `APPROVAL_CHAIN`, exactly as the Cultural Society gate was added.

### 9.3 Who may submit a proposal — resolved: Treasurer included

| Source | Says |
|---|---|
| `PRD_V4` §4 | The Treasurer's job is to "**prepare budget requests**, track sanctioned amounts, record actual spend" |
| `PRD_V4` §5.19.2 | Treasurer — "Create and submit a proposal: **Yes**" |
| `Event_Flows_V2` §9.2 | Treasurer — "Create and submit a proposal: **Yes**" |
| **Code, until 2026-09-30** | `PROPOSERS` excluded the Treasurer |

**Fixed.** A Treasurer who could record spend but not raise the request was
backwards — it made the role custodian of a number it had no way to ask for.

The fix is not simply widening `PROPOSERS`, because that set also gated **closing an
event** and **marking it live**. Granting those to the Treasurer would have over-read
the documents, which say nothing about a treasurer running an event. So the capability
was split:

| Set | Holders | Gates |
|---|---|---|
| `PROPOSERS` | President, VP, Secretary, **Treasurer** | Create, edit and submit a proposal and its budget |
| `EVENT_OPERATORS` | President, VP, Secretary | Mark live, close with evidence |

Closing an event needs the photos and outcomes from the people who were there;
preparing the budget does not. `GET /module/auth/me` now returns
`clubs_can_propose`, `clubs_can_operate_events` and `clubs_can_enter_spend`
separately, so the UI can show a Treasurer the proposal form without the event-day
controls.

Tests: `TreasurerBudgetRequestTests` — 7 cases, including that the Treasurer still
cannot approve their own request and still cannot close an event.

### 9.4 Who may record spend — resolved: Vice-President included

| Source | Says |
|---|---|
| `PRD_V4` §5.19.2 | Vice-President — "Record actual spend and upload receipts: **Yes**" |
| `Event_Flows_V2` §9.2 | Vice-President — "**Yes**"; the Treasurer is the "primary owner", not the only one |
| **Code, until 2026-09-30** | `BUDGET_SETTLERS` excluded the VP |

**Fixed.** `BUDGET_SETTLERS` is now President, Vice-President and Treasurer. "Primary
owner" describes who normally does it, not who is permitted to — and a club whose
treasurer is unreachable in exam week still has to settle.

---

## 10. Implementation status and gap register

What exists in `clubs-and-culturals-platform/app/backend` versus what the documents
specify. **97 tests passing**; frontend **not started**.

### 10.1 Built and tested

| Feature | Notes |
|---|---|
| Shared SSO seam | `local` / `platform` adapters, **identical claim shape in both** |
| Claim contract §5.4 | Pinned by test, including "optional values are null, never omitted" |
| Refresh rotation + family revocation on reuse | |
| MFA gate for staff roles, and for above-threshold sanctioning | |
| Scan-station session bound to one event | Event duration + 4h |
| Scoped roles in the token | `club_president:<uuid>`, `event_organiser:<uuid>` |
| 3-tier approval chain, config-driven | Society → Dean → VC |
| Line-level sanctioning, reduce-only | |
| Seven-branch check-in resolution | Plus EXPIRED and CANCELLED branches |
| ScanRecord on every branch incl. failures | |
| Offline replay, earliest-timestamp-wins, idempotent | |
| Venue clash detection with buffer; atomic reassignment | |
| Budget templates, per-head scaling, contingency | |
| Receipts per line, supersede-never-overwrite | |
| Settlement blockers, all reported at once | |
| Semester report; unique vs total verified against known overlap | |
| Dean's overview incl. missing-evidence chasing | |
| Append-only audit; in-app + email notifications only | |
| RFC 9457 problem-details errors, 404-not-403 discipline | |

### 10.2 Documented but NOT built

| # | Gap | Source | Impact |
|---|---|---|---|
| 1 | **Waitlist** — `waitlisted` flag, promotion on cancellation | DB §5.1, PRD §5.6 | Code returns `EVENT_FULL` instead. **A specified feature is simply missing.** |
| 2 | **Feedback** — surveys to attendees, 1–5 rating, one per student per event | PRD, DB §3.15, AGENT_PROMPT §4 | Whole domain absent; a named constraint is unimplemented |
| 3 | **Annual handover** — `OfficeBearerTerm`, effective dates, automatic permission transfer | PRD §5.3, Flows §4.3 | Outgoing bearers keep access indefinitely — **a live access-control gap** |
| 4 | **Student Life Office role** | Flows §12, PRD §4 | Powers sit with `admin`/Dean instead |
| 5 | **External fest participant public registration** (no login, QR by email) | PRD §5.15, Flows §13 | Model exists; no public flow |
| 6 | **EventPhoto / EventSocialPost / EventReport as tables** | DB §3.15 | Simplified to `photo_count` + `social_links` JSON — cannot record per-photo consent or highlights |
| 7 | **Volunteer/crew roster**, shifts | PRD §5.7, Flows §8 | Not modelled |
| 8 | **Task checklist** from template, dates counted back | PRD §5.5 | Not modelled |
| 9 | **Fest sub-events**, fest-level time-bound roles | PRD §5.15 | `Fest` model exists; sub-event hierarchy and `FestRole` do not |
| 10 | **Club join request** flow, open vs approval modes | PRD §5.2 | Membership created directly |
| 11 | **Dormancy auto-flagging** after inactivity | PRD §5.1 | Status field exists; no job |
| 12 | **Exam blackout periods** in the calendar | Flows §12 | Not modelled |
| 13 | **Personalised student feed** | PRD §5.4 | Plain event list |
| 14 | **ScanRecord roll-up** after one year | DB §6.1 | No retention job |
| 15 | **External participant purge job** | DB §6.1 | `purge_after` field exists; no Celery job runs it |
| 16 | **Celery worker** for report generation | DB §5.5 | Report computed in-request; fine at 1,500 students, **not at 25,000** |

### 10.3 Built differently from the documents

| Difference | Documents | Code | Why it matters |
|---|---|---|---|
| **Capture-rate formula** | `attended AND source != manual / attended` | `accepted scans / all scan attempts` | **Two different metrics under one name.** See §7.6 — decide before the Dean's dashboard ships |
| `actual_attendance` | Denormalised on Event | Computed live | Fine now; a report-time cost at scale |
| Approval target | `ApprovalRequest.target` = budget or event | Always the event | Simpler; revisit for fest-level budgets |
| Venue exclusion constraint | Postgres exclusion constraint | App-level check + row lock; PG constraint skipped on SQLite | Correct on the target DB; **weaker under concurrency on SQLite** |
| Treasurer proposals, VP spend | Both allowed | Both denied | See §9.3, §9.4 |

### 10.5 Resolved — the Vice-Chancellor now gets a dashboard only

**Three documents agreed the VC must not see individual student data:**

| Source | Says |
|---|---|
| `AGENT_PROMPT.md` §6 | "Vice-Chancellor — Above-threshold budgets, fests, semester report. **No individual records.**" |
| `Database_And_Data_Flow` §6.2 | VC **cannot read** "Individual student participation records" |
| `Event_Flows_V2` §14.2 | "Management — **Aggregate figures only**, in the semester report" |

**The code did not honour it.** `AuthContext.can_see_all_clubs()` included
`VICE_CHANCELLOR`, and that single predicate gated four things that return names and
PRNs. **Fixed 2026-09-24** on the product owner's instruction — *"give the VC only a
dashboard, don't flood him with all the info of PRN and names."*

**Root cause.** One predicate answered two different questions:

- *may this role see across club boundaries?* — yes for the VC, for aggregates
- *may this role see identifiable students?* — no for the VC

Every call site inherited the more permissive reading. The predicate is now split:

| Predicate | Holders | Gates |
|---|---|---|
| `can_see_all_clubs()` | Dean, **VC**, Society, admin | Events, budgets, approval queues, venue calendar — the work and the money |
| `can_see_individual_records()` | **Dean, admin only** | Rosters, attendee lists, PRN lookup — identifiable students |

**What changed**

| Endpoint | Before | After |
|---|---|---|
| `GET /clubs/{id}/members` | VC could read any roster | `404` for the VC |
| `GET /participation/events/{id}/roster` | VC could read any attendee list | `404` for the VC |
| `GET /module/directory/students?q=` | VC could look up any PRN | `403` for the VC |
| `POST /participation/events/{id}/scan` | Dean, VC and Society could all work a door | `403` for all three; **IT admin only** as break-glass |
| `MembershipViewSet.get_queryset()` | VC saw every membership | Empty for the VC |
| `GET /module/auth/me` | — | Now returns `can_see_individual_records`, so the **frontend never offers a roster the VC cannot open** |

The scan-station narrowing came with it: Event_Flows §10.3 says the Dean *"does not run
scan stations, manage rosters, or enter spend — those sit with clubs"*, and §11 says
Management does not appear in the event flow at all. The Cultural Society is excluded
for the same reason — it decides on proposals and budgets, which needs no attendee's name.

**What the VC still has:** the semester report, the above-threshold approval queue, the
budgets they must sanction, the event list and the venue calendar. A dashboard.

**Tests:** 13 in `tests/test_reporting.py::VCDashboardOnlyTests`, including a sweep that
asserts no PRN or student name appears in **any** response the VC can still read, plus
two that confirm the Dean's access is unchanged.

### 10.6 Demo harness (2026-09-30)

Fifteen pages, one per view, at `/demo/` — served by Django so they are same-origin.
**Login is disabled** for walkthroughs via `DEMO_MODE`, which mints real tokens for
named personas without a password.

Auth is **not** stubbed out. Every permission check still runs, so a refusal in the
demo is a genuine `403`/`404` from the API, rendered with its `code`. A demo that faked
the refusals would prove nothing about the access control in §4, which is the part worth
showing.

`DEMO_MODE` has three guards: off by default, `ImproperlyConfigured` if `DEBUG=False`,
and every demo route 404s when off. See `app/backend/demo/README.md`.

**Navigation is role-scoped.** The sidebar and index list only the pages the current
role can open — 3 for a student, 5 for a club member, 7 for a Treasurer, 8 for a
President, 2 for Management. Both are computed from the capability payload at
`GET /api/v1/module/auth/me`, the same source the server enforces from, so the menu and
the permission cannot drift apart.

The capability payload gained two fields for this: `clubs_door_staff` (who may work a
check-in desk — excludes plain members *and* Treasurers) and `can_see_overview`.
Deriving door access client-side from "holds any club role" offered the scan station to
people the API refuses; §4.2 footnote 2 is now expressed in data rather than guessed.

Hiding a page is still not a permission — a hidden page's URL reaches a real 403/404,
which is what §4 actually rests on.

These pages are a throwaway harness — no build step, no router. The React frontend that
`AGENT_PROMPT.md` §2 specifies is still unbuilt.

### 10.4 Environment issues

- **The project directory name contains `:` and a trailing space.** Python refuses to
  create a venv inside it and `PYTHONPATH` cannot express it. Worked around; **rename
  recommended.**
- **18 `drf-spectacular` schema errors**, all one cosmetic cause: plain `APIView`s
  returning ad-hoc dicts have no inferable *response* serializer. Paths and request
  bodies are documented; response shapes are not.
- **No git repository.** There is no history, which is why the two-draft collision
  recorded in `RECONCILIATION.md` was unrecoverable. **`git init` before further work.**

---

## 11. Open questions

Carried from `AGENT_PROMPT.md` §9, `Event_Flows_V2` §15 and `Database_And_Data_Flow`
§8. **None of these is resolved.** Where work could not wait, the code uses a
configurable default rather than a hard-coded guess — but a default is not a decision.

| # | Question | Current default | Who decides |
|---|---|---|---|
| 1 | Is there a **third approval gate for fests** between Dean and VC? | No — two gates | Dean + VC |
| 2 | What amount **triggers escalation** to the VC? | ₹50,000 (`VC_BUDGET_THRESHOLD`) | Finance + Dean |
| 3 | **Who approves when the Dean is unavailable?** Is delegation permitted? | **Nobody — notification is by role, so granting the role is the only route** | Dean |
| 4 | Above what amount must a line **carry a receipt**? | ₹5,000 (`RECEIPT_THRESHOLD`) | Finance |
| 5 | Delete PRD §5.13's faculty advisor, or retain as configurable? | **Absent by decision** (§9.2) — only the PRD edit is outstanding | Product owner |
| 6 | For a **cancelled event with committed spend**, who signs off settlement? | Unhandled | Finance + Dean |
| 7 | **Venue precedence** when two events clash? | None — surfaced, Dean decides | Student Life Office |
| 8 | **External participant retention** period? | `purge_after` nullable, no job | Legal / DPO |
| 9 | Is **PRN the canonical identifier** for the profile QR? | No — a signed reference to `student_id`; the QR reveals nothing | Resolved in code, confirm |
| 10 | Does the **Cultural Society** gate stay? Who deputises? | On by default | Product owner — **see §9.1** |

> **§11.3 is the most urgent.** Every event in the institution passes through one
> person, the source documents already name that as the design's main throughput
> risk, and §9.1 has now added a second single point of approval in front of it. There
> is no delegation mechanism.

---

## Appendix — document inventory

| Document | Location | Covers |
|---|---|---|
| API Standards & Integration Contract | `shared/` | Transport, error format, versioning, namespaces, adapter principle |
| Identity, Login & Shared Reference Data | `shared/` | PRN, names, email, roles, auth, claims, caching |
| Build Prompt — Clubs & Events | `clubs-and-culturals-platform/AGENT_PROMPT.md` | Fixed decisions, non-negotiable rules, flows, DoD |
| Student Life PRD V1–V4 | `clubs-and-culturals-platform/` | Product intent; **V4 current** |
| Event Flows V1–V2 | `clubs-and-culturals-platform/` | Swimlanes, per-role views; **V2 current and corrects the PRD** |
| Database & Data Flow | `clubs-and-culturals-platform/` | Schema, 22 tables, data flows, retention, access scoping |
| Decision Log | `clubs-and-culturals-platform/` | Module decisions and rejected alternatives |
| Development Plan & Agent Roles | `clubs-and-culturals-platform/` | Phases, checkpoints, nine-agent split |
| QR Attendance Kit | `clubs-and-culturals-platform/qr-attendance-kit/` | Self-hostable attendance + certificates; **read `docs/LICENSING.md` first** |
| Platform prompt / decision log / dev plan | `student-management-platform/` | The wider twelve-module portal |
| Reconciliation record | `clubs-and-culturals-platform/app/RECONCILIATION.md` | Two merged backend drafts |
| Backend README | `clubs-and-culturals-platform/app/README.md` | How to run what exists |
