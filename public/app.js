const authPanel = document.getElementById("auth-panel");
const appContent = document.getElementById("app-content");
const authForm = document.getElementById("auth-form");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const authSubmitButton = document.getElementById("auth-submit");
const authTitleNode = document.getElementById("auth-title");
const authSubtitleNode = document.getElementById("auth-subtitle");
const authStatusNode = document.getElementById("auth-status");
const authUserNode = document.getElementById("auth-user");
const appEyebrowNode = document.getElementById("app-eyebrow");
const appTitleNode = document.getElementById("app-title");
const appSubtitleNode = document.getElementById("app-subtitle");
const appVersionNode = document.getElementById("app-version");
const updateButton = document.getElementById("update-btn");
const updateStatusNode = document.getElementById("update-status");
const logoutButton = document.getElementById("logout-btn");
const form = document.getElementById("load-form");
const sourceLabelNode = document.getElementById("source-label");
const sourceInput = document.getElementById("source-url");
const savedSearchesSelect = document.getElementById("saved-searches-select");
const savedSearchesPlaceholderOption = document.getElementById("saved-searches-placeholder-option");
const maxReleasesInput = document.getElementById("max-releases");
const loadButton = document.getElementById("load-btn");
const saveSearchButton = document.getElementById("save-search-btn");
const filtersToggleButton = document.getElementById("filters-toggle");
const filtersPanel = document.getElementById("filters-panel");
const statusNode = document.getElementById("status");
const summaryNode = document.getElementById("summary");
const progressNode = document.getElementById("progress-counter");
const qualityFiltersTitleNode = document.getElementById("quality-filters-title");
const qualityFiltersNode = document.getElementById("quality-filters");
const categoryFiltersNode = document.getElementById("category-filters");
const tableBody = document.getElementById("releases-body");
const tableHeaderPosterNode = document.getElementById("table-header-poster");
const tableHeaderDescriptionNode = document.getElementById("table-header-description");
const tableHeaderPublishedNode = document.getElementById("table-header-published");
const tableHeaderSizeNode = document.getElementById("table-header-size");
const tablePlaceholderCell = document.getElementById("table-placeholder-cell");
const saveSearchDialog = document.getElementById("save-search-dialog");
const saveSearchForm = document.getElementById("save-search-form");
const saveSearchNameInput = document.getElementById("save-search-name");
const saveSearchUrlNode = document.getElementById("save-search-url");
const saveSearchCancelButton = document.getElementById("save-search-cancel");
const saveSearchSubmitButton = document.getElementById("save-search-submit");

const JOB_POLL_INTERVAL_MS = 800;
const DEFAULT_UI_TEXTS = {
  eyebrow: "Tracker Dashboard",
  title: "TrackerView",
  subtitle:
    "Paste a tracker page URL or type search text to build a clean release table with poster, description, publication date and release size.",
  auth_title: "Sign in",
  auth_subtitle: "Use tracker username and password.",
  auth_status_prompt: "Sign in with tracker credentials.",
  auth_username_placeholder: "Username",
  auth_password_placeholder: "Password",
  auth_submit: "Sign in",
  source_label: "Source URL or text query",
  source_placeholder: "URL or text for search",
  saved_searches: "Saved searches",
  load_releases: "Load releases",
  filters: "Filters",
  quality_filters_title: "Quality filters",
  quality_filters_empty: "Quality filters will appear after loading releases.",
  status_idle: "Idle",
  status_done: "Done",
  status_processing: "Processing releases...",
  status_signed_in: "Signed in.",
  status_signed_out: "Signed out.",
  status_auth_required: "Sign in to continue.",
  status_signing_in: "Signing in...",
  status_starting_update: "Starting update...",
  status_update_started: "Update started.",
  update_started_message: "Update started. Wait for restart and refresh this page.",
  update_running: "Update is running...",
  update_last_error_prefix: "Last update error:",
  update_exit_code_template: "Last update exited with code {code}.",
  update_confirm:
    "Start application update now? The app will restart and may be unavailable for a short time.",
  processed_prefix: "Processed:",
  table_poster: "Poster",
  table_description: "Description",
  table_published: "Published",
  table_size: "Size",
  table_no_data: "No data loaded. Submit a URL or text query to build the release table.",
  table_no_parsed: "No releases were parsed from this page.",
  table_no_matches: "No releases match selected filters.",
  table_waiting: "Waiting for parsed releases...",
  table_unable_to_load: "Unable to load releases. Check tracker URL and credentials.",
  summary_scanning: "Scanning source page for release links...",
  summary_found_links_template: "Found {found} links.",
  summary_found_parsed_template: "Found {found} links. Parsed {parsed} releases.",
  signed_in_as_template: "Signed in as {username}",
  update_button: "Update app",
  logout_button: "Log out",
  seeds_prefix: "Seeds:",
  download_to_server: "Save to server",
  download_to_server_done_template: "Saved to server: {fileName}",
  download_to_server_failed: "Failed to save file to server folder.",
  download_badge_done: "Downloaded"
};
let uiTexts = { ...DEFAULT_UI_TEXTS };
const hoverPanel = document.createElement("div");
const hoverPanelImage = document.createElement("img");
const clientConfig = {
  appVersion: "1.1.0000000000",
  defaultSourceUrl: "",
  maxReleases: 80,
  hardMaxReleases: 700,
  directDownloadEnabled: false
};
const DATE_SORT_DESC = "desc";
const DATE_SORT_ASC = "asc";
const QUALITY_NA_LABEL = "N/A";

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
let isAuthenticated = false;
let isUpdateAvailable = false;
let releaseDateSortOrder = DATE_SORT_DESC;
const categoryState = new Map();
const qualityFilterState = new Map();
let availableQualityOptions = [];
const downloadedReleaseKeys = new Set();

hoverPanel.className = "poster-hover-panel";
hoverPanel.appendChild(hoverPanelImage);
document.body.appendChild(hoverPanel);

function setAuthStatus(message, isError = false) {
  authStatusNode.textContent = String(message || "");
  authStatusNode.classList.toggle("error", Boolean(isError));
}

function resolveUiText(key, fallback = "") {
  const raw = String(uiTexts[key] || "").trim();
  if (raw) {
    return raw;
  }

  const base = String(DEFAULT_UI_TEXTS[key] || "").trim();
  if (base) {
    return base;
  }

  return String(fallback || "");
}

function formatUiTemplate(key, values = {}, fallback = "") {
  const template = resolveUiText(key, fallback);
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, token) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) {
      return String(values[token]);
    }
    return `{${token}}`;
  });
}

function applyUiTexts() {
  appEyebrowNode.textContent = resolveUiText("eyebrow", DEFAULT_UI_TEXTS.eyebrow);
  appTitleNode.textContent = resolveUiText("title", DEFAULT_UI_TEXTS.title);
  appSubtitleNode.textContent = resolveUiText("subtitle", DEFAULT_UI_TEXTS.subtitle);

  authTitleNode.textContent = resolveUiText("auth_title", DEFAULT_UI_TEXTS.auth_title);
  authSubtitleNode.textContent = resolveUiText("auth_subtitle", DEFAULT_UI_TEXTS.auth_subtitle);
  authUsernameInput.placeholder = resolveUiText(
    "auth_username_placeholder",
    DEFAULT_UI_TEXTS.auth_username_placeholder
  );
  authPasswordInput.placeholder = resolveUiText(
    "auth_password_placeholder",
    DEFAULT_UI_TEXTS.auth_password_placeholder
  );
  authSubmitButton.textContent = resolveUiText("auth_submit", DEFAULT_UI_TEXTS.auth_submit);

  sourceLabelNode.textContent = resolveUiText("source_label", DEFAULT_UI_TEXTS.source_label);
  sourceInput.placeholder = resolveUiText("source_placeholder", DEFAULT_UI_TEXTS.source_placeholder);
  loadButton.textContent = resolveUiText("load_releases", DEFAULT_UI_TEXTS.load_releases);
  filtersToggleButton.textContent = resolveUiText("filters", DEFAULT_UI_TEXTS.filters);
  savedSearchesSelect.title = resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches);
  savedSearchesSelect.setAttribute("aria-label", resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches));
  savedSearchesPlaceholderOption.textContent = resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches);
  qualityFiltersTitleNode.textContent = resolveUiText(
    "quality_filters_title",
    DEFAULT_UI_TEXTS.quality_filters_title
  );

  tableHeaderPosterNode.textContent = resolveUiText("table_poster", DEFAULT_UI_TEXTS.table_poster);
  tableHeaderDescriptionNode.textContent = resolveUiText(
    "table_description",
    DEFAULT_UI_TEXTS.table_description
  );
  updateReleaseDateHeader();
  tableHeaderSizeNode.textContent = resolveUiText("table_size", DEFAULT_UI_TEXTS.table_size);
  tablePlaceholderCell.textContent = resolveUiText("table_no_data", DEFAULT_UI_TEXTS.table_no_data);

  updateButton.textContent = resolveUiText("update_button", DEFAULT_UI_TEXTS.update_button);
  logoutButton.textContent = resolveUiText("logout_button", DEFAULT_UI_TEXTS.logout_button);
  renderQualityFilters();
}

function setAppVersion(version) {
  const normalized = String(version || "").trim();
  if (!/^1\.1\.\d{10}$/.test(normalized)) {
    return;
  }

  clientConfig.appVersion = normalized;
  appVersionNode.textContent = `Version ${normalized}`;
}

function setUpdateStatus(message, isError = false) {
  const text = String(message || "");
  updateStatusNode.textContent = text;
  updateStatusNode.classList.toggle("error", Boolean(isError));
  updateStatusNode.classList.toggle("hidden", !text);
}

function setUpdateButtonVisible(visible) {
  updateButton.classList.toggle("hidden", !visible);
}

function resetUpdateUiState() {
  isUpdateAvailable = false;
  updateButton.disabled = false;
  setUpdateButtonVisible(false);
  setUpdateStatus("");
}

function resetDataState() {
  allReleases = [];
  savedSearches = [];
  lastSuccessfulSearchUrl = "";
  categoryState.clear();
  qualityFilterState.clear();
  availableQualityOptions = [];
  downloadedReleaseKeys.clear();
  sourceInput.value = "";
  savedSearchesSelect.value = "";
  summaryNode.textContent = "";
  setProgress(0, 0);
  renderSavedSearches();
  renderQualityFilters();
  renderCategoryFilters();
  renderPlaceholder(resolveUiText("table_no_data", DEFAULT_UI_TEXTS.table_no_data));
}

function setAuthenticatedUi(authenticated, username = "") {
  const signedIn = Boolean(authenticated);
  isAuthenticated = signedIn;
  authPanel.classList.toggle("hidden", signedIn);
  appContent.classList.toggle("hidden", !signedIn);
  logoutButton.classList.toggle("hidden", !signedIn);
  authUserNode.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    authUserNode.textContent = formatUiTemplate(
      "signed_in_as_template",
      { username },
      DEFAULT_UI_TEXTS.signed_in_as_template
    );
    setUpdateButtonVisible(isUpdateAvailable);
    setAuthStatus("");
    return;
  }

  authUserNode.textContent = "";
  authPasswordInput.value = "";
  setSaveSearchButtonVisible(false);
  resetUpdateUiState();
  setFiltersExpanded(false);
  hidePosterPreview();
  if (saveSearchDialog.open) {
    saveSearchDialog.close();
  }
  loadButton.disabled = true;
}

function handleUnauthorized(message = "") {
  setAuthenticatedUi(false);
  resetDataState();
  setStatus(resolveUiText("status_auth_required", DEFAULT_UI_TEXTS.status_auth_required));
  setAuthStatus(message || resolveUiText("auth_status_prompt", DEFAULT_UI_TEXTS.auth_status_prompt), true);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};

  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (response.status === 401) {
    handleUnauthorized(payload.error || "Authentication required.");
    throw new Error(payload.error || "Authentication required.");
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (HTTP ${response.status}).`);
  }

  return payload;
}

async function loadAuthStatus() {
  return fetchJson("/api/auth/status");
}

async function loginWithTrackerCredentials(username, password) {
  return fetchJson("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });
}

async function logoutCurrentSession() {
  return fetchJson("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    }
  });
}

async function loadPublicAppVersion() {
  const payload = await fetchJson("/api/version");
  setAppVersion(payload?.version);
}

async function loadUiTexts() {
  const response = await fetch("/ui-texts.json", {
    cache: "no-store"
  });
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    return;
  }

  uiTexts = {
    ...DEFAULT_UI_TEXTS,
    ...payload
  };
  applyUiTexts();
}

async function loadUpdateControlStatus() {
  return fetchJson("/api/admin/update");
}

async function startApplicationUpdate() {
  return fetchJson("/api/admin/update", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    }
  });
}

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

function getFirstSavedSearchUrl() {
  const firstSavedEntry = Array.isArray(savedSearches)
    ? savedSearches.find((entry) => normalizeSearchUrl(entry?.url))
    : null;

  return normalizeSearchUrl(firstSavedEntry?.url);
}

function renderSavedSearches(selectedUrl = "") {
  savedSearchesSelect.innerHTML = "";
  const normalizedSelectedUrl = normalizeSearchUrl(selectedUrl);
  let hasSelectedOption = false;

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches);
  placeholderOption.selected = !normalizedSelectedUrl;
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
    if (!hasSelectedOption && normalizedSelectedUrl && normalizedUrl === normalizedSelectedUrl) {
      option.selected = true;
      hasSelectedOption = true;
      placeholderOption.selected = false;
    }
    savedSearchesSelect.appendChild(option);
  }

  if (!hasSelectedOption && normalizedSelectedUrl) {
    savedSearchesSelect.value = "";
  }
}

function applyInitialSavedSearchSelection() {
  const firstSavedUrl = getFirstSavedSearchUrl();
  renderSavedSearches(firstSavedUrl);

  if (!firstSavedUrl) {
    savedSearchesSelect.value = "";
    return;
  }

  savedSearchesSelect.value = firstSavedUrl;
  sourceInput.value = firstSavedUrl;
}

function setSaveSearchButtonVisible(visible) {
  saveSearchButton.classList.toggle("hidden", !visible);
}

function setFiltersExpanded(expanded) {
  const isExpanded = Boolean(expanded);
  filtersPanel.hidden = !isExpanded;
  filtersToggleButton.setAttribute("aria-expanded", String(isExpanded));
}

function mapKValueToHeight(kValue) {
  if (!Number.isFinite(kValue) || kValue <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  if (kValue >= 8) {
    return 4320;
  }

  if (kValue >= 5) {
    return 2880;
  }

  if (kValue >= 4) {
    return 2160;
  }

  if (kValue >= 3) {
    return 1800;
  }

  if (kValue >= 2) {
    return 1440;
  }

  return 1080;
}

function extractQualityFromTitle(title) {
  const normalized = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
  if (!normalized) {
    return null;
  }

  const candidates = [];
  const pushCandidate = (label, height, confidence = 0) => {
    if (!label || !Number.isFinite(height) || height <= 0) {
      return;
    }

    candidates.push({ label, height, confidence });
  };

  for (const match of normalized.matchAll(/(?:^|[^0-9a-zа-я])(\d{3,4})\s*[pр]\b/giu)) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value < 100 || value > 9000) {
      continue;
    }
    pushCandidate(`${value}p`, value, 5);
  }

  for (const match of normalized.matchAll(
    /(?:^|[^0-9])((?:540|576|720|900|960|1024|1080|1200|1440|1600|1800|2160|2880|4320))(?:[^0-9]|$)/giu
  )) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value)) {
      continue;
    }
    pushCandidate(`${value}p`, value, 3);
  }

  for (const match of normalized.matchAll(/(?:^|[^0-9a-zа-я])(\d(?:[.,]\d+)?)\s*[kк]\b/giu)) {
    const value = Number.parseFloat(String(match[1]).replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }

    const renderedValue = Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
    pushCandidate(`${renderedValue}K`, mapKValueToHeight(value), 6);
  }

  for (const match of normalized.matchAll(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/giu)) {
    const left = Number.parseInt(match[1], 10);
    const right = Number.parseInt(match[2], 10);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      continue;
    }

    const height = Math.min(left, right);
    if (!Number.isFinite(height) || height < 100 || height > 9000) {
      continue;
    }

    pushCandidate(`${height}p`, height, 4);
  }

  if (/\b(?:uhd|ultra\s*hd)\b/iu.test(normalized)) {
    pushCandidate("4K", 2160, 2);
  }
  if (/\bqhd\b/iu.test(normalized)) {
    pushCandidate("2K", 1440, 2);
  }
  if (/\bfhd\b/iu.test(normalized)) {
    pushCandidate("1080p", 1080, 2);
  }
  if (/\bhd\b/iu.test(normalized) && !/\b(?:uhd|qhd|fhd)\b/iu.test(normalized)) {
    pushCandidate("720p", 720, 1);
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.height !== left.height) {
      return right.height - left.height;
    }
    return right.confidence - left.confidence;
  });

  return candidates[0];
}

function normalizeQualityLabel(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || QUALITY_NA_LABEL;
}

function resolveQualityBadgeTone(quality) {
  if (!quality || quality.label === QUALITY_NA_LABEL) {
    return "na";
  }

  const height = Number(quality?.height);
  if (!Number.isFinite(height)) {
    return "red";
  }

  if (height >= 1440) {
    return "blue";
  }

  if (height >= 1080) {
    return "green";
  }

  if (height >= 720) {
    return "yellow";
  }

  return "red";
}

function resolveReleaseQualityInfo(release) {
  const detectedQuality = extractQualityFromTitle(release?.title);

  if (!detectedQuality) {
    return {
      label: QUALITY_NA_LABEL,
      height: Number.NEGATIVE_INFINITY,
      tone: "na"
    };
  }

  const normalizedQuality = {
    label: normalizeQualityLabel(detectedQuality.label),
    height: Number.isFinite(detectedQuality.height) ? detectedQuality.height : Number.NEGATIVE_INFINITY
  };

  return {
    ...normalizedQuality,
    tone: resolveQualityBadgeTone(normalizedQuality)
  };
}

function createQualityBadge(qualityInfo) {
  const resolvedQuality =
    qualityInfo && typeof qualityInfo === "object"
      ? qualityInfo
      : {
          label: QUALITY_NA_LABEL,
          height: Number.NEGATIVE_INFINITY,
          tone: "na"
        };

  const badge = document.createElement("span");
  badge.className = `quality-badge quality-badge--${resolvedQuality.tone || "na"}`;
  badge.textContent = resolvedQuality.label;
  badge.title = `Detected from title: ${resolvedQuality.label}`;
  return badge;
}

function normalizeReleaseDateSortOrder(value) {
  return value === DATE_SORT_ASC ? DATE_SORT_ASC : DATE_SORT_DESC;
}

function updateReleaseDateHeader() {
  const normalizedOrder = normalizeReleaseDateSortOrder(releaseDateSortOrder);
  const baseLabel = resolveUiText("table_published", DEFAULT_UI_TEXTS.table_published);
  const arrow = normalizedOrder === DATE_SORT_ASC ? "↑" : "↓";

  tableHeaderPublishedNode.textContent = `${baseLabel} ${arrow}`;
  tableHeaderPublishedNode.classList.add("sortable-header");
  tableHeaderPublishedNode.tabIndex = 0;
  tableHeaderPublishedNode.setAttribute(
    "aria-sort",
    normalizedOrder === DATE_SORT_ASC ? "ascending" : "descending"
  );
}

function setReleaseDateSortOrder(nextOrder) {
  const normalizedOrder = normalizeReleaseDateSortOrder(nextOrder);
  if (releaseDateSortOrder === normalizedOrder) {
    updateReleaseDateHeader();
    return;
  }

  releaseDateSortOrder = normalizedOrder;
  updateReleaseDateHeader();
  if (allReleases.length > 0) {
    updateTableView();
  }
}

function toggleReleaseDateSortOrder() {
  setReleaseDateSortOrder(releaseDateSortOrder === DATE_SORT_DESC ? DATE_SORT_ASC : DATE_SORT_DESC);
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

function sortReleasesByDate(releases, sortOrder = releaseDateSortOrder) {
  const normalizedOrder = normalizeReleaseDateSortOrder(sortOrder);

  return [...(releases || [])].sort((left, right) => {
    const leftTs = parsePublicationDateToTimestamp(left?.publicationDate);
    const rightTs = parsePublicationDateToTimestamp(right?.publicationDate);
    const leftHasDate = Number.isFinite(leftTs);
    const rightHasDate = Number.isFinite(rightTs);

    if (leftHasDate !== rightHasDate) {
      return leftHasDate ? -1 : 1;
    }

    if (leftHasDate && rightHasDate && rightTs !== leftTs) {
      return normalizedOrder === DATE_SORT_ASC ? leftTs - rightTs : rightTs - leftTs;
    }

    const topicIdCompare = String(left?.topicId || "").localeCompare(String(right?.topicId || ""));
    if (topicIdCompare !== 0) {
      return normalizedOrder === DATE_SORT_ASC ? topicIdCompare : -topicIdCompare;
    }

    return String(left?.topicUrl || "").localeCompare(String(right?.topicUrl || ""));
  });
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", Boolean(isError));
}

function setProgress(processed, total) {
  const safeProcessed = Number.isFinite(processed) ? processed : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;
  const prefix = resolveUiText("processed_prefix", DEFAULT_UI_TEXTS.processed_prefix);
  if (safeTotal > 0) {
    progressNode.textContent = `${prefix} ${safeProcessed}/${safeTotal}`;
    return;
  }

  if (safeProcessed > 0) {
    progressNode.textContent = `${prefix} ${safeProcessed}/?`;
    return;
  }

  progressNode.textContent = `${prefix} 0/0`;
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
  cell.className = "date-cell";

  const dateValue = document.createElement("div");
  dateValue.className = "date-value";
  dateValue.textContent = release.publicationDate || "-";

  const seedsValueRaw = release?.seeds;
  const seedsValue =
    Number.isFinite(Number(seedsValueRaw)) || typeof seedsValueRaw === "string"
      ? String(seedsValueRaw).trim() || "-"
      : "-";

  const seedsLine = document.createElement("div");
  seedsLine.className = "seeds-line";
  seedsLine.textContent = `${resolveUiText("seeds_prefix", DEFAULT_UI_TEXTS.seeds_prefix)} ${seedsValue}`;

  cell.appendChild(dateValue);
  cell.appendChild(seedsLine);
  return cell;
}

function resolveReleaseRowKey(release) {
  const topicId = String(release?.topicId || "").trim();
  if (topicId) {
    return `topic:${topicId}`;
  }

  const topicUrl = String(release?.topicUrl || "").trim();
  if (topicUrl) {
    return `topic-url:${topicUrl}`;
  }

  const torrentUrl = String(release?.torrentUrl || "").trim();
  if (torrentUrl) {
    return `torrent:${torrentUrl}`;
  }

  const title = String(release?.title || "").trim();
  if (title) {
    return `title:${title}`;
  }

  return "";
}

function isReleaseDownloaded(release) {
  const key = resolveReleaseRowKey(release);
  return Boolean(key) && downloadedReleaseKeys.has(key);
}

function markReleaseAsDownloaded(release) {
  const key = resolveReleaseRowKey(release);
  if (!key) {
    return false;
  }

  const hadKey = downloadedReleaseKeys.has(key);
  downloadedReleaseKeys.add(key);
  return !hadKey;
}

function applyDownloadedRowState(row, release) {
  row.classList.toggle("release-row-downloaded", isReleaseDownloaded(release));
}

function createServerDownloadControl(release, onDownloaded) {
  if (!clientConfig.directDownloadEnabled) {
    return null;
  }

  const torrentUrl = String(release?.torrentUrl || "").trim();
  if (!torrentUrl) {
    return null;
  }

  const wrap = document.createElement("div");
  wrap.className = "server-download-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "server-download-btn";
  button.title = resolveUiText("download_to_server", DEFAULT_UI_TEXTS.download_to_server);
  button.setAttribute("aria-label", resolveUiText("download_to_server", DEFAULT_UI_TEXTS.download_to_server));
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16v9H4V4zm2 2v5h12V6H6zm-2 9h16v5H4v-5zm3 2a1 1 0 100 2 1 1 0 000-2zm10 0v2h2v-2h-2z"></path></svg>';

  const toast = document.createElement("span");
  toast.className = "server-download-toast";
  toast.textContent = resolveUiText("download_badge_done", DEFAULT_UI_TEXTS.download_badge_done);

  let hideToastTimer = null;

  button.addEventListener("click", async () => {
    if (button.disabled) {
      return;
    }

    button.disabled = true;

    try {
      const payload = await fetchJson("/api/releases/download-to-dir", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          torrentUrl,
          title: String(release?.title || "")
        })
      });

      const fileName = String(payload?.fileName || "").trim() || "file.torrent";
      setStatus(
        formatUiTemplate(
          "download_to_server_done_template",
          { fileName },
          DEFAULT_UI_TEXTS.download_to_server_done_template
        )
      );

      if (typeof onDownloaded === "function") {
        onDownloaded();
      }

      toast.textContent = resolveUiText("download_badge_done", DEFAULT_UI_TEXTS.download_badge_done);
      toast.classList.add("visible");
      if (hideToastTimer) {
        clearTimeout(hideToastTimer);
      }
      hideToastTimer = setTimeout(() => {
        toast.classList.remove("visible");
      }, 2000);
    } catch (error) {
      setStatus(error.message || resolveUiText("download_to_server_failed", DEFAULT_UI_TEXTS.download_to_server_failed), true);
    } finally {
      button.disabled = false;
    }
  });

  wrap.appendChild(button);
  wrap.appendChild(toast);
  return wrap;
}

function createSizeCell(release, row) {
  const cell = document.createElement("td");
  cell.className = "size-cell";
  const content = document.createElement("div");
  content.className = "size-cell-content";
  const qualityLine = document.createElement("div");
  qualityLine.className = "size-meta-line";
  const sizeLine = document.createElement("div");
  sizeLine.className = "size-line";
  const sizeText = String(release?.size || "").trim() || "-";
  const torrentUrl = String(release?.torrentUrl || "").trim();
  const qualityInfo = resolveReleaseQualityInfo(release);
  const qualityBadge = createQualityBadge(qualityInfo);

  qualityLine.appendChild(qualityBadge);

  if (torrentUrl) {
    const link = document.createElement("a");
    link.href = torrentUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "size-link";
    link.textContent = sizeText;
    link.addEventListener("click", () => {
      markReleaseAsDownloaded(release);
      applyDownloadedRowState(row, release);
    });
    sizeLine.appendChild(link);
  } else {
    const sizeValue = document.createElement("span");
    sizeValue.className = "size-value";
    sizeValue.textContent = sizeText;
    sizeLine.appendChild(sizeValue);
  }

  const serverDownloadControl = createServerDownloadControl(release, () => {
    markReleaseAsDownloaded(release);
    applyDownloadedRowState(row, release);
  });
  if (serverDownloadControl) {
    sizeLine.appendChild(serverDownloadControl);
  }

  content.appendChild(qualityLine);
  content.appendChild(sizeLine);
  cell.appendChild(content);
  return cell;
}

function renderReleases(releases) {
  clearTable();

  if (!Array.isArray(releases) || releases.length === 0) {
    renderPlaceholder(resolveUiText("table_no_parsed", DEFAULT_UI_TEXTS.table_no_parsed));
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
    applyDownloadedRowState(row, release);
    row.appendChild(createPosterCell(release));
    row.appendChild(createDescriptionCell(release));
    row.appendChild(createDateCell(release));
    row.appendChild(createSizeCell(release, row));
    tableBody.appendChild(row);
  }
}

function buildQualityFilterPayload(entries) {
  return entries.map((entry) => ({
    name: normalizeQualityLabel(entry.name),
    enabled: Boolean(entry.enabled)
  }));
}

async function upsertQualityFiltersOnServer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  return fetchJson("/api/quality-filters", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      qualities: buildQualityFilterPayload(entries)
    })
  });
}

function mergeQualityFiltersIntoState(qualities) {
  let changed = false;

  for (const quality of qualities || []) {
    const name = normalizeQualityLabel(quality?.name);
    const enabled = typeof quality?.enabled === "boolean" ? quality.enabled : true;

    if (!qualityFilterState.has(name)) {
      qualityFilterState.set(name, enabled);
      changed = true;
      continue;
    }

    if (qualityFilterState.get(name) !== enabled) {
      qualityFilterState.set(name, enabled);
      changed = true;
    }
  }

  return changed;
}

function compareQualityOptions(left, right) {
  const leftName = normalizeQualityLabel(left?.name);
  const rightName = normalizeQualityLabel(right?.name);
  const leftIsNa = leftName === QUALITY_NA_LABEL;
  const rightIsNa = rightName === QUALITY_NA_LABEL;

  if (leftIsNa !== rightIsNa) {
    return leftIsNa ? 1 : -1;
  }

  const leftHeight = Number.isFinite(left?.height) ? left.height : Number.NEGATIVE_INFINITY;
  const rightHeight = Number.isFinite(right?.height) ? right.height : Number.NEGATIVE_INFINITY;

  if (rightHeight !== leftHeight) {
    return rightHeight - leftHeight;
  }

  return leftName.localeCompare(rightName, "en", { sensitivity: "base" });
}

function renderQualityFilters() {
  qualityFiltersNode.innerHTML = "";

  const options = [...availableQualityOptions].sort(compareQualityOptions);

  if (options.length === 0) {
    const empty = document.createElement("p");
    empty.className = "category-empty";
    empty.textContent = resolveUiText("quality_filters_empty", DEFAULT_UI_TEXTS.quality_filters_empty);
    qualityFiltersNode.appendChild(empty);
    return;
  }

  for (const option of options) {
    const name = normalizeQualityLabel(option?.name);
    const tone = String(option?.tone || "na").trim() || "na";

    const label = document.createElement("label");
    label.className = `quality-chip quality-chip--${tone}`;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = qualityFilterState.get(name) !== false;

    input.addEventListener("change", async () => {
      qualityFilterState.set(name, input.checked);
      updateTableView();

      try {
        await upsertQualityFiltersOnServer([{ name, enabled: input.checked }]);
      } catch (error) {
        setStatus(error.message || "Failed to save quality filter.", true);
      }
    });

    const text = document.createElement("span");
    text.textContent = name;

    label.appendChild(input);
    label.appendChild(text);
    qualityFiltersNode.appendChild(label);
  }
}

function collectQualityOptionsFromReleases(releases) {
  const optionsByName = new Map();

  for (const release of releases || []) {
    if (!release || release.error) {
      continue;
    }

    const qualityInfo = resolveReleaseQualityInfo(release);
    const name = normalizeQualityLabel(qualityInfo.label);
    const currentHeight = Number.isFinite(qualityInfo.height) ? qualityInfo.height : Number.NEGATIVE_INFINITY;

    if (!optionsByName.has(name)) {
      optionsByName.set(name, {
        name,
        tone: qualityInfo.tone,
        height: currentHeight
      });
      continue;
    }

    const existing = optionsByName.get(name);
    const existingHeight = Number.isFinite(existing?.height) ? existing.height : Number.NEGATIVE_INFINITY;
    if (currentHeight > existingHeight) {
      existing.height = currentHeight;
      existing.tone = qualityInfo.tone;
    }
  }

  return Array.from(optionsByName.values()).sort(compareQualityOptions);
}

function registerQualityFiltersFromReleases(releases) {
  availableQualityOptions = collectQualityOptionsFromReleases(releases);

  const discovered = [];
  for (const option of availableQualityOptions) {
    const name = normalizeQualityLabel(option.name);
    if (!qualityFilterState.has(name)) {
      qualityFilterState.set(name, true);
      discovered.push({ name, enabled: true });
    }
  }

  renderQualityFilters();

  if (discovered.length > 0) {
    upsertQualityFiltersOnServer(discovered).catch(() => {});
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

  return fetchJson("/api/categories", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      categories: buildCategoryPayload(entries)
    })
  });
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

  const sortedReleases = sortReleasesByDate(allReleases, releaseDateSortOrder);
  const categoryScopedReleases = sortedReleases.filter((release) => {
    if (!release || release.error) {
      return false;
    }

    const categoryName = normalizeCategoryName(release?.category);
    return categoryState.get(categoryName) !== false;
  });

  availableQualityOptions = collectQualityOptionsFromReleases(categoryScopedReleases);
  renderQualityFilters();

  const visibleReleases = sortedReleases.filter((release) => {
    if (release?.error) {
      return true;
    }

    const categoryName = normalizeCategoryName(release?.category);
    if (categoryState.get(categoryName) === false) {
      return false;
    }

    const qualityName = normalizeQualityLabel(resolveReleaseQualityInfo(release).label);
    return qualityFilterState.get(qualityName) !== false;
  });

  if (sortedReleases.length > 0 && visibleReleases.length === 0) {
    renderPlaceholder(resolveUiText("table_no_matches", DEFAULT_UI_TEXTS.table_no_matches));
    return;
  }

  renderReleases(visibleReleases);
}

async function loadClientConfig() {
  const payload = await fetchJson("/api/client-config");
  setAppVersion(payload?.app?.version);

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
  const directDownloadEnabled = Boolean(tracker.directDownloadEnabled);

  clientConfig.defaultSourceUrl = defaultSourceUrl;
  clientConfig.maxReleases = maxReleases;
  clientConfig.hardMaxReleases = hardMaxReleases;
  clientConfig.directDownloadEnabled = directDownloadEnabled;

  sourceInput.placeholder = resolveUiText("source_placeholder", DEFAULT_UI_TEXTS.source_placeholder);
  maxReleasesInput.value = String(maxReleases);
  maxReleasesInput.max = String(hardMaxReleases);
}

async function startParseJob(sourceRequest, maxReleases) {
  const payload = await fetchJson("/api/releases/job", {
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

  if (!payload.jobId) {
    throw new Error("Parse job did not return jobId.");
  }

  return payload.jobId;
}

async function loadParseJob(jobId) {
  return fetchJson(`/api/releases/job/${encodeURIComponent(jobId)}`);
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
  const payload = await fetchJson("/api/categories");

  mergeCategoriesIntoState(payload.categories || []);
  renderCategoryFilters();
}

async function loadSavedQualityFilters() {
  const payload = await fetchJson("/api/quality-filters");

  mergeQualityFiltersIntoState(payload.qualities || []);
  renderQualityFilters();
}

async function loadSavedSearches() {
  const payload = await fetchJson("/api/saved-searches");

  savedSearches = Array.isArray(payload.searches) ? payload.searches : [];
  applyInitialSavedSearchSelection();
}

async function upsertSavedSearchOnServer(name, url) {
  const payload = await fetchJson("/api/saved-searches", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ name, url })
  });

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

function applyUpdateControlStatus(payload) {
  const enabled = Boolean(payload?.enabled);
  const running = Boolean(payload?.running);
  const lastError = String(payload?.lastError || "").trim();
  const lastExitCode =
    Number.isInteger(payload?.lastExitCode) || payload?.lastExitCode === 0
      ? payload.lastExitCode
      : null;

  isUpdateAvailable = enabled;
  setUpdateButtonVisible(isAuthenticated && enabled);
  updateButton.disabled = !enabled || running;

  if (!enabled) {
    setUpdateStatus("");
    return;
  }

  if (running) {
    setUpdateStatus(resolveUiText("update_running", DEFAULT_UI_TEXTS.update_running));
    return;
  }

  if (lastError) {
    const prefix = resolveUiText("update_last_error_prefix", DEFAULT_UI_TEXTS.update_last_error_prefix);
    setUpdateStatus(`${prefix} ${lastError}`, true);
    return;
  }

  if (Number.isInteger(lastExitCode) && lastExitCode !== 0) {
    setUpdateStatus(
      formatUiTemplate("update_exit_code_template", { code: lastExitCode }, DEFAULT_UI_TEXTS.update_exit_code_template),
      true
    );
    return;
  }

  setUpdateStatus("");
}

async function refreshUpdateControlStatus() {
  const payload = await loadUpdateControlStatus();
  applyUpdateControlStatus(payload);
}

async function initializeAuthenticatedApp() {
  loadButton.disabled = true;
  setProgress(0, 0);
  setStatus(resolveUiText("status_idle", DEFAULT_UI_TEXTS.status_idle));
  summaryNode.textContent = "";
  setSaveSearchButtonVisible(false);

  try {
    await loadClientConfig();
  } catch (error) {
    sourceInput.placeholder = resolveUiText("source_placeholder", DEFAULT_UI_TEXTS.source_placeholder);
    maxReleasesInput.max = String(clientConfig.hardMaxReleases);
    setStatus(error.message || "Failed to load client config.", true);
  }

  try {
    await loadSavedCategories();
  } catch (error) {
    renderCategoryFilters();
  }

  try {
    await loadSavedQualityFilters();
  } catch (error) {
    renderQualityFilters();
  }

  try {
    await loadSavedSearches();
  } catch (error) {
    renderSavedSearches();
  }

  try {
    await refreshUpdateControlStatus();
  } catch (error) {
    resetUpdateUiState();
  }

  loadButton.disabled = !isAuthenticated;
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
setAuthenticatedUi(false);
resetDataState();
setStatus(resolveUiText("status_auth_required", DEFAULT_UI_TEXTS.status_auth_required));
setAuthStatus(resolveUiText("auth_status_prompt", DEFAULT_UI_TEXTS.auth_status_prompt));

savedSearchesSelect.addEventListener("change", () => {
  if (!isAuthenticated) {
    return;
  }

  const selectedUrl = normalizeSearchUrl(savedSearchesSelect.value);
  if (!selectedUrl) {
    return;
  }
  sourceInput.value = selectedUrl;
});

sourceInput.addEventListener("input", () => {
  if (!isAuthenticated) {
    return;
  }

  const normalized = normalizeSearchUrl(sourceInput.value);
  const existing = findSavedSearchByUrl(normalized);
  savedSearchesSelect.value = existing ? normalized : "";
});

filtersToggleButton.addEventListener("click", () => {
  if (!isAuthenticated) {
    return;
  }

  setFiltersExpanded(filtersPanel.hidden);
});

tableHeaderPublishedNode.addEventListener("click", () => {
  toggleReleaseDateSortOrder();
});

tableHeaderPublishedNode.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  toggleReleaseDateSortOrder();
});

saveSearchButton.addEventListener("click", () => {
  if (!isAuthenticated) {
    return;
  }

  openSaveSearchDialog();
});

saveSearchCancelButton.addEventListener("click", () => {
  saveSearchDialog.close();
});

saveSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAuthenticated) {
    return;
  }

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
    if (!isAuthenticated) {
      return;
    }
    setStatus(error.message || "Failed to save search.", true);
  } finally {
    saveSearchSubmitButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAuthenticated) {
    setStatus(resolveUiText("status_auth_required", DEFAULT_UI_TEXTS.status_auth_required), true);
    return;
  }

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
  registerQualityFiltersFromReleases([]);
  renderPlaceholder(resolveUiText("table_waiting", DEFAULT_UI_TEXTS.table_waiting));

  try {
    const jobId = await startParseJob(sourceRequest, maxReleases);

    const finalJob = await pollJobUntilDone(jobId, (job) => {
      const releases = Array.isArray(job.releases) ? job.releases : [];
      const processed = Number.isFinite(job.processed) ? job.processed : releases.length;
      const totalFound = Number.isFinite(job.totalFound) ? job.totalFound : 0;

      setStatus(
        job.status === "done"
          ? resolveUiText("status_done", DEFAULT_UI_TEXTS.status_done)
          : resolveUiText("status_processing", DEFAULT_UI_TEXTS.status_processing)
      );
      setProgress(processed, totalFound);

      if (totalFound > 0) {
        summaryNode.textContent = formatUiTemplate(
          "summary_found_links_template",
          { found: totalFound },
          DEFAULT_UI_TEXTS.summary_found_links_template
        );
      } else {
        summaryNode.textContent = resolveUiText("summary_scanning", DEFAULT_UI_TEXTS.summary_scanning);
      }

      if (Array.isArray(job.categories)) {
        if (mergeCategoriesIntoState(job.categories)) {
          renderCategoryFilters();
        }
      }

      if (releases.length > 0) {
        allReleases = releases;
        registerCategoriesFromReleases(releases);
        registerQualityFiltersFromReleases(releases);
        updateTableView();
      }

      if (job.status === "done" && releases.length === 0) {
        allReleases = [];
        registerQualityFiltersFromReleases([]);
        updateTableView();
      }
    });

    allReleases = Array.isArray(finalJob.releases) ? finalJob.releases : [];
    registerCategoriesFromReleases(allReleases);
    registerQualityFiltersFromReleases(allReleases);
    updateTableView();

    const parsed = allReleases.length;
    summaryNode.textContent = formatUiTemplate(
      "summary_found_parsed_template",
      { found: finalJob.totalFound, parsed },
      DEFAULT_UI_TEXTS.summary_found_parsed_template
    );
    setProgress(finalJob.processed, finalJob.totalFound);
    setStatus(resolveUiText("status_done", DEFAULT_UI_TEXTS.status_done));
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
    if (!isAuthenticated) {
      return;
    }
    renderPlaceholder(resolveUiText("table_unable_to_load", DEFAULT_UI_TEXTS.table_unable_to_load));
    summaryNode.textContent = "";
    setProgress(0, 0);
    setStatus(error.message || "Unexpected error", true);
    setSaveSearchButtonVisible(false);
  } finally {
    loadButton.disabled = !isAuthenticated;
  }
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = String(authUsernameInput.value || "").trim();
  const password = String(authPasswordInput.value || "");
  if (!username || !password) {
    setAuthStatus("Username and password are required.", true);
    return;
  }

  authSubmitButton.disabled = true;
  setAuthStatus(resolveUiText("status_signing_in", DEFAULT_UI_TEXTS.status_signing_in));
  try {
    const payload = await loginWithTrackerCredentials(username, password);
    setAuthenticatedUi(true, payload.username || username);
    setAuthStatus("");
    setStatus(resolveUiText("status_signed_in", DEFAULT_UI_TEXTS.status_signed_in));
    await initializeAuthenticatedApp();
  } catch (error) {
    setAuthStatus(error.message || "Failed to sign in.", true);
  } finally {
    authSubmitButton.disabled = false;
  }
});

function submitAuthFormFromEnter(event) {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }

  event.preventDefault();
  if (authSubmitButton.disabled) {
    return;
  }

  if (typeof authForm.requestSubmit === "function") {
    authForm.requestSubmit(authSubmitButton);
    return;
  }

  authSubmitButton.click();
}

authUsernameInput.addEventListener("keydown", submitAuthFormFromEnter);
authPasswordInput.addEventListener("keydown", submitAuthFormFromEnter);

updateButton.addEventListener("click", async () => {
  if (!isAuthenticated || !isUpdateAvailable || updateButton.disabled) {
    return;
  }

  const shouldStart = window.confirm(resolveUiText("update_confirm", DEFAULT_UI_TEXTS.update_confirm));
  if (!shouldStart) {
    return;
  }

  updateButton.disabled = true;
  setUpdateStatus(resolveUiText("status_starting_update", DEFAULT_UI_TEXTS.status_starting_update));

  try {
    const payload = await startApplicationUpdate();
    applyUpdateControlStatus(payload);
    setStatus(resolveUiText("status_update_started", DEFAULT_UI_TEXTS.status_update_started));
    setUpdateStatus(resolveUiText("update_started_message", DEFAULT_UI_TEXTS.update_started_message));
  } catch (error) {
    updateButton.disabled = false;
    setUpdateStatus(error.message || "Failed to start update.", true);
    setStatus(error.message || "Failed to start update.", true);
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await logoutCurrentSession();
  } catch (error) {
    // Session may already be absent; clear client state anyway.
  } finally {
    setAuthenticatedUi(false);
    resetDataState();
    setStatus(resolveUiText("status_signed_out", DEFAULT_UI_TEXTS.status_signed_out));
    setAuthStatus(resolveUiText("status_signed_out", DEFAULT_UI_TEXTS.status_signed_out));
    authPasswordInput.value = "";
    logoutButton.disabled = false;
    authUsernameInput.focus();
  }
});

(async () => {
  uiTexts = { ...DEFAULT_UI_TEXTS };
  applyUiTexts();

  try {
    await loadUiTexts();
  } catch (error) {
    // Keep default UI text if ui-texts.json is unavailable.
  }

  try {
    await loadPublicAppVersion();
  } catch (error) {
    // Keep placeholder version if public endpoint is unavailable.
  }

  try {
    const status = await loadAuthStatus();
    if (status?.authenticated) {
      setAuthenticatedUi(true, status.username || "");
      setStatus(resolveUiText("status_signed_in", DEFAULT_UI_TEXTS.status_signed_in));
      await initializeAuthenticatedApp();
      return;
    }
  } catch (error) {
    setAuthStatus(error.message || "Failed to check auth status.", true);
    return;
  }

  setAuthenticatedUi(false);
  setStatus(resolveUiText("status_auth_required", DEFAULT_UI_TEXTS.status_auth_required));
  setAuthStatus(resolveUiText("auth_status_prompt", DEFAULT_UI_TEXTS.auth_status_prompt));
})();
