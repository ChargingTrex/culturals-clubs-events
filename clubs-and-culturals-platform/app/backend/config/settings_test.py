"""
Test settings.

The only meaningful difference is the password hasher. Django's default PBKDF2
runs ~1.2 million iterations, which is correct in production and ruinous in a
suite where nearly every fixture creates a user and then logs in — two hashes per
factory call, several factories per test. MD5 here is not a security position; it
is a test that finishes.
"""
from config.settings import *  # noqa: F401,F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Keep the suite off the developer's dev database and off any network.
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# A fixed QR key, so a token minted in one test verifies in the next.
QR_SIGNING_KEYS = {"v1": "test-only-qr-signing-key-at-least-32-bytes-long"}
QR_ACTIVE_KEY_ID = "v1"

# Both approval gates on, since that is the configuration under test; the
# Dean-only chain is exercised by an explicit override_settings.
APPROVAL_CHAIN = ["cultural_society", "dean"]

CELERY_TASK_ALWAYS_EAGER = True
