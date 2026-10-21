from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import ProblemDetail
from identity.models import Semester
from reporting.export import SemesterReportCSVRenderer
from reporting.serializers import DeanOverviewSerializer, SemesterReportSerializer
from reporting.services import dean_overview, semester_report


def _semester(request):
    if sid := request.query_params.get("semester"):
        semester = Semester.objects.filter(pk=sid).first()
    else:
        semester = Semester.objects.filter(is_current=True).first() or Semester.objects.first()
    if semester is None:
        raise ProblemDetail(code="REPORTING_NO_SEMESTER", title="No semester defined",
                            status_code=422,
                            detail="The academic calendar has no semester to report on.")
    return semester


class SemesterReportView(APIView):
    """
    The semester report.

    Available to the Dean and the Vice-Chancellor. The VC sees aggregates only —
    AGENT_PROMPT §6 is explicit that the Vice-Chancellor gets no individual
    records, and this endpoint returns none.

    `?format=csv` (or the `/csv` path) returns the same figures as `text/csv`
    (B-10b). One permission check serves both: the renderer is chosen before the
    handler runs, and the handler decides who may read regardless of format.
    """

    renderer_classes = (JSONRenderer, SemesterReportCSVRenderer)

    @extend_schema(
        summary="Semester report — aggregates only, no individual records",
        parameters=[
            OpenApiParameter("semester", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False,
                             description="Semester id; defaults to the current semester."),
            OpenApiParameter("format", OpenApiTypes.STR, OpenApiParameter.QUERY, required=False,
                             enum=["json", "csv"], description="csv returns text/csv with the same totals."),
        ],
        responses={(200, "application/json"): SemesterReportSerializer,
                   (200, "text/csv"): OpenApiTypes.STR},
    )
    def get(self, request, **kwargs):
        ctx = request.auth_context
        if not ctx.has_any(R.DEAN, R.VICE_CHANCELLOR, R.ADMIN, R.CULTURAL_SOCIETY):
            raise ProblemDetail(code="REPORTING_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="The semester report is available to the Dean and management.")
        semester = _semester(request)
        response = Response(semester_report(semester))
        if request.accepted_renderer.format == "csv":
            response["Content-Disposition"] = (
                f'attachment; filename="semester-report-{semester.starts_on:%Y-%m}.csv"')
        return response


class DeanOverviewView(APIView):
    """
    Running totals and what needs chasing (PRD §6.3). Dean, admin and the
    Cultural Society; the VC gets the semester report, not the chase list.
    `capture` is documented by reporting.serializers.CaptureMetricsSerializer.
    """

    @extend_schema(
        parameters=[OpenApiParameter("semester", OpenApiTypes.UUID, OpenApiParameter.QUERY, required=False,
                                     description="Semester id; defaults to the current semester.")],
        responses=DeanOverviewSerializer,
        summary="Running totals and what needs chasing",
    )
    def get(self, request):
        ctx = request.auth_context
        if not ctx.has_any(R.DEAN, R.ADMIN, R.CULTURAL_SOCIETY):
            raise ProblemDetail(code="REPORTING_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="This overview is available to the Dean.")
        return Response(dean_overview(_semester(request)))
