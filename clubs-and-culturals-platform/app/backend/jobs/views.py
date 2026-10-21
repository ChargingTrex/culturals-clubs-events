"""
HTTP triggers for the scheduled jobs (docs/COMPLETION_PLAN.md §2).

The test host has no Celery worker, so Vercel Cron calls these instead. They are
guarded by a shared secret rather than a user token: nobody is logged in when
cron fires, and a Dean's bearer token must not run jobs either. That is a
different trust boundary from the rest of the API, so the view opts out of the
claims authenticator and does its own header check with a constant-time compare.
"""
import hmac
import logging

from django.conf import settings
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from common.errors import ProblemDetail
from jobs.services import JOBS, run_job

log = logging.getLogger(__name__)

# A shorter secret is treated as no secret (QA F8): the triggers are
# unauthenticated and unthrottled, so the token must be what stops a guess.
MIN_TOKEN_LENGTH = 32


def _require_job_token(request, name):
    expected = settings.JOBS_TOKEN or ""
    if not expected:
        raise ProblemDetail(
            code="JOBS_DISABLED", title="Jobs are disabled", status_code=503,
            detail="JOBS_TOKEN is not set on this host, so no job can be triggered over HTTP.",
        )
    if len(expected) < MIN_TOKEN_LENGTH:
        raise ProblemDetail(
            code="JOBS_DISABLED", title="Jobs are disabled", status_code=503,
            detail=f"JOBS_TOKEN is shorter than {MIN_TOKEN_LENGTH} characters; "
                   "the HTTP triggers stay off until a proper secret is set.",
        )
    scheme, _, given = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(given.strip().encode(), expected.encode()):
        log.warning("jobs: refused trigger of %r from %s (%s)", name,
                    request.META.get("REMOTE_ADDR", "?"),
                    "no bearer token" if not given else "wrong token")
        raise ProblemDetail(
            code="JOBS_UNAUTHORIZED", title="Job token required", status_code=401,
            detail="Send `Authorization: Bearer <JOBS_TOKEN>`.",
        )


class JobTriggerView(APIView):
    """
    `POST /api/v1/jobs/{name}` with `Authorization: Bearer <JOBS_TOKEN>`.

    401 JOBS_UNAUTHORIZED when the header is missing or wrong (logged), 503
    JOBS_DISABLED when the host has no token or one shorter than 32 characters, 404 JOBS_UNKNOWN for a name not in
    `jobs.services.JOBS`, 501 JOBS_NOT_WIRED when the job's dependency is not in
    this build. Success returns `{job, started_at, finished_at, result}` and
    writes an AuditEntry.
    """

    authentication_classes = ()
    permission_classes = ()
    throttle_classes = ()

    @extend_schema(
        summary="Trigger a scheduled job (Vercel Cron; shared secret, not a user token)",
        parameters=[OpenApiParameter("name", OpenApiTypes.STR, OpenApiParameter.PATH,
                                     enum=sorted(JOBS), description="Job name")],
        request=None,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request, name):
        _require_job_token(request, name)
        return Response(run_job(name))

    @extend_schema(
        summary="Trigger a scheduled job — GET form, because Vercel Cron only issues GET",
        parameters=[OpenApiParameter("name", OpenApiTypes.STR, OpenApiParameter.PATH,
                                     enum=sorted(JOBS), description="Job name")],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request, name):
        # Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
        # set in the project; set JOBS_TOKEN to the same value. Same guard, same job.
        return self.post(request, name)
