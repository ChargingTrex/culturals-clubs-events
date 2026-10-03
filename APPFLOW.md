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
                   Dean of Student Affairs  (gate 2, ALWAYS — sanctions)
                          │
                   ┌──────┴───────┐
            under  │              │  over ₹50,000, or a fest
            ₹50,000│              ▼
                   │       Vice-Chancellor  (gate 3)
                   │              │
                   │       ┌──────┴───────┐
                   │ under │              │  over ₹2,00,000
                   │ ₹2 L  │              ▼
                   │       │       Management  (gate 4)
                   │       │              │
                   └───────┴──────┬───────┘
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
| **Vice-Chancellor** | — | — | — | — | No | **gate 3** | aggregates | **No** |
| **Management** | — | — | — | — | No | **gate 4** | aggregates | **No** |

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
- **The Vice-Chancellor and Management never see an individual student.** No
  roster, no attendee list, no PRN lookup, no audit trail (it names students acting
  for their clubs), and a proposal reaches them from "the club", not a named student.
  Aggregates in the semester report, and their own approval queue.

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

The route follows a **delegation of financial powers**, and is fixed when the
proposal is sent:

| Requested | Route |
|---|---|
| up to ₹50,000 | Cultural Society → Dean |
| over ₹50,000, or part of a fest | Cultural Society → Dean → Vice-Chancellor |
| over ₹2,00,000 | Cultural Society → Dean → Vice-Chancellor → Management |

(The Cultural Society gate applies to cultural and literary clubs; the Dean's always
applies.) A bigger budget travels further — it never skips a gate a smaller one would
have passed. The New event page shows the route before anything is sent.

**The Cultural Society recommends; the Dean sanctions.** The Society judges merit and
the calendar and sees the figures, but sanctioning starts at the Dean, who may reduce
any head. The Vice-Chancellor and Management see what the Dean sanctioned and may
reduce it further — **never restore what an earlier gate cut**.

Each gate sees **only its own queue**. Culturals Night 2026 sits with the Cultural
Society at the start, so it is correctly absent from the Dean's queue — that is the
chain working, not a bug. Every gate opens with one proposal of its own already
waiting, and a list of its recent decisions showing where each one went next.

| What you try | What happens |
|---|---|
| Approve at a gate you hold | Advances, or publishes if it was the last gate |
| Approve at a gate you do not hold, but hold a later one | `409` — not your turn yet, and it names who has it |
| Approve on a route you hold no gate on | `403` — you are not an approver here |
| Return or reject with no comment | `422` — say what the club should change |
| Approve over an unresolved venue clash | `409` — the Dean moves one event first |
| Sanction a head above what was asked for | `422` — you may reduce, never raise |
| Raise a head an earlier gate cut | `422` — a later gate may only cut further |
| Approve above the threshold without a verified session | `403` |

Heads the approver does not touch are sanctioned **as requested**, not left null — a
null after the decision would read as "not yet decided".

The **route is frozen at submission**. If the threshold changed mid-flight, a
recomputed route could drop a gate the proposal had already passed.

A **return** sends it back to the club with the comment, which the Treasurer and
President see on Club events (a plain member sees that it came back, not why — a
return is usually about the money). Resubmitting starts a new request from gate 1,
with no sanctioned figures carried over from the last round.

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
  data is yours; "Reset data" puts it back to the start. Two tabs share it — each can
  hold a different role — and a tab shows a **Refresh** prompt (or simply catches up
  when you return to it) after another tab changes something.
- **Not security.** The rules run client-side here, so they shape the *workflow*
  faithfully but defend nothing. The production backend runs the identical rules
  server-side, where a tampered client gets refused anyway.
- **The signing key ships to the browser**, so a determined tester can mint a valid
  code. The signature is here to keep the data *structure* honest — purposes, event
  binding, single use — not to protect anything.
- **Staff sessions skip the second factor**, because a pilot cannot read an
  authenticator app. In production, MFA is mandatory for the Dean, the
  Vice-Chancellor, Management, the Cultural Society and admins, and separately
  required to sanction above the threshold. Queue cards mark where it would apply.
- **Not yet built:** waitlists, feedback surveys, the annual handover of office
  bearers, fest sub-events, and external (non-college) participants.

---

## 9. Things worth trying

The sign-in page has a **guided walk through the whole workflow** — eight steps, one
button per step, progress taken from what you actually did. Beyond it:

1. Sign in as **Treasurer** → *New event* → "price it later" → *Budget* → add two
   entries → *Club events* → send for approval. Then try adding another entry.
2. As the **Treasurer**, create another and declare it needs **no budget** with a
   reason. Then look at it as the **Cultural Society** — the declaration appears where
   the figures would be.
3. Follow *Culturals Night 2026* through all four gates: **Society → Dean → VC →
   Management**. As the Dean, trim the artist fee; as the VC, try to put it back.
4. Each approver already has one proposal waiting: the Dean has *Kalam Debating
   Championship*, the VC *Natya Dance Drama*, Management *Inter-College Dance
   Championship*.
5. As the **Cultural Society**, return *Culturals Night 2026* with a comment. Then
   read it as the **Treasurer**, and again as a **Club member**.
6. As the **Dean**, open *Venues* — two clubs want Seminar Hall A. Try approving one
   first; it refuses. Move one, then approve.
7. As the **Organiser**, open the *Scan station*. Check someone in, then scan the same
   pass again. Try the forged code. Watch the capture rate move.
8. As a **Student**, go to *Profile QR*, reissue it, then try the old code at the door.
9. Open two tabs: the **Treasurer** in one, the **Dean** in the other. Approve in one
   and watch the other catch up.
10. As **Management**, notice the sidebar has two pages. Then try to find a roster.
