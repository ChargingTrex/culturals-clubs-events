# End-to-end suites (Robot Framework)

The ten-minute run-through from `web-app/DEMO_CREDENTIALS.md` as executable suites against the real
backend and the React app, plus a regression pack that proves the non-negotiable features still work
on every push. `api/` drives the module API (RequestsLibrary); `ui/` drives the app in headless
Chromium (Browser library), selecting by role, label, test id and visible text. Every outcome is
checked three ways: the API answer, the rows in the database (`resources/db.py`, read-only SQLite),
and, in the UI suites, the screen.

## One command: `ci.sh`

    ./ci.sh smoke          # venv, seeded database, backend, built frontend, then the smoke tag (≈ 10 min)
    ./ci.sh full           # every suite, api then ui
    ./ci.sh unit           # only the one-rule API suites (--include unit)
    ./ci.sh up             # boot everything and stay up; then `source /tmp/culturals-e2e/env.sh` and use run.sh
    ./ci.sh reseed         # fresh seed into the running stack's database

`ci.sh` creates the Python venv **outside** this tree (the parent folder's name has a colon, which
`venv`, `PYTHONPATH` and `PATH` cannot carry; `E2E_VENV`, default `/tmp/culturals-venv`), installs
`../backend/requirements.txt` and `requirements.txt`, runs `rfbrowser init chromium` once, migrates
and seeds a dedicated SQLite file (`config/settings_e2e.py`, `E2E_WORK`, default `/tmp/culturals-e2e`)
and starts the backend and a production build of the frontend served by `vite preview`. The
developer's `backend/.env` and `db.sqlite3` are never touched. Several stacks can run side by side:

    E2E_API_PORT=8832 E2E_WEB_PORT=5232 E2E_WORK=/tmp/culturals-e2e-a ./ci.sh up

`.github/workflows/e2e.yml` runs the same script: the smoke tag on every push, everything on pull
requests and on `main`/`prototype`, alongside the frontend's typecheck + Vitest and the Django tests.
The Robot report is uploaded as the `robot-smoke` / `robot-full` artifact.

## By hand: `run.sh`

`run.sh` starts nothing; both servers must be up (`ci.sh up` does that, or follow the steps below).

    ./run.sh api | ui | all          # suite folders, in story order
    ./run.sh smoke                   # --include smoke across api and ui
    ./run.sh unit                    # the one-rule API suites
    ./run.sh api --include members   # any robot option passes through
    ./run.sh tables                  # write results/expected_tables.json from Django's model registry (api/09 needs it)

Without `ci.sh`:

    cd ../backend
    rm -f db.sqlite3 && python manage.py migrate && python manage.py seed_demo
    JOBS_TOKEN=e2e-jobs-token-0123456789abcdef0123456789abcdef CORS_ALLOWED_ORIGINS=http://localhost:5213 python manage.py runserver 8813
    cd ../frontend && npm ci && VITE_API_BASE=http://localhost:8813/api/v1 npx vite --port 5213 --strictPort

Reports land in `results/` (git-ignored): `report.html`, `log.html`, `output.xml`, one deliberate
screenshot per UI suite and Browser's failure screenshots under `results/browser/screenshot/`.

## Tags

| Tag | Meaning |
|---|---|
| `api`, `ui` | the suite folder |
| `smoke` | the short pack run on every push: sign-in, one approval path, budget text boxes, join requests, the Dean's calendar move, the feed journey, the schema check |
| `unit` | one-rule API tests (api/09–17): each asserts one API rule and the row it writes |
| `regression` | set on every test by `robot.args` |
| `db approvals decisions budget calendar members feed notifications dashboards report participation jobs` | the feature a test guards |
| `known-issue` | a test that documents a product bug still open; `robot.args` reports it as SKIP, not FAIL, so the run stays readable until the bug is fixed |

Known issues on 2026-11-09 (see `docs/qa/e2e-findings-2026-11-08.md`): with an empty `sanctioned`
map the Dean's approval leaves every line unsanctioned (`api/08`); the Vice-Chancellor's sanction map
is accepted and ignored; some notification links still point at routes the app does not have.

## Seed, offsets and order

Every run consumes the seed (approvals are decided, passes are scanned, budgets settle): `api/03`
decides Street Play and Culturals Night, `api/04` resolves the Seminar Hall A clash, `api/06`
settles Dance Showcase. Run `api` before `ui`, and reseed before a repeat (`ci.sh reseed`). The seed
is deterministic (`random.Random(42)`), which is why `resources/variables.py` can name the accounts
by email. A suite that needs more people picks them with `Club-less Student    n` (db.resource),
never by adding memberships to the named persona accounts (`ui/10` asserts their page lists).

Suites book their own events, at 10:00–12:00 on the campus clock, each in its own block of
`days_ahead` so they never clash with one another:

| Suite | Days ahead |
|---|---|
| api/02–05 | 30, 32, 34, 36 |
| ui/12, ui/13 | 50, 52, 54 |
| api/08 | 61–68 |
| ui/15 | 71–73 |
| api/09 | 80 (open block: third coming Wednesday) |
| api/10 | 85–89 |
| api/12 | 86–89 (open block: second coming Wednesday, Music Club) |
| api/13 | 90–92 |
| api/16 | 94–96 |
| api/17 | 97–98, plus the last day of the seeded semester (Seminar Hall B 14:00) |
| ui/16 | 100–101 |
| ui/17 | 102 |
| ui/18 | 103–106 (open block: next Wednesday, Photography Club) |
| api/14 | 105–109 |
| ui/19–20 | 107–109 |
| ui/21 | 115 |
| api/15 | 110–114 |

## Time zones

Bookings are whole hours on the campus clock (Asia/Kolkata) and the React calendar lays its grid out
in **browser-local** time (`frontend/src/staff/calendarTime.ts`), so `Open App` pins the browser
context to `timezoneId=Asia/Kolkata`, `locale=en-IN`, and `ci.sh` exports `TZ=Asia/Kolkata`. Time
labels on screen ("Book 03:00 pm–04:00 pm") are matched by prefix; times are asserted in the database.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `API_BASE` | `http://localhost:8813/api/v1` | the module API |
| `WEB_BASE` | `http://localhost:5213` | the React app |
| `SEED_PASSWORD` | `culturals-demo` | every seeded account's password |
| `MFA_CODE` | `123456` | any non-empty code is accepted for staff in local mode |
| `JOBS_TOKEN` | the value `ci.sh` exports | opens `/jobs/*` |
| `DB_PATH` | `../backend/db.sqlite3` | the backend's SQLite file, read-only, for the database checks |
| `EXPECTED_TABLES_FILE` | `results/expected_tables.json` | the table list from `run.sh tables` |

`ci.sh` writes all of them to `$E2E_WORK/env.sh`; `source` it before `run.sh`.

## Layout

    resources/variables.py   env, the seeded accounts and event titles, fixtures, seed minimums
    resources/api.resource   session, Login As, finders, Propose, lines/CSV, joining, calendar, open block, notifications, report
    resources/ui.resource    Open App (pinned time zone), Sign In As, by-label/role helpers, toasts, uploads, calendar days
    resources/db.resource    what was stored: events, lines, steps, memberships, join requests, notifications, audit (db.py)
    fixtures/                CSV files for the budget import and a tiny PNG for photos
    api/01…08_*.robot        sign-in → proposal → approvals → venues → door → settlement → jobs → every decision path
    api/09…17_*.robot        schema + write/read-back, budget editing, members and joining, calendar and the Dean's moves,
                             feed and visibility, notifications, dashboards, edits and locks, post-event report
    ui/10…15_*.robot         nav per persona → student → club → staff → scan station → decisions on screen
    ui/16…21_*.robot         budget text boxes and CSV, join requests, calendar and moves, feed journey, dashboards, report
    robot.args               shared robot options; run.sh adds the suite folder
    run.sh / ci.sh           run against servers already up / boot everything and run
