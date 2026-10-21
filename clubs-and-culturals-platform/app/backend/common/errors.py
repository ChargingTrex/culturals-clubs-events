"""
RFC 9457 problem-details errors, identical in both systems.

API_Standards §3.4 fixes this shape. `code` is what clients branch on;
`detail` is prose and may change. Every error from either system uses it.
"""
from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, NotAuthenticated, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from common.middleware import current_trace_id

ERROR_BASE = "https://portal.college.edu/errors/"

_DEFAULT_CODES = {
    400: "REQUEST_MALFORMED",
    401: "AUTH_REQUIRED",
    403: "PERMISSION_DENIED",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_FAILED",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
}


class ProblemDetail(APIException):
    """Raise this for any domain failure that needs a machine-readable code."""

    def __init__(self, *, code, title, status_code, detail="", errors=None, type_slug=None):
        self.code = code
        self.title = title
        self.status_code = status_code
        self.detail_text = detail
        self.errors = errors or []
        self.type_slug = type_slug or code.lower().replace("_", "-")
        super().__init__(detail or title)


class Conflict(ProblemDetail):
    def __init__(self, code, title, detail="", errors=None):
        super().__init__(code=code, title=title, status_code=status.HTTP_409_CONFLICT,
                         detail=detail, errors=errors)


class Unprocessable(ProblemDetail):
    def __init__(self, code, title, detail="", errors=None):
        super().__init__(code=code, title=title, status_code=422, detail=detail, errors=errors)


def _body(*, code, title, status_code, detail, instance, errors=None, type_slug=None):
    payload = {
        "type": ERROR_BASE + (type_slug or code.lower().replace("_", "-")),
        "title": title,
        "status": status_code,
        "detail": detail,
        "instance": instance,
        "code": code,
        "trace_id": current_trace_id() or "",
    }
    if errors:
        payload["errors"] = errors
    return payload


def _flatten_validation(detail, prefix=""):
    """DRF nests validation errors; the contract wants one flat entry per field."""
    out = []
    if isinstance(detail, dict):
        for field, value in detail.items():
            out.extend(_flatten_validation(value, f"{prefix}{field}"))
    elif isinstance(detail, list):
        for item in detail:
            if isinstance(item, (dict, list)):
                out.extend(_flatten_validation(item, prefix))
            else:
                out.append({
                    "field": prefix or "non_field_errors",
                    "code": getattr(item, "code", "invalid").upper(),
                    "message": str(item),
                })
    else:
        out.append({
            "field": prefix or "non_field_errors",
            "code": getattr(detail, "code", "invalid").upper(),
            "message": str(detail),
        })
    return out


def problem_detail_handler(exc, context):
    request = context.get("request")
    instance = request.path if request is not None else ""

    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    if isinstance(exc, PermissionDenied):
        exc = APIException(detail=str(exc) or "Not permitted.")
        exc.status_code = status.HTTP_403_FORBIDDEN

    if isinstance(exc, ProblemDetail):
        return Response(
            _body(code=exc.code, title=exc.title, status_code=exc.status_code,
                  detail=exc.detail_text, instance=instance, errors=exc.errors,
                  type_slug=exc.type_slug),
            status=exc.status_code,
            content_type="application/problem+json",
        )

    if isinstance(exc, ValidationError):
        # 422 for well-formed-but-invalid, per §3.3. DRF's own default is 400.
        errors = _flatten_validation(exc.detail)
        return Response(
            _body(code="VALIDATION_FAILED", title="Validation failed", status_code=422,
                  detail="One or more fields are invalid.", instance=instance, errors=errors),
            status=422,
            content_type="application/problem+json",
        )

    if isinstance(exc, Http404):
        return Response(
            _body(code="NOT_FOUND", title="Not found", status_code=404,
                  detail="No such resource, or it is not visible to you.", instance=instance),
            status=404,
            content_type="application/problem+json",
        )

    response = drf_exception_handler(exc, context)
    if response is None:
        if settings.DEBUG:
            raise exc
        return Response(
            _body(code="INTERNAL_ERROR", title="Server error", status_code=500,
                  detail="Unexpected server error.", instance=instance),
            status=500,
            content_type="application/problem+json",
        )

    code = getattr(exc, "code", None) or _DEFAULT_CODES.get(response.status_code, "ERROR")
    title = {401: "Authentication required", 403: "Not permitted"}.get(
        response.status_code, str(getattr(exc, "default_code", code)).replace("_", " ").title()
    )
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    if isinstance(exc, NotAuthenticated):
        title, detail = "Authentication required", "No credentials were supplied."
    response.data = _body(code=code, title=title, status_code=response.status_code,
                          detail=detail, instance=instance)
    response.content_type = "application/problem+json"
    return response
