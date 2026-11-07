from django.conf import settings
from django.db import models
from django.utils import timezone

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

    # Evidence lives in EventPhoto / EventSocialPost / EventReport (PRD §5.10,
    # §5.14, §5.12.3); `photo_count` and `social_links` below are read from them.
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

    @property
    def photo_count(self):
        return sum(1 for p in self.photos.all() if p.removed_at is None)

    @property
    def social_links(self):
        return [p.url for p in self.social_posts.all()]

    def registered_count(self):
        # Waitlisted rows are queue entries, not places (PRD §5.6, B-01).
        return self.registrations.filter(cancelled_at__isnull=True, waitlisted=False).count()


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


class EventOrganiser(UUIDModel):
    """
    Who holds the `event_organiser:<event_id>` scope for one event.

    AGENT_PROMPT §6 describes the organiser as a time-bound role: it is granted
    for the run-up to one event and expires with it. The row is the grant;
    identity/tokens.roles_for reads the active rows so the scope reaches the
    token in local mode (the platform issues it directly in platform mode).
    `ends_at` null means "until the row is removed"; the event's own end plus
    the scan-station grace is the natural value for a time-boxed grant.
    """

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="organisers")
    student = models.ForeignKey("identity.Student", on_delete=models.PROTECT,
                                related_name="organiser_roles")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name="organisers_assigned")
    ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["event", "student"],
                condition=models.Q(ends_at__isnull=True),
                name="one_open_organiser_grant_per_student_per_event",
            ),
        ]
        indexes = [models.Index(fields=["student", "ends_at"])]

    def __str__(self):
        return f"{self.student_id} organises {self.event_id}"

    @classmethod
    def active(cls, now=None):
        now = now or timezone.now()
        return cls.objects.filter(models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=now))

    @classmethod
    def active_event_ids(cls, student, now=None):
        """Event ids this student currently organises — the token's scopes."""
        return list(cls.active(now).filter(student=student).values_list("event_id", flat=True))


class EventPhoto(UUIDModel):
    """
    One photo in an event's gallery (PRD §5.10). The raw material of the
    semester report, so it is a row with a file key, never the bytes
    (AGENT_PROMPT §2) — same shape as budget.ReceiptDocument.

    Removal is soft: `removed_at` hides the photo everywhere (gallery, report,
    file route) while the row records that it existed and was taken down.
    shortcut: the bytes stay in the store because FileStore has no delete;
    add one when a consent removal must erase the file itself.
    """

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="photos")
    file_key = models.CharField(max_length=400)
    file_name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=80)
    byte_size = models.PositiveIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    caption = models.CharField(max_length=300, blank=True)
    # Marked by the organiser for the semester report's highlights and gallery.
    is_highlight = models.BooleanField(default=False)
    uploaded_by_sub = models.UUIDField(null=True, blank=True)
    # PRD §5.10 consent: a student pictured can ask for a specific image to go.
    removal_requested_by_sub = models.UUIDField(null=True, blank=True)
    removal_requested_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)
        indexes = [models.Index(fields=["event", "removed_at"])]

    def __str__(self):
        return self.file_name


class EventSocialPost(UUIDModel):
    """
    A link to a post promoting the event (PRD §5.14). Link capture only: the URL
    is stored, never fetched, and no platform API is called. `created_at` is the
    capture date, which matters because links decay.
    """

    class Platform(models.TextChoices):
        INSTAGRAM = "instagram", "Instagram"
        LINKEDIN = "linkedin", "LinkedIn"
        OTHER = "other", "Other"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="social_posts")
    platform = models.CharField(max_length=16, choices=Platform.choices)
    url = models.URLField(max_length=500)
    # Optional, since posts get deleted or archived (PRD §5.14.1).
    screenshot_key = models.CharField(max_length=400, blank=True)
    screenshot_content_type = models.CharField(max_length=80, blank=True)
    added_by_sub = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(fields=["event", "url"], name="one_row_per_event_post_url"),
        ]

    def __str__(self):
        return self.url


class EventReport(UUIDModel):
    """
    The organiser's words about an event (PRD §5.12.3, DB §3.15). The numbers —
    attendance, registrations, money — are never typed in; they are read from
    the records when the report is shown.
    """

    event = models.OneToOneField(Event, on_delete=models.CASCADE, related_name="report")
    outcomes = models.TextField()
    # What worked, what to change: carried forward when the event is cloned (D-03).
    learnings = models.TextField(blank=True)
    submitted_by_sub = models.UUIDField(null=True, blank=True)
    submitted_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"report on {self.event_id}"
