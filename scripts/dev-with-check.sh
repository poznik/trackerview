#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT:-3000}}"
ONCE="${1:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd curl
require_cmd python3

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting local server on ${BASE_URL}"
npm run start:local >/tmp/trackerview-dev.log 2>&1 &
SERVER_PID="$!"

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

bash scripts/wait-for-health.sh "$BASE_URL" 60
bash scripts/check-live.sh "$BASE_URL"

if [ "$ONCE" = "--once" ]; then
  echo "Checks finished in one-shot mode."
  exit 0
fi

echo "Server is running. Logs: /tmp/trackerview-dev.log"
echo "Open: ${BASE_URL}"
echo "Stop: Ctrl+C"
wait "$SERVER_PID"
