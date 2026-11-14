# Handoff: where the platform stands (2026-11-09)

This is the starting point for whoever picks the platform up next. It covers what is live, what
is committed, the large set of work that is **not committed yet**, known bugs, and the next steps
in order. Earlier handoffs go deeper on single topics:

- `HANDOFF_2026-11-08_vercel-prototype.md` covers hosting.
- `HANDOFF_2026-11-08_worktree-cleanup.md` covers the leftover worktrees.
- `HANDOFF_2026-11-09_quick-guide.md` covers the user guides.

## Live right now (checked 2026-11-09)

| What | Where | Checked |
|---|---|---|
| Frontend | https://culturals-clubs-events.vercel.app | `/signin` returns 200 |
| Backend | https://culturals-clubs-events-backend.vercel.app/api/v1 | 8 of 8 pilot accounts listed. Society, Dean and VC need a code. A student signs in (200). |
| Quick guide | https://chargingtrex.github.io/culturals-clubs-events/user-guide/quick-guide.html | Live since `ff26705` |
| Database | Neon Postgres, seeded | Through the backend above |

On the sign-in page, every pilot account uses the password `culturals-demo`. Staff accounts accept
any six-digit code, such as `123456`.

**Vercel deploys only what is pushed.** None of the uncommitted work below is live.

## Git

| Branch | State |
|---|---|
| `prototype` (checked out) | `6aee1d5`, the same as `origin/prototype`. This is the integration branch: `design-system-ui`, `wave3/*` and `wave4/*` are all merged into it. |
| `main` | `origin/main` is at `ff26705`, merged from `prototype`. Local `main` is stale (`b32e3c1`); don't build on it. |
| `design-system-ui`, `wave3/*`, `wave4/*` | Merged. Keep them for history or delete them. |
| `platform/main` (remote) | Old (`0b8ef99`), far behind `prototype`. |

To publish a change: commit on `prototype`, push, then merge into `main` with a `Merge prototype: …`
commit. Both Vercel projects and the guide build from what is pushed.

## Uncommitted work in the tree (55 modified, 37 untracked)

This work comes from other sessions. It is tracked in `docs/CHECKLIST.md` under **Additional
requirements**. Each row there has an id from AR-01 to AR-08 or T-02.

| Id | What | Status in the checklist |
|---|---|---|
| AR-01 | Post-event report panel (`club/PostEventReport.tsx`, which replaces `CloseForm`): attendance, photos, posts, bills, outcomes; student photo consent and removal requests | done-unverified (not clicked through in a browser) |
| AR-02 | Calendar for presidents (other clubs' pending bookings anonymised); Dean-only reschedule of time and venue | done-unverified |
| AR-03 | Wednesday open block from 15:00 to 17:00 IST: first come, first served, approved automatically, one slot per club per Wednesday. Adds migration `events/0006_open_block_kind.py` and `tests/test_open_block.py`. | done-unverified |
| AR-04 | Treasurer: "Edit all" mode, and CSV import of budget lines | done-unverified |
| AR-05 | Five-club cap in the test mock | done-unverified |
| AR-06 | `/club/join-requests` with bulk approve and decline | done-unverified |
| AR-07 | `docs/user-guide/overview-for-vc.md` | done-unverified (not rendered by `build.py`; see step 4) |
| AR-08 | `EMAIL_TO_ANIL_SIR.md`, a draft email to the VC | in progress: needs a deploy and a hosted sign-in check first |
| T-02 | Robot regression pack: API suites 09–17, UI suites 16–21, `e2e/ci.sh`, `.github/workflows/e2e.yml` | green locally, not yet run in CI |

Last full run, from `docs/qa/e2e-findings-2026-11-09.md`, on this working tree:
- 222 tests: 218 passed, 0 failed, 4 skipped.
- The 4 skipped tests are tagged `known-issue`; they are the open bugs listed below.

I did not re-run the suites while writing this handoff.

## Next steps, in order

1. **Review and commit the uncommitted work on `prototype`.** Split it into a few commits by Id.
   - Run the checks first: `cd clubs-and-culturals-platform/app/e2e && ./ci.sh full`, the Django suite and Vitest.
   - Leave out `EMAIL_TO_ANIL_SIR.md` unless you mean to keep it in the repo.
2. **Push, and check the deploy.**
   - The open-block migration has to be run against Neon from a laptop. Vercel has no shell; see `HOSTING.md` §2.
   - Then sign in on the hosted site as every pilot role, and click through the post-event report (AR-01) once.
   - Finally, watch the new `e2e.yml` workflow pass on GitHub (T-02).
3. **Fix the open bugs** below. Bug 1, the money bug, is fixed; bug 5 (the VC's amounts) is the other money bug.
4. **Decide on the VC overview**:
   - Either add `overview-for-vc.md` to `docs/user-guide/build.py`, or remove its link from `docs/user-guide/README.md`.
   - Then send the email to the VC (AR-08).
5. **Rotate the Neon password** if that hasn't been done. It was pasted into a chat on 2026-11-08 (see the Vercel handoff).
6. **Housekeeping.**
   - Remove the old worktrees listed by `git worktree list`: three `.claude/worktrees/agent-*` and two detached ones under `/private/tmp/claude-501/…`.
   - Delete merged branches if you like.

## Open bugs (from the 2026-11-09 e2e findings)

| # | Bug | Where |
|---|---|---|
| 1 | ~~**Money.** If the Dean approves without a `sanctioned` map, the event is published but every budget line's `amount_sanctioned` stays NULL.~~ **Fixed 2026-11-10 (uncommitted):** approving without edits now sanctions every line as requested. Covered by `test_approving_without_edits_sanctions_every_head_as_requested` and `api/08`, which is no longer tagged `known-issue`. | `governance/services.py` |
| 2 | When the Dean moves an event, a registered student gets two notices. One links to `/club/<club>/events/<id>`, a route that doesn't exist. | `participation/signals.py`, `participation/services.py` |
| 3 | Several notification links point at pages that don't exist: `/me/passes` (the page is `/passes`), `/clubs/<id>`, and `/club/<club>/events/<id>`. | `participation/services.py`, `clubs/services.py`, `events/services.py` |
| 4 | `PATCH /events/{id}` accepts a capacity larger than the venue. Only the create path checks it. | `events/serializers.py` |
| 5 | The VC's `sanctioned` map is accepted and silently ignored. | `governance` decide |

## Other open questions

- **Clash count.** Should the semester clash count leave out pairs of events that have both already
  happened? The venue rules themselves are fixed and tested in `cbeb1f1`:
  - no moves into closed venues
  - no moves onto a slot another club has pending
  - no moves of past events
  - everyone gets the venue-change notice
- **Feedback contact.** The quick guide says "send it to the Culturals team" but gives no address.
- **Member screenshot.** `docs/user-guide/img/club-03-nav-member.png` shows "Send for approval" to a
  plain member. Either the screenshot is stale or the button shows for the wrong roles.

## Running it locally

**The repository path contains a colon** (`culturas:club management platform `, with a trailing
space). That breaks `venv`, `npx`, `npm run`, Vitest and the Vite dev server when they run inside the
tree. Two ways around it:

- **Easiest: `e2e/ci.sh`.** It keeps its venv in `/tmp/culturals-venv`, calls `node node_modules/…`
  directly and uses its own database, so your `backend/db.sqlite3` is never touched.
  ```sh
  cd clubs-and-culturals-platform/app/e2e
  ./ci.sh up      # backend on :8813, frontend on :5213 (production build), Ctrl-C to stop
  ./ci.sh full    # the whole regression pack
  ```
  Note that `ci.sh` turns off `DEMO_MODE` and `PILOT_ACCOUNTS`, so the sign-in page shows no pilot list.
- **Pilot list locally.** Run the backend from a venv outside the tree, then run the frontend from a
  copy of `frontend/` outside the tree (rsync without `node_modules`, then `npm ci` in the copy):
  ```sh
  cd clubs-and-culturals-platform/app/backend
  DEBUG=1 DEMO_MODE=1 /tmp/culturals-venv/bin/python manage.py runserver 8000
  node node_modules/vite/bin/vite.js --port 5173   # run this in the frontend copy
  ```

**Before starting the backend, run `manage.py migrate`.** On 2026-11-06 the local database lacked
`identity.0002_user_preferences`, and the sign-in page's account list returned 500 until it was
applied. A copy taken before that migration is at
`/private/tmp/claude-501/-Users-fi-it-Documents-projects-culturas-club-management-platform-/cc5473df-d514-4ba3-9ff4-ebd2e9210837/scratchpad/db.sqlite3.before-migrate`.
`/private/tmp` is cleared on reboot, so don't rely on that copy.

This Mac runs low on memory and disk. Claude Code stops background servers it started when memory
runs short, so start long-running servers in your own terminal.

## What the design-system work added (for orientation)

- **Global design config.**
  - Every colour, font, radius, spacing step and type role lives in
    `frontend/src/shared/ds/tokens.css`. Change a value there and every component follows.
  - Components are in `src/shared/ds/` (`components.tsx`, `domain.tsx`, `charts.tsx`), and shared
    lookups are in `config.ts`.
- **One responsive app.** Phone and desktop layouts come from the same markup, switched by `lg:` classes.
- **Theme toggle.** It cycles System → Light → Dark. It sits in the top bars, the tablet sidebar
  footer and the sign-in corner, and the choice is saved under `culturals.theme`.
- **Pilot accounts on sign-in.** One row per role; clicking a row fills the form. They appear when
  `DEMO_MODE` or `PILOT_ACCOUNTS` is on.
  - The rule for which accounts need a code is `user_needs_mfa()` in `identity/views.py`. The login
    and the pilot list both use it.
