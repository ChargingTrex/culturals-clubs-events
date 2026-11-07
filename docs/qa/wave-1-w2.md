# QA review — wave 1 / W2 (commit 5af58d0)

Scope: B-00a delete permission, B-00b venue locking + Postgres exclusion constraint,
B-00c organiser scope, B-03 join requests, B-04 office-bearer terms + handover, B-05
dormancy, `registered_count` guard, roster-read audit. Reviewed against CHECKLIST rows,
AUDIT §4 X-1/X-2/X-4, FLOWS §3/§10/§11, MASTER_SPEC §3.3/§4.1/§9.3/§6.7, PRD §5.1–5.3,
§5.18, §5.19.2, AGENT_PROMPT §3–§4/§6. Paths relative to `clubs-and-culturals-platform/app/backend/`.

## Verdict: **pass-with-findings**

B-00a, B-00b (the parts W2 owns), B-00c, B-03, B-05 and the two small items hold up.
B-04 needs two fixes before it can be called done (F2, F3). F1 is a gap *between* W2's
venue locking and the governance app: the one transition into a confirmed status
(`decide()` → `published`) runs under neither the venue lock nor a clash re-check; W2's
new constraint turns that silent double booking into a 500 on Postgres. It is outside
W2's assigned files, so it goes to whoever owns governance, but it must be fixed in
wave 2 or the exclusion constraint is only half a guarantee.

### What holds up

- **Delete.** `destroy` is scoped by queryset (`club_id__in` own clubs, organiser scope
  deliberately excluded) → students, other clubs' officers and organisers get 404; own-club
  non-proposers 403; Dean/VC/Society/Admin see the row (they see everything) and get 403.
  The before-snapshot audit is written inside the same `transaction.atomic()` as the
  delete, so a `ProtectedError` rolls both back; `ProtectedError` → 409 cannot leak
  existence (the caller has already passed the own-club 404 and the PROPOSERS 403).
  Registrations only exist from `published` on, so the branch is practically unreachable.
  Note: `ApprovalRequest.event` is CASCADE, so deleting a `returned`/`rejected` proposal
  removes its approval trail; the `AuditEntry` rows survive. Acceptable per B-00a as
  specified; recorded here so nobody is surprised.
- **Treasurer may delete a draft — recommend keeping it.** PRD §5.19.2 gives the
  Treasurer "Create and submit a proposal: Yes" and MASTER_SPEC §9.3 defines `PROPOSERS`
  as "create, edit and submit a proposal". Withdrawing a never-submitted draft is a
  weaker act than submitting one; tying delete to `PROPOSERS` is the consistent reading.
  Action: add a "Delete draft / returned / rejected proposal" row to MASTER_SPEC §4.1 so
  the matrix says so explicitly.
- **Lock order.** event → venue in `submit` and `reassign_venue`; venue only in `create`
  (no event row yet). `perform_update` edits only `draft`/`returned`, which hold no slot,
  and the only exit from those is `submit`, which re-checks under the lock. `go_live` and
  `close` move between confirmed statuses without touching venue/time. No nullable
  relation is joined under a lock anywhere in the diff: `Event.select_for_update()
  .select_related("club","venue")` (both non-null FK) and `JoinRequest.select_for_update()
  .select_related("student__user")` (`JoinRequest.student` non-null, `Student.user` is a
  forward non-null OneToOne) are inner joins. See F8 for the `of=` nit.
- **Migration 0004.** `RunPython` with vendor guard both ways; reverse drops the
  constraint by name (`IF EXISTS`) and leaves the extension — safe. `migrate` on SQLite is
  clean (suite runs), `makemigrations --check` clean. `CONFIRMED` matches
  `events.models.SLOT_CONFIRMED` exactly. `tstzrange(starts_at, ends_at, '[)')` with `&&`
  is `starts < other.ends AND ends > other.starts` — identical to `overlapping()` with
  buffer 0, so the constraint is the floor and the buffer is the application's; the
  docstring says so. Hosting notes (for HOSTING.md): `btree_gist` is a trusted extension
  since PG13, so the migrating role needs CREATE on the database, not superuser — Neon's
  `neon_superuser` has it; any pre-existing overlapping confirmed rows make the migration
  fail, so run `SELECT ... FROM events_event a JOIN events_event b ON a.venue_id=b.venue_id
  AND a.id<b.id AND tstzrange(a.starts_at,a.ends_at) && tstzrange(b.starts_at,b.ends_at)
  WHERE a.status IN (...) AND b.status IN (...)` before the first deploy.
- **Organiser scope.** `active_event_ids` filters `ends_at IS NULL OR ends_at > now`;
  `RefreshView` calls `tokens.access_token(user)` → `roles_for`, so an ended grant is gone
  at the next refresh, i.e. within the 15-minute access TTL. Wrong student id → 422 from a
  UUID lookup; UUIDv4 is not guessable and the probe is only open to Presidents/VPs.
  DELETE on a missing grant is 404 either way. Assigning a student who is not a member of
  the club is allowed — MASTER_SPEC §3.3 scopes the organiser to the event, not the club,
  so this is fine. F6 is the real gap.
- **Join.** Two concurrent accepts serialise on `select_for_update` of the `JoinRequest`;
  the second sees `state != pending` → 409 `CLUBS_JOIN_ALREADY_DECIDED`. The one-active-
  membership `IntegrityError` is caught in a savepoint and mapped to 409 (F4 for what it
  leaves behind). Archived clubs refuse joins; dormant clubs accept them and the join
  reactivates the club (see F10). `join` requires `ctx.student_id`, so staff cannot join.
- **Dormancy signal.** `post_save` skips `update_fields` saves without `status`, skips
  non-activity statuses, writes an audit entry only on reactivation. Idempotent (two
  UPDATEs by PK). Job is a management command only — W4 jobs app should schedule it.
- **Tests are real.** Tokens are minted through the login endpoint (`as_user` →
  `token_for`) and roles come from `roles_for()`; wrong-role tests assert the refusal
  *and* that nothing changed (`test_the_treasurer_cannot_accept`, `..._may_not` in
  handover). The five Postgres-only tests read correctly: threads get their own
  connection and close it; `Barrier(2)` + `TransactionTestCase`; the two proposals both
  land (`[201, 201]`) with exactly one flagged because the second waits on the venue lock
  and reads A's `submitted` row after A's commit (READ COMMITTED); the two moves take
  event→venue in the same order (no deadlock) and the loser hits `EVENTS_VENUE_UNAVAILABLE`.
  Test DB is created by migrations (settings_test does not disable them), so the
  constraint exists for `VenueExclusionConstraintTests`. I expect all five to pass.
- **Query counts** (21 members / 20 requests / 20 terms, `CaptureQueriesContext`):
  roster 5, join-requests 2, history 2 — flat. (`GET /clubs` list is 1+N on
  `member_count`; pre-existing, not W2's.)

## Findings

| id | severity | file:line | what can go wrong | suggested fix | test that would catch it |
|---|---|---|---|---|---|
| F1 | high | `governance/services.py:420-508` (`decide`), `governance/views.py:204-213` | The clash check for approval is in the view, before and outside `decide()`'s transaction, and `decide()` takes no event/venue lock. Two Deans approve two soft-clashing `submitted` proposals at once (or any caller reaches `decide()` after the view check): both pass, both become `published`. SQLite: double booking. Postgres: W2's exclusion constraint raises `IntegrityError` at `event.save()` → unmapped 500, with the `ApprovalStep` and notifications already written in the rolled-back transaction. | Move the check into `decide()`: when the outcome is `published`, lock `Event` then `Venue` (same order as `submit`) and call `assert_bookable(..., exclude_id=event.pk)` before `event.save()`; also map `IntegrityError` on the constraint name to 409 `EVENTS_VENUE_UNAVAILABLE` as a last resort. | `tests/test_qa_wave1_w2.py::PublishTransitionIsUnguardedTests` (fails: B publishes into A's confirmed slot). Postgres-only: two threads approving two clashing requests → `[200, 409]`. |
| F2 | high | `clubs/services.py:215-220` | `outgoing` closes only terms with `starts_at < effective_at`. A handover backdated before the current holder's term start (e.g. VP became President a minute ago via a first handover or `POST /memberships/{id}/role`, then runs a second handover with `effective_at` two days ago) leaves that term open: two current Presidents, both tokens carry `club_president:<club>`, and `apply_due_terms` trips `one_active_president_per_club` → 500. The audit entry is rolled back with it. | Either refuse `effective_at` earlier than the latest `starts_at` of any current term for the named roles/students (422 `CLUBS_HANDOVER_BEFORE_CURRENT_TERM`), or close every term for those roles/students that is current *or starts after* `effective_at`. The 422 is simpler and matches "effective dates" in PRD §5.3. | `tests/test_qa_wave1_w2.py::BackdatedHandoverTests` (fails: 500, two current President terms). |
| F3 | medium | `clubs/views.py:231-238` (`_notify_assigners`), `governance/services.py:154-156` (`_notify_club`) | Both pick recipients by `Membership.role`. After a future-dated handover's date passes, the terms (and tokens) say the new President but the rows still say the old one until some later handover runs `apply_due_terms` — so join-request and approval-outcome notifications go to the outgoing bearer, who may have graduated. The roster (`members`) shows the stale role too. | Add `services.current_office_bearers(club, roles)` derived from terms with the Membership-row fallback (same precedence as `effective_role`) and use it in both notifiers; schedule `apply_due_terms` for every club daily in the W4 jobs app so rows catch up on the effective date. | `tests/test_qa_wave1_w2.py::JoinQueueNotificationFollowsTheTermTests` (fails: old President notified). |
| F4 | medium | `clubs/views.py:195-203` | Accepting a request for a student who became a member by another route (join_mode flipped to open and they joined; direct add) returns 409 `CLUBS_ALREADY_MEMBER` and leaves the request `pending` forever: it can never be accepted, counts in `pending_join_requests`, and the student is told nothing. | On the `IntegrityError`, mark the request `accepted` (decided_by = actor, note "already a member") and return 200 with the existing membership — the request's intent is satisfied. Also auto-settle pending requests when `join_mode` is set to `open`. | `tests/test_qa_wave1_w2.py::AcceptWhenAlreadyAMemberTests` (fails: still pending). |
| F5 | low | `events/views.py:393`, `clubs/views.py:169-187` | `request_id` / `student_id` path segments go straight into a `UUIDField` filter; a non-UUID becomes Django `ValidationError` → 422 `VALIDATION_FAILED` with the field message, where every other unknown resource on these routes is 404. Harmless but inconsistent with API_Standards §3.3. | Constrain the URL regex to UUIDs (`(?P<student_id>[0-9a-f-]{36})`) or parse with `uuid.UUID` and raise `_not_found` on `ValueError`. | `tests/test_qa_wave1_w2.py::MalformedPathIdTests` (fails: 422 ≠ 404). |
| F6 | medium | `events/views.py:372-380`, `events/models.py:186` | `ends_at` is optional and defaults to NULL = "until removed". MASTER_SPEC §3.3: attendee-identity access is "time-bound to the event plus a limited window". A President who never sets `ends_at` grants the roster scope for life; the model docstring even names the right value. | Default `ends_at` to `event.ends_at + TOKEN_LIFETIMES["scan_station_grace"]` when omitted; reject `ends_at` later than, say, event end + 7 days with 422. | `tests/test_qa_wave1_w2.py::OrganiserGrantIsTimeBoundTests` (fails: `ends_at` is None). |
| F7 | medium | `clubs/services.py:177-258`, `clubs/views.py` `handover` action | Handover sends no notification to incoming or outgoing bearers (no `notifier()` call anywhere on the path). PRD §5.3/§5.5 and FLOWS §11 treat the transfer as an event the people concerned are told about; today the incoming President learns of it when their token changes. | In the view after `services.handover` returns: `notifier().send` to each incoming and outgoing student's user (in-app + email via the existing notifier), kind `club.handover`, link `/club/{id}/members`. | Assert `Notification.objects.filter(kind="club.handover")` has the incoming and outgoing users after `HandoverTests.test_the_president_hands_over_and_loses_the_office`. |
| F8 | low | `clubs/views.py:187` | `JoinRequest.objects.select_for_update().select_related("student__user")` without `of=` — on Postgres `FOR UPDATE` locks the joined `identity_student` and `identity_user` rows too, so a concurrent login writing `last_login` for the applicant blocks on the accept. Not an error (inner joins), but the B-15 discipline W1 adopted was `of=("self",)`. | `select_for_update(of=("self",))`. | Postgres-only: `CaptureQueriesContext` asserting the SQL ends with `FOR UPDATE OF "clubs_joinrequest"`. |
| F9 | low | `clubs/views.py:41-55`, `office_bearer_history` | `_require_role_assigner` gives the Dean 403 on the join queue and on handover; `office_bearer_history` admits the Dean. PRD §5.18 says the Student Life Office/Dean "can view any club's roster"; and a club whose President and VP have both graduated has no one who can run a handover or assign a role — Dean/Admin lockout recovery does not exist. | Let `can_see_individual_records()` read the queue; let Dean/Admin run `handover` (audited as such). | Dean GET join-requests → 200; Dean POST handover on a club with no current officers → 201. |
| F10 | low | `clubs/views.py:134`, `events/signals.py:30` | (a) A self-service join on an open club calls `touch_activity`, so one student joining flips a dormant club back to active and writes `club.reactivated` with the student as actor — the club did nothing. (b) `decide()` saves `status` even when only the stage advances, so an approver's action counts as club activity. (c) `touch_activity` always issues two UPDATEs when the club is active. | (a) Touch on officer decisions (accept, role change, handover, event submission), not on self-join. (b) In the signal, compare against the pre-save status via `instance._state` or `pre_save`, or have `decide()` save `status` only when it changed. (c) Single conditional UPDATE with a `Case` or `update(... status=Case(...))`. | Student joins dormant open club → still dormant, no `club.reactivated` entry. |
| F11 | low | `events/models.py:118-124` | `registered_count` introspects `_meta.get_fields()` on every event payload for a field that now exists (W1 merged). Dead guard, a query-plan-irrelevant but confusing `any()` over fields per event in a list. | Replace with `filter(cancelled_at__isnull=True, waitlisted=False)`. | n/a (cleanup). |
| F12 | low | `events/migrations/0004:25` | `CONFIRMED` is a literal copy of `SLOT_CONFIRMED`; a future status added to one and not the other silently narrows or widens the constraint. | Add a unit test asserting `migration.CONFIRMED == tuple(SLOT_CONFIRMED)` (import the migration module by path). | That test. |
| F13 | low | `clubs/views.py:126-133` | In platform mode a token's `student_id` may have no local `Student` row; `Membership.objects.create(student_id=...)` then raises an FK `IntegrityError`, which the `except IntegrityError` maps to 409 `CLUBS_ALREADY_MEMBER` — a wrong, misleading answer. | Check `Student.objects.filter(pk=ctx.student_id).exists()` → 403 `CLUBS_STUDENTS_ONLY` first, or narrow the except by inspecting the constraint name. | Platform-mode claims with an unknown `student_id` → 403, not 409. |

Not a finding, flagged for the orchestrator: F1 and the `_notify_club` half of F3 are in
`governance/`, which W2 did not own; the fixes are small but need that owner.

## Tests added

`tests/test_qa_wave1_w2.py` — 7 tests, all failing on 5af58d0 by design: F1
(`PublishTransitionIsUnguardedTests`), F2 (`BackdatedHandoverTests`), F3
(`JoinQueueNotificationFollowsTheTermTests`), F4 (`AcceptWhenAlreadyAMemberTests`), F5
(`MalformedPathIdTests`, 2), F6 (`OrganiserGrantIsTimeBoundTests`).

## Suite result

`manage.py test tests --settings=config.settings_test` on the current tree:
**365 tests, 11 failures, 1 error, 5 skipped (Postgres-only), 4 expected failures.**
The 11 failures are the 7 above plus 4 in `tests/test_qa_wave1_w3.py`; the error is in
`tests/test_jobs.py` — both belong to other reviews. The 4 W1 failures noted at baseline
no longer fail. W2's own 3 test files (81 tests, 5 skipped) all pass.
