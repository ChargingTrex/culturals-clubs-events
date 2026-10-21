from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from clubs.models import Club, Membership, RoleChange
from clubs.serializers import (
    ClubSerializer, MembershipSerializer, RoleChangeRequestSerializer, RoleChangeSerializer,
)
from common import roles as R
from common.errors import Conflict, ProblemDetail
from integrations.registry import audit_sink


class ClubViewSet(viewsets.ModelViewSet):
    serializer_class = ClubSerializer
    queryset = Club.objects.all()

    def get_queryset(self):
        qs = Club.objects.all()
        if self.request.method in ("GET",):
            return qs
        return qs

    def _require_admin(self):
        if not self.request.auth_context.has_any(R.ADMIN, R.DEAN):
            raise ProblemDetail(code="CLUBS_NOT_PERMITTED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only the Dean or an administrator may change a club record.")

    def perform_create(self, serializer):
        self._require_admin()
        serializer.save()

    def perform_update(self, serializer):
        self._require_admin()
        serializer.save()

    def perform_destroy(self, instance):
        # Soft delete via status (AGENT_PROMPT §4). A hard delete would take the
        # club's past events and attendance with it.
        self._require_admin()
        instance.status = Club.Status.ARCHIVED
        instance.save(update_fields=["status", "updated_at"])

    @extend_schema(summary="Members of a club, with their roles")
    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        club = self.get_object()
        ctx = request.auth_context
        # Roster is visible to members of the club, and to the staff allowed to
        # see identifiable students. The Vice-Chancellor is NOT among them: a
        # roster is names and PRNs, and Management gets aggregates only.
        # A caller with no connection sees 404, not 403 — a 403 would confirm the
        # roster exists (API_Standards §3.3).
        if not (ctx.can_see_individual_records() or ctx.club_role(club.id)):
            raise ProblemDetail(code="NOT_FOUND", title="Not found",
                                status_code=status.HTTP_404_NOT_FOUND,
                                detail="No such club roster, or it is not visible to you.")
        memberships = (club.memberships.filter(ended_at__isnull=True)
                       .select_related("student")
                       .order_by("role", "student__full_name"))
        return Response({
            "club": {"id": str(club.id), "name": club.name},
            "can_assign_roles": ctx.has_club_role(club.id, *R.ROLE_ASSIGNERS),
            "results": MembershipSerializer(memberships, many=True,
                                           context={"request": request}).data,
            "recent_changes": RoleChangeSerializer(
                RoleChange.objects.filter(membership__club=club)[:10], many=True).data,
        })


class MembershipViewSet(viewsets.GenericViewSet):
    serializer_class = MembershipSerializer

    def get_queryset(self):
        ctx = self.request.auth_context
        qs = Membership.objects.select_related("student", "club").filter(ended_at__isnull=True)
        if ctx.can_see_individual_records():
            return qs
        # A caller sees memberships of clubs they belong to, and their own.
        visible_clubs = ctx.scopes_for(*R.CLUB_ROLES)
        return qs.filter(club_id__in=visible_clubs) if visible_clubs else qs.none()

    @extend_schema(request=RoleChangeRequestSerializer,
                   summary="Assign a club role (President or Vice-President only)")
    @action(detail=True, methods=["post"], url_path="role")
    def set_role(self, request, pk=None):
        """
        AGENT_PROMPT §6: only President and Vice-President may assign roles, and
        the Treasurer explicitly may not. The check happens here, on save — the
        frontend also hides the control, but hiding a control is not a permission.
        """
        membership = self.get_queryset().filter(pk=pk).first()
        if membership is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found",
                                status_code=status.HTTP_404_NOT_FOUND,
                                detail="No such membership, or it is not visible to you.")
        ctx = request.auth_context
        if not ctx.has_club_role(membership.club_id, *R.ROLE_ASSIGNERS):
            raise ProblemDetail(
                code="CLUBS_ROLE_ASSIGN_DENIED", title="Not permitted",
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the President or Vice-President of this club may assign roles.",
            )
        data = RoleChangeRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        new_role = data.validated_data["role"]
        old_role = membership.role
        if new_role == old_role:
            return Response(MembershipSerializer(membership, context={"request": request}).data)

        with transaction.atomic():
            locked = Membership.objects.select_for_update().get(pk=membership.pk)
            if new_role == R.CLUB_PRESIDENT:
                # The one-president constraint would raise IntegrityError here.
                # Catching it as a 409 with a usable message is better than a 500,
                # and the constraint still does the enforcing.
                existing = Membership.objects.filter(
                    club=locked.club, role=R.CLUB_PRESIDENT, ended_at__isnull=True
                ).exclude(pk=locked.pk).first()
                if existing:
                    raise Conflict(
                        code="CLUBS_PRESIDENT_EXISTS", title="A president is already in post",
                        detail=("Step the current president down to another role first. "
                                "Two presidents means two people hold the role that assigns roles."),
                    )
            locked.role = new_role
            locked.save(update_fields=["role", "updated_at"])
            RoleChange.objects.create(
                membership=locked, actor_sub=ctx.sub, actor_label=ctx.display_name,
                from_role=old_role, to_role=new_role,
                reason=data.validated_data.get("reason", ""),
            )
        audit_sink().record(actor=ctx, action="club.role_changed", target=membership,
                            before={"role": old_role}, after={"role": new_role},
                            reason=data.validated_data.get("reason", ""))
        return Response(MembershipSerializer(membership, context={"request": request}).data)
