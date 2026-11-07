# Vice-Chancellor guide

This chapter is for the Vice-Chancellor (management). You are the last approval gate, and only
for the largest proposals: those with a budget above ₹50,000 and events that are part of a fest.
You can also read the semester report.

## How a proposal reaches you

1. **Submitted** by the club, with its budget.
2. **Cultural Society**: only for cultural and literary clubs.
3. **Dean of Student Affairs**: every proposal. The Dean sanctions the budget line by line and
   may lower a line, never raise it.
4. **Vice-Chancellor** (you): only when the budget is above ₹50,000 or the event is part of a
   fest. Everything else is published by the Dean's approval and never reaches you.
5. **Published**: students can see the event and register.

So by the time a proposal is in your queue, the Society (if needed) and the Dean have already
approved it, and the Dean has set the sanctioned amounts.

## Signing in

Sign in with your **Institutional email** and **Password**, click
**I have an authenticator code**, type the 6-digit code from your authenticator app, and click
**Sign in**. The Vice-Chancellor cannot sign in without the code, and approving at your gate is
refused for any session that was not verified with it. These approvals release the largest
amounts, so a password alone must not be enough. Each decision is marked **MFA** in the trail.
See the [Cultural Society guide](cultural-society.md#signing-in) for a picture of the form.

## What you see after signing in

You start on **Above-threshold**, titled **Vice-Chancellor approvals**. The side menu has:

- **Above-threshold**: proposals waiting for you.
- **Semester report**: attendance and money for the semester.

![Vice-Chancellor approvals with Culturals Night 2026 waiting](img/vc-01-queue.png)

The figures show how many proposals are **Waiting**, how many are **Past SLA** (waiting more
than 48 hours at your gate) and the total **Requested**. Turn on **Only items past the 48h SLA**
to see only the late ones. Every card here carries the **Needs VC** tag.

## Review and approve a proposal

1. On a card, click **Review**.
2. Check the proposal:
   - The **route** shows the Cultural Society and the Dean approved, with names and dates, and
     that it is now **Waiting** at the Vice-Chancellor.
   - Under **Requested**, the reason it came to you, for example
     **Goes to the Vice-Chancellor: budget over 50000**.
   - **Budget**: what the club requested and what the Dean sanctioned for each line.
   - **Approval trail**: each earlier decision with its comment and the **MFA** mark.

   ![Culturals Night 2026 at the Vice-Chancellor's gate](img/vc-02-proposal.png)

3. In **Your decision**, type a **Comment** if you want to. It is optional to approve and
   **required to return or reject**. The club sees it.
4. Choose one:
   - **Approve**: the event is published at the amounts the Dean sanctioned.
   - **Return for changes**: the club can revise and resubmit it.
   - **Reject**: the proposal is closed.

   ![Decision panel with a comment, Return for changes, Reject and Approve](img/vc-03-decision.png)

5. You return to your queue with a confirmation, for example **Approved: Culturals Night 2026**.

   ![Queue empty after approving, with the confirmation message](img/vc-04-approved.png)

Open the proposal again to see the finished route (**Sanctioned · Published**) and all three
decisions in the trail.

![Culturals Night 2026 approved and published, with three decisions in the trail](img/vc-05-published.png)

You do not edit budget lines at your gate. If an amount looks wrong, return the proposal with a
comment.

## Semester report

**Semester report** shows totals for completed events in the current semester: events run,
attendance, unique students, average attendance, external guests, money requested, sanctioned
and spent, and attendance by club, category and department, followed by a table of events. It
has totals only, no individual student records. Click **Download CSV** to save it as a
spreadsheet.

![Semester report](img/vc-06-report.png)

## Good to know

- **Why is my queue empty?** Only proposals above ₹50,000 or part of a fest come to you, and only
  after the Dean has approved them.
- **Why don't I have "This semester"?** The day-to-day overview (what needs chasing, venue
  clashes) is for the Dean and the Cultural Society. The Vice-Chancellor gets the semester
  report.
- **Why can't I approve?** If the error says a second factor is required, sign out and sign in
  again with your authenticator code. If it mentions a venue clash, the Dean has to move one of
  the events first.
- **Covering for someone?** If someone else is covering your gate (or you are covering theirs),
  a note at the top of the queue says so, and the trail records both names.

## Known issues

- Seeded demo events show 5 h 30 min later than intended (Culturals Night 2026 shows
  10:30 pm–03:30 am). `seed_demo.py` builds times with `timezone.make_aware` while
  `TIME_ZONE="UTC"`, so the local hours are stored as UTC and shown in IST.
- The reason line shows a raw number ("budget over 50000") rather than "₹50,000".
- The Semester report's **Requested** tile says "across every budget this semester", but it adds
  up completed events only, so approving Culturals Night 2026 does not change it.
