#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/volume1/docker/trackerview}"
PID_FILE="${PID_FILE:-${APP_DIR}/data/trackerview.pid}"
STOP_TIMEOUT_SEC="${STOP_TIMEOUT_SEC:-20}"
PORT="${PORT:-}"

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

resolve_port() {
  if [ -n "$PORT" ]; then
    printf '%s\n' "$PORT"
    return
  fi

  if [ -f "${APP_DIR}/config.toml" ]; then
    awk '
      /^\[app\]/ { in_app = 1; next }
      /^\[/ { in_app = 0 }
      in_app && /^[[:space:]]*port[[:space:]]*=/ {
        value = $0
        sub(/^[^=]*=/, "", value)
        gsub(/[[:space:]"]/, "", value)
        if (value ~ /^[0-9]+$/) {
          print value
          exit
        }
      }
    ' "${APP_DIR}/config.toml"
    return
  fi

  printf '3000\n'
}

add_pid() {
  pid="$1"
  case "$pid" in
    ''|*[!0-9]*)
      return
      ;;
  esac

  case " ${PIDS_TO_STOP:-} " in
    *" ${pid} "*)
      return
      ;;
  esac

  PIDS_TO_STOP="${PIDS_TO_STOP:-} ${pid}"
}

add_pids_from_command() {
  command_output="$1"
  for pid in $command_output; do
    add_pid "$pid"
  done
}

collect_port_pids() {
  port="$1"

  if command -v lsof >/dev/null 2>&1; then
    add_pids_from_command "$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  fi

  if command -v fuser >/dev/null 2>&1; then
    add_pids_from_command "$(fuser -n tcp "$port" 2>/dev/null || true)"
  fi

  if command -v ss >/dev/null 2>&1; then
    add_pids_from_command "$(
      ss -ltnp 2>/dev/null \
        | awk -v port=":${port}" '$4 ~ port "$" { print }' \
        | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p'
    )"
  fi

  if command -v netstat >/dev/null 2>&1; then
    add_pids_from_command "$(
      netstat -ltnp 2>/dev/null \
        | awk -v port=":${port}" '$4 ~ port "$" { split($7, parts, "/"); if (parts[1] ~ /^[0-9]+$/) print parts[1] }'
    )"
  fi
}

is_port_listening() {
  port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v port=":${port}" '$4 ~ port "$" { found = 1 } END { exit found ? 0 : 1 }' && return 0
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk -v port=":${port}" '$4 ~ port "$" { found = 1 } END { exit found ? 0 : 1 }' && return 0
  fi

  return 1
}

PIDS_TO_STOP=""
APP_PORT="$(resolve_port)"
if [ -z "$APP_PORT" ]; then
  APP_PORT="3000"
fi

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  add_pid "$pid"
  rm -f "$PID_FILE"
fi

if command -v pgrep >/dev/null 2>&1; then
  add_pids_from_command "$(pgrep -f "node .*${APP_DIR}/src/server.js" 2>/dev/null || true)"
  add_pids_from_command "$(pgrep -f "node .*src/server\\.js" 2>/dev/null || true)"
fi

collect_port_pids "$APP_PORT"

for pid in $PIDS_TO_STOP; do
  stop_pid "$pid"
done

if is_port_listening "$APP_PORT"; then
  log "ERROR: Port ${APP_PORT} is still in use after stopping TrackerView"
  exit 1
fi

log "TrackerView stopped"
