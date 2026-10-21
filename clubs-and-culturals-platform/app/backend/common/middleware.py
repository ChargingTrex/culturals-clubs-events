import contextvars
import uuid

_trace_id = contextvars.ContextVar("trace_id", default=None)


def current_trace_id():
    return _trace_id.get()


class TraceIdMiddleware:
    """
    A trace_id on every request, echoed in error bodies and logs.

    API_Standards §3.4: trace_id is what makes a failure that crosses the
    module/platform boundary traceable. An inbound X-Trace-Id is honoured so a
    platform-originated request keeps one id across both systems.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        trace = request.headers.get("X-Trace-Id") or uuid.uuid4().hex
        token = _trace_id.set(trace)
        request.trace_id = trace
        try:
            response = self.get_response(request)
        finally:
            _trace_id.reset(token)
        response["X-Trace-Id"] = trace
        return response
