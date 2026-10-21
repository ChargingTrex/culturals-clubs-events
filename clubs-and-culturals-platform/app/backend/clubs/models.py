from django.conf import settings
from django.db import models

from common import roles as R
from common.models import UUIDModel


class Club(UUIDModel):
    class Category(models.TextChoices):
        CULTURAL = "cultural", "Cultural"
        LITERARY = "literary", "Literary"
        TECHNICAL = "technical", "Technical"
        SPORTS = "sports", "Sports"
        SOCIAL = "social", "Social service"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        DORMANT = "dormant", "Dormant"
        ARCHIVED = "archived", "Archived"

    class JoinMode(models.TextChoices):
        OPEN = "open", "Open — anyone may join"
        APPROVAL = "approval", "Approval — an office bearer accepts each request"

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    tag = models.CharField(max_length=40, blank=True)   # "Music", "Dance"
    category = models.CharField(max_length=16, choices=Category.choices)
    description = models.TextField(blank=True)
    # Link capture only. AGENT_PROMPT §2: no Instagram or LinkedIn API calls, ever.
    instagram_handle = models.CharField(max_length=64, blank=True)
    # Soft delete via status (§4). Rows are never removed: a club's past events
    # and attendance are part of semesters that have already been reported.
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    # PRD §5.2: a club decides whether joining is immediate or vetted. Approval
    # is the default because a club that never chose is safer with a queue.
    join_mode = models.CharField(max_length=16, choices=JoinMode.choices,
                                 default=JoinMode.APPROVAL)
    # PRD §5.1: the dormancy job reads this. Touched on event submission,
    # publication and close, and on membership changes (clubs/services.py).
    last_activity_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name

    @property
    def under_cultural_society(self):
        """
        Which clubs the Cultural Society gate applies to.

        NOTE: this gate is a deviation from AGENT_PROMPT §2, which fixes the
        chain as Dean-only. It is enabled by the APPROVAL_CHAIN setting; see
        governance/services.py.
        """
        return self.category in (self.Category.CULTURAL, self.Category.LITERARY)


class Membership(UUIDModel):
    """
    One active membership per student per club (AGENT_PROMPT §4).

    Enforced by a partial unique constraint rather than an application check,
    because an application check loses under concurrency and a constraint does
    not (rule 3).
    """

    ROLE_CHOICES = [
        (R.CLUB_PRESIDENT, "President"),
        (R.CLUB_VICE_PRESIDENT, "Vice-President"),
        (R.CLUB_TREASURER, "Treasurer"),
        (R.CLUB_SECRETARY, "Secretary"),
        (R.CLUB_CORE, "Core team"),
        (R.CLUB_MEMBER, "Member"),
    ]

    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name="memberships")
    student = models.ForeignKey("identity.Student", on_delete=models.PROTECT,
                               related_name="memberships")
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default=R.CLUB_MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("club", "role")
        constraints = [
            models.UniqueConstraint(
                fields=["club", "student"],
                condition=models.Q(ended_at__isnull=True),
                name="one_active_membership_per_student_per_club",
            ),
            # One president per club at a time. Two presidents means two people
            # each believe they hold the role that assigns roles.
            models.UniqueConstraint(
                fields=["club"],
                condition=models.Q(role=R.CLUB_PRESIDENT, ended_at__isnull=True),
                name="one_active_president_per_club",
            ),
        ]
        indexes = [models.Index(fields=["student", "ended_at"])]

    def __str__(self):
        return f"{self.student_id} {self.role} of {self.club_id}"

    @property
    def is_active(self):
        return self.ended_at is None


class RoleChange(UUIDModel):
    """
    Who changed whose role, when, and from what.

    A role assignment is consequential — it grants budget visibility and the
    power to assign further roles — so it gets its own record, not just a line
    in the generic audit table (AGENT_PROMPT §7).
    """

    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="changes")
    actor_sub = models.UUIDField()
    actor_label = models.CharField(max_length=80)
    from_role = models.CharField(max_length=32)
    to_role = models.CharField(max_length=32)
    reason = models.CharField(max_length=280, blank=True)

    class Meta:
        ordering = ("-created_at",)


class JoinRequest(UUIDModel):
    """
    PRD §5.2: a student asks to join an approval-mode club and an office bearer
    decides. One pending request per student per club, enforced by a partial
    unique constraint so two taps on the button cannot queue twice.
    """

    class State(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"

    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name="join_requests")
    student = models.ForeignKey("identity.Student", on_delete=models.PROTECT,
                                related_name="join_requests")
    state = models.CharField(max_length=16, choices=State.choices, default=State.PENDING)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="join_decisions")
    decided_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=280, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["club", "student"],
                condition=models.Q(state="pending"),
                name="one_pending_join_request_per_student_per_club",
            ),
        ]
        indexes = [models.Index(fields=["club", "state"])]

    def __str__(self):
        return f"{self.student_id} -> {self.club_id} ({self.state})"


class OfficeBearerTerm(UUIDModel):
    """
    PRD §5.3 / §5.18: who held which office, from when until when.

    The term, not the membership row, is what the token derivation consults
    (clubs/services.active_club_roles): a President whose term ended yesterday
    gets no `club_president:<club>` scope at the next login, whatever the
    Membership row still says. `RoleChange` remains the log of who made the
    change; this is the calendar of who held the office.
    """

    club = models.ForeignKey(Club, on_delete=models.PROTECT, related_name="office_bearer_terms")
    student = models.ForeignKey("identity.Student", on_delete=models.PROTECT,
                                related_name="office_bearer_terms")
    role = models.CharField(max_length=32, choices=Membership.ROLE_CHOICES)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)   # null = open-ended
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="terms_created")

    class Meta:
        ordering = ("-starts_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=models.F("starts_at")),
                name="office_bearer_term_ends_after_start",
            ),
        ]
        indexes = [models.Index(fields=["club", "student", "ends_at"])]

    def __str__(self):
        return f"{self.student_id} {self.role} of {self.club_id} from {self.starts_at:%Y-%m-%d}"

    def is_current(self, now):
        return self.starts_at <= now and (self.ends_at is None or self.ends_at > now)
