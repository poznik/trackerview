#!/bin/sh
set -eu

APP_DIR="${APP_DIR:-/volume1/docker/trackerview}"
GIT_REMOTE_URL="${GIT_REMOTE_URL:-https://github.com/poznik/trackerview.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-90}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

need_file() {
  if [ ! -f "$1" ]; then
    fail "Required file is missing: $1"
  fi
}

command -v git >/dev/null 2>&1 || fail "git is not installed or not in PATH"
command -v npm >/dev/null 2>&1 || fail "npm is not installed or not in PATH"
command -v node >/dev/null 2>&1 || fail "node is not installed or not in PATH"

need_file "${APP_DIR}/config.toml"
need_file "${APP_DIR}/.env"
need_file "${APP_DIR}/scripts/nas-start.sh"
need_file "${APP_DIR}/scripts/nas-stop.sh"
need_file "${APP_DIR}/scripts/wait-for-health.sh"

cd "$APP_DIR"

if [ ! -d "${APP_DIR}/.git" ]; then
  fail "${APP_DIR} is not a Git checkout. Clone ${GIT_REMOTE_URL} into ${APP_DIR} for button updates."
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$GIT_REMOTE_URL"
fi

current_remote="$(git remote get-url origin 2>/dev/null || true)"
if [ "$current_remote" != "$GIT_REMOTE_URL" ]; then
  log "Setting origin to ${GIT_REMOTE_URL}"
  git remote set-url origin "$GIT_REMOTE_URL"
fi

log "Stopping current TrackerView service"
sh "${APP_DIR}/scripts/nas-stop.sh" || true

log "Fetching ${GIT_BRANCH} from GitHub"
git fetch --prune origin "$GIT_BRANCH"
git checkout -B "$GIT_BRANCH" "origin/${GIT_BRANCH}"
git reset --hard "origin/${GIT_BRANCH}"

log "Ensuring old TrackerView process is stopped"
sh "${APP_DIR}/scripts/nas-stop.sh" || true

log "Installing production dependencies"
npm ci --omit=dev

log "Starting TrackerView"
sh "${APP_DIR}/scripts/nas-start.sh"

log "Waiting for health check"
sh "${APP_DIR}/scripts/wait-for-health.sh" "$HEALTH_URL" "$HEALTH_TIMEOUT_SEC"

version="$(node -e "console.log(require('./src/version').resolveAppVersion())" 2>/dev/null || true)"
log "Update finished${version:+: ${version}}"
