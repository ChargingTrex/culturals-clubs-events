#!/usr/bin/env bash
# Usage: ./run.sh api|ui|all|smoke|unit|tables [extra robot options, e.g. --include members]
# Starts nothing: the backend (API_BASE) and, for ui, the frontend (WEB_BASE) must be up. ci.sh starts both.
set -euo pipefail
cd "$(dirname "$0")"
what="${1:?api | ui | all | smoke | unit | tables}"; shift
mkdir -p results
case "$what" in
  api) suites=api ;;
  ui) suites=ui ;;
  all) suites="api ui" ;;
  smoke) suites="api ui"; set -- --include smoke "$@" ;;
  unit) suites=api; set -- --include unit "$@" ;;
  tables)
    # The table list Django expects, for api/09's schema check. Uses the backend's own settings
    # (DJANGO_SETTINGS_MODULE, e.g. config.settings_e2e under ci.sh) and the venv's python.
    py="${E2E_PYTHON:-python}"
    out="${EXPECTED_TABLES_FILE:-results/expected_tables.json}"
    (cd ../backend && "$py" -c "import django, json, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup(); from django.apps import apps; print(json.dumps(sorted({m._meta.db_table for m in apps.get_models(include_auto_created=True)})))") > "$out"
    echo "wrote $(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$out") table names to $out"
    exit 0 ;;
  *) echo "unknown: $what" >&2; exit 2 ;;
esac
exec robot --argumentfile robot.args --name culturals-e2e "$@" $suites
