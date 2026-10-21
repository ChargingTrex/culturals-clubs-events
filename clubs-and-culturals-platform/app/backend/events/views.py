from django.db import transaction
from django.db.models import Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from budget.models import BudgetTemplate
from budget.services import create_lines, ensure_budget, seed_from_template
from common import roles as R
from common.errors import ProblemDetail
from events.models import SLOT_HOLDING, Event, EventStatus, Venue
from events.serializers import (
    CloseEventSerializer, EventCreateSerializer, EventSerializer, ReassignRequestSerializer,
    VenueReassignmentSerializer, VenueSerializer,
)
from events.services import (
    all_clashes, assert_bookable, clashes_for, close_event, free_venues_for, reassign_venue,
)
from governance import services as governance
from integrations.registry import audit_sink
from participation.models import Registration


PUBLIC_STATUSES = (EventStatus.PUBLISHED, EventStatus.LIVE, EventStatus.COMPLETED,
                   EventStatus.REPORTED)


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer

    def get_serializer_class(self):
        return EventCreateSerializer if self.action == "create" else EventSerializer

    def get_queryset(self):
        """
        What each role can see, expressed as a queryset.

        Row-level scoping lives here rather than in a per-object check, so an
        object outside a caller's scope is a 404 by construction — there is no
        code path that fetches it and then decides (API_Standards §3.3).
        """
        ctx = self.request.auth_context
        base = (Event.objects
                .select_related("club", "venue", "budget")
                .prefetch_related("budget__lines",
                                  Prefetch("registrations",
                                           queryset=Registration.objects.filter(
                                               cancelled_at__isnull=True))))
        if ctx.can_see_all_clubs():
            qs = base
        else:
            # A student sees what is published; a club officer additionally sees
            # their own club's drafts and rejected proposals.
            from django.db.models import Q

            visible = Q(status__in=PUBLIC_STATUSES)
            club_scopes = ctx.scopes_for(*R.CLUB_ROLES)
            if club_scopes:
                visible |= Q(club_id__in=club_scopes)
            organiser_events = ctx.organiser_events()
            if organiser_events:
                visible |= Q(id__in=organiser_events)
            qs = base.filter(visible)

        params = self.request.query_params
        if club := params.get("club"):
            qs = qs.filter(club_id=club)
        if state := params.get("status"):
            qs = qs.filter(status__in=state.split(","))
        if after := params.get("starts_at_after"):
            qs = qs.filter(starts_at__gte=after)
        if before := params.get("starts_at_before"):
            qs = qs.filter(starts_at__lte=before)
        ordering = params.get("ordering", "starts_at")
        return qs.order_by(ordering).distinct()

    # ---- creation ------------------------------------------------------
    @extend_schema(request=EventCreateSerializer, responses=EventSerializer,
                   summary="Propose an event and send it for approval")
    def create(self, request, *args, **kwargs):
        data = EventCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        payload = data.validated_data
        ctx = request.auth_context
        club = payload["club"]

        # Only the roles that may propose, for that club. A member cannot, and
        # neither can a president of a different club.
        if not ctx.has_club_role(club.id, *R.PROPOSERS):
            raise ProblemDetail(
                code="EVENTS_PROPOSE_DENIED", title="Not permitted",
                status_code=status.HTTP_403_FORBIDDEN,
                detail=("Only the President, Vice-President or Secretary of this club "
                        "may submit a proposal."),
            )

        soft = assert_bookable(venue_id=payload["venue"].id, starts_at=payload["starts_at"],
                              ends_at=payload["ends_at"])

        with transaction.atomic():
            event = Event.objects.create(
                title=payload["title"], club=club, kind=payload["kind"],
                description=payload.get("description", ""), venue=payload["venue"],
                starts_at=payload["starts_at"], ends_at=payload["ends_at"],
                capacity=payload["capacity"],
                expected_attendance=payload["expected_attendance"],
                fest=payload.get("fest"), status=EventStatus.DRAFT,
                created_by=request.user.record,
            )
            template_name = payload.get("budget_template")
            if template_name:
                template = BudgetTemplate.objects.filter(name__iexact=template_name).first()
                if template is None:
                    raise ProblemDetail(code="BUDGET_UNKNOWN_TEMPLATE",
                                        title="Unknown budget template", status_code=422,
                                        detail=f"No budget template named {template_name!r}.")
                seed_from_template(event, template)
            elif payload.get("budget_lines"):
                create_lines(event, payload["budget_lines"])
            else:
                # A shell, so the Treasurer has something to add lines to. Creating
                # the event and pricing it are separate steps on purpose.
                ensure_budget(event)

            request_obj = None
            if payload.get("submit", True):
                request_obj = governance.submit(event, actor=ctx, actor_user=request.user.record)

        audit_sink().record(actor=ctx, action="event.created", target=event,
                            after={"title": event.title, "venue": event.venue.name})
        body = EventSerializer(event, context={"request": request}).data
        body["soft_clashes"] = [
            {"id": str(e.id), "title": e.title, "club": e.club.name}
            for e in soft
        ]
        body["approval"] = (
            {"id": str(request_obj.id), "stages": request_obj.stages,
             "current_stage": request_obj.current_stage,
             "requires_vc": request_obj.requires_vc, "vc_reason": request_obj.vc_reason}
            if request_obj else None
        )
        return Response(body, status=status.HTTP_201_CREATED,
                        headers={"Location": f"/api/v1/events/{event.id}"})

    def perform_update(self, serializer):
        event = self.get_object()
        ctx = self.request.auth_context
        if not ctx.has_club_role(event.club_id, *R.PROPOSERS):
            raise ProblemDetail(code="EVENTS_EDIT_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only the club's office bearers may edit this proposal.")
        # A submitted proposal is with an approver; editing under them would mean
        # they approve something other than what they read.
        if event.status not in (EventStatus.DRAFT, EventStatus.RETURNED):
            raise ProblemDetail(
                code="EVENTS_LOCKED", title="Cannot edit now", status_code=409,
                detail=(f"“{event.title}” is {event.get_status_display().lower()}. "
                        "Only a draft or a returned proposal can be edited."),
            )
        serializer.save()

    # ---- actions -------------------------------------------------------
    @extend_schema(summary="Submit or resubmit a proposal for approval")
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        event = self.get_object()
        ctx = request.auth_context
        if not ctx.has_club_role(event.club_id, *R.PROPOSERS):
            raise ProblemDetail(code="EVENTS_PROPOSE_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only the club's office bearers may submit this proposal.")
        approval = governance.submit(event, actor=ctx, actor_user=request.user.record)
        return Response({"id": str(approval.id), "stages": approval.stages,
                         "current_stage": approval.current_stage,
                         "requires_vc": approval.requires_vc,
                         "vc_reason": approval.vc_reason})

    @extend_schema(request=CloseEventSerializer, summary="Close an event with its evidence")
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        event = self.get_object()
        ctx = request.auth_context
        allowed = (ctx.has_club_role(event.club_id, *R.EVENT_OPERATORS)
                   or str(event.id) in ctx.organiser_events()
                   or ctx.is_dean())
        if not allowed:
            raise ProblemDetail(code="EVENTS_CLOSE_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only the organiser or the club's office bearers may close this event.")
        data = CloseEventSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        close_event(event, photo_count=data.validated_data["photo_count"],
                    social_links=data.validated_data.get("social_links", []), actor=ctx)
        audit_sink().record(actor=ctx, action="event.closed", target=event,
                            after={"photo_count": event.photo_count,
                                   "attended": event.attended_count()})
        return Response(EventSerializer(event, context={"request": request}).data)

    @extend_schema(summary="Mark an event live so the scan station can open")
    @action(detail=True, methods=["post"], url_path="go-live")
    def go_live(self, request, pk=None):
        event = self.get_object()
        ctx = request.auth_context
        if not (ctx.has_club_role(event.club_id, *R.EVENT_OPERATORS) or ctx.is_dean()):
            raise ProblemDetail(code="EVENTS_GO_LIVE_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only the club's office bearers may open this event.")
        if event.status != EventStatus.PUBLISHED:
            raise ProblemDetail(code="EVENTS_NOT_PUBLISHED", title="Not published",
                                status_code=409,
                                detail="Only a published event can go live.")
        event.status = EventStatus.LIVE
        event.save(update_fields=["status", "updated_at"])
        return Response(EventSerializer(event, context={"request": request}).data)

    @extend_schema(summary="Clashes and free alternatives for this event")
    @action(detail=True, methods=["get"])
    def clashes(self, request, pk=None):
        event = self.get_object()
        return Response({
            "clashes": [
                {"id": str(e.id), "title": e.title, "club": e.club.name,
                 "starts_at": e.starts_at, "ends_at": e.ends_at, "status": e.status,
                 "expected_attendance": e.expected_attendance}
                for e in clashes_for(event)
            ],
            "free_venues": VenueSerializer(free_venues_for(event), many=True).data,
        })

    @extend_schema(request=ReassignRequestSerializer,
                   summary="Move an event to another venue (Dean only)")
    @action(detail=True, methods=["post"])
    def reassign(self, request, pk=None):
        event = self.get_object()
        ctx = request.auth_context
        # Venue precedence when two events clash is an open question
        # (AGENT_PROMPT §9), so the system does not decide: it surfaces the clash
        # and the Dean moves one, with a reason the club is shown.
        if not ctx.is_dean():
            raise ProblemDetail(code="EVENTS_REASSIGN_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only the Dean may move an event to another venue.")
        data = ReassignRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        venue = Venue.objects.filter(pk=data.validated_data["to_venue"]).first()
        if venue is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such venue.")
        from_name = event.venue.name
        reassign_venue(event, to_venue=venue, reason=data.validated_data["reason"], actor=ctx)
        governance._notify_club(
            event, f"“{event.title}” was moved to {venue.name}",
            f"Moved from {from_name}. Reason: {data.validated_data['reason']}",
            "event.venue_changed")
        audit_sink().record(actor=ctx, action="event.venue_reassigned", target=event,
                            before={"venue": from_name}, after={"venue": venue.name},
                            reason=data.validated_data["reason"])
        return Response(VenueReassignmentSerializer(event.reassignments.first()).data)


class VenueViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VenueSerializer
    queryset = Venue.objects.filter(active=True)


class VenueCalendarView(APIView):
    """
    The master calendar: every venue, every booking, clashes flagged.

    Restricted to staff. A student does not need to see which club is pitching
    for Friday evening, and a pending proposal is not public information.
    """

    def get(self, request):
        ctx = request.auth_context
        if not ctx.can_see_all_clubs():
            raise ProblemDetail(code="EVENTS_CALENDAR_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="The venue calendar is available to staff.")
        events = (Event.objects.filter(status__in=SLOT_HOLDING)
                  .select_related("club", "venue").order_by("starts_at"))
        if day := request.query_params.get("date"):
            events = events.filter(starts_at__date=day)
        clash_ids = set()
        pairs = []
        for a, b in all_clashes():
            clash_ids.update({str(a.id), str(b.id)})
            pairs.append({
                "venue": a.venue.name,
                "events": [
                    {"id": str(e.id), "title": e.title, "club": e.club.name,
                     "starts_at": e.starts_at, "ends_at": e.ends_at,
                     "expected_attendance": e.expected_attendance, "status": e.status}
                    for e in (a, b)
                ],
            })
        return Response({
            "buffer_minutes": request.query_params.get("buffer") or None,
            "venues": VenueSerializer(Venue.objects.filter(active=True), many=True).data,
            "bookings": [
                {"id": str(e.id), "title": e.title, "club": e.club.name,
                 "venue": str(e.venue_id), "venue_name": e.venue.name,
                 "starts_at": e.starts_at, "ends_at": e.ends_at, "status": e.status,
                 "confirmed": e.status != EventStatus.SUBMITTED,
                 "clash": str(e.id) in clash_ids}
                for e in events
            ],
            "clashes": pairs,
        })
