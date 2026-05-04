const STORAGE_KEY = "webui-template:favorites";

const state = {
  query: "",
  sortDesc: true,
  categories: new Set(),
  tags: new Set(),
  states: new Set(),
  tagQuery: "",
  favoriteTags: new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")),
  items: [
    {
      id: "A-1042",
      title: "Operational dashboard layout",
      description: "Dense list-first interface with filters, quick metadata, preview area, and drawer details.",
      category: "Interface",
      state: "Ready",
      date: "2026-05-04",
      size: "12 KB",
      tags: ["Dashboard", "Filters", "Drawer"],
      thumbs: 6
    },
    {
      id: "A-1038",
      title: "Async media preview flow",
      description: "Show a small cached preview immediately, then replace it with a larger asset when it is ready.",
      category: "Media",
      state: "Review",
      date: "2026-05-03",
      size: "28 KB",
      tags: ["Preview", "Cache", "Async"],
      thumbs: 4
    },
    {
      id: "A-1024",
      title: "Favorite tag ranking",
      description: "Favorite tags are highlighted in filters and their matching cards rise to the top of the feed.",
      category: "Filtering",
      state: "Ready",
      date: "2026-04-30",
      size: "9 KB",
      tags: ["Favorites", "Filters", "Ranking"],
      thumbs: 3
    }
  ]
};

const nodes = {
  form: document.querySelector("#load-form"),
  query: document.querySelector("#source-query"),
  maxItems: document.querySelector("#max-items"),
  loadButton: document.querySelector("#load-btn"),
  filtersToggle: document.querySelector("#filters-toggle"),
  filtersDrawer: document.querySelector("#filters-drawer"),
  sortButton: document.querySelector("#sort-date-btn"),
  sortArrow: document.querySelector("#sort-arrow"),
  tagFilterSearch: document.querySelector("#tag-filter-search"),
  tagFilters: document.querySelector("#tag-filters"),
  stateFilters: document.querySelector("#state-filters"),
  categoryFilters: document.querySelector("#category-filters"),
  status: document.querySelector("#status"),
  progress: document.querySelector("#progress-counter"),
  summary: document.querySelector("#summary"),
  feed: document.querySelector("#item-feed"),
  drawer: document.querySelector("#detail-drawer"),
  drawerBackdrop: document.querySelector("#drawer-backdrop"),
  drawerClose: document.querySelector("#drawer-close"),
  drawerContent: document.querySelector("#drawer-content"),
  hover: document.querySelector("#hover-preview"),
  hoverImage: document.querySelector("#hover-preview-image")
};

function persistFavorites() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.favoriteTags]));
}

function uniqueValues(getter) {
  return [...new Set(state.items.flatMap((item) => getter(item)))].sort((a, b) => a.localeCompare(b));
}

function hasFavoriteTag(item) {
  return item.tags.some((tag) => state.favoriteTags.has(tag));
}

function matchesFilters(item) {
  const text = `${item.title} ${item.description} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
  if (state.query && !text.includes(state.query.toLowerCase())) return false;
  if (state.categories.size && !state.categories.has(item.category)) return false;
  if (state.states.size && !state.states.has(item.state)) return false;
  if (state.tags.size && !item.tags.some((tag) => state.tags.has(tag))) return false;
  return true;
}

function visibleItems() {
  const items = state.items.filter(matchesFilters);
  items.sort((left, right) => {
    const favoriteDelta = Number(hasFavoriteTag(right)) - Number(hasFavoriteTag(left));
    if (favoriteDelta !== 0) return favoriteDelta;
    const dateDelta = new Date(right.date).getTime() - new Date(left.date).getTime();
    return state.sortDesc ? dateDelta : -dateDelta;
  });
  return items.slice(0, Number.parseInt(nodes.maxItems.value, 10) || 80);
}

function createChip(label, set, options = {}) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `chip${set.has(label) ? " chip-active" : ""}${state.favoriteTags.has(label) ? " chip-favorite" : ""}`;
  chip.textContent = label;
  chip.addEventListener("click", () => {
    if (set.has(label)) set.delete(label);
    else set.add(label);
    render();
  });

  if (options.favorite) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = "chip-star";
    star.title = state.favoriteTags.has(label) ? "Убрать из избранного" : "Добавить в избранное";
    star.textContent = state.favoriteTags.has(label) ? "★" : "☆";
    star.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.favoriteTags.has(label)) state.favoriteTags.delete(label);
      else state.favoriteTags.add(label);
      persistFavorites();
      render();
    });
    chip.appendChild(star);
  }

  return chip;
}

function renderFilterGroup(container, values, set, options = {}) {
  container.replaceChildren();
  for (const value of values) {
    container.appendChild(createChip(value, set, options));
  }
}

function renderTagFilters(values) {
  const query = state.tagQuery.trim().toLocaleLowerCase("ru");
  const filteredValues = query
    ? values.filter((value) => value.toLocaleLowerCase("ru").includes(query))
    : values;

  nodes.tagFilterSearch.disabled = values.length === 0;
  nodes.tagFilters.replaceChildren();

  if (values.length > 0 && filteredValues.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chip-empty";
    empty.textContent = "Нет тегов под этот поиск.";
    nodes.tagFilters.appendChild(empty);
    return;
  }

  for (const value of filteredValues) {
    nodes.tagFilters.appendChild(createChip(value, state.tags, { favorite: true }));
  }
}

function initials(title) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function createThumb(index) {
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  thumb.style.background = `linear-gradient(135deg, hsl(${220 + index * 18} 34% 28%), hsl(${205 + index * 14} 28% 14%))`;
  thumb.addEventListener("mouseenter", (event) => showHover(event, thumb));
  thumb.addEventListener("mousemove", moveHover);
  thumb.addEventListener("mouseleave", hideHover);
  return thumb;
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = `item-card${hasFavoriteTag(item) ? " item-card-favorite" : ""}`;
  card.tabIndex = 0;
  card.setAttribute("role", "article");

  const poster = document.createElement("div");
  poster.className = "poster";
  const posterText = document.createElement("div");
  posterText.className = "poster-placeholder";
  posterText.textContent = initials(item.title);
  poster.appendChild(posterText);

  const main = document.createElement("div");
  main.className = "card-main";
  main.innerHTML = `
    <div class="card-title-row">
      <h2 class="card-title"></h2>
      <span class="card-id"></span>
    </div>
    <p class="card-description"></p>
    <div class="meta-row"></div>
    <div class="tag-row"></div>
  `;
  main.querySelector(".card-title").textContent = item.title;
  main.querySelector(".card-id").textContent = `#${item.id}`;
  main.querySelector(".card-description").textContent = item.description;

  const meta = main.querySelector(".meta-row");
  for (const value of [item.category, item.state, item.date, item.size]) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = value;
    meta.appendChild(pill);
  }

  const tags = main.querySelector(".tag-row");
  for (const tag of item.tags) {
    const pill = document.createElement("span");
    pill.className = `tag-pill${state.favoriteTags.has(tag) ? " tag-pill-favorite" : ""}`;
    pill.textContent = tag;
    tags.appendChild(pill);
  }

  const thumbs = document.createElement("div");
  thumbs.className = "thumb-grid";
  for (let index = 0; index < item.thumbs; index += 1) {
    thumbs.appendChild(createThumb(index));
  }

  card.append(poster, main, thumbs);
  card.addEventListener("click", () => openDrawer(item));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openDrawer(item);
  });
  return card;
}

function renderFeed() {
  const items = visibleItems();
  nodes.feed.replaceChildren();
  nodes.progress.textContent = `${items.length} / ${state.items.length}`;
  nodes.summary.textContent = items.length ? `Показано ${items.length} элементов` : "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "feed-placeholder";
    empty.textContent = "Нет элементов под выбранные фильтры.";
    nodes.feed.appendChild(empty);
    return;
  }

  for (const item of items) {
    nodes.feed.appendChild(createCard(item));
  }
}

function render() {
  const tagValues = uniqueValues((item) => item.tags).sort((left, right) => {
    const favoriteDelta = Number(state.favoriteTags.has(right)) - Number(state.favoriteTags.has(left));
    return favoriteDelta || left.localeCompare(right);
  });
  renderTagFilters(tagValues);
  renderFilterGroup(nodes.stateFilters, uniqueValues((item) => [item.state]), state.states);
  renderFilterGroup(nodes.categoryFilters, uniqueValues((item) => [item.category]), state.categories);
  nodes.sortArrow.textContent = state.sortDesc ? "↓" : "↑";
  renderFeed();
}

function openDrawer(item) {
  nodes.drawerContent.innerHTML = `
    <h2 id="drawer-title"></h2>
    <p class="card-description"></p>
    <div class="drawer-section">
      <div class="meta-row"></div>
    </div>
    <div class="drawer-section">
      <div class="tag-row"></div>
    </div>
  `;
  nodes.drawerContent.querySelector("#drawer-title").textContent = item.title;
  nodes.drawerContent.querySelector(".card-description").textContent = item.description;

  const meta = nodes.drawerContent.querySelector(".meta-row");
  for (const value of [item.id, item.category, item.state, item.date, item.size]) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = value;
    meta.appendChild(pill);
  }

  const tags = nodes.drawerContent.querySelector(".tag-row");
  for (const tag of item.tags) {
    const pill = document.createElement("span");
    pill.className = `tag-pill${state.favoriteTags.has(tag) ? " tag-pill-favorite" : ""}`;
    pill.textContent = tag;
    tags.appendChild(pill);
  }

  nodes.drawer.hidden = false;
  nodes.drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
}

function closeDrawer() {
  nodes.drawer.hidden = true;
  nodes.drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

function moveHover(event) {
  if (nodes.hover.hidden) return;
  const offset = 16;
  const rect = nodes.hover.getBoundingClientRect();
  let left = event.clientX + offset;
  let top = event.clientY + offset;
  if (left + rect.width > window.innerWidth - 8) left = Math.max(8, event.clientX - rect.width - offset);
  if (top + rect.height > window.innerHeight - 8) top = Math.max(8, event.clientY - rect.height - offset);
  nodes.hover.style.left = `${left}px`;
  nodes.hover.style.top = `${top}px`;
}

function showHover(event, sourceNode) {
  const color = getComputedStyle(sourceNode).backgroundImage;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:480px;height:320px;background:${color};border-radius:10px"></div></foreignObject></svg>`;
  nodes.hoverImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  nodes.hover.hidden = false;
  moveHover(event);
}

function hideHover() {
  nodes.hover.hidden = true;
  nodes.hoverImage.removeAttribute("src");
}

nodes.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.query = nodes.query.value.trim();
  nodes.status.textContent = "Готово";
  renderFeed();
});

nodes.query.addEventListener("input", () => {
  state.query = nodes.query.value.trim();
  renderFeed();
});

nodes.filtersToggle.addEventListener("click", () => {
  const expanded = nodes.filtersToggle.getAttribute("aria-expanded") === "true";
  nodes.filtersToggle.setAttribute("aria-expanded", String(!expanded));
  nodes.filtersDrawer.hidden = expanded;
});

nodes.tagFilterSearch.addEventListener("input", () => {
  state.tagQuery = nodes.tagFilterSearch.value.trim();
  render();
});

nodes.sortButton.addEventListener("click", () => {
  state.sortDesc = !state.sortDesc;
  render();
});

nodes.drawerBackdrop.addEventListener("click", closeDrawer);
nodes.drawerClose.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

render();
