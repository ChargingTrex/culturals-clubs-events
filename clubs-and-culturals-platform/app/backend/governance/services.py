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
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from common import roles as R
from common.errors import Conflict, ProblemDetail
from events.models import EventStatus
from governance.models import (
    ApprovalRequest, ApprovalStage, ApprovalState, ApprovalStep, Decision, Delegation,
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

    Recipients are resolved from the role, not from a hard-coded person, plus
    whoever is actively standing in for that gate under a Delegation
    (MASTER_SPEC §11.3). A delegate who is not told the request exists cannot
    cover for anyone.
    """
    from identity.models import User

    role = _stage_role(request.current_stage)
    stage_label = ApprovalStage(request.current_stage).label
    recipients = {u.pk: u for u in User.objects.with_global_role(role)}
    for delegation in active_delegations(request.current_stage).select_related("delegate_user"):
        recipients.setdefault(delegation.delegate_user_id, delegation.delegate_user)
    for user in recipients.values():
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


# --------------------------------------------------------------------------
# Delegation (MASTER_SPEC §11.3, PRD §5.13)
# --------------------------------------------------------------------------
def active_delegations(stage=None, at=None):
    """
    Delegations in force at `at` (default now), optionally for one stage. The
    predicate — window, not revoked, principal still holds the role — is
    `Delegation.objects.in_force`, shared with the login view's MFA demand.
    """
    return Delegation.objects.in_force(at=at, stage=stage)


def delegated_stages_for(ctx, at=None):
    """The stages `ctx` may act on right now as somebody's delegate."""
    if not ctx.sub:
        return []
    return list(active_delegations(at=at).filter(delegate_user_id=ctx.sub)
                .order_by("stage").values_list("stage", flat=True).distinct())


def held_stages(ctx, *, delegated=None):
    """
    Every stage the caller may decide: by role, or by an active delegation.
    Order follows STAGE_ROLE so the queue's `stages_you_hold` is stable.
    `delegated` lets a view that already looked the delegations up pass them
    in rather than querying again.
    """
    delegated = set(delegated_stages_for(ctx) if delegated is None else delegated)
    return [stage for stage, role in R.STAGE_ROLE.items()
            if ctx.has_any(role) or stage in delegated]


def has_active_delegation(user, at=None):
    """Whether `user` is covering any gate right now (login reads the queryset directly)."""
    return active_delegations(at=at).filter(delegate_user_id=user.pk).exists()


def active_delegation_for(ctx, stage, at=None, *, lock=False):
    """
    The delegation under which `ctx` may act at `stage`, or None.

    If several principals delegated the same stage to one person, the earliest
    is the one recorded: it is the one that was already in force when the
    others were added, and a step has to name exactly one principal.

    `lock=True` (from `decide`, inside its transaction) takes a row lock so a
    revoke cannot land between the permission check and the step insert.
    """
    if not ctx.sub:
        return None
    qs = (active_delegations(stage, at=at).filter(delegate_user_id=ctx.sub)
          .select_related("principal_user").order_by("starts_at", "created_at"))
    if lock:
        qs = qs.select_for_update(of=("self",))
    delegation = qs.first()
    if delegation is not None and delegation.revoked_at is not None:
        return None     # revoked between the candidate query and the lock
    return delegation


def _is_staff_account(user):
    """
    A staff account for delegation purposes: flagged is_staff, or holding the
    Dean or admin role. Deliberately not "any non-student role": Cultural
    Society office bearers are students here (PRD §4), so that role must not
    qualify an account to stand in for the Vice-Chancellor.
    """
    return bool(user.is_staff) or any(role in (R.DEAN, R.ADMIN)
                                      for role in (user.global_roles or []))


@transaction.atomic
def create_delegation(*, ctx, actor_user, stage, delegate_user, starts_at, ends_at,
                      reason="", principal_user=None):
    """
    Record that `delegate_user` covers `stage` for `principal_user` in the window.

    Who may create one: the holder of the stage's role (for themselves) or an
    admin (naming the principal). Rule decided for §11.3's open question on the
    Vice-Chancellor gate: it may be delegated only to a staff account — is_staff,
    or any non-student global role — unless an admin created the delegation.
    A student account standing in for the VC is a configuration mistake the
    Dean's own form should not be able to make; an administrator can still do
    it knowingly, and the audit entry names them.
    """
    if stage not in R.STAGE_ROLE:
        raise ProblemDetail(code="GOVERNANCE_UNKNOWN_STAGE", title="Unknown stage",
                            status_code=422,
                            detail=f"{stage!r} is not an approval stage.",
                            errors=[{"field": "stage", "code": "INVALID",
                                     "message": ", ".join(R.STAGE_ROLE)}])
    role = _stage_role(stage)
    is_admin = ctx.is_admin()
    if principal_user is None:
        principal_user = actor_user
    if not is_admin:
        if not ctx.has_any(role):
            raise ProblemDetail(
                code="GOVERNANCE_DELEGATION_DENIED", title="Not permitted", status_code=403,
                detail=(f"Only the {ApprovalStage(stage).label} or an administrator may "
                        f"delegate that stage."),
            )
        if principal_user.pk != actor_user.pk:
            raise ProblemDetail(
                code="GOVERNANCE_DELEGATION_DENIED", title="Not permitted", status_code=403,
                detail="Only an administrator may delegate on somebody else's behalf.",
            )
    if role not in (principal_user.global_roles or []):
        raise ProblemDetail(
            code="GOVERNANCE_PRINCIPAL_NOT_HOLDER", title="Principal does not hold that stage",
            status_code=422,
            detail=(f"{principal_user.display_name} does not hold the "
                    f"{ApprovalStage(stage).label} role, so there is nothing to delegate."),
            errors=[{"field": "principal_user", "code": "NOT_HOLDER", "message": role}],
        )
    if delegate_user.pk == principal_user.pk:
        raise ProblemDetail(
            code="GOVERNANCE_DELEGATE_IS_PRINCIPAL", title="Cannot delegate to yourself",
            status_code=422, detail="The delegate must be a different account.",
            errors=[{"field": "delegate_user", "code": "SAME_AS_PRINCIPAL",
                     "message": "Choose another account."}],
        )
    if not delegate_user.is_active:
        raise ProblemDetail(
            code="GOVERNANCE_DELEGATE_INACTIVE", title="Delegate cannot log in",
            status_code=422, detail=f"{delegate_user.display_name}'s account is not active.",
        )
    if ends_at <= starts_at:
        raise ProblemDetail(
            code="GOVERNANCE_DELEGATION_WINDOW", title="Window ends before it starts",
            status_code=422, detail="ends_at must be after starts_at.",
            errors=[{"field": "ends_at", "code": "BEFORE_START", "message": str(starts_at)}],
        )
    if ends_at - starts_at > timedelta(days=settings.DELEGATION_MAX_DAYS):
        # Cover is for an absence. A window longer than this is a role change
        # dressed as cover, and would be a standing, MFA-free route to the gate.
        raise ProblemDetail(
            code="GOVERNANCE_DELEGATION_TOO_LONG", title="Window too long",
            status_code=422,
            detail=(f"A delegation may cover at most {settings.DELEGATION_MAX_DAYS} days. "
                    "For a longer absence, grant the role."),
            errors=[{"field": "ends_at", "code": "MAX_DAYS",
                     "message": str(settings.DELEGATION_MAX_DAYS)}],
        )
    if stage == ApprovalStage.VC and not is_admin and not _is_staff_account(delegate_user):
        raise ProblemDetail(
            code="GOVERNANCE_DELEGATE_NOT_STAFF", title="VC gate needs a staff delegate",
            status_code=422,
            detail=("The Vice-Chancellor's gate may only be delegated to a staff account. "
                    "An administrator can record an exception."),
            errors=[{"field": "delegate_user", "code": "NOT_STAFF",
                     "message": delegate_user.email}],
        )

    delegation = Delegation.objects.create(
        stage=stage, principal_user=principal_user, delegate_user=delegate_user,
        starts_at=starts_at, ends_at=ends_at, reason=(reason or "").strip(),
        created_by=actor_user,
    )
    audit_sink().record(
        actor=ctx, action="delegation.created", target=delegation,
        after={"stage": stage, "principal": str(principal_user.pk),
               "delegate": str(delegate_user.pk), "starts_at": starts_at.isoformat(),
               "ends_at": ends_at.isoformat()},
        reason=delegation.reason,
    )
    notifier().send(
        recipient=delegate_user,
        subject=f"You are covering the {ApprovalStage(stage).label} gate",
        body=(f"{principal_user.display_name} has delegated the "
              f"{ApprovalStage(stage).label} stage to you from "
              f"{starts_at:%d %b %Y %H:%M} to {ends_at:%d %b %Y %H:%M}."
              + (f" Reason: {delegation.reason}" if delegation.reason else "")),
        kind="delegation.granted",
        link="/staff/approvals",
    )
    return delegation


@transaction.atomic
def revoke_delegation(delegation, *, ctx):
    """End a delegation now. Idempotence is refused: a second revoke is a mistake."""
    delegation = Delegation.objects.select_for_update().get(pk=delegation.pk)
    if delegation.is_revoked:
        raise Conflict(code="GOVERNANCE_DELEGATION_REVOKED", title="Already revoked",
                       detail=f"Revoked at {delegation.revoked_at:%d %b %Y %H:%M}.")
    delegation.revoked_at = timezone.now()
    delegation.revoked_by_label = ctx.display_name
    delegation.save(update_fields=["revoked_at", "revoked_by_label", "updated_at"])
    audit_sink().record(actor=ctx, action="delegation.revoked", target=delegation,
                        before={"ends_at": delegation.ends_at.isoformat()},
                        after={"revoked_at": delegation.revoked_at.isoformat()})
    notifier().send(
        recipient=delegation.delegate_user,
        subject=f"Your cover for the {ApprovalStage(delegation.stage).label} gate has ended",
        body=f"{ctx.display_name} revoked the delegation.",
        kind="delegation.revoked", link="/staff/approvals",
    )
    return delegation


def delegations_visible_to(ctx):
    """Own delegations — given or received. Administrators see all of them."""
    qs = Delegation.objects.select_related("principal_user", "delegate_user", "created_by")
    if ctx.is_admin():
        return qs
    if not ctx.sub:
        return qs.none()
    from django.db.models import Q

    return qs.filter(Q(principal_user_id=ctx.sub) | Q(delegate_user_id=ctx.sub))


def assert_can_decide(request, ctx, *, stage=None, lock=False):
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

    An active delegate for the current stage is accepted as if they held the
    role; the Delegation is returned so the step can name the principal. The
    self-approval rule is checked after, and wins: a delegate with a club role in
    the proposing club is refused however they came by the gate.
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

    delegation = None
    if not ctx.has_any(_stage_role(current)):
        delegation = active_delegation_for(ctx, current, lock=lock)
    if not ctx.has_any(_stage_role(current)) and delegation is None:
        # Does the caller hold some *other* gate on this route? If so this is a
        # turn-taking problem, not a permission problem.
        delegated = set(delegated_stages_for(ctx))
        held_elsewhere = [s for s in request.stages
                          if s != current and (ctx.has_any(_stage_role(s)) or s in delegated)]
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
    return delegation


def requires_mfa(request, stage):
    """
    §5.5: sanctioning above the escalation threshold needs an MFA-verified
    session regardless of role.
    """
    return (stage == ApprovalStage.VC
            or request.amount_requested > settings.VC_BUDGET_THRESHOLD)


# The PostgreSQL exclusion constraint on confirmed bookings
# (events/migrations/0004_venue_exclusion_constraint.py). When two approvals race
# past the lock on a database without it, this is the name in the error.
VENUE_EXCLUSION_CONSTRAINT = "venue_confirmed_bookings_do_not_overlap"


@transaction.atomic
def decide(request, *, ctx, decision, comment="", sanctioned_lines=None, actor_user=None):
    """
    Record a decision and advance, return or reject.

    `sanctioned_lines` is {line_id: amount}; an approver may reduce a head but
    never raise it above what was requested — a sanction larger than the request
    is a data entry error, not a generosity the system should accept.

    The final approval is the one transition into a confirmed booking, so it
    takes the same locks as submission (event row, then venue row) and re-checks
    the slot inside the transaction; the view's clash check runs before the
    transaction and cannot see a concurrent approval. On PostgreSQL the
    exclusion constraint is the backstop, and its IntegrityError is mapped to
    the same 409 rather than surfacing as a 500 with the step rolled back.
    """
    try:
        with transaction.atomic():
            return _decide(request, ctx=ctx, decision=decision, comment=comment,
                           sanctioned_lines=sanctioned_lines, actor_user=actor_user)
    except IntegrityError as exc:
        if VENUE_EXCLUSION_CONSTRAINT in str(exc):
            raise Conflict(
                code="GOVERNANCE_CLASH_UNRESOLVED", title="Venue clash unresolved",
                detail=("Another event was confirmed in this venue for the same slot "
                        "while this decision was being recorded. Move one of them first."),
            ) from exc
        raise


def _decide(request, *, ctx, decision, comment, sanctioned_lines, actor_user):
    from budget.models import BudgetStage
    from events.models import Event

    request = ApprovalRequest.objects.select_for_update().get(pk=request.pk)
    stage = request.current_stage
    delegation = assert_can_decide(request, ctx, lock=True)

    if delegation is not None and not ctx.mfa:
        # Every delegated decision — approve, return or reject, at any gate and
        # any amount — needs a second factor. The principal's role is MFA-
        # mandatory at login (§5.5); cover must not be a weaker path to it.
        raise ProblemDetail(
            code="GOVERNANCE_MFA_REQUIRED", title="Second factor required",
            status_code=403,
            detail="Deciding on somebody's behalf requires a multi-factor-verified session.",
        )
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

    # Event row first, then (when publishing) the venue row — the order every
    # booking path uses (events/views.py submit, events/services.reassign_venue).
    event = Event.objects.select_for_update().select_related("club", "venue").get(
        pk=request.event_id)
    budget = getattr(event, "budget", None)

    if decision == Decision.APPROVE and stage == ApprovalStage.DEAN and sanctioned_lines:
        _apply_sanctions(budget, sanctioned_lines)

    step = ApprovalStep.objects.create(
        request=request, stage=stage, decision=decision, comment=comment.strip(),
        actor_sub=ctx.sub, actor_label=ctx.display_name, actor_role=_stage_role(stage),
        mfa_verified=ctx.mfa,
        amount_sanctioned=budget.total_sanctioned if budget else None,
        on_behalf_of=delegation.principal_user if delegation else None,
        on_behalf_of_label=delegation.principal_user.display_name if delegation else "",
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
            # The SLA clock measures the gate holding it, so it restarts here.
            request.stage_entered_at = timezone.now()
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
            _assert_slot_still_free(event)
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

    after = {"state": request.state, "current_stage": request.current_stage,
             "event_status": event.status}
    if delegation:
        after["on_behalf_of"] = str(delegation.principal_user_id)
        after["delegation"] = str(delegation.pk)
    audit_sink().record(
        actor=ctx, action=f"approval.{decision}", target=event,
        before={"stage": stage}, after=after, reason=comment,
    )
    return step


def _assert_slot_still_free(event):
    """
    Lock the venue and refuse to publish into a confirmed booking.

    A soft clash (another *pending* request) was the approver's call and the
    view already surfaced it; a hard clash here means somebody else's approval
    landed first, and this one must not become the second confirmed booking.
    """
    from events.models import Venue
    from events.services import assert_bookable

    Venue.objects.select_for_update().get(pk=event.venue_id)
    try:
        assert_bookable(venue_id=event.venue_id, starts_at=event.starts_at,
                        ends_at=event.ends_at, exclude_id=event.pk)
    except Conflict as exc:
        raise Conflict(
            code="GOVERNANCE_CLASH_UNRESOLVED", title="Venue clash unresolved",
            detail=(f"“{event.title}” now overlaps a confirmed booking in "
                    f"{event.venue.name}: {exc.detail_text} Move one of them first."),
        ) from exc


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


def pending_for(ctx, *, escalated=False, held=None):
    """
    The queue for whoever is asking.

    Filtered by the stages the caller actually holds — by role or by an active
    delegation — so the Dean's queue and the Cultural Society's queue come from
    one endpoint without either seeing the other's work as their own.

    Oldest at the top: the SLA is about what has waited longest, not what is
    on soonest. `escalated=True` keeps only the requests past the SLA.
    """
    stages = held_stages(ctx) if held is None else list(held)
    if not stages:
        return ApprovalRequest.objects.none()
    qs = (ApprovalRequest.objects
          .filter(state=ApprovalState.PENDING, current_stage__in=stages)
          .select_related("event__club", "event__venue")
          .prefetch_related("event__budget__lines", "steps")
          .order_by("stage_entered_at", "created_at"))
    if escalated:
        qs = qs.filter(stage_entered_at__lt=_sla_cutoff())
    return qs


def _sla_cutoff():
    from datetime import timedelta

    return timezone.now() - timedelta(hours=settings.APPROVAL_SLA_HOURS)


def escalated_requests():
    """
    Every pending request that has sat at its current gate longer than
    APPROVAL_SLA_HOURS, oldest first.

    Exposed for the Dean overview (reporting owns the wiring) and for the
    notification job that will chase them; the queue's `?escalated=true` is
    the same predicate.
    """
    return (ApprovalRequest.objects
            .filter(state=ApprovalState.PENDING, stage_entered_at__lt=_sla_cutoff())
            .select_related("event__club", "event__venue")
            .order_by("stage_entered_at", "created_at"))
