from django.db import models

from common.models import MONEY, UUIDModel


class BudgetTemplate(UUIDModel):
    """
    Heads for an event type, so a club is not inventing a budget from nothing.

    `basis` is what makes a template useful: a per-head line scales with expected
    attendance automatically, which is where most manual budget errors come from.
    """

    name = models.CharField(max_length=80, unique=True)
    event_kind = models.CharField(max_length=20, blank=True)
    contingency_percent = models.PositiveSmallIntegerField(default=8)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class BudgetTemplateLine(UUIDModel):
    class Basis(models.TextChoices):
        LUMP_SUM = "lump_sum", "Lump sum"
        PER_HEAD = "per_head", "Rate x expected attendance"
        PER_DAY = "per_day", "Rate x days"

    template = models.ForeignKey(BudgetTemplate, on_delete=models.CASCADE, related_name="lines")
    head = models.CharField(max_length=120)
    basis = models.CharField(max_length=16, choices=Basis.choices, default=Basis.LUMP_SUM)
    rate = models.DecimalField(**MONEY)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("position", "head")

    def __str__(self):
        return f"{self.head} ({self.basis})"

    def amount_for(self, *, expected_attendance, days=1):
        if self.basis == self.Basis.PER_HEAD:
            return self.rate * max(1, expected_attendance)
        if self.basis == self.Basis.PER_DAY:
            return self.rate * max(1, days)
        return self.rate


class BudgetStage(models.TextChoices):
    DRAFT = "draft", "Draft"
    SOCIETY_REVIEW = "society_review", "With the Cultural Society"
    DEAN_REVIEW = "dean_review", "With the Dean"
    VC_REVIEW = "vc_review", "With the Vice-Chancellor"
    SANCTIONED = "sanctioned", "Sanctioned"
    SETTLED = "settled", "Settled"
    RETURNED = "returned", "Returned for changes"
    REJECTED = "rejected", "Rejected"


class Budget(UUIDModel):
    """
    One budget per event or per fest — exactly one, never both (AGENT_PROMPT §4).
    A fest budget covering its events would be double-counted in the report.
    """

    event = models.OneToOneField("events.Event", on_delete=models.CASCADE, null=True,
                                 blank=True, related_name="budget")
    fest = models.OneToOneField("events.Fest", on_delete=models.CASCADE, null=True,
                                blank=True, related_name="budget")
    stage = models.CharField(max_length=20, choices=BudgetStage.choices,
                             default=BudgetStage.DRAFT)
    settled_at = models.DateTimeField(null=True, blank=True)

    # A nil budget is DECLARED, never merely empty.
    #
    # An event that costs nothing and an event whose budget nobody has filled in yet
    # look identical if the only evidence is an absence of lines. The approver needs
    # to tell them apart: one is ready to decide, the other is an omission. So a
    # zero-cost event carries an explicit statement, with a reason and an author,
    # and the approval queue shows it as a declaration rather than a blank.
    is_nil = models.BooleanField(default=False)
    nil_reason = models.CharField(max_length=400, blank=True)
    nil_declared_at = models.DateTimeField(null=True, blank=True)
    nil_declared_by_sub = models.UUIDField(null=True, blank=True)
    nil_declared_by_label = models.CharField(max_length=80, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(event__isnull=False, fest__isnull=True)
                    | models.Q(event__isnull=True, fest__isnull=False)
                ),
                name="budget_exactly_one_owner",
            ),
            # A declaration without a reason is not a declaration. The database
            # refuses it rather than trusting whichever form last touched the row.
            models.CheckConstraint(
                condition=models.Q(is_nil=False) | ~models.Q(nil_reason=""),
                name="nil_budget_needs_a_reason",
            ),
        ]

    def __str__(self):
        return f"budget for {self.event_id or self.fest_id}"

    @property
    def is_ready_to_submit(self):
        """Either priced, or explicitly declared to need nothing."""
        return self.is_nil or self.lines.exists()

    @property
    def is_settleable(self):
        """
        Whether settlement is even the next step.

        Three things have to be true in order, and they genuinely are an order:
        the budget is sanctioned, the event has happened, and it is not already
        settled. Spend recorded against an event that has not run is spend against
        nothing, and it would land in the semester report as though it had.
        """
        return self.settlement_waiting_on is None

    @property
    def settlement_waiting_on(self):
        """
        What settlement is waiting for, or None when it can proceed.

        Returned instead of a bare boolean because "not yet" has distinct causes
        and the club needs to know which: waiting on an approver is somebody
        else's move, waiting on the event is just the calendar.
        """
        if self.stage == BudgetStage.SETTLED:
            return "settled"
        if self.stage != BudgetStage.SANCTIONED:
            return "sanction"
        event = self.event
        if event is None:
            return None            # a fest budget has no single event to wait on
        from events.models import REPORTABLE, EventStatus

        if event.status not in REPORTABLE + (EventStatus.LIVE,):
            return "event"
        return None

    @property
    def settlement_hint(self):
        """One line the club can act on, instead of a list of premature blockers."""
        return {
            "sanction": ("Not yet. The budget has to be sanctioned before spend is "
                         "recorded against it."),
            "event": ("Not yet. Settle after the event has run — spend recorded "
                      "against an event that has not happened is spend against nothing."),
            "settled": "Settled. Receipts stay attached to this event.",
            None: None,
        }[self.settlement_waiting_on]

    @property
    def is_editable(self):
        """
        Requested amounts are frozen once an approver holds the budget.

        Editing under a reviewer would mean they sanction something other than what
        they read; after a return, the club is expected to revise, so `returned`
        reopens it.
        """
        return self.stage in (BudgetStage.DRAFT, BudgetStage.RETURNED,
                              BudgetStage.REJECTED)

    def _sum(self, field):
        from decimal import Decimal

        return sum((getattr(line, field) or Decimal("0")) for line in self.lines.all())

    @property
    def total_requested(self):
        return self._sum("amount_requested")

    @property
    def total_sanctioned(self):
        return self._sum("amount_sanctioned")

    @property
    def total_spent(self):
        return self._sum("amount_spent")


class BudgetLine(UUIDModel):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name="lines")
    head = models.CharField(max_length=120)
    basis = models.CharField(max_length=16, default=BudgetTemplateLine.Basis.LUMP_SUM)
    amount_requested = models.DecimalField(**MONEY)
    # Null until the approver acts, which is different from sanctioning zero.
    amount_sanctioned = models.DecimalField(**MONEY, null=True, blank=True)
    amount_spent = models.DecimalField(**MONEY, null=True, blank=True)
    variance_note = models.CharField(max_length=400, blank=True)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("position", "head")
        constraints = [
            models.CheckConstraint(condition=models.Q(amount_requested__gte=0),
                                   name="budget_line_requested_non_negative"),
            models.CheckConstraint(
                condition=models.Q(amount_sanctioned__isnull=True)
                | models.Q(amount_sanctioned__gte=0),
                name="budget_line_sanctioned_non_negative"),
            models.CheckConstraint(
                condition=models.Q(amount_spent__isnull=True) | models.Q(amount_spent__gte=0),
                name="budget_line_spent_non_negative"),
        ]

    def __str__(self):
        return f"{self.head}: {self.amount_requested}"

    @property
    def is_overspent(self):
        return (self.amount_spent is not None and self.amount_sanctioned is not None
                and self.amount_spent > self.amount_sanctioned)


class ReceiptDocument(UUIDModel):
    """
    Receipts attach per budget line, never bundled at event level (AGENT_PROMPT §5).
    A bundle cannot answer "what was the ₹14,000 on sound spent with".

    `superseded_by` is how a replacement works: the old row stays and points at
    the new one. Overwriting would destroy the only evidence of what was first
    claimed.
    """

    line = models.ForeignKey(BudgetLine, on_delete=models.CASCADE, related_name="receipts")
    # A reference, never the bytes (AGENT_PROMPT §2).
    file_key = models.CharField(max_length=400)
    file_name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=80)
    byte_size = models.PositiveIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    amount = models.DecimalField(**MONEY, null=True, blank=True)
    uploaded_by_sub = models.UUIDField(null=True, blank=True)
    superseded_by = models.OneToOneField("self", on_delete=models.SET_NULL, null=True,
                                         blank=True, related_name="supersedes")

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.file_name

    @property
    def is_current(self):
        return self.superseded_by_id is None
