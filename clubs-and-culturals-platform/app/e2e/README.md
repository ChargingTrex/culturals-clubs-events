# End-to-end suites (Robot Framework)

The ten-minute run-through from `web-app/DEMO_CREDENTIALS.md`, as executable suites against the
real backend and the React app. `api/` drives the module API (RequestsLibrary); `ui/` drives the
app in headless Chromium (Browser library), selecting by role, label, test id and visible text.

## Prerequisites

- Python venv with the backend's requirements plus `robotframework`, `robotframework-requests`
  and `robotframework-browser`; then `rfbrowser init` once (installs Playwright's Chromium).
- Backend running with its seed (`JOBS_TOKEN` set in `backend/.env`, 32+ characters):

      cd ../backend
      rm -f db.sqlite3 && python manage.py migrate && python manage.py seed_demo
      CORS_ALLOWED_ORIGINS=http://localhost:5213 python manage.py runserver 8813

- Frontend running against it (UI suites only):

      cd ../frontend && npm ci
      VITE_API_BASE=http://localhost:8813/api/v1 npx vite --port 5213 --strictPort

`run.sh` starts nothing: both servers must already be up.

## Run

    ./run.sh api          # the seven API suites, in story order
    ./run.sh ui           # the five UI suites
    ./run.sh all          # both
    ./run.sh api --include smoke     # any robot option passes through; tags: api, ui, smoke

Reports land in `results/` (git-ignored): `report.html`, `log.html`, `output.xml`, one
deliberate screenshot per UI suite (`10-student-nav.png` …) and Browser's failure screenshots
under `results/browser/screenshot/`.

## Reset the seed

Every run consumes the seed (approvals are decided, passes are scanned, budgets settle). Before
each full run:

    cd ../backend && rm -f db.sqlite3 && python manage.py migrate && python manage.py seed_demo

The seed is deterministic (`random.Random(42)`), which is why `resources/variables.py` can name
the accounts by email.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `API_BASE` | `http://localhost:8813/api/v1` | the module API |
| `WEB_BASE` | `http://localhost:5213` | the React app |
| `SEED_PASSWORD` | `culturals-demo` | every seeded account's password |
| `MFA_CODE` | `123456` | any non-empty code is accepted for staff in demo mode |
| `JOBS_TOKEN` | the value written to `backend/.env` for this run | opens `/jobs/*` |

Set them in the shell before `run.sh`; `resources/variables.py` reads them with these defaults.

## Layout

    resources/variables.py   env + the seeded accounts and event titles
    resources/api.resource   session, Login As, Problem Code Should Be, finders, small actions
    resources/ui.resource    Open App, Sign In As, Expect Problem Banner, by-label/role helpers
    api/01…07_*.robot        sign-in → proposal → approvals → venues → door → settlement → jobs
    ui/10…14_*.robot         nav per persona → student (phone) → club → staff → scan station
    robot.args               shared robot options; run.sh adds the suite folder
