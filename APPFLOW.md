# App flow

How work moves through Culturals, who touches it at each point, and what the app
refuses. Read this before giving feedback — a lot of the behaviour that looks like a
missing feature is a deliberate rule, and it is better to argue with the rule than
with the button.

---

## 1. The shape of it

```
 CLUB                        APPROVERS                     DOOR            AFTER
 ────                        ─────────                     ────            ─────
 propose an event
   │
   ├─► price it ──────────┐
   │   (Treasurer)        │
   │   or declare it      │
   │   needs no budget    │
   │                      ▼
   └─────────────► Cultural Society  (gate 1, cultural + literary clubs)
                          │
                          ▼
                   Dean of Student Affairs  (gate 2, ALWAYS)
                          │
                   ┌──────┴───────┐
            under  │              │  over ₹50,000, or a fest
          threshold│              ▼
                   │       Management / Vice-Chancellor  (gate 3)
                   │              │
                   └──────┬───────┘
                          ▼
                      PUBLISHED ──► students register, get a pass
                                        │
                                        ▼
                                   event goes live
                                        │
                                   scan station ──► attended
                                        │
                                        ▼
                                   close with photos
                                        │
                                        ▼
                                   record spend, attach
                                   receipts, SETTLE
                                        │
                                        ▼
                                   semester report
```

At **any** gate a decision can be **approve**, **return** (the club revises and
resubmits) or **reject** (terminal). Returning and rejecting both require a comment:
a decision the club cannot act on is not a decision.

---

## 2. Who does what

| Role | Raises proposals | Builds budget | Records spend | Runs the event | Works a door | Approves | Sees money | Sees names |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Student** | — | — | — | — | — | — | No | own only |
| **Club member** | No | No | No | No | **No** | — | **No** | No |
| **Secretary** | Yes | No | No | Yes | Yes | — | No | own club |
| **Treasurer** | **Yes** | **Yes** | **Yes** | **No** | **No** | — | Yes | own club |
| **Vice-President** | Yes | Yes | Yes | Yes | Yes | — | Yes | own club |
| **President** | Yes | Yes | Yes | Yes | Yes | — | Yes | own club |
| **Cultural Society** | — | — | — | — | No | **gate 1** | Yes | No |
| **Dean** | — | — | — | — | **No** | **gate 2** | Yes | Yes |
| **Management** | — | — | — | — | No | **gate 3** | aggregates | **No** |

Six of those cells surprise people, so they are worth stating plainly:

- **A club member never sees a budget figure.** Budget visibility begins at
  Treasurer. A member sees what the club is *doing*, not what it *costs*.
- **The Treasurer raises the budget request.** They prepare it, so they must be able
  to ask for it — not just fill in spend against entries somebody else typed.
- **The Treasurer does not run the event.** Marking it live and closing it with
  photos sit with the President, Vice-President and Secretary. Preparing the budget
  and standing at the door on the night are different jobs.
- **The Treasurer does not work a door.** The scan response carries names and PRNs.
- **The Dean does not mark attendance.** The Dean approves events; the club runs them.
- **Management never sees an individual student.** No roster, no attendee list, no
  PRN lookup. Aggregates in the semester report, and the above-threshold queue.

**No club role approves its own budget** — not even a President who also happens to
hold an approval role. The club role wins.

---

## 3. Raising a budget request

The order is deliberate: **create the event first, price it second.**

```
 1. New event        title, date, venue, expected attendance
                     ├─ choose a template → the budget is filled in and sent
                     └─ or "price it later" → an unpriced DRAFT
 2. Budget page      the Treasurer (or President/VP) adds entries:
                       head + amount, one row at a time
                     or declares "No budget required" WITH A REASON
 3. Send for approval
```

**A proposal cannot be sent until the budget is either priced or declared nil.** An
empty budget and a genuinely free event look identical to an approver, and they want
opposite responses — decide, or send it back — so one of the two has to be stated.

### The nil declaration

A zero-cost event carries an explicit entry, never a blank:

```
 head         "No budget required"
 reason       required — the approver reads this instead of figures
 declared by  who said so
 declared at  when
```

- A declaration without a reason is refused.
- You cannot declare nil while priced lines exist; remove them first.
- Adding a priced line **withdraws** the declaration — both statements cannot stand.
- A nil budget settles with nothing to settle, so the event does not sit on the
  Dean's chasing list for ever.

### Entries freeze under review

Once an approver holds the budget, requested amounts are locked. Editing while
somebody is reviewing would mean they sanction something other than what they read.
A **return** reopens it, which is what returning is for.

---

## 4. Approving

Each gate sees **only its own queue**. Open the Dean's approvals while everything
still sits with the Cultural Society and it is correctly empty — that is the chain
working, not a bug.

| What you try | What happens |
|---|---|
| Approve at a gate you hold | Advances, or publishes if it was the last gate |
| Approve at a gate you do not hold, but hold a later one | `409` — not your turn yet, and it names who has it |
| Approve on a route you hold no gate on | `403` — you are not an approver here |
| Return or reject with no comment | `422` — say what the club should change |
| Approve over an unresolved venue clash | `409` — the Dean moves one event first |
| Sanction a head above what was asked for | `422` — you may reduce, never raise |
| Approve above the threshold without a verified session | `403` |

Heads the approver does not touch are sanctioned **as requested**, not left null — a
null after the decision would read as "not yet decided".

The **route is frozen at submission**. If the threshold changed mid-flight, a
recomputed route could drop a gate the proposal had already passed.

### Venue clashes

Two clubs may both want Friday evening. The second request is **accepted and
flagged**, not rejected — which one gets it is the Dean's call, not a validation
error. Clash checks include a 30-minute setup buffer, so a crew arriving 20 minutes
after the previous show ends still counts as a clash. Approval is blocked until the
Dean moves one, with a reason the club is shown.

---

## 5. QR attendance

Two codes exist and they do different jobs.

| | Profile QR | Event pass |
|---|---|---|
| Where | Your profile, always there | Issued when you register |
| Good for | **Any** event, including walk-ins | That one event |
| Reusable | Yes | **No** — one scan only |
| If you lose your phone | Reissue it; the old one dies immediately | Reissue the pass |

Neither holds your PRN. Both are signed references, so a photograph of someone's code
reveals nothing about them.

**The organiser scans the student, never the reverse.** There is no route anywhere in
the app by which a student marks themselves present.

### The seven outcomes at the door

```
 valid pass                        → CHECKED IN
 same pass again                   → DUPLICATE   (a fact, not an error)
 profile QR, already registered    → CHECKED IN
 profile QR, not registered        → REGISTERED AND CHECKED IN   (one scan)
 profile QR, already attended      → DUPLICATE
 pass for a different event         → WRONG EVENT  (go to the right hall)
 anything else                      → NOT RECOGNISED
 plus: expired pass, replaced pass, cancelled registration — each its own answer
```

**Every outcome is recorded, including every failure.** The failures *are* the capture
rate: without them a station rejecting half its queue looks exactly like a quiet
event. The Dean's overview shows that rate, because every figure in the semester
report derives from attendance — a poor rate is a warning about the figures, not just
about the doors.

### Offline

A station caches its roster, queues scans with the **device's** timestamp, and
replays them on reconnect. If the same student was scanned at two offline doors, the
**earliest** scan wins and the later one becomes the duplicate. Replaying in arrival
order would award the check-in to whichever packet reached the server first, which is
not who reached the door first. Replaying the same queue twice is a no-op.

A desk can also check someone in by **PRN lookup** when a phone is flat. It is still
the organiser acting, still recorded with an operator, and still logged — a manual
entry that left no trace would be indistinguishable from a scan that never happened.

---

## 6. Settling

Settlement is **last**, and the app says where you are rather than listing blockers
you cannot act on yet:

```
 Submitted → Sanctioned → Event runs → Settled
```

| State | What you see |
|---|---|
| Not yet sanctioned | "The budget has to be sanctioned before spend is recorded" |
| Sanctioned, event not run | "Settle after the event has run" |
| Sanctioned, event run | The blockers, all of them at once |

Blockers, once settlement is actually reachable:

- no spend entered on any line
- a line over ₹5,000 with no receipt
- a line spent above sanctioned with no explanation

All reported together, not one per attempt: a treasurer fixing one problem per round
trip gives up and settles on paper.

Receipts attach **per line**, never bundled — a bundle cannot answer "what was the
₹14,000 on sound spent with".

---

## 7. The semester report

It leads with **unique students reached**, not total attendance, and that is the whole
point of the figure:

> Twenty events attended by the same eighty students, and twenty events reaching six
> hundred, both report **1,600 total attendance**. Only the unique count tells them
> apart — and only the second justifies a budget.

Own students and external participants are counted **separately and never summed**;
combining them produces a number describing neither internal reach nor external draw.

Departments are grouped by the department recorded **at the time of each event**, so
re-running a past semester's report gives the same numbers even after students change
course.

Only `completed` and `reported` events count. **Attendance is counted, registration
never is** — registered-but-absent rows stay, because the no-show rate is useful, but
they are not participation.

---

## 8. What this build is not

- **No server.** Everything runs in your browser and nothing is sent anywhere. Your
  data is yours; "Reset data" puts it back to the start.
- **Not security.** The rules run client-side here, so they shape the *workflow*
  faithfully but defend nothing. The production backend runs the identical rules
  server-side, where a tampered client gets refused anyway.
- **The signing key ships to the browser**, so a determined tester can mint a valid
  code. The signature is here to keep the data *structure* honest — purposes, event
  binding, single use — not to protect anything.
- **Staff sessions skip the second factor**, because a walkthrough cannot read an
  authenticator app. In production, MFA is mandatory for the Dean, Management, the
  Cultural Society and admins, and separately required to sanction above the
  threshold.
- **Not yet built:** waitlists, feedback surveys, the annual handover of office
  bearers, fest sub-events, and external (non-college) participants.

---

## 9. Things worth trying

1. Sign in as **Treasurer** → *New event* → "price it later" → *Budget* → add two
   entries → *Club events* → send for approval. Then try adding another entry.
2. Sign in as **Treasurer**, create another, and declare it needs **no budget** with a
   reason. Then look at it as the **Cultural Society** — the declaration appears where
   the figures would be.
3. Follow *Culturals Night 2026* through all three gates: **Society → Dean →
   Management**. Watch it pick up the third gate because it is over ₹50,000.
4. As the **Dean**, open *Approvals* before the Society has acted. Empty, correctly.
5. As the **Dean**, open *Venues* — two clubs want Seminar Hall A. Try approving one
   first; it refuses. Move one, then approve.
6. As the **Organiser**, open the *Scan station*. Check someone in, then scan the same
   pass again. Try the forged code. Watch the capture rate move.
7. As a **Student**, go to *Profile QR*, reissue it, then try the old code at the door.
8. As **Management**, notice the sidebar has two pages. Then try to find a roster.
