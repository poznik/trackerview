# TrackerView

TrackerView — веб-приложение для парсинга страниц торрент-трекера и просмотра релизов в удобной таблице.

Проект ориентирован на трекеры с похожей структурой страниц (например, `login.php`, `viewtopic.php`, `viewforum.php`/`tracker.php` и классическая пагинация через `start`).

## Возможности

- Парсинг по URL страницы или по текстовому запросу.
- Встроенный поиск `Популярные релизы` по URL чартов из `tracker.popular_url`.
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

## Версионирование

- Формат версии: `MAJOR.MINOR.PATCH`, например `0.2.1`.
- Версия задается вручную в `package.json` или параметром `-Version` для `scripts/build-release.ps1`.
- На NAS версия берется из `package.json`; при обновлении через кнопку код подтягивается из GitHub.

## Требования

- Node.js `>=20`
- npm
- curl
- python3 (для `npm run check:live`)

## Быстрый старт (локально)

1. Создайте конфиги:

```bash
cp config.toml.example config.toml
cp .env.example .env
```

2. Заполните `tracker.base_url` и другие не-секретные настройки в `config.toml`, а в `.env` минимум:
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

## Release для Synology NAS

Основная схема NAS-развертывания: сервис запускается напрямую на железе NAS как Node.js-процесс, без Docker. Код обновляется из GitHub, кнопка `Обновить` запускает `/volume1/docker/trackerview/update.sh`.

1. Подготовьте локальный `config.toml`:

```powershell
Copy-Item config.toml.example config.toml
```

2. Соберите release-пакет:

```powershell
npm run release
```

Скрипт создаст `release/<version>` и положит туда только файлы, которые нужно передать на NAS:
- исходники `src/`, `public/`
- `package.json`, `package-lock.json`
- `config.toml`
- `.env.example`
- `update.sh`
- `scripts/nas-start.sh`
- `scripts/nas-stop.sh`
- `scripts/wait-for-health.sh`
- `INSTALL_NAS.md`
- `manifest.json`

3. Первый запуск на NAS из GitHub:

```bash
mkdir -p /volume1/docker
cd /volume1/docker
git clone -b main https://github.com/poznik/trackerview.git trackerview
cd /volume1/docker/trackerview
```

4. Перенесите из `release/<version>` на NAS:
- `config.toml` -> `/volume1/docker/trackerview/config.toml`
- `.env.example` -> `/volume1/docker/trackerview/.env`, затем заполните секреты

```bash
cd /volume1/docker/trackerview
vi .env
```

5. Установите production-зависимости и запустите сервис:

```bash
cd /volume1/docker/trackerview
npm ci --omit=dev
sh scripts/nas-start.sh
sh scripts/wait-for-health.sh http://127.0.0.1:3000 90
```

Update-скрипт останавливает локальный Node.js-процесс, делает `git fetch/reset` до `origin/main`, выполняет `npm ci --omit=dev`, запускает сервис и ждет `/api/health`.

Папка прямого скачивания используется напрямую: `/volume1/Downloads/data`.

## Конфигурация

Не-секретные настройки хранятся в `config.toml`, секреты в `.env`.

### `config.toml`

| Ключ | По умолчанию | Обязательно | Назначение |
|---|---|---|---|
| `app.port` | `3000` | нет | Порт Express-сервера |
| `app.update_script_path` | `/volume1/docker/trackerview/update.sh` | нет | Путь до update-скрипта, если кнопка обновления запускается из приложения |
| `tracker.base_url` | `https://tracker.example/forum` | да | Базовый URL трекера |
| `tracker.default_source_url` | `` | нет | URL источника при пустом вводе |
| `tracker.popular_url` | `` | нет | URL раздела чартов для встроенного поиска `Популярные релизы` |
| `tracker.text_search_path` | `tracker.php` | нет | Путь/URL для текстового поиска |
| `tracker.direct_download_dir` | `/volume1/Downloads/data` | нет | Папка серверного сохранения `.torrent` |
| `tracker.max_releases` | `80` | нет | Значение `maxReleases` по умолчанию |
| `tracker.hard_max_releases` | `700` | нет | Верхний предел `maxReleases` |
| `tracker.concurrency` | `4` | нет | Параллелизм парсинга страниц релизов |
| `tracker.request_timeout_ms` | `25000` | нет | HTTP timeout для запросов к трекеру |
| `tracker.user_agent` | `TrackerViewBot/0.1 (+https://localhost)` | нет | User-Agent запросов к трекеру |
| `cache.pics_dir` | `cache/pics` | нет | Локальная папка кеша картинок, отдаваемых через `/cache/pics/...` |
| `cache.pics_concurrency` | `3` | нет | Параллелизм скачивания новых картинок в кеш; постеры и первые 3 превью получают приоритет |
| `diagnostics.enabled` | `false` | нет | Включает расширенные JSON-логи производительности |
| `diagnostics.log_requests` | `true` | нет | Логирует HTTP-запросы к трекеру/внешним страницам: статус, байты, длительность |
| `diagnostics.log_release_details` | `true` | нет | Логирует подробности по каждому релизу: cache hit/miss, fetch/parse/enrich timings |
| `diagnostics.slow_request_ms` | `1000` | нет | Порог медленного HTTP-запроса, мс |
| `diagnostics.slow_release_ms` | `2000` | нет | Порог медленной обработки релиза, мс |
| `diagnostics.progress_every` | `10` | нет | Частота progress-логов по обработанным релизам |

На NAS при запуске через `scripts/nas-start.sh` диагностические логи пишутся в:

```text
/volume1/docker/trackerview/logs/trackerview.log
```

Для анализа медленной большой выборки включите:

```toml
[diagnostics]
enabled = true
log_requests = true
log_release_details = true
slow_request_ms = 1000
slow_release_ms = 2000
progress_every = 10
```

Сводка по собранным диагностическим логам:

```bash
node scripts/diagnostics-summary.js logs/trackerview.log
```

### `.env`

| Переменная | Обязательно | Назначение |
|---|---|---|
| `TRACKER_USERNAME` | да | Логин трекера |
| `TRACKER_PASSWORD` | да | Пароль трекера |

### Как выбирается источник парсинга

Для `POST /api/releases` и `POST /api/releases/job` источник определяется в таком порядке:

1. `sourceMode=popular` из запроса (использует `tracker.popular_url`).
2. `pageUrl` из запроса (если валидный URL).
3. `queryText` из запроса (сервер сам строит URL поиска через `tracker.base_url + tracker.text_search_path`).
4. `tracker.default_source_url`.
5. `tracker.base_url`.

## Скрипты npm

- `npm start` — запуск production-сервера.
- `npm run start:local` — локальный запуск сервера.
- `npm run dev` — запуск с `nodemon`.
- `npm run release` — сборка NAS-local release-пакета в `release/<version>`.
- `npm run diagnostics:summary -- logs/trackerview.log` — сводка по JSON-логам диагностики.
- `npm run check:live` — health-check + опциональные проверки релиза/коллекции.
- `npm run dev:battle` — поднимает сервер, ждет health, запускает live-check.

### Поведение `check:live`

- Если `TRACKER_CHECK_RELEASE_URL` не задан, проверка релиза пропускается.
- Если `TRACKER_CHECK_COLLECTION_URL` не задан, проверка коллекции пропускается.
- Если обе переменные пустые, выполняется только `/api/health`.

## HTTP API

### `GET /api/health`

Проверка доступности сервера.

### `GET /api/version`

Публичный маршрут для получения версии приложения.

### `GET /api/auth/status`

Проверка текущей сессии авторизации в приложении.

### `POST /api/auth/login`

Вход в приложение по `username` + `password`.
Учетные данные должны совпадать с `TRACKER_USERNAME` и `TRACKER_PASSWORD`.
Успешный вход создает HTTP-only cookie-сессию на 24 часа.

### `POST /api/auth/logout`

Завершение текущей сессии.

### `GET /api/admin/update`

Статус кнопки обновления:
- `enabled` — найден ли скрипт обновления.
- `running` — запущено ли обновление сейчас.

### `POST /api/admin/update`

Запускает скрипт обновления (`app.update_script_path`) в фоне.
Маршрут защищен авторизацией приложения.

### `GET /api/client-config`

Конфигурация для фронтенда:
- `app.version`
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
