# QA review — wave 1 / W3 (commit 8a2be7a)

Scope: approval `Delegation` (B-06), SLA `stage_entered_at`/`age_hours`/`escalated` (B-07),
`ClubBudgetEnvelope` + `/budget/envelopes/{club_id}` (B-08), receipt file streaming (B-13).
Reviewed against CHECKLIST B-06/B-07/B-08/B-13, FLOWS §4–§6, MASTER_SPEC §5.3/§11.3,
AGENT_PROMPT §3/§6, API_DATA_MODELS §4. Paths are relative to
`clubs-and-culturals-platform/app/backend/`.

## Verdict: **rework**

B-07 passes. B-08 passes with findings (F4, F6, F7). B-13 passes with findings (F3, F9).
B-06 needs rework: the VC-gate delegation cannot be used through the API because a
delegate without an MFA role can never obtain the `mfa` claim (F1), and a delegation
outlives the principal's role (F2). Four QA tests were added that fail on this commit
and prove F1–F4.

### What holds up

- No chain: `create_delegation` requires `ctx.has_any(role)` of the stage (or admin), and a
  delegate never holds the role, so a delegate cannot re-delegate (verified with a token).
- Stage containment: `active_delegation_for(ctx, current)` is keyed on the *current* stage;
  a delegate for `dean` on a request still at `cultural_society` gets `GOVERNANCE_WRONG_STAGE`.
  The queryset widening (`views.py:152`) adds only `state=pending AND current_stage IN
  delegated`, which is exactly what the holder of that gate sees; budgets, envelopes and
  rosters are untouched because `AuthContext` is claims-only and `held_stages` /
  `delegated_stages_for` are referenced nowhere outside `governance/` (verified: a Dean-stage
  delegate gets 404 on `/budget/budgets/{id}`, `/budget/envelopes/{club}` and the roster).
- Self-approval wins for any club role: `ctx.club_role()` returns `club_member` too, so a
  plain member of the proposing club who is delegated the gate gets `GOVERNANCE_SELF_APPROVAL`
  (verified with a token; only the treasurer case is in W3's own tests).
- Window: aware datetimes on both sides, `starts_at <= now < ends_at` in Python and
  `starts_at__lte / ends_at__gt` in SQL agree; at exactly `ends_at` the delegation is inactive.
- Step carries `actor_sub`/`actor_label` and `on_behalf_of`/`on_behalf_of_label`; the audit
  entry carries the delegation id. Revocation touches only `revoked_at`, never the steps.
- SLA: `stage_entered_at` reset only on advance (`services.py:486`); a resubmit creates a new
  request so it starts fresh; return/reject are resolved and `escalated` is False for them.
  `escalated` (`> SLA_HOURS` on unrounded hours) and `?escalated=true`
  (`stage_entered_at < now − SLA`) agree. Aware/aware comparison throughout.
- Envelope: `UniqueConstraint(club, year)` + `select_for_update` make PUT idempotent; amount
  is a DRF `DecimalField` (a float `0.30000000000000004` is refused with `MAX_DIGITS`, never
  rounded); audit records `before.amount` and `after`. Plain member: `/budget/budgets` lists
  nothing (200, `count: 0`), detail/envelope 404 — no leak of the envelope block.
- Receipt path guard: `(root / key).resolve()` then `root in parents` refuses `../`, absolute
  keys and a symlink pointing outside the bucket (all three verified). The key comes from the
  DB, not the URL, so encoded slashes never reach it. `Content-Disposition` is built by
  Django's `FileResponse`: quotes are escaped and non-ASCII/CR/LF are percent-encoded under
  `filename*` (verified `a\r\nX-Injected:` → `filename*=utf-8''a%0D%0AX-Injected...`).
  `nosniff` is set. The mocked platform-store test patches the registry seam the view really
  uses, so it exercises the real view.
- Error contract: every new refusal is `ProblemDetail` with a `code`; `FileNotFoundError` is
  pre-empted by `path.is_file()`.

### Findings

| id | severity | file:line | what can go wrong | suggested fix | test that would catch it |
| --- | --- | --- | --- | --- | --- |
| F1 | high | `governance/services.py:217,410`; `identity/views.py:113` | Login issues `mfa=True` only to `MFA_REQUIRED_ROLES`. A staff deputy (the case W3's own test models) is accepted as VC delegate → every VC-stage decision, and every Dean-stage decision above ₹50,000, is refused `GOVERNANCE_MFA_REQUIRED`. B-06's VC branch is dead through the API; W3's MFA test bypasses login via `ctx_for(mfa=True)`. Conversely a Dean-stage delegate decides *below* threshold with no second factor at all, although the Dean role itself is MFA-mandatory at login (§5.5). | Login: offer/require MFA for any account that is `is_staff`, `mfa_enabled`, or holds an active delegation (one query at login). Decide: a delegated decision always requires `ctx.mfa`, regardless of amount. Consider a max window (e.g. 30 days) so a delegation cannot become a permanent, MFA-free role grant. | `tests/test_qa_wave1_w3.py::test_f1_a_vc_delegate_can_decide_through_the_api` (fails: 403) |
| F2 | high | `governance/services.py:194` | `create_delegation` checks the principal holds the role, `active_delegation_for` never re-checks. Dean A delegates for 30 days, is replaced on day 3 → the deputy keeps approving Dean-stage requests for 27 days "on behalf of" a non-Dean. | In `active_delegation_for` (and `delegated_stages_for`) filter `principal_user__global_roles__contains=[role]`, or revoke a user's delegations when their global roles change. | `::test_f2_a_delegation_ends_when_the_principal_loses_the_role` (fails: 200) |
| F3 | medium (high in DEMO_MODE) | `budget/views.py:345,403` | Upload allowlist is `image/*`; `image/svg+xml` passes and is served `inline` with the client-supplied type → stored XSS on the API origin for the Dean/Society/VC who opens it. In DEMO_MODE the demo pages (and their token) are same-origin. `nosniff` does not help: the declared type is the dangerous one. | Allowlist exact types at upload (`application/pdf, image/jpeg, image/png, image/webp, image/heic`); serve anything else as `application/octet-stream` + `as_attachment=True`; add `Content-Security-Policy: sandbox` and `Cache-Control: private, no-store` on the file response. | `::test_f3_an_svg_receipt_is_not_rendered_inline` (fails: inline) |
| F4 | medium | `budget/views.py:455`; `budget/services.py:378` | `?year=10000` (or `0`) passes `int()` then `starts_at__year=10000` builds `datetime(10000,1,1)` → `ValueError` → HTTP 500 (`INTERNAL_ERROR`), not RFC 9457 422. | Validate `2000 <= year <= 2100` in `_year` (same bounds as `EnvelopeSetSerializer`). | `::test_f4_an_out_of_range_year_is_422_not_500` (fails: 500) |
| F5 | medium | `governance/services.py:208` | "Staff" = `is_staff` or any non-`student` global role. `cultural_society` office bearers are students in this institution (PRD §4), so a student who also holds `cultural_society` qualifies as a VC delegate — the stated intent ("a bare student account cannot stand in for the VC") is defeated. | Define staff as `is_staff` or role in `(DEAN, ADMIN)`; or require `is_staff` only. Document the decision in MASTER_SPEC §11.3. | API test: delegate VC to a `cultural_society` user who has a `Student` row → expect 422 `GOVERNANCE_DELEGATE_NOT_STAFF` |
| F6 | medium (risk) | `budget/services.py:378`; `budget/views.py:102` | Envelope year is the **calendar** year of `event.starts_at` (UTC). PRD §5.7.3 "annual envelope" in an institution whose year is Jul–Jun: a Jan-2027 event of AY 2026-27 draws on the 2027 envelope. `Semester` exists and is unused. Also `starts_at.year` is UTC: an event at 01:00 IST on 1 Jan is counted in the previous year. | Decide and document: either key the envelope on the academic year (derive from `Semester`/`starts_on`) or state "calendar year" in CHECKLIST B-08 and the serializer docstring; use `timezone.localtime(starts_at, DISPLAY_TIME_ZONE).year` consistently in both the lookup and the serializer. | Envelope test with an event dated 1 Jan 00:30 IST and one dated 15 Jul; assert which year each counts against per the documented rule |
| F7 | low | `budget/services.py:365` | `sanctioned_to_date` includes fest-level budgets (`budget__fest__club_id`). PRD §5.15.4 lets a fest be "a single envelope, with sub-event heads drawing against it" — once sub-events (MASTER_SPEC gap 9) exist, fest + sub-event budgets will be double-counted. Fine today. | Note in the docstring; when sub-events land, exclude budgets whose event has a fest with its own sanctioned budget. | Deferred to sub-event work |
| F8 | low | `governance/services.py:381` vs `:314` | Revoke-between-assert-and-write race: `decide` locks the request, not the delegation; `revoke_delegation` can commit between `assert_can_decide` and the step insert → a step recorded under a revoked delegation (ms window). | `active_delegation_for(..., lock=True)` using `select_for_update()` when called from `decide`. | Hard to unit-test on SQLite; code review item |
| F9 | low | `integrations/base.py:73`; `budget/views.py:397` | Platform-mode 302 to `store.url_for(key)` — the seam does not say whether the URL is signed/expiring. If the platform returns a permanent URL, anyone who sees the `Location` has the receipt forever; the 302 also carries no `Cache-Control`. | Document `url_for` as "short-lived signed URL" in `FileStore`; add `Cache-Control: private, no-store` to the redirect. | Contract test on `PlatformFileStore.url_for` once implemented |
| F10 | low | `governance/views.py:174-180`; `services.py:184` | Queue runs 4 delegation queries per request (`held_stages` twice, `delegated_stages_for`, `get_my_stage`); budget list costs 3 queries per distinct club (envelope + 2 aggregates), not "one per club" as claimed. Measured: queue 14 queries for 5 items (5 are pre-existing per-item clash lookups); budget list 13 for 12 budgets / 3 clubs; receipt file 5; delegation list 2. | Compute `delegated_stages_for` once in `queue` and pass it; collapse the two aggregates into one `aggregate(Sum(...), Sum(..., filter=Q(stage=settled)))`. | `assertNumQueries` on queue and budget list |
| F11 | low | `governance/migrations/0003:38`; `docs/API_DATA_MODELS.md:822` | Existing pending rows get `stage_entered_at = migration time`, so their age restarts at deploy (nothing shows escalated for 48 h after rollout). Queue ordering changed from event start to `stage_entered_at`; API_DATA_MODELS still says "ordered by event start". | Data migration: set from the latest `ApprovalStep.created_at` else `created_at`. Update the doc row. | Migration test with a pre-existing pending request |
| F12 | low (by design, note) | `governance/services.py:381` | A Dean-stage delegate cannot resolve a venue clash (`event.venue_reassigned` needs the Dean role) and cannot open `/budget/budgets/{id}`; on an unresolved clash they can only return. After deciding, the request leaves their visible set. | Document in the delegation docstring; consider allowing `retrieve` of requests the caller decided (`steps__actor_sub=ctx.sub`). | — |

### Tests added

`tests/test_qa_wave1_w3.py` — 4 tests, all fail on 8a2be7a and prove F1–F4:
`test_f1_a_vc_delegate_can_decide_through_the_api`,
`test_f2_a_delegation_ends_when_the_principal_loses_the_role`,
`test_f4_an_out_of_range_year_is_422_not_500`, `test_f3_an_svg_receipt_is_not_rendered_inline`.

Suite (`manage.py test tests --settings=config.settings_test`, working tree at 40a1c0b with
this file and the untracked `test_qa_wave1_w2.py` from the parallel W2 review): 365 tests,
11 failures + 1 error = 4 new (this file) + 7 (`test_qa_wave1_w2.py`, other review) + 1 error
in `test_jobs.PurgeExternalTests` (`KeyError: 'result'`, W4 area, fails standalone without
this file); 5 skipped, 4 expected failures. Baseline before this file: 349 tests, 4 failures.
