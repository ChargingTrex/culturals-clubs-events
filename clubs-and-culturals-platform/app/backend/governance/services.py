"""
Approval routing.

The chain is data, not a chain of `if` statements: `build_route` produces an
ordered list of stages at submission, and `decide` advances through it. That is
what lets the Cultural Society gate be switched off in configuration without
touching the decision code.

No club role approves its own budget (AGENT_PROMPT §6). `decide` refuses any
actor who does not hold the stage's role, and refuses a club office bearer
outright even if they somehow hold an approval role for their own club's event.
"""
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common import roles as R
from common.errors import Conflict, ProblemDetail
from events.models import EventStatus
from governance.models import (
    ApprovalRequest, ApprovalStage, ApprovalState, ApprovalStep, Decision,
)
from integrations.registry import audit_sink, notifier


# --------------------------------------------------------------------------
# Routing
# --------------------------------------------------------------------------
def build_route(event, amount_requested):
    """
    The stages this proposal must pass, in order, plus why the VC gate applies.

    Two independent reasons escalate to the Vice-Chancellor (AGENT_PROMPT §2):
    the amount exceeds the threshold, or the event belongs to a fest. They are
    recorded separately because "over threshold" and "it's a fest" call for
    different conversations at that level.
    """
    stages, vc_reasons = [], []

    for stage in settings.APPROVAL_CHAIN:
        if stage == ApprovalStage.CULTURAL_SOCIETY:
            # Applies only to the clubs the society actually covers; a technical
            # club's event should not queue behind the cultural secretary.
            if event.club.under_cultural_society:
                stages.append(stage)
        elif stage == ApprovalStage.DEAN:
            stages.append(stage)
        elif stage == ApprovalStage.VC:
            vc_reasons.append("configured")
        else:
            raise ValueError(f"APPROVAL_CHAIN contains an unknown stage: {stage!r}")

    if ApprovalStage.DEAN not in stages:
        # The Dean gate is not optional. A configuration that dropped it would
        # publish events with nobody accountable for the money.
        stages.append(ApprovalStage.DEAN)

    if amount_requested > settings.VC_BUDGET_THRESHOLD:
        vc_reasons.append(f"budget over {settings.VC_BUDGET_THRESHOLD}")
    if event.fest_id:
        vc_reasons.append("part of a fest")

    if vc_reasons:
        stages.append(ApprovalStage.VC)
    return stages, ", ".join(vc_reasons)


STAGE_TO_BUDGET_STAGE = {
    ApprovalStage.CULTURAL_SOCIETY: "society_review",
    ApprovalStage.DEAN: "dean_review",
    ApprovalStage.VC: "vc_review",
}


@transaction.atomic
def submit(event, *, actor, actor_user=None):
    """Create the approval request and move the event to `submitted`."""
    from budget.models import BudgetStage

    if event.status not in (EventStatus.DRAFT, EventStatus.RETURNED):
        raise Conflict(
            code="GOVERNANCE_ALREADY_SUBMITTED", title="Already submitted",
            detail=f"“{event.title}” is {event.get_status_display().lower()}.",
        )
    budget = getattr(event, "budget", None)
    if budget is None or not budget.is_ready_to_submit:
        raise Conflict(
            code="GOVERNANCE_BUDGET_REQUIRED", title="Budget required",
            detail=("Add at least one budget line, or declare that the event needs no "
                    "budget and say why. An empty budget and a genuinely free event "
                    "look the same to an approver, so one of the two has to be stated."),
        )

    amount = budget.total_requested
    stages, vc_reason = build_route(event, amount)
    request = ApprovalRequest.objects.create(
        event=event, stages=stages, current_stage=stages[0], amount_requested=amount,
        requires_vc=ApprovalStage.VC in stages, vc_reason=vc_reason, submitted_by=actor_user,
    )
    event.status = EventStatus.SUBMITTED
    event.submitted_at = timezone.now()
    event.save(update_fields=["status", "submitted_at", "updated_at"])
    budget.stage = STAGE_TO_BUDGET_STAGE[stages[0]]
    budget.save(update_fields=["stage", "updated_at"])

    _notify_stage_holders(request, event)
    audit_sink().record(actor=actor, action="event.submitted", target=event,
                        after={"stages": stages, "amount_requested": str(amount)})
    return request


def _stage_role(stage):
    return R.STAGE_ROLE[stage]


def _notify_stage_holders(request, event):
    """
    Tell whoever holds the current gate.

    Recipients are resolved from the role, not from a hard-coded person: cover
    when the Dean is unavailable is an open question in AGENT_PROMPT §9, and
    notifying by role means granting a deputy the role is all that is needed.
    """
    from identity.models import User

    role = _stage_role(request.current_stage)
    stage_label = ApprovalStage(request.current_stage).label
    for user in User.objects.with_global_role(role):
        notifier().send(
            recipient=user,
            subject=f"{event.club.name} sent “{event.title}” for approval",
            body=(f"{event.club.name} has submitted “{event.title}” for "
                  f"{event.starts_at:%d %b %Y}, requesting "
                  f"{request.amount_requested:,.2f}. It is with the {stage_label}."),
            kind="approval.pending",
            link=f"/staff/approvals/{event.id}",
        )


def _notify_club(event, subject, body, kind):
    """
    Notify the club's office bearers, not the whole membership.

    Club members have no budget visibility (AGENT_PROMPT §6), so an approval
    outcome carrying a sanctioned figure goes only to the roles allowed to see it.
    """
    from clubs.models import Membership
    from identity.models import User

    memberships = Membership.objects.filter(
        club=event.club, ended_at__isnull=True, role__in=R.BUDGET_VIEWERS
    ).select_related("student__user")
    for membership in memberships:
        user = membership.student.user
        if isinstance(user, User):
            notifier().send(recipient=user, subject=subject, body=body, kind=kind,
                            link=f"/club/{event.club_id}/events/{event.id}")


def assert_can_decide(request, ctx, *, stage=None):
    """
    Who may act on this gate. Called before any state changes.

    Three distinct refusals, because they are three different mistakes and each
    wants a different response from the person who hit it:

      409 ALREADY_RESOLVED  someone already decided this
      409 WRONG_STAGE       you are an approver on this route, but not yet
      403 NOT_APPROVER      you hold no gate on this route at all

    The middle one matters. A Dean opening a proposal still sitting with the
    Cultural Society needs to be told it is not with them yet, not handed a bare
    "not permitted" that reads like a broken permission.
    """
    current = request.current_stage
    if request.state != ApprovalState.PENDING:
        raise Conflict(code="GOVERNANCE_ALREADY_RESOLVED", title="Already resolved",
                       detail=f"This request is {request.get_state_display().lower()}.")

    if stage is not None and stage != current:
        raise Conflict(
            code="GOVERNANCE_WRONG_STAGE", title="Not at your stage",
            detail=(f"This request is with the {ApprovalStage(current).label}, "
                    f"not the {ApprovalStage(stage).label}."),
        )

    if not ctx.has_any(_stage_role(current)):
        # Does the caller hold some *other* gate on this route? If so this is a
        # turn-taking problem, not a permission problem.
        held_elsewhere = [s for s in request.stages
                          if s != current and ctx.has_any(_stage_role(s))]
        if held_elsewhere:
            raise Conflict(
                code="GOVERNANCE_WRONG_STAGE", title="Not at your stage",
                detail=(f"This request is with the {ApprovalStage(current).label}. "
                        f"It reaches you at the "
                        f"{ApprovalStage(held_elsewhere[0]).label} stage."),
            )
        raise ProblemDetail(
            code="GOVERNANCE_NOT_APPROVER", title="Not permitted", status_code=403,
            detail=f"Only the {ApprovalStage(current).label} may decide this request.",
        )
    # No club role approves its own budget. Belt and braces over the role check:
    # if someone is both cultural secretary and club president, the club role wins.
    if ctx.club_role(request.event.club_id) is not None:
        raise ProblemDetail(
            code="GOVERNANCE_SELF_APPROVAL", title="Not permitted", status_code=403,
            detail=("You hold a role in the club that submitted this proposal. "
                    "No club role approves its own budget."),
        )


def requires_mfa(request, stage):
    """
    §5.5: sanctioning above the escalation threshold needs an MFA-verified
    session regardless of role.
    """
    return (stage == ApprovalStage.VC
            or request.amount_requested > settings.VC_BUDGET_THRESHOLD)


@transaction.atomic
def decide(request, *, ctx, decision, comment="", sanctioned_lines=None, actor_user=None):
    """
    Record a decision and advance, return or reject.

    `sanctioned_lines` is {line_id: amount}; an approver may reduce a head but
    never raise it above what was requested — a sanction larger than the request
    is a data entry error, not a generosity the system should accept.
    """
    from budget.models import BudgetStage

    request = ApprovalRequest.objects.select_for_update().get(pk=request.pk)
    stage = request.current_stage
    assert_can_decide(request, ctx)

    if decision != Decision.APPROVE and not comment.strip():
        raise ProblemDetail(
            code="GOVERNANCE_COMMENT_REQUIRED", title="A comment is required",
            status_code=422,
            detail="Say what the club should change, so the decision is actionable.",
            errors=[{"field": "comment", "code": "REQUIRED",
                     "message": "Required to return or reject."}],
        )
    if decision == Decision.APPROVE and requires_mfa(request, stage) and not ctx.mfa:
        raise ProblemDetail(
            code="GOVERNANCE_MFA_REQUIRED", title="Second factor required",
            status_code=403,
            detail=("Sanctioning above the escalation threshold requires a "
                    "multi-factor-verified session."),
        )

    event = request.event
    budget = getattr(event, "budget", None)

    if decision == Decision.APPROVE and stage == ApprovalStage.DEAN and sanctioned_lines:
        _apply_sanctions(budget, sanctioned_lines)

    step = ApprovalStep.objects.create(
        request=request, stage=stage, decision=decision, comment=comment.strip(),
        actor_sub=ctx.sub, actor_label=ctx.display_name, actor_role=_stage_role(stage),
        mfa_verified=ctx.mfa,
        amount_sanctioned=budget.total_sanctioned if budget else None,
    )

    if decision == Decision.RETURN:
        request.state = ApprovalState.RETURNED
        request.resolved_at = timezone.now()
        event.status = EventStatus.RETURNED
        if budget:
            budget.stage = BudgetStage.RETURNED
        _notify_club(event, f"“{event.title}” was returned for changes",
                     f"{ApprovalStage(stage).label}: {comment}", "approval.returned")
    elif decision == Decision.REJECT:
        request.state = ApprovalState.REJECTED
        request.resolved_at = timezone.now()
        event.status = EventStatus.REJECTED
        if budget:
            budget.stage = BudgetStage.REJECTED
        _notify_club(event, f"“{event.title}” was rejected",
                     f"{ApprovalStage(stage).label}: {comment}", "approval.rejected")
    else:
        remaining = request.remaining_stages()
        if remaining:
            request.current_stage = remaining[0]
            if budget:
                budget.stage = STAGE_TO_BUDGET_STAGE[remaining[0]]
            _notify_stage_holders(request, event)
            _notify_club(
                event, f"“{event.title}” cleared the {ApprovalStage(stage).label}",
                f"It is now with the {ApprovalStage(remaining[0]).label}.",
                "approval.advanced")
        else:
            # Last gate cleared. An approved event is published in the same
            # transaction: an "approved but not published" limbo is a state
            # nobody watches, and proposals rot in it.
            request.state = ApprovalState.APPROVED
            request.resolved_at = timezone.now()
            event.status = EventStatus.PUBLISHED
            if budget:
                budget.stage = BudgetStage.SANCTIONED
            _notify_club(event, f"“{event.title}” is approved and published",
                         "Registration is open and the event is on the calendar.",
                         "approval.approved")

    request.save()
    event.save(update_fields=["status", "updated_at"])
    if budget:
        budget.save(update_fields=["stage", "updated_at"])

    audit_sink().record(
        actor=ctx, action=f"approval.{decision}", target=event,
        before={"stage": stage}, after={"state": request.state,
                                        "current_stage": request.current_stage,
                                        "event_status": event.status},
        reason=comment,
    )
    return step


def _apply_sanctions(budget, sanctioned_lines):
    """Per-head sanctioning. A head may be reduced, never raised (§5)."""
    if budget is None:
        return
    lines = {str(line.id): line for line in budget.lines.select_for_update()}
    unknown = set(map(str, sanctioned_lines)) - set(lines)
    if unknown:
        raise ProblemDetail(code="BUDGET_UNKNOWN_LINE", title="Unknown budget line",
                            status_code=422,
                            detail=f"No such budget line on this event: {', '.join(sorted(unknown))}")
    for line_id, amount in sanctioned_lines.items():
        line = lines[str(line_id)]
        amount = max(0, amount)
        if amount > line.amount_requested:
            raise ProblemDetail(
                code="BUDGET_SANCTION_EXCEEDS_REQUEST", title="Sanction exceeds the request",
                status_code=422,
                detail=(f"“{line.head}” requested {line.amount_requested}; "
                        f"{amount} cannot be sanctioned against it."),
                errors=[{"field": f"sanctioned.{line_id}", "code": "ABOVE_REQUESTED",
                         "message": str(line.amount_requested)}],
            )
        line.amount_sanctioned = amount
        line.save(update_fields=["amount_sanctioned", "updated_at"])
    # Any head the approver did not touch is sanctioned as requested, rather than
    # left null — a null there would read as "not yet decided" after the decision.
    for line in budget.lines.filter(amount_sanctioned__isnull=True):
        line.amount_sanctioned = line.amount_requested
        line.save(update_fields=["amount_sanctioned", "updated_at"])


def pending_for(ctx):
    """
    The queue for whoever is asking.

    Filtered by the stages the caller actually holds, so the Dean's queue and the
    Cultural Society's queue come from one endpoint without either seeing the
    other's work as their own.
    """
    stages = [stage for stage, role in R.STAGE_ROLE.items() if ctx.has_any(role)]
    if not stages:
        return ApprovalRequest.objects.none()
    return (ApprovalRequest.objects
            .filter(state=ApprovalState.PENDING, current_stage__in=stages)
            .select_related("event__club", "event__venue")
            .prefetch_related("event__budget__lines", "steps")
            .order_by("event__starts_at"))
