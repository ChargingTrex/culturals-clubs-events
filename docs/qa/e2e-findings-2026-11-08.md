# E2E findings — decision paths, 2026-11-08

Run: `app/e2e` against `prototype` HEAD (bc12576) in a clean worktree, fresh `seed_demo`, local mode, SQLite.
This does not include the uncommitted work in the main tree. **API 58/59, UI 26/28: 84/87.** The three
failures are the first three rows below. The new suites `api/08_decision_paths.robot` and
`ui/15_decisions_on_screen.robot` cover these flows:

- the Dean cuts heads and approves;
- the Dean returns a proposal, and the Treasurer edits it and resends it;
- the VC approves above the threshold;
- the Society, the Dean and the VC each reject.

Each outcome is checked three ways: the API response, the database rows (event, budget lines, approval
steps, audit entries, notifications, read through `resources/db.py`), and the club's event page.

| # | What the app does | Where | Action |
|---|---|---|---|
| 1 | **Money.** When the Dean approves without a `sanctioned` map, the event is published and the budget stage becomes `sanctioned`, but every line keeps `amount_sanctioned = NULL`, so the total sanctioned is ₹0. The club page then shows "requested · not sanctioned yet" on a published event. The approver screen always sends every line, so this hits API clients and the e2e helper `Approve Through Every Gate` (Open Mic Night, Culturals Night). | `governance/services.py:526`, `… and sanctioned_lines` | fix: drop that condition. `_apply_sanctions({})` already sanctions untouched lines as requested |
| 2 | The approver's notification link is `/staff/approvals/<event id>`. The page loads the approval by its own id, so the link opens "Not found". | `governance/services.py:142` | fix: `request.id` |
| 3 | The club's notification link is `/club/<club id>/events/<event id>`. The app route is `/club/events/<event id>`, so the link opens "No such page". | `governance/services.py:163` | fix: drop the club segment |
| 4 | When the VC sends a `sanctioned` map, the API returns 200 and ignores it. The VC screen correctly has no sanction inputs. | `governance` decide | refuse with 422, or document |
| 5 | The route is fixed at submission. If the Dean cuts a ₹60,000 request to ₹45,000, below the ₹50,000 threshold, it still goes to the VC. | `build_route` | product owner to confirm |
| 6 | The app has no in-app notifications screen. Notifications are stored and emailed, but the club sees an outcome only by opening the event. | frontend | backlog |
| 7 | A rejected budget card reads "requested · not sanctioned yet". The VC reason shows as raw "budget over 50000". | `ClubEventDetailPage`, `build_route` | copy |

Verified working: Dean edits reach the line rows and the step total. A return reopens the event and
budget for editing, and resending creates a second approval request that starts at the Society.
Rejections are final: a second decision gets 409 `GOVERNANCE_ALREADY_RESOLVED`, a resubmit gets 409, and
an edit gets 409 `EVENTS_LOCKED`. A rejection without a comment gets 422, both in the API and on screen.
After a rejection, later gates are never asked or notified. Every decision has an audit entry and a club
notification, and the VC's step is recorded as MFA-verified.

Suite fixes in the same change:
- `ui/13_staff` expected 2 VC pages. The VC has 4 pages since fa86a4e.
- `ui/13_staff`'s calendar test relied on the seed's clash, which `api/04` resolves first when `./run.sh all` runs both. It now uses its own clash, before the Dean moves it.
