# E2E findings — regression pack, 2026-11-09

Run: `app/e2e/ci.sh full` on the working tree (uncommitted Part 2 work included), fresh `seed_demo`,
SQLite, production build of the frontend served by `vite preview`. **222 tests: 218 passed, 0 failed,
4 skipped under `known-issue`.** Wall time about 4½ minutes on a laptop.

New since 2026-11-08: API suites `api/09`–`17` (one rule per test, each checked in the API answer and in
the database row it writes) and UI suites `ui/16`–`21`; `ci.sh` boots everything from a clean checkout;
`.github/workflows/e2e.yml` runs the smoke tag on every push and the full pack on pull requests and
`main`/`prototype`, next to the frontend's typecheck + Vitest and the Django tests.

Fixed in the same change: findings #2 and #3 of 2026-11-08 (the approver's notification link now carries
the approval id; the club's link is `/club/events/<event id>`). `ui/15` and `api/14` assert both.

| # | What the app does | Where | Test that documents it |
|---|---|---|---|
| 1 | **Money (still open).** With no `sanctioned` map, the Dean's approval publishes the event but leaves every line's `amount_sanctioned` NULL. The approver screen always sends every line, so this hits API clients and `Approve Through Every Gate`. | `governance/services.py` `and sanctioned_lines` | `api/08` "The Dean approves without touching a head…" |
| 2 | A Dean's move tells a registered student **twice**: `events/services.notify_venue_change` (link `/events/<id>`) and the `participation/signals.py` post-save hook (link `/club/<club>/events/<id>`, a route the app does not have). | `participation/signals.py`, `participation/services.py:119` | `api/14` "A registered student is told of a move once…" |
| 3 | Several notification kinds link to pages the app does not have: `registration.confirmed` / `registration.promoted` → `/me/passes` (the page is `/passes`); `club.join_accepted` / `club.join_declined` → `/clubs/<id>` (no club page); `photo.removal_requested` and waitlist notices → `/club/<club>/events/<id>`. | `participation/services.py:148,171`, `clubs/services.py`, `events/services.py:328` | `api/14` "Every other stored link opens a page the app has" |
| 4 | `PATCH /events/{id}` accepts a `capacity` larger than the venue's; only the create path checks it. | `events/serializers.py` `EventSerializer.validate` | `api/16` "More seats than the hall has is refused" |
| 5 | The Vice-Chancellor's `sanctioned` map is accepted (200) and ignored. The VC screen has no sanction inputs. | `governance` decide | `api/16` asserts the lines are unchanged (passes either way) |

Environment notes: the repository path contains a colon, which breaks `venv`, `npx`, `npm run`, Vitest
and the Vite dev server inside the tree; `ci.sh` keeps the venv in `/tmp`, calls `node node_modules/…`
directly and serves a production build. The React calendar lays its grid out in browser-local time, so
the Browser context is pinned to `Asia/Kolkata` (the existing `ui/13` calendar test depended on the
machine's zone).
