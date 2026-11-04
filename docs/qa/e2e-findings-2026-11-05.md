# E2E findings — Robot Framework run, 2026-11-05

Run: `app/e2e` against the merged `design-system-ui` head (a197cd2 + UI-suite edits), fresh `seed_demo`, local mode. API 51/51, UI 19/19. The suites assert the behaviour as it is; each item below is where it differs from the docs or the demo script.

| # | What the app does | Where | Action |
|---|---|---|---|
| 1 | `POST /events` without `kind` is a 500 (`payload["kind"]` KeyError); API_DATA_MODELS §6 calls `kind` optional | `events/views.py` create | fix: default or 422 |
| 2 | Declare-nil with an empty reason answers `VALIDATION_FAILED`, not the documented `BUDGET_NIL_REASON_REQUIRED` (serializer blank check fires first); 422 and `errors[0].field == reason` hold | `budget` serializer | doc or code, either way |
| 3 | The venue-clash pre-check runs at every gate, so a clashing item is refused `GOVERNANCE_CLASH_UNRESOLVED` at the Society stage and never reaches the Dean's queue until the Dean moves one from Venues. DEMO_CREDENTIALS step 5 as written cannot happen from the Dean's queue | `governance` decide | update DEMO_CREDENTIALS step 5 |
| 4 | `GOVERNANCE_MFA_REQUIRED` (403) is unreachable in local mode: login refuses staff without a code (401 `AUTH_MFA_REQUIRED`) and the demo path grants MFA | `identity` login | none (SSO-only path) |
| 5 | "Unplugged Evening" is already settled by `seed_demo`; the settle story runs on "Dance Showcase" | seed | update DEMO_CREDENTIALS step 7 |
| 6 | The roster hides the role control from anyone without `can_assign_roles`, so `CLUBS_ROLE_ASSIGN_DENIED` never shows on screen | `club/RosterPage` | none |
| 7 | Semester report tiles: Events run, Participation, Unique students (third), Avg attendance, External guests. PRD says lead with unique students | `staff/ReportPage` | reorder tiles |
| 8 | Queue headings differ from nav titles: "Cultural Society approvals" / "Vice-Chancellor approvals" vs nav "Society approvals" / "Above-threshold" | page titles | none unless a restyle renames them (suites assert the headings) |
| 9 | Role-changes log says "Club member → Club core" while the select and `role_label` say "Member" / "Core team" | `club/RosterPage` | align labels |

Also: the UI suites now expect students to land on Feed and to be offered Feed · What's on · My passes · Profile QR · Clubs (F-06/F-07 merged the same day).
