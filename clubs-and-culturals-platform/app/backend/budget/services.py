"""
Budget seeding from a template, and settlement.
"""
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from common.errors import Conflict, ProblemDetail, Unprocessable
from budget.models import (
    Budget, BudgetLine, BudgetStage, BudgetTemplate, BudgetTemplateLine,
    ClubBudgetEnvelope, ReceiptDocument,
)


def seed_from_template(event, template, *, days=1):
    """
    Create budget lines from a template, scaling per-head lines by expected
    attendance and appending the contingency line at the template percentage
    (AGENT_PROMPT §5).
    """
    budget, _ = Budget.objects.get_or_create(event=event)
    budget.lines.all().delete()
    subtotal = Decimal("0")
    for position, line in enumerate(template.lines.all()):
        amount = line.amount_for(expected_attendance=event.expected_attendance, days=days)
        BudgetLine.objects.create(budget=budget, head=line.head, basis=line.basis,
                                  amount_requested=amount, position=position)
        subtotal += amount
    percent = template.contingency_percent or settings.CONTINGENCY_PERCENT
    contingency = (subtotal * Decimal(percent) / Decimal(100)).quantize(Decimal("0.01"))
    if contingency > 0:
        BudgetLine.objects.create(budget=budget, head="Contingency",
                                  amount_requested=contingency, position=999)
    return budget


def create_lines(event, lines):
    """Explicit lines, for a club that wants to depart from a template."""
    budget, _ = Budget.objects.get_or_create(event=event)
    budget.lines.all().delete()
    for position, item in enumerate(lines):
        BudgetLine.objects.create(
            budget=budget, head=item["head"],
            amount_requested=Decimal(str(item["amount_requested"])),
            basis=item.get("basis", BudgetTemplateLine.Basis.LUMP_SUM), position=position,
        )
    return budget


def ensure_budget(event):
    """
    Every event gets a budget shell at creation, even with no template chosen.

    Without one there is nothing for a Treasurer to add lines to, and the club would
    have to guess the budget at proposal time or not at all — which is exactly the
    order this is meant to fix: create the event, then price it.
    """
    budget, _ = Budget.objects.get_or_create(event=event)
    return budget


def _assert_editable(budget):
    if not budget.is_editable:
        raise Conflict(
            code="BUDGET_LOCKED", title="Budget is locked",
            detail=(f"This budget is {budget.get_stage_display().lower()}. Requested "
                    "amounts are frozen once an approver holds it — editing under a "
                    "reviewer would mean they sanction something other than what they read."),
        )


def add_line(budget, *, head, amount_requested, basis=None, position=None):
    """
    Add one budget entry.

    Adding a priced line withdraws any nil declaration: the two statements
    contradict each other, and leaving both would let a budget claim to need nothing
    while carrying an amount.
    """
    _assert_editable(budget)
    head = (head or "").strip()
    if not head:
        raise Unprocessable(code="BUDGET_LINE_HEAD_REQUIRED", title="A head is required",
                            detail="Name what the money is for.",
                            errors=[{"field": "head", "code": "REQUIRED",
                                     "message": "Give the line a head."}])
    amount = Decimal(str(amount_requested))
    if amount < 0:
        raise Unprocessable(code="BUDGET_LINE_NEGATIVE", title="Amount cannot be negative",
                            detail=f"{amount} is not a valid request.",
                            errors=[{"field": "amount_requested", "code": "NEGATIVE",
                                     "message": "Use zero or more."}])
    if budget.lines.filter(head__iexact=head).exists():
        raise Conflict(code="BUDGET_LINE_DUPLICATE_HEAD", title="That head already exists",
                       detail=(f"“{head}” is already a line on this budget. Edit that "
                               "line instead, so one head does not appear twice in the "
                               "settlement."))
    if position is None:
        position = (budget.lines.aggregate(m=models.Max("position"))["m"] or 0) + 1
    line = BudgetLine.objects.create(
        budget=budget, head=head, amount_requested=amount,
        basis=basis or BudgetTemplateLine.Basis.LUMP_SUM, position=position,
    )
    if amount > 0 and budget.is_nil:
        _clear_nil(budget)
    return line


def update_line(budget, line, *, head=None, amount_requested=None, basis=None):
    """Edit a line's head or requested amount, before an approver holds it."""
    _assert_editable(budget)
    fields = []
    if head is not None:
        head = head.strip()
        if not head:
            raise Unprocessable(code="BUDGET_LINE_HEAD_REQUIRED", title="A head is required",
                                detail="Name what the money is for.")
        if budget.lines.filter(head__iexact=head).exclude(pk=line.pk).exists():
            raise Conflict(code="BUDGET_LINE_DUPLICATE_HEAD",
                           title="That head already exists",
                           detail=f"“{head}” is already a line on this budget.")
        line.head = head
        fields.append("head")
    if amount_requested is not None:
        amount = Decimal(str(amount_requested))
        if amount < 0:
            raise Unprocessable(code="BUDGET_LINE_NEGATIVE",
                                title="Amount cannot be negative",
                                detail=f"{amount} is not a valid request.")
        line.amount_requested = amount
        fields.append("amount_requested")
    if basis is not None:
        line.basis = basis
        fields.append("basis")
    if fields:
        line.save(update_fields=fields + ["updated_at"])
    return line


def delete_line(budget, line):
    """
    Remove a line before submission.

    A hard delete is right here and nowhere else in this codebase: an unsubmitted
    budget line is a draft nobody has relied on, so there is no history to preserve.
    Once sanctioned, `is_editable` is False and this path is closed.
    """
    _assert_editable(budget)
    line.delete()
    return budget


@transaction.atomic
def declare_nil(budget, *, reason, actor):
    """
    State that an event needs no money.

    Deliberately an action with a reason and an author rather than a flag the UI can
    infer. "Nobody has priced this yet" and "this genuinely costs nothing" are
    different things, and an approver has to be able to tell which they are looking at.
    """
    _assert_editable(budget)
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise Unprocessable(
            code="BUDGET_NIL_REASON_REQUIRED", title="A reason is required",
            detail=("Say why the event needs no budget — the approver sees this "
                    "instead of a set of figures."),
            errors=[{"field": "reason", "code": "REQUIRED",
                     "message": "e.g. Venue is free and the club owns the equipment."}],
        )
    priced = budget.lines.filter(amount_requested__gt=0)
    if priced.exists():
        heads = ", ".join(priced.values_list("head", flat=True)[:4])
        raise Conflict(
            code="BUDGET_NIL_HAS_LINES", title="This budget asks for money",
            detail=(f"Remove the priced lines first ({heads}). A budget cannot both "
                    "request an amount and declare it needs nothing."),
        )
    budget.is_nil = True
    budget.nil_reason = reason
    budget.nil_declared_at = timezone.now()
    budget.nil_declared_by_sub = actor.sub or None
    budget.nil_declared_by_label = actor.display_name
    budget.save(update_fields=["is_nil", "nil_reason", "nil_declared_at",
                               "nil_declared_by_sub", "nil_declared_by_label", "updated_at"])
    from integrations.registry import audit_sink

    audit_sink().record(actor=actor, action="budget.declared_nil", target=budget,
                        after={"reason": reason})
    return budget


def _clear_nil(budget):
    budget.is_nil = False
    budget.nil_reason = ""
    budget.nil_declared_at = None
    budget.nil_declared_by_sub = None
    budget.nil_declared_by_label = ""
    budget.save(update_fields=["is_nil", "nil_reason", "nil_declared_at",
                               "nil_declared_by_sub", "nil_declared_by_label", "updated_at"])
    return budget


def withdraw_nil(budget, *, actor):
    """Take back a nil declaration so the budget can be priced instead."""
    _assert_editable(budget)
    from integrations.registry import audit_sink

    audit_sink().record(actor=actor, action="budget.nil_withdrawn", target=budget,
                        before={"reason": budget.nil_reason})
    return _clear_nil(budget)


# PRD §5.19.4: phone photographs and PDF invoices. Exact types, not `image/*`:
# an SVG is an image by media type and a script by content, and a receipt
# served inline on the API origin must never be able to run one.
RECEIPT_CONTENT_TYPES = (
    "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic",
)


def is_allowed_receipt_type(content_type):
    return (content_type or "").split(";")[0].strip().lower() in RECEIPT_CONTENT_TYPES


def attach_receipt(line, *, file_name, content, content_type, amount=None,
                   uploaded_by_sub=None, supersedes=None, vendor="", document_date=None):
    """
    Attach a receipt to one line. Replacement supersedes, never overwrites (§5).
    """
    from integrations.registry import file_store

    stored = file_store().put(key=file_name, content=content, content_type=content_type)
    receipt = ReceiptDocument.objects.create(
        line=line, file_key=stored["key"], file_name=file_name, content_type=content_type,
        byte_size=stored["bytes"], sha256=stored["sha256"], amount=amount,
        uploaded_by_sub=uploaded_by_sub, vendor=(vendor or "").strip()[:120],
        document_date=document_date,
    )
    if supersedes is not None:
        supersedes.superseded_by = receipt
        supersedes.save(update_fields=["superseded_by", "updated_at"])
    return receipt


def settlement_problems(budget):
    """
    Everything blocking settlement, all of it at once.

    Returned as a list rather than raising on the first: a treasurer fixing one
    problem per round trip gives up and settles on paper.
    """
    # Nothing is "blocking" settlement before settlement is the next step. A draft
    # budget reporting "enter what was spent" reads as a defect in the club's work
    # when it is simply not that stage yet.
    if not budget.is_settleable:
        return []
    if budget.is_nil:
        return []
    problems = []
    lines = list(budget.lines.prefetch_related("receipts"))
    if not any(line.amount_spent is not None for line in lines):
        problems.append({
            "field": "lines", "code": "NO_SPEND_ENTERED",
            "message": "Enter what was actually spent on at least one line.",
        })
    for line in lines:
        if line.amount_spent is None:
            continue
        current_receipts = [r for r in line.receipts.all() if r.is_current]
        if line.amount_spent > settings.RECEIPT_THRESHOLD and not current_receipts:
            problems.append({
                "field": f"lines.{line.id}.receipts", "code": "RECEIPT_REQUIRED",
                "message": (f"“{line.head}” is over {settings.RECEIPT_THRESHOLD:,}, "
                            f"so it needs a receipt."),
            })
        if line.is_overspent and not line.variance_note.strip():
            over = line.amount_spent - line.amount_sanctioned
            problems.append({
                "field": f"lines.{line.id}.variance_note", "code": "VARIANCE_NOTE_REQUIRED",
                "message": (f"“{line.head}” is {over:,.2f} over sanctioned. "
                            f"Record what caused it."),
            })
    return problems


@transaction.atomic
def settle(budget, *, actor):
    """
    Settle a budget once spend and evidence are complete.

    Only after the event: settling a budget for an event that has not happened
    records spend against nothing, and the figure would land in the semester
    report as though it had.
    """
    from events.models import REPORTABLE, EventStatus

    if budget.stage != BudgetStage.SANCTIONED:
        raise Conflict(
            code="BUDGET_NOT_SANCTIONED", title="Not ready to settle",
            detail=f"This budget is {budget.get_stage_display().lower()}.",
        )
    event = budget.event
    if event is not None and event.status not in REPORTABLE + (EventStatus.LIVE,):
        raise Conflict(
            code="BUDGET_EVENT_NOT_RUN", title="Event has not run yet",
            detail="Close the event first; spend is settled against what happened.",
        )
    if budget.is_nil:
        # Nothing was spent because nothing was asked for. Settling it is a
        # formality, but it still has to happen or the event sits unsettled on the
        # Dean's chasing list forever.
        budget.stage = BudgetStage.SETTLED
        budget.settled_at = timezone.now()
        budget.save(update_fields=["stage", "settled_at", "updated_at"])
        from integrations.registry import audit_sink

        audit_sink().record(actor=actor, action="budget.settled_nil", target=budget,
                            after={"reason": budget.nil_reason})
        return budget

    problems = settlement_problems(budget)
    if problems:
        raise ProblemDetail(
            code="BUDGET_SETTLEMENT_INCOMPLETE", title="Cannot settle yet",
            status_code=422, detail="Some lines still need spend, a receipt or a reason.",
            errors=problems,
        )
    budget.stage = BudgetStage.SETTLED
    budget.settled_at = timezone.now()
    budget.save(update_fields=["stage", "settled_at", "updated_at"])

    from integrations.registry import audit_sink

    audit_sink().record(
        actor=actor, action="budget.settled", target=budget,
        after={"total_sanctioned": str(budget.total_sanctioned),
               "total_spent": str(budget.total_spent)},
    )
    return budget


def receipt_location(receipt):
    """
    Where the bytes of a receipt are, through the FileStore seam.

    Local mode keeps the module's own bucket on disk, so the view can stream
    the file itself. Platform mode only knows a URL (`url_for`), so the view
    redirects to it. Either way the DB holds a key, never the bytes.

    Returns {"kind": "file", "path": Path} or {"kind": "redirect", "url": str}.
    """
    from integrations.files import LocalFileStore
    from integrations.registry import file_store

    store = file_store()
    if isinstance(store, LocalFileStore):
        root = store.root.resolve()
        path = (root / receipt.file_key).resolve()
        if root not in path.parents:
            # A key that escapes the bucket was not written by this module.
            raise ProblemDetail(code="BUDGET_RECEIPT_FILE_MISSING", title="File not found",
                                status_code=404, detail="The stored file cannot be located.")
        return {"kind": "file", "path": path}
    return {"kind": "redirect", "url": store.url_for(receipt.file_key)}


# --------------------------------------------------------------------------
# Annual envelope (PRD §5.7.3, §5.19.5)
# --------------------------------------------------------------------------
COUNTS_AGAINST_ENVELOPE = (BudgetStage.SANCTIONED, BudgetStage.SETTLED)

# Envelope years are calendar years; the bounds match EnvelopeSetSerializer and
# keep a `?year=` from reaching a datetime the database cannot build.
ENVELOPE_YEAR_MIN, ENVELOPE_YEAR_MAX = 2000, 2100


def display_tz():
    return ZoneInfo(settings.DISPLAY_TIME_ZONE)


def envelope_year_of(starts_at):
    """
    The envelope year an event draws on: the calendar year of its start, read
    in DISPLAY_TIME_ZONE. Storage is UTC (AGENT_PROMPT §4), and an event at
    00:30 IST on 1 January is 19:00 UTC on 31 December — the institution's
    calendar, not the server's, decides which year that is.

    Decision E-11 (docs/CHECKLIST.md): calendar year, in DISPLAY_TIME_ZONE. An
    academic-year envelope (Jul–Jun, derivable from `Semester`) would be the
    more natural fit for PRD §5.7.3 and needs a product decision; when it is
    taken, this function and `current_envelope_year` are the only two places
    that define the year.
    """
    return timezone.localtime(starts_at, display_tz()).year


def current_envelope_year():
    return timezone.localtime(timezone.now(), display_tz()).year


def validate_envelope_year(raw):
    """A year from the query string: an int within the supported range, or 422."""
    try:
        year = int(str(raw).strip())
    except (TypeError, ValueError):
        year = None
    if year is None or not ENVELOPE_YEAR_MIN <= year <= ENVELOPE_YEAR_MAX:
        raise Unprocessable(
            code="BUDGET_ENVELOPE_YEAR", title="Year out of range",
            detail=f"year must be a whole number between {ENVELOPE_YEAR_MIN} and "
                   f"{ENVELOPE_YEAR_MAX}.",
            errors=[{"field": "year", "code": "OUT_OF_RANGE", "message": str(raw)}],
        )
    return year


def envelope_summary(club_id, year):
    """
    The club's envelope for `year` with running utilisation.

    `sanctioned_to_date` is the sum of `amount_sanctioned` over the club's
    budgets in stage sanctioned or settled, for events (or fests) starting in
    that calendar year, read in DISPLAY_TIME_ZONE (see `envelope_year_of`).
    Budgets still under review, returned or rejected do not count: nothing has
    been committed. `settled_to_date` is the actual spend recorded on the
    settled ones. `remaining` = amount − sanctioned_to_date, or None when no
    envelope has been set for the year.

    Fest-level budgets count today. Once fest sub-events exist (PRD §5.15.4:
    "a single envelope, with sub-event heads drawing against it"), a sub-event
    budget whose fest has its own sanctioned budget must be excluded here or it
    is counted twice (QA F7).
    """
    envelope = ClubBudgetEnvelope.objects.filter(club_id=club_id, year=year).first()
    # `__year` on an aware DateTimeField is evaluated in the *current* time
    # zone, so the lookup is run under DISPLAY_TIME_ZONE to agree with
    # `envelope_year_of`.
    with timezone.override(display_tz()):
        totals = BudgetLine.objects.filter(
            models.Q(budget__event__club_id=club_id, budget__event__starts_at__year=year)
            | models.Q(budget__fest__club_id=club_id, budget__fest__starts_on__year=year),
            budget__stage__in=COUNTS_AGAINST_ENVELOPE,
        ).aggregate(
            sanctioned=models.Sum("amount_sanctioned"),
            settled=models.Sum("amount_spent",
                               filter=models.Q(budget__stage=BudgetStage.SETTLED)),
        )
    sanctioned = totals["sanctioned"] or Decimal("0")
    settled = totals["settled"] or Decimal("0")
    amount = envelope.amount if envelope else None
    return {
        "club_id": str(club_id),
        "year": year,
        "amount": amount,
        "sanctioned_to_date": sanctioned,
        "settled_to_date": settled,
        "remaining": (amount - sanctioned) if amount is not None else None,
        "set_by": envelope.set_by_label if envelope else "",
        "updated_at": envelope.updated_at if envelope else None,
    }


@transaction.atomic
def set_envelope(club, *, year, amount, actor, actor_user=None):
    """Create or replace the envelope for one year. Audited with the old figure."""
    amount = Decimal(str(amount))
    if amount < 0:
        raise Unprocessable(code="BUDGET_ENVELOPE_NEGATIVE", title="Amount cannot be negative",
                            detail=f"{amount} is not an envelope.",
                            errors=[{"field": "amount", "code": "NEGATIVE",
                                     "message": "Use zero or more."}])
    envelope = (ClubBudgetEnvelope.objects.select_for_update()
                .filter(club=club, year=year).first())
    before = {"amount": str(envelope.amount)} if envelope else {}
    if envelope is None:
        envelope = ClubBudgetEnvelope(club=club, year=year)
    envelope.amount = amount
    envelope.set_by = actor_user
    envelope.set_by_label = actor.display_name
    envelope.save()
    from integrations.registry import audit_sink

    audit_sink().record(actor=actor, action="budget.envelope_set", target=envelope,
                        before=before, after={"year": year, "amount": str(amount),
                                              "club": str(club.pk)})
    return envelope
