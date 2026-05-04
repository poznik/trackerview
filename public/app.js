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
const appTitleNode = document.getElementById("app-title");
const appVersionNode = document.getElementById("app-version");
const updateButton = document.getElementById("update-btn");
const updateStatusNode = document.getElementById("update-status");
const logoutButton = document.getElementById("logout-btn");
const form = document.getElementById("load-form");
const sourceInput = document.getElementById("source-url");
const savedSearchesSelect = document.getElementById("saved-searches-select");
const savedSearchesPlaceholderOption = document.getElementById("saved-searches-placeholder-option");
const maxReleasesInput = document.getElementById("max-releases");
const loadButton = document.getElementById("load-btn");
const saveSearchButton = document.getElementById("save-search-btn");
const filtersToggleButton = document.getElementById("filters-toggle");
const filtersPanel = document.getElementById("filters-drawer");
const sortDateButton = document.getElementById("sort-date-btn");
const sortArrowNode = document.getElementById("sort-arrow");
const statusNode = document.getElementById("status");
const summaryNode = document.getElementById("summary");
const progressNode = document.getElementById("progress-counter");
const tagFiltersTitleNode = document.getElementById("tag-filters-title");
const tagFiltersNode = document.getElementById("tag-filters");
const qualityFiltersTitleNode = document.getElementById("quality-filters-title");
const qualityFiltersNode = document.getElementById("quality-filters");
const categoryFiltersNode = document.getElementById("category-filters");
const releaseFeedNode = document.getElementById("release-feed");
const releaseDrawer = document.getElementById("release-drawer");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const drawerCloseButton = document.getElementById("drawer-close");
const drawerContentNode = document.getElementById("drawer-content");
const saveSearchDialog = document.getElementById("save-search-dialog");
const saveSearchForm = document.getElementById("save-search-form");
const saveSearchNameInput = document.getElementById("save-search-name");
const saveSearchUrlNode = document.getElementById("save-search-url");
const saveSearchCancelButton = document.getElementById("save-search-cancel");
const saveSearchSubmitButton = document.getElementById("save-search-submit");

const JOB_POLL_INTERVAL_MS = 800;
const BUILTIN_POPULAR_SEARCH_VALUE = "builtin:popular-releases";
const DEFAULT_UI_TEXTS = {
  title: "TrackerView",
  popular_releases: "Popular releases",
  auth_title: "Sign in",
  auth_subtitle: "Use tracker username and password.",
  auth_status_prompt: "Sign in with tracker credentials.",
  auth_username_placeholder: "Username",
  auth_password_placeholder: "Password",
  auth_submit: "Sign in",
  source_placeholder: "URL or text for search",
  saved_searches: "Saved searches",
  load_releases: "Load",
  stop_loading: "Stop",
  stopping_loading: "Stopping...",
  filters: "Filters",
  sort_date: "Date",
  tag_filters_title: "Tags",
  tag_filters_empty: "Tags will appear after loading releases.",
  tag_favorite_add: "Add to favorites",
  tag_favorite_remove: "Remove from favorites",
  quality_filters_title: "Quality",
  quality_filters_empty: "Quality filters will appear after loading releases.",
  category_filters_empty: "Categories will appear after loading releases.",
  status_idle: "Idle",
  status_done: "Done",
  status_processing: "Processing releases...",
  status_starting_popular: "Starting popular releases search...",
  status_stopping: "Stopping...",
  status_stopped: "Stopped.",
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
  processed_prefix: "",
  feed_no_data: "No data loaded. Submit a URL or text query to build the release feed.",
  feed_no_parsed: "No releases were parsed from this page.",
  feed_no_matches: "No releases match the selected filters.",
  feed_waiting: "Waiting for parsed releases...",
  feed_unable_to_load: "Unable to load releases. Check tracker URL and credentials.",
  summary_scanning: "Scanning source page...",
  summary_found_links_template: "Found {found} links.",
  summary_found_parsed_template: "Found {found} links · Parsed {parsed}.",
  signed_in_as_template: "{username}",
  update_button: "Update app",
  logout_button: "Log out",
  seeds_prefix: "Seeds",
  download_to_server: "Save to server",
  download_to_server_done_template: "Saved to server: {fileName}",
  download_to_server_failed: "Failed to save file to server folder.",
  download_badge_done: "Saved"
};
let uiTexts = { ...DEFAULT_UI_TEXTS };
const hoverPanel = document.createElement("div");
const hoverPanelImage = document.createElement("img");
const clientConfig = {
  appVersion: "0.0.0",
  defaultSourceUrl: "",
  maxReleases: 80,
  hardMaxReleases: 700,
  directDownloadEnabled: false
};
const DATE_SORT_DESC = "desc";
const DATE_SORT_ASC = "asc";
const QUALITY_NA_LABEL = "N/A";

const monthIndexByName = {
  янв: 0, фев: 1, мар: 2, апр: 3, май: 4, июн: 5,
  июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

let allReleases = [];
let savedSearches = [];
let lastSuccessfulSearchUrl = "";
let isAuthenticated = false;
let isUpdateAvailable = false;
let csrfToken = "";
let currentJobId = "";
let isStartingParseJob = false;
let isStoppingCurrentJob = false;
let releaseDateSortOrder = DATE_SORT_DESC;
const categoryState = new Map();
const tagFilterState = new Map();
const qualityFilterState = new Map();
let availableQualityOptions = [];
const downloadedReleaseKeys = new Set();
const selectedReleaseVariantByGroupKey = new Map();
let lastFocusBeforeDrawer = null;
let activeHoverPreviewToken = 0;

function setCsrfToken(value) {
  csrfToken = String(value || "").trim();
}

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
  appTitleNode.textContent = resolveUiText("title", DEFAULT_UI_TEXTS.title);

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

  sourceInput.placeholder = resolveUiText("source_placeholder", DEFAULT_UI_TEXTS.source_placeholder);
  updateLoadButtonState();
  filtersToggleButton.textContent = resolveUiText("filters", DEFAULT_UI_TEXTS.filters);

  const sortLabelNode = sortDateButton.querySelector(".sort-label");
  if (sortLabelNode) {
    sortLabelNode.textContent = resolveUiText("sort_date", DEFAULT_UI_TEXTS.sort_date);
  }

  savedSearchesSelect.title = resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches);
  savedSearchesSelect.setAttribute(
    "aria-label",
    resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches)
  );
  savedSearchesPlaceholderOption.textContent = resolveUiText(
    "saved_searches",
    DEFAULT_UI_TEXTS.saved_searches
  );

  tagFiltersTitleNode.textContent = resolveUiText(
    "tag_filters_title",
    DEFAULT_UI_TEXTS.tag_filters_title
  );
  qualityFiltersTitleNode.textContent = resolveUiText(
    "quality_filters_title",
    DEFAULT_UI_TEXTS.quality_filters_title
  );

  updateButton.textContent = resolveUiText("update_button", DEFAULT_UI_TEXTS.update_button);
  logoutButton.textContent = resolveUiText("logout_button", DEFAULT_UI_TEXTS.logout_button);
  updateSortIndicator();
  renderQualityFilters();
}

function updateLoadButtonState() {
  if (isStartingParseJob) {
    loadButton.textContent = resolveUiText("load_releases", DEFAULT_UI_TEXTS.load_releases);
    loadButton.disabled = true;
    return;
  }

  if (isStoppingCurrentJob) {
    loadButton.textContent = resolveUiText("stopping_loading", DEFAULT_UI_TEXTS.stopping_loading);
    loadButton.disabled = true;
    return;
  }

  if (currentJobId) {
    loadButton.textContent = resolveUiText("stop_loading", DEFAULT_UI_TEXTS.stop_loading);
    loadButton.disabled = !isAuthenticated;
    return;
  }

  loadButton.textContent = resolveUiText("load_releases", DEFAULT_UI_TEXTS.load_releases);
  loadButton.disabled = !isAuthenticated;
}

function setAppVersion(version) {
  const normalized = String(version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) {
    return;
  }
  clientConfig.appVersion = normalized;
  appVersionNode.textContent = normalized;
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
  tagFilterState.clear();
  qualityFilterState.clear();
  selectedReleaseVariantByGroupKey.clear();
  currentJobId = "";
  isStartingParseJob = false;
  isStoppingCurrentJob = false;
  availableQualityOptions = [];
  downloadedReleaseKeys.clear();
  sourceInput.value = "";
  savedSearchesSelect.value = "";
  summaryNode.textContent = "";
  setProgress(0, 0);
  renderSavedSearches();
  renderTagFilters();
  renderQualityFilters();
  renderCategoryFilters();
  renderFeedPlaceholder(resolveUiText("feed_no_data", DEFAULT_UI_TEXTS.feed_no_data));
  closeReleaseDrawer({ restoreFocus: false });
  updateLoadButtonState();
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
  closeReleaseDrawer({ restoreFocus: false });
  if (saveSearchDialog.open) {
    saveSearchDialog.close();
  }
  updateLoadButtonState();
}

function handleUnauthorized(message = "") {
  setAuthenticatedUi(false);
  resetDataState();
  setStatus(resolveUiText("status_auth_required", DEFAULT_UI_TEXTS.status_auth_required));
  setAuthStatus(message || resolveUiText("auth_status_prompt", DEFAULT_UI_TEXTS.auth_status_prompt), true);
}

async function fetchJson(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(url, { ...options, headers });
  let payload = {};

  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (response.status === 401) {
    setCsrfToken("");
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

async function logoutCurrentSession() {
  return fetchJson("/api/auth/logout", {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
}

async function loadPublicAppVersion() {
  const payload = await fetchJson("/api/version");
  setAppVersion(payload?.version);
}

async function loadUiTexts() {
  const response = await fetch("/ui-texts.json", { cache: "no-store" });
  if (!response.ok) {
    return;
  }

  const payload = await response.json();
  if (!payload || typeof payload !== "object") {
    return;
  }

  uiTexts = { ...DEFAULT_UI_TEXTS, ...payload };
  applyUiTexts();
}

async function loadUpdateControlStatus() {
  return fetchJson("/api/admin/update");
}

async function startApplicationUpdate() {
  return fetchJson("/api/admin/update", {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCategoryName(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || "Без категории";
}

function normalizeTagName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTagState(value, fallback = {}) {
  if (typeof value === "boolean") {
    return {
      enabled: value,
      favorite: false
    };
  }

  const source = value && typeof value === "object" ? value : fallback;
  return {
    enabled: typeof source?.enabled === "boolean" ? source.enabled : true,
    favorite: typeof source?.favorite === "boolean" ? source.favorite : false
  };
}

function getTagState(name) {
  return normalizeTagState(tagFilterState.get(normalizeTagName(name)));
}

function setTagState(name, value) {
  const normalizedName = normalizeTagName(name);
  if (!normalizedName) return;
  const current = getTagState(normalizedName);
  tagFilterState.set(normalizedName, normalizeTagState(value, current));
}

function normalizeReleaseTags(release) {
  const tags = Array.isArray(release?.tags) ? release.tags : [];
  const unique = new Map();
  for (const rawTag of tags) {
    const name = normalizeTagName(typeof rawTag === "string" ? rawTag : rawTag?.name);
    if (!name) continue;
    const key = name.toLowerCase().replace(/ё/g, "е");
    if (!unique.has(key)) {
      unique.set(key, name);
    }
  }
  return Array.from(unique.values()).sort((left, right) =>
    left.localeCompare(right, "ru", { sensitivity: "base" })
  );
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
  if (isPopularSearchInput(entered)) {
    return {
      mode: "popular",
      sourceMode: "popular",
      rawInput: resolveUiText("popular_releases", DEFAULT_UI_TEXTS.popular_releases),
      pageUrl: "",
      queryText: ""
    };
  }
  const normalizedUrl = normalizeSearchUrl(entered);
  if (normalizedUrl) {
    return { mode: "url", rawInput: entered, pageUrl: normalizedUrl, queryText: "" };
  }
  return { mode: "text", rawInput: entered, pageUrl: "", queryText: entered };
}

function isPopularSearchInput(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  const label = resolveUiText("popular_releases", DEFAULT_UI_TEXTS.popular_releases)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized === label || normalized === "популярные релизы";
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
  const builtinSelected = selectedUrl === BUILTIN_POPULAR_SEARCH_VALUE;
  let hasSelectedOption = false;

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = resolveUiText("saved_searches", DEFAULT_UI_TEXTS.saved_searches);
  placeholderOption.selected = !normalizedSelectedUrl && !builtinSelected;
  savedSearchesSelect.appendChild(placeholderOption);

  const popularOption = document.createElement("option");
  popularOption.value = BUILTIN_POPULAR_SEARCH_VALUE;
  popularOption.textContent = resolveUiText("popular_releases", DEFAULT_UI_TEXTS.popular_releases);
  popularOption.selected = builtinSelected;
  savedSearchesSelect.appendChild(popularOption);

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

  if (!hasSelectedOption && normalizedSelectedUrl && !builtinSelected) {
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
  if (!Number.isFinite(kValue) || kValue <= 0) return Number.NEGATIVE_INFINITY;
  if (kValue >= 8) return 4320;
  if (kValue >= 5) return 2880;
  if (kValue >= 4) return 2160;
  if (kValue >= 3) return 1800;
  if (kValue >= 2) return 1440;
  return 1080;
}

function extractQualityFromTitle(title) {
  const normalized = String(title || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
  if (!normalized) return null;

  const candidates = [];
  const pushCandidate = (label, height, confidence = 0) => {
    if (!label || !Number.isFinite(height) || height <= 0) return;
    candidates.push({ label, height, confidence });
  };

  for (const match of normalized.matchAll(/(?:^|[^0-9a-zа-я])(\d{3,4})\s*[pр]\b/giu)) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value) || value < 100 || value > 9000) continue;
    pushCandidate(`${value}p`, value, 5);
  }

  for (const match of normalized.matchAll(
    /(?:^|[^0-9])((?:540|576|720|900|960|1024|1080|1200|1440|1600|1800|2160|2880|4320))(?:[^0-9]|$)/giu
  )) {
    const value = Number.parseInt(match[1], 10);
    if (!Number.isFinite(value)) continue;
    pushCandidate(`${value}p`, value, 3);
  }

  for (const match of normalized.matchAll(/(?:^|[^0-9a-zа-я])(\d(?:[.,]\d+)?)\s*[kк]\b/giu)) {
    const value = Number.parseFloat(String(match[1]).replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    const renderedValue = Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
    pushCandidate(`${renderedValue}K`, mapKValueToHeight(value), 6);
  }

  for (const match of normalized.matchAll(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/giu)) {
    const left = Number.parseInt(match[1], 10);
    const right = Number.parseInt(match[2], 10);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    const height = Math.min(left, right);
    if (!Number.isFinite(height) || height < 100 || height > 9000) continue;
    pushCandidate(`${height}p`, height, 4);
  }

  if (/\b(?:uhd|ultra\s*hd)\b/iu.test(normalized)) pushCandidate("4K", 2160, 2);
  if (/\bqhd\b/iu.test(normalized)) pushCandidate("2K", 1440, 2);
  if (/\bfhd\b/iu.test(normalized)) pushCandidate("1080p", 1080, 2);
  if (/\bhd\b/iu.test(normalized) && !/\b(?:uhd|qhd|fhd)\b/iu.test(normalized)) {
    pushCandidate("720p", 720, 1);
  }

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    if (right.height !== left.height) return right.height - left.height;
    return right.confidence - left.confidence;
  });
  return candidates[0];
}

function normalizeQualityLabel(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || QUALITY_NA_LABEL;
}

function removeQualityTokensFromTitle(title) {
  return window.TrackerViewReleaseGrouping.removeQualityTokensFromTitle(title);
}

function normalizeReleaseGroupTitle(title) {
  return window.TrackerViewReleaseGrouping.normalizeReleaseGroupTitle(title);
}

function resolveReleaseGroupKey(release) {
  if (!release || release.error) {
    return "";
  }

  const titleKey = normalizeReleaseGroupTitle(release.title);
  if (!titleKey) {
    return resolveReleaseRowKey(release);
  }

  const categoryKey = normalizeCategoryName(release.category).toLowerCase().replace(/ё/g, "е");
  return `${categoryKey}|${titleKey}`;
}

function resolveQualityBadgeTone(quality) {
  if (!quality || quality.label === QUALITY_NA_LABEL) return "na";
  const height = Number(quality?.height);
  if (!Number.isFinite(height)) return "red";
  if (height >= 1440) return "blue";
  if (height >= 1080) return "green";
  if (height >= 720) return "yellow";
  return "red";
}

function resolveReleaseQualityInfo(release) {
  const fromServer = release?.quality;
  if (fromServer && typeof fromServer === "object" && fromServer.label) {
    const normalized = {
      label: normalizeQualityLabel(fromServer.label),
      height: Number.isFinite(fromServer.height) ? fromServer.height : Number.NEGATIVE_INFINITY
    };
    const tone = String(fromServer.tone || "").trim() || resolveQualityBadgeTone(normalized);
    return { ...normalized, tone };
  }

  const detectedQuality = extractQualityFromTitle(release?.title);
  if (!detectedQuality) {
    return { label: QUALITY_NA_LABEL, height: Number.NEGATIVE_INFINITY, tone: "na" };
  }
  const normalizedQuality = {
    label: normalizeQualityLabel(detectedQuality.label),
    height: Number.isFinite(detectedQuality.height) ? detectedQuality.height : Number.NEGATIVE_INFINITY
  };
  return { ...normalizedQuality, tone: resolveQualityBadgeTone(normalizedQuality) };
}

function createQualityBadge(qualityInfo) {
  const resolvedQuality =
    qualityInfo && typeof qualityInfo === "object"
      ? qualityInfo
      : { label: QUALITY_NA_LABEL, height: Number.NEGATIVE_INFINITY, tone: "na" };
  const badge = document.createElement("span");
  badge.className = `quality-badge quality-badge--${resolvedQuality.tone || "na"}`;
  badge.textContent = resolvedQuality.label;
  badge.title = `Detected from title: ${resolvedQuality.label}`;
  return badge;
}

function closeQualityMenus(exceptMenu = null) {
  document.querySelectorAll(".quality-menu").forEach((menu) => {
    if (menu === exceptMenu) {
      return;
    }
    menu.hidden = true;
    const switcher = menu.closest(".quality-switcher");
    const button = switcher?.querySelector(".quality-badge-switch");
    if (button) {
      button.setAttribute("aria-expanded", "false");
    }
  });
}

function formatQualityVariantOption(variant) {
  const qualityInfo = resolveReleaseQualityInfo(variant);
  const size = String(variant?.size || "").trim();
  return size ? `${qualityInfo.label} · ${size}` : qualityInfo.label;
}

function createQualityControl(release) {
  const variants = Array.isArray(release?.qualityVariants) ? release.qualityVariants : [];
  if (variants.length <= 1 || !release?.qualityGroupKey) {
    return createQualityBadge(resolveReleaseQualityInfo(release));
  }

  const currentQuality = resolveReleaseQualityInfo(release);
  const currentVariantKey = resolveReleaseRowKey(release);
  const wrap = document.createElement("div");
  wrap.className = "quality-switcher";

  const button = document.createElement("button");
  button.type = "button";
  button.className = `quality-badge quality-badge--${currentQuality.tone || "na"} quality-badge-switch`;
  button.textContent = currentQuality.label;
  button.title = "Выбрать качество";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "quality-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");

  for (const variant of variants) {
    const qualityInfo = resolveReleaseQualityInfo(variant);
    const variantKey = resolveReleaseRowKey(variant);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `quality-menu-item quality-menu-item--${qualityInfo.tone || "na"}`;
    item.classList.toggle("quality-menu-item-active", variantKey === currentVariantKey);
    item.textContent = formatQualityVariantOption(variant);
    item.title = variant.title || "";
    item.setAttribute("role", "menuitem");
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedReleaseVariantByGroupKey.set(release.qualityGroupKey, variantKey);
      closeQualityMenus();
      updateFeedView();
    });
    menu.appendChild(item);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = menu.hidden;
    closeQualityMenus(menu);
    menu.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  });

  wrap.appendChild(button);
  wrap.appendChild(menu);
  return wrap;
}

function normalizeReleaseDateSortOrder(value) {
  return value === DATE_SORT_ASC ? DATE_SORT_ASC : DATE_SORT_DESC;
}

function updateSortIndicator() {
  const order = normalizeReleaseDateSortOrder(releaseDateSortOrder);
  if (sortArrowNode) {
    sortArrowNode.textContent = order === DATE_SORT_ASC ? "↑" : "↓";
  }
  sortDateButton.setAttribute(
    "aria-label",
    order === DATE_SORT_ASC ? "Sort by date ascending" : "Sort by date descending"
  );
}

function setReleaseDateSortOrder(nextOrder) {
  const normalizedOrder = normalizeReleaseDateSortOrder(nextOrder);
  if (releaseDateSortOrder === normalizedOrder) {
    updateSortIndicator();
    return;
  }
  releaseDateSortOrder = normalizedOrder;
  updateSortIndicator();
  if (allReleases.length > 0) {
    updateFeedView();
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

  if (!raw) return Number.NEGATIVE_INFINITY;

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
    if (leftHasDate !== rightHasDate) return leftHasDate ? -1 : 1;
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

function releaseFavoriteTags(release) {
  return normalizeReleaseTags(release).filter((tagName) => getTagState(tagName).favorite);
}

function releaseHasFavoriteTag(release) {
  return releaseFavoriteTags(release).length > 0;
}

function sortReleasesByFavoriteThenDate(releases, sortOrder = releaseDateSortOrder) {
  const sortedByDate = sortReleasesByDate(releases, sortOrder);
  return sortedByDate.sort((left, right) => {
    const leftFavorite = releaseHasFavoriteTag(left);
    const rightFavorite = releaseHasFavoriteTag(right);
    if (leftFavorite !== rightFavorite) {
      return leftFavorite ? -1 : 1;
    }
    return 0;
  });
}

function compareReleaseVariantsByQuality(left, right) {
  const leftQuality = resolveReleaseQualityInfo(left);
  const rightQuality = resolveReleaseQualityInfo(right);
  const leftHeight = Number.isFinite(leftQuality.height) ? leftQuality.height : Number.NEGATIVE_INFINITY;
  const rightHeight = Number.isFinite(rightQuality.height) ? rightQuality.height : Number.NEGATIVE_INFINITY;
  if (rightHeight !== leftHeight) {
    return rightHeight - leftHeight;
  }

  const leftDate = parsePublicationDateToTimestamp(left?.publicationDate);
  const rightDate = parsePublicationDateToTimestamp(right?.publicationDate);
  if (rightDate !== leftDate) {
    return rightDate - leftDate;
  }

  return String(right?.topicId || "").localeCompare(String(left?.topicId || ""));
}

function buildGroupedReleaseItems(releases) {
  const groupsByKey = new Map();
  const displayItems = [];

  for (const release of releases || []) {
    if (!release || release.error) {
      displayItems.push(release);
      continue;
    }

    const groupKey = resolveReleaseGroupKey(release);
    if (!groupKey) {
      displayItems.push(release);
      continue;
    }

    if (!groupsByKey.has(groupKey)) {
      const group = {
        groupKey,
        variants: []
      };
      groupsByKey.set(groupKey, group);
      displayItems.push(group);
    }

    groupsByKey.get(groupKey).variants.push(release);
  }

  return displayItems
    .map((item) => {
      if (!item || !item.variants) {
        return item;
      }

      const variants = [...item.variants].sort(compareReleaseVariantsByQuality);
      const selectedVariantKey = selectedReleaseVariantByGroupKey.get(item.groupKey);
      const selectedVariant =
        variants.find((variant) => resolveReleaseRowKey(variant) === selectedVariantKey) || variants[0];

      if (!selectedVariant) {
        return null;
      }

      return {
        ...selectedVariant,
        qualityGroupKey: item.groupKey,
        qualityVariants: variants
      };
    })
    .filter(Boolean);
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", Boolean(isError));
}

function setProgress(processed, total) {
  const safeProcessed = Number.isFinite(processed) ? processed : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;
  const prefix = resolveUiText("processed_prefix", DEFAULT_UI_TEXTS.processed_prefix);
  const prefixOut = prefix ? `${prefix} ` : "";
  if (safeTotal > 0) {
    progressNode.textContent = `${prefixOut}${safeProcessed} / ${safeTotal}`;
    return;
  }
  if (safeProcessed > 0) {
    progressNode.textContent = `${prefixOut}${safeProcessed} / ?`;
    return;
  }
  progressNode.textContent = `${prefixOut}0 / 0`;
}

function clearFeed() {
  releaseFeedNode.innerHTML = "";
}

function renderFeedPlaceholder(text) {
  clearFeed();
  const placeholder = document.createElement("p");
  placeholder.className = "feed-placeholder";
  placeholder.textContent = text;
  releaseFeedNode.appendChild(placeholder);
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function createReleaseTagsElement(release, { compact = true } = {}) {
  const tags = normalizeReleaseTags(release);
  if (tags.length === 0) return null;

  const wrap = document.createElement("div");
  wrap.className = compact ? "release-tags release-tags-compact" : "release-tags";
  const visibleTags = compact ? tags.slice(0, 8) : tags;
  for (const tagName of visibleTags) {
    const tag = document.createElement("span");
    tag.className = "release-tag";
    if (getTagState(tagName).favorite) {
      tag.classList.add("release-tag-favorite");
    }
    tag.textContent = tagName;
    wrap.appendChild(tag);
  }

  if (compact && tags.length > visibleTags.length) {
    const more = document.createElement("span");
    more.className = "release-tag release-tag-muted";
    more.textContent = `+${tags.length - visibleTags.length}`;
    wrap.appendChild(more);
  }

  return wrap;
}

function hidePosterPreview() {
  activeHoverPreviewToken += 1;
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
  if (!sourceUrl) return;
  const hoverToken = activeHoverPreviewToken + 1;
  activeHoverPreviewToken = hoverToken;

  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 2;
  const previewWidth = Math.round(image.clientWidth * normalizedScale);
  hoverPanel.style.width = `${Math.max(120, previewWidth)}px`;

  function keepFallbackOrHide() {
    hoverPanelImage.onerror = null;
    if (fallbackUrl) {
      hoverPanelImage.src = fallbackUrl;
      return;
    }
    hidePosterPreview();
  }

  hoverPanelImage.onerror = keepFallbackOrHide;
  hoverPanelImage.src = fallbackUrl && sourceUrl !== fallbackUrl ? fallbackUrl : sourceUrl;
  hoverPanelImage.alt = image.alt || "Preview";
  hoverPanel.style.display = "block";
  movePosterPreview(event);

  if (fallbackUrl && sourceUrl !== fallbackUrl) {
    const loader = new Image();
    loader.decoding = "async";
    loader.referrerPolicy = image.referrerPolicy || "no-referrer";
    loader.onload = () => {
      if (activeHoverPreviewToken !== hoverToken || hoverPanel.style.display === "none") {
        return;
      }
      hoverPanelImage.onerror = keepFallbackOrHide;
      hoverPanelImage.src = sourceUrl;
      movePosterPreview(event);
    };
    loader.onerror = () => {
      // Keep the stretched thumbnail visible when the large preview is still unavailable.
    };
    loader.src = sourceUrl;
  }
}

function createPosterElement(release) {
  const wrap = document.createElement("div");
  wrap.className = "card-poster";

  if (!release.posterUrl) {
    const fallback = document.createElement("div");
    fallback.className = "card-poster-fallback";
    fallback.textContent = "No image";
    wrap.appendChild(fallback);
    return wrap;
  }

  const image = document.createElement("img");
  image.src = release.posterUrl;
  image.alt = release.title || "Poster";
  image.loading = "lazy";
  image.setAttribute("fetchpriority", "high");
  image.referrerPolicy = "no-referrer";

  image.addEventListener("mouseenter", (event) => showImagePreview(event, image));
  image.addEventListener("mousemove", (event) => movePosterPreview(event));
  image.addEventListener("mouseleave", () => hidePosterPreview());

  image.addEventListener("error", () => {
    image.remove();
    const fallback = document.createElement("div");
    fallback.className = "card-poster-fallback";
    fallback.textContent = "No image";
    wrap.appendChild(fallback);
  });

  wrap.appendChild(image);
  return wrap;
}

function createThumbnailsStrip(release) {
  const screenshots = Array.isArray(release?.screenshots) ? release.screenshots : [];
  if (screenshots.length === 0) return null;

  const strip = document.createElement("div");
  strip.className = "card-thumbs";

  for (const [index, screenshot] of screenshots.entries()) {
    const thumbUrl = String(screenshot?.thumbUrl || "").trim();
    const fullUrl = String(screenshot?.fullUrl || thumbUrl).trim();
    const previewUrl = String(screenshot?.previewUrl || "").trim();
    if (!thumbUrl) continue;

    const image = document.createElement("img");
    image.src = thumbUrl;
    image.alt = "Screenshot";
    image.className = "card-thumb";
    image.loading = "lazy";
    image.decoding = "async";
    image.setAttribute("fetchpriority", index < 3 ? "high" : "low");
    image.referrerPolicy = "no-referrer";

    image.addEventListener("mouseenter", (event) =>
      showImagePreview(event, image, previewUrl || fullUrl || thumbUrl, 3, true)
    );
    image.addEventListener("mousemove", (event) => movePosterPreview(event));
    image.addEventListener("mouseleave", () => hidePosterPreview());

    image.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.open(fullUrl || thumbUrl, "_blank", "noopener,noreferrer");
    });

    image.addEventListener("error", () => {
      image.remove();
    });

    strip.appendChild(image);
  }

  if (!strip.children.length) return null;
  return strip;
}

function resolveReleaseRowKey(release) {
  const topicId = String(release?.topicId || "").trim();
  if (topicId) return `topic:${topicId}`;
  const topicUrl = String(release?.topicUrl || "").trim();
  if (topicUrl) return `topic-url:${topicUrl}`;
  const torrentUrl = String(release?.torrentUrl || "").trim();
  if (torrentUrl) return `torrent:${torrentUrl}`;
  const title = String(release?.title || "").trim();
  if (title) return `title:${title}`;
  return "";
}

function isReleaseDownloaded(release) {
  const key = resolveReleaseRowKey(release);
  return Boolean(key) && downloadedReleaseKeys.has(key);
}

function markReleaseAsDownloaded(release) {
  const key = resolveReleaseRowKey(release);
  if (!key) return false;
  const hadKey = downloadedReleaseKeys.has(key);
  downloadedReleaseKeys.add(key);
  return !hadKey;
}

function applyDownloadedCardState(card, release) {
  card.classList.toggle("release-card-downloaded", isReleaseDownloaded(release));
}

function createServerDownloadControl(release, onDownloaded) {
  if (!clientConfig.directDownloadEnabled) return null;
  const torrentUrl = String(release?.torrentUrl || "").trim();
  if (!torrentUrl) return null;

  const wrap = document.createElement("div");
  wrap.className = "server-download-wrap";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "server-download-btn";
  button.classList.toggle("server-download-btn-success", isReleaseDownloaded(release));
  const downloadLabel = resolveUiText("download_to_server", DEFAULT_UI_TEXTS.download_to_server);
  button.title = downloadLabel;
  button.setAttribute("aria-label", downloadLabel);
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v10.59l-3.3-3.3-1.4 1.42L12 16.41l4.7-4.7-1.4-1.42-3.3 3.3V3h-2zM4 19h16v2H4v-2z"></path></svg>';

  const toast = document.createElement("span");
  toast.className = "server-download-toast";
  toast.textContent = resolveUiText("download_badge_done", DEFAULT_UI_TEXTS.download_badge_done);

  let hideToastTimer = null;

  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;

    try {
      const payload = await fetchJson("/api/releases/download-to-dir", {
        method: "POST",
        headers: { "content-type": "application/json" },
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

      if (typeof onDownloaded === "function") onDownloaded();
      button.classList.add("server-download-btn-success");

      toast.textContent = resolveUiText("download_badge_done", DEFAULT_UI_TEXTS.download_badge_done);
      toast.classList.add("visible");
      if (hideToastTimer) clearTimeout(hideToastTimer);
      hideToastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
    } catch (error) {
      setStatus(
        error.message ||
          resolveUiText("download_to_server_failed", DEFAULT_UI_TEXTS.download_to_server_failed),
        true
      );
    } finally {
      button.disabled = false;
    }
  });

  wrap.appendChild(button);
  wrap.appendChild(toast);
  return wrap;
}

function createReleaseCard(release) {
  const card = document.createElement("article");
  card.className = "release-card";

  if (release.error) {
    card.classList.add("release-card-error");
    const body = document.createElement("div");
    body.className = "card-body";
    const message = document.createElement("p");
    message.textContent = `Failed to parse ${release.topicUrl}: ${release.error}`;
    body.appendChild(message);
    card.appendChild(body);
    card.style.gridTemplateColumns = "1fr";
    return card;
  }

  applyDownloadedCardState(card, release);
  card.classList.toggle("release-card-favorite", releaseHasFavoriteTag(release));
  card.appendChild(createPosterElement(release));

  const body = document.createElement("div");
  body.className = "card-body";

  const header = document.createElement("div");
  header.className = "card-header";

  const titleButton = document.createElement("button");
  titleButton.type = "button";
  titleButton.className = "card-title";
  titleButton.textContent = release.title || release.topicUrl || "Untitled";
  titleButton.title = release.title || "";
  titleButton.addEventListener("click", () => openReleaseDrawer(release));

  const qualityControl = createQualityControl(release);

  header.appendChild(titleButton);
  header.appendChild(qualityControl);
  body.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const categoryName = normalizeCategoryName(release.category);
  if (categoryName && categoryName !== "Без категории") {
    const cat = document.createElement("span");
    cat.textContent = categoryName;
    meta.appendChild(cat);
  }

  if (release.publicationDate) {
    const date = document.createElement("span");
    date.textContent = release.publicationDate;
    meta.appendChild(date);
  }

  const seedsValueRaw = release?.seeds;
  const seedsValue =
    Number.isFinite(Number(seedsValueRaw)) || typeof seedsValueRaw === "string"
      ? String(seedsValueRaw).trim()
      : "";
  if (seedsValue && seedsValue !== "-") {
    const seedsLabel = resolveUiText("seeds_prefix", DEFAULT_UI_TEXTS.seeds_prefix);
    const seeds = document.createElement("span");
    seeds.className = "meta-seeds";
    seeds.textContent = `${seedsLabel} ${seedsValue}`;
    meta.appendChild(seeds);
  }

  body.appendChild(meta);

  const releaseTags = createReleaseTagsElement(release);
  if (releaseTags) {
    body.appendChild(releaseTags);
  }

  if (release.description) {
    const description = document.createElement("p");
    description.className = "card-description";
    description.textContent = truncate(release.description, 320);
    body.appendChild(description);
  }

  const thumbs = createThumbnailsStrip(release);
  if (thumbs) {
    body.appendChild(thumbs);
  }

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const footerLeft = document.createElement("div");
  footerLeft.className = "card-footer-left";
  if (release.topicId) {
    const topicId = document.createElement("span");
    topicId.textContent = `#${release.topicId}`;
    footerLeft.appendChild(topicId);
  }

  const serverDownload = createServerDownloadControl(release, () => {
    markReleaseAsDownloaded(release);
    applyDownloadedCardState(card, release);
  });
  if (serverDownload) {
    footerLeft.appendChild(serverDownload);
  }
  footer.appendChild(footerLeft);

  const footerRight = document.createElement("div");
  footerRight.className = "card-footer-right";

  const torrentUrl = String(release?.torrentUrl || "").trim();
  const sizeText = String(release?.size || "").trim();
  if (torrentUrl) {
    const sizeLink = document.createElement("a");
    sizeLink.href = torrentUrl;
    sizeLink.target = "_blank";
    sizeLink.rel = "noopener noreferrer";
    sizeLink.className = "card-size";
    sizeLink.textContent = sizeText || "Download";
    sizeLink.addEventListener("click", (event) => {
      event.stopPropagation();
      markReleaseAsDownloaded(release);
      applyDownloadedCardState(card, release);
    });
    footerRight.appendChild(sizeLink);
  } else {
    const sizeSpan = document.createElement("span");
    sizeSpan.className = "card-size size-na";
    sizeSpan.textContent = sizeText || "—";
    footerRight.appendChild(sizeSpan);
  }

  footer.appendChild(footerRight);
  body.appendChild(footer);

  card.appendChild(body);
  return card;
}

function renderReleases(releases) {
  clearFeed();

  if (!Array.isArray(releases) || releases.length === 0) {
    renderFeedPlaceholder(resolveUiText("feed_no_parsed", DEFAULT_UI_TEXTS.feed_no_parsed));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const release of releases) {
    fragment.appendChild(createReleaseCard(release));
  }
  releaseFeedNode.appendChild(fragment);
}

function buildDrawerContent(release) {
  const root = document.createElement("div");

  const title = document.createElement("h2");
  title.id = "drawer-title";
  title.textContent = release.title || release.topicUrl || "Untitled";
  root.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "drawer-meta";

  const categoryName = normalizeCategoryName(release.category);
  if (categoryName && categoryName !== "Без категории") {
    const cat = document.createElement("span");
    cat.textContent = categoryName;
    meta.appendChild(cat);
  }
  if (release.publicationDate) {
    const date = document.createElement("span");
    date.textContent = release.publicationDate;
    meta.appendChild(date);
  }
  if (release.size) {
    const size = document.createElement("span");
    size.textContent = release.size;
    meta.appendChild(size);
  }
  const seedsRaw = release?.seeds;
  const seedsValue =
    Number.isFinite(Number(seedsRaw)) || typeof seedsRaw === "string" ? String(seedsRaw).trim() : "";
  if (seedsValue && seedsValue !== "-") {
    const seeds = document.createElement("span");
    seeds.textContent = `${resolveUiText("seeds_prefix", DEFAULT_UI_TEXTS.seeds_prefix)} ${seedsValue}`;
    meta.appendChild(seeds);
  }
  const qualityInfo = resolveReleaseQualityInfo(release);
  if (qualityInfo.label !== QUALITY_NA_LABEL) {
    meta.appendChild(createQualityBadge(qualityInfo));
  }
  root.appendChild(meta);

  const releaseTags = createReleaseTagsElement(release, { compact: false });
  if (releaseTags) {
    root.appendChild(releaseTags);
  }

  if (release.topicUrl) {
    const link = document.createElement("a");
    link.className = "drawer-link";
    link.href = release.topicUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = release.topicUrl;
    root.appendChild(link);
  }

  if (release.description) {
    const sectionTitle = document.createElement("p");
    sectionTitle.className = "drawer-section-title";
    sectionTitle.textContent = "Description";
    root.appendChild(sectionTitle);

    const description = document.createElement("p");
    description.className = "drawer-description";
    description.textContent = release.description;
    root.appendChild(description);
  }

  const screenshots = Array.isArray(release.screenshots) ? release.screenshots : [];
  if (screenshots.length > 0) {
    const sectionTitle = document.createElement("p");
    sectionTitle.className = "drawer-section-title";
    sectionTitle.textContent = `Screenshots (${screenshots.length})`;
    root.appendChild(sectionTitle);

    const grid = document.createElement("div");
    grid.className = "drawer-screenshots";
    for (const [index, screenshot] of screenshots.entries()) {
      const thumbUrl = String(screenshot?.thumbUrl || "").trim();
      const fullUrl = String(screenshot?.fullUrl || thumbUrl).trim();
      if (!thumbUrl) continue;

      const link = document.createElement("a");
      link.href = fullUrl || thumbUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const image = document.createElement("img");
      image.src = thumbUrl;
      image.alt = "Screenshot";
      image.loading = "lazy";
      image.decoding = "async";
      image.setAttribute("fetchpriority", index < 3 ? "high" : "low");
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => link.remove());
      link.appendChild(image);
      grid.appendChild(link);
    }
    if (grid.children.length) {
      root.appendChild(grid);
    }
  }

  return root;
}

function openReleaseDrawer(release) {
  if (!release) return;
  drawerContentNode.innerHTML = "";
  drawerContentNode.appendChild(buildDrawerContent(release));
  releaseDrawer.hidden = false;
  releaseDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  lastFocusBeforeDrawer = document.activeElement;
  drawerCloseButton.focus();
}

function closeReleaseDrawer({ restoreFocus = true } = {}) {
  if (releaseDrawer.hidden) return;
  releaseDrawer.hidden = true;
  releaseDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
  drawerContentNode.innerHTML = "";
  if (restoreFocus && lastFocusBeforeDrawer && typeof lastFocusBeforeDrawer.focus === "function") {
    try {
      lastFocusBeforeDrawer.focus();
    } catch (error) {
      // Ignore focus restoration errors.
    }
  }
  lastFocusBeforeDrawer = null;
}

function buildQualityFilterPayload(entries) {
  return entries.map((entry) => ({
    name: normalizeQualityLabel(entry.name),
    enabled: Boolean(entry.enabled)
  }));
}

async function upsertQualityFiltersOnServer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return fetchJson("/api/quality-filters", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ qualities: buildQualityFilterPayload(entries) })
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
  if (leftIsNa !== rightIsNa) return leftIsNa ? 1 : -1;
  const leftHeight = Number.isFinite(left?.height) ? left.height : Number.NEGATIVE_INFINITY;
  const rightHeight = Number.isFinite(right?.height) ? right.height : Number.NEGATIVE_INFINITY;
  if (rightHeight !== leftHeight) return rightHeight - leftHeight;
  return leftName.localeCompare(rightName, "en", { sensitivity: "base" });
}

function renderQualityFilters() {
  qualityFiltersNode.innerHTML = "";
  const options = [...availableQualityOptions].sort(compareQualityOptions);

  if (options.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chip-empty";
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
      updateFeedView();
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
    if (!release || release.error) continue;
    const qualityInfo = resolveReleaseQualityInfo(release);
    const name = normalizeQualityLabel(qualityInfo.label);
    const currentHeight = Number.isFinite(qualityInfo.height) ? qualityInfo.height : Number.NEGATIVE_INFINITY;
    if (!optionsByName.has(name)) {
      optionsByName.set(name, { name, tone: qualityInfo.tone, height: currentHeight });
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

function buildTagPayload(entries) {
  return entries
    .map((entry) => {
      const name = normalizeTagName(entry.name);
      const current = getTagState(name);
      return {
        name,
        enabled: typeof entry.enabled === "boolean" ? entry.enabled : current.enabled,
        favorite: typeof entry.favorite === "boolean" ? entry.favorite : current.favorite
      };
    })
    .filter((entry) => entry.name);
}

async function upsertTagsOnServer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return fetchJson("/api/tags", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tags: buildTagPayload(entries) })
  });
}

function mergeTagsIntoState(tags) {
  let changed = false;
  for (const tag of tags || []) {
    const name = normalizeTagName(tag?.name);
    if (!name) continue;
    const enabled = typeof tag?.enabled === "boolean" ? tag.enabled : true;
    const favorite = typeof tag?.favorite === "boolean" ? tag.favorite : false;
    if (!tagFilterState.has(name)) {
      setTagState(name, { enabled, favorite });
      changed = true;
      continue;
    }
    const current = getTagState(name);
    if (current.enabled !== enabled || current.favorite !== favorite) {
      setTagState(name, { enabled, favorite });
      changed = true;
    }
  }
  return changed;
}

function renderTagFilters() {
  tagFiltersNode.innerHTML = "";
  const tags = Array.from(tagFilterState.entries()).sort((left, right) =>
    getTagState(left[0]).favorite !== getTagState(right[0]).favorite
      ? getTagState(left[0]).favorite
        ? -1
        : 1
      : left[0].localeCompare(right[0], "ru", { sensitivity: "base" })
  );

  if (tags.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chip-empty";
    empty.textContent = resolveUiText("tag_filters_empty", DEFAULT_UI_TEXTS.tag_filters_empty);
    tagFiltersNode.appendChild(empty);
    return;
  }

  for (const [name] of tags) {
    const state = getTagState(name);
    const chip = document.createElement("div");
    chip.className = state.favorite ? "tag-chip tag-chip-favorite" : "tag-chip";

    const label = document.createElement("label");
    label.className = "tag-chip-filter";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.enabled;

    input.addEventListener("change", async () => {
      const nextState = { ...getTagState(name), enabled: input.checked };
      setTagState(name, nextState);
      updateFeedView();
      try {
        await upsertTagsOnServer([{ name, ...nextState }]);
      } catch (error) {
        setStatus(error.message || "Failed to save tag filter.", true);
      }
    });

    const text = document.createElement("span");
    text.textContent = name;

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = state.favorite ? "tag-favorite-btn tag-favorite-btn-active" : "tag-favorite-btn";
    favoriteButton.textContent = state.favorite ? "★" : "☆";
    favoriteButton.title = state.favorite
      ? resolveUiText("tag_favorite_remove", DEFAULT_UI_TEXTS.tag_favorite_remove)
      : resolveUiText("tag_favorite_add", DEFAULT_UI_TEXTS.tag_favorite_add);
    favoriteButton.setAttribute("aria-label", favoriteButton.title);
    favoriteButton.setAttribute("aria-pressed", String(state.favorite));
    favoriteButton.addEventListener("click", async () => {
      const nextState = { ...getTagState(name), favorite: !getTagState(name).favorite };
      setTagState(name, nextState);
      renderTagFilters();
      updateFeedView();
      try {
        await upsertTagsOnServer([{ name, ...nextState }]);
      } catch (error) {
        setStatus(error.message || "Failed to save favorite tag.", true);
      }
    });

    label.appendChild(input);
    label.appendChild(text);
    chip.appendChild(label);
    chip.appendChild(favoriteButton);
    tagFiltersNode.appendChild(chip);
  }
}

function registerTagsFromReleases(releases) {
  const discovered = [];
  for (const release of releases || []) {
    for (const tagName of normalizeReleaseTags(release)) {
      if (tagFilterState.has(tagName)) continue;
      setTagState(tagName, { enabled: true, favorite: false });
      discovered.push({ name: tagName, enabled: true, favorite: false });
    }
  }
  if (discovered.length > 0) {
    renderTagFilters();
    upsertTagsOnServer(discovered).catch(() => {});
  }
}

function releaseMatchesTagFilters(release) {
  const releaseTagNames = new Set(normalizeReleaseTags(release));
  for (const [name] of tagFilterState.entries()) {
    if (getTagState(name).enabled === false && releaseTagNames.has(name)) {
      return false;
    }
  }
  return true;
}

function buildCategoryPayload(entries) {
  return entries.map((entry) => ({
    name: normalizeCategoryName(entry.name),
    enabled: Boolean(entry.enabled)
  }));
}

async function upsertCategoriesOnServer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return fetchJson("/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categories: buildCategoryPayload(entries) })
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
    empty.className = "chip-empty";
    empty.textContent = resolveUiText("category_filters_empty", DEFAULT_UI_TEXTS.category_filters_empty);
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
      updateFeedView();
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
    if (categoryState.has(categoryName)) continue;
    categoryState.set(categoryName, true);
    discovered.push({ name: categoryName, enabled: true });
  }
  if (discovered.length > 0) {
    renderCategoryFilters();
    upsertCategoriesOnServer(discovered).catch(() => {});
  }
}

function updateFeedView() {
  hidePosterPreview();

  const sortedReleases = sortReleasesByDate(allReleases, releaseDateSortOrder);
  const categoryScopedReleases = sortedReleases.filter((release) => {
    if (!release || release.error) return false;
    const categoryName = normalizeCategoryName(release?.category);
    return categoryState.get(categoryName) !== false;
  });
  const tagScopedReleases = categoryScopedReleases.filter(releaseMatchesTagFilters);

  availableQualityOptions = collectQualityOptionsFromReleases(tagScopedReleases);
  renderQualityFilters();

  const visibleReleases = sortedReleases.filter((release) => {
    if (release?.error) return true;
    const categoryName = normalizeCategoryName(release?.category);
    if (categoryState.get(categoryName) === false) return false;
    if (!releaseMatchesTagFilters(release)) return false;
    const qualityName = normalizeQualityLabel(resolveReleaseQualityInfo(release).label);
    return qualityFilterState.get(qualityName) !== false;
  });

  if (sortedReleases.length > 0 && visibleReleases.length === 0) {
    renderFeedPlaceholder(resolveUiText("feed_no_matches", DEFAULT_UI_TEXTS.feed_no_matches));
    return;
  }

  renderReleases(sortReleasesByFavoriteThenDate(buildGroupedReleaseItems(visibleReleases), releaseDateSortOrder));
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceMode: sourceRequest.sourceMode || "",
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

async function cancelParseJob(jobId, options = {}) {
  if (!jobId) return null;
  try {
    return await fetchJson(`/api/releases/job/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  } catch (error) {
    // Best-effort: server may have already finished or evicted the job.
    if (options.throwOnError) {
      throw error;
    }
    return null;
  }
}

async function stopCurrentParseJob() {
  const jobId = currentJobId;
  if (!jobId || isStoppingCurrentJob) return;

  isStoppingCurrentJob = true;
  updateLoadButtonState();
  setStatus(resolveUiText("status_stopping", DEFAULT_UI_TEXTS.status_stopping));

  try {
    await cancelParseJob(jobId, { throwOnError: true });
    if (currentJobId === jobId) {
      currentJobId = "";
    }
    setStatus(resolveUiText("status_stopped", DEFAULT_UI_TEXTS.status_stopped));
  } catch (error) {
    if (!isAuthenticated) return;
    setStatus(error.message || "Failed to stop loading.", true);
  } finally {
    isStoppingCurrentJob = false;
    updateLoadButtonState();
  }
}

async function pollJobUntilDone(jobId, onUpdate) {
  while (true) {
    if (currentJobId !== jobId) {
      const error = new Error("Job superseded.");
      error.code = "JOB_SUPERSEDED";
      throw error;
    }
    const job = await loadParseJob(jobId);
    if (currentJobId !== jobId) {
      const error = new Error("Job superseded.");
      error.code = "JOB_SUPERSEDED";
      throw error;
    }
    onUpdate(job);
    if (job.status === "done") return job;
    if (job.status === "cancelled") {
      const error = new Error("Job cancelled.");
      error.code = "JOB_CANCELLED";
      throw error;
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

async function loadSavedTags() {
  const payload = await fetchJson("/api/tags");
  mergeTagsIntoState(payload.tags || []);
  renderTagFilters();
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
    headers: { "content-type": "application/json" },
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

  const name = window.prompt("Сохранить поиск", initialName);
  if (!name) return;
  upsertSavedSearchOnServer(name, currentUrl)
    .then(() => {
      setStatus("Search saved.");
      savedSearchesSelect.value = currentUrl;
    })
    .catch((error) => setStatus(error.message || "Failed to save search.", true));
}

function applyUpdateControlStatus(payload) {
  const enabled = Boolean(payload?.enabled);
  const running = Boolean(payload?.running);
  const lastError = String(payload?.lastError || "").trim();
  const lastExitCode =
    Number.isInteger(payload?.lastExitCode) || payload?.lastExitCode === 0 ? payload.lastExitCode : null;

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
      formatUiTemplate(
        "update_exit_code_template",
        { code: lastExitCode },
        DEFAULT_UI_TEXTS.update_exit_code_template
      ),
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
  isStartingParseJob = true;
  updateLoadButtonState();
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

  try { await loadSavedCategories(); } catch (error) { renderCategoryFilters(); }
  try { await loadSavedTags(); } catch (error) { renderTagFilters(); }
  try { await loadSavedQualityFilters(); } catch (error) { renderQualityFilters(); }
  try { await loadSavedSearches(); } catch (error) { renderSavedSearches(); }
  try { await refreshUpdateControlStatus(); } catch (error) { resetUpdateUiState(); }

  isStartingParseJob = false;
  updateLoadButtonState();
}

window.addEventListener("scroll", () => {
  hidePosterPreview();
  closeQualityMenus();
}, true);
window.addEventListener("resize", () => hidePosterPreview());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hidePosterPreview();
});
document.addEventListener("click", () => closeQualityMenus());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeQualityMenus();
  }
  if (event.key === "Escape" && !releaseDrawer.hidden) {
    closeReleaseDrawer();
  }
});

setFiltersExpanded(false);
setSaveSearchButtonVisible(false);
setAuthenticatedUi(false);
resetDataState();
setStatus(resolveUiText("status_auth_required", DEFAULT_UI_TEXTS.status_auth_required));
setAuthStatus(resolveUiText("auth_status_prompt", DEFAULT_UI_TEXTS.auth_status_prompt));

savedSearchesSelect.addEventListener("change", () => {
  if (!isAuthenticated) return;
  if (savedSearchesSelect.value === BUILTIN_POPULAR_SEARCH_VALUE) {
    sourceInput.value = resolveUiText("popular_releases", DEFAULT_UI_TEXTS.popular_releases);
    return;
  }
  const selectedUrl = normalizeSearchUrl(savedSearchesSelect.value);
  if (!selectedUrl) return;
  sourceInput.value = selectedUrl;
});

sourceInput.addEventListener("input", () => {
  if (!isAuthenticated) return;
  if (isPopularSearchInput(sourceInput.value)) {
    savedSearchesSelect.value = BUILTIN_POPULAR_SEARCH_VALUE;
    return;
  }
  const normalized = normalizeSearchUrl(sourceInput.value);
  const existing = findSavedSearchByUrl(normalized);
  savedSearchesSelect.value = existing ? normalized : "";
});

filtersToggleButton.addEventListener("click", () => {
  if (!isAuthenticated) return;
  setFiltersExpanded(filtersPanel.hidden);
});

sortDateButton.addEventListener("click", () => {
  toggleReleaseDateSortOrder();
});

drawerCloseButton.addEventListener("click", () => closeReleaseDrawer());
drawerBackdrop.addEventListener("click", () => closeReleaseDrawer());

saveSearchButton.addEventListener("click", () => {
  if (!isAuthenticated) return;
  openSaveSearchDialog();
});

saveSearchCancelButton.addEventListener("click", () => saveSearchDialog.close());

saveSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAuthenticated) return;
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
    if (!isAuthenticated) return;
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
  if (currentJobId) {
    await stopCurrentParseJob();
    return;
  }
  if (isStartingParseJob || isStoppingCurrentJob) {
    return;
  }

  const sourceRequest = resolveSourceRequest(sourceInput.value);
  const pageUrl = sourceRequest.pageUrl;
  const maxReleasesValue = Number.parseInt(String(maxReleasesInput.value || "").trim(), 10);
  const maxReleases =
    Number.isFinite(maxReleasesValue) && maxReleasesValue > 0 ? maxReleasesValue : undefined;

  if (!pageUrl && !sourceRequest.queryText && sourceRequest.mode !== "popular") {
    setStatus("Enter source URL or text query.", true);
    return;
  }
  if (!sourceRequest.rawInput && pageUrl) {
    sourceInput.value = pageUrl;
  }

  isStartingParseJob = true;
  updateLoadButtonState();
  setSaveSearchButtonVisible(false);
  hidePosterPreview();
  closeReleaseDrawer({ restoreFocus: false });
  setStatus(
    sourceRequest.mode === "popular"
      ? resolveUiText("status_starting_popular", DEFAULT_UI_TEXTS.status_starting_popular)
      : sourceRequest.mode === "text"
        ? "Starting text search..."
        : "Starting parse..."
  );
  setProgress(0, 0);
  summaryNode.textContent = "";
  allReleases = [];
  selectedReleaseVariantByGroupKey.clear();
  registerQualityFiltersFromReleases([]);
  renderFeedPlaceholder(resolveUiText("feed_waiting", DEFAULT_UI_TEXTS.feed_waiting));

  const previousJobId = currentJobId;
  currentJobId = "";
  if (previousJobId) {
    cancelParseJob(previousJobId);
  }

  let jobId = "";
  try {
    jobId = await startParseJob(sourceRequest, maxReleases);
    currentJobId = jobId;
    isStartingParseJob = false;
    updateLoadButtonState();

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

      if (Array.isArray(job.tags)) {
        if (mergeTagsIntoState(job.tags)) {
          renderTagFilters();
        }
      }

      if (releases.length > 0) {
        allReleases = releases;
        registerCategoriesFromReleases(releases);
        registerTagsFromReleases(releases);
        registerQualityFiltersFromReleases(releases);
        updateFeedView();
      }

      if (job.status === "done" && releases.length === 0) {
        allReleases = [];
        registerQualityFiltersFromReleases([]);
        updateFeedView();
      }
    });

    allReleases = Array.isArray(finalJob.releases) ? finalJob.releases : [];
    registerCategoriesFromReleases(allReleases);
    registerTagsFromReleases(allReleases);
    registerQualityFiltersFromReleases(allReleases);
    updateFeedView();

    const parsed = allReleases.length;
    summaryNode.textContent = formatUiTemplate(
      "summary_found_parsed_template",
      { found: finalJob.totalFound, parsed },
      DEFAULT_UI_TEXTS.summary_found_parsed_template
    );
    setProgress(finalJob.processed, finalJob.totalFound);
    setStatus(resolveUiText("status_done", DEFAULT_UI_TEXTS.status_done));
    if (currentJobId === jobId) {
      currentJobId = "";
    }
    const resolvedSourceUrl = normalizeSearchUrl(finalJob.sourceUrl) || normalizeSearchUrl(pageUrl) || pageUrl;
    lastSuccessfulSearchUrl = resolvedSourceUrl;
    if (sourceRequest.mode === "popular") {
      sourceInput.value = sourceRequest.rawInput;
      savedSearchesSelect.value = BUILTIN_POPULAR_SEARCH_VALUE;
      setSaveSearchButtonVisible(false);
    } else if (lastSuccessfulSearchUrl) {
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
    if (!isAuthenticated) return;
    if (error?.code === "JOB_SUPERSEDED") return;
    if (error?.code === "JOB_CANCELLED") {
      if (currentJobId === jobId) {
        currentJobId = "";
      }
      setStatus(resolveUiText("status_stopped", DEFAULT_UI_TEXTS.status_stopped));
      setSaveSearchButtonVisible(false);
      return;
    }
    if (currentJobId === jobId) {
      currentJobId = "";
      cancelParseJob(jobId);
    }
    renderFeedPlaceholder(resolveUiText("feed_unable_to_load", DEFAULT_UI_TEXTS.feed_unable_to_load));
    summaryNode.textContent = "";
    setProgress(0, 0);
    setStatus(error.message || "Unexpected error", true);
    setSaveSearchButtonVisible(false);
  } finally {
    isStartingParseJob = false;
    updateLoadButtonState();
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
    setCsrfToken(payload?.csrfToken);
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
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  if (authSubmitButton.disabled) return;
  if (typeof authForm.requestSubmit === "function") {
    authForm.requestSubmit(authSubmitButton);
    return;
  }
  authSubmitButton.click();
}

authUsernameInput.addEventListener("keydown", submitAuthFormFromEnter);
authPasswordInput.addEventListener("keydown", submitAuthFormFromEnter);

updateButton.addEventListener("click", async () => {
  if (!isAuthenticated || !isUpdateAvailable || updateButton.disabled) return;
  const shouldStart = window.confirm(resolveUiText("update_confirm", DEFAULT_UI_TEXTS.update_confirm));
  if (!shouldStart) return;
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
    // Session may already be absent.
  } finally {
    setCsrfToken("");
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

  try { await loadUiTexts(); } catch (error) { /* keep defaults */ }
  try { await loadPublicAppVersion(); } catch (error) { /* keep placeholder */ }

  try {
    const status = await loadAuthStatus();
    if (status?.authenticated) {
      setCsrfToken(status?.csrfToken);
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
