# Web UI Template

Этот шаблон сохраняет интерфейсный стиль TrackerView для будущих проектов: плотный рабочий дашборд, список как основной экран, быстрые фильтры, избранные теги, карточки с превью и правый drawer для деталей.

## Файлы

- `index.html` - статическая структура интерфейса без привязки к backend.
- `styles.css` - дизайн-токены, layout, карточки, фильтры, drawer, hover-preview.
- `app.js` - минимальная демо-логика: поиск, фильтры, favorite tags, сортировка, drawer.
- `ui-texts.json` - пример словаря текстов для будущей локализации.
- `interface.md` - этот контекст для восстановления дизайна в новом проекте.

Шаблон можно открыть напрямую в браузере через `template/webui/index.html`. В реальном проекте обычно заменяются только данные в `state.items` и обработчик `load-form`.

## Принципы Интерфейса

- Первый экран - рабочий интерфейс, не landing page.
- Композиция плотная и утилитарная: topbar, toolbar, фильтры, status-bar, feed.
- Карточки компактные: слева постер/визуальный якорь, по центру название/описание/meta/tags, справа превью-сетка.
- Детали открываются в правом drawer, без перехода со списка.
- Фильтры раскрываются одним блоком: слева теги и вторичные фильтры, справа категории.
- Favorite tags выделяются цветом; карточки с favorite tags получают подсвеченный фон и сортируются выше.
- Hover-preview не должен быть пустым: сначала показывается доступная миниатюра/placeholder, потом можно заменить большой картинкой после загрузки.
- Текст должен помещаться в контейнеры; длинные заголовки переносятся через `overflow-wrap: anywhere`.
- Цветовая схема нейтральная темная с аккуратной light-mode адаптацией через CSS variables.

## CSS Tokens

Основные переменные лежат в `:root`:

- surfaces: `--bg`, `--surface`, `--surface-2`, `--surface-hover`
- borders: `--border`, `--border-strong`
- text: `--text`, `--text-secondary`, `--text-muted`
- semantic: `--accent`, `--success`, `--warning`, `--danger`, `--info`, `--favorite`
- geometry: `--radius-sm`, `--radius`, `--radius-lg`
- fonts: `--font-stack`, `--font-mono`

В новом проекте менять тему лучше через эти токены, а не точечно по компонентам.

## Component Map

- `.topbar` - sticky header с названием, версией и служебными действиями.
- `.toolbar` / `.toolbar-form` - ввод запроса, saved views, limit, primary action.
- `.filters-drawer` - раскрывающиеся фильтры.
- `.filter-search-input` - локальный поиск внутри длинных списков фильтров, в первую очередь тегов.
- `.chip`, `.chip-active`, `.chip-favorite` - filter chips и favorite state.
- `.status-bar` - состояние, прогресс, краткая сводка.
- `.item-feed` - основной список.
- `.item-card`, `.item-card-favorite` - карточка результата.
- `.poster`, `.poster-placeholder` - стабильный визуальный блок слева.
- `.thumb-grid`, `.thumb` - превью в два ряда при достаточном количестве.
- `.detail-drawer` - правый drawer деталей.
- `.hover-preview` - floating preview около курсора.

## Expected Data Shape

```js
{
  id: "A-1042",
  title: "Item title",
  description: "Short useful description",
  category: "Interface",
  state: "Ready",
  date: "2026-05-04",
  size: "12 KB",
  tags: ["Dashboard", "Filters"],
  thumbs: 6
}
```

Для API-проекта добавь загрузчик, который нормализует серверные данные к этой форме или к близкому shape. Не смешивай сетевую логику с render-функциями: сначала нормализуй данные, затем вызывай `render()`.

## Adaptation Checklist

1. Переименуй `app-title`, `document.title`, `ui-texts.json`.
2. Замени `state.items` на данные проекта или API-загрузчик.
3. Оставь фильтры set-based: `categories`, `tags`, `states`.
4. Для избранного используй отдельный localStorage key на проект.
5. Для длинных списков тегов оставь локальный поиск над chips.
6. Если есть картинки, не блокируй вывод списка их загрузкой.
7. Для больших картинок показывай fallback сразу, затем обновляй hover после загрузки.
8. Проверяй desktop и mobile: toolbar, filters drawer, cards, drawer, hover.

## Anti-Patterns

- Не превращать первый экран в hero/landing page.
- Не делать карточки внутри карточек.
- Не использовать декоративные gradient blobs/orbs.
- Не раздувать карточку описательным текстом о том, как пользоваться приложением.
- Не привязывать шаблон к доменам, секретам, реальным URL или tracker-specific названиям.
- Не хранить реальные конфиги рядом с шаблоном.

## Quick Start

Открой:

```text
template/webui/index.html
```

В новом проекте копируй папку целиком, затем меняй данные и тексты. Если нужен backend, оставь файлы в `public/` и добавь API-методы отдельно.
