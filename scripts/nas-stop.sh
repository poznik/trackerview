#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/volume1/docker/trackerview}"
PID_FILE="${PID_FILE:-${APP_DIR}/data/trackerview.pid}"
STOP_TIMEOUT_SEC="${STOP_TIMEOUT_SEC:-20}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

stop_pid() {
  pid="$1"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  log "Stopping TrackerView PID ${pid}"
  kill "$pid" 2>/dev/null || true

  deadline="$(( $(date +%s) + STOP_TIMEOUT_SEC ))"
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "TrackerView PID ${pid} did not stop in time; killing"
      kill -9 "$pid" 2>/dev/null || true
      break
    fi
    sleep 1
  done
}

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  stop_pid "$pid"
  rm -f "$PID_FILE"
fi

if command -v pgrep >/dev/null 2>&1; then
  pids="$(pgrep -f "node .*${APP_DIR}/src/server.js" 2>/dev/null || true)"
  for pid in $pids; do
    stop_pid "$pid"
  done
fi

log "TrackerView stopped"
