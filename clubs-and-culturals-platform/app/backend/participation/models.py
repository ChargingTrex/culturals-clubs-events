"""
Registrations, passes and the scan log.

Reconciled from two parallel drafts; see RECONCILIATION.md for the full table.
What matters here is that the rules the scan path relies on are database
constraints and not application checks: two stations scanning the same student at
the same moment must produce one check-in and one honest "already checked in",
and only the database can promise that under concurrency (AGENT_PROMPT §4, rule 3).
"""
from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import UUIDModel


class Registration(UUIDModel):
    """
    The most important table in the system (AGENT_PROMPT §4): every reported
    figure derives from it.

    `attended` is counted, `registered` never is. Registered-but-absent rows stay
    — the no-show rate is useful — but they are not participation (rule 6).

    Never deleted. A student who cancels gets `cancelled_at` set: once the event
    is reported the row is part of a semester's figures, and removing it would
    silently rewrite a report that has already been read
    (Identity_Login_Shared_Data §3.5).
    """

    class Source(models.TextChoices):
        PRE_REGISTERED = "pre_registered", "Registered in advance"
        SPOT = "spot", "Walk-in, registered at the door"
        MANUAL = "manual", "Entered by an organiser at the desk"
        IMPORTED = "imported", "Imported from a prior record"

    event = models.ForeignKey("events.Event", on_delete=models.PROTECT,
                              related_name="registrations")
    # Exactly one of these two is set. Own students and external participants are
    # counted separately and never summed (rule 7).
    student = models.ForeignKey("identity.Student", on_delete=models.PROTECT, null=True,
                               blank=True, related_name="registrations")
    external = models.ForeignKey("participation.ExternalParticipant", on_delete=models.CASCADE,
                                 null=True, blank=True, related_name="registrations")

    source = models.CharField(max_length=16, choices=Source.choices,
                              default=Source.PRE_REGISTERED)
    registered_at = models.DateTimeField(default=timezone.now)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    # PRD 5.6: joined when the event was full. A waitlisted row holds no place
    # and no pass; it is promoted FIFO by `created_at` when a place frees up.
    # It still counts under the partial unique index above, so a student cannot
    # be both waitlisted and registered for the same event.
    waitlisted = models.BooleanField(default=False)

    attended = models.BooleanField(default=False)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name="check_ins")
    station_id = models.CharField(max_length=40, blank=True)

    # Grouping snapshotted at event time, never joined at report time: a student
    # moving into third year would otherwise rewrite last semester's breakdown.
    department_at_event = models.CharField(max_length=16, blank=True)
    programme_at_event = models.CharField(max_length=32, blank=True)
    year_at_event = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ("-registered_at",)
        indexes = [
            models.Index(fields=["event", "attended"]),
            models.Index(fields=["student", "cancelled_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(student__isnull=False, external__isnull=True)
                    | models.Q(student__isnull=True, external__isnull=False)
                ),
                name="registration_exactly_one_participant",
            ),
            # The rule the whole double-scan defence rests on. An application
            # check loses the race; this one makes the second write fail, and
            # that failure is the correct answer for the operator to see.
            models.UniqueConstraint(
                fields=["event", "student"],
                condition=models.Q(cancelled_at__isnull=True, student__isnull=False),
                name="one_active_registration_per_event_per_student",
            ),
            models.CheckConstraint(
                condition=models.Q(attended=False) | models.Q(checked_in_at__isnull=False),
                name="attended_requires_check_in_time",
            ),
        ]

    def __str__(self):
        return f"{self.participant_label} @ {self.event_id}"

    @property
    def participant_label(self):
        if self.student_id:
            return f"{self.student.prn} {self.student.full_name}"
        return self.external.full_name if self.external_id else "unknown"

    def snapshot_from(self, student):
        self.department_at_event = student.department
        self.programme_at_event = student.programme
        self.year_at_event = student.year_of_study


class ExternalParticipant(UUIDModel):
    """
    Someone from outside the institution, at a fest.

    Genuinely purged rather than soft-deleted (AGENT_PROMPT §4): this is personal
    data about a non-member with no institutional relationship, and there is no
    reason to keep it past the retention period. `purge_after` records when.
    The retention period itself is an open question (§9), so it is a nullable date
    set by policy rather than a constant compiled in here.
    """

    full_name = models.CharField(max_length=160)
    institution = models.CharField(max_length=160, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    purge_after = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ("full_name",)

    def __str__(self):
        return self.full_name


class StudentQRToken(UUIDModel):
    """
    The persistent profile QR (AGENT_PROMPT §2).

    One live token per student. The code holds a signed reference, never the PRN —
    a photograph of someone's profile QR reveals nothing about them. Versioned so
    a lost phone can be reissued without invalidating anything already recorded,
    and `key_id` records which signing key minted it.
    """

    student = models.ForeignKey("identity.Student", on_delete=models.CASCADE,
                               related_name="qr_tokens")
    token = models.CharField(max_length=512, unique=True)
    version = models.PositiveIntegerField(default=1)
    key_id = models.CharField(max_length=16, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(revoked_at__isnull=True),
                name="one_live_profile_qr_per_student",
            )
        ]

    def __str__(self):
        return f"profile QR v{self.version} for {self.student_id}"


class EventPass(UUIDModel):
    """
    A one-time pass for one registration.

    `used_at` is the spendable thing, which is why the signed token names this row
    and not the registration — the kit's original shipped with those two
    disagreeing, so no pass it minted could ever be redeemed (see qrkit/tokens.py).

    A ForeignKey rather than a OneToOne, with a partial unique on the live pass:
    reissuing to a student who lost the email revokes the previous one, so a
    forwarded screenshot stops working while the history of what was issued stays.
    """

    registration = models.ForeignKey(Registration, on_delete=models.CASCADE,
                                     related_name="passes")
    token = models.CharField(max_length=512, unique=True)
    used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    # Which signing key minted it. After a rotation this is the only way to tell
    # which passes in circulation depend on a key you are thinking of removing.
    key_id = models.CharField(max_length=16, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["registration", "used_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["registration"],
                condition=models.Q(used_at__isnull=True, revoked_at__isnull=True),
                name="one_live_pass_per_registration",
            )
        ]

    def __str__(self):
        return f"pass {self.id} for {self.registration_id}"

    @property
    def is_spent(self):
        return self.used_at is not None or self.revoked_at is not None


class ScanResult(models.TextChoices):
    """
    The branches of check-in resolution (AGENT_PROMPT §5).

    Module-level rather than nested in ScanRecord, because reporting and the
    services layer both branch on it and a nested enum reads as if it were the
    scan log's private business when it is the module's shared vocabulary.
    """

    ACCEPTED = "accepted", "Checked in"
    SPOT_REGISTERED = "spot_registered", "Registered at the door and checked in"
    DUPLICATE = "duplicate", "Already checked in"
    WRONG_EVENT = "wrong_event", "Pass is for another event"
    UNKNOWN_CODE = "unknown_code", "Code not recognised"
    NOT_REGISTERED = "not_registered", "Not registered and cannot be"
    EXPIRED = "expired", "Pass expired"
    CANCELLED = "cancelled", "Registration was cancelled"


# Results that count as a successful check-in. Everything else is a rejection,
# and the ratio of these to all attempts is the capture-rate metric.
ACCEPTING = (ScanResult.ACCEPTED, ScanResult.SPOT_REGISTERED)


class ScanRecord(UUIDModel):
    """
    Every scan attempt, including the ones that failed.

    AGENT_PROMPT §5: the failures are the capture-rate metric. Without them a
    station rejecting half its queue is indistinguishable from a quiet event.
    """

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE,
                              related_name="scan_records")
    registration = models.ForeignKey(Registration, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name="scans")
    # A prefix only: enough to correlate two records of the same code, too little
    # to replay one. The signature is the tail, and it is not stored.
    scanned_token = models.CharField(max_length=64, blank=True)
    result = models.CharField(max_length=20, choices=ScanResult.choices)
    station_id = models.CharField(max_length=40, blank=True)
    operator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="scans_taken")
    scanned_at = models.DateTimeField()   # the device's clock, offline included
    synced_at = models.DateTimeField(default=timezone.now)  # when the server heard
    # Idempotency key for offline replay: the station's own reference for a queued
    # scan. Replaying a queue twice — which happens when a sync response is lost —
    # must not record the same scan twice.
    offline_ref = models.CharField(max_length=64, blank=True)
    detail = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ("-scanned_at",)
        indexes = [
            models.Index(fields=["event", "result"]),
            models.Index(fields=["event", "station_id"]),
            models.Index(fields=["event", "scanned_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["event", "offline_ref"],
                condition=~models.Q(offline_ref=""),
                name="one_record_per_offline_ref",
            )
        ]

    def __str__(self):
        return f"{self.result} at {self.station_id or 'unknown station'}"

    @property
    def was_offline(self):
        """A scan taken while the station had no signal, replayed later."""
        return (self.synced_at - self.scanned_at).total_seconds() > 60
