from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from clubs import services
from clubs.models import Club, JoinRequest, Membership, RoleChange
from clubs.serializers import (
    ClubMembersSerializer, ClubSerializer, HandoverOutSerializer, HandoverRequestSerializer,
    JoinDecisionSerializer, JoinRequestSerializer, JoinRequestsSerializer, MembershipSerializer,
    OfficeBearerHistorySerializer, OfficeBearerTermSerializer, RoleChangeRequestSerializer,
    RoleChangeSerializer,
)
from common import roles as R
from common.errors import Conflict, ProblemDetail
from integrations.registry import audit_sink, notifier


# Nested-path ids are matched as UUIDs at the router, so a typo is a plain 404
# like any other unknown resource (API_Standards §3.3), not a validation error.
UUID_RE = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_REQUEST_ID = OpenApiParameter("request_id", OpenApiTypes.UUID, OpenApiParameter.PATH)


def _not_found(detail):
    return ProblemDetail(code="NOT_FOUND", title="Not found",
                         status_code=status.HTTP_404_NOT_FOUND, detail=detail)


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

    def _require_role_assigner(self, club, *, what):
        """
        404 for a caller with no connection to the club (the queue's existence
        is not theirs to learn), 403 for a member or officer of the club who
        holds the wrong role — the Treasurer explicitly (AGENT_PROMPT §6).
        """
        ctx = self.request.auth_context
        if ctx.has_club_role(club.id, *R.ROLE_ASSIGNERS):
            return
        if ctx.club_role(club.id) is None and not ctx.can_see_individual_records():
            raise _not_found(f"No such {what}, or it is not visible to you.")
        raise ProblemDetail(
            code="CLUBS_ROLE_ASSIGN_DENIED", title="Not permitted",
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only the President or Vice-President of this club may {what}.",
        )

    def perform_create(self, serializer):
        self._require_admin()
        serializer.save()

    def perform_update(self, serializer):
        self._require_admin()
        was_approval = serializer.instance.join_mode != Club.JoinMode.OPEN
        club = serializer.save()
        if was_approval and club.join_mode == Club.JoinMode.OPEN:
            # No queue in an open club: whoever was waiting is in.
            services.settle_pending_on_open(club, actor=self.request.auth_context,
                                            actor_user=self.request.user.record)

    def perform_destroy(self, instance):
        # Soft delete via status (AGENT_PROMPT §4). A hard delete would take the
        # club's past events and attendance with it.
        self._require_admin()
        instance.status = Club.Status.ARCHIVED
        instance.save(update_fields=["status", "updated_at"])

    @extend_schema(responses=ClubMembersSerializer, summary="Members of a club, with their roles")
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
            raise _not_found("No such club roster, or it is not visible to you.")
        memberships = list(club.memberships.filter(ended_at__isnull=True)
                           .select_related("student")
                           .order_by("role", "student__full_name"))
        # A roster is names and PRNs; every read of it is audited, as the
        # attendee list is (PRD §8, B-14).
        audit_sink().record(actor=ctx, action="club.roster.read", target=club,
                            after={"rows": len(memberships)})
        can_assign = ctx.has_club_role(club.id, *R.ROLE_ASSIGNERS)
        body = {
            "club": {"id": str(club.id), "name": club.name, "join_mode": club.join_mode},
            "can_assign_roles": can_assign,
            "results": MembershipSerializer(memberships, many=True,
                                           context={"request": request}).data,
            "recent_changes": RoleChangeSerializer(
                RoleChange.objects.filter(membership__club=club)[:10], many=True).data,
        }
        if can_assign or ctx.can_see_individual_records():
            # The queue count is for the people who can act on it. A plain member
            # does not learn how many people are waiting at the door.
            body["pending_join_requests"] = club.join_requests.filter(
                state=JoinRequest.State.PENDING).count()
        return Response(body)

    # ---- join (PRD §5.2) -------------------------------------------------
    @extend_schema(request=None,
                   responses={201: MembershipSerializer, 202: JoinRequestSerializer},
                   summary="Ask to join a club: immediate for open clubs, queued otherwise")
    @action(detail=True, methods=["post"])
    def join(self, request, pk=None):
        club = self.get_object()
        ctx = request.auth_context
        if not ctx.student_id:
            raise ProblemDetail(code="CLUBS_STUDENTS_ONLY", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only a student may join a club.")
        from identity.models import Student

        if not Student.objects.filter(pk=ctx.student_id).exists():
            # Platform mode: the token names a student this module has not
            # imported yet. Not a permission problem and not a duplicate.
            raise ProblemDetail(code="CLUBS_NOT_A_STUDENT", title="Student record missing",
                                status_code=422,
                                detail="Your student record is not available to this module yet.")
        if club.status == Club.Status.ARCHIVED:
            raise Conflict(code="CLUBS_ARCHIVED", title="Club archived",
                           detail="This club is no longer taking members.")
        if club.memberships.filter(student_id=ctx.student_id, ended_at__isnull=True).exists():
            raise Conflict(code="CLUBS_ALREADY_MEMBER", title="Already a member",
                           detail=f"You are already a member of {club.name}.")

        if club.join_mode == Club.JoinMode.OPEN:
            try:
                with transaction.atomic():
                    self._assert_below_cap(ctx.student_id)
                    membership = Membership.objects.create(
                        club=club, student_id=ctx.student_id, role=R.CLUB_MEMBER)
            except IntegrityError:
                # The partial unique constraint caught a concurrent double-tap.
                raise Conflict(code="CLUBS_ALREADY_MEMBER", title="Already a member",
                               detail=f"You are already a member of {club.name}.")
            services.touch_activity(club, actor=ctx)
            audit_sink().record(actor=ctx, action="club.joined", target=membership,
                                after={"club": club.name, "role": R.CLUB_MEMBER})
            return Response(MembershipSerializer(membership, context={"request": request}).data,
                            status=status.HTTP_201_CREATED)

        try:
            with transaction.atomic():
                # A request that could never be accepted must not sit in the queue.
                self._assert_below_cap(ctx.student_id)
                join_request = JoinRequest.objects.create(club=club, student_id=ctx.student_id)
        except IntegrityError:
            raise Conflict(code="CLUBS_JOIN_PENDING", title="Request already pending",
                           detail=f"Your request to join {club.name} is waiting for a decision.")
        audit_sink().record(actor=ctx, action="club.join_requested", target=join_request,
                            after={"club": club.name})
        self._notify_assigners(
            club, f"{ctx.display_name} asked to join {club.name}",
            "Accept or decline the request from the club roster.", "club.join_requested")
        return Response(JoinRequestSerializer(join_request).data,
                        status=status.HTTP_202_ACCEPTED)

    def _assert_below_cap(self, student_id):
        if services.at_membership_cap(student_id):
            limit = settings.MAX_CLUB_MEMBERSHIPS
            raise Conflict(code="CLUBS_MEMBERSHIP_LIMIT", title="Club limit reached",
                           detail=f"You can be a member of up to {limit} clubs. "
                                  "Leave one to join another.")

    @extend_schema(request=None, responses={204: None},
                   summary="Leave a club (the member themself; office bearers hand over first)")
    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        club = self.get_object()
        ctx = request.auth_context
        membership = club.memberships.filter(
            student_id=ctx.student_id or None, ended_at__isnull=True).first()
        if membership is None:
            raise _not_found(f"You are not a member of {club.name}.")
        role = services.effective_role(membership)
        if role in services.OFFICE_BEARER_ROLES:
            raise Conflict(
                code="CLUBS_OFFICE_BEARER_CANNOT_LEAVE", title="Office bearers cannot leave",
                detail=(f"You are {Membership(role=role).get_role_display()} of {club.name}. "
                        "Hand the office over before leaving."),
            )
        membership.ended_at = timezone.now()
        membership.save(update_fields=["ended_at", "updated_at"])
        audit_sink().record(actor=ctx, action="club.left", target=membership,
                            before={"role": membership.role}, after={"club": club.name})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        parameters=[OpenApiParameter("state", OpenApiTypes.STR, OpenApiParameter.QUERY,
                                     enum=[*JoinRequest.State.values, "all"],
                                     description="Default `pending`; `all` for every state.")],
        responses=JoinRequestsSerializer,
        summary="Pending join requests (President or Vice-President only)",
    )
    @action(detail=True, methods=["get"], url_path="join-requests")
    def join_requests(self, request, pk=None):
        club = self.get_object()
        self._require_role_assigner(club, what="read the join queue")
        qs = club.join_requests.select_related("student", "decided_by")
        state = request.query_params.get("state", JoinRequest.State.PENDING)
        if state != "all":
            qs = qs.filter(state=state)
        return Response({
            "club": {"id": str(club.id), "name": club.name, "join_mode": club.join_mode},
            "results": JoinRequestSerializer(qs, many=True).data,
        })

    @extend_schema(request=JoinDecisionSerializer, responses=JoinRequestSerializer,
                   parameters=[_REQUEST_ID], summary="Accept a join request")
    @action(detail=True, methods=["post"], url_path=rf"join-requests/(?P<request_id>{UUID_RE})/accept")
    def accept_join_request(self, request, pk=None, request_id=None):
        return self._decide_join(request, request_id, JoinRequest.State.ACCEPTED)

    @extend_schema(request=JoinDecisionSerializer, responses=JoinRequestSerializer,
                   parameters=[_REQUEST_ID], summary="Decline a join request")
    @action(detail=True, methods=["post"], url_path=rf"join-requests/(?P<request_id>{UUID_RE})/decline")
    def decline_join_request(self, request, pk=None, request_id=None):
        return self._decide_join(request, request_id, JoinRequest.State.DECLINED)

    def _decide_join(self, request, request_id, outcome):
        club = self.get_object()
        self._require_role_assigner(club, what="decide join requests")
        ctx = request.auth_context
        data = JoinDecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        note = data.validated_data.get("note", "")

        with transaction.atomic():
            # `of=("self",)`: lock the request row only, not the joined student
            # and user rows — a concurrent login writing last_login must not
            # queue behind an accept.
            join_request = (JoinRequest.objects.select_for_update(of=("self",))
                            .select_related("student__user", "club")
                            .filter(pk=request_id, club=club).first())
            if join_request is None:
                raise _not_found("No such join request.")
            if join_request.state != JoinRequest.State.PENDING:
                raise Conflict(code="CLUBS_JOIN_ALREADY_DECIDED", title="Already decided",
                               detail=f"This request was {join_request.get_state_display().lower()}.")
            membership = services.settle_join_request(
                join_request, outcome=outcome, actor_user=request.user.record, note=note)
            if membership is not None:
                services.touch_activity(club, actor=ctx)

        audit_sink().record(actor=ctx, action=f"club.join_{outcome}", target=join_request,
                            before={"state": JoinRequest.State.PENDING},
                            after={"state": outcome, "membership": str(membership.id)
                                   if membership else None},
                            reason=join_request.note)
        services.notify_join_decision(join_request)
        return Response(JoinRequestSerializer(join_request).data)

    def _notify_assigners(self, club, subject, body, kind):
        # Recipients come from the terms, not Membership.role: after a dated
        # handover takes effect the new President must hear this, not the old.
        for membership in services.current_office_bearers(club, R.ROLE_ASSIGNERS):
            user = getattr(membership.student, "user", None)
            if user is not None:
                notifier().send(recipient=user, subject=subject, body=body, kind=kind,
                                link=f"/club/{club.id}/members")

    # ---- office bearers (PRD §5.3, §5.18) ----------------------------------
    @extend_schema(request=HandoverRequestSerializer, responses={201: HandoverOutSerializer},
                   summary="Hand the club's offices over (President or Vice-President only)")
    @action(detail=True, methods=["post"])
    def handover(self, request, pk=None):
        club = self.get_object()
        self._require_role_assigner(club, what="run a handover")
        ctx = request.auth_context
        data = HandoverRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        created = services.handover(
            club, actor=ctx, actor_user=request.user.record,
            effective_at=data.validated_data["effective_at"],
            assignments=data.validated_data["assignments"],
        )
        return Response({
            "club": {"id": str(club.id), "name": club.name},
            "effective_at": data.validated_data["effective_at"],
            "terms": OfficeBearerTermSerializer(created, many=True).data,
        }, status=status.HTTP_201_CREATED)

    @extend_schema(responses=OfficeBearerHistorySerializer, summary="Who held which office, when")
    @action(detail=True, methods=["get"], url_path="office-bearers/history")
    def office_bearer_history(self, request, pk=None):
        club = self.get_object()
        ctx = request.auth_context
        allowed = (ctx.is_dean() or ctx.is_admin()
                   or ctx.has_club_role(club.id, *services.OFFICE_BEARER_ROLES))
        if not allowed:
            raise _not_found("No such history, or it is not visible to you.")
        terms = services.office_bearer_history(club)
        now = timezone.now()
        return Response({
            "club": {"id": str(club.id), "name": club.name},
            "current": OfficeBearerTermSerializer(
                [t for t in terms if t.is_current(now)], many=True).data,
            "results": OfficeBearerTermSerializer(terms, many=True).data,
        })


class MembershipViewSet(viewsets.GenericViewSet):
    serializer_class = MembershipSerializer
    # Schema hint only: drf-spectacular types the `id` path parameter from the
    # model. Every request goes through get_queryset(), which scopes it.
    queryset = Membership.objects.none()

    def get_queryset(self):
        ctx = self.request.auth_context
        qs = Membership.objects.select_related("student", "club").filter(ended_at__isnull=True)
        if ctx.can_see_individual_records():
            return qs
        # A caller sees memberships of clubs they belong to, and their own.
        visible_clubs = ctx.scopes_for(*R.CLUB_ROLES)
        return qs.filter(club_id__in=visible_clubs) if visible_clubs else qs.none()

    @extend_schema(request=RoleChangeRequestSerializer, responses=MembershipSerializer,
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
            raise _not_found("No such membership, or it is not visible to you.")
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
            # A direct assignment supersedes any term calendar for this pair:
            # close whatever term is current and open one for the new role, so
            # the token derivation and the history both agree with the row.
            now = timezone.now()
            for term in services.current_terms(locked.club_id, locked.student_id, now):
                term.ends_at = now
                term.save(update_fields=["ends_at", "updated_at"])
            if new_role in services.OFFICE_BEARER_ROLES:
                services.OfficeBearerTerm.objects.create(
                    club_id=locked.club_id, student_id=locked.student_id, role=new_role,
                    starts_at=now, created_by=request.user.record)
            services.touch_activity(locked.club_id, now, actor=ctx)
        audit_sink().record(actor=ctx, action="club.role_changed", target=membership,
                            before={"role": old_role}, after={"role": new_role},
                            reason=data.validated_data.get("reason", ""))
        return Response(MembershipSerializer(membership, context={"request": request}).data)
