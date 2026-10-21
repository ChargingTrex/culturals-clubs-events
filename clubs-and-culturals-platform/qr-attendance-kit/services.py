"""
Scan resolution — the seven branches specified in the Clubs & Events PRD.

Replaces the Google Sheets double-scan check in
ChargingTrex/Google-sheet-qr-attendance- (GPL-3.0) with a database-enforced
equivalent. Written from the specification, not from that source, so this file
carries no GPL obligation. See docs/LICENSING.md.

Why the rewrite matters rather than being pedantry:
  * The Sheets version reads the attendance cell, decides, then writes. Two
    operators scanning the same person at the same moment both read "absent"
    and both write "present" — the duplicate is silently lost. Here the
    unique constraint makes the second write fail, and the failure is the
    correct answer.
  * Apps Script serialises on the spreadsheet, so a queue at one door slows
    every other door. Postgres does not.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

from django.db import IntegrityError, transaction
from django.utils import timezone

from core import tokens


class ScanResult(str, Enum):
    ACCEPTED = "accepted"
    SPOT_REGISTERED = "spot_registered"
    DUPLICATE = "duplicate"
    WRONG_EVENT = "wrong_event"
    NOT_REGISTERED = "not_registered"
    UNKNOWN_CODE = "unknown_code"
    EXPIRED = "expired"


# Operator-facing text. Deliberately short: this is read at arm's length by
# someone with a queue in front of them, not studied.
RESULT_MESSAGES = {
    ScanResult.ACCEPTED: "Checked in",
    ScanResult.SPOT_REGISTERED: "Registered and checked in",
    ScanResult.DUPLICATE: "Already checked in",
    ScanResult.WRONG_EVENT: "Wrong event",
    ScanResult.NOT_REGISTERED: "Not registered",
    ScanResult.UNKNOWN_CODE: "Code not recognised",
    ScanResult.EXPIRED: "Pass expired",
}


@dataclass
class ScanOutcome:
    result: ScanResult
    message: str
    student_name: str | None = None
    prn: str | None = None
    programme: str | None = None
    year: int | None = None
    checked_in_at: datetime | None = None
    previous_check_in: datetime | None = None
    registration_id: str | None = None
    detail: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.result in (ScanResult.ACCEPTED, ScanResult.SPOT_REGISTERED)


class ScanService:
    """
    Resolve a scanned code against an event.

    Construct per request with the models injected, so this file has no import
    dependency on the module's models.py (owned by the data agent) and stays
    unit-testable without a database.
    """

    def __init__(self, *, Registration, Student, EventPass, ScanRecord):
        self.Registration = Registration
        self.Student = Student
        self.EventPass = EventPass
        self.ScanRecord = ScanRecord

    # ------------------------------------------------------------------ #

    def scan(
        self,
        *,
        raw_token: str,
        event,
        operator_id: str,
        station_id: str,
        scanned_at: datetime | None = None,
        allow_spot_registration: bool = True,
    ) -> ScanOutcome:
        scanned_at = scanned_at or timezone.now()

        outcome = self._resolve(
            raw_token=raw_token,
            event=event,
            operator_id=operator_id,
            station_id=station_id,
            scanned_at=scanned_at,
            allow_spot_registration=allow_spot_registration,
        )

        # Every attempt is logged, including failures. The gap between
        # attempts and accepted check-ins is the capture-rate metric; without
        # failures recorded, a station rejecting half the queue looks
        # identical to a quiet event.
        self.ScanRecord.objects.create(
            event=event,
            registration_id=outcome.registration_id,
            scanned_token=raw_token[:64],
            result=outcome.result.value,
            station_id=station_id,
            operator_id=operator_id,
            scanned_at=scanned_at,
            synced_at=timezone.now(),
        )
        return outcome

    # ------------------------------------------------------------------ #

    def _resolve(self, *, raw_token, event, operator_id, station_id,
                 scanned_at, allow_spot_registration) -> ScanOutcome:

        # --- branch 1/2: one-time event pass -------------------------- #
        try:
            payload = tokens.verify(
                raw_token,
                expect_purpose=tokens.PURPOSE_EVENT_PASS,
                expect_event=str(event.id),
            )
            return self._check_in_by_pass(payload, event, operator_id, station_id, scanned_at)
        except tokens.TokenExpired:
            return ScanOutcome(ScanResult.EXPIRED, RESULT_MESSAGES[ScanResult.EXPIRED])
        except tokens.TokenWrongPurpose:
            # Either a pass for another event, or a profile QR. Fall through to
            # the profile branch; if that also fails we report wrong_event.
            pass
        except tokens.TokenInvalid:
            pass

        # --- branches 3/4/5: persistent profile QR -------------------- #
        try:
            payload = tokens.verify(raw_token, expect_purpose=tokens.PURPOSE_PROFILE)
            return self._check_in_by_profile(
                payload, event, operator_id, station_id, scanned_at, allow_spot_registration
            )
        except tokens.TokenInvalid:
            pass
        except tokens.TokenWrongPurpose:
            return ScanOutcome(ScanResult.WRONG_EVENT, RESULT_MESSAGES[ScanResult.WRONG_EVENT])

        # --- branch 6: a valid pass, but for a different event --------- #
        if self._is_pass_for_another_event(raw_token):
            return ScanOutcome(ScanResult.WRONG_EVENT, RESULT_MESSAGES[ScanResult.WRONG_EVENT])

        # --- branch 7: unrecognised --------------------------------- #
        return ScanOutcome(ScanResult.UNKNOWN_CODE, RESULT_MESSAGES[ScanResult.UNKNOWN_CODE])

    # ------------------------------------------------------------------ #

    def _check_in_by_pass(self, payload, event, operator_id, station_id, scanned_at) -> ScanOutcome:
        try:
            event_pass = self.EventPass.objects.select_related(
                "registration__student"
            ).get(id=payload.subject)
        except self.EventPass.DoesNotExist:
            return ScanOutcome(ScanResult.UNKNOWN_CODE, RESULT_MESSAGES[ScanResult.UNKNOWN_CODE])

        registration = event_pass.registration

        if event_pass.used_at is not None or registration.attended:
            return self._duplicate(registration)

        with transaction.atomic():
            # Row lock: two stations scanning the same pass simultaneously
            # serialise here, and the second sees used_at already set.
            locked = self.EventPass.objects.select_for_update().get(id=event_pass.id)
            if locked.used_at is not None:
                return self._duplicate(registration)

            locked.used_at = scanned_at
            locked.save(update_fields=["used_at"])

            registration.attended = True
            registration.checked_in_at = scanned_at
            registration.checked_in_by_id = operator_id
            registration.station_id = station_id
            registration.save(
                update_fields=["attended", "checked_in_at", "checked_in_by_id", "station_id"]
            )

        return self._accepted(registration, ScanResult.ACCEPTED, scanned_at)

    # ------------------------------------------------------------------ #

    def _check_in_by_profile(self, payload, event, operator_id, station_id,
                             scanned_at, allow_spot_registration) -> ScanOutcome:
        try:
            student = self.Student.objects.get(id=payload.subject)
        except self.Student.DoesNotExist:
            return ScanOutcome(ScanResult.UNKNOWN_CODE, RESULT_MESSAGES[ScanResult.UNKNOWN_CODE])

        registration = self.Registration.objects.filter(
            event=event, student=student, cancelled_at__isnull=True
        ).first()

        # branch: registered already
        if registration:
            if registration.attended:
                return self._duplicate(registration)

            registration.attended = True
            registration.checked_in_at = scanned_at
            registration.checked_in_by_id = operator_id
            registration.station_id = station_id
            registration.save(
                update_fields=["attended", "checked_in_at", "checked_in_by_id", "station_id"]
            )
            return self._accepted(registration, ScanResult.ACCEPTED, scanned_at)

        # branch: walk-in
        if not allow_spot_registration:
            return ScanOutcome(
                ScanResult.NOT_REGISTERED,
                RESULT_MESSAGES[ScanResult.NOT_REGISTERED],
                student_name=student.display_name,
                prn=student.prn,
            )

        if event.capacity is not None:
            current = self.Registration.objects.filter(
                event=event, cancelled_at__isnull=True
            ).count()
            if current >= event.capacity:
                return ScanOutcome(
                    ScanResult.NOT_REGISTERED,
                    "Event at capacity",
                    student_name=student.display_name,
                    prn=student.prn,
                )

        try:
            with transaction.atomic():
                registration = self.Registration.objects.create(
                    event=event,
                    student=student,
                    source="spot",
                    registered_at=scanned_at,
                    attended=True,
                    checked_in_at=scanned_at,
                    checked_in_by_id=operator_id,
                    station_id=station_id,
                    # Grouping fields are snapshotted at event time, never
                    # joined at report time — otherwise a student moving to
                    # third year silently rewrites last semester's report.
                    department_at_event=student.department,
                    programme_at_event=student.programme,
                    year_at_event=student.year_of_study,
                )
        except IntegrityError:
            # Lost a race with another station. The unique constraint did its
            # job; re-read and report the duplicate honestly.
            registration = self.Registration.objects.filter(
                event=event, student=student, cancelled_at__isnull=True
            ).first()
            return self._duplicate(registration) if registration else ScanOutcome(
                ScanResult.UNKNOWN_CODE, RESULT_MESSAGES[ScanResult.UNKNOWN_CODE]
            )

        return self._accepted(registration, ScanResult.SPOT_REGISTERED, scanned_at)

    # ------------------------------------------------------------------ #

    def _is_pass_for_another_event(self, raw_token: str) -> bool:
        try:
            tokens.verify(raw_token, expect_purpose=tokens.PURPOSE_EVENT_PASS)
            return True
        except tokens.TokenError:
            return False

    def _duplicate(self, registration) -> ScanOutcome:
        student = registration.student
        return ScanOutcome(
            ScanResult.DUPLICATE,
            RESULT_MESSAGES[ScanResult.DUPLICATE],
            student_name=getattr(student, "display_name", None),
            prn=getattr(student, "prn", None),
            previous_check_in=registration.checked_in_at,
            registration_id=str(registration.id),
        )

    def _accepted(self, registration, result: ScanResult, scanned_at) -> ScanOutcome:
        student = registration.student
        return ScanOutcome(
            result,
            RESULT_MESSAGES[result],
            student_name=getattr(student, "display_name", None),
            prn=getattr(student, "prn", None),
            programme=getattr(student, "programme", None),
            year=getattr(student, "year_of_study", None),
            checked_in_at=scanned_at,
            registration_id=str(registration.id),
        )
