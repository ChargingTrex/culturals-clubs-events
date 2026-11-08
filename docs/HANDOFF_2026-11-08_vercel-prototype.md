# Handoff: prototype branch and Vercel demo (2026-11-08)

Goal: a public demo of the platform for collecting feedback. It should be live at
https://culturals-clubs-events.vercel.app, with one-click pilot accounts on the sign-in page.

## Where things stand

| Item | State |
|---|---|
| `prototype` branch | Everything merged: `design-system-ui`, `wave4/calendar`, `wave4/reporting` (WIP, backend only, unverified), VC overview/calendar, user guide, `PILOT_ACCOUNTS`. Pushed. |
| GitHub `main` | Was the static web-app walkthrough. Now replaced by merge commits whose tree equals `prototype`. The walkthrough history is kept as first parent, so revert to restore it. |
| `platform/main` | Untouched at `0b8ef99`, now behind `prototype`. |
| Frontend on Vercel | **Live.** The root `vercel.json` builds `clubs-and-culturals-platform/app/frontend`. Deep links work. |
| Backend on Vercel | **Not deployed.** No project exists yet. |
| Neon database | **Migrated and seeded** (1,695 rows; 8 of 8 pilot accounts verified). The seed ran into a temp SQLite file and was bulk-loaded, because a direct `seed_demo` over the network kept losing the connection. |
| Backend build | Failed with empty build logs: Hobby rejects crons that run more than once a day. Fixed by making every cron daily. |
| Pilot buttons on sign-in | **Not showing.** The frontend has no `VITE_API_BASE`, so it calls `localhost:8000`. |

Tests at handoff:
- Backend: 444 tests run. All pass except 4 Celery tests, which only fail in a venv without Celery. Two real gaps (`complete-ended` task/beat) were fixed in `af809f3`. The new `PILOT_ACCOUNTS` tests pass, and 19 demo and auth tests pass.
- Frontend: 80 vitest tests pass, plus `tsc` and `vite build`.
- Not run: the Robot e2e suites (`app/e2e`) on the merged branch.

## Remaining steps, in order

1. **Free disk space.** The machine is full (about 870 MB free), and commands fail with ENOSPC.
   - Old merged worktrees can be removed with `git worktree remove --force <dir>`: `/private/tmp/claude-501/.../scratchpad/wt/*` and `.claude/worktrees/agent-*`.
   - Keep `/private/tmp/claude-501/.../0ea16a87-.../scratchpad/venv`, the Python 3.12 venv with Celery.
   - The bulk of the disk is elsewhere (Android emulator, Docker).
2. **Migrate and seed Neon from a laptop.** Vercel functions have no shell; see `docs/HOSTING.md` §2.
   ```sh
   cd clubs-and-culturals-platform/app/backend
   export DATABASE_URL='<Neon pooled URL>' DJANGO_DEBUG=1
   <venv>/bin/python manage.py migrate
   <venv>/bin/python manage.py seed_demo
   ```
   Check first whether seed data signed with `QR_SIGNING_KEYS` must match the backend's key. If so, export the same `QR_SIGNING_KEYS` / `QR_ACTIVE_KEY_ID` you put on Vercel.
3. **Create the backend Vercel project** from this repo. Root Directory: `clubs-and-culturals-platform/app/backend`. Its `vercel.json` already sets up the build, the function and the crons. Environment variables:
   ```
   DJANGO_SECRET_KEY=<token_urlsafe(50)>
   DJANGO_DEBUG=0
   DJANGO_ALLOWED_HOSTS=.vercel.app
   DATABASE_URL=<Neon pooled URL>
   QR_SIGNING_KEYS=v1:<token_urlsafe(48)>
   QR_ACTIVE_KEY_ID=v1
   CORS_ALLOWED_ORIGINS=https://culturals-clubs-events.vercel.app
   CSRF_TRUSTED_ORIGINS=https://culturals-clubs-events.vercel.app
   CELERY_TASK_ALWAYS_EAGER=1
   CELERY_BROKER_URL=memory://
   EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
   INTEGRATION_MODE=local
   PILOT_ACCOUNTS=1
   ```
4. **Point the frontend at the backend.** In the `culturals-clubs-events` project, set
   `VITE_API_BASE=https://<backend>.vercel.app/api/v1`, then **redeploy**. The value is baked into the build.
5. **Verify:**
   - `GET <backend>/api/v1/module/auth/demo/personas` returns 200 with personas.
   - The sign-in page shows one button per role.
   - A student signs in; a staff account signs in with any code (e.g. `123456`).
6. **Rotate the Neon password.** It was pasted into a chat session. Reset it in Neon, then update `DATABASE_URL` on Vercel.

## Decisions made this session

- **Hosting is Vercel for both apps.** Netlify was tried and dropped, so there's no `netlify.toml`.
- **`PILOT_ACCOUNTS`** (`config/settings.py`, `identity/views.py` `DemoPersonasView`) lists the seeded accounts with the shared demo password, and works with `DEBUG=0`.
  - It does not enable `DEMO_MODE`. The passwordless `/auth/demo/<persona>` login stays 404, and `DEMO_MODE` still refuses to run with `DEBUG=0`.
  - Trade-off: anyone with the URL can sign in as any pilot role, including Dean and VC. Only use it over seeded demo data.
- **Merge conflicts resolved:**
  - `seed_demo.py`: the same IST fix was on both sides, so one copy was kept.
  - `events/serializers.py` and `events/services.py`: both sides kept.

## Known risks

- `wave4/reporting` is WIP and unverified in the UI.
- GitHub Pages for the old walkthrough no longer updates, because `pages.yml` was removed. Any Netlify site linked to `main` will fail its next build.
- The web-app's `/user-guide/` page is no longer deployed. The guide now lives in `docs/user-guide/`.
- Earlier, another session ran `git pull origin main --rebase` here. It was aborted. Local `main` sits at `b32e3c1` and is not the remote `main`.
