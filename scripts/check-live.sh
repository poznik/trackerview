#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"

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

echo "[2/3] Release check (t=3164896)"
release_payload="$(curl -fsS -X POST "${BASE_URL}/api/release" -H 'content-type: application/json' -d '{"releaseUrl":"https://tracker.example/forum/viewtopic.php?t=3164896"}')"
python3 - <<'PY' "$release_payload"
import json
import sys

payload = json.loads(sys.argv[1])
release = payload.get("release")
if not isinstance(release, dict):
    raise SystemExit("Release response has no release object")

if release.get("topicId") != "3164896":
    raise SystemExit(f"Unexpected topicId: {release.get('topicId')}")

size = str(release.get("size", ""))
if "9.28" not in size or "GB" not in size.upper():
    raise SystemExit(f"Unexpected size value: {size!r}")

seeds = release.get("seeds")
if not ((isinstance(seeds, int) and seeds >= 0) or seeds == "-"):
    raise SystemExit(f"Unexpected seeds value: {seeds!r}")

print(f"Release OK: seeds={seeds}, size={size}")
PY

echo "[3/3] Collection check (t=3268103, maxReleases=5)"
collection_payload="$(curl -fsS -X POST "${BASE_URL}/api/releases" -H 'content-type: application/json' -d '{"pageUrl":"https://tracker.example/forum/viewtopic.php?t=3268103","maxReleases":5}')"
python3 - <<'PY' "$collection_payload"
import json
import sys

payload = json.loads(sys.argv[1])
releases = payload.get("releases")
if not isinstance(releases, list) or not releases:
    raise SystemExit("Collection response has no releases")

ok_seed = any(
    (isinstance(item.get("seeds"), int) and item.get("seeds") >= 0) or item.get("seeds") == "-"
    for item in releases
    if isinstance(item, dict)
)
ok_size = any(bool(str(item.get("size", "")).strip()) for item in releases if isinstance(item, dict))

if not ok_seed:
    raise SystemExit("No release with seeds or cached marker in collection response")
if not ok_size:
    raise SystemExit("No release with parsed size in collection response")

print(f"Collection OK: parsed={len(releases)}")
PY

echo "All live checks passed."
