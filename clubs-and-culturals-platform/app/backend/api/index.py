"""
Vercel entry point (Python runtime convention: a module under api/ exposing a
WSGI/ASGI callable named `app`). vercel.json rewrites every path here, and the
function sees the ORIGINAL request path, so Django's URL map is untouched.

The Vercel project's Root Directory must be this backend folder
(clubs-and-culturals-platform/app/backend); see docs/HOSTING.md.
"""
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from config.wsgi import application  # noqa: E402

app = application
