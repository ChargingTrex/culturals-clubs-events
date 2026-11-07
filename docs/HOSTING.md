# Test hosting runbook (CHECKLIST H-01)

Backend on Vercel + Neon, walkthrough on Netlify, React on Vercel later. Every
step below is done by a human with the accounts; nothing is deployed from CI.
Config lives in `clubs-and-culturals-platform/app/backend/` (`api/index.py`,
`vercel.json`, `build_files.sh`, `.env.example`).

| Piece | URL (fill in once created) |
|---|---|
| Backend API | `https://<backend-project>.vercel.app/api/v1/` |
| Walkthrough (web-app) | `https://<site>.netlify.app` |
| React frontend | `https://<frontend-project>.vercel.app` (Wave 2, F-01) |

## 1. Neon database (5 min)

1. neon.tech → New project → region closest to testers (Singapore for IST),
   Postgres 16. Name the database `culturals`.
2. Copy the **direct** (non-pooled) connection string. Django 5.2 + psycopg 3
   disables prepared statements, so the `-pooler` string also works if the
   direct one hits its connection limit under load.
3. `settings.py` parses `DATABASE_URL` with `urlparse` and ignores the query
   string (`?sslmode=require` is dropped); psycopg negotiates TLS on its own,
   which Neon requires, so the connection still succeeds.

## 2. Migrate and seed from a laptop (5 min)

Vercel functions have no shell, so the first migrate and the seed run locally
against Neon:

```sh
cd clubs-and-culturals-platform/app/backend
export DATABASE_URL='postgres://<user>:<password>@<host>.neon.tech/culturals'
python manage.py migrate
python manage.py seed_demo            # --flush to reseed from scratch
```

`seed_demo` prints the accounts; password for every account is
`culturals-demo` (staff: `dean@college.edu`, `vc@college.edu`,
`cultural.secretary@college.edu`; students as listed in
`web-app/DEMO_CREDENTIALS.md`). Re-run `migrate` from the laptop after every
backend deploy that adds a migration; CI's `makemigrations --check` tells you
when.

## 3. Vercel project for the backend (10 min)

1. vercel.com → Add New → Project → import the GitHub repo.
2. **Root Directory**: `clubs-and-culturals-platform/app/backend` (Edit → tick
   "Include source files outside of the Root Directory" is NOT needed).
   Framework Preset: Other. Build/Output settings are taken from `vercel.json`
   (`buildCommand: bash build_files.sh`, `outputDirectory: staticfiles_build`).
3. Environment Variables (Production + Preview). Generate secrets with
   `python -c "import secrets; print(secrets.token_urlsafe(50))"`:

   | Variable | Value |
   |---|---|
   | `DJANGO_SECRET_KEY` | 50+ random chars |
   | `DJANGO_DEBUG` | `0` |
   | `DJANGO_ALLOWED_HOSTS` | `<backend-project>.vercel.app,.vercel.app` |
   | `DATABASE_URL` | the Neon string from step 1 |
   | `QR_SIGNING_KEYS` | `v1:<32+ random bytes>` (never derived from the secret key) |
   | `QR_ACTIVE_KEY_ID` | `v1` |
   | `CORS_ALLOWED_ORIGINS` | `https://<frontend-project>.vercel.app,https://<site>.netlify.app` |
   | `CSRF_TRUSTED_ORIGINS` | `https://<backend-project>.vercel.app` |
   | `CELERY_TASK_ALWAYS_EAGER` | `1` |
   | `CELERY_BROKER_URL` | `memory://` |
   | `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` (mail appears in the function log) |
   | `EMAIL_HOST` / `EMAIL_PORT` / `DEFAULT_FROM_EMAIL` | `localhost` / `1025` / `culturals@college.edu` |
   | `INTEGRATION_MODE` | `local` |
   | `DEMO_MODE` | `0` (it refuses to start with `DEBUG=0`; the `/demo/` pages stay local-only) |
   | `CERTIFICATE_VERIFY_BASE` | `https://<frontend-project>.vercel.app/verify` |

   Settings load during the build too (collectstatic), so leave the variables
   available to the build (the default).
4. Deploy. The function is `api/index.py` (`app` = Django WSGI); `vercel.json`
   rewrites every path to it and the function sees the original path. Python
   version is Vercel's default (3.12). If Vercel rejects `maxDuration: 30` on
   the Hobby plan, lower it to `10` in `vercel.json`.

## 4. Verify (2 min)

```sh
curl -s https://<backend-project>.vercel.app/api/v1/module/auth/mode
# {"integration_mode":"local","sso":{"enabled":false,...},"password_login":true,"approval_chain":["cultural_society","dean"]}
curl -s -X POST https://<backend-project>.vercel.app/api/v1/module/auth/login \
  -H 'content-type: application/json' -d '{"email":"dean@college.edu","password":"culturals-demo"}'
```

Open `https://<backend-project>.vercel.app/api/v1/docs` (Swagger UI; assets
come from jsDelivr, `/static/*` from the CDN output, admin at
`/django-admin/` via WhiteNoise). Record the URLs in the table at the top.

## 5. Netlify for the walkthrough (already configured)

`web-app/netlify.toml`: publish directory `.`, no build command, headers set
`text/javascript` for `/src/*.js`. Netlify → Add new site → import `web-app`
(Base directory `web-app` if deploying from the monorepo, else the nested
repo). Nothing to configure; the walkthrough is self-contained (localStorage).

## 6. React frontend on Vercel (Wave 2, after F-01)

Separate Vercel project, Root Directory `clubs-and-culturals-platform/app/frontend`,
Framework Preset Vite, env `VITE_API_BASE=https://<backend-project>.vercel.app/api/v1`.
Then add its domain (and each preview domain you use) to the backend's
`CORS_ALLOWED_ORIGINS` and redeploy the backend.

## 7. Vercel Cron for the jobs endpoints (H-03)

`app/backend/vercel.json` carries a `crons` block (times are UTC):

| path | schedule |
|---|---|
| `/api/v1/jobs/apply-due-terms` | `5 0 * * *` (daily 00:05) |
| `/api/v1/jobs/rollup-scans` | `0 3 * * *` (daily 03:00) |
| `/api/v1/jobs/purge-external` | `10 3 * * *` (daily 03:10) |
| `/api/v1/jobs/flag-dormant` | `20 3 * * *` (daily 03:20) |
| `/api/v1/jobs/escalate-sla` | `0 * * * *` (hourly) |

Vercel Cron issues GET with `Authorization: Bearer $CRON_SECRET`, which is why
`GET /api/v1/jobs/<name>` exists beside the POST form. **`JOBS_TOKEN` must equal
Vercel's `CRON_SECRET`** in the project env, and must be at least 32 characters:
a shorter or missing token makes every trigger answer 503 (`JOBS_DISABLED`), so a
misconfigured host runs nothing rather than running jobs for anyone.

The Hobby plan runs each cron at most once a day; `escalate-sla` hourly needs
Pro, and on Hobby it degrades to a daily check without any change here.

## 8. Known limits of this test host

- **Cold start** 1–3 s on the first request after idle; the scan station's
  offline queue covers it, but this is not the sub-second scan NFR. Production
  hosting is a separate decision (Render/Fly/VM with a real worker).
- **No Celery worker**: every task runs inline in the request
  (`CELERY_TASK_ALWAYS_EAGER=1`); scheduled jobs come from Cron (§7).
- **No local disk**: receipt/photo uploads through
  `integrations/files.py::LocalFileStore` write under `BASE_DIR/media`, which
  on Vercel is read-only and discarded. Before testing uploads, add an
  S3-compatible `FileStore` (Cloudflare R2 or Supabase Storage) and register it
  in `integrations/registry.py` under `"files"`; the DB stores keys only.
- **No SMTP**: mail is logged, not delivered (console backend).
- **Migrations** are applied from a laptop (§2), never by the function.
- `check --deploy` still warns W002/W004/W008 (X-Frame-Options, HSTS, SSL
  redirect): acceptable on a bearer-token API behind Vercel's TLS.
