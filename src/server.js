const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { spawn } = require("child_process");

const { config } = require("./config");
const { TrackerClient } = require("./trackerClient");
const { parseReleasePage, parseReleasesFromCollection, enrichReleaseScreenshots } = require("./parser");
const { createCategoryStore } = require("./categoryStore");
const { createSavedSearchStore, normalizeSearchName, normalizeSearchUrl } = require("./savedSearchStore");
const { createReleaseCacheStore } = require("./releaseCacheStore");
const diagnostics = require("./diagnostics");

diagnostics.configure(config.diagnostics);

const app = express();
const parseJobs = new Map();
const PARSE_JOB_TTL_MS = 30 * 60 * 1000;
const authSessions = new Map();
const AUTH_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_COOKIE_NAME = "tv_session";
const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;
const loginAttemptsByIp = new Map();
const RAW_CONFIGURED_UPDATE_SCRIPT_PATH = String(config.app.updateScriptPath || "").trim();
const DEFAULT_UPDATE_SCRIPT_PATH = path.resolve(path.join(__dirname, "..", "update.sh"));
const updateState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastExitCode: null,
  lastSignal: null,
  lastError: null
};
const categoryStore = createCategoryStore(path.join(__dirname, "..", "data", "categories.json"));
const qualityFilterStore = createCategoryStore(path.join(__dirname, "..", "data", "quality-filters.json"));
const tagStore = createCategoryStore(path.join(__dirname, "..", "data", "tags.json"));
const savedSearchStore = createSavedSearchStore(path.join(__dirname, "..", "data", "saved-searches.json"));
const releaseCacheStore = createReleaseCacheStore(path.join(__dirname, "..", "data", "releases-cache.json"));
const MAX_DOWNLOAD_FILE_NAME_LENGTH = 180;

app.set("trust proxy", true);

app.use((_, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "interest-cohort=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' http: https: data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"
  );
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function parseSafeUrl(url) {
  try {
    return new URL(url);
  } catch (error) {
    return null;
  }
}

function normalizeUrl(url) {
  const parsed = parseSafeUrl(String(url || "").trim());
  if (!parsed) {
    return "";
  }

  parsed.hash = "";
  return parsed.toString();
}

function normalizeQueryText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function trackerCredentialsConfigured() {
  return Boolean(config.tracker.username && config.tracker.password);
}

function parseCookieHeader(rawHeader) {
  const parsed = new Map();
  const cookieHeader = String(rawHeader || "");
  if (!cookieHeader) {
    return parsed;
  }

  const lines = cookieHeader.split(";");
  for (const line of lines) {
    const pair = line.trim();
    if (!pair) {
      continue;
    }

    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    parsed.set(name, value);
  }

  return parsed;
}

function getAuthTokenFromRequest(request) {
  const cookies = parseCookieHeader(request.headers?.cookie);
  return String(cookies.get(AUTH_COOKIE_NAME) || "").trim();
}

function cleanupAuthSessions() {
  const now = Date.now();
  for (const [token, session] of authSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      authSessions.delete(token);
    }
  }
}

function createAuthSession(username) {
  cleanupAuthSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  authSessions.set(token, {
    username,
    expiresAt,
    csrfToken
  });
  return { token, expiresAt, csrfToken };
}

function getClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return forwarded || request.ip || request.socket?.remoteAddress || "unknown";
}

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttemptsByIp.get(ip);

  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000)
    };
  }

  if (!entry || entry.windowStart + LOGIN_RATE_LIMIT_WINDOW_MS < now) {
    loginAttemptsByIp.set(ip, { windowStart: now, count: 1, blockedUntil: 0 });
    return { ok: true };
  }

  entry.count += 1;
  if (entry.count > LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    entry.blockedUntil = now + LOGIN_RATE_LIMIT_BLOCK_MS;
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(LOGIN_RATE_LIMIT_BLOCK_MS / 1000)
    };
  }

  return { ok: true };
}

function resetLoginRateLimit(ip) {
  loginAttemptsByIp.delete(ip);
}

function resolveAuthSession(request) {
  const token = getAuthTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const session = authSessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }

  return {
    token,
    session
  };
}

function clearAuthSessionByToken(token) {
  if (!token) {
    return;
  }
  authSessions.delete(token);
}

function setAuthCookie(response, token) {
  response.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_SESSION_TTL_MS
  });
}

function clearAuthCookie(response) {
  response.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
}

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function credentialsMatchTracker(username, password) {
  return safeEquals(username, config.tracker.username) && safeEquals(password, config.tracker.password);
}

function toAbsolutePath(rawPath) {
  const normalized = String(rawPath || "").trim();
  if (!normalized) {
    return "";
  }

  return path.resolve(normalized);
}

function isExistingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

function isExistingDirectory(directoryPath) {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch (error) {
    return false;
  }
}

function resolveDirectDownloadDir() {
  return toAbsolutePath(config.tracker.directDownloadDir);
}

function isDirectDownloadAvailable() {
  const directoryPath = resolveDirectDownloadDir();
  return Boolean(directoryPath) && isExistingDirectory(directoryPath);
}

function resolveTrustedTrackerUrl(rawUrl) {
  const baseUrl = parseSafeUrl(config.tracker.baseUrl);
  if (!baseUrl) {
    return "";
  }

  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(value, baseUrl);
  } catch (error) {
    return "";
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return "";
  }

  if (parsed.origin !== baseUrl.origin) {
    return "";
  }

  return parsed.toString();
}

function unquoteHeaderValue(value) {
  const text = String(value || "").trim();
  if (text.startsWith("\"") && text.endsWith("\"") && text.length >= 2) {
    return text.slice(1, -1);
  }
  return text;
}

function decodeRfc5987Value(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch (error) {
    return String(value || "");
  }
}

function extractFileNameFromContentDisposition(headerValue) {
  const header = String(headerValue || "").trim();
  if (!header) {
    return "";
  }

  const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeRfc5987Value(unquoteHeaderValue(utf8Match[1]));
  }

  const genericExtendedMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (genericExtendedMatch) {
    const raw = unquoteHeaderValue(genericExtendedMatch[1]);
    const separatorIndex = raw.indexOf("''");
    if (separatorIndex >= 0) {
      return decodeRfc5987Value(raw.slice(separatorIndex + 2));
    }
    return decodeRfc5987Value(raw);
  }

  const basicMatch = header.match(/filename\s*=\s*([^;]+)/i);
  if (basicMatch) {
    return unquoteHeaderValue(basicMatch[1]);
  }

  return "";
}

function sanitizeFileName(rawValue) {
  const cleaned = String(rawValue || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");

  if (!cleaned) {
    return "";
  }

  if (cleaned.length <= MAX_DOWNLOAD_FILE_NAME_LENGTH) {
    return cleaned;
  }

  return cleaned.slice(0, MAX_DOWNLOAD_FILE_NAME_LENGTH).trim();
}

function ensureTorrentExtension(fileName) {
  const normalized = String(fileName || "").trim();
  if (!normalized) {
    return "";
  }

  if (/\.torrent$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}.torrent`;
}

function buildDownloadFileName({ torrentUrl, title, contentDisposition }) {
  const fromHeader = sanitizeFileName(extractFileNameFromContentDisposition(contentDisposition));
  if (fromHeader) {
    return ensureTorrentExtension(fromHeader);
  }

  const urlFileName = sanitizeFileName(path.basename(new URL(torrentUrl).pathname || ""));
  if (urlFileName && !/\b(dl|download|file|torrent)\.php$/i.test(urlFileName)) {
    return ensureTorrentExtension(urlFileName);
  }

  const fromTitle = sanitizeFileName(String(title || ""));
  if (fromTitle) {
    return ensureTorrentExtension(fromTitle);
  }

  return `release-${Date.now()}.torrent`;
}

function resolveUniqueDownloadPath(directoryPath, fileName) {
  const normalizedName = sanitizeFileName(fileName) || `release-${Date.now()}.torrent`;
  const ensuredName = ensureTorrentExtension(normalizedName);
  const extension = path.extname(ensuredName);
  const baseName = extension ? ensuredName.slice(0, -extension.length) : ensuredName;

  for (let index = 0; index < 10_000; index += 1) {
    const suffix = index === 0 ? "" : ` (${index})`;
    const candidateName = `${baseName}${suffix}${extension}`;
    const candidatePath = path.join(directoryPath, candidateName);
    if (!fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Unable to allocate unique file name for direct download.");
}

function resolveUpdateScriptPath() {
  const configuredPath = toAbsolutePath(RAW_CONFIGURED_UPDATE_SCRIPT_PATH);
  if (configuredPath && isExistingFile(configuredPath)) {
    return configuredPath;
  }

  if (isExistingFile(DEFAULT_UPDATE_SCRIPT_PATH)) {
    return DEFAULT_UPDATE_SCRIPT_PATH;
  }

  return configuredPath || DEFAULT_UPDATE_SCRIPT_PATH;
}

function isUpdateScriptAvailable() {
  const scriptPath = resolveUpdateScriptPath();
  return Boolean(scriptPath) && isExistingFile(scriptPath);
}

function createUpdateStatusPayload() {
  const scriptPath = resolveUpdateScriptPath();
  const enabled = isUpdateScriptAvailable();
  return {
    enabled,
    running: updateState.running,
    startedAt: updateState.startedAt,
    finishedAt: updateState.finishedAt,
    lastExitCode: updateState.lastExitCode,
    lastSignal: updateState.lastSignal,
    lastError: updateState.lastError,
    scriptPath: enabled ? scriptPath : ""
  };
}

function spawnUpdateScript() {
  const scriptPath = resolveUpdateScriptPath();
  if (!isExistingFile(scriptPath)) {
    throw new Error("Update script not found.");
  }

  if (process.platform === "win32") {
    return spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        cwd: path.dirname(scriptPath),
        detached: true,
        stdio: "ignore"
      }
    );
  }

  return spawn("/bin/sh", [scriptPath], {
    cwd: path.dirname(scriptPath),
    detached: true,
    stdio: "ignore"
  });
}

function resolveHardMaxReleases() {
  const parsed = Number.parseInt(String(config.tracker.hardMaxReleases || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 700;
}

function resolveDefaultSourceUrl() {
  const explicitDefault = normalizeUrl(config.tracker.defaultSourceUrl);
  if (explicitDefault) {
    return explicitDefault;
  }

  return normalizeUrl(config.tracker.baseUrl);
}

function resolveConfiguredTrackerUrl(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return "";
  }

  const absoluteUrl = normalizeUrl(raw);
  if (absoluteUrl) {
    return absoluteUrl;
  }

  try {
    return normalizeUrl(new URL(raw, config.tracker.baseUrl).toString());
  } catch (error) {
    return "";
  }
}

function resolvePopularSourceUrl() {
  return resolveConfiguredTrackerUrl(config.tracker.popularUrl);
}

function buildTrackerSearchUrlFromText(rawQuery) {
  const queryText = normalizeQueryText(rawQuery);
  if (!queryText) {
    return "";
  }

  let baseUrl;
  try {
    baseUrl = new URL(config.tracker.baseUrl);
  } catch (error) {
    return "";
  }

  const rawPath = String(config.tracker.textSearchPath || "").trim() || "tracker.php";
  const baseWithTrailingSlash = baseUrl.toString().replace(/\/?$/, "/");
  const pathOrUrl = /^https?:\/\//i.test(rawPath)
    ? rawPath
    : rawPath.startsWith("/")
      ? rawPath
      : `./${rawPath}`;

  let searchUrl;
  try {
    searchUrl = new URL(pathOrUrl, baseWithTrailingSlash);
  } catch (error) {
    return "";
  }

  searchUrl.hash = "";
  searchUrl.searchParams.set("o", "1");
  searchUrl.searchParams.set("s", "2");
  searchUrl.searchParams.set("tm", "-1");
  searchUrl.searchParams.set("nm", queryText);
  searchUrl.searchParams.set("f", "-1");
  return searchUrl.toString();
}

function resolveSourcePageUrl(body) {
  if (String(body?.sourceMode || "").trim() === "popular") {
    const popularUrl = resolvePopularSourceUrl();
    if (popularUrl) {
      return { pageUrl: popularUrl, mode: "popular" };
    }
    return {
      error: "Configure tracker.popular_url in config.toml to use popular releases search."
    };
  }

  const pageUrl = normalizeUrl(body?.pageUrl);
  if (pageUrl) {
    return { pageUrl, mode: "url" };
  }

  const queryText = normalizeQueryText(body?.queryText);
  if (queryText) {
    const searchUrl = buildTrackerSearchUrlFromText(queryText);
    if (searchUrl) {
      return { pageUrl: searchUrl, mode: "text" };
    }
    return {
      error: "Unable to build text search URL. Check tracker.base_url and tracker.text_search_path."
    };
  }

  const defaultSourceUrl = resolveDefaultSourceUrl();
  if (defaultSourceUrl) {
    return { pageUrl: defaultSourceUrl, mode: "default" };
  }

  return {
    error: "Provide pageUrl or queryText, or configure tracker.base_url / tracker.default_source_url."
  };
}

async function createLoggedClient() {
  if (!config.tracker.username || !config.tracker.password) {
    throw new Error("Missing tracker credentials. Set TRACKER_USERNAME and TRACKER_PASSWORD.");
  }

  const startedAt = diagnostics.startTimer();
  const client = new TrackerClient(config.tracker);
  diagnostics.log("tracker.login.start");
  await client.login();
  diagnostics.log("tracker.login.done", {
    durationMs: diagnostics.elapsedMs(startedAt),
    memory: diagnostics.processSnapshot()
  });
  return client;
}

function resolveMaxReleases(rawValue) {
  const parsedValue = Number.parseInt(String(rawValue || ""), 10);
  const requested =
    Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : config.tracker.maxReleases;
  const hardMax = resolveHardMaxReleases();
  return Math.min(requested, hardMax);
}

function createJobSnapshot(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    sourceUrl: job.sourceUrl,
    totalFound: job.totalFound,
    processed: job.processed,
    releases: job.releases.filter(Boolean),
    categories: categoryStore.list(),
    tags: tagStore.list(),
    qualities: qualityFilterStore.list(),
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function extractTagsFromReleases(releases) {
  const names = new Set();
  for (const release of releases || []) {
    const tags = Array.isArray(release?.tags) ? release.tags : [];
    for (const rawTag of tags) {
      const name = typeof rawTag === "string" ? rawTag : rawTag?.name;
      const normalized = String(name || "").replace(/\s+/g, " ").trim();
      if (normalized) {
        names.add(normalized);
      }
    }
  }
  return Array.from(names).map((name) => ({ name }));
}

function ensureReleaseTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return;
  }
  tagStore.upsertMany(extractTagsFromReleases([{ tags }]), { defaultEnabled: true });
}

function extractCategoriesFromReleases(releases) {
  const names = new Set();
  for (const release of releases || []) {
    if (!release || typeof release.category !== "string") {
      continue;
    }

    const normalized = release.category.trim();
    if (normalized) {
      names.add(normalized);
    }
  }
  return Array.from(names).map((name) => ({ name }));
}

function cleanupParseJobs() {
  const threshold = Date.now() - PARSE_JOB_TTL_MS;
  for (const [jobId, job] of parseJobs.entries()) {
    if (job.status === "running") {
      continue;
    }

    if (job.updatedAt < threshold) {
      parseJobs.delete(jobId);
    }
  }
}

app.use("/api", (request, response, next) => {
  cleanupAuthSessions();
  const requestPath = String(request.path || "");
  const isPublic =
    requestPath === "/health" ||
    requestPath === "/version" ||
    requestPath === "/auth/login" ||
    requestPath === "/auth/status";

  let auth = null;
  if (!isPublic || requestPath === "/auth/logout") {
    auth = resolveAuthSession(request);
    if (!auth && !isPublic) {
      clearAuthCookie(response);
      return response.status(401).json({ error: "Authentication required." });
    }
    if (auth) {
      request.auth = auth.session;
    }
  }

  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const skipCsrf = requestPath === "/auth/login";
  if (isMutating && !skipCsrf) {
    const headerToken = String(request.headers["x-csrf-token"] || "").trim();
    if (!auth || !headerToken || !safeEquals(headerToken, auth.session.csrfToken)) {
      return response.status(403).json({ error: "Invalid CSRF token." });
    }
  }

  return next();
});

app.get("/api/health", (_, response) => {
  response.json({ status: "ok" });
});

app.get("/api/version", (_, response) => {
  response.json({
    version: config.app.version
  });
});

app.get("/api/auth/status", (request, response) => {
  const auth = resolveAuthSession(request);
  if (!auth) {
    clearAuthCookie(response);
    return response.json({
      authenticated: false,
      username: null,
      expiresAt: null,
      csrfToken: null
    });
  }

  return response.json({
    authenticated: true,
    username: auth.session.username,
    expiresAt: auth.session.expiresAt,
    csrfToken: auth.session.csrfToken
  });
});

app.post("/api/auth/login", (request, response) => {
  if (!trackerCredentialsConfigured()) {
    return response.status(500).json({
      error: "Tracker credentials are not configured on server."
    });
  }

  const ip = getClientIp(request);
  const rate = checkLoginRateLimit(ip);
  if (!rate.ok) {
    response.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return response.status(429).json({
      error: "Too many login attempts. Try again later.",
      retryAfterSeconds: rate.retryAfterSeconds
    });
  }

  const username = String(request.body?.username || "").trim();
  const password = String(request.body?.password || "");
  if (!username || !password) {
    return response.status(400).json({ error: "username and password are required." });
  }

  if (!credentialsMatchTracker(username, password)) {
    return response.status(401).json({ error: "Invalid username or password." });
  }

  resetLoginRateLimit(ip);
  const session = createAuthSession(username);
  setAuthCookie(response, session.token);
  return response.json({
    authenticated: true,
    username,
    expiresAt: session.expiresAt,
    csrfToken: session.csrfToken
  });
});

app.post("/api/auth/logout", (request, response) => {
  const token = getAuthTokenFromRequest(request);
  clearAuthSessionByToken(token);
  clearAuthCookie(response);
  response.json({
    authenticated: false
  });
});

app.get("/api/admin/update", (_, response) => {
  response.json(createUpdateStatusPayload());
});

app.post("/api/admin/update", (request, response) => {
  if (!isUpdateScriptAvailable()) {
    return response.status(404).json({
      error: "Update script not found. Set app.update_script_path in config.toml or place update.sh in project root."
    });
  }

  if (updateState.running) {
    return response.status(409).json({
      error: "Update is already running.",
      ...createUpdateStatusPayload()
    });
  }

  try {
    const child = spawnUpdateScript();

    updateState.running = true;
    updateState.startedAt = Date.now();
    updateState.finishedAt = null;
    updateState.lastExitCode = null;
    updateState.lastSignal = null;
    updateState.lastError = null;

    child.on("error", (error) => {
      updateState.running = false;
      updateState.finishedAt = Date.now();
      updateState.lastError = error?.message || "Failed to start update process.";
      updateState.lastExitCode = 1;
      updateState.lastSignal = null;
    });

    child.on("exit", (code, signal) => {
      updateState.running = false;
      updateState.finishedAt = Date.now();
      updateState.lastExitCode = Number.isInteger(code) ? code : null;
      updateState.lastSignal = signal || null;
      if (Number.isInteger(code) && code !== 0) {
        updateState.lastError = `Update script exited with code ${code}.`;
      }
    });

    child.unref();
  } catch (error) {
    updateState.running = false;
    updateState.finishedAt = Date.now();
    updateState.lastError = error?.message || "Failed to start update process.";
    return response.status(500).json({
      error: updateState.lastError
    });
  }

  return response.status(202).json({
    status: "started",
    ...createUpdateStatusPayload()
  });
});

app.get("/api/categories", (_, response) => {
  response.json({
    categories: categoryStore.list()
  });
});

app.get("/api/tags", (_, response) => {
  response.json({
    tags: tagStore.list()
  });
});

app.get("/api/quality-filters", (_, response) => {
  response.json({
    qualities: qualityFilterStore.list()
  });
});

app.get("/api/saved-searches", (_, response) => {
  response.json({
    searches: savedSearchStore.list()
  });
});

app.get("/api/client-config", (_, response) => {
  response.json({
    app: {
      version: config.app.version
    },
    tracker: {
      defaultSourceUrl: resolveDefaultSourceUrl(),
      maxReleases: config.tracker.maxReleases,
      hardMaxReleases: resolveHardMaxReleases(),
      directDownloadEnabled: isDirectDownloadAvailable()
    }
  });
});

app.post("/api/saved-searches", (request, response) => {
  const name = normalizeSearchName(request.body?.name);
  const url = normalizeSearchUrl(request.body?.url);

  if (!name) {
    return response.status(400).json({ error: "name must not be empty." });
  }

  if (!url) {
    return response.status(400).json({ error: "url must be a valid URL." });
  }

  try {
    const result = savedSearchStore.upsert({ name, url });
    return response.status(result.changed ? 201 : 200).json({
      changed: result.changed,
      search: result.search,
      searches: savedSearchStore.list()
    });
  } catch (error) {
    return response.status(400).json({ error: error.message || "Failed to save search." });
  }
});

app.post("/api/categories", (request, response) => {
  const categories = Array.isArray(request.body?.categories) ? request.body.categories : null;
  if (!categories) {
    return response.status(400).json({ error: "categories must be an array." });
  }

  const result = categoryStore.upsertMany(categories, { defaultEnabled: true });
  return response.json({
    changed: result.changed,
    categories: result.categories
  });
});

app.post("/api/tags", (request, response) => {
  const tags = Array.isArray(request.body?.tags) ? request.body.tags : null;
  if (!tags) {
    return response.status(400).json({ error: "tags must be an array." });
  }

  const result = tagStore.upsertMany(tags, { defaultEnabled: true });
  return response.json({
    changed: result.changed,
    tags: result.categories
  });
});

app.post("/api/quality-filters", (request, response) => {
  const qualities = Array.isArray(request.body?.qualities) ? request.body.qualities : null;
  if (!qualities) {
    return response.status(400).json({ error: "qualities must be an array." });
  }

  const result = qualityFilterStore.upsertMany(qualities, { defaultEnabled: true });
  return response.json({
    changed: result.changed,
    qualities: result.categories
  });
});

app.post("/api/releases/download-to-dir", async (request, response) => {
  const downloadDirectory = resolveDirectDownloadDir();
  if (!downloadDirectory) {
    return response.status(400).json({
      error: "tracker.direct_download_dir is not configured."
    });
  }

  if (!isExistingDirectory(downloadDirectory)) {
    return response.status(400).json({
      error: `Configured download directory does not exist or is not a directory: ${downloadDirectory}`
    });
  }

  const torrentUrl = resolveTrustedTrackerUrl(request.body?.torrentUrl);
  if (!torrentUrl) {
    return response.status(400).json({
      error: "torrentUrl must be a valid tracker URL on tracker.base_url host."
    });
  }

  const title = String(request.body?.title || "").trim();

  try {
    const client = await createLoggedClient();
    const fileResponse = await client.request(torrentUrl);

    if (!fileResponse.ok) {
      return response.status(502).json({
        error: `Failed to download file from tracker (HTTP ${fileResponse.status}).`
      });
    }

    const contentType = String(fileResponse.contentType || "").toLowerCase();
    if (contentType.includes("text/html")) {
      return response.status(502).json({
        error: "Tracker returned HTML instead of a torrent file."
      });
    }

    const fileName = buildDownloadFileName({
      torrentUrl,
      title,
      contentDisposition: fileResponse.contentDisposition
    });
    const targetPath = resolveUniqueDownloadPath(downloadDirectory, fileName);

    await fs.promises.writeFile(targetPath, fileResponse.buffer);

    return response.status(201).json({
      fileName: path.basename(targetPath),
      destinationPath: targetPath,
      bytes: fileResponse.buffer.length
    });
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Unexpected error while downloading file to server."
    });
  }
});

app.post("/api/release", async (request, response) => {
  const releaseUrl = String(request.body?.releaseUrl || "").trim();
  const parsedUrl = parseSafeUrl(releaseUrl);

  if (!parsedUrl) {
    return response.status(400).json({ error: "releaseUrl must be a valid URL." });
  }

  try {
    const startedAt = diagnostics.startTimer();
    const cpuStart = process.cpuUsage();
    diagnostics.log("single_release.start", {
      releaseUrl,
      memory: diagnostics.processSnapshot()
    });
    const client = await createLoggedClient();
    const page = await client.request(releaseUrl);

    if (!page.ok) {
      return response.status(502).json({ error: `Failed to load release page (HTTP ${page.status}).` });
    }

    const parseStartedAt = diagnostics.startTimer();
    let release = parseReleasePage(releaseUrl, page.text);
    const parseMs = diagnostics.elapsedMs(parseStartedAt);
    const enrichStartedAt = diagnostics.startTimer();
    release = await enrichReleaseScreenshots(release);
    const enrichMs = diagnostics.elapsedMs(enrichStartedAt);
    if (release.category) {
      categoryStore.ensureCategory(release.category);
    }
    ensureReleaseTags(release.tags);
    diagnostics.log("single_release.done", {
      topicId: diagnostics.topicIdFromUrl(releaseUrl),
      parseMs,
      enrichMs,
      screenshots: Array.isArray(release?.screenshots) ? release.screenshots.length : 0,
      tags: Array.isArray(release?.tags) ? release.tags.length : 0,
      durationMs: diagnostics.elapsedMs(startedAt),
      cpu: diagnostics.cpuDeltaMs(cpuStart),
      memory: diagnostics.processSnapshot()
    });
    return response.json({ release });
  } catch (error) {
    diagnostics.log("single_release.error", {
      releaseUrl,
      error: error.message
    });
    return response.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

app.post("/api/releases", async (request, response) => {
  const source = resolveSourcePageUrl(request.body || {});
  if (source.error) {
    return response.status(400).json({ error: source.error });
  }

  const pageUrl = source.pageUrl;
  const maxReleases = resolveMaxReleases(request.body?.maxReleases);

  try {
    const startedAt = diagnostics.startTimer();
    const cpuStart = process.cpuUsage();
    diagnostics.log("releases.sync.start", {
      sourceMode: source.mode,
      pageUrl,
      maxReleases,
      concurrency: config.tracker.concurrency,
      memory: diagnostics.processSnapshot()
    });
    const client = await createLoggedClient();
    const result = await parseReleasesFromCollection(client, pageUrl, {
      maxReleases,
      concurrency: config.tracker.concurrency,
      releaseCache: releaseCacheStore,
      sourceMode: source.mode
    });
    categoryStore.upsertMany(extractCategoriesFromReleases(result.releases), {
      defaultEnabled: true
    });
    tagStore.upsertMany(extractTagsFromReleases(result.releases), {
      defaultEnabled: true
    });

    diagnostics.log("releases.sync.done", {
      sourceMode: source.mode,
      totalFound: result.totalFound,
      parsed: Array.isArray(result.releases) ? result.releases.length : 0,
      durationMs: diagnostics.elapsedMs(startedAt),
      cpu: diagnostics.cpuDeltaMs(cpuStart),
      memory: diagnostics.processSnapshot()
    });
    return response.json(result);
  } catch (error) {
    diagnostics.log("releases.sync.error", {
      sourceMode: source.mode,
      pageUrl,
      maxReleases,
      error: error.message
    });
    return response.status(500).json({ error: error.message || "Unexpected server error." });
  }
});

app.post("/api/releases/job", async (request, response) => {
  cleanupParseJobs();

  const source = resolveSourcePageUrl(request.body || {});
  if (source.error) {
    return response.status(400).json({ error: source.error });
  }

  const pageUrl = source.pageUrl;
  const maxReleases = resolveMaxReleases(request.body?.maxReleases);

  const jobId = crypto.randomUUID();
  const now = Date.now();
  const job = {
    jobId,
    status: "running",
    sourceUrl: pageUrl,
    totalFound: 0,
    processed: 0,
    releases: [],
    error: null,
    cancelled: false,
    createdAt: now,
    updatedAt: now
  };

  parseJobs.set(jobId, job);
  const jobStartedAt = diagnostics.startTimer();
  const jobCpuStart = process.cpuUsage();
  diagnostics.log("job.start", {
    jobId,
    sourceMode: source.mode,
    pageUrl,
    maxReleases,
    concurrency: config.tracker.concurrency,
    diagnostics: diagnostics.configSnapshot(),
    memory: diagnostics.processSnapshot()
  });

  function throwIfCancelled() {
    if (job.cancelled) {
      const error = new Error("Job cancelled.");
      error.code = "JOB_CANCELLED";
      throw error;
    }
  }

  (async () => {
    try {
      const client = await createLoggedClient();
      const result = await parseReleasesFromCollection(client, pageUrl, {
        maxReleases,
        concurrency: config.tracker.concurrency,
        releaseCache: releaseCacheStore,
        sourceMode: source.mode,
        onDiscovered: ({ totalFound }) => {
          throwIfCancelled();
          job.totalFound = totalFound;
          job.updatedAt = Date.now();
          diagnostics.log("job.discovered", {
            jobId,
            totalFound,
            elapsedMs: diagnostics.elapsedMs(jobStartedAt),
            memory: diagnostics.processSnapshot()
          });
        },
        onProgress: ({ processed, totalFound, index, release }) => {
          throwIfCancelled();
          job.processed = processed;
          job.totalFound = totalFound;
          job.releases[index] = release;
          if (release?.category) {
            categoryStore.ensureCategory(release.category);
          }
          ensureReleaseTags(release?.tags);
          job.updatedAt = Date.now();
          if (diagnostics.shouldLogProgress(processed, totalFound)) {
            diagnostics.log("job.progress", {
              jobId,
              processed,
              totalFound,
              index,
              releaseError: release?.error || "",
              elapsedMs: diagnostics.elapsedMs(jobStartedAt),
              memory: diagnostics.processSnapshot()
            });
          }
        }
      });

      if (job.cancelled) {
        job.status = "cancelled";
        job.updatedAt = Date.now();
        diagnostics.log("job.cancelled", {
          jobId,
          processed: job.processed,
          totalFound: job.totalFound,
          durationMs: diagnostics.elapsedMs(jobStartedAt),
          cpu: diagnostics.cpuDeltaMs(jobCpuStart),
          memory: diagnostics.processSnapshot()
        });
        return;
      }

      job.status = "done";
      job.totalFound = result.totalFound;
      job.processed = result.releases.length;
      job.releases = result.releases;
      tagStore.upsertMany(extractTagsFromReleases(result.releases), {
        defaultEnabled: true
      });
      job.updatedAt = Date.now();
      diagnostics.log("job.done", {
        jobId,
        totalFound: job.totalFound,
        processed: job.processed,
        errors: job.releases.filter((release) => release?.error).length,
        durationMs: diagnostics.elapsedMs(jobStartedAt),
        cpu: diagnostics.cpuDeltaMs(jobCpuStart),
        memory: diagnostics.processSnapshot()
      });
    } catch (error) {
      if (error?.code === "JOB_CANCELLED" || job.cancelled) {
        job.status = "cancelled";
        diagnostics.log("job.cancelled", {
          jobId,
          processed: job.processed,
          totalFound: job.totalFound,
          durationMs: diagnostics.elapsedMs(jobStartedAt),
          cpu: diagnostics.cpuDeltaMs(jobCpuStart),
          memory: diagnostics.processSnapshot()
        });
      } else {
        job.status = "error";
        job.error = error.message || "Unexpected server error.";
        diagnostics.log("job.error", {
          jobId,
          processed: job.processed,
          totalFound: job.totalFound,
          durationMs: diagnostics.elapsedMs(jobStartedAt),
          cpu: diagnostics.cpuDeltaMs(jobCpuStart),
          memory: diagnostics.processSnapshot(),
          error: job.error
        });
      }
      job.updatedAt = Date.now();
    }
  })();

  return response.status(202).json({
    jobId,
    status: "running"
  });
});

app.get("/api/releases/job/:jobId", (request, response) => {
  cleanupParseJobs();

  const jobId = String(request.params.jobId || "").trim();
  const job = parseJobs.get(jobId);
  if (!job) {
    return response.status(404).json({ error: "Job not found." });
  }

  return response.json(createJobSnapshot(job));
});

app.delete("/api/releases/job/:jobId", (request, response) => {
  const jobId = String(request.params.jobId || "").trim();
  const job = parseJobs.get(jobId);
  if (!job) {
    return response.status(404).json({ error: "Job not found." });
  }

  if (job.status === "running") {
    job.cancelled = true;
    job.status = "cancelled";
    job.updatedAt = Date.now();
  }

  return response.status(202).json({
    jobId,
    status: job.status
  });
});

app.use("/api", (_, response) => {
  response.status(404).json({ error: "Not found." });
});

app.get("/icons8-download-cute-color-16.png", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "icons8-download-cute-color-16.png"));
});

app.get("/icons8-download-cute-color-32.png", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "icons8-download-cute-color-32.png"));
});

app.get("/icons8-download-cute-color-96.png", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "icons8-download-cute-color-96.png"));
});

app.get("/favico.png", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "icons8-download-cute-color-32.png"));
});

app.get("/favicon.ico", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "icons8-download-cute-color-32.png"));
});

app.get("*", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

function flushAllStoresOnExit() {
  for (const store of [categoryStore, qualityFilterStore, tagStore, savedSearchStore, releaseCacheStore]) {
    if (store && typeof store.flushSave === "function") {
      try {
        store.flushSave();
      } catch (error) {
        console.warn(`Store flush failed: ${error.message}`);
      }
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    flushAllStoresOnExit();
    process.exit(0);
  });
}
process.on("beforeExit", flushAllStoresOnExit);

app.listen(config.app.port, () => {
  // Keep startup logs short and deterministic for container logs.
  console.log(`TrackerView ${config.app.version} started on port ${config.app.port}`);
  diagnostics.log("app.started", {
    version: config.app.version,
    port: config.app.port,
    concurrency: config.tracker.concurrency,
    maxReleases: config.tracker.maxReleases,
    hardMaxReleases: config.tracker.hardMaxReleases,
    diagnostics: diagnostics.configSnapshot(),
    memory: diagnostics.processSnapshot()
  });
});
