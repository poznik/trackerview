#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
TIMEOUT_SEC="${2:-45}"

start_ts="$(date +%s)"

while true; do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    exit 0
  fi

  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"
  if [ "$elapsed" -ge "$TIMEOUT_SEC" ]; then
    echo "Timed out waiting for ${BASE_URL}/api/health after ${TIMEOUT_SEC}s" >&2
    exit 1
  fi

  sleep 1
done
