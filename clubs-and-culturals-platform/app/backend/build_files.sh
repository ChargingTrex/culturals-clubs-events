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
"$PY" -m pip install --quiet --disable-pip-version-check -r requirements.txt
"$PY" manage.py collectstatic --noinput --clear

rm -rf staticfiles_build
mkdir -p staticfiles_build
cp -r staticfiles staticfiles_build/static
echo "collectstatic done: $(find staticfiles_build -type f | wc -l | tr -d ' ') files"
