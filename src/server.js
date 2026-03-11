const express = require("express");
const path = require("path");
const crypto = require("crypto");

const { config } = require("./config");
const { TrackerClient } = require("./trackerClient");
const { parseReleasePage, parseReleasesFromCollection, enrichReleaseScreenshots } = require("./parser");
const { createCategoryStore } = require("./categoryStore");
const { createSavedSearchStore, normalizeSearchName, normalizeSearchUrl } = require("./savedSearchStore");

const app = express();
const parseJobs = new Map();
const PARSE_JOB_TTL_MS = 30 * 60 * 1000;
const authSessions = new Map();
const AUTH_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_COOKIE_NAME = "tv_session";
const categoryStore = createCategoryStore(path.join(__dirname, "..", "data", "categories.json"));
const savedSearchStore = createSavedSearchStore(path.join(__dirname, "..", "data", "saved-searches.json"));

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
  const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
  authSessions.set(token, {
    username,
    expiresAt
  });
  return { token, expiresAt };
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
      error: "Unable to build text search URL. Check TRACKER_BASE_URL and TRACKER_TEXT_SEARCH_PATH."
    };
  }

  const defaultSourceUrl = resolveDefaultSourceUrl();
  if (defaultSourceUrl) {
    return { pageUrl: defaultSourceUrl, mode: "default" };
  }

  return {
    error: "Provide pageUrl or queryText, or configure TRACKER_BASE_URL / TRACKER_DEFAULT_SOURCE_URL."
  };
}

async function createLoggedClient() {
  if (!config.tracker.username || !config.tracker.password) {
    throw new Error("Missing tracker credentials. Set TRACKER_USERNAME and TRACKER_PASSWORD.");
  }

  const client = new TrackerClient(config.tracker);
  await client.login();
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
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
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
  const path = String(request.path || "");
  if (path === "/health" || path === "/auth/login" || path === "/auth/status" || path === "/auth/logout") {
    return next();
  }

  const auth = resolveAuthSession(request);
  if (!auth) {
    clearAuthCookie(response);
    return response.status(401).json({ error: "Authentication required." });
  }

  request.auth = auth.session;
  return next();
});

app.get("/api/health", (_, response) => {
  response.json({ status: "ok" });
});

app.get("/api/auth/status", (request, response) => {
  const auth = resolveAuthSession(request);
  if (!auth) {
    clearAuthCookie(response);
    return response.json({
      authenticated: false,
      username: null,
      expiresAt: null
    });
  }

  return response.json({
    authenticated: true,
    username: auth.session.username,
    expiresAt: auth.session.expiresAt
  });
});

app.post("/api/auth/login", (request, response) => {
  if (!trackerCredentialsConfigured()) {
    return response.status(500).json({
      error: "Tracker credentials are not configured on server."
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

  const session = createAuthSession(username);
  setAuthCookie(response, session.token);
  return response.json({
    authenticated: true,
    username,
    expiresAt: session.expiresAt
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

app.get("/api/categories", (_, response) => {
  response.json({
    categories: categoryStore.list()
  });
});

app.get("/api/saved-searches", (_, response) => {
  response.json({
    searches: savedSearchStore.list()
  });
});

app.get("/api/client-config", (_, response) => {
  response.json({
    tracker: {
      defaultSourceUrl: resolveDefaultSourceUrl(),
      maxReleases: config.tracker.maxReleases,
      hardMaxReleases: resolveHardMaxReleases()
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

app.post("/api/release", async (request, response) => {
  const releaseUrl = String(request.body?.releaseUrl || "").trim();
  const parsedUrl = parseSafeUrl(releaseUrl);

  if (!parsedUrl) {
    return response.status(400).json({ error: "releaseUrl must be a valid URL." });
  }

  try {
    const client = await createLoggedClient();
    const page = await client.request(releaseUrl);

    if (!page.ok) {
      return response.status(502).json({ error: `Failed to load release page (HTTP ${page.status}).` });
    }

    let release = parseReleasePage(releaseUrl, page.text);
    release = await enrichReleaseScreenshots(release);
    if (release.category) {
      categoryStore.ensureCategory(release.category);
    }
    return response.json({ release });
  } catch (error) {
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
    const client = await createLoggedClient();
    const result = await parseReleasesFromCollection(client, pageUrl, {
      maxReleases,
      concurrency: config.tracker.concurrency
    });
    categoryStore.upsertMany(extractCategoriesFromReleases(result.releases), {
      defaultEnabled: true
    });

    return response.json(result);
  } catch (error) {
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
    createdAt: now,
    updatedAt: now
  };

  parseJobs.set(jobId, job);

  (async () => {
    try {
      const client = await createLoggedClient();
      const result = await parseReleasesFromCollection(client, pageUrl, {
        maxReleases,
        concurrency: config.tracker.concurrency,
        onDiscovered: ({ totalFound }) => {
          job.totalFound = totalFound;
          job.updatedAt = Date.now();
        },
        onProgress: ({ processed, totalFound, index, release }) => {
          job.processed = processed;
          job.totalFound = totalFound;
          job.releases[index] = release;
          if (release?.category) {
            categoryStore.ensureCategory(release.category);
          }
          job.updatedAt = Date.now();
        }
      });

      job.status = "done";
      job.totalFound = result.totalFound;
      job.processed = result.releases.length;
      job.releases = result.releases;
      job.updatedAt = Date.now();
    } catch (error) {
      job.status = "error";
      job.error = error.message || "Unexpected server error.";
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

app.get("*", (_, response) => {
  response.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(config.app.port, () => {
  // Keep startup logs short and deterministic for container logs.
  console.log(`TrackerView started on port ${config.app.port}`);
});
