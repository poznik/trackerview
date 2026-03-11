#!/usr/bin/env bash
set -euo pipefail

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:3000}}"
CHECK_RELEASE_URL="${TRACKER_CHECK_RELEASE_URL:-}"
CHECK_COLLECTION_URL="${TRACKER_CHECK_COLLECTION_URL:-}"
CHECK_MAX_RELEASES="${TRACKER_CHECK_MAX_RELEASES:-5}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd python3

echo "[1/3] Health check ${BASE_URL}/api/health"
health_payload="$(curl -fsS "${BASE_URL}/api/health")"
python3 - <<'PY' "$health_payload"
import json
import sys
payload = json.loads(sys.argv[1])
if payload.get("status") != "ok":
    raise SystemExit("Health check failed: status != ok")
print("Health OK")
PY

if [ -n "$CHECK_RELEASE_URL" ]; then
  echo "[2/3] Release check (${CHECK_RELEASE_URL})"
  release_request_json="$(python3 - <<'PY' "$CHECK_RELEASE_URL"
import json
import sys
print(json.dumps({"releaseUrl": sys.argv[1]}))
PY
)"
  release_payload="$(curl -fsS -X POST "${BASE_URL}/api/release" -H 'content-type: application/json' -d "$release_request_json")"
  python3 - <<'PY' "$release_payload"
import json
import sys

payload = json.loads(sys.argv[1])
release = payload.get("release")
if not isinstance(release, dict):
    raise SystemExit("Release response has no release object")

topic_url = str(release.get("topicUrl", "")).strip()
if not topic_url:
    raise SystemExit("Release response has empty topicUrl")

title = str(release.get("title", "")).strip()
if not title:
    raise SystemExit("Release response has empty title")

seeds = release.get("seeds")
if not ((isinstance(seeds, int) and seeds >= 0) or seeds == "-"):
    raise SystemExit(f"Unexpected seeds value: {seeds!r}")

size = str(release.get("size", "")).strip()
if not size:
    raise SystemExit("Release response has empty size")

print(f"Release OK: title={title[:60]!r}, seeds={seeds}, size={size}")
PY
else
  echo "[2/3] Release check skipped (set TRACKER_CHECK_RELEASE_URL to enable)"
fi

if [ -n "$CHECK_COLLECTION_URL" ]; then
  echo "[3/3] Collection check (${CHECK_COLLECTION_URL}, maxReleases=${CHECK_MAX_RELEASES})"
  collection_request_json="$(python3 - <<'PY' "$CHECK_COLLECTION_URL" "$CHECK_MAX_RELEASES"
import json
import sys

try:
    max_releases = int(sys.argv[2])
except ValueError:
    max_releases = 5

if max_releases < 1:
    max_releases = 1

print(json.dumps({"pageUrl": sys.argv[1], "maxReleases": max_releases}))
PY
)"
  collection_payload="$(curl -fsS -X POST "${BASE_URL}/api/releases" -H 'content-type: application/json' -d "$collection_request_json")"
  python3 - <<'PY' "$collection_payload"
import json
import sys

payload = json.loads(sys.argv[1])
releases = payload.get("releases")
if not isinstance(releases, list) or not releases:
    raise SystemExit("Collection response has no releases")

valid_entries = [item for item in releases if isinstance(item, dict)]
if not valid_entries:
    raise SystemExit("Collection response has no valid release objects")

if not any(str(item.get("topicUrl", "")).strip() for item in valid_entries):
    raise SystemExit("Collection response has no release with topicUrl")

if not any(str(item.get("title", "")).strip() for item in valid_entries):
    raise SystemExit("Collection response has no release with title")

print(f"Collection OK: parsed={len(valid_entries)}")
PY
else
  echo "[3/3] Collection check skipped (set TRACKER_CHECK_COLLECTION_URL to enable)"
fi

if [ -z "$CHECK_RELEASE_URL" ] && [ -z "$CHECK_COLLECTION_URL" ]; then
  echo "Live checks completed (health check only)."
else
  echo "All configured live checks passed."
fi
