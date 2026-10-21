#!/bin/sh
# Loads the real extension into Chromium and drives a mock inbox. Needs: pip install playwright && playwright install chromium
# (On a machine with no display, run it as: xvfb-run -a sh scripts/run-browser-tests.sh)
set -e
cd "$(dirname "$0")/.."
for t in test_core_flows test_welcome_savebar_and_hostile_data test_assistant test_optional_model; do
  printf '%s: ' "$t"
  python3 "tests/browser/$t.py" | tail -1
done
