#!/usr/bin/env bash
# Usage: ./run.sh api|ui|all [extra robot options, e.g. --include smoke]
# Starts nothing: the backend (API_BASE) and, for ui, the frontend (WEB_BASE) must be up.
set -euo pipefail
cd "$(dirname "$0")"
what="${1:?api | ui | all}"; shift
case "$what" in
  api) suites=api ;;
  ui) suites=ui ;;
  all) suites="api ui" ;;
  *) echo "unknown: $what" >&2; exit 2 ;;
esac
exec robot --argumentfile robot.args --name culturals-e2e "$@" $suites
