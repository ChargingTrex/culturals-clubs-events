from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import ProblemDetail
from identity.models import Semester
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
    """

    @extend_schema(summary="Semester report — aggregates only, no individual records")
    def get(self, request):
        ctx = request.auth_context
        if not ctx.has_any(R.DEAN, R.VICE_CHANCELLOR, R.ADMIN, R.CULTURAL_SOCIETY):
            raise ProblemDetail(code="REPORTING_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="The semester report is available to the Dean and management.")
        return Response(semester_report(_semester(request)))


class DeanOverviewView(APIView):
    @extend_schema(summary="Running totals and what needs chasing")
    def get(self, request):
        ctx = request.auth_context
        if not ctx.has_any(R.DEAN, R.ADMIN, R.CULTURAL_SOCIETY):
            raise ProblemDetail(code="REPORTING_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="This overview is available to the Dean.")
        return Response(dean_overview(_semester(request)))
