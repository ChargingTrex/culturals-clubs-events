from django.conf import settings
from django.db import models

from common.models import UUIDModel


class Venue(UUIDModel):
    name = models.CharField(max_length=120, unique=True)
    capacity = models.PositiveIntegerField()
    location = models.CharField(max_length=160, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class EventStatus(models.TextChoices):
    """
    The lifecycle. `returned` is distinct from `rejected` on purpose: returned
    means the club can revise and resubmit, rejected means it cannot.
    """

    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Awaiting approval"
    RETURNED = "returned", "Returned for changes"
    REJECTED = "rejected", "Rejected"
    APPROVED = "approved", "Approved"
    PUBLISHED = "published", "Published"
    LIVE = "live", "Live now"
    COMPLETED = "completed", "Completed"
    REPORTED = "reported", "Reported"
    CANCELLED = "cancelled", "Cancelled"


# Statuses that hold a venue slot. A draft or a rejected event holds nothing.
SLOT_HOLDING = (
    EventStatus.SUBMITTED, EventStatus.APPROVED, EventStatus.PUBLISHED,
    EventStatus.LIVE, EventStatus.COMPLETED, EventStatus.REPORTED,
)
# Statuses where the booking is settled, so a new request must not overlap it.
SLOT_CONFIRMED = (
    EventStatus.APPROVED, EventStatus.PUBLISHED, EventStatus.LIVE,
    EventStatus.COMPLETED, EventStatus.REPORTED,
)
# Statuses that count towards the semester report (AGENT_PROMPT §5).
REPORTABLE = (EventStatus.COMPLETED, EventStatus.REPORTED)


class Event(UUIDModel):
    class Kind(models.TextChoices):
        PERFORMANCE = "performance", "Performance"
        WORKSHOP = "workshop", "Workshop"
        COMPETITION = "competition", "Competition"
        EXHIBITION = "exhibition", "Exhibition"
        TALK = "talk", "Talk"

    title = models.CharField(max_length=200)
    club = models.ForeignKey("clubs.Club", on_delete=models.PROTECT, related_name="events")
    fest = models.ForeignKey("events.Fest", on_delete=models.SET_NULL, null=True, blank=True,
                             related_name="events")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.PERFORMANCE)
    description = models.TextField(blank=True)

    venue = models.ForeignKey(Venue, on_delete=models.PROTECT, related_name="events")
    starts_at = models.DateTimeField()      # UTC storage, IST display
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField()
    expected_attendance = models.PositiveIntegerField()

    status = models.CharField(max_length=16, choices=EventStatus.choices,
                             default=EventStatus.DRAFT)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_reason = models.CharField(max_length=280, blank=True)

    # Evidence, captured at close. Link capture only — no social API calls.
    photo_count = models.PositiveIntegerField(default=0)
    social_links = models.JSONField(default=list, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    submitted_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                   null=True, blank=True, related_name="events_created")

    class Meta:
        ordering = ("starts_at",)
        indexes = [
            models.Index(fields=["status", "starts_at"]),
            models.Index(fields=["club", "starts_at"]),
            models.Index(fields=["venue", "starts_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="event_ends_after_start",
            ),
            # A cancelled event without a reason is a mystery three months later,
            # so the database refuses one rather than trusting the form.
            models.CheckConstraint(
                condition=~models.Q(status="cancelled") | ~models.Q(cancelled_reason=""),
                name="event_cancelled_needs_reason",
            ),
        ]

    def __str__(self):
        return self.title

    @property
    def is_reportable(self):
        return self.status in REPORTABLE

    def attended_count(self):
        return self.registrations.filter(attended=True, cancelled_at__isnull=True).count()

    def registered_count(self):
        return self.registrations.filter(cancelled_at__isnull=True).count()


class Fest(UUIDModel):
    """
    A fest is a multi-event umbrella. AGENT_PROMPT §2: fests always take two
    gates regardless of amount, so the flag lives on the event's fest link rather
    than being inferred from the budget total.
    """

    name = models.CharField(max_length=160, unique=True)
    club = models.ForeignKey("clubs.Club", on_delete=models.PROTECT, related_name="fests")
    starts_on = models.DateField()
    ends_on = models.DateField()
    status = models.CharField(max_length=16, choices=EventStatus.choices,
                             default=EventStatus.DRAFT)

    class Meta:
        ordering = ("-starts_on",)

    def __str__(self):
        return self.name


class VenueReassignment(UUIDModel):
    """
    A move, recorded with its reason because the club is told why.

    AGENT_PROMPT §5: the move itself must be atomic — release the old booking and
    take the new one in one transaction, or there is a window where the slot is
    held by both events or by neither. See events/services.py:reassign_venue.
    """

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="reassignments")
    from_venue = models.ForeignKey(Venue, on_delete=models.PROTECT, related_name="moves_out")
    to_venue = models.ForeignKey(Venue, on_delete=models.PROTECT, related_name="moves_in")
    reason = models.CharField(max_length=280)
    actor_sub = models.UUIDField()
    actor_label = models.CharField(max_length=80)

    class Meta:
        ordering = ("-created_at",)
