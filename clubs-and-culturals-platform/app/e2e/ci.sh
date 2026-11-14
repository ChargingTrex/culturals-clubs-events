#!/usr/bin/env bash
# One command from a clean checkout to a Robot report: venv, seeded database, backend, frontend, suites.
#
#   ./ci.sh smoke|full|unit [--keep] [robot options]   run the suites (smoke = --include smoke, unit = api --include unit)
#   ./ci.sh up                                         boot everything and stay up (Ctrl-C to stop); then use ./run.sh
#   ./ci.sh reseed                                     put the seed back into the running stack's database
#
# Environment (all optional):
#   E2E_VENV      python venv, outside this tree (the parent folder's name has a colon)   /tmp/culturals-venv
#   E2E_WORK      database, logs and the env file for this stack                           /tmp/culturals-e2e
#   E2E_API_PORT  backend port                                                             8813
#   E2E_WEB_PORT  frontend port                                                            5213
#   E2E_FRONTEND  preview (production build served by vite preview) or dev (vite dev server) preview
#   E2E_PYTHON    python to create the venv with                                           python3.12
#
# The developer's backend/.env and db.sqlite3 are never touched: the backend runs on config.settings_e2e
# with its own SQLite file, and exported variables beat .env (load_dotenv does not override them).
set -euo pipefail
cd "$(dirname "$0")"
E2E_DIR="$PWD"
APP_DIR="$(cd .. && pwd)"
mode="${1:?smoke | full | unit | up | reseed}"; shift
keep=0
if [ "${1:-}" = "--keep" ]; then keep=1; shift; fi

E2E_VENV="${E2E_VENV:-/tmp/culturals-venv}"
E2E_WORK="${E2E_WORK:-/tmp/culturals-e2e}"
E2E_API_PORT="${E2E_API_PORT:-8813}"
E2E_WEB_PORT="${E2E_WEB_PORT:-5213}"
E2E_FRONTEND="${E2E_FRONTEND:-preview}"
E2E_PYTHON="${E2E_PYTHON:-python3.12}"
mkdir -p "$E2E_WORK" results

# ---- the backend's environment (exports win over backend/.env) ----
export DJANGO_SETTINGS_MODULE=config.settings_e2e
export E2E_SQLITE_PATH="$E2E_WORK/db.sqlite3"
export DJANGO_DEBUG=1
export DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-e2e-only-secret-key-not-used-anywhere-else-0123456789}"
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
export CORS_ALLOWED_ORIGINS="http://localhost:$E2E_WEB_PORT,http://127.0.0.1:$E2E_WEB_PORT"
export CELERY_TASK_ALWAYS_EAGER=1
export DEMO_MODE=0
export PILOT_ACCOUNTS=0
export APPROVAL_CHAIN=cultural_society,dean
export JOBS_TOKEN="${JOBS_TOKEN:-e2e-jobs-token-0123456789abcdef0123456789abcdef}"   # same default as resources/variables.py
export TZ=Asia/Kolkata
unset DATABASE_URL
# ---- the suites' environment ----
export API_BASE="http://localhost:$E2E_API_PORT/api/v1"
export WEB_BASE="http://localhost:$E2E_WEB_PORT"
export DB_PATH="$E2E_SQLITE_PATH"
export EXPECTED_TABLES_FILE="$E2E_WORK/expected_tables.json"

PY="$E2E_VENV/bin/python"
manage() { (cd "$APP_DIR/backend" && "$PY" manage.py "$@"); }

if [ "$mode" = "reseed" ]; then
  # A fresh file, not `seed_demo --flush`: the seed's rows sit behind PROTECT foreign keys. SQLite connections are
  # per request, so the running backend simply opens the new file on its next request.
  rm -f "$E2E_SQLITE_PATH"
  manage migrate --noinput >"$E2E_WORK/migrate.log"
  manage seed_demo >"$E2E_WORK/seed.log"
  E2E_PYTHON="$PY" ./run.sh tables
  exit 0
fi

# ---- 1. toolchain ----
if [ ! -x "$PY" ]; then
  echo "== creating venv at $E2E_VENV"
  "$E2E_PYTHON" -m venv "$E2E_VENV"
  "$E2E_VENV/bin/pip" install -q --upgrade pip
fi
if ! "$PY" -c "import django, robot, Browser, RequestsLibrary" 2>/dev/null; then
  echo "== installing backend and Robot requirements"
  "$E2E_VENV/bin/pip" install -q -r "$APP_DIR/backend/requirements.txt" -r "$E2E_DIR/requirements.txt"
fi
marker="$E2E_VENV/.rfbrowser-chromium-$("$PY" -c 'import Browser; print(Browser.__version__)')"
if [ ! -f "$marker" ]; then
  echo "== installing Playwright Chromium for the Browser library"
  "$E2E_VENV/bin/rfbrowser" init chromium && touch "$marker"
fi
if [ ! -d "$APP_DIR/frontend/node_modules" ]; then
  echo "== npm ci"
  (cd "$APP_DIR/frontend" && npm ci)
fi

# ---- 2. a fresh, seeded database ----
echo "== migrate + seed into $E2E_SQLITE_PATH"
rm -f "$E2E_SQLITE_PATH"
manage migrate --noinput >"$E2E_WORK/migrate.log"
manage seed_demo >"$E2E_WORK/seed.log"
E2E_PYTHON="$PY" ./run.sh tables

# ---- 3. servers ----
port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
for port in "$E2E_API_PORT" "$E2E_WEB_PORT"; do
  if ! port_free "$port"; then
    echo "!! port $port is already in use by:" >&2; lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2
    echo "   pick another with E2E_API_PORT / E2E_WEB_PORT" >&2; exit 3
  fi
done
cleanup() {
  if [ "$keep" = 1 ]; then
    echo "== servers left running (backend pid $BE, frontend pid $FE). Source $E2E_WORK/env.sh, then ./run.sh …"
    return
  fi
  kill "$BE" "$FE" 2>/dev/null || true
  pkill -P "$FE" 2>/dev/null || true
}
trap cleanup EXIT
echo "== backend on :$E2E_API_PORT"
(cd "$APP_DIR/backend" && exec "$PY" manage.py runserver "$E2E_API_PORT" --noreload) >"$E2E_WORK/backend.log" 2>&1 &
BE=$!
# vite is run through node, not npx: this repo's parent folder has a colon in its name, which splits PATH entries,
# so npm's node_modules/.bin shim is unreachable here (see app/README.md on the venv for the same reason).
echo "== frontend ($E2E_FRONTEND) on :$E2E_WEB_PORT"
if [ "$E2E_FRONTEND" = "preview" ]; then
  # A production build into this stack's own folder (several stacks may run side by side), served by vite preview.
  (cd "$APP_DIR/frontend" && VITE_API_BASE="$API_BASE" node node_modules/vite/bin/vite.js build --outDir "$E2E_WORK/dist" --emptyOutDir >"$E2E_WORK/build.log" 2>&1 && exec node node_modules/vite/bin/vite.js preview --outDir "$E2E_WORK/dist" --port "$E2E_WEB_PORT" --strictPort) >"$E2E_WORK/frontend.log" 2>&1 &
else
  # The dev server cannot serve from a path with a colon in it (Vite's allow-list check); use preview there.
  (cd "$APP_DIR/frontend" && VITE_API_BASE="$API_BASE" exec node node_modules/vite/bin/vite.js --port "$E2E_WEB_PORT" --strictPort) >"$E2E_WORK/frontend.log" 2>&1 &
fi
FE=$!
wait_for() { local url="$1" name="$2" i; for i in $(seq 1 90); do curl -fs "$url" >/dev/null 2>&1 && return 0; sleep 1; done; echo "!! $name did not answer at $url" >&2; tail -20 "$E2E_WORK/backend.log" "$E2E_WORK/frontend.log" >&2; return 1; }
wait_for "$API_BASE/module/auth/mode" backend
wait_for "$WEB_BASE/" frontend
cat >"$E2E_WORK/env.sh" <<ENV
export API_BASE="$API_BASE" WEB_BASE="$WEB_BASE" DB_PATH="$DB_PATH" JOBS_TOKEN="$JOBS_TOKEN" EXPECTED_TABLES_FILE="$EXPECTED_TABLES_FILE" TZ=Asia/Kolkata
export PATH="$E2E_VENV/bin:\$PATH" DJANGO_SETTINGS_MODULE=config.settings_e2e E2E_SQLITE_PATH="$E2E_SQLITE_PATH" E2E_WORK="$E2E_WORK"
ENV
echo "== up: $API_BASE  $WEB_BASE  db=$DB_PATH"

# ---- 4. the suites ----
export PATH="$E2E_VENV/bin:$PATH"
case "$mode" in
  up)    keep=1; echo "== staying up; Ctrl-C to stop"; wait "$BE" ;;
  smoke) ./run.sh smoke "$@" ;;
  unit)  ./run.sh unit "$@" ;;
  full)  ./run.sh all "$@" ;;
  *) echo "unknown mode: $mode" >&2; exit 2 ;;
esac
