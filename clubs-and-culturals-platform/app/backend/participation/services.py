"""
Check-in resolution and offline replay.

The organiser scans the student, metro-turnstile style — never the reverse, and
there is no route by which a student marks themselves present (AGENT_PROMPT §2).
That is why every function here takes an operator.

Token crypto lives in qrkit/, which carries the MIT attribution for the code it
derives from and requires QR_SIGNING_KEYS to be set explicitly. This module is the
domain layer over it: it decides what a resolved token *means* for a registration.
"""
from django.db import IntegrityError, transaction
from django.utils import timezone

from common.errors import Conflict
from events.models import EventStatus
from integrations.registry import notifier
from participation.models import (
    ACCEPTING, EventPass, Registration, ScanRecord, ScanResult, StudentQRToken,
)
from qrkit import tokens as qr

# Statuses in which a place can be taken or a waitlisted student promoted.
OPEN_FOR_REGISTRATION = (EventStatus.PUBLISHED, EventStatus.LIVE)


# --------------------------------------------------------------------------
# Issuing
# --------------------------------------------------------------------------
def _active_key_id():
    from django.conf import settings

    return getattr(settings, "QR_ACTIVE_KEY_ID", "v1")


def profile_token_for(student):
    """One live profile QR per student, created on first use."""
    record = StudentQRToken.objects.filter(student=student, revoked_at__isnull=True).first()
    if record:
        return record
    return StudentQRToken.objects.create(
        student=student, token=qr.issue_profile_token(student.id), key_id=_active_key_id()
    )


def reissue_profile_token(student):
    """Lost phone: revoke and reissue, keeping the version history."""
    previous = StudentQRToken.objects.filter(student=student, revoked_at__isnull=True).first()
    version = 1
    if previous:
        previous.revoked_at = timezone.now()
        previous.save(update_fields=["revoked_at", "updated_at"])
        version = previous.version + 1
    return StudentQRToken.objects.create(
        student=student, token=qr.issue_profile_token(student.id), version=version,
        key_id=_active_key_id(),
    )


def issue_pass(registration):
    """
    Mint a pass for a registration.

    Two steps, deliberately: the row is created first so the token can name it.
    The subject of a pass token is the EventPass row, not the registration,
    because the pass row is what carries `used_at` — the token names exactly the
    thing that gets spent. The kit shipped with these two disagreeing, which meant
    no pass it issued could ever be redeemed.

    The token is stored rather than re-minted on read. Re-minting embeds a fresh
    `iat` each time, so a screenshotted or printed pass would stop matching the
    row, and the unique index could not catch a collision.
    """
    event_pass = EventPass.objects.create(registration=registration, token="",
                                         key_id=_active_key_id())
    event_pass.token = qr.issue_event_pass(event_pass.id, registration.event_id)
    event_pass.save(update_fields=["token", "updated_at"])
    return event_pass


def reissue_pass(registration):
    """
    Revoke the live pass and mint another, so a forwarded copy stops working.

    A waitlisted registration holds no place and therefore no pass: a pass is a
    working credential, and minting one here would let a queue entry walk past
    capacity at the door.
    """
    if registration.waitlisted:
        raise Conflict(code="PARTICIPATION_WAITLISTED", title="On the waitlist",
                       detail="You are on the waitlist; a pass is issued when a place opens.")
    EventPass.objects.filter(
        registration=registration, used_at__isnull=True, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    return issue_pass(registration)


def live_pass(registration):
    return registration.passes.filter(used_at__isnull=True, revoked_at__isnull=True).first()


def confirmed_count(event):
    """
    Places taken: active registrations that are not waitlisted.

    This, not `Event.registered_count()`, is what capacity is checked against —
    a waitlisted row is a queue entry, not a place. Reporting is untouched: it
    counts `attended` only (rule 6).
    """
    return event.registrations.filter(cancelled_at__isnull=True, waitlisted=False).count()


# --------------------------------------------------------------------------
# Student notifications (PRD 5.5, 5.16.3)
# --------------------------------------------------------------------------
# All through the NotificationSender seam: one call writes the in-app row and
# sends the email. No other channel exists or may be added (AGENT_PROMPT §2).
def _event_link(event):
    return f"/club/{event.club_id}/events/{event.id}"


def _tell_student(student, *, subject, body, kind, link):
    """
    Deferred to commit. A notification sent from inside a transaction that then
    rolls back tells a student about a place, a publication or a move that never
    happened — and an SMTP round-trip per registrant while the event row is
    locked stalls every register and cancel at that event.
    """
    transaction.on_commit(lambda: notifier().send(
        recipient=student.user, subject=subject, body=body, kind=kind, link=link))


def _lock_event(event):
    """Row lock on the event. Always taken before any registration row lock."""
    from events.models import Event

    return Event.objects.select_for_update().get(pk=event.pk)


def notify_registration(registration, event_pass):
    event = registration.event
    _tell_student(
        registration.student,
        subject=f"You are registered for “{event.title}”",
        body=(f"Your place at “{event.title}” on {event.starts_at:%d %b %Y} at "
              f"{event.venue.name} is confirmed. Your pass (ref {event_pass.id}) is in "
              f"My Passes — show it, or your profile QR, at the door."),
        kind="registration.confirmed", link="/me/passes",
    )


def notify_waitlisted(registration):
    event = registration.event
    _tell_student(
        registration.student,
        subject=f"You are on the waitlist for “{event.title}”",
        body=(f"“{event.title}” on {event.starts_at:%d %b %Y} is full. You are on the "
              f"waitlist and will receive a pass if a place frees up."),
        kind="registration.waitlisted", link=_event_link(event),
    )


def notify_promotion(registration, event_pass):
    event = registration.event
    _tell_student(
        registration.student,
        subject=f"A place opened up: you are in for “{event.title}”",
        body=(f"You have moved off the waitlist for “{event.title}” on "
              f"{event.starts_at:%d %b %Y} at {event.venue.name}. Your pass "
              f"(ref {event_pass.id}) is in My Passes."),
        kind="registration.promoted", link="/me/passes",
    )


def notify_registered_students(event, *, subject, body, kind):
    """
    Tell everyone holding an active registration (waitlist included) about a
    change to the event itself: publication, a venue move. Called from the
    Event save signal in participation/signals.py, so governance and events
    need no knowledge of this app.
    """
    registrations = (Registration.objects
                     .filter(event=event, cancelled_at__isnull=True, student__isnull=False)
                     .select_related("student__user"))
    for registration in registrations:
        _tell_student(registration.student, subject=subject, body=body, kind=kind,
                      link=_event_link(event))


@transaction.atomic
def register_student(event, student, *, source=Registration.Source.PRE_REGISTERED):
    """
    Create a registration and its one-time pass — or, when the event is full,
    a waitlisted registration with no pass (PRD 5.6).

    Capacity is checked under a row lock on the event. Checking it without one
    lets two simultaneous registrations both read "one place left" and both take it.
    """
    from events.models import Event

    locked = Event.objects.select_for_update().get(pk=event.pk)
    if locked.status not in OPEN_FOR_REGISTRATION:
        raise Conflict(code="PARTICIPATION_NOT_OPEN", title="Registration is not open",
                       detail=f"“{locked.title}” is {locked.get_status_display().lower()}.")
    waitlisted = confirmed_count(locked) >= locked.capacity
    registration = Registration(event=locked, student=student, source=source,
                                waitlisted=waitlisted)
    registration.snapshot_from(student)
    try:
        registration.save()
    except IntegrityError as exc:
        # The partial unique constraint fired. That is the correct answer, not a
        # bug to work around.
        raise Conflict(code="PARTICIPATION_ALREADY_REGISTERED", title="Already registered",
                       detail="You already hold a registration for this event.") from exc
    if waitlisted:
        notify_waitlisted(registration)
    else:
        notify_registration(registration, issue_pass(registration))
    return registration


def promote_from_waitlist(event):
    """
    Move the earliest waitlisted student into the place that just freed up.

    Caller holds the event row lock. FIFO by `created_at`: the order people
    joined the queue is the only fair order, and it is the one the database
    already records.
    """
    if event.status not in OPEN_FOR_REGISTRATION:
        return None
    if confirmed_count(event) >= event.capacity:
        return None
    candidate = (Registration.objects.select_for_update()
                 .filter(event=event, waitlisted=True, cancelled_at__isnull=True,
                         student__isnull=False)
                 .order_by("created_at", "registered_at", "pk").first())
    if candidate is None:
        return None
    candidate.waitlisted = False
    candidate.save(update_fields=["waitlisted", "updated_at"])
    notify_promotion(candidate, issue_pass(candidate))
    return candidate


@transaction.atomic
def cancel_registration(registration):
    """
    Cancel, never delete. An attended registration cannot be cancelled: it is a
    record of something that happened.

    Freeing a place promotes the head of the waitlist inside the same
    transaction, under the event lock: between "cancelled" and "promoted" there
    must be no moment at which a concurrent registration can take the place.
    """
    locked_event = _lock_event(registration.event)
    # Re-read under the lock. The caller's instance is what the view fetched a
    # moment ago; a check-in or a cancel can have landed since, and only the row
    # as it is now decides whether a place is being freed.
    registration = Registration.objects.select_for_update().get(pk=registration.pk)
    if registration.cancelled_at is not None:
        return registration   # already done; never rewrite the time or promote twice
    if registration.attended:
        raise Conflict(code="PARTICIPATION_ALREADY_ATTENDED", title="Already checked in",
                       detail="An attended registration cannot be cancelled.")
    held_a_place = not registration.waitlisted
    registration.cancelled_at = timezone.now()
    registration.save(update_fields=["cancelled_at", "updated_at"])
    EventPass.objects.filter(registration=registration, used_at__isnull=True,
                             revoked_at__isnull=True).update(revoked_at=timezone.now())
    if held_a_place:
        promote_from_waitlist(locked_event)
    return registration


# --------------------------------------------------------------------------
# Resolution — the seven branches
# --------------------------------------------------------------------------
class Outcome:
    def __init__(self, result, *, verdict, registration=None, student=None, detail=""):
        self.result = result
        self.verdict = verdict
        self.registration = registration
        self.student = student
        self.detail = detail

    @property
    def accepted(self):
        return self.result in ACCEPTING

    @property
    def tone(self):
        if self.accepted:
            return "ok"
        return "warn" if self.result == ScanResult.DUPLICATE else "bad"


def _duplicate(registration):
    when = timezone.localtime(registration.checked_in_at).strftime("%H:%M")
    where = f" at {registration.station_id}" if registration.station_id else ""
    return Outcome(ScanResult.DUPLICATE, verdict="Already checked in",
                   registration=registration, student=registration.student,
                   detail=f"First scanned at {when}{where}")


def _mark_attended(registration, at, operator, station_id):
    registration.attended = True
    registration.checked_in_at = at
    registration.checked_in_by = operator
    registration.station_id = station_id or ""
    registration.save(update_fields=["attended", "checked_in_at", "checked_in_by",
                                     "station_id", "updated_at"])


def _admit_or_refuse(event, student, registration, at, operator, station_id, *,
                     source, walkin_detail="", via="", event_pass=None):
    """
    Walk-in or queue entry at the door. The caller holds the event row lock, so
    the capacity read and the admit are one unit; `registration` is the
    student's waitlisted row (locked), or None for a walk-in.

    A queue entry presenting at the door takes a free place regardless of queue
    position: the person is here, the place is empty, and a door that turns
    them away to keep the order would hold the place for someone who may not
    come. Promotion on cancellation stays strictly FIFO.
    """
    if confirmed_count(event) >= event.capacity:
        return Outcome(ScanResult.NOT_REGISTERED, verdict="Event at capacity", student=student,
                       detail=("On the waitlist, but no place has opened."
                               if registration is not None else
                               "No places left, so a walk-in cannot be admitted."))
    if registration is None:
        registration = Registration(event=event, student=student, source=source)
        registration.snapshot_from(student)
        registration.save()
        detail = walkin_detail
    else:
        # The flag is cleared BEFORE attended is set: the database refuses a row
        # that is both (`waitlisted_never_attended`).
        registration.waitlisted = False
        registration.save(update_fields=["waitlisted", "updated_at"])
        detail = f"Admitted from the waitlist{via}"
    if event_pass is not None:
        event_pass.used_at = at
        event_pass.save(update_fields=["used_at", "updated_at"])
    _mark_attended(registration, at, operator, station_id)
    return Outcome(ScanResult.SPOT_REGISTERED, verdict="Registered and checked in",
                   registration=registration, student=student, detail=detail)


def _active_registration(event, student, *, lock=False):
    qs = Registration.objects.filter(event=event, student=student, cancelled_at__isnull=True)
    if lock:
        qs = qs.select_for_update()
    return qs.first()


@transaction.atomic
def resolve(token, event, *, operator, station_id="", scanned_at=None, offline_ref=""):
    """
    Resolve one presented code against one event, writing a ScanRecord on every
    branch — including each failure.

    Ordering note: `scanned_at` is the device's timestamp, not the server's.
    Offline scans replay with the time they actually happened, so the genuinely
    earlier scan wins and the later one is the duplicate (AGENT_PROMPT §5).
    """
    at = scanned_at or timezone.now()

    def record(outcome):
        try:
            with transaction.atomic():
                ScanRecord.objects.create(
                    event=event, registration=outcome.registration, result=outcome.result,
                    scanned_token=str(token or "")[:64], station_id=station_id,
                    operator=operator, scanned_at=at, synced_at=timezone.now(),
                    offline_ref=offline_ref, detail=outcome.detail[:200],
                )
        except IntegrityError:
            # Same offline_ref already replayed. The unique constraint is the
            # idempotency key; a second replay is a no-op, not a duplicate row.
            pass
        return outcome

    # --- branches 1, 2 and the expiry case: one-time event pass -----------
    try:
        payload = qr.verify(token, expect_purpose=qr.PURPOSE_EVENT_PASS)
    except qr.TokenExpired:
        return record(Outcome(ScanResult.EXPIRED, verdict="Pass expired",
                              detail="Ask them to show their profile QR instead."))
    except qr.TokenWrongPurpose as exc:
        # Either a pass for another event, or a profile QR. `expect_event` is not
        # passed above precisely so the two can be told apart here rather than
        # collapsing into one unhelpful "invalid code".
        if "different event" in str(exc):
            return record(Outcome(ScanResult.WRONG_EVENT, verdict="Wrong event"))
        payload = None
    except qr.TokenInvalid:
        return record(Outcome(ScanResult.UNKNOWN_CODE, verdict="Code not recognised"))

    if payload is not None:
        if str(payload.event_id) != str(event.id):
            other = (EventPass.objects.filter(pk=payload.subject)
                     .select_related("registration__event").first())
            return record(Outcome(
                ScanResult.WRONG_EVENT, verdict="Wrong event",
                detail=(f"Pass is for “{other.registration.event.title}”"
                        if other else "Pass is for another event"),
            ))
        # A pass on a waitlisted row should not exist (reissue refuses one), but
        # if one does, admitting it needs the capacity path, which needs the event
        # lock — taken BEFORE the pass row lock, the order every other path uses.
        # An unlocked peek decides that, so the common case locks only the pass.
        queued = (EventPass.objects.filter(pk=payload.subject, registration__event=event)
                  .values_list("registration__waitlisted", flat=True).first())
        if queued:
            _lock_event(event)
        # `of=("self",)`: lock the pass row only. `registration__student` is a
        # nullable FK, so the select_related is a LEFT JOIN, and PostgreSQL
        # refuses "FOR UPDATE" on the nullable side of an outer join. SQLite
        # ignores the whole clause, so only Postgres proves this.
        event_pass = (EventPass.objects.select_for_update(of=("self",))
                      .filter(pk=payload.subject, registration__event=event)
                      .select_related("registration__student").first())
        if event_pass is None:
            return record(Outcome(ScanResult.UNKNOWN_CODE, verdict="Code not recognised"))
        registration = event_pass.registration
        if event_pass.revoked_at is not None:
            return record(Outcome(
                ScanResult.UNKNOWN_CODE, verdict="Pass was replaced",
                student=registration.student,
                detail="A newer pass was issued. Ask them to open the current one.",
            ))
        if event_pass.used_at is not None or registration.attended:
            return record(_duplicate(registration))
        if registration.cancelled_at is not None:
            return record(Outcome(
                ScanResult.CANCELLED, verdict="Registration cancelled",
                student=registration.student,
                detail="Scan their profile QR to admit them as a walk-in.",
            ))
        if registration.waitlisted:
            # The row holds no place. The pass does not change that: admit only
            # if a place is free now, exactly as for a profile QR.
            if not queued:
                _lock_event(event)   # promoted-then-requeued is impossible, but cheap
            registration = Registration.objects.select_for_update().get(pk=registration.pk)
            return record(_admit_or_refuse(
                event, registration.student, registration, at, operator, station_id,
                source=Registration.Source.SPOT, event_pass=event_pass))
        event_pass.used_at = at
        event_pass.save(update_fields=["used_at", "updated_at"])
        _mark_attended(registration, at, operator, station_id)
        return record(Outcome(ScanResult.ACCEPTED, verdict="Checked in",
                              registration=registration, student=registration.student))

    # --- branches 3 to 5: persistent profile QR --------------------------
    try:
        payload = qr.verify(token, expect_purpose=qr.PURPOSE_PROFILE)
    except qr.TokenError:
        return record(Outcome(ScanResult.UNKNOWN_CODE, verdict="Code not recognised"))

    # Looked up by the PRESENTED token, not by the subject's student id.
    #
    # Filtering on student_id + revoked_at IS NULL finds whichever record is
    # currently live, so a REVOKED code still resolved and was admitted: a lost
    # phone's profile QR kept working for ever after the student reissued it.
    # The token string is the thing presented, so the token string is what is
    # looked up.
    qr_record = (StudentQRToken.objects
                 .filter(token=str(token).strip())
                 .select_related("student").first())
    if qr_record is None:
        return record(Outcome(ScanResult.UNKNOWN_CODE, verdict="Code not recognised"))
    if qr_record.revoked_at is not None:
        return record(Outcome(
            ScanResult.UNKNOWN_CODE, verdict="Code was replaced",
            student=qr_record.student,
            detail="This profile QR was reissued. Ask them to open the current one.",
        ))
    student = qr_record.student

    # Unlocked peek first: a confirmed registration needs only its own row lock,
    # and the common case must not serialise every scan on the event row.
    registration = _active_registration(event, student)
    if registration is not None and not registration.waitlisted:
        registration = Registration.objects.select_for_update().get(pk=registration.pk)
        if registration.attended:
            return record(_duplicate(registration))
        _mark_attended(registration, at, operator, station_id)
        return record(Outcome(ScanResult.ACCEPTED, verdict="Checked in",
                              registration=registration, student=student))

    # Walk-in, or a waitlisted student who holds no place yet. Registering at
    # the door is the intended path, not an exception — but it reads capacity,
    # so it runs under the event lock, taken before the row lock (the order
    # register, cancel and promote all use).
    _lock_event(event)
    registration = _active_registration(event, student, lock=True)
    if registration is not None and not registration.waitlisted:
        # Promoted while we waited for the lock.
        _mark_attended(registration, at, operator, station_id)
        return record(Outcome(ScanResult.ACCEPTED, verdict="Checked in",
                              registration=registration, student=student))
    return record(_admit_or_refuse(event, student, registration, at, operator, station_id,
                                   source=Registration.Source.SPOT))


@transaction.atomic
def check_in_manually(event, student, *, operator, station_id=""):
    """
    Desk fallback: PRN lookup when a phone is flat or a code will not scan.

    Still the organiser acting, still recorded with an operator, and still a
    ScanRecord — a manual entry that left no trace would be indistinguishable from
    a scan that never happened, and the capture rate would quietly overstate how
    well the door worked.
    """
    at = timezone.now()
    registration = _active_registration(event, student)
    if registration is not None and not registration.waitlisted:
        registration = Registration.objects.select_for_update().get(pk=registration.pk)
    if registration is not None and not registration.waitlisted and registration.attended:
        outcome = _duplicate(registration)
    elif registration is not None and not registration.waitlisted:
        _mark_attended(registration, at, operator, station_id)
        outcome = Outcome(ScanResult.ACCEPTED, verdict="Checked in", registration=registration,
                          student=student, detail="Manual entry by PRN lookup")
    else:
        # Capacity is read, so: event lock first, then the queue row.
        _lock_event(event)
        registration = _active_registration(event, student, lock=True)
        if registration is not None and not registration.waitlisted:
            _mark_attended(registration, at, operator, station_id)
            outcome = Outcome(ScanResult.ACCEPTED, verdict="Checked in",
                              registration=registration, student=student,
                              detail="Manual entry by PRN lookup")
        else:
            outcome = _admit_or_refuse(event, student, registration, at, operator, station_id,
                                       source=Registration.Source.MANUAL,
                                       walkin_detail="Manual entry by PRN lookup",
                                       via=" by PRN lookup")
    ScanRecord.objects.create(
        event=event, registration=outcome.registration, result=outcome.result,
        scanned_token=f"manual:{student.prn}"[:64], station_id=station_id, operator=operator,
        scanned_at=at, synced_at=at, detail=outcome.detail[:200],
    )
    return outcome


def replay_offline(event, items, *, operator, station_id=""):
    """
    Replay a station's offline queue.

    Sorted by the device's own timestamp so the conflict rule holds: earliest
    `scanned_at` wins and the later presentation becomes the duplicate. Replaying
    in arrival order instead would award the check-in to whichever packet happened
    to reach the server first, which is not who arrived first at the door.
    """
    ordered = sorted(items, key=lambda i: i.get("scanned_at") or "")
    return [
        resolve(item.get("token"), event, operator=operator, station_id=station_id,
                scanned_at=item.get("scanned_at"), offline_ref=item.get("ref", ""))
        for item in ordered
    ]


def capture_stats(event):
    """
    Capture rate: accepted scans over all attempts.

    This is the number the failure records exist for. A station at 55% is
    rejecting half its queue, and without the failures that looks like a quiet event.
    """
    from django.db.models import Count, Q

    agg = event.scan_records.aggregate(
        attempts=Count("id"),
        accepted=Count("id", filter=Q(result__in=ACCEPTING)),
        duplicates=Count("id", filter=Q(result=ScanResult.DUPLICATE)),
        unknown=Count("id", filter=Q(result=ScanResult.UNKNOWN_CODE)),
        wrong_event=Count("id", filter=Q(result=ScanResult.WRONG_EVENT)),
        expired=Count("id", filter=Q(result=ScanResult.EXPIRED)),
    )
    attempts = agg["attempts"] or 0
    agg["capture_rate"] = round(agg["accepted"] / attempts, 3) if attempts else None
    return agg
