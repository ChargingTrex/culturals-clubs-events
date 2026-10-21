"""
Submit feedback (attendee) and read the summary (organisers and oversight).

The summary answers 404, not 403, to anyone outside the allowed set: whether
an event has feedback at all is itself disclosure (API_Standards §3.3).
"""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import ProblemDetail
from events.models import Event
from feedback import services
from feedback.serializers import FeedbackOutSerializer, FeedbackSummarySerializer
from identity.models import Student


class FeedbackInSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    would_recommend = serializers.BooleanField()
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000,
                                    default="")


def _get_event_or_404(event_id):
    event = Event.objects.filter(pk=event_id).first()
    if event is None:
        raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                            detail="No such event.")
    return event


class EventFeedbackView(APIView):
    @extend_schema(request=FeedbackInSerializer, responses={201: FeedbackOutSerializer},
                   summary="Leave feedback on an attended event")
    def post(self, request, event_id):
        ctx = request.auth_context
        event = _get_event_or_404(event_id)
        if not ctx.student_id:
            raise ProblemDetail(code="FEEDBACK_NOT_ATTENDED", title="Not an attendee",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Only a student who attended may leave feedback.")
        data = FeedbackInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        student = Student.objects.get(pk=ctx.student_id)
        feedback = services.submit_feedback(event, student, **data.validated_data)
        return Response({"id": str(feedback.id), "event": str(event.id),
                         "rating": feedback.rating,
                         "would_recommend": feedback.would_recommend,
                         "comment": feedback.comment, "created_at": feedback.created_at},
                        status=status.HTTP_201_CREATED)


# Who may read an event's summary: the club's office bearers who ran it or
# own its money, plus the oversight roles. Not the Vice-Chancellor (aggregates
# reach Management through the semester report, not per event), not members.
_OFFICERS = tuple(dict.fromkeys(R.EVENT_OPERATORS + R.BUDGET_VIEWERS))


class FeedbackSummaryView(APIView):
    @extend_schema(responses=FeedbackSummarySerializer,
                   summary="Aggregate feedback for one event — no identities")
    def get(self, request, event_id):
        ctx = request.auth_context
        event = _get_event_or_404(event_id)
        allowed = (ctx.is_dean() or ctx.is_admin() or ctx.has_any(R.CULTURAL_SOCIETY)
                   or ctx.has_club_role(event.club_id, *_OFFICERS))
        if not allowed:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such feedback summary, or it is not visible to you.")
        return Response({"event": {"id": str(event.id), "title": event.title},
                         **services.summarise(event)})
