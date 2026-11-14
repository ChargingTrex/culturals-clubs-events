"""
Settings for the Robot Framework e2e run (app/e2e/ci.sh).

Everything is the normal settings module; only the SQLite file moves, so the
suites consume their own seeded database and never the developer's db.sqlite3.
"""
import os

from config.settings import *  # noqa: F401,F403
from config.settings import BASE_DIR

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("E2E_SQLITE_PATH", str(BASE_DIR / "db.e2e.sqlite3")),
    }
}
