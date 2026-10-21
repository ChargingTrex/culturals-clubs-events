"""
Student-side registration and passes, and the organiser-side door.

Door access is enforced by IsEventOrganiser (permissions.py), which also refuses a
scan-station token bound to a different event — binding that does not restrict is
decoration.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import ProblemDetail
from events.models import Event, EventStatus
from identity.models import Student
from integrations.registry import audit_sink
from participation import services
from participation.models import Registration, ScanRecord, ScanResult
from participation.permissions import IsEventOrganiser
from qrkit import qr as qrimage


# --------------------------------------------------------------------------
# Serializers
# --------------------------------------------------------------------------
class RegistrationSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    pass_token = serializers.SerializerMethodField()

    class Meta:
        model = Registration
        fields = ("id", "event", "event_title", "source", "attended", "checked_in_at",
                  "cancelled_at", "pass_token", "registered_at")

    def get_pass_token(self, registration):
        """
        A pass token is a working credential, so it goes only to the person it
        belongs to. An organiser reading an attendee list gets identities, never a
        pass they could present on someone else's behalf.
        """
        ctx = self.context["request"].auth_context
        if str(registration.student_id) != str(ctx.student_id):
            return None
        live = services.live_pass(registration)
        return live.token if live else None


class AttendeeSerializer(serializers.ModelSerializer):
    prn = serializers.CharField(source="student.prn", read_only=True)
    full_name = serializers.CharField(source="student.full_name", read_only=True)
    department = serializers.CharField(source="department_at_event", read_only=True)
    programme = serializers.CharField(source="programme_at_event", read_only=True)
    year = serializers.IntegerField(source="year_at_event", read_only=True)

    class Meta:
        model = Registration
        fields = ("id", "prn", "full_name", "department", "programme", "year", "source",
                  "attended", "checked_in_at", "station_id")


class ScanRequestSerializer(serializers.Serializer):
    token = serializers.CharField()
    station_id = serializers.CharField(required=False, allow_blank=True, default="")
    scanned_at = serializers.DateTimeField(required=False)


class OfflineBatchSerializer(serializers.Serializer):
    station_id = serializers.CharField(required=False, allow_blank=True, default="")
    scans = serializers.ListField(child=serializers.DictField())


class ManualCheckInSerializer(serializers.Serializer):
    student_id = serializers.UUIDField(required=False)
    prn = serializers.CharField(required=False, allow_blank=True)
    station_id = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if not attrs.get("student_id") and not attrs.get("prn"):
            raise serializers.ValidationError("Give either a student_id or a PRN.")
        return attrs


def _outcome_body(outcome):
    student = outcome.student
    return {
        "result": outcome.result,
        "result_label": ScanResult(outcome.result).label,
        "verdict": outcome.verdict,
        "tone": outcome.tone,
        "accepted": outcome.accepted,
        "detail": outcome.detail,
        "student": ({"prn": student.prn, "full_name": student.full_name,
                     "department": student.department, "programme": student.programme,
                     "year": student.year_of_study} if student else None),
        "registration_id": str(outcome.registration.id) if outcome.registration else None,
    }


def _get_event_or_404(event_id):
    event = Event.objects.select_related("club", "venue").filter(pk=event_id).first()
    if event is None:
        raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                            detail="No such event.")
    return event


# --------------------------------------------------------------------------
# Student-facing
# --------------------------------------------------------------------------
class RegistrationViewSet(viewsets.GenericViewSet):
    serializer_class = RegistrationSerializer

    def get_queryset(self):
        """A student's own registrations only. Nothing else (AGENT_PROMPT §6)."""
        ctx = self.request.auth_context
        if not ctx.student_id:
            return Registration.objects.none()
        return (Registration.objects.filter(student_id=ctx.student_id)
                .select_related("event").prefetch_related("passes")
                .order_by("-event__starts_at"))

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(
            RegistrationSerializer(page, many=True, context={"request": request}).data)

    @extend_schema(summary="Register for a published event")
    def create(self, request):
        ctx = request.auth_context
        if not ctx.student_id:
            raise ProblemDetail(code="PARTICIPATION_NOT_A_STUDENT", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only a student may register for an event.")
        event = _get_event_or_404((request.data or {}).get("event"))
        student = Student.objects.get(pk=ctx.student_id)
        registration = services.register_student(event, student)
        return Response(
            RegistrationSerializer(registration, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Cancel your own registration")
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        registration = self.get_queryset().filter(pk=pk).first()
        if registration is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such registration.")
        services.cancel_registration(registration)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(summary="Reissue your pass, revoking the old one")
    @action(detail=True, methods=["post"], url_path="reissue-pass")
    def reissue_pass(self, request, pk=None):
        registration = self.get_queryset().filter(pk=pk).first()
        if registration is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such registration.")
        event_pass = services.reissue_pass(registration)
        return Response({"token": event_pass.token,
                         "image": qrimage.make_qr_data_uri(event_pass.token)})


class MyPassesView(APIView):
    """The student's wallet: one pass per live registration, plus the profile QR."""

    def get(self, request):
        ctx = request.auth_context
        if not ctx.student_id:
            return Response({"passes": [], "profile_qr": None})
        student = Student.objects.get(pk=ctx.student_id)
        registrations = (Registration.objects
                         .filter(student=student, cancelled_at__isnull=True,
                                 event__status__in=(EventStatus.PUBLISHED, EventStatus.LIVE))
                         .select_related("event__club", "event__venue")
                         .prefetch_related("passes"))
        profile = services.profile_token_for(student)
        out = []
        for registration in registrations:
            live = services.live_pass(registration)
            out.append({
                "registration_id": str(registration.id),
                "event_id": str(registration.event_id),
                "title": registration.event.title,
                "club": registration.event.club.name,
                "venue": registration.event.venue.name,
                "starts_at": registration.event.starts_at,
                "ends_at": registration.event.ends_at,
                "attended": registration.attended,
                "token": live.token if live else None,
                "image": qrimage.make_qr_data_uri(live.token) if live else None,
            })
        return Response({
            "passes": out,
            "profile_qr": {
                "token": profile.token, "version": profile.version,
                # Rendered brighter and larger: it has to scan in a dark hall.
                "image": qrimage.make_qr_data_uri(profile.token, box_size=8),
            },
            "note": ("Your profile QR holds a signed reference, not your PRN. "
                     "A photograph of it reveals nothing about you."),
        })

    @extend_schema(summary="Reissue the profile QR (lost phone)")
    def post(self, request):
        ctx = request.auth_context
        if not ctx.student_id:
            raise ProblemDetail(code="PARTICIPATION_NOT_A_STUDENT", title="Not permitted",
                                status_code=403, detail="Only a student holds a profile QR.")
        student = Student.objects.get(pk=ctx.student_id)
        record = services.reissue_profile_token(student)
        audit_sink().record(actor=ctx, action="profile_qr.reissued", target=record,
                            after={"version": record.version})
        return Response({"token": record.token, "version": record.version,
                         "image": qrimage.make_qr_data_uri(record.token, box_size=8)})


# --------------------------------------------------------------------------
# Scan station
# --------------------------------------------------------------------------
class ScanStationView(APIView):
    """
    The door.

    The organiser scans the student, never the reverse (AGENT_PROMPT §2), which is
    why the presented code arrives in the body of a request the *operator* makes.
    """

    permission_classes = APIView.permission_classes + [IsEventOrganiser]

    @extend_schema(summary="Station state: counters, capture rate, recent scans")
    def get(self, request, event_id):
        event = _get_event_or_404(event_id)
        recent = event.scan_records.select_related("registration__student")[:12]
        return Response({
            "event": {"id": str(event.id), "title": event.title, "club": event.club.name,
                      "venue": event.venue.name, "status": event.status,
                      "starts_at": event.starts_at, "ends_at": event.ends_at},
            "counters": {"checked_in": event.attended_count(),
                         "registered": event.registered_count(),
                         "capacity": event.capacity},
            "capture": services.capture_stats(event),
            "recent": [
                {"id": str(s.id), "result": s.result,
                 "result_label": ScanResult(s.result).label, "scanned_at": s.scanned_at,
                 "station_id": s.station_id, "was_offline": s.was_offline,
                 "who": (s.registration.student.full_name
                         if s.registration and s.registration.student else None)}
                for s in recent
            ],
        })

    @extend_schema(request=ScanRequestSerializer, summary="Resolve one presented code")
    def post(self, request, event_id):
        event = _get_event_or_404(event_id)
        data = ScanRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        outcome = services.resolve(
            data.validated_data["token"], event, operator=request.user.record,
            station_id=data.validated_data.get("station_id", ""),
            scanned_at=data.validated_data.get("scanned_at"),
        )
        # 200 on every branch, rejections included. A duplicate or a forged code is
        # a successfully resolved scan, not a failed request, and the station needs
        # the verdict body to show the operator either way.
        return Response(_outcome_body(outcome))


class OfflineSyncView(APIView):
    """Replay a station's offline queue (AGENT_PROMPT §5)."""

    permission_classes = APIView.permission_classes + [IsEventOrganiser]

    @extend_schema(request=OfflineBatchSerializer, summary="Replay queued offline scans")
    def post(self, request, event_id):
        event = _get_event_or_404(event_id)
        data = OfflineBatchSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        outcomes = services.replay_offline(
            event, data.validated_data["scans"], operator=request.user.record,
            station_id=data.validated_data.get("station_id", ""),
        )
        return Response({
            "synced": len(outcomes),
            "accepted": sum(1 for o in outcomes if o.accepted),
            "duplicates": sum(1 for o in outcomes if o.result == ScanResult.DUPLICATE),
            "results": [_outcome_body(o) for o in outcomes],
            "counters": {"checked_in": event.attended_count(),
                         "registered": event.registered_count(),
                         "capacity": event.capacity},
        })


class ManualCheckInView(APIView):
    permission_classes = APIView.permission_classes + [IsEventOrganiser]

    @extend_schema(request=ManualCheckInSerializer, summary="Check in by PRN lookup")
    def post(self, request, event_id):
        event = _get_event_or_404(event_id)
        data = ManualCheckInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if student_id := data.validated_data.get("student_id"):
            student = Student.objects.filter(pk=student_id).first()
        else:
            from integrations.registry import student_directory

            student = student_directory().by_prn(data.validated_data["prn"])
        if student is None:
            raise ProblemDetail(code="PARTICIPATION_STUDENT_NOT_FOUND", title="No such student",
                                status_code=404, detail="Check the PRN on their ID card.")
        outcome = services.check_in_manually(
            event, student, operator=request.user.record,
            station_id=data.validated_data.get("station_id", ""),
        )
        return Response(_outcome_body(outcome))


class EventRosterView(APIView):
    """
    The attendee list for one event.

    Scoped to the people who need it: this event's organisers, the club's door
    staff, and the staff cleared for individual records. The Vice-Chancellor is
    excluded — this list is names and PRNs, and Management receives aggregates.

    Everyone else gets 404 rather than 403: the existence of an attendee list is
    itself disclosure (API_Standards §3.3).
    """

    def get(self, request, event_id):
        ctx = request.auth_context
        event = _get_event_or_404(event_id)
        allowed = (ctx.can_see_individual_records()
                   or str(event.id) in {str(e) for e in ctx.organiser_events()}
                   or ctx.has_club_role(event.club_id, *R.DOOR_STAFF))
        if not allowed:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such attendee list, or it is not visible to you.")
        registrations = (event.registrations.filter(cancelled_at__isnull=True)
                         .select_related("student").order_by("-attended", "student__full_name"))
        if only := request.query_params.get("attended"):
            registrations = registrations.filter(attended=only.lower() in ("1", "true", "yes"))
        return Response({
            "event": {"id": str(event.id), "title": event.title},
            "counts": {"registered": event.registered_count(),
                       "attended": event.attended_count()},
            "results": AttendeeSerializer(registrations, many=True).data,
        })


class ScanSessionView(APIView):
    """
    Issue the long-lived, event-bound station session (Identity §5.3).

    Deliberately an exception to the 15-minute access token: an organiser cannot
    re-authenticate mid-queue, and a station that logs out during an event is
    abandoned in favour of a paper list. The session expires with the event, and
    IsEventOrganiser refuses it at any other event.
    """

    permission_classes = APIView.permission_classes + [IsEventOrganiser]

    @extend_schema(summary="Issue a scan-station session bound to one event")
    def post(self, request, event_id):
        event = _get_event_or_404(event_id)
        from identity.tokens import scan_station_token

        token, claims = scan_station_token(request.user.record, event)
        return Response({"access_token": token, "token_type": "Bearer",
                         "expires_at": claims["exp"], "scan_event": str(event.id)})
