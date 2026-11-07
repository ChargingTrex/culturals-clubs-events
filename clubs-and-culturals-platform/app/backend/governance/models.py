from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import MONEY, UUIDModel


class ApprovalStage(models.TextChoices):
    """
    The gates an approval can sit at.

    DEVIATION, stated plainly: AGENT_PROMPT §2 fixes the chain as Dean-only for
    standard events, with a second Vice-Chancellor gate for fests and
    above-threshold budgets, and says explicitly that there is no advisor step.
    CULTURAL_SOCIETY is an addition requested by the product owner. It is enabled
    by the APPROVAL_CHAIN setting, so removing it is configuration, not code.
    """

    CULTURAL_SOCIETY = "cultural_society", "Cultural Society"
    DEAN = "dean", "Dean of Student Affairs"
    VC = "vc", "Vice-Chancellor"


class ApprovalState(models.TextChoices):
    PENDING = "pending", "Awaiting a decision"
    APPROVED = "approved", "Approved"
    RETURNED = "returned", "Returned for changes"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn by the club"


class Decision(models.TextChoices):
    APPROVE = "approve", "Approve"
    RETURN = "return", "Return for changes"
    REJECT = "reject", "Reject"


class ApprovalRequest(UUIDModel):
    """
    One request per submission, carrying its own route.

    The route is frozen at submission (`stages`) rather than recomputed on each
    decision. If the threshold setting changed mid-flight, a recomputed route
    could drop a gate an event had already passed, or add one after the Dean had
    already signed off on the amount.
    """

    event = models.ForeignKey("events.Event", on_delete=models.CASCADE,
                             related_name="approval_requests")
    stages = models.JSONField(default=list)          # ordered stage names
    current_stage = models.CharField(max_length=20, choices=ApprovalStage.choices)
    state = models.CharField(max_length=16, choices=ApprovalState.choices,
                             default=ApprovalState.PENDING)
    amount_requested = models.DecimalField(**MONEY, default=0)
    requires_vc = models.BooleanField(default=False)
    vc_reason = models.CharField(max_length=120, blank=True)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                     null=True, blank=True, related_name="approvals_submitted")
    resolved_at = models.DateTimeField(null=True, blank=True)
    # When the request reached `current_stage`. Reset on every advance, so the
    # SLA clock measures the gate that is actually holding it, not the whole
    # journey (PRD §5.11: approvals pending beyond the SLA are escalated).
    stage_entered_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["state", "current_stage"]),
            models.Index(fields=["state", "stage_entered_at"]),
        ]
        constraints = [
            # One live request per event. Two open requests means two approvers
            # can each approve a different version of the same proposal.
            models.UniqueConstraint(
                fields=["event"],
                condition=models.Q(state="pending"),
                name="one_pending_approval_per_event",
            )
        ]

    def __str__(self):
        return f"{self.event_id} at {self.current_stage} ({self.state})"

    def remaining_stages(self):
        try:
            index = self.stages.index(self.current_stage)
        except ValueError:
            return []
        return self.stages[index + 1:]

    def _hours_at_stage(self):
        end = self.resolved_at if self.state != ApprovalState.PENDING else timezone.now()
        delta = (end or timezone.now()) - self.stage_entered_at
        return max(0.0, delta.total_seconds() / 3600)

    @property
    def age_hours(self):
        """Hours since the current stage was entered, to one decimal."""
        return round(self._hours_at_stage(), 1)

    @property
    def escalated(self):
        """
        Pending past the SLA. Only a pending request can be escalated: a resolved
        one is somebody's finished work, however long it took. Compared on the
        unrounded age, so the flag and the queue filter agree.
        """
        return (self.state == ApprovalState.PENDING
                and self._hours_at_stage() > settings.APPROVAL_SLA_HOURS)


class ApprovalStep(UUIDModel):
    """
    Every decision, kept. AGENT_PROMPT §7 requires an audit entry for any
    consequential change, and an approval history that only kept the final verdict
    could not answer "who reduced this line, and why".
    """

    request = models.ForeignKey(ApprovalRequest, on_delete=models.CASCADE, related_name="steps")
    stage = models.CharField(max_length=20, choices=ApprovalStage.choices)
    decision = models.CharField(max_length=16, choices=Decision.choices)
    comment = models.TextField(blank=True)
    actor_sub = models.UUIDField()
    actor_label = models.CharField(max_length=80)
    actor_role = models.CharField(max_length=40)
    mfa_verified = models.BooleanField(default=False)
    amount_sanctioned = models.DecimalField(**MONEY, null=True, blank=True)
    # Set when a delegate decided: the principal whose gate it was. The step
    # then carries both names, which is what "the delegation is recorded"
    # (PRD §5.13) has to mean for an auditor reading the history later.
    on_behalf_of = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name="steps_delegated")
    on_behalf_of_label = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            # A return or a reject without a comment leaves the club guessing.
            models.CheckConstraint(
                condition=models.Q(decision="approve") | ~models.Q(comment=""),
                name="return_and_reject_need_a_comment",
            )
        ]

    def __str__(self):
        return f"{self.stage}:{self.decision} by {self.actor_label}"


class DelegationQuerySet(models.QuerySet):
    def in_force(self, at=None, stage=None):
        """
        Delegations active at `at` (default now): inside the window, not revoked,
        and with a principal who still holds the stage's role. The role check runs
        in Python because `global_roles` is a JSON array and `__contains` on it is
        PostgreSQL-only (see identity.models.UserManager.with_global_role); the
        rows are few — only staff delegate. Every reader of "who is covering"
        (queue, notifications, login's MFA demand, `decide`) goes through here.
        """
        at = at or timezone.now()
        qs = self.filter(revoked_at__isnull=True, starts_at__lte=at, ends_at__gt=at)
        if stage is not None:
            qs = qs.filter(stage=stage)
        live = [d.pk for d in qs.select_related("principal_user") if d.principal_still_holds]
        return self.model.objects.filter(pk__in=live)


class Delegation(UUIDModel):
    """
    Cover for an approval gate while its holder is away (MASTER_SPEC §11.3,
    PRD §5.13).

    A delegation is a window, not a role grant. Granting the Dean role to a
    deputy was the only route before this existed, and it leaves no record of
    who was standing in for whom, or until when. Here the principal stays the
    accountable holder, the delegate acts within [starts_at, ends_at), and every
    step decided under it names both.

    Rules enforced in governance.services:
      - only the holder of the stage's role, or an admin, may create one;
      - the principal must hold the stage's role;
      - the VC gate may only be delegated to a staff account (is_staff, or any
        non-student global role) unless an admin created the delegation;
      - the self-approval rule still wins: a delegate with a club role in the
        proposing club is refused at decision time, whatever the delegation says;
      - every delegated decision needs an MFA-verified session (login runs the
        challenge for anyone holding an active delegation);
      - a delegation is inert while its principal does not hold the stage's role;
      - a window may cover at most DELEGATION_MAX_DAYS.

    What a delegate does NOT get: the principal's other powers. A Dean-stage
    delegate cannot reassign a venue, open a budget or read a roster; faced with
    an unresolved clash they can only return the proposal. Once decided, the
    request leaves their visible set.
    """

    stage = models.CharField(max_length=20, choices=ApprovalStage.choices)
    principal_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                       related_name="delegations_given")
    delegate_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                      related_name="delegations_received")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    reason = models.CharField(max_length=400, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="delegations_created")
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by_label = models.CharField(max_length=80, blank=True)

    objects = DelegationQuerySet.as_manager()

    class Meta:
        ordering = ("-starts_at",)
        indexes = [models.Index(fields=["stage", "starts_at", "ends_at"])]
        constraints = [
            # A window that ends before it starts is never active and only
            # confuses the list; refuse it rather than store it.
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="delegation_window_ends_after_it_starts",
            ),
            # Delegating to yourself records nothing and would let a revoked
            # role holder keep acting through their own delegation.
            models.CheckConstraint(
                condition=~models.Q(principal_user=models.F("delegate_user")),
                name="delegation_not_to_self",
            ),
        ]

    def __str__(self):
        return f"{self.stage}: {self.principal_user_id} -> {self.delegate_user_id}"

    @property
    def is_revoked(self):
        return self.revoked_at is not None

    @property
    def principal_still_holds(self):
        """
        Cover is for a gate the principal holds *now*. A Dean replaced on day 3
        of a 30-day delegation has nothing left to delegate, so the delegation
        is inert from that moment, with no revoke needed.
        """
        from common import roles as R

        principal = self.principal_user
        return (principal.is_active
                and R.STAGE_ROLE[self.stage] in (principal.global_roles or []))

    def is_active_at(self, when=None):
        when = when or timezone.now()
        return (not self.is_revoked and self.starts_at <= when < self.ends_at
                and self.principal_still_holds)

    @property
    def is_active(self):
        return self.is_active_at()

    @property
    def status(self):
        now = timezone.now()
        if self.is_revoked:
            return "revoked"
        if now < self.starts_at:
            return "scheduled"
        if now >= self.ends_at:
            return "expired"
        return "active"


class Notification(UUIDModel):
    """
    In-app notifications. The email copy is sent by the same adapter call.
    In-app and email only — no other channel exists or may be added.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                            related_name="notifications")
    subject = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    kind = models.CharField(max_length=40)
    link = models.CharField(max_length=300, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["user", "read_at"])]

    def __str__(self):
        return self.subject


class AuditEntry(UUIDModel):
    """
    Append-only. No update or delete path is exposed anywhere in the API.

    `actor_sub` is a bare UUID rather than a foreign key on purpose: the entry
    must survive the account being deleted, and a FK with CASCADE would take the
    audit trail with it.
    """

    actor_sub = models.CharField(max_length=64, blank=True)
    actor_label = models.CharField(max_length=80, blank=True)
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=60, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    reason = models.CharField(max_length=400, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["target_type", "target_id"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.action} on {self.target_type}:{self.target_id}"
