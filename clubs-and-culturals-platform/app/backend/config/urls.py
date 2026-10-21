"""
The module's URL map.

Everything the frontend touches sits under /api/v1/, which is what
SPECTACULAR_SETTINGS["SCHEMA_PATH_PREFIX"] documents and what the platform's
gateway routes in platform mode (API_Standards §3.1).

Namespacing is not a style choice here. §3.1 reserves `core`, `sis`, `academics`,
`attendance`, `exams`, `fees`, `campus`, `requests`, `admin` and `auth` for the
platform, so the module's own identity routes live under `/api/v1/module/` and
Django's admin under `/django-admin/`. Mounting login at `/api/v1/auth/` would
collide with the platform's own SSO endpoints the day the two are put behind one
gateway — the cheapest integration failure to prevent, and one of the most
annoying to fix.
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import RedirectView
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

API = "api/v1/"

urlpatterns = [
    path("django-admin/", admin.site.urls),

    # Module namespaces (§3.1)
    path(API, include("clubs.urls")),
    path(API, include("events.urls")),
    path(API + "participation/", include("participation.urls")),
    path(API + "budget/", include("budget.urls")),
    path(API + "governance/", include("governance.urls")),
    path(API + "reporting/", include("reporting.urls")),

    # The module's own identity routes, deliberately NOT /api/v1/auth.
    path(API + "module/", include("identity.urls")),

    path(API + "schema", SpectacularAPIView.as_view(), name="schema"),
    path(API + "docs", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path(API + "redoc", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

# ---------------------------------------------------------------------------
# Demo pages — one page per view, served same-origin so there is no CORS to
# configure and the browser sends the bearer token without preflight.
#
# Present only when DEMO_MODE is on, which itself refuses to coexist with
# DEBUG=False. Static serve is fine here for the same reason: it never exists on
# a production host.
# ---------------------------------------------------------------------------
if settings.DEMO_MODE:
    _demo_root = settings.BASE_DIR / "demo"
    urlpatterns += [
        path("", RedirectView.as_view(url="/demo/index.html", permanent=False)),
        path("demo/", RedirectView.as_view(url="/demo/index.html", permanent=False)),
        re_path(r"^demo/(?P<path>.*)$", serve, {"document_root": _demo_root}),
    ]
