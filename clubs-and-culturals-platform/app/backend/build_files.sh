#!/usr/bin/env bash
# Vercel build step (vercel.json "buildCommand"). Runs in the Root Directory
# (this backend folder). The Python function itself is built separately by the
# runtime from requirements.txt; this script only produces the static output.
#
# Static files go to STATIC_ROOT (staticfiles/) for WhiteNoise inside the
# function, and are copied to staticfiles_build/static so Vercel's CDN serves
# /static/* directly (outputDirectory) without waking the function.
#
# Settings load at build time, so DJANGO_SECRET_KEY, QR_SIGNING_KEYS and
# DJANGO_DEBUG must be present in the Vercel env for the build as well as the
# runtime (they are by default). No database connection is made here.
set -euo pipefail

PY="${PYTHON:-python3}"
"$PY" --version
# Vercel installs requirements.txt with uv into the function's own environment,
# and the build shell's python3 is a uv-managed interpreter that refuses pip
# (PEP 668). So collectstatic runs from a throwaway venv outside the project,
# which never ends up in the function bundle.
if ! "$PY" -c "import django" 2>/dev/null; then
  if command -v uv >/dev/null; then
    uv venv --quiet --python "$PY" /tmp/build-venv
    uv pip install --quiet --python /tmp/build-venv/bin/python -r requirements.txt
  else
    "$PY" -m venv /tmp/build-venv
    /tmp/build-venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt
  fi
  PY=/tmp/build-venv/bin/python
fi
# Diagnostic only: the function needs psycopg at runtime, so say loudly if it
# cannot be imported here (Django would otherwise hide the real error).
"$PY" -c "import psycopg; print('psycopg', psycopg.__version__, psycopg.pq.__impl__)" \
  || echo "WARNING: psycopg does not import in the build environment (see above)"
# collectstatic never queries the database; without DATABASE_URL Django uses the
# built-in sqlite backend, so the build does not depend on the Postgres driver.
env -u DATABASE_URL "$PY" manage.py collectstatic --noinput --clear

rm -rf staticfiles_build
mkdir -p staticfiles_build
cp -r staticfiles staticfiles_build/static
echo "collectstatic done: $(find staticfiles_build -type f | wc -l | tr -d ' ') files"
