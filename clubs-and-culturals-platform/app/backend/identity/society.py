"""
The Cultural Society's own roster (AR-08).

The Society is three global roles on the user row: a member, and its two
officers, the Secretary and the Vice-Secretary. The officers keep the member
list. Appointing or removing an officer is the Dean's (or an administrator's):
an officer must not be able to hand out, or take away, the right to approve.
"""
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import Conflict, ProblemDetail
from identity.models import User
from integrations.registry import audit_sink, notifier

ROLE_LABELS = {
    R.SOCIETY_SECRETARY: "Secretary",
    R.SOCIETY_VICE_SECRETARY: "Vice-Secretary",
    R.CULTURAL_SOCIETY: "Member",
}
# Most senior first; also the order the roster is listed in.
ROLE_ORDER = (R.SOCIETY_SECRETARY, R.SOCIETY_VICE_SECRETARY, R.CULTURAL_SOCIETY)


class SocietyMemberSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    display_name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ROLE_ORDER)
    role_label = serializers.CharField()
    can_remove = serializers.BooleanField(help_text="Whether the caller may remove this person.")


class SocietyRosterSerializer(serializers.Serializer):
    members = SocietyMemberSerializer(many=True)
    can_manage = serializers.BooleanField()
    can_appoint_officers = serializers.BooleanField()


class SocietyMemberAddSerializer(serializers.Serializer):
    email = serializers.EmailField(help_text="The person's institutional address.")
    role = serializers.ChoiceField(choices=ROLE_ORDER, default=R.CULTURAL_SOCIETY)


def society_role(user):
    """The Society role a user holds (the most senior, if a row ever carries two)."""
    held = user.global_roles or []
    return next((role for role in ROLE_ORDER if role in held), None)


def _denied(detail):
    return ProblemDetail(code="SOCIETY_MANAGE_DENIED", title="Not permitted",
                         status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _require_manager(ctx):
    if not ctx.has_any(*R.SOCIETY_MANAGERS):
        raise _denied("Only the Cultural Society's Secretary and Vice-Secretary, or the Dean, "
                      "manage the Society's members.")


def _require_appointer(ctx):
    if not ctx.has_any(*R.SOCIETY_OFFICER_APPOINTERS):
        raise _denied("Only the Dean or an administrator appoints or removes the Society's "
                      "Secretary and Vice-Secretary.")


def _roster(ctx):
    can_manage = ctx.has_any(*R.SOCIETY_MANAGERS)
    can_appoint = ctx.has_any(*R.SOCIETY_OFFICER_APPOINTERS)
    rows = []
    # Global roles are held by a handful of people; see UserManager.with_global_role.
    for user in User.objects.filter(is_active=True).exclude(global_roles=[]):
        role = society_role(user)
        if role is None:
            continue
        rows.append({
            "user_id": str(user.id), "display_name": user.display_name, "email": user.email,
            "role": role, "role_label": ROLE_LABELS[role],
            "can_remove": can_appoint or (can_manage and role == R.CULTURAL_SOCIETY),
        })
    rows.sort(key=lambda r: (ROLE_ORDER.index(r["role"]), r["display_name"].lower()))
    return {"members": rows, "can_manage": can_manage, "can_appoint_officers": can_appoint}


def _set_role(user, role):
    """Replace whatever Society role the user holds with `role` (None removes it)."""
    kept = [r for r in (user.global_roles or []) if r not in R.SOCIETY_ROLES]
    user.global_roles = kept + ([role] if role else [])
    user.save(update_fields=["global_roles"])


class SocietyMembersView(APIView):
    @extend_schema(responses=SocietyRosterSerializer,
                   summary="The Cultural Society's officers and members")
    def get(self, request):
        ctx = request.auth_context
        if not ctx.has_any(*R.SOCIETY_ROLES, *R.SOCIETY_OFFICER_APPOINTERS):
            raise _denied("The Society's roster is shown to the Society and the Dean.")
        return Response(_roster(ctx))

    @extend_schema(request=SocietyMemberAddSerializer, responses={201: SocietyRosterSerializer},
                   summary="Add a Society member, or (Dean/admin) appoint an officer")
    def post(self, request):
        ctx = request.auth_context
        _require_manager(ctx)
        data = SocietyMemberAddSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        role = data.validated_data["role"]
        with transaction.atomic():
            user = (User.objects.select_for_update()
                    .filter(email__iexact=data.validated_data["email"], is_active=True).first())
            if user is None:
                raise ProblemDetail(
                    code="SOCIETY_NO_SUCH_ACCOUNT", title="No such account", status_code=422,
                    detail="Nobody has an account with that address.",
                    errors=[{"field": "email", "code": "NOT_FOUND",
                             "message": "Use the address the person signs in with."}])
            before = society_role(user)
            # Touching an officer role, in either direction, is an appointment.
            if role in R.SOCIETY_OFFICERS or before in R.SOCIETY_OFFICERS:
                _require_appointer(ctx)
            if before == role:
                raise Conflict(code="SOCIETY_ALREADY_HELD", title="Already in the Society",
                               detail=f"{user.display_name} is already the Society's "
                                      f"{ROLE_LABELS[role].lower()}.")
            if role in R.SOCIETY_OFFICERS:
                holder = next((u for u in User.objects.with_global_role(role) if u.pk != user.pk),
                              None)
                if holder is not None:
                    raise Conflict(
                        code="SOCIETY_OFFICE_TAKEN", title="That office is held",
                        detail=(f"{holder.display_name} is the Society's {ROLE_LABELS[role]}. "
                                "Remove them first; there is one of each."))
            _set_role(user, role)
            audit_sink().record(actor=ctx, action="society.role_set", target=user,
                                before={"role": before or ""}, after={"role": role})
            notifier().send(
                recipient=user, kind="society.role_set", link="/staff/society",
                subject=f"You are now the Cultural Society's {ROLE_LABELS[role].lower()}"
                if role != R.CULTURAL_SOCIETY else "You were added to the Cultural Society",
                body=(f"{ctx.display_name} made this change. Sign out and in again for it "
                      "to take effect."))
        return Response(_roster(ctx), status=status.HTTP_201_CREATED)


class SocietyMemberView(APIView):
    @extend_schema(request=None, responses={200: SocietyRosterSerializer},
                   summary="Remove someone from the Cultural Society")
    def delete(self, request, user_id):
        ctx = request.auth_context
        _require_manager(ctx)
        with transaction.atomic():
            user = User.objects.select_for_update().filter(pk=user_id).first()
            role = society_role(user) if user else None
            if role is None:
                raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                    detail="That person is not in the Cultural Society.")
            if role in R.SOCIETY_OFFICERS:
                _require_appointer(ctx)
            _set_role(user, None)
            audit_sink().record(actor=ctx, action="society.role_removed", target=user,
                                before={"role": role})
            notifier().send(recipient=user, kind="society.role_removed",
                            subject="You were removed from the Cultural Society",
                            body=f"{ctx.display_name} made this change.")
        return Response(_roster(ctx))
