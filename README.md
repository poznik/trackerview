# TrackerView

Web app that parses tracker pages and renders a release table with:
- poster image
- description
- publication date
- seeds count
- release size

## Configuration

Settings are loaded from environment variables (`.env` supported):

- `PORT` (default `3000`)
- `TRACKER_BASE_URL` (default `https://tracker.example/forum`)
- `TRACKER_DEFAULT_SOURCE_URL` (optional fallback source URL when form input is empty; if omitted, `TRACKER_BASE_URL` is used)
- `TRACKER_TEXT_SEARCH_PATH` (default `tracker.php`, resolved relative to `TRACKER_BASE_URL`)
- `TRACKER_USERNAME` (required)
- `TRACKER_PASSWORD` (required)
- `TRACKER_MAX_RELEASES` (default `80`)
- `TRACKER_HARD_MAX_RELEASES` (default `700`, upper bound for request `maxReleases`)
- `TRACKER_CONCURRENCY` (default `4`)
- `TRACKER_REQUEST_TIMEOUT_MS` (default `25000`)
- `TRACKER_CHECK_RELEASE_URL` (optional live-check URL for `npm run check:live`)
- `TRACKER_CHECK_COLLECTION_URL` (optional live-check URL for `npm run check:live`)
- `TRACKER_CHECK_MAX_RELEASES` (optional live-check limit, default `5`)

Create local config from sample:

```bash
cp .env.example .env
```

## Run with Docker

```bash
docker compose up -d --build
```

Open:

```text
http://<NAS-IP>:3000
```

## Run locally (without Docker)

Requirements:
- Node.js 20+
- npm
- curl
- python3

Install dependencies:

```bash
npm install
```

Start local server:

```bash
npm run start:local
```

Development mode with hot reload:

```bash
npm run dev
```

Live smoke-check against running local server:

```bash
npm run check:live
```

One command for \"start + wait + live check\":

```bash
npm run dev:battle -- --once
```

Long-running local \"battle\" mode (starts server, runs checks, keeps server alive):

```bash
npm run dev:battle
```

## API

### Parse collection page

```bash
curl -s -X POST 'http://localhost:3000/api/releases' \
  -H 'content-type: application/json' \
  -d '{"pageUrl":"https://tracker.example/forum/viewtopic.php?t=12345","maxReleases":120}'
```

### Parse single release page

```bash
curl -s -X POST 'http://localhost:3000/api/release' \
  -H 'content-type: application/json' \
  -d '{"releaseUrl":"https://tracker.example/forum/viewtopic.php?t=12345"}'
```

## Notes

- The app performs tracker login before parsing each request.
- Seeds and release size are available only when login succeeds.
- Source pages in `windows-1251` are decoded automatically.
- Text query input is converted to tracker search URL on the server (`TRACKER_BASE_URL` + `TRACKER_TEXT_SEARCH_PATH`).
