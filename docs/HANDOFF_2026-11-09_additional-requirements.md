# Handoff: additional requirements, Part 2 (2026-11-09)

Goal: build the requests in `ADDITIONAL_REQUIREMENTS.md` Part 2 (§12–§21, AR-01 to AR-08), put them on the
hosted pilot, and send the link to Anil sir so he can forward it to the Vice-Chancellor.

## Where things stand

| Item | State |
|---|---|
| AR-01 to AR-07 | **Built and tested, not committed.** Branch `prototype`, working tree only: 55 tracked files changed, plus new files (`git status`). |
| AR-08 (hosted link + email) | **In progress.** Email drafted. Deploy, hosted check and sending are still to do. |
| Hosted frontend / backend | Live at <https://culturals-clubs-events.vercel.app> and <https://culturals-clubs-events-backend.vercel.app>, but on the code **from before** this work. |
| Neon database | Seeded, 8 pilot personas (password `culturals-demo`; staff accept any 6-digit code). Migration `events/0006_open_block_kind` is **not applied** yet. |
| Browser click-through | **Not done** by hand. A Robot e2e run (below) covers the new screens. |

Tests on the working tree:
- Backend: 469 passed, 5 skipped. `makemigrations --check` is clean.
- Frontend: 90/90 vitest tests pass. `tsc` and `vite build` are clean. `eslint` shows one warning that was already there.
- Robot e2e (`app/e2e/ci.sh full`, from another session): 222 tests, 218 passed, 0 failed, 4 skipped as `known-issue`. See
  `docs/qa/e2e-findings-2026-11-09.md`.

## What was built (AR → code)

| AR | What | Main files | Tests |
|---|---|---|---|
| AR-01 | Post-event report panel: attendance, photos, posts (with optional screenshot), bills, outcomes. Missing bills block settlement only. Staff overview shows "No report yet". The report gains highlights and outreach. Students see a consent line and can ask for a photo to be removed. | `frontend/src/club/PostEventReport.tsx`, `staff/OverviewPage.tsx`, `staff/ReportPage.tsx`, `student/EventGallery.tsx`, `student/EventDetailPage.tsx`, `shared/api/files.ts`, `shared/ui/AuthImage.tsx` | vitest; e2e `api/17`, `ui/21` |
| AR-02 | Calendar for President/VP, with other clubs' pending bookings shown only as "Requested". The Dean can move a booking's time and venue; a clash is refused. | `backend/events/views.py` (`VenueCalendarView`, reassign takes `starts_at`/`ends_at`), `frontend/src/staff/CalendarPage.tsx` (`MoveForm`) | `DeanMoveTests`, `test_hour_slots.py`; e2e `api/12`, `ui/18` |
| AR-03 | Wednesday open block, 15–16 and 16–17 IST. First come first served, auto-approved, published with a nil budget, one booking per club per Wednesday. The calendar shades these hours. | `events/views.py` `OpenBlockView` (`/open-block`), `Event.Kind.OPEN_BLOCK`, migration `0006_open_block_kind`, settings `OPEN_BLOCK_WEEKDAY=2`, `OPEN_BLOCK_HOURS=(15,16)` | `tests/test_open_block.py` |
| AR-04 | The Treasurer can "Edit all" lines with one Save, or import a CSV (`POST /budget/budgets/{id}/lines/import`). A bad row writes nothing. | `budget/services.py` `import_lines`, `budget/views.py`, `frontend/src/club/BudgetDetailPage.tsx` (`EditAllRows`) | `BudgetCsvImportTests`; e2e `api/10`, `ui/16` |
| AR-05 | Five clubs per student, also enforced in the test mock | `frontend/src/test/server.ts` | vitest; e2e `api/11` |
| AR-06 | `/club/join-requests` page: approve or decline one by one or in bulk. Bulk sends one accept per request, so a capped student fails on their own row. | `frontend/src/club/JoinRequestsPage.tsx` | vitest; e2e `api/11`, `ui/17` |
| AR-07 | 1–2 page guide for the VC | `docs/user-guide/overview-for-vc.md` (linked from `docs/user-guide/README.md`) | — |
| AR-08 | Email to Anil sir | `EMAIL_TO_ANIL_SIR.md` (repo root) | — |

`openapi.yaml` and `frontend/src/shared/api/schema.d.ts` were regenerated. Decisions made during the build
are logged in `ADDITIONAL_REQUIREMENTS.md` §20. The board rows are in `docs/CHECKLIST.md` (AR-01 to AR-08).

## Remaining steps, in order

1. **Review and commit** on `prototype`. The working tree also holds another session's uncommitted e2e
   work: `app/e2e/**`, `.github/workflows/e2e.yml`, `backend/config/settings_e2e.py` and `docs/qa/e2e-findings-*.md`.
   Commit it separately, or check with whoever owns it first.
2. **Migrate Neon from a laptop** (see `docs/HOSTING.md` §2). This applies `events/0006_open_block_kind`:
   ```sh
   cd clubs-and-culturals-platform/app/backend
   export DATABASE_URL='<Neon pooled URL>'
   <venv>/bin/python manage.py migrate
   ```
3. **Push and redeploy** both Vercel projects (frontend `culturals-clubs-events`, backend
   `culturals-clubs-events-backend`).
4. **Hosted check:** sign in as each of the 8 pilot roles, then try the three things the email suggests:
   - Management: *Above-threshold*, *This semester*, *Semester report*.
   - Dean: *Calendar*. Move a booking; a clashing move is refused.
   - President: book a Wednesday open-block slot, and open a finished event's post-event report.
5. **Send the email.** Fill in the name in `EMAIL_TO_ANIL_SIR.md` and send it from your own account. Attach
   or link `docs/user-guide/overview-for-vc.md`.
6. Once it has been checked on the hosted site, set the AR rows in `docs/CHECKLIST.md` to done.

## Open issues

- **Still to decide** (Student Life Office, `ADDITIONAL_REQUIREMENTS.md` §21):
  - The attendance level above which a social post is required. Default: never.
  - The report due date. Default: 7 days.
  - Whether presidents see other clubs' pending requests. Default: they only see "Requested".
- **Bugs found by e2e and still open** (`docs/qa/e2e-findings-2026-11-09.md`):
  - #1: a Dean approval without a `sanctioned` map leaves `amount_sanctioned` NULL.
  - #2: a Dean's move notifies a registered student twice.
  - #3: some notification links point to pages that don't exist.
  - #4: `PATCH` does not check capacity against the venue.
  - #5: the VC's `sanctioned` map is ignored.
- **Security:** anyone with the link can sign in as any role, the VC included. Keep the hosted site on demo data only.
- The Neon password was pasted into an earlier chat. Rotate it if that hasn't been done (`HANDOFF_2026-11-08_vercel-prototype.md` step 6).

## Working in this repo

- The path contains a colon and a trailing space. `venv`, `npx`, `npm run`, vitest and the Vite dev server all
  break inside it. Run node tools as `node node_modules/vitest/vitest.mjs run` and
  `node node_modules/typescript/bin/tsc`, or copy the frontend into a clean path (rsync) and symlink
  `node_modules`. Use a venv outside the tree, for example `/tmp/culturals-venv`.
- e2e: `app/e2e/ci.sh up|full|reseed`. Ports 8813/5213 may be held by another session. Use
  `E2E_API_PORT`/`E2E_WEB_PORT`, and check with `lsof` first.
- Times are whole hours in India time (`DISPLAY_TIME_ZONE`). The calendar UI test needs the browser set to `Asia/Kolkata`.
