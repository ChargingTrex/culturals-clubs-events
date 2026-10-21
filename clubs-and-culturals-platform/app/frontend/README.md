# Culturals — frontend

React 18 + TypeScript (strict) + Vite + Tailwind v4 + TanStack Query + react-router. The
stack is fixed by `../../AGENT_PROMPT.md` §2. This directory holds the student and organiser
screens (checklist rows F-01..F-03) and the shared shell every role uses; club and staff
screens (F-04, F-05) land in `src/staff/` and alongside later.

```
src/
  shared/
    api/      schema.d.ts (generated), types.ts (hand-typed gaps), client.ts (fetch + refresh +
              ApiError), endpoints.ts (typed calls)
    auth/     tokens.ts (session store), store.ts (login/logout/useSession), useCapabilities.ts
    nav/      pages.ts (the capability → page table), guards.tsx (RequireAuth, RequireCapability)
    ui/       AppShell, Nav, ProblemView, ErrorBoundary, Empty, Pill, Toast, QrImage
  student/    SignInPage, EventsPage, EventDetailPage, PassesPage, ProfilePage, BrightView
  organiser/  (F-03)
  staff/      (F-05)
  test/       MSW server, capability builder, render helper, setup
tests/e2e/    Playwright smoke (needs a running backend)
```

## Run

```bash
export PATH=/usr/local/bin:$PATH     # node 24 / npm
npm install
cp .env.example .env                  # VITE_API_BASE, default http://localhost:8000/api/v1
npm run dev                           # http://localhost:5173
```

The backend must allow this origin in `CORS_ALLOWED_ORIGINS` (its default includes
`http://localhost:5173`). To get a real API with seeded personas:

```bash
cd ../backend
python manage.py migrate && python manage.py seed_demo && python manage.py runserver 8000
```

`seed_demo` prints the demo e-mails; the password is `culturals-demo`. Staff accounts need any
non-empty authenticator code — the sign-in page reveals that field after the first
`AUTH_MFA_REQUIRED` refusal.

## Environment

| variable        | default                        | meaning                                       |
| --------------- | ------------------------------ | --------------------------------------------- |
| `VITE_API_BASE` | `http://localhost:8000/api/v1` | base URL of the module API, no trailing slash |

Vite reads `.env` / `.env.local`; Vercel reads project environment variables at build time.

## Scripts

| command             | what                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `npm run dev`       | Vite dev server on :5173 (strict port)                                  |
| `npm run typecheck` | `tsc --noEmit` for the app and for the node-side configs                |
| `npm run lint`      | ESLint (typescript-eslint, react-hooks, react-refresh) + Prettier check |
| `npm run format`    | Prettier write                                                          |
| `npm run test`      | Vitest (jsdom + MSW); `npm run test:watch` to iterate                   |
| `npm run build`     | typecheck + `vite build` → `dist/`                                      |
| `npm run e2e`       | Playwright smoke against `VITE_API_BASE` (see below)                    |
| `npm run gen:types` | regenerate `src/shared/api/schema.d.ts` from `openapi.yaml`             |

## Refreshing the generated types

```bash
cd ../backend && python manage.py spectacular --file ../frontend/openapi.yaml
cd ../frontend && npm run gen:types
npm run typecheck
```

`openapi.yaml` and `schema.d.ts` are committed so the frontend builds without the backend.
`src/shared/api/types.ts` layers hand-written shapes over the generated ones where
drf-spectacular could not infer them (APIViews with no `responses=` annotation, and
`SerializerMethodField`s that come out as `string`). Each override is commented; delete it once
the backend annotates the view and regenerate.

## How access works in the UI

1. `POST /module/auth/login` (email, password, optional `mfa_code`) → session stored under
   `localStorage['culturals.session']`.
2. Every call attaches the bearer. On a 401 the client refreshes once via
   `POST /module/auth/refresh` (rotation; concurrent 401s share one refresh), retries, and
   clears the session if the refresh is refused.
3. `GET /module/auth/me` is cached in TanStack Query (`['auth','me']`). Its `capabilities`
   decide what the navigation **offers** (`src/shared/nav/pages.ts`):

| page              | path                       | offered when                                               |
| ----------------- | -------------------------- | ---------------------------------------------------------- |
| What's on         | `/events`                  | `is_student`                                               |
| My passes         | `/passes`                  | `is_student`                                               |
| Profile QR        | `/profile`                 | `is_student`                                               |
| Club events       | `/club/events`             | `clubs` non-empty                                          |
| New event         | `/club/events/new`         | `clubs_can_propose` non-empty                              |
| Budget            | `/club/budget`             | `clubs_with_budget_access` non-empty                       |
| Members & roles   | `/club/roster`             | `clubs` non-empty                                          |
| Scan station      | `/scan`                    | `clubs_door_staff` or `organiser_events` non-empty         |
| Society approvals | `/staff/approvals/society` | `approval_stages ∋ cultural_society`                       |
| Dean approvals    | `/staff/approvals/dean`    | `approval_stages ∋ dean`                                   |
| Above-threshold   | `/staff/approvals/vc`      | `approval_stages ∋ vc`                                     |
| Venues            | `/staff/venues`            | `is_dean`                                                  |
| This semester     | `/staff/overview`          | `can_see_overview`                                         |
| Semester report   | `/staff/report`            | `is_dean` or `is_vice_chancellor` or `is_cultural_society` |

4. Hiding is not the permission. `RequireCapability` never redirects: when the payload does not
   allow a page it makes that page's own first call and renders the API's problem
   (`403`/`404` with its `code`); if the call succeeds the page renders. Every failure anywhere
   is shown as the RFC 9457 problem the server sent (`ProblemView`).

## Tests

- `src/shared/nav/pages.test.ts` — port of `web-app/tests/smoke.mjs` §3: each of the nine
  personas is offered exactly its pages (student 3, member 5, secretary 7, treasurer 7,
  president 8, organiser 8, society 3, dean 4, management 2).
- `src/shared/api/client.test.ts` — problem-details mapping; refresh on 401 with rotation,
  single-flight, failure clears the session; no refresh on unauthenticated or login calls.
- `src/student/student.test.tsx` — MSW: register → pass visible (QR carries the token, bright
  view), event full → `PARTICIPATION_EVENT_FULL` shown, cancel, reissue → old token gone,
  sign-in MFA reveal, redirect-to-signin-and-back, nav per persona, API refusal rendered for a
  student on a staff page.

### End-to-end smoke

```bash
# backend up and seeded (see Run), then:
VITE_API_BASE=http://localhost:8000/api/v1 npm run e2e
# E2E_EMAIL / E2E_PASSWORD override the seeded student (23la1041@college.edu / culturals-demo)
```

Playwright starts `npm run dev` itself; `E2E_PORT=5199` moves it off :5173 (the backend must
allow that origin in `CORS_ALLOWED_ORIGINS`). Chromium:
`npx playwright install chromium`. Not part of CI yet.

## Deploy

`vercel.json` builds with `npm run build`, serves `dist/`, and rewrites every non-asset path
to `index.html` for the SPA router. Set `VITE_API_BASE` in the Vercel project, and add the
Vercel origin to the backend's `CORS_ALLOWED_ORIGINS`.
