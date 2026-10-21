"""
Django settings for the Clubs & Events module.

Stack is fixed by AGENT_PROMPT.md §2 and is not up for revision here:
Django 5.x + DRF + PostgreSQL + Celery/Redis + drf-spectacular.
"""
import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env(key, default=None):
    return os.environ.get(key, default)


def _env_int(key, default):
    return int(os.environ.get(key, default))


def _env_bool(key, default=False):
    return os.environ.get(key, str(int(default))).lower() in ("1", "true", "yes")


SECRET_KEY = _env("DJANGO_SECRET_KEY", "dev-only-insecure-key")
DEBUG = _env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [h for h in _env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "identity",
    "clubs",
    "events",
    "participation",
    "budget",
    "governance",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves STATIC_ROOT from the app process: Vercel functions have no nginx.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "common.middleware.TraceIdMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# PostgreSQL is the target (AGENT_PROMPT §2). SQLite is a demo fallback only:
# the venue exclusion constraint is Postgres-only and degrades to the
# application-level check in events/services.py when it is absent.
_database_url = _env("DATABASE_URL")
if _database_url:
    from urllib.parse import urlparse

    _u = urlparse(_database_url)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _u.path.lstrip("/"),
            "USER": _u.username or "",
            "PASSWORD": _u.password or "",
            "HOST": _u.hostname or "",
            "PORT": str(_u.port or ""),
        }
    }
else:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    }

AUTH_USER_MODEL = "identity.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "UTC"          # UTC storage, IST display (AGENT_PROMPT §4)
DISPLAY_TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# `collectstatic` target (build_files.sh on Vercel); WhiteNoise serves it.
# Non-manifest storage on purpose: a missing manifest must never 500 a request.
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Behind Vercel's (or any) TLS-terminating proxy the scheme arrives in this
# header; without it `request.is_secure()` is False and secure cookies break.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
# Cookies only matter for the Django admin (the API is bearer-token); on a
# public DEBUG=0 host they must be HTTPS-only.
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("identity.authentication.ClaimsAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "EXCEPTION_HANDLER": "common.errors.problem_detail_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Clubs & Events API",
    "DESCRIPTION": "Clubs, events, participation, budget and approvals for the Student Management Portal.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
}

# Comma-separated origins (scheme + host, no path). Hosted frontends (Vercel,
# Netlify) are added via env; the default stays the local Vite dev server.
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in _env("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True
# Needed for the Django admin / any cookie-authenticated POST on a hosted
# origin; the API itself is bearer-token and unaffected.
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _env("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()]

# ---------------------------------------------------------------------------
# Integration mode — API_Standards_Integration_Contract §2
# ---------------------------------------------------------------------------
INTEGRATION_MODE = _env("INTEGRATION_MODE", "local")

PLATFORM_ISSUER = _env("PLATFORM_ISSUER", "https://portal.college.edu")
PLATFORM_JWKS_URL = _env("PLATFORM_JWKS_URL", "")
PLATFORM_AUDIENCE = _env("PLATFORM_AUDIENCE", "clubs")

# Token lifetimes — Identity_Login_Shared_Data §5.3. These are contract values.
TOKEN_LIFETIMES = {
    "access": timedelta(minutes=15),
    "refresh": timedelta(days=7),
    "staff_session_cap": timedelta(hours=8),
    "scan_station_grace": timedelta(hours=4),
}

# Institution config — never hard-coded in a codebase (§3.4)
PRN_REGEX = _env("PRN_REGEX", r"^[0-9]{2}[A-Z]{2,4}[0-9]{3,5}$")

# ---------------------------------------------------------------------------
# QR signing keys — qr-attendance-kit/README: rotating a key must not invalidate
# every certificate ever issued.
#
# Deliberately NOT derived from SECRET_KEY. Tying QR signing to the Django secret
# means rotating that secret — a routine thing to do after a leak or a staff
# change — silently breaks every pass and certificate in circulation. Old key ids
# stay listed so tokens they signed keep verifying; remove one only when you are
# willing to invalidate everything it signed.
# ---------------------------------------------------------------------------
QR_SIGNING_KEYS = {}
for _entry in _env("QR_SIGNING_KEYS", "").split(","):
    if ":" in _entry:
        _kid, _, _secret = _entry.partition(":")
        QR_SIGNING_KEYS[_kid.strip()] = _secret.strip()
QR_ACTIVE_KEY_ID = _env("QR_ACTIVE_KEY_ID", "v1")

if not QR_SIGNING_KEYS:
    if DEBUG:
        # A fixed development key, so a restart does not invalidate the passes
        # seeded a moment ago. Distinct from SECRET_KEY on purpose.
        QR_SIGNING_KEYS = {"v1": "dev-only-qr-signing-key-not-for-production-32b"}
    else:
        raise ImproperlyConfigured(
            "QR_SIGNING_KEYS must be set outside DEBUG, as "
            "'v1:<32+ byte secret>[,v2:<secret>]'. Passes and certificates are "
            "signed with it and it must be rotatable independently of SECRET_KEY."
        )

# Where a certificate's QR points for verification. The certificates portal is
# documented by the kit but not implemented here; only the token purpose exists.
CERTIFICATE_VERIFY_BASE = _env("CERTIFICATE_VERIFY_BASE", "http://localhost:5173/verify")

# Domain thresholds. AGENT_PROMPT §9 lists these as genuinely open questions,
# so they are configuration rather than constants in the code.
VC_BUDGET_THRESHOLD = _env_int("VC_BUDGET_THRESHOLD", 50000)
RECEIPT_THRESHOLD = _env_int("RECEIPT_THRESHOLD", 5000)
# PRD §5.1: a club with no activity for this long is flagged dormant.
DORMANCY_DAYS = _env_int("DORMANCY_DAYS", 180)
VENUE_BUFFER_MINUTES = _env_int("VENUE_BUFFER_MINUTES", 30)
CONTINGENCY_PERCENT = _env_int("CONTINGENCY_PERCENT", 8)

# Approval chain, in order, before the value-based VC gate.
# DEVIATION from AGENT_PROMPT §2, which fixes "Dean only". `cultural_society`
# is a product-owner addition; set APPROVAL_CHAIN=dean to restore the document.
APPROVAL_CHAIN = [s.strip() for s in _env("APPROVAL_CHAIN", "cultural_society,dean").split(",") if s.strip()]

# ---------------------------------------------------------------------------
# DEMO MODE — login disabled for a walkthrough. NEVER on in production.
#
# This does NOT stub out authentication. It exposes one extra endpoint that mints
# a REAL token for a named demo persona without a password, so every permission
# check, every 403 and every 404 behaves exactly as it will on the day. Disabling
# auth outright would hide the role-based access that is the point of the demo.
#
# Three guards, because a demo switch left on is a public account:
#   1. off unless DEMO_MODE is explicitly truthy
#   2. refused outright when DEBUG is False
#   3. the endpoint 404s when off, so it is not even discoverable
# ---------------------------------------------------------------------------
DEMO_MODE = _env_bool("DEMO_MODE", False)
if DEMO_MODE and not DEBUG:
    raise ImproperlyConfigured(
        "DEMO_MODE cannot be enabled with DEBUG=False. It issues tokens without a "
        "password; on a production host that is an open door, not a convenience."
    )

# Overridable so a DEBUG=0 test host without an SMTP relay (Vercel) can log mail
# to the function console instead of silently failing to connect to localhost.
EMAIL_BACKEND = _env(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = _env("EMAIL_HOST", "localhost")
EMAIL_PORT = _env_int("EMAIL_PORT", 1025)
DEFAULT_FROM_EMAIL = _env("DEFAULT_FROM_EMAIL", "culturals@college.edu")

CELERY_BROKER_URL = _env("CELERY_BROKER_URL", "redis://localhost:6379/0")
# Serverless test hosting has no worker, so tasks run inline there
# (CELERY_TASK_ALWAYS_EAGER=1). Default keeps the old behaviour: eager in DEBUG.
CELERY_TASK_ALWAYS_EAGER = _env_bool("CELERY_TASK_ALWAYS_EAGER", DEBUG)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
