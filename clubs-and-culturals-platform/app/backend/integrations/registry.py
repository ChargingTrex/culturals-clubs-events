"""
Adapter selection. One switch, read from configuration.

API_Standards §2.1: `INTEGRATION_MODE = local | platform`. Application code
asks for `identity_provider()` and never names an implementation, which is what
makes integration a configuration change rather than a rewrite.
"""
from functools import lru_cache

from django.conf import settings

from integrations import audit, directory, files, identity, notifications

_LOCAL = "local"
_PLATFORM = "platform"

_PROVIDERS = {
    "identity": {
        _LOCAL: identity.LocalIdentityProvider,
        _PLATFORM: identity.PlatformIdentityProvider,
    },
    "directory": {
        _LOCAL: directory.LocalStudentDirectory,
        _PLATFORM: directory.PlatformStudentDirectory,
    },
    "notifications": {
        _LOCAL: notifications.LocalNotificationSender,
        _PLATFORM: notifications.PlatformNotificationSender,
    },
    "files": {_LOCAL: files.LocalFileStore, _PLATFORM: files.PlatformFileStore},
    "audit": {_LOCAL: audit.LocalAuditSink, _PLATFORM: audit.PlatformAuditSink},
}


def _mode():
    mode = getattr(settings, "INTEGRATION_MODE", _LOCAL)
    if mode not in (_LOCAL, _PLATFORM):
        raise ValueError(f"INTEGRATION_MODE must be 'local' or 'platform', got {mode!r}")
    return mode


@lru_cache(maxsize=None)
def _get(concern):
    return _PROVIDERS[concern][_mode()]()


def identity_provider():
    return _get("identity")


def student_directory():
    return _get("directory")


def notifier():
    return _get("notifications")


def file_store():
    return _get("files")


def audit_sink():
    return _get("audit")


def reset():
    """Tests switch INTEGRATION_MODE at runtime; this drops the memoised pick."""
    _get.cache_clear()
