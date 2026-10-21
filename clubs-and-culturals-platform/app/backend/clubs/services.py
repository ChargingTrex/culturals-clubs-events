"""
Club services: effective roles, office-bearer handover, dormancy.

Three things live here rather than in the views because more than one caller
needs each of them:

  active_club_roles   the token (identity/tokens.roles_for) and the roster
  handover            the handover endpoint
  touch_activity      every place a club does something (events, memberships)
  flag_dormant        the dormancy job (management command, later a jobs endpoint)
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from clubs.models import Club, JoinRequest, Membership, OfficeBearerTerm, RoleChange
from common import roles as R
from common.errors import ProblemDetail
from integrations.registry import audit_sink, notifier

# The offices a handover can confer. Core team and plain membership are not
# offices: they have no term and are set with the ordinary role endpoint.
OFFICE_BEARER_ROLES = (R.CLUB_PRESIDENT, R.CLUB_VICE_PRESIDENT, R.CLUB_TREASURER,
                       R.CLUB_SECRETARY)


# --------------------------------------------------------------------------
# Effective roles
# --------------------------------------------------------------------------
def current_terms(club_id, student_id, now):
    return [t for t in OfficeBearerTerm.objects.filter(club_id=club_id, student_id=student_id)
            if t.is_current(now)]


def effective_role(membership, now=None, terms=None):
    """
    The role a membership confers *right now*.

    If the (club, student) pair has office-bearer terms, the terms decide: the
    most senior current term's office, or plain membership when every term has
    ended. A pair with no terms at all falls back to the Membership row, which
    is how directly assigned roles (POST /memberships/{id}/role) keep working.
    """
    now = now or timezone.now()
    if terms is None:
        terms = list(OfficeBearerTerm.objects.filter(club_id=membership.club_id,
                                                     student_id=membership.student_id))
    if not terms:
        return membership.role
    held = [t.role for t in terms if t.is_current(now)]
    if held:
        return min(held, key=R.seniority)
    # Every term has ended. An office is gone with its term; a non-office role
    # (core team, member) never had a term and stays as the row says.
    return R.CLUB_MEMBER if membership.role in OFFICE_BEARER_ROLES else membership.role


def active_club_roles(student, now=None):
    """
    `[(role, club_id), ...]` for the token's scoped roles.

    One query for the memberships, one for the terms; an expired President's
    term yields `club_member`, so the next login or refresh drops the
    `club_president:<club>` scope without anyone editing the Membership row.
    """
    now = now or timezone.now()
    memberships = list(Membership.objects.filter(student=student, ended_at__isnull=True)
                       .only("club_id", "student_id", "role"))
    if not memberships:
        return []
    terms_by_club = {}
    for term in OfficeBearerTerm.objects.filter(student=student,
                                                club_id__in=[m.club_id for m in memberships]):
        terms_by_club.setdefault(term.club_id, []).append(term)
    return [(effective_role(m, now, terms_by_club.get(m.club_id, [])), m.club_id)
            for m in memberships]


def current_office_bearers(club, roles, now=None):
    """
    The active memberships whose *effective* role (terms first, Membership row
    as fallback — the same precedence as the token) is one of `roles`.

    Use this, not `Membership.role`, to pick who is told something: after a
    future-dated handover's date passes the terms say the new President while
    the rows still say the old one until `apply_due_terms` runs.
    """
    now = now or timezone.now()
    wanted = set(roles)
    memberships = list(club.memberships.filter(ended_at__isnull=True)
                       .select_related("student__user"))
    terms = {}
    for term in OfficeBearerTerm.objects.filter(club=club):
        terms.setdefault(term.student_id, []).append(term)
    return [m for m in memberships
            if effective_role(m, now, terms.get(m.student_id, [])) in wanted]


def _notify_members(memberships, *, subject, body, kind, link):
    for membership in memberships:
        user = getattr(membership.student, "user", None)
        if user is not None:
            notifier().send(recipient=user, subject=subject, body=body, kind=kind, link=link)


# --------------------------------------------------------------------------
# Join requests (PRD §5.2)
# --------------------------------------------------------------------------
def settle_join_request(join_request, *, outcome, actor_user, note=""):
    """
    Decide a pending request. On accept, the membership is created unless one
    already exists (joined by another route), in which case the request is
    settled as accepted anyway — its intent is satisfied and a request that can
    never be accepted must not sit in the queue forever.

    Returns the membership (new or existing) for an accept, None for a decline.
    The caller holds the row lock and the transaction.
    """
    from django.db import IntegrityError

    membership = None
    if outcome == JoinRequest.State.ACCEPTED:
        try:
            with transaction.atomic():
                membership = Membership.objects.create(
                    club=join_request.club, student=join_request.student, role=R.CLUB_MEMBER)
        except IntegrityError:
            membership = Membership.objects.get(
                club=join_request.club, student=join_request.student, ended_at__isnull=True)
            note = note or "Already a member"
    join_request.state = outcome
    join_request.decided_by = actor_user
    join_request.decided_at = timezone.now()
    join_request.note = note
    join_request.save(update_fields=["state", "decided_by", "decided_at", "note", "updated_at"])
    return membership


def notify_join_decision(join_request):
    club = join_request.club
    user = getattr(join_request.student, "user", None)
    if user is None:
        return
    if join_request.state == JoinRequest.State.ACCEPTED:
        subject = f"Welcome to {club.name}"
        body = f"Your request to join {club.name} was accepted."
    else:
        subject = f"Your request to join {club.name} was declined"
        body = f"{club.name} declined your request." + (
            f" Note: {join_request.note}" if join_request.note else "")
    notifier().send(recipient=user, subject=subject, body=body,
                    kind=f"club.join_{join_request.state}", link=f"/clubs/{club.id}")


def settle_pending_on_open(club, *, actor, actor_user):
    """
    A club that switches to open admission has no queue any more: every pending
    request is accepted on the spot, each one audited and the student told.
    """
    settled = []
    with transaction.atomic():
        pending = (JoinRequest.objects.select_for_update(of=("self",))
                   .select_related("student__user", "club")
                   .filter(club=club, state=JoinRequest.State.PENDING))
        for join_request in pending:
            settle_join_request(join_request, outcome=JoinRequest.State.ACCEPTED,
                                actor_user=actor_user, note="Club opened to all members")
            audit_sink().record(actor=actor, action="club.join_accepted", target=join_request,
                                before={"state": JoinRequest.State.PENDING},
                                after={"state": JoinRequest.State.ACCEPTED},
                                reason="join_mode set to open")
            settled.append(join_request)
        if settled:
            touch_activity(club, actor=actor)
    for join_request in settled:
        notify_join_decision(join_request)
    return settled


# --------------------------------------------------------------------------
# Activity and dormancy (PRD §5.1)
# --------------------------------------------------------------------------
def touch_activity(club, now=None, *, actor=None):
    """
    Record that the club did something. A dormant club that does something is
    active again — dormancy is a flag for the Dean's attention, not a lock.
    """
    now = now or timezone.now()
    club_id = getattr(club, "pk", club)
    reactivated = (Club.objects.filter(pk=club_id, status=Club.Status.DORMANT)
                   .update(status=Club.Status.ACTIVE, last_activity_at=now, updated_at=now))
    if reactivated:
        audit_sink().record(actor=actor, action="club.reactivated",
                            target=Club.objects.get(pk=club_id),
                            before={"status": Club.Status.DORMANT},
                            after={"status": Club.Status.ACTIVE})
    else:
        Club.objects.filter(pk=club_id).update(last_activity_at=now, updated_at=now)
    if isinstance(club, Club):
        club.last_activity_at = now
        if reactivated:
            club.status = Club.Status.ACTIVE


def flag_dormant(now=None, days=None):
    """
    Flip active clubs with no activity for `days` to dormant. Returns the clubs
    flagged. A club that never recorded activity is measured from its creation.
    """
    now = now or timezone.now()
    days = settings.DORMANCY_DAYS if days is None else days
    cutoff = now - timedelta(days=days)
    from django.db.models import Q

    stale = Club.objects.filter(status=Club.Status.ACTIVE).filter(
        Q(last_activity_at__lt=cutoff) | Q(last_activity_at__isnull=True, created_at__lt=cutoff)
    )
    flagged = []
    for club in stale:
        with transaction.atomic():
            updated = Club.objects.filter(pk=club.pk, status=Club.Status.ACTIVE).update(
                status=Club.Status.DORMANT, updated_at=now)
            if not updated:
                continue
            club.status = Club.Status.DORMANT
            audit_sink().record(
                actor=None, action="club.flagged_dormant", target=club,
                before={"status": Club.Status.ACTIVE},
                after={"status": Club.Status.DORMANT,
                       "last_activity_at": club.last_activity_at.isoformat()
                       if club.last_activity_at else None},
                reason=f"No activity for {days} days.",
            )
            flagged.append(club)
    return flagged


# --------------------------------------------------------------------------
# Handover (PRD §5.3, §5.18)
# --------------------------------------------------------------------------
def apply_due_terms(club, now=None, *, actor=None):
    """
    Bring Membership rows in line with the terms as of `now`.

    The token never needs this — it reads the terms directly — but the roster
    shows Membership.role, and the one-president constraint lives on that row,
    so after a handover takes effect the rows are updated to match.
    """
    now = now or timezone.now()
    memberships = list(club.memberships.filter(ended_at__isnull=True))
    terms = {}
    for term in OfficeBearerTerm.objects.filter(club=club):
        terms.setdefault(term.student_id, []).append(term)
    changed = []
    # Demote first, then promote, so the one-president constraint is never
    # tripped by the incoming president saving before the outgoing one.
    ordered = sorted(memberships, key=lambda m: R.seniority(
        effective_role(m, now, terms.get(m.student_id, []))), reverse=True)
    for membership in ordered:
        role = effective_role(membership, now, terms.get(membership.student_id, []))
        if role != membership.role:
            old = membership.role
            membership.role = role
            membership.save(update_fields=["role", "updated_at"])
            RoleChange.objects.create(
                membership=membership,
                actor_sub=getattr(actor, "sub", None) or "00000000-0000-0000-0000-000000000000",
                actor_label=getattr(actor, "display_name", "") or "handover",
                from_role=old, to_role=role, reason="Office-bearer term took effect",
            )
            changed.append(membership)
    return changed


@transaction.atomic
def handover(club, *, actor, actor_user, effective_at, assignments):
    """
    Confer the listed offices from `effective_at`, closing the outgoing terms.

    `assignments` is `[{"student_id": ..., "role": ...}]`. Every office named
    in the list, and every student named in it, has their current term closed
    at `effective_at`; new terms open at the same instant, so there is never a
    moment with two Presidents or none. Everything is one transaction.
    """
    club = Club.objects.select_for_update().get(pk=club.pk)
    now = timezone.now()

    if not assignments:
        raise ProblemDetail(code="CLUBS_HANDOVER_EMPTY", title="Nothing to hand over",
                            status_code=422, detail="List at least one office bearer.")
    roles = [a["role"] for a in assignments]
    if len(set(roles)) != len(roles):
        raise ProblemDetail(code="CLUBS_HANDOVER_DUPLICATE_ROLE", title="Office listed twice",
                            status_code=422,
                            detail="Each office may be conferred on one person per handover.")
    student_ids = [str(a["student_id"]) for a in assignments]
    if len(set(student_ids)) != len(student_ids):
        raise ProblemDetail(code="CLUBS_HANDOVER_DUPLICATE_STUDENT", title="Student listed twice",
                            status_code=422, detail="One office per person.")

    memberships = {
        str(m.student_id): m
        for m in club.memberships.filter(ended_at__isnull=True, student_id__in=student_ids)
    }
    missing = [s for s in student_ids if s not in memberships]
    if missing:
        raise ProblemDetail(
            code="CLUBS_HANDOVER_NOT_A_MEMBER", title="Not a member", status_code=422,
            detail="Every incoming office bearer must already be an active member of the club.",
            errors=[{"field": "assignments", "code": "NOT_A_MEMBER", "message": s}
                    for s in missing],
        )

    affected = [
        t for t in OfficeBearerTerm.objects.select_for_update(of=("self",)).filter(club=club)
        if (t.ends_at is None or t.ends_at > effective_at)
        and (t.role in roles or str(t.student_id) in student_ids)
    ]
    # A term that opened at or after the chosen date cannot be "handed over
    # from" at that date: leaving it open would mean two current holders of
    # one office. PRD §5.3 handovers carry an effective date; pick a later one.
    later = [t for t in affected if t.starts_at >= effective_at]
    if later:
        latest = max(t.starts_at for t in later)
        raise ProblemDetail(
            code="CLUBS_HANDOVER_BACKDATED", title="Effective date is too early",
            status_code=422,
            detail=(f"An office named here was taken up on {latest:%d %b %Y %H:%M}; "
                    "the handover must take effect after that."),
            errors=[{"field": "effective_at", "code": "BEFORE_CURRENT_TERM",
                     "message": latest.isoformat()}],
        )
    outgoing = [t for t in affected if t.starts_at < effective_at]
    # Members who hold an office by Membership row alone (no term yet) also hand
    # it over: give them a term that starts at their join and ends now, so the
    # history shows them and the derivation drops their scope.
    for membership in club.memberships.filter(ended_at__isnull=True, role__in=OFFICE_BEARER_ROLES):
        has_terms = OfficeBearerTerm.objects.filter(club=club, student_id=membership.student_id).exists()
        if not has_terms and (membership.role in roles or str(membership.student_id) in student_ids):
            starts = min(membership.joined_at, effective_at - timedelta(seconds=1))
            outgoing.append(OfficeBearerTerm.objects.create(
                club=club, student_id=membership.student_id, role=membership.role,
                starts_at=starts, created_by=actor_user))
    for term in outgoing:
        term.ends_at = effective_at
        term.save(update_fields=["ends_at", "updated_at"])

    created = []
    for assignment in assignments:
        membership = memberships[str(assignment["student_id"])]
        term = OfficeBearerTerm.objects.create(
            club=club, student_id=membership.student_id, role=assignment["role"],
            starts_at=effective_at, created_by=actor_user,
        )
        created.append(term)
        RoleChange.objects.create(
            membership=membership, actor_sub=actor.sub, actor_label=actor.display_name,
            from_role=membership.role, to_role=assignment["role"],
            reason=f"Handover effective {effective_at:%Y-%m-%d %H:%M}",
        )

    if effective_at <= now:
        apply_due_terms(club, now, actor=actor)

    touch_activity(club, now, actor=actor)
    audit_sink().record(
        actor=actor, action="club.handover", target=club,
        before={"outgoing": [{"student": str(t.student_id), "role": t.role} for t in outgoing]},
        after={"effective_at": effective_at.isoformat(),
               "incoming": [{"student": str(t.student_id), "role": t.role} for t in created]},
    )
    # Tell the people concerned once the handover is durable (on_commit: a
    # rolled-back handover must not announce itself). PRD §5.3 / FLOWS §11.
    incoming_ids = {t.student_id for t in created}
    outgoing_ids = {t.student_id for t in outgoing} - incoming_ids
    transaction.on_commit(lambda: _notify_handover(club, created, outgoing, incoming_ids,
                                                   outgoing_ids, effective_at))
    return created


def _notify_handover(club, created, outgoing, incoming_ids, outgoing_ids, effective_at):
    when = f"{effective_at:%d %b %Y %H:%M}"
    link = f"/club/{club.id}/members"
    memberships = {m.student_id: m for m in club.memberships.filter(
        ended_at__isnull=True).select_related("student__user")}
    for term in created:
        membership = memberships.get(term.student_id)
        if membership:
            _notify_members([membership], kind="club.handover", link=link,
                            subject=f"You are {Membership(role=term.role).get_role_display()} of {club.name}",
                            body=f"Your term as {Membership(role=term.role).get_role_display()} "
                                 f"of {club.name} takes effect {when}.")
    for term in outgoing:
        if term.student_id not in outgoing_ids:
            continue
        outgoing_ids.discard(term.student_id)
        membership = memberships.get(term.student_id)
        if membership:
            _notify_members([membership], kind="club.handover", link=link,
                            subject=f"Your term as {Membership(role=term.role).get_role_display()} of {club.name} ends",
                            body=f"Your term as {Membership(role=term.role).get_role_display()} "
                                 f"of {club.name} ends {when}.")


def office_bearer_history(club):
    return (OfficeBearerTerm.objects.filter(club=club)
            .select_related("student", "created_by")
            .order_by("-starts_at", "role"))
