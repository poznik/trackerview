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
- `TRACKER_USERNAME` (required)
- `TRACKER_PASSWORD` (required)
- `TRACKER_MAX_RELEASES` (default `80`)
- `TRACKER_CONCURRENCY` (default `4`)
- `TRACKER_REQUEST_TIMEOUT_MS` (default `25000`)

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
  -d '{"pageUrl":"https://tracker.example/forum/viewtopic.php?t=3268103","maxReleases":120}'
```

### Parse single release page

```bash
curl -s -X POST 'http://localhost:3000/api/release' \
  -H 'content-type: application/json' \
  -d '{"releaseUrl":"https://tracker.example/forum/viewtopic.php?t=3164896"}'
```

## Notes

- The app performs tracker login before parsing each request.
- Seeds and release size are available only when login succeeds.
- Source pages in `windows-1251` are decoded automatically.
