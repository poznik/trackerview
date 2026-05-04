#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/volume1/docker/trackerview}"
PID_FILE="${PID_FILE:-${APP_DIR}/data/trackerview.pid}"
LOG_FILE="${LOG_FILE:-${APP_DIR}/logs/trackerview.log}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

command -v node >/dev/null 2>&1 || fail "node is not installed or not in PATH"

mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"
cd "$APP_DIR"

if [ -f "$PID_FILE" ]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    log "TrackerView is already running with PID ${old_pid}"
    exit 0
  fi
fi

TRACKERVIEW_CONFIG_PATH="${TRACKERVIEW_CONFIG_PATH:-${APP_DIR}/config.toml}"
export TRACKERVIEW_CONFIG_PATH

nohup node "${APP_DIR}/src/server.js" >>"$LOG_FILE" 2>&1 &
pid="$!"
printf '%s\n' "$pid" >"$PID_FILE"

sleep 1
if ! kill -0 "$pid" 2>/dev/null; then
  tail -n 80 "$LOG_FILE" 2>/dev/null || true
  fail "TrackerView failed to start"
fi

log "TrackerView started with PID ${pid}"
