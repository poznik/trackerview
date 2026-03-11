const form = document.getElementById("load-form");
const sourceInput = document.getElementById("source-url");
const savedSearchesSelect = document.getElementById("saved-searches-select");
const maxReleasesInput = document.getElementById("max-releases");
const loadButton = document.getElementById("load-btn");
const saveSearchButton = document.getElementById("save-search-btn");
const filtersToggleButton = document.getElementById("filters-toggle");
const filtersPanel = document.getElementById("filters-panel");
const statusNode = document.getElementById("status");
const summaryNode = document.getElementById("summary");
const progressNode = document.getElementById("progress-counter");
const categoryFiltersNode = document.getElementById("category-filters");
const tableBody = document.getElementById("releases-body");
const saveSearchDialog = document.getElementById("save-search-dialog");
const saveSearchForm = document.getElementById("save-search-form");
const saveSearchNameInput = document.getElementById("save-search-name");
const saveSearchUrlNode = document.getElementById("save-search-url");
const saveSearchCancelButton = document.getElementById("save-search-cancel");
const saveSearchSubmitButton = document.getElementById("save-search-submit");

const JOB_POLL_INTERVAL_MS = 800;
const DEFAULT_SOURCE_PLACEHOLDER = "URL or text for search";
const hoverPanel = document.createElement("div");
const hoverPanelImage = document.createElement("img");
const clientConfig = {
  defaultSourceUrl: "",
  maxReleases: 80,
  hardMaxReleases: 700
};

const monthIndexByName = {
  янв: 0,
  фев: 1,
  мар: 2,
  апр: 3,
  май: 4,
  июн: 5,
  июл: 6,
  авг: 7,
  сен: 8,
  окт: 9,
  ноя: 10,
  дек: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

let allReleases = [];
let savedSearches = [];
let lastSuccessfulSearchUrl = "";
const categoryState = new Map();

hoverPanel.className = "poster-hover-panel";
hoverPanel.appendChild(hoverPanelImage);
document.body.appendChild(hoverPanel);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCategoryName(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || "Без категории";
}

function normalizeSearchUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch (error) {
    return "";
  }
}

function resolveSourceRequest(rawValue) {
  const entered = String(rawValue || "").trim();
  if (!entered) {
    return {
      mode: "default",
      rawInput: "",
      pageUrl: clientConfig.defaultSourceUrl,
      queryText: ""
    };
  }

  const normalizedUrl = normalizeSearchUrl(entered);
  if (normalizedUrl) {
    return {
      mode: "url",
      rawInput: entered,
      pageUrl: normalizedUrl,
      queryText: ""
    };
  }

  return {
    mode: "text",
    rawInput: entered,
    pageUrl: "",
    queryText: entered
  };
}

function suggestSearchName(url) {
  const normalized = normalizeSearchUrl(url);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    const topicId = parsed.searchParams.get("t");
    const forumId = parsed.searchParams.get("f");

    if (topicId && /^\d+$/.test(topicId)) {
      return `${parsed.hostname} t=${topicId}`;
    }

    if (forumId && /^\d+$/.test(forumId)) {
      return `${parsed.hostname} f=${forumId}`;
    }

    const pathText = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
    return `${parsed.hostname}${pathText}`;
  } catch (error) {
    return "";
  }
}

function findSavedSearchByUrl(url) {
  const normalized = normalizeSearchUrl(url);
  if (!normalized) {
    return null;
  }

  for (const entry of savedSearches) {
    if (normalizeSearchUrl(entry?.url) === normalized) {
      return entry;
    }
  }

  return null;
}

function renderSavedSearches() {
  savedSearchesSelect.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Saved searches";
  savedSearchesSelect.appendChild(placeholderOption);

  for (const entry of savedSearches) {
    const normalizedUrl = normalizeSearchUrl(entry?.url);
    if (!normalizedUrl) {
      continue;
    }

    const option = document.createElement("option");
    option.value = normalizedUrl;
    option.textContent = String(entry?.name || normalizedUrl);
    option.title = normalizedUrl;
    savedSearchesSelect.appendChild(option);
  }
}

function setSaveSearchButtonVisible(visible) {
  saveSearchButton.classList.toggle("hidden", !visible);
}

function setFiltersExpanded(expanded) {
  const isExpanded = Boolean(expanded);
  filtersPanel.hidden = !isExpanded;
  filtersToggleButton.setAttribute("aria-expanded", String(isExpanded));
}

function parsePublicationDateToTimestamp(value) {
  const raw = String(value || "")
    .replace(/^\[\s*/, "")
    .replace(/\s*\]$/, "")
    .trim();

  if (!raw) {
    return Number.NEGATIVE_INFINITY;
  }

  const match = raw.match(/^(\d{1,2})-([A-Za-zА-Яа-я]{3})-(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const day = Number.parseInt(match[1], 10);
    const monthKey = match[2].toLowerCase();
    const yearRaw = Number.parseInt(match[3], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const hour = Number.parseInt(match[4], 10);
    const minute = Number.parseInt(match[5], 10);
    const second = Number.parseInt(match[6] || "0", 10);

    if (Number.isFinite(day) && Number.isFinite(year) && monthKey in monthIndexByName) {
      return Date.UTC(year, monthIndexByName[monthKey], day, hour, minute, second);
    }
  }

  const fallback = Date.parse(raw);
  return Number.isFinite(fallback) ? fallback : Number.NEGATIVE_INFINITY;
}

function sortReleasesByDate(releases) {
  return [...(releases || [])].sort((left, right) => {
    const leftTs = parsePublicationDateToTimestamp(left?.publicationDate);
    const rightTs = parsePublicationDateToTimestamp(right?.publicationDate);

    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }

    return String(right?.topicId || "").localeCompare(String(left?.topicId || ""));
  });
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", Boolean(isError));
}

function setProgress(processed, total) {
  const safeProcessed = Number.isFinite(processed) ? processed : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;
  if (safeTotal > 0) {
    progressNode.textContent = `Processed: ${safeProcessed}/${safeTotal}`;
    return;
  }

  if (safeProcessed > 0) {
    progressNode.textContent = `Processed: ${safeProcessed}/?`;
    return;
  }

  progressNode.textContent = "Processed: 0/0";
}

function clearTable() {
  tableBody.innerHTML = "";
}

function renderPlaceholder(text) {
  clearTable();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.className = "placeholder";
  cell.textContent = text;
  row.appendChild(cell);
  tableBody.appendChild(row);
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function hidePosterPreview() {
  hoverPanel.style.display = "none";
  hoverPanelImage.onerror = null;
  hoverPanelImage.src = "";
}

function movePosterPreview(event) {
  const offset = 16;
  const rect = hoverPanel.getBoundingClientRect();

  let left = event.clientX + offset;
  let top = event.clientY + offset;

  if (left + rect.width > window.innerWidth - 8) {
    left = Math.max(8, event.clientX - rect.width - offset);
  }

  if (top + rect.height > window.innerHeight - 8) {
    top = Math.max(8, event.clientY - rect.height - offset);
  }

  hoverPanel.style.left = `${left}px`;
  hoverPanel.style.top = `${top}px`;
}

function showImagePreview(event, image, preferredUrl = "", scale = 2, fallbackToThumb = true) {
  const sourceUrl = preferredUrl || image.currentSrc || image.src;
  const fallbackUrl = fallbackToThumb ? image.currentSrc || image.src : "";
  if (!sourceUrl) {
    return;
  }

  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 2;
  const previewWidth = Math.round(image.clientWidth * normalizedScale);
  hoverPanel.style.width = `${Math.max(120, previewWidth)}px`;

  hoverPanelImage.onerror = () => {
    hoverPanelImage.onerror = null;
    if (fallbackUrl && sourceUrl !== fallbackUrl) {
      hoverPanelImage.src = fallbackUrl;
      return;
    }
    hidePosterPreview();
  };

  hoverPanelImage.src = sourceUrl;
  hoverPanelImage.alt = image.alt || "Poster preview";
  hoverPanel.style.display = "block";
  movePosterPreview(event);
}

function createPosterCell(release) {
  const cell = document.createElement("td");
  cell.className = "poster-cell";

  if (!release.posterUrl) {
    const fallback = document.createElement("div");
    fallback.className = "poster-fallback";
    fallback.textContent = "No image";
    cell.appendChild(fallback);
    return cell;
  }

  const image = document.createElement("img");
  image.src = release.posterUrl;
  image.alt = release.title || "Poster";
  image.className = "poster";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";

  image.addEventListener("mouseenter", (event) => showImagePreview(event, image));
  image.addEventListener("mousemove", (event) => movePosterPreview(event));
  image.addEventListener("mouseleave", () => hidePosterPreview());

  image.addEventListener("error", () => {
    image.remove();
    const fallback = document.createElement("div");
    fallback.className = "poster-fallback";
    fallback.textContent = "No image";
    cell.appendChild(fallback);
  });

  cell.appendChild(image);
  return cell;
}

function createScreenshotsBlock(release) {
  const screenshots = Array.isArray(release?.screenshots) ? release.screenshots : [];
  if (screenshots.length === 0) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "screenshots-wrap";

  const label = document.createElement("p");
  label.className = "screenshots-title";
  label.textContent = "Screenshots";
  wrap.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "screenshots-grid";

  for (const screenshot of screenshots) {
    const thumbUrl = String(screenshot?.thumbUrl || "").trim();
    const fullUrl = String(screenshot?.fullUrl || thumbUrl).trim();
    const previewUrl = String(screenshot?.previewUrl || "").trim();
    if (!thumbUrl) {
      continue;
    }

    const link = document.createElement("a");
    link.href = fullUrl || thumbUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "screenshot-link";

    const image = document.createElement("img");
    image.src = thumbUrl;
    image.alt = "Screenshot";
    image.className = "screenshot-thumb";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";

    image.addEventListener("mouseenter", (event) =>
      showImagePreview(event, image, previewUrl || fullUrl || thumbUrl, 6, false)
    );
    image.addEventListener("mousemove", (event) => movePosterPreview(event));
    image.addEventListener("mouseleave", () => hidePosterPreview());

    image.addEventListener("error", () => {
      image.remove();
      if (!link.querySelector("img")) {
        link.remove();
      }
    });

    link.appendChild(image);
    grid.appendChild(link);
  }

  if (!grid.children.length) {
    return null;
  }

  wrap.appendChild(grid);
  return wrap;
}

function createDescriptionCell(release) {
  const cell = document.createElement("td");
  cell.className = "description-cell";

  const titleLink = document.createElement("a");
  titleLink.href = release.topicUrl;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.className = "title-link";
  titleLink.textContent = release.title || release.topicUrl;

  const category = document.createElement("p");
  category.className = "category-line";
  category.textContent = normalizeCategoryName(release.category);

  const description = document.createElement("p");
  description.className = "desc";
  description.textContent = truncate(release.description || "No description", 420);

  const screenshots = createScreenshotsBlock(release);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `Topic ID: ${release.topicId || "-"}`;

  cell.appendChild(titleLink);
  cell.appendChild(category);
  cell.appendChild(description);
  if (screenshots) {
    cell.appendChild(screenshots);
  }
  cell.appendChild(meta);
  return cell;
}

function createDateCell(release) {
  const cell = document.createElement("td");
  cell.textContent = release.publicationDate || "-";
  return cell;
}

function createSizeCell(release) {
  const cell = document.createElement("td");
  const sizeText = String(release?.size || "").trim() || "-";
  const torrentUrl = String(release?.torrentUrl || "").trim();

  if (torrentUrl) {
    const link = document.createElement("a");
    link.href = torrentUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "size-link";
    link.textContent = sizeText;
    cell.appendChild(link);
    return cell;
  }

  cell.textContent = sizeText;
  return cell;
}

function renderReleases(releases) {
  clearTable();

  if (!Array.isArray(releases) || releases.length === 0) {
    renderPlaceholder("No releases were parsed from this page.");
    return;
  }

  for (const release of releases) {
    if (release.error) {
      const row = document.createElement("tr");
      row.className = "error-row";

      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = `Failed to parse ${release.topicUrl}: ${release.error}`;
      row.appendChild(cell);
      tableBody.appendChild(row);
      continue;
    }

    const row = document.createElement("tr");
    row.appendChild(createPosterCell(release));
    row.appendChild(createDescriptionCell(release));
    row.appendChild(createDateCell(release));
    row.appendChild(createSizeCell(release));
    tableBody.appendChild(row);
  }
}

function buildCategoryPayload(entries) {
  return entries.map((entry) => ({
    name: normalizeCategoryName(entry.name),
    enabled: Boolean(entry.enabled)
  }));
}

async function upsertCategoriesOnServer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const response = await fetch("/api/categories", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      categories: buildCategoryPayload(entries)
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Categories request failed (HTTP ${response.status}).`);
  }

  return payload;
}

function mergeCategoriesIntoState(categories) {
  let changed = false;

  for (const category of categories || []) {
    const name = normalizeCategoryName(category?.name);
    const enabled = typeof category?.enabled === "boolean" ? category.enabled : true;

    if (!categoryState.has(name)) {
      categoryState.set(name, enabled);
      changed = true;
      continue;
    }

    if (categoryState.get(name) !== enabled) {
      categoryState.set(name, enabled);
      changed = true;
    }
  }

  return changed;
}

function renderCategoryFilters() {
  categoryFiltersNode.innerHTML = "";

  const categories = Array.from(categoryState.entries()).sort((left, right) =>
    left[0].localeCompare(right[0], "ru", { sensitivity: "base" })
  );

  if (categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "category-empty";
    empty.textContent = "Categories will appear after loading releases.";
    categoryFiltersNode.appendChild(empty);
    return;
  }

  for (const [name, enabled] of categories) {
    const label = document.createElement("label");
    label.className = "category-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = enabled;

    input.addEventListener("change", async () => {
      categoryState.set(name, input.checked);
      updateTableView();

      try {
        await upsertCategoriesOnServer([{ name, enabled: input.checked }]);
      } catch (error) {
        setStatus(error.message || "Failed to save category filter.", true);
      }
    });

    const text = document.createElement("span");
    text.textContent = name;

    label.appendChild(input);
    label.appendChild(text);
    categoryFiltersNode.appendChild(label);
  }
}

function registerCategoriesFromReleases(releases) {
  const discovered = [];

  for (const release of releases || []) {
    const categoryName = normalizeCategoryName(release?.category);
    if (categoryState.has(categoryName)) {
      continue;
    }

    categoryState.set(categoryName, true);
    discovered.push({ name: categoryName, enabled: true });
  }

  if (discovered.length > 0) {
    renderCategoryFilters();
    upsertCategoriesOnServer(discovered).catch(() => {});
  }
}

function updateTableView() {
  hidePosterPreview();

  const sortedReleases = sortReleasesByDate(allReleases);
  const visibleReleases = sortedReleases.filter((release) => {
    const categoryName = normalizeCategoryName(release?.category);
    return categoryState.get(categoryName) !== false;
  });

  if (sortedReleases.length > 0 && visibleReleases.length === 0) {
    renderPlaceholder("No releases match selected categories.");
    return;
  }

  renderReleases(visibleReleases);
}

async function loadClientConfig() {
  const response = await fetch("/api/client-config");
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load client config (HTTP ${response.status}).`);
  }

  const tracker = payload?.tracker || {};
  const defaultSourceUrl = normalizeSearchUrl(tracker.defaultSourceUrl);
  const maxReleasesValue = Number.parseInt(String(tracker.maxReleases || ""), 10);
  const maxReleases =
    Number.isFinite(maxReleasesValue) && maxReleasesValue > 0
      ? maxReleasesValue
      : clientConfig.maxReleases;
  const hardMaxReleasesValue = Number.parseInt(String(tracker.hardMaxReleases || ""), 10);
  const hardMaxReleases =
    Number.isFinite(hardMaxReleasesValue) && hardMaxReleasesValue > 0
      ? hardMaxReleasesValue
      : clientConfig.hardMaxReleases;

  clientConfig.defaultSourceUrl = defaultSourceUrl;
  clientConfig.maxReleases = maxReleases;
  clientConfig.hardMaxReleases = hardMaxReleases;

  sourceInput.placeholder = DEFAULT_SOURCE_PLACEHOLDER;
  maxReleasesInput.value = String(maxReleases);
  maxReleasesInput.max = String(hardMaxReleases);
}

async function startParseJob(sourceRequest, maxReleases) {
  const response = await fetch("/api/releases/job", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      pageUrl: sourceRequest.pageUrl,
      queryText: sourceRequest.queryText,
      maxReleases
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (HTTP ${response.status}).`);
  }

  if (!payload.jobId) {
    throw new Error("Parse job did not return jobId.");
  }

  return payload.jobId;
}

async function loadParseJob(jobId) {
  const response = await fetch(`/api/releases/job/${encodeURIComponent(jobId)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Job polling failed (HTTP ${response.status}).`);
  }
  return payload;
}

async function pollJobUntilDone(jobId, onUpdate) {
  while (true) {
    const job = await loadParseJob(jobId);
    onUpdate(job);

    if (job.status === "done") {
      return job;
    }

    if (job.status === "error") {
      throw new Error(job.error || "Parse job failed.");
    }

    await delay(JOB_POLL_INTERVAL_MS);
  }
}

async function loadSavedCategories() {
  const response = await fetch("/api/categories");
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load categories (HTTP ${response.status}).`);
  }

  mergeCategoriesIntoState(payload.categories || []);
  renderCategoryFilters();
}

async function loadSavedSearches() {
  const response = await fetch("/api/saved-searches");
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load saved searches (HTTP ${response.status}).`);
  }

  savedSearches = Array.isArray(payload.searches) ? payload.searches : [];
  renderSavedSearches();
}

async function upsertSavedSearchOnServer(name, url) {
  const response = await fetch("/api/saved-searches", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, url })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Failed to save search (HTTP ${response.status}).`);
  }

  savedSearches = Array.isArray(payload.searches) ? payload.searches : savedSearches;
  renderSavedSearches();
  return payload.search || null;
}

function openSaveSearchDialog() {
  const currentUrl = normalizeSearchUrl(lastSuccessfulSearchUrl) || normalizeSearchUrl(sourceInput.value);
  if (!currentUrl) {
    setStatus("Enter a valid URL before saving search.", true);
    return;
  }

  const existing = findSavedSearchByUrl(currentUrl);
  const initialName = existing?.name || suggestSearchName(currentUrl) || "Saved search";

  saveSearchUrlNode.textContent = currentUrl;
  saveSearchNameInput.value = initialName;

  if (typeof saveSearchDialog.showModal === "function") {
    saveSearchDialog.showModal();
    saveSearchNameInput.focus();
    saveSearchNameInput.select();
    return;
  }

  // Fallback for very old browsers.
  const name = window.prompt("Сохранить поиск", initialName);
  if (!name) {
    return;
  }

  upsertSavedSearchOnServer(name, currentUrl)
    .then(() => {
      setStatus("Search saved.");
      savedSearchesSelect.value = currentUrl;
    })
    .catch((error) => {
      setStatus(error.message || "Failed to save search.", true);
    });
}

window.addEventListener("scroll", () => hidePosterPreview(), true);
window.addEventListener("resize", () => hidePosterPreview());

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hidePosterPreview();
  }
});

setFiltersExpanded(false);
setSaveSearchButtonVisible(false);

savedSearchesSelect.addEventListener("change", () => {
  const selectedUrl = normalizeSearchUrl(savedSearchesSelect.value);
  if (!selectedUrl) {
    return;
  }
  sourceInput.value = selectedUrl;
});

sourceInput.addEventListener("input", () => {
  const normalized = normalizeSearchUrl(sourceInput.value);
  const existing = findSavedSearchByUrl(normalized);
  savedSearchesSelect.value = existing ? normalized : "";
});

filtersToggleButton.addEventListener("click", () => {
  setFiltersExpanded(filtersPanel.hidden);
});

saveSearchButton.addEventListener("click", () => {
  openSaveSearchDialog();
});

saveSearchCancelButton.addEventListener("click", () => {
  saveSearchDialog.close();
});

saveSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = normalizeSearchUrl(saveSearchUrlNode.textContent) || normalizeSearchUrl(sourceInput.value);
  const name = String(saveSearchNameInput.value || "").trim();

  if (!url) {
    setStatus("Search URL is invalid.", true);
    return;
  }

  if (!name) {
    saveSearchNameInput.focus();
    setStatus("Search name must not be empty.", true);
    return;
  }

  saveSearchSubmitButton.disabled = true;

  try {
    await upsertSavedSearchOnServer(name, url);
    sourceInput.value = url;
    savedSearchesSelect.value = url;
    lastSuccessfulSearchUrl = url;
    setStatus("Search saved.");
    saveSearchDialog.close();
  } catch (error) {
    setStatus(error.message || "Failed to save search.", true);
  } finally {
    saveSearchSubmitButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const sourceRequest = resolveSourceRequest(sourceInput.value);
  const pageUrl = sourceRequest.pageUrl;
  const maxReleasesValue = Number.parseInt(String(maxReleasesInput.value || "").trim(), 10);
  const maxReleases =
    Number.isFinite(maxReleasesValue) && maxReleasesValue > 0
      ? maxReleasesValue
      : undefined;

  if (!pageUrl && !sourceRequest.queryText) {
    setStatus("Enter source URL or text query.", true);
    return;
  }

  if (!sourceRequest.rawInput && pageUrl) {
    sourceInput.value = pageUrl;
  }

  loadButton.disabled = true;
  setSaveSearchButtonVisible(false);
  hidePosterPreview();
  setStatus(sourceRequest.mode === "text" ? "Starting text search parse job..." : "Starting parse job...");
  setProgress(0, 0);
  summaryNode.textContent = "";
  allReleases = [];
  renderPlaceholder("Waiting for parsed releases...");

  try {
    const jobId = await startParseJob(sourceRequest, maxReleases);

    const finalJob = await pollJobUntilDone(jobId, (job) => {
      const releases = Array.isArray(job.releases) ? job.releases : [];
      const processed = Number.isFinite(job.processed) ? job.processed : releases.length;
      const totalFound = Number.isFinite(job.totalFound) ? job.totalFound : 0;

      setStatus(job.status === "done" ? "Done" : "Processing releases...");
      setProgress(processed, totalFound);

      if (totalFound > 0) {
        summaryNode.textContent = `Found ${totalFound} links.`;
      } else {
        summaryNode.textContent = "Scanning source page for release links...";
      }

      if (Array.isArray(job.categories)) {
        if (mergeCategoriesIntoState(job.categories)) {
          renderCategoryFilters();
        }
      }

      if (releases.length > 0) {
        allReleases = releases;
        registerCategoriesFromReleases(releases);
        updateTableView();
      }

      if (job.status === "done" && releases.length === 0) {
        allReleases = [];
        updateTableView();
      }
    });

    allReleases = Array.isArray(finalJob.releases) ? finalJob.releases : [];
    registerCategoriesFromReleases(allReleases);
    updateTableView();

    const parsed = allReleases.length;
    summaryNode.textContent = `Found ${finalJob.totalFound} links. Parsed ${parsed} releases.`;
    setProgress(finalJob.processed, finalJob.totalFound);
    setStatus("Done");
    const resolvedSourceUrl = normalizeSearchUrl(finalJob.sourceUrl) || normalizeSearchUrl(pageUrl) || pageUrl;
    lastSuccessfulSearchUrl = resolvedSourceUrl;
    if (lastSuccessfulSearchUrl) {
      if (sourceRequest.mode === "text") {
        sourceInput.value = sourceRequest.rawInput;
        savedSearchesSelect.value = "";
      } else {
        sourceInput.value = lastSuccessfulSearchUrl;
        const existing = findSavedSearchByUrl(lastSuccessfulSearchUrl);
        savedSearchesSelect.value = existing ? lastSuccessfulSearchUrl : "";
      }
      setSaveSearchButtonVisible(true);
    }
  } catch (error) {
    renderPlaceholder("Unable to load releases. Check tracker URL and credentials.");
    summaryNode.textContent = "";
    setProgress(0, 0);
    setStatus(error.message || "Unexpected error", true);
    setSaveSearchButtonVisible(false);
  } finally {
    loadButton.disabled = false;
  }
});

(async () => {
  loadButton.disabled = true;
  setProgress(0, 0);
  try {
    await loadClientConfig();
  } catch (error) {
    sourceInput.placeholder = DEFAULT_SOURCE_PLACEHOLDER;
    maxReleasesInput.max = String(clientConfig.hardMaxReleases);
    setStatus(error.message || "Failed to load client config.", true);
  } finally {
    loadButton.disabled = false;
  }

  try {
    await loadSavedCategories();
  } catch (error) {
    renderCategoryFilters();
  }

  try {
    await loadSavedSearches();
  } catch (error) {
    renderSavedSearches();
  }
})();
