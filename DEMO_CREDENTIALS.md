# Demo credentials

Nine accounts, one per role, for the pilot build. Sign in at the app's front page.

> **These are public test accounts in a browser-only build.** They guard nothing —
> the dataset lives in each tester's own browser, nothing is sent anywhere, and
> resetting the data puts it back to the seeded start. Do not reuse these passwords
> for anything, and do not add a real person's details to this file.

**Authenticator code for every staff account: `123456`**

Any non-empty code is accepted in the pilot, exactly as the backend's demo mode
does — a walkthrough cannot read an authenticator app. The gate still works: staff
cannot sign in without entering something.

---

## Students and club roles

No second factor needed.

| Role | Email | Password |
|---|---|---|
| Student | `student@demo.college.edu` | `student-2026` |
| Club member | `member@demo.college.edu` | `member-2026` |
| Secretary | `secretary@demo.college.edu` | `secretary-2026` |
| Treasurer | `treasurer@demo.college.edu` | `treasurer-2026` |
| President | `president@demo.college.edu` | `president-2026` |
| Organiser | `organiser@demo.college.edu` | `organiser-2026` |

## Staff and approvers

**Second factor required** — enter `123456`.

| Role | Email | Password | Code |
|---|---|---|---|
| Cultural Society | `society@demo.college.edu` | `society-2026` | `123456` |
| Dean of Student Affairs | `dean@demo.college.edu` | `dean-2026` | `123456` |
| Management | `management@demo.college.edu` | `management-2026` | `123456` |

---

## What each account is for

| Account | Club | What it shows |
|---|---|---|
| Student | none | The plainest view: browse, register, hold a pass and a profile QR |
| Club member | Swara | Club internals — and **never** a budget figure |
| Secretary | Swara | Raises proposals, runs events, works the door |
| Treasurer | Swara | Builds the budget, records spend, settles. **Cannot** run the event |
| President | Swara | Everything the club can do, plus assigning roles |
| Organiser | Lens | Runs the **live** event and its scan station |
| Cultural Society | — | Approval gate 1, for cultural and literary clubs |
| Dean | — | The mandatory gate. Venues and the semester overview |
| Management | — | Large budgets only. Aggregate reporting, no individual records |

Each account lands on its own first page, and the sidebar shows only the pages that
role can open.

---

## A suggested run-through

Takes about ten minutes and covers the whole workflow.

1. **Treasurer** → *New event* → choose "price it later" → *Budget* → add two
   entries → *Club events* → send for approval.
2. **Treasurer** again → create another → on *Budget*, declare it needs **no budget**
   with a reason.
3. **Cultural Society** → *Society approvals* → the nil declaration appears where the
   figures would be. Approve both.
4. **Dean** → *Approvals* → sanction a head below what was asked, then approve.
5. **Dean** → *Venues* → two clubs want Seminar Hall A. Try approving one first; it
   refuses. Move one, then approve.
6. **Organiser** → *Scan station* → check someone in, scan the same pass again, then
   try the forged code. Watch the capture rate move.
7. **Student** → *Profile QR* → reissue it, then try the old code at the door.
8. **Management** → notice the sidebar has two pages, then try to find a roster.

---

## Things that are meant to refuse you

Worth knowing before you file them as bugs — though if a rule is wrong for how your
college actually works, **say so**, because that is the feedback worth having.

| You try | It refuses because |
|---|---|
| Club member opens *Budget* | Budget visibility begins at Treasurer |
| Treasurer closes an event | Preparing a budget and running the night are different jobs |
| Treasurer works a door | The scan response carries names and PRNs |
| Dean's queue is empty | It is still with the Cultural Society |
| Approving over a venue clash | The Dean moves one event first |
| Management opens a roster | Management gets aggregates, never individuals |
| Settling before the event ran | Sanction → event runs → settle, in that order |
| Staff signing in with no code | A second factor is mandatory for staff roles |

---

## Notes for whoever runs the pilot

- **Each browser is its own world.** Two testers on two laptops do not see each
  other's actions. That is deliberate — nothing leaves the page — but it means you
  cannot hand a proposal from one person to another. One tester switches accounts to
  play both sides.
- **"Reset data"** in the top banner reseeds that browser. Sign-in details do not
  change.
- **Roles are per browser tab** where the build supports it, so one tester can keep
  the Dean in one tab and the Treasurer in another.
- **Rotating a password** means editing `DEMO_ACCOUNTS` in `src/credentials.js` and
  this file. The smoke test fails if the two disagree, so they cannot drift.

## How this maps to the real thing

The pilot authenticates against its own user table and issues a session carrying the
same claims the portal's single sign-on will. `Identity_Login_Shared_Data` §5.2 is
explicit that switching to portal SSO must change only where the token comes from and
which key validates it — so these screens, the error codes and the claims are built
to survive that switch untouched. In production there are no shared passwords: people
sign in with their institutional account, and the second factor is a real one.
