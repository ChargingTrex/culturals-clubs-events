from decimal import Decimal, InvalidOperation

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import ProblemDetail
from governance import services
from governance.models import (
    ApprovalRequest, ApprovalStage, ApprovalState, ApprovalStep, AuditEntry, Decision,
    Notification,
)


class ApprovalStepSerializer(serializers.ModelSerializer):
    stage_label = serializers.CharField(source="get_stage_display", read_only=True)

    class Meta:
        model = ApprovalStep
        fields = ("id", "stage", "stage_label", "decision", "comment", "actor_label",
                  "actor_role", "mfa_verified", "amount_sanctioned", "created_at")


class ApprovalRequestSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    club = serializers.CharField(source="event.club.name", read_only=True)
    club_id = serializers.UUIDField(source="event.club_id", read_only=True)
    venue = serializers.CharField(source="event.venue.name", read_only=True)
    starts_at = serializers.DateTimeField(source="event.starts_at", read_only=True)
    ends_at = serializers.DateTimeField(source="event.ends_at", read_only=True)
    expected_attendance = serializers.IntegerField(source="event.expected_attendance",
                                                   read_only=True)
    stage_label = serializers.CharField(source="get_current_stage_display", read_only=True)
    steps = ApprovalStepSerializer(many=True, read_only=True)
    lines = serializers.SerializerMethodField()
    clashes = serializers.SerializerMethodField()
    my_stage = serializers.SerializerMethodField()
    requires_mfa = serializers.SerializerMethodField()
    nil_declaration = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
        fields = ("id", "event", "event_title", "club", "club_id", "venue", "starts_at",
                  "ends_at", "expected_attendance", "stages", "current_stage", "stage_label",
                  "state", "amount_requested", "requires_vc", "vc_reason", "steps", "lines",
                  "clashes", "my_stage", "requires_mfa", "nil_declaration", "created_at")

    def get_lines(self, request_obj):
        budget = getattr(request_obj.event, "budget", None)
        if budget is None:
            return []
        return [
            {"id": str(line.id), "head": line.head,
             "amount_requested": str(line.amount_requested),
             "amount_sanctioned": (str(line.amount_sanctioned)
                                   if line.amount_sanctioned is not None else None)}
            for line in budget.lines.all()
        ]

    def get_nil_declaration(self, request_obj):
        """
        An approver must be able to tell "this costs nothing" from "nobody priced it".
        A blank line table cannot say which, so the declaration travels with the
        request and the queue renders it where the figures would be.
        """
        budget = getattr(request_obj.event, "budget", None)
        if budget is None or not budget.is_nil:
            return None
        return {
            "head": "No budget required",
            "reason": budget.nil_reason,
            "declared_by": budget.nil_declared_by_label,
            "declared_at": budget.nil_declared_at,
        }

    def get_clashes(self, request_obj):
        """
        Surfaced on the approval card, because Event_Flows requires the clash to
        be resolved under Venues *before* approving — the approver needs to see it
        without navigating away.
        """
        from events.services import clashes_for

        return [
            {"id": str(e.id), "title": e.title, "club": e.club.name,
             "starts_at": e.starts_at, "ends_at": e.ends_at,
             "expected_attendance": e.expected_attendance}
            for e in clashes_for(request_obj.event)
        ]

    def get_my_stage(self, request_obj):
        ctx = self.context["request"].auth_context
        return ctx.has_any(R.STAGE_ROLE.get(request_obj.current_stage, "__none__"))

    def get_requires_mfa(self, request_obj):
        return services.requires_mfa(request_obj, request_obj.current_stage)


class DecideSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=[c[0] for c in Decision.choices])
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    # {budget_line_id: amount}. Dean stage only; a later gate approves or returns
    # the amount the Dean set rather than re-cutting it.
    sanctioned = serializers.DictField(required=False, default=dict)


class ApprovalViewSet(viewsets.GenericViewSet):
    serializer_class = ApprovalRequestSerializer

    def get_queryset(self):
        """
        Approval requests a caller may see.

        An approver sees requests at any stage of the events they oversee; a club
        officer sees their own club's. Nobody else sees any — a pending proposal
        carries a budget figure.
        """
        ctx = self.request.auth_context
        qs = (ApprovalRequest.objects
              .select_related("event__club", "event__venue", "event__budget")
              .prefetch_related("steps", "event__budget__lines"))
        if ctx.can_see_all_clubs():
            pass
        else:
            clubs = ctx.scopes_for(*R.CLUB_ROLES)
            qs = qs.filter(event__club_id__in=clubs) if clubs else qs.none()
        if state := self.request.query_params.get("state"):
            qs = qs.filter(state=state)
        if stage := self.request.query_params.get("stage"):
            qs = qs.filter(current_stage=stage)
        return qs.order_by("event__starts_at")

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(
            ApprovalRequestSerializer(page, many=True, context={"request": request}).data)

    def retrieve(self, request, pk=None):
        obj = self.get_queryset().filter(pk=pk).first()
        if obj is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such approval request, or it is not visible to you.")
        return Response(ApprovalRequestSerializer(obj, context={"request": request}).data)

    @extend_schema(summary="Your approval queue — only the stages you hold")
    @action(detail=False, methods=["get"])
    def queue(self, request):
        pending = services.pending_for(request.auth_context)
        return Response({
            "stages_you_hold": [s for s, role in R.STAGE_ROLE.items()
                                if request.auth_context.has_any(role)],
            "count": pending.count(),
            "results": ApprovalRequestSerializer(pending, many=True,
                                                 context={"request": request}).data,
        })

    @extend_schema(request=DecideSerializer, summary="Approve, return or reject")
    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        obj = self.get_queryset().filter(pk=pk).first()
        if obj is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such approval request, or it is not visible to you.")
        data = DecideSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        decision = data.validated_data["decision"]

        # An approval cannot be granted over an unresolved venue clash. The Dean
        # moves one event first; approving both would put two clubs in one hall.
        if decision == Decision.APPROVE:
            from events.services import clashes_for

            clashing = clashes_for(obj.event)
            if clashing:
                raise ProblemDetail(
                    code="GOVERNANCE_CLASH_UNRESOLVED", title="Venue clash unresolved",
                    status_code=409,
                    detail=(f"“{obj.event.title}” overlaps "
                            f"{', '.join(e.title for e in clashing)} in "
                            f"{obj.event.venue.name}. Move one of them first."),
                )

        sanctioned = {}
        for line_id, raw in (data.validated_data.get("sanctioned") or {}).items():
            try:
                sanctioned[line_id] = Decimal(str(raw))
            except (InvalidOperation, TypeError):
                raise ProblemDetail(code="BUDGET_SANCTION_UNREADABLE",
                                    title="Unreadable amount", status_code=422,
                                    detail=f"{raw!r} is not an amount.")

        step = services.decide(
            obj, ctx=request.auth_context, decision=decision,
            comment=data.validated_data.get("comment", ""), sanctioned_lines=sanctioned,
            actor_user=request.user.record,
        )
        obj.refresh_from_db()
        return Response({
            "step": ApprovalStepSerializer(step).data,
            "request": ApprovalRequestSerializer(obj, context={"request": request}).data,
        })


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "subject", "body", "kind", "link", "read_at", "created_at")


class NotificationViewSet(viewsets.GenericViewSet):
    """
    In-app notifications for the caller only. Email copies go out through the same
    adapter call; no third channel exists.
    """

    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user_id=self.request.auth_context.sub)

    def list(self, request):
        qs = self.get_queryset()
        if request.query_params.get("unread") in ("1", "true"):
            qs = qs.filter(read_at__isnull=True)
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(NotificationSerializer(page, many=True).data)

    @extend_schema(summary="Unread count for the bell")
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @extend_schema(summary="Mark all as read")
    @action(detail=False, methods=["post"], url_path="mark-read")
    def mark_read(self, request):
        updated = self.get_queryset().filter(read_at__isnull=True).update(
            read_at=timezone.now())
        return Response({"marked": updated})


class AuditView(APIView):
    """
    Read-only audit trail. Append-only by construction: nothing in the API writes
    to it except the adapter, and nothing anywhere updates or deletes an entry.
    """

    def get(self, request):
        ctx = request.auth_context
        if not ctx.has_any(R.DEAN, R.ADMIN, R.VICE_CHANCELLOR):
            raise ProblemDetail(code="GOVERNANCE_AUDIT_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="The audit trail is available to the Dean and administrators.")
        qs = AuditEntry.objects.all()
        if target := request.query_params.get("target_id"):
            qs = qs.filter(target_id=target)
        if action_name := request.query_params.get("action"):
            qs = qs.filter(action=action_name)
        return Response({"results": [
            {"id": str(e.id), "actor": e.actor_label, "action": e.action,
             "target_type": e.target_type, "target_id": e.target_id, "before": e.before,
             "after": e.after, "reason": e.reason, "created_at": e.created_at}
            for e in qs[:200]
        ]})
