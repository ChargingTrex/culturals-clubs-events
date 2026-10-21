# QA review — wave 1 / W4 (commit e1b4302)

Scope: `jobs/` app (token-guarded `POST|GET /api/v1/jobs/<name>`, Celery tasks, four jobs),
`reporting/export.py` CSV + `/reports/semester/csv`, `by_category`, `scan_success_rate` /
`scan_capture_rate` (+ `capture_rate` alias), Dean overview additions. Reviewed against
CHECKLIST B-10/B-11, MASTER_SPEC §7.5–7.6/§8.3, AGENT_PROMPT §3/§5, API_DATA_MODELS §6.
Paths relative to `clubs-and-culturals-platform/app/backend/`. Measurements were taken on a
clean export of 3579ba9 (W4 + W3 merged); the working tree was mid-W2-merge and untouched.

## Verdict: **rework**

B-10b (CSV) and B-11 (two metrics) pass with findings. B-10a needs rework on two points:
`purge-external` rewrites already-reported semester figures (F1), and `escalate-sla`'s
dedup silences every second SLA breach for an event (F2). Separately, two of W4's own
tests fail on merged main because W3's `age_hours` reads `stage_entered_at` (F3).

### What holds up

- Token guard: 503 is raised before the header is read, so an empty `JOBS_TOKEN` cannot be
  bypassed. Missing header → 401; `bearer`/`BEARER`, double space, trailing whitespace all
  accepted; `Bearer\ttoken`, `Token x`, wrong unicode → 401. `compare_digest` gets
  bytes/bytes. A real Dean token → 401 (tested). CSRF: DRF's `as_view` is csrf-exempt and no
  `SessionAuthentication` is active; verified with `APIClient(enforce_csrf_checks=True)`.
- GET form is the right call for Vercel Cron (GET-only, sends `Authorization: Bearer
  $CRON_SECRET`). Jobs are idempotent: purge re-runs purge 0, rollup is read-only,
  escalate dedups. Note `vercel.json` has no `crons` block yet (H-03, W7).
- `AuditEntry.actor_sub` is `CharField(64)`, so `"system:jobs"` is fine on Postgres.
  `_counts_only` drops dicts/dates/Decimals rather than failing JSON encoding.
- Celery: `beat_schedule` task names match the four `@shared_task(name=...)`; it is config
  only, harmless without Redis; `.apply()` under EAGER tested.
- Tests: `mock.patch.dict(sys.modules, ...)` as a context manager restores on exit; the
  260-test run on the merged tree shows no cross-test leak. Role tests mint real tokens.
- `scan_success_rate`: ACCEPTING = (accepted, spot_registered) matches §7.6; duplicates
  count as failed attempts (spec: "all attempts"); offline replays are deduped by the
  `one_record_per_offline_ref` constraint inside `resolve()`. Both rates null when empty.
- CSV: rendered from the same dict as JSON (no drift); problem documents stay
  `application/problem+json` on both `?format=csv` and `/csv` (401, 403 tested); the VC
  sweep is covered for CSV by `test_the_csv_carries_no_individual_records`; no `events`
  block in the CSV, so no titles/rosters.
- `by_category`: `Count("id", distinct=True)` and `Count("club_id", distinct=True)` are
  correct across the registrations join; clubs/categories with no completed events are
  omitted, consistent with `by_club`.

## Findings

| id | sev | file:line | what can go wrong | suggested fix | test that would catch it |
|---|---|---|---|---|---|
| F1 | **high** | `jobs/services.py:113` (`due.delete()`), `participation/models.py:40` (`external` CASCADE) | A reported semester has one attended external guest; `purge_after` passes; the nightly purge deletes the Registration row via CASCADE. Measured on the overlap fixture: `total_participation` 10→9, `external_participants` 1→0, `by_club` Swara 8→7, `by_category` likewise. The contract "re-running a past semester gives the same numbers" and the Registration docstring ("Never deleted") are broken. | Keep the row, blank the PII: `due.update(full_name="", institution="", email="", phone="", purged_at=now)` (new nullable `purged_at` on ExternalParticipant, participation migration); `participant_label` renders "purged guest". §8.3 says "details … genuinely deleted" — blanking satisfies it. Also change the FK to `PROTECT` so an accidental delete fails loudly. | `tests/test_qa_wave1_w4.py::PurgeKeepsReportedFiguresTests` (added, expectedFailure) |
| F2 | medium | `jobs/services.py:147-149` | Dedup key is `Notification(user, kind, link)` with `link=/staff/approvals/<event_id>`. W3 restarts the SLA clock per stage (`stage_entered_at`), and a returned event resubmits as a new ApprovalRequest for the same event. Probe: 1st breach → 1 notice; same request breaching again at the Dean stage → 0; new request after return/resubmit → 0. Silenced forever per event. | Key on request + stage: e.g. `link=f"/staff/approvals/{event_id}?request={id}&stage={stage}"`, or dedup with `Notification.objects.filter(..., created_at__gte=item.stage_entered_at)`. Carry `stage_entered_at` through `escalation_summary`. | `tests/test_qa_wave1_w4.py::EscalationReNotifiesTests` (2 added, expectedFailure) |
| F3 | medium | `tests/test_jobs.py:223-236`, `tests/test_report_export.py:277-285`; `reporting/services.py:escalation_summary` | Both tests age the request by `update(created_at=-80h)`; W3's `ApprovalRequest.age_hours` measures from `stage_entered_at`, and `escalation_summary` prefers `age_hours`. On merged main (3579ba9) both fail: `'80.0 h' not found in '… waited 0.0 h …'`, `0.0 != 72.0`. Suite is red at 260 tests. Also `summary["submitted_at"]` reports `created_at` while the age is stage-based. | Tests: set `stage_entered_at` (and `created_at`) in the `update()`. Code: report `stage_entered_at` under its own key; drop the `created_at` age fallback now that B-07 is in. | The two existing tests, once corrected |
| F4 | medium | `jobs/services.py:141` (`subject = …`) | `Notification.subject` is `max_length=200`; `Approval overdue: “{title}” ({club})` reaches 343 chars (title 200 + club 120). On Postgres that is a `DataError`, so the whole hourly run 500s for as long as that item is pending, nothing is audited, and no other item is notified either (no per-item isolation). SQLite does not enforce, so the suite cannot see it. | Truncate: `subject[:200]` (or shorten the title to 80 chars with an ellipsis); wrap each item in `try/except` + log so one bad row cannot sink the run. Same latent pattern in `governance/services.py:135` (pre-existing). | Unit test: 200-char title, assert `len(note.subject) <= 200`; or run the suite on Postgres |
| F5 | medium | `jobs/services.py:135` (`deans = …`) | B-06 is merged: a Dean on leave has an active `Delegation`; the delegate who can actually clear the gate is never told. Also an item stuck at the `cultural_society` stage notifies only the Dean, never the society holders. | Recipients per item = holders of `_stage_role(item.stage)` ∪ `active_delegations(stage=item.stage).delegate_user` (both exist in `governance/services.py`), plus the Dean as escalation target. | Test: delegate inside window gets the notice; expired delegate does not |
| F6 | low | `reporting/export.py:24-47` | Cells are written raw. A club named `=HYPERLINK("http://x","Swara")` (or a tag / department code starting with `+ - @`) executes when the VC opens the CSV in Excel. Surface is small — club rename is Admin/Dean-only (`clubs/views.py:26`). | Escape cells whose first char is in `=+-@\t\r` by prefixing `'`; apply to every string cell. | `tests/test_qa_wave1_w4.py::CsvCellsAreFormulaSafeTests` (added, expectedFailure) |
| F7 | low | `reporting/export.py:60` | UTF-8 without BOM: Excel on Windows mis-renders non-ASCII club names. | Emit `﻿` prefix (utf-8-sig); strip it in `parse_csv`. | Assert body starts with BOM |
| F8 | low | `jobs/views.py:22-32` | No minimum length on `JOBS_TOKEN` (a 1-char value enables the triggers), `throttle_classes=()` on an unauthenticated route, failed attempts not logged. Brute force is infeasible for a 32-byte secret, but nothing enforces one. | Treat `len(expected) < 32` as disabled (503 with a distinct detail) or a system check; `log.warning` on 401 with `REMOTE_ADDR`; optionally `AnonRateThrottle` for 401s. | Test: 8-char token → 503 |
| F9 | low | `jobs/services.py:111-113` | `due.count()` then `due.delete()` are two statements, no transaction; Celery beat + Vercel Cron both live, or a Vercel retry, makes `purged` wrong in the audit. | `_, by_model = due.delete(); purged = by_model.get("participation.ExternalParticipant", 0)` — drops a query too. | Hard to test; code review |
| F10 | low | `reporting/services.py:capture_metrics`; `participation/services.py:470` | `check_in_manually` writes a ScanRecord (`accepted`/`spot_registered`), so a desk that hand-enters everyone shows `scan_success_rate` = 1.0. Conformant to §7.6's ScanRecord definition, but the name says "scan". | Exclude `scanned_token__startswith="manual:"` from attempts/accepted, or document in `CaptureMetricsSerializer` that manual entries count as attempts. | Extend `CaptureRateTests` with the expected exclusion |
| F11 | low | `reporting/services.py:60` | `by_category.clubs` is "clubs with ≥1 completed event", not "clubs in the category"; a reader sees `cultural: clubs=1` when five exist. | Rename to `clubs_active` or add `clubs_total` from `Club.objects.values("category").annotate(...)`. | Fixture with an idle club in the category |
| F12 | info | `reporting/services.py:semester_report` (`events` block), `dean_overview` | Measured: `semester_report` = 9 + 3·N queries (N = reportable events; 18 at 3, 33 at 8) — per-event `attended_count()`, `registered_count()`, `budget`. Pre-existing, but the CSV route now pays it and discards the block. `dean_overview` = 12 at 3 events, 17 at 8; growth is the pre-existing `all_clashes()`; W4's additions are constant. `escalate_sla` does one `exists()` per dean per item (fine at staff scale). | Annotate `attended`/`registered` on the events queryset and `select_related("budget")`; skip the `events` block for CSV. Add `assertNumQueries` guards. | `assertNumQueries(9)` on the semester report regardless of N |

## Tests added

`tests/test_qa_wave1_w4.py` — 4 tests, all `@expectedFailure` so the suite stays green until
the fixes land (a fix turns them into "unexpected success", the cue to drop the decorator):

- `PurgeKeepsReportedFiguresTests.test_a_reported_semesters_figures_survive_the_purge` (F1)
- `EscalationReNotifiesTests.test_a_second_breach_at_the_next_stage_is_notified_again` (F2)
- `EscalationReNotifiesTests.test_a_resubmitted_event_that_breaches_again_is_notified_again` (F2)
- `CsvCellsAreFormulaSafeTests.test_a_formula_shaped_club_name_is_neutralised` (F6)

## Suite result

On a clean export of 3579ba9 (W4 + W3 merged) with the QA file:
`Ran 264 tests — FAILED (failures=2, expected failures=4)`. The 2 failures are W4's own
`test_escalate_sla_notifies_each_dean_once_per_request` and
`test_escalated_approvals_once_wired` (F3); they fail identically without the QA file
(260 tests, failures=2). At b0f8738 (before W3) the suite was 205/205.
