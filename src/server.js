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

async function createLoggedClient() {
  if (!config.tracker.username || !config.tracker.password) {
    throw new Error("Missing tracker credentials. Set TRACKER_USERNAME and TRACKER_PASSWORD.");
  }

  const client = new TrackerClient(config.tracker);
  await client.login();
  return client;
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

app.get("/api/health", (_, response) => {
  response.json({ status: "ok" });
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
  const pageUrl = String(request.body?.pageUrl || "").trim();
  const parsedUrl = parseSafeUrl(pageUrl);
  const bodyMaxReleases = Number.parseInt(String(request.body?.maxReleases || ""), 10);
  const maxReleases =
    Number.isFinite(bodyMaxReleases) && bodyMaxReleases > 0
      ? Math.min(bodyMaxReleases, 500)
      : config.tracker.maxReleases;

  if (!parsedUrl) {
    return response.status(400).json({ error: "pageUrl must be a valid URL." });
  }

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

  const pageUrl = String(request.body?.pageUrl || "").trim();
  const parsedUrl = parseSafeUrl(pageUrl);
  const bodyMaxReleases = Number.parseInt(String(request.body?.maxReleases || ""), 10);
  const maxReleases =
    Number.isFinite(bodyMaxReleases) && bodyMaxReleases > 0
      ? Math.min(bodyMaxReleases, 500)
      : config.tracker.maxReleases;

  if (!parsedUrl) {
    return response.status(400).json({ error: "pageUrl must be a valid URL." });
  }

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
