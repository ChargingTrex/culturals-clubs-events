#!/usr/bin/env bash
# Run the Robot Framework browser suites against a served copy of the app.
#
#   tests/robot/run.sh                    everything: smoke, then end-to-end
#   tests/robot/run.sh --include smoke    just the smoke suites
#   tests/robot/run.sh --include e2e      just the end-to-end suites
#
# Any extra arguments go straight to `robot`. If nothing is serving the app on
# $PORT (default 4173) a static server is started for the run and stopped after.
# Set CHROMIUM=/path/to/chrome to use a local browser instead of the one
# `rfbrowser init chromium` downloaded. The report lands in results/robot/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-4173}"
BASE_URL="${BASE_URL:-http://127.0.0.1:$PORT}"
OUT="${OUT:-$ROOT/results/robot}"

if ! curl -sf -o /dev/null "$BASE_URL/index.html"; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" \
    >/dev/null 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  for _ in $(seq 1 50); do
    curl -sf -o /dev/null "$BASE_URL/index.html" && break
    sleep 0.1
  done
fi

args=(--name Culturals --outputdir "$OUT" --variable "BASE_URL:$BASE_URL")
if [ -n "${CHROMIUM:-}" ]; then args+=(--variable "CHROMIUM:$CHROMIUM"); fi

robot "${args[@]}" "$@" "$ROOT/tests/robot"
