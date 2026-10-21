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
from participation.models import (
    ACCEPTING, EventPass, Registration, ScanRecord, ScanResult, StudentQRToken,
)
from qrkit import tokens as qr


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
    """Revoke the live pass and mint another, so a forwarded copy stops working."""
    EventPass.objects.filter(
        registration=registration, used_at__isnull=True, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    return issue_pass(registration)


def live_pass(registration):
    return registration.passes.filter(used_at__isnull=True, revoked_at__isnull=True).first()


@transaction.atomic
def register_student(event, student, *, source=Registration.Source.PRE_REGISTERED):
    """
    Create a registration and its one-time pass.

    Capacity is checked under a row lock on the event. Checking it without one
    lets two simultaneous registrations both read "one place left" and both take it.
    """
    from events.models import Event

    locked = Event.objects.select_for_update().get(pk=event.pk)
    if locked.status not in (EventStatus.PUBLISHED, EventStatus.LIVE):
        raise Conflict(code="PARTICIPATION_NOT_OPEN", title="Registration is not open",
                       detail=f"“{locked.title}” is {locked.get_status_display().lower()}.")
    if locked.registered_count() >= locked.capacity:
        raise Conflict(code="PARTICIPATION_EVENT_FULL", title="Event is full",
                       detail=f"All {locked.capacity} places are taken.")
    registration = Registration(event=locked, student=student, source=source)
    registration.snapshot_from(student)
    try:
        registration.save()
    except IntegrityError as exc:
        # The partial unique constraint fired. That is the correct answer, not a
        # bug to work around.
        raise Conflict(code="PARTICIPATION_ALREADY_REGISTERED", title="Already registered",
                       detail="You already hold a registration for this event.") from exc
    issue_pass(registration)
    return registration


def cancel_registration(registration):
    """
    Cancel, never delete. An attended registration cannot be cancelled: it is a
    record of something that happened.
    """
    if registration.attended:
        raise Conflict(code="PARTICIPATION_ALREADY_ATTENDED", title="Already checked in",
                       detail="An attended registration cannot be cancelled.")
    registration.cancelled_at = timezone.now()
    registration.save(update_fields=["cancelled_at", "updated_at"])
    EventPass.objects.filter(registration=registration, used_at__isnull=True,
                             revoked_at__isnull=True).update(revoked_at=timezone.now())
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
        event_pass = (EventPass.objects.select_for_update()
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

    registration = (Registration.objects.select_for_update()
                    .filter(event=event, student=student, cancelled_at__isnull=True).first())
    if registration is not None:
        if registration.attended:
            return record(_duplicate(registration))
        _mark_attended(registration, at, operator, station_id)
        return record(Outcome(ScanResult.ACCEPTED, verdict="Checked in",
                              registration=registration, student=student))

    # Walk-in. Registering at the door is the intended path, not an exception.
    if event.registered_count() >= event.capacity:
        return record(Outcome(ScanResult.NOT_REGISTERED, verdict="Event at capacity",
                              student=student,
                              detail="No places left, so a walk-in cannot be admitted."))
    registration = Registration(event=event, student=student,
                                source=Registration.Source.SPOT)
    registration.snapshot_from(student)
    registration.save()
    _mark_attended(registration, at, operator, station_id)
    return record(Outcome(ScanResult.SPOT_REGISTERED, verdict="Registered and checked in",
                          registration=registration, student=student))


def check_in_manually(event, student, *, operator, station_id=""):
    """
    Desk fallback: PRN lookup when a phone is flat or a code will not scan.

    Still the organiser acting, still recorded with an operator, and still a
    ScanRecord — a manual entry that left no trace would be indistinguishable from
    a scan that never happened, and the capture rate would quietly overstate how
    well the door worked.
    """
    registration = Registration.objects.filter(
        event=event, student=student, cancelled_at__isnull=True
    ).first()
    at = timezone.now()
    if registration and registration.attended:
        outcome = _duplicate(registration)
    elif registration:
        _mark_attended(registration, at, operator, station_id)
        outcome = Outcome(ScanResult.ACCEPTED, verdict="Checked in", registration=registration,
                          student=student, detail="Manual entry by PRN lookup")
    elif event.registered_count() >= event.capacity:
        outcome = Outcome(ScanResult.NOT_REGISTERED, verdict="Event at capacity",
                          student=student)
    else:
        registration = Registration(event=event, student=student,
                                    source=Registration.Source.MANUAL)
        registration.snapshot_from(student)
        registration.save()
        _mark_attended(registration, at, operator, station_id)
        outcome = Outcome(ScanResult.SPOT_REGISTERED, verdict="Registered and checked in",
                          registration=registration, student=student,
                          detail="Manual entry by PRN lookup")
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
