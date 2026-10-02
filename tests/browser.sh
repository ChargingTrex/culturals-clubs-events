#!/usr/bin/env bash
# Render every page in headless Chrome, as a role entitled to open it, and fail if
# any page shows an error box or is missing its own heading.
#
# Neither other suite covers this: the e2e suite proves the rules without a DOM,
# and the smoke test checks the wiring without executing it. This catches the
# render-time mistakes that only appear in a browser.
#
#   ./tests/browser.sh [base-url]
set -uo pipefail

BASE="${1:-http://127.0.0.1:4173}"
CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)"; do
    [ -x "$candidate" ] && CHROME="$candidate" && break
  done
fi
if [ -z "$CHROME" ]; then
  echo "  No Chrome or Chromium found. Set CHROME=/path/to/binary." >&2
  exit 2
fi

if ! curl -sf -o /dev/null "$BASE/index.html"; then
  echo "  Nothing served at $BASE — start one first:" >&2
  echo "    python3 -m http.server 4173" >&2
  exit 2
fi

failures=0
check() {
  local persona="$1" page="$2" expect="$3" dom errs hit
  dom=$("$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=6000 \
        --dump-dom "$BASE/tests/boot.html?as=$persona&to=$page" 2>/dev/null)
  errs=$(printf '%s' "$dom" | grep -c 'class="err"' || true)
  hit=$(printf '%s' "$dom" | grep -c "$expect" || true)
  if [ "$hit" -gt 0 ] && [ "$errs" = "0" ]; then
    printf '    \033[32m✓\033[0m %-11s %s\n' "$persona" "$page"
  else
    printf '    \033[31m✗\033[0m %-11s %-24s (heading match=%s error boxes=%s)\n' \
      "$persona" "$page" "$hit" "$errs"
    failures=$((failures + 1))
  fi
}

printf '\n  Culturals — headless render\n\n'
check student   student-events.html    "What"
check student   student-passes.html    "My passes"
check student   student-profile.html   "rofile QR"
check treasurer club-events.html       "Club events"
check treasurer club-new-event.html    "New event"
check treasurer club-budget.html       "Budget"
check president club-roster.html       "members"
check organiser organiser-scan.html    "Scan station"
check society   society-approvals.html "Cultural Society approvals"
check dean      dean-approvals.html    "Approvals"
check dean      dean-venues.html       "Venues"
check dean      dean-overview.html     "This semester"
check vc        vc-queue.html          "Above-threshold"
check vc        vc-report.html         "unique students reached"

if [ "$failures" -gt 0 ]; then
  printf '\n  %s page(s) did not render.\n' "$failures"
  exit 1
fi
printf '\n  All pages rendered.\n'
