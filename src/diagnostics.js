let settings = {
  enabled: false,
  logRequests: true,
  logReleaseDetails: true,
  slowRequestMs: 1000,
  slowReleaseMs: 2000,
  progressEvery: 10
};

function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configure(nextSettings = {}) {
  settings = {
    enabled: toBoolean(nextSettings.enabled, settings.enabled),
    logRequests: toBoolean(nextSettings.logRequests, settings.logRequests),
    logReleaseDetails: toBoolean(nextSettings.logReleaseDetails, settings.logReleaseDetails),
    slowRequestMs: toPositiveInteger(nextSettings.slowRequestMs, settings.slowRequestMs),
    slowReleaseMs: toPositiveInteger(nextSettings.slowReleaseMs, settings.slowReleaseMs),
    progressEvery: toPositiveInteger(nextSettings.progressEvery, settings.progressEvery)
  };
}

function isEnabled() {
  return settings.enabled;
}

function startTimer() {
  return process.hrtime.bigint();
}

function elapsedMs(startedAt) {
  if (typeof startedAt !== "bigint") {
    return 0;
  }
  return Number((process.hrtime.bigint() - startedAt) / 1000000n);
}

function roundMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

function safeUrlLabel(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const params = [];
    for (const name of ["t", "f", "start", "nm", "o"]) {
      const value = parsed.searchParams.get(name);
      if (value) {
        params.push(`${name}=${value}`);
      }
    }
    const query = params.length ? `?${params.join("&")}` : "";
    return `${parsed.pathname}${query}`;
  } catch (error) {
    return raw.replace(/^https?:\/\/[^/]+/i, "");
  }
}

function topicIdFromUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ""));
    return parsed.searchParams.get("t") || "";
  } catch (error) {
    return "";
  }
}

function contentTypeLabel(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function processSnapshot() {
  const memory = process.memoryUsage();
  return {
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
    externalMb: Math.round(memory.external / 1024 / 1024)
  };
}

function cpuDeltaMs(startUsage) {
  if (!startUsage) {
    return { userMs: 0, systemMs: 0, totalMs: 0 };
  }
  const delta = process.cpuUsage(startUsage);
  const userMs = Math.round(delta.user / 1000);
  const systemMs = Math.round(delta.system / 1000);
  return {
    userMs,
    systemMs,
    totalMs: userMs + systemMs
  };
}

function normalizeFields(fields = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (key.toLowerCase().includes("url")) {
      normalized[key] = safeUrlLabel(value);
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = Number.isInteger(value) ? value : Number(value.toFixed(3));
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

function log(event, fields = {}) {
  if (!settings.enabled) return;

  const payload = {
    ts: new Date().toISOString(),
    level: "diagnostic",
    event,
    ...normalizeFields(fields)
  };

  try {
    console.log(JSON.stringify(payload));
  } catch (error) {
    console.log(`[diagnostic] ${event}`);
  }
}

function logHttpRequest(fields = {}) {
  const durationMs = roundMs(fields.durationMs);
  const shouldLog = settings.logRequests || durationMs >= settings.slowRequestMs;
  if (!settings.enabled || !shouldLog) return;

  log("http.request", {
    ...fields,
    durationMs,
    contentType: contentTypeLabel(fields.contentType)
  });
}

function shouldLogRelease(durationMs) {
  if (!settings.enabled) return false;
  return settings.logReleaseDetails || roundMs(durationMs) >= settings.slowReleaseMs;
}

function shouldLogProgress(processed, total) {
  if (!settings.enabled) return false;
  const safeProcessed = Number.parseInt(String(processed || ""), 10);
  const safeTotal = Number.parseInt(String(total || ""), 10);
  if (!Number.isFinite(safeProcessed) || safeProcessed <= 0) return false;
  return safeProcessed === 1 || safeProcessed === safeTotal || safeProcessed % settings.progressEvery === 0;
}

function configSnapshot() {
  return { ...settings };
}

module.exports = {
  configure,
  isEnabled,
  startTimer,
  elapsedMs,
  roundMs,
  safeUrlLabel,
  topicIdFromUrl,
  processSnapshot,
  cpuDeltaMs,
  log,
  logHttpRequest,
  shouldLogRelease,
  shouldLogProgress,
  configSnapshot
};
