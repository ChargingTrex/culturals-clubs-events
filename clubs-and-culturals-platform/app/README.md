# Culturals — Clubs & Events application

A Django + DRF backend for the Clubs & Events module, converted from the
single-file `culturals-platform.html` prototype. Stack and rules are fixed by
`../AGENT_PROMPT.md`; the cross-system contracts are in `../../shared/`.

**Read [`RECONCILIATION.md`](RECONCILIATION.md) before changing `participation/` or
`qrkit/`** — two drafts were merged there and the reasons are recorded.

## Status

| Part | State |
|---|---|
| Backend — 6 apps, 47 API paths, 97 tests passing | working |
| Shared SSO seam (`local` / `platform` adapters) | working |
| Role-based access, 3-tier approvals | working, with wrong-role tests |
| Demo pages — 15 views, one page each, at `/demo/` | working, login disabled |
| Frontend (React + TS + Vite + Tailwind + TanStack Query) | **not started** |

## Running it

The parent directory name contains a `:` and a trailing space, which Python
refuses to create a venv inside and which `PYTHONPATH` cannot express. Either
rename it (recommended) or keep the venv outside the tree:

```bash
cd app/backend
python3 -m venv /tmp/culturals-venv          # not inside this tree, see above
/tmp/culturals-venv/bin/pip install -r requirements.txt
cp .env.example .env

/tmp/culturals-venv/bin/python manage.py migrate
/tmp/culturals-venv/bin/python manage.py seed_demo
/tmp/culturals-venv/bin/python manage.py runserver
```

Then `http://localhost:8000/demo/index.html` for the demo pages (one per view, login
disabled — see [`backend/demo/README.md`](backend/demo/README.md)),
`http://localhost:8000/api/v1/docs` for the API, and
`http://localhost:8000/django-admin/` after `createsuperuser`.

Tests use a separate settings module, only to swap in a fast password hasher:

```bash
/tmp/culturals-venv/bin/python manage.py test tests --settings=config.settings_test
```

PostgreSQL is the target database (AGENT_PROMPT §2). Leaving `DATABASE_URL` unset
falls back to SQLite for a quick demo; the venue exclusion constraint is
Postgres-only and degrades to the application-level check in `events/services.py`.

## Demo accounts

Password `culturals-demo` for all of them. Staff accounts need any non-empty MFA
code — real TOTP verification is not wired up, but the `mfa` claim it produces is
what gates above-threshold sanctioning.

| Role | Account |
|---|---|
| Student | printed by `seed_demo` |
| Club president / treasurer | printed by `seed_demo` |
| Cultural Society | `cultural.secretary@college.edu` |
| Dean of Student Affairs | `dean@college.edu` |
| Vice-Chancellor | `vc@college.edu` |

## The two things you asked about

### Shared SSO login

`INTEGRATION_MODE` selects the identity adapter, per
`shared/API_Standards_Integration_Contract.docx` §2.1:

- `local` — the module authenticates against its own user table and signs its own
  tokens.
- `platform` — the module validates the portal's JWT against its JWKS and does no
  user lookup at all.

**The claim set is identical in both modes** (`Identity_Login_Shared_Data` §5.4), so
nothing downstream of claim-reading changes when you switch. Integration is a
config change, not a rewrite. `GET /api/v1/module/auth/mode` tells the frontend
which flow to render, so one build serves both.

Scan stations are a deliberate exception to the 15-minute access token: the session
lasts the event plus four hours and is bound to that event, because an organiser
cannot re-authenticate mid-queue and a station that logs out gets replaced by a
paper list.

### Roles and the approval chain

Roles are strings in the token, global (`dean`) or object-scoped
(`club_president:<uuid>`), so "President of Swara" travels in the claim and costs
no query to check. The vocabulary is in `common/roles.py`.

The chain is **data, not branching**: `APPROVAL_CHAIN` builds an ordered route at
submission, and `governance/services.py:decide` walks it.

```
submitted → [Cultural Society, if the club is cultural or literary]
          → Dean of Student Affairs
          → [Vice-Chancellor, if over the budget threshold or part of a fest]
          → published
```

> **Deviation, stated deliberately.** `AGENT_PROMPT.md` §2 fixes the chain as
> Dean-only and says "There is no faculty advisor step." The Cultural Society gate
> was requested by the product owner. It is configuration
> (`APPROVAL_CHAIN=dean` restores the documented chain) rather than buried in code,
> and `tests/test_approvals.py` covers both settings. **The Decision Log should be
> updated to record this.**

The Dean gate cannot be configured away — a chain without it would publish events
with nobody accountable for the money.

## Layout

```
backend/
  config/          settings, urls, celery. settings_test.py swaps the hasher only
  common/          UUID base model, RFC 9457 errors, pagination, roles, permissions
  integrations/    the local/platform adapter seam — identity, directory,
                   notifications, files, audit. Application code names no impl.
  identity/        User, Student, Semester, JWT issuing, the §5.4 claim contract
  clubs/           Club, Membership, RoleChange
  events/          Event, Venue, Fest, clash detection, atomic reassignment
  participation/   Registration, EventPass, ScanRecord, the seven-branch resolver
  qrkit/           vendored HMAC token + local QR generation (MIT, see LICENSING)
  budget/          templates, lines, receipts, settlement rules
  governance/      ApprovalRequest/Step, notifications, audit, the routing engine
  reporting/       semester report and the Dean's overview
  tests/           97 tests, incl. a wrong-role token test per restriction
```

## Rules worth knowing before editing

- **Count `attended`, never `registered`.** Absent registrations stay for the
  no-show rate but are never participation.
- **`unique_students` is the headline figure**, not total attendance. 20 events
  reaching the same 80 students and 20 reaching 600 give the same total; only the
  DISTINCT count separates them. `tests/test_reporting.py` checks it against a
  dataset with hand-built overlap.
- **Every scan writes a `ScanRecord`, failures included.** They are the capture-rate
  metric — without them a station rejecting half its queue looks like a quiet event.
- **The organiser scans the student, never the reverse.** There is no route for a
  student to mark themselves present, and a test asserts it.
- **Integrity rules live in the database.** Application checks lose under
  concurrency. A duplicate registration fails on a partial unique index, and that
  failure is the correct answer.
- **No club role approves its own budget**, even if the holder also has an approval
  role.
- **In-app and email notifications only.** No SMS, no WhatsApp, no third channel.
