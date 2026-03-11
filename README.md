# TrackerView

TrackerView — веб-приложение для парсинга страниц торрент-трекера и просмотра релизов в удобной таблице.

Проект ориентирован на трекеры с похожей структурой страниц (например, `login.php`, `viewtopic.php`, `viewforum.php`/`tracker.php` и классическая пагинация через `start`).

## Возможности

- Парсинг по URL страницы или по текстовому запросу.
- Асинхронный парсинг через job API с прогрессом (`totalFound` / `processed`).
- Парсинг одиночной темы и страниц-коллекций с переходом по пагинации.
- Отображение постера, описания, даты публикации, размера, сидов и ссылок на `.torrent`.
- Извлечение и нормализация скриншотов (Fastpic/Imgbox), превью при наведении.
- Сортировка релизов по дате на клиенте.
- Фильтры по категориям с сохранением состояния.
- Сохраненные поиски (saved searches).
- Авто-декодирование страниц в `windows-1251` / `cp1251`.
- Ограничение числа релизов через soft-limit и hard-limit.

## Технологии

- Backend: Node.js 20+, Express, Cheerio, iconv-lite.
- Frontend: статический HTML/CSS + vanilla JS.
- Хранилище состояния: JSON-файлы в `data/`.

## Требования

- Node.js `>=20`
- npm
- curl
- python3 (для `npm run check:live`)

## Быстрый старт (локально)

1. Создайте конфиг:

```bash
cp .env.example .env
```

2. Заполните в `.env` минимум:
- `TRACKER_BASE_URL`
- `TRACKER_USERNAME`
- `TRACKER_PASSWORD`

3. Установите зависимости:

```bash
npm install
```

4. Запустите сервер:

```bash
npm run start:local
```

5. Откройте:

```text
http://127.0.0.1:3000
```

## Запуск в Docker

```bash
docker compose up -d --build
```

Приложение будет доступно на `http://<host>:3000`.

## Пошаговый запуск на Synology NAS (DSM 7.2.2, Node.js v22)

Ниже сценарий запуска без Docker, напрямую через установленный пакет Node.js v22.

1. Включите SSH на NAS.
В DSM: `Панель управления -> Терминал и SNMP -> Включить службу SSH`.

2. Подключитесь к NAS по SSH:

```bash
ssh <ваш_пользователь>@<ip_nas>
```

3. Проверьте, что Node.js и npm доступны:

```bash
node -v
npm -v
which node
which npm
```

4. Подготовьте директорию приложения (пример):

```bash
sudo -i
mkdir -p /volume1/docker/trackerview
cd /volume1/docker/trackerview
```

5. Получите код приложения:

```bash
git clone https://github.com/poznik/trackerview.git .
```

Если проект уже загружен, используйте:

```bash
git pull
```

6. Создайте и заполните `.env`:

```bash
cp .env.example .env
```

Минимально заполните:
- `TRACKER_BASE_URL`
- `TRACKER_USERNAME`
- `TRACKER_PASSWORD`

7. Установите зависимости:

```bash
npm ci --omit=dev
```

Если `npm ci` не подходит (например, меняли `package-lock.json`), используйте:

```bash
npm install --omit=dev
```

8. Запустите приложение вручную для проверки:

```bash
npm run start:local
```

Откройте в браузере:

```text
http://<ip_nas>:3000
```

9. Настройте автозапуск через Планировщик задач DSM.
В DSM: `Панель управления -> Планировщик задач -> Создать -> Запускаемая по событию -> Пользовательский сценарий`.

- Пользователь: `root`
- Событие: `При запуске`
- Сценарий:

```bash
APP_DIR="/volume1/docker/trackerview"
NODE_BIN="/var/packages/Node.js_v22/target/usr/local/bin/node"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/server.log"

mkdir -p "$LOG_DIR"
if pgrep -f "$APP_DIR/src/server.js" >/dev/null 2>&1; then
  exit 0
fi

cd "$APP_DIR"
nohup "$NODE_BIN" src/server.js >> "$LOG_FILE" 2>&1 &
```

10. Проверка после перезагрузки NAS:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

Ожидаемый ответ:

```json
{"status":"ok"}
```

### Обновление приложения на NAS

```bash
cd /volume1/docker/trackerview
git pull
npm ci --omit=dev
pkill -f "/volume1/docker/trackerview/src/server.js" || true
nohup /var/packages/Node.js_v22/target/usr/local/bin/node src/server.js >> /volume1/docker/trackerview/logs/server.log 2>&1 &
```

### Типовые проблемы на DSM

- `node: command not found` в Планировщике задач:
используйте абсолютный путь к Node (`/var/packages/Node.js_v22/target/usr/local/bin/node`).
- Приложение не открывается извне:
проверьте правила DSM Firewall и проброс порта `3000`.
- Ошибка логина трекера:
проверьте `TRACKER_USERNAME`, `TRACKER_PASSWORD`, `TRACKER_BASE_URL` в `.env`.

## Конфигурация (`.env`)

| Переменная | По умолчанию | Обязательно | Назначение |
|---|---|---|---|
| `PORT` | `3000` | нет | Порт Express-сервера |
| `TRACKER_BASE_URL` | `https://tracker.example/forum` | да | Базовый URL трекера |
| `TRACKER_DEFAULT_SOURCE_URL` | `` | нет | URL источника при пустом вводе (если пусто, используется `TRACKER_BASE_URL`) |
| `TRACKER_TEXT_SEARCH_PATH` | `tracker.php` | нет | Путь/URL для текстового поиска (резолвится от `TRACKER_BASE_URL`) |
| `TRACKER_USERNAME` | `` | да | Логин трекера |
| `TRACKER_PASSWORD` | `` | да | Пароль трекера |
| `TRACKER_MAX_RELEASES` | `80` | нет | Значение `maxReleases` по умолчанию |
| `TRACKER_HARD_MAX_RELEASES` | `700` | нет | Верхний предел `maxReleases` для запросов |
| `TRACKER_CONCURRENCY` | `4` | нет | Параллелизм парсинга страниц релизов |
| `TRACKER_REQUEST_TIMEOUT_MS` | `25000` | нет | HTTP timeout для запросов к трекеру |
| `TRACKER_USER_AGENT` | `TrackerViewBot/0.1 (+https://localhost)` | нет | User-Agent запросов к трекеру |
| `TRACKER_CHECK_RELEASE_URL` | `` | нет | URL релиза для live-check |
| `TRACKER_CHECK_COLLECTION_URL` | `` | нет | URL коллекции для live-check |
| `TRACKER_CHECK_MAX_RELEASES` | `5` | нет | Лимит релизов в live-check коллекции |

### Как выбирается источник парсинга

Для `POST /api/releases` и `POST /api/releases/job` источник определяется в таком порядке:

1. `pageUrl` из запроса (если валидный URL).
2. `queryText` из запроса (сервер сам строит URL поиска через `TRACKER_BASE_URL + TRACKER_TEXT_SEARCH_PATH`).
3. `TRACKER_DEFAULT_SOURCE_URL`.
4. `TRACKER_BASE_URL`.

## Скрипты npm

- `npm start` — запуск production-сервера.
- `npm run start:local` — локальный запуск сервера.
- `npm run dev` — запуск с `nodemon`.
- `npm run check:live` — health-check + опциональные проверки релиза/коллекции.
- `npm run dev:battle` — поднимает сервер, ждет health, запускает live-check.

### Поведение `check:live`

- Если `TRACKER_CHECK_RELEASE_URL` не задан, проверка релиза пропускается.
- Если `TRACKER_CHECK_COLLECTION_URL` не задан, проверка коллекции пропускается.
- Если обе переменные пустые, выполняется только `/api/health`.

## HTTP API

### `GET /api/health`

Проверка доступности сервера.

### `GET /api/client-config`

Конфигурация для фронтенда:
- `tracker.defaultSourceUrl`
- `tracker.maxReleases`
- `tracker.hardMaxReleases`

### `POST /api/release`

Парсинг одной темы.

Пример:

```bash
curl -s -X POST 'http://localhost:3000/api/release' \
  -H 'content-type: application/json' \
  -d '{"releaseUrl":"https://tracker.example/forum/viewtopic.php?t=12345"}'
```

### `POST /api/releases`

Синхронный парсинг коллекции.

Пример с URL:

```bash
curl -s -X POST 'http://localhost:3000/api/releases' \
  -H 'content-type: application/json' \
  -d '{"pageUrl":"https://tracker.example/forum/viewforum.php?f=10","maxReleases":120}'
```

Пример с текстовым запросом:

```bash
curl -s -X POST 'http://localhost:3000/api/releases' \
  -H 'content-type: application/json' \
  -d '{"queryText":"studio name 2025","maxReleases":50}'
```

### `POST /api/releases/job`

Асинхронный запуск парсинга. Возвращает `jobId`.

```bash
curl -s -X POST 'http://localhost:3000/api/releases/job' \
  -H 'content-type: application/json' \
  -d '{"pageUrl":"https://tracker.example/forum/viewforum.php?f=10","maxReleases":80}'
```

### `GET /api/releases/job/:jobId`

Получение состояния job:
- `status`: `running` / `done` / `error`
- `totalFound`, `processed`
- `releases`
- `categories`
- `error`

### `GET /api/categories`
### `POST /api/categories`

Чтение и обновление состояния фильтров категорий.

### `GET /api/saved-searches`
### `POST /api/saved-searches`

Чтение и сохранение пользовательских поисков (`name` + `url`).

## Постоянные данные

Во время работы создаются/обновляются файлы:

- `data/categories.json`
- `data/saved-searches.json`

## Ограничения и допущения

- Трекер должен поддерживать логин через `POST /login.php` с полями `login_username` и `login_password`.
- Верификация логина завязана на признаки страницы авторизованного пользователя.
- Логика поиска тем и парсинг полей ориентированы на типовую структуру страниц phpBB-подобных трекеров.
- Если структура HTML у конкретного трекера существенно отличается, потребуется адаптация `src/parser.js`.
