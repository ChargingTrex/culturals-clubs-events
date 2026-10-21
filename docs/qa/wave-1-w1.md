# QA review — wave 1 / W1 (commit 1cefd6d)

Scope: waitlist + FIFO promotion, `feedback` app, registration/publication/venue-move
notifications, roster-read audit, `select_for_update(of=("self",))`. Reviewed against
CHECKLIST B-01/B-02/B-12/B-14/B-15, FLOWS §7–§8, AGENT_PROMPT §3, API_DATA_MODELS §4.
Paths are relative to `clubs-and-culturals-platform/app/backend/`.

## Verdict: **rework**

B-02, B-14 and B-15 pass. B-12 passes with findings (F7, F8). B-01 needs rework:
a waitlisted student can mint a working pass and be admitted past capacity (F1),
and the cancel path can promote into a seat that is physically occupied (F3).
Four QA tests were added that fail on this commit and prove F1–F3.

### What holds up

- Cancel → promote: the event row is locked (`select_for_update`) before the capacity
  read and the promotion, inside one `@transaction.atomic`. Two concurrent cancels
  serialise on that lock and each re-reads `confirmed_count` under it, so one cancel
  frees one seat and promotes at most one head. `register_student` takes the same lock,
  so a registration cannot land between "cancelled" and "promoted". The promotion
  candidate is itself locked, and Postgres re-evaluates the WHERE after acquiring the
  lock, so a student already admitted at the door is not promoted a second time.
- `one_active_registration_per_event_per_student` covers waitlisted rows (condition is
  `cancelled_at IS NULL`, no `waitlisted` term): one student cannot be both queued and
  confirmed. Proven by `test_the_partial_unique_index_still_holds_for_a_waitlisted_student`.
- Feedback summary exposes `event.id/title`, `count`, `average_rating`, `recommend_rate`,
  `comments[]` only — no student/registration/feedback ids. Readers: Dean, Admin,
  Cultural Society, and the event club's President/VP/Secretary/Treasurer. VC, members,
  attendees and other clubs' officers get 404 `NOT_FOUND` (same discipline as the roster).
  Rating CHECK and per-student UNIQUE are DB constraints and tested at the DB level.
- Signals fire on the `update_fields` saves used by governance (`status`) and
  events (`venue`); no `.update()`/`bulk_update` on Event bypasses them. Roster read
  writes an `AuditEntry` only after authorisation. Migration 0002 adds a NOT NULL boolean
  with default: metadata-only on Postgres ≥ 11, existing rows become `False` (correct:
  every pre-existing registration holds a place), no backfill. `makemigrations --check` clean.
- Wrong-role tests are real: tokens are minted via `factories.as_user → token_for`, roles
  come from `roles_for()`, and the request hits the URL. No vacuous assertions found
  (the single-element loop in `test_the_treasurer_dean_society_and_admin_may_read_it`
  is odd but asserts). New codes (`FEEDBACK_NOT_OPEN` 409, `FEEDBACK_NOT_ATTENDED` 403,
  `FEEDBACK_ALREADY_SUBMITTED` 409) go through `ProblemDetail` → RFC 9457 body.

## Findings

| id | sev | file:line | what can go wrong | suggested fix | test that catches it |
|---|---|---|---|---|---|
| F1 | critical | `participation/views.py:154-163`, `services.py:81-86`, `services.py:345-369` | A waitlisted student calls `POST /registrations/{id}/reissue-pass` → 200 with a live pass (`reissue_pass` never checks `waitlisted`). At the door the pass branch of `resolve` checks revoked/used/cancelled but not `waitlisted`, so the scan is ACCEPTED: `attended=True` on a `waitlisted=True` row, the seat holder still holds their seat, capacity exceeded and the queue skipped. Reachable with an ordinary student token. | `reissue_pass`: raise `Conflict("PARTICIPATION_WAITLISTED")` when `registration.waitlisted`. `resolve` pass branch: if `registration.waitlisted`, fall through to the capacity check (admit from the queue only if a seat is free, else NOT_REGISTERED "On the waitlist"). | `tests/test_qa_wave1_w1.py::WaitlistHoldsNoPlaceTests` (two tests; both fail now) |
| F2 | high | `participation/models.py:75-95` | No CHECK forbids `waitlisted=True AND attended=True`. F1 writes exactly that row today, and any future admit path can again. Rule 3: the invariant belongs in the database. | Schema request to A1: `CheckConstraint(Q(waitlisted=False) \| Q(attended=False), name="waitlisted_never_attended")` in `0003`. A live pass on a waitlisted row cannot be a CHECK (cross-table); guard it in `issue_pass`. | `test_the_database_refuses_waitlisted_and_attended_together` (fails now) |
| F3 | high | `participation/services.py:229-247` | `cancel_registration` reads `attended` and `waitlisted` from the caller's instance *before* taking the event lock and never locks/re-reads the registration row. Interleaving: view fetches row → door check-in commits → cancel proceeds: `cancelled_at` set on an attended row, its used pass "revoked", and the queue head promoted into a seat that is physically occupied → one over capacity. Also: cancelling an already-cancelled row overwrites `cancelled_at` (history rewritten) and re-runs promotion. | After the event lock: `registration = Registration.objects.select_for_update().get(pk=registration.pk)`; if `cancelled_at` is set → no-op (or 409); if `attended` → raise. Compute `held_a_place` from the locked row. | `tests/test_qa_wave1_w1.py::CancelRaceTests` (fails now) |
| F4 | medium | `services.py:397-428`, `services.py:431-469` | Door admission (walk-in or waitlisted) reads `confirmed_count(event)` with no event row lock; `resolve` locks only the registration row and `check_in_manually` runs in no transaction at all. Two stations admitting two different students for one free seat both pass the check; `POST /registrations` (which locks the event) can interleave with a door admission. Pre-existing for walk-ins; the waitlist branch adds a second writer. Only Postgres shows it (SQLite serialises). | `Event.objects.select_for_update().get(pk=event.pk)` before the capacity check in both functions; wrap `check_in_manually` in `transaction.atomic`. Same lock order as `register_student`/`cancel_registration` (event first) to avoid deadlock. | Postgres-only `TransactionTestCase` with two connections; not deterministic on SQLite, not added |
| F5 | medium | `events/models.py:117`; call sites `events/serializers.py:34` (`EventSerializer.registered`), `reporting/services.py:110` (`semester_report` → `events[].registered`) | `Event.registered_count()` counts waitlisted rows: a full event with a queue shows `registered > capacity` on `GET /events` and in the semester report's per-event rows. Participation views already use `confirmed_count`. `attended`-based figures (`_ATTENDED`, `attended_count`) are unaffected; rule 6 holds. W2 is fixing — make sure the fix is in `registered_count()` itself (`waitlisted=False`), not per call site. | `registered_count`: add `waitlisted=False`; add `waitlisted_count()` if the figure is wanted. | full event + 1 queued → `GET /events/{id}` `registered == capacity`; `semester_report` row `registered == capacity` |
| F6 | medium | `participation/signals.py:33-58`, `services.py:106-168` | Notifications (Notification row + synchronous `send_mail`) run inside the caller's transaction. (a) A rollback after the hook (e.g. `governance.decide` fails on `budget.save` at `governance/services.py:309`, or `reassign_venue` fails on `VenueReassignment.create` at `events/services.py:115`) leaves the email sent but no row and no state change: students told "published"/"moved" for an event that was not. (b) `reassign_venue` holds the event `select_for_update` while N SMTP sends run — one per registrant — blocking every register/cancel on that event for the duration. Same pattern exists in governance, but that fans out to ≤ 3 officers. | `transaction.on_commit(lambda: notify_registered_students(...))` in `post_save`; same for `notify_registration`/`notify_promotion`/`notify_waitlisted`. | save inside `atomic()` that raises afterwards → `mail.outbox == []` and no Notification row |
| F7 | low | `signals.py:50-58`, `events/views.py:253` | Venue move sends two `event.venue_changed` notifications to an officer who also registered (officer fan-out + student fan-out, same `kind`). Publication hook: registration requires PUBLISHED/LIVE, so at publication the recipient set is normally empty — B-12 satisfied literally; confirm with PRD 5.16.3 whether the audience is club members/followers. Stale `_participation_before` attr survives if `save()` raises between hooks → a later unrelated save of that instance can emit a spurious notification. | Distinct `kind` for the audience fan-out or exclude officers already notified; wrap `post_save` body in try/finally that always `delattr`s. | officer registered for own event, move venue → exactly one row per kind |
| F8 | low | `services.py:414-421`, `:453-460` | A waitlisted student scanned at the door takes the free seat regardless of queue position (B admitted while A is head). Defensible at a door, but B-01 says FIFO and FLOWS §7 does not state the exception. | Document the rule (docstring + FLOWS §7), or admit only the queue head. | seat free, queue [A, B], scan B → assert documented outcome |
| F9 | low | `participation/views.py:184-198`, `:36-48` | Pre-existing N+1: `live_pass()` queries per registration despite `prefetch_related("passes")` (my-passes: 13 queries for 8 registrations; list: 11). Roster adds two COUNTs (fine); summary is 2 queries (fine). | Pick the live pass from `registration.passes.all()` in Python, or `Prefetch("passes", queryset=EventPass.objects.filter(used_at__isnull=True, revoked_at__isnull=True))`. | `assertNumQueries` on my-passes with 8 registrations |
| F10 | low | `docs/API_DATA_MODELS.md:783,628,896,907`; `docs/FLOWS.md:261,272`; `docs/audit-detail-backend.md:83`; `MASTER_SPEC.md:991,1315` | `PARTICIPATION_EVENT_FULL` still listed as a response of `POST /participation/registrations`; docs still say waitlist/feedback missing. No references in `app/frontend/src`. | Replace with 201 `waitlisted: true`; mark Feedback/waitlisted as built; add the `/feedback/*` routes and FEEDBACK_* codes to §4. | — |
| F11 | low | `services.py:209-213` | `order_by("created_at")` with no tie-break: equal timestamps (imports, bulk) promote in arbitrary order. | `order_by("created_at", "registered_at", "pk")`. | — |
| F12 | low | `tests/test_participation_api.py:154-163` | `test_a_waitlisted_student_takes_a_free_place_at_the_door` frees the seat with `.delete()`, which the model forbids; the realistic path (holder cancels → head promoted → next in queue refused at the door) is not exercised. | Replace the delete with `cancel_registration` on a 2-seat event. | — |

## Tests added

`clubs-and-culturals-platform/app/backend/tests/test_qa_wave1_w1.py`

- `WaitlistHoldsNoPlaceTests.test_a_waitlisted_student_cannot_mint_a_pass_by_reissuing` — F1 (FAILS: 200 with a token)
- `WaitlistHoldsNoPlaceTests.test_the_door_refuses_a_pass_held_by_a_waitlisted_registration` — F1 (FAILS: ACCEPTED)
- `WaitlistHoldsNoPlaceTests.test_the_database_refuses_waitlisted_and_attended_together` — F2 (FAILS: no IntegrityError)
- `CancelRaceTests.test_a_stale_cancel_cannot_cancel_an_attended_registration_and_promote` — F3 (FAILS: no exception)

Suite: `manage.py test tests --settings=config.settings_test` → 211 tests, 207 pass,
4 fail (the four above, by design). `makemigrations --check`: no changes.
