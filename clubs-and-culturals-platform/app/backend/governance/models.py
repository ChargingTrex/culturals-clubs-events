from django.conf import settings
from django.db import models

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

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["state", "current_stage"])]
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
