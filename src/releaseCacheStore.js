const fs = require("fs");
const path = require("path");

function parseTopicIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const topicId = parsed.searchParams.get("t");
    if (topicId && /^\d+$/.test(topicId)) {
      return topicId;
    }
  } catch (error) {
    return "";
  }
  return "";
}

function normalizeTopicUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.searchParams.delete("sid");

    const topicId = parsed.searchParams.get("t");
    if (/^\/viewtopic\.php$/i.test(parsed.pathname) && topicId && /^\d+$/.test(topicId)) {
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}?t=${topicId}`;
    }

    return parsed.toString();
  } catch (error) {
    return "";
  }
}

function cloneRelease(release) {
  return JSON.parse(JSON.stringify(release || {}));
}

const SAVE_DEBOUNCE_MS = 500;

function createReleaseCacheStore(filePath) {
  const records = new Map();
  let saveTimer = null;
  let savePending = false;

  function ensureDirectory() {
    const directoryPath = path.dirname(filePath);
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
  }

  function resolveKey(topicUrl, topicId) {
    const normalizedTopicId = String(topicId || "").trim();
    if (normalizedTopicId && /^\d+$/.test(normalizedTopicId)) {
      return `t:${normalizedTopicId}`;
    }

    const normalizedTopicUrl = normalizeTopicUrl(topicUrl);
    if (!normalizedTopicUrl) {
      return "";
    }
    return `u:${normalizedTopicUrl}`;
  }

  function list() {
    return Array.from(records.values())
      .map((entry) => cloneRelease(entry.release))
      .sort((left, right) => Number(right.cachedAt || 0) - Number(left.cachedAt || 0));
  }

  function saveToDiskNow() {
    ensureDirectory();

    const payload = {
      releases: list()
    };

    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
    savePending = false;
  }

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (savePending) {
      try {
        saveToDiskNow();
      } catch (error) {
        console.warn(`Failed to flush release cache ${filePath}: ${error.message}`);
      }
    }
  }

  function saveToDisk() {
    savePending = true;
    if (saveTimer) {
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        saveToDiskNow();
      } catch (error) {
        console.warn(`Failed to save release cache ${filePath}: ${error.message}`);
      }
    }, SAVE_DEBOUNCE_MS);
    if (typeof saveTimer.unref === "function") {
      saveTimer.unref();
    }
  }

  function loadFromDisk() {
    ensureDirectory();

    if (!fs.existsSync(filePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw.trim()) {
        return;
      }

      const parsed = JSON.parse(raw);
      const releases = Array.isArray(parsed.releases) ? parsed.releases : [];

      for (const release of releases) {
        const topicUrl = normalizeTopicUrl(release?.topicUrl || "");
        const topicId = String(release?.topicId || parseTopicIdFromUrl(topicUrl)).trim();
        const key = resolveKey(topicUrl, topicId);
        if (!key || !topicUrl) {
          continue;
        }

        const cachedAt = Number.isFinite(release?.cachedAt) ? release.cachedAt : Date.now();
        records.set(key, {
          key,
          topicUrl,
          topicId,
          cachedAt,
          release: {
            ...cloneRelease(release),
            topicId,
            topicUrl,
            cachedAt
          }
        });
      }
    } catch (error) {
      console.warn(`Failed to load release cache from ${filePath}: ${error.message}`);
    }
  }

  function getByTopicUrl(topicUrl) {
    const normalizedTopicUrl = normalizeTopicUrl(topicUrl);
    const topicId = parseTopicIdFromUrl(normalizedTopicUrl);
    const key = resolveKey(normalizedTopicUrl, topicId);
    if (!key) {
      return null;
    }

    const record = records.get(key);
    if (record) {
      return cloneRelease(record.release);
    }

    if (normalizedTopicUrl) {
      const fallbackKey = resolveKey(normalizedTopicUrl, "");
      if (fallbackKey && records.has(fallbackKey)) {
        return cloneRelease(records.get(fallbackKey).release);
      }
    }

    return null;
  }

  function upsert(release) {
    if (!release || typeof release !== "object") {
      return { changed: false };
    }

    if (release.error) {
      return { changed: false };
    }

    const normalizedTopicUrl = normalizeTopicUrl(release.topicUrl);
    const topicId = String(release.topicId || parseTopicIdFromUrl(normalizedTopicUrl)).trim();
    const key = resolveKey(normalizedTopicUrl, topicId);
    if (!key || !normalizedTopicUrl) {
      return { changed: false };
    }

    const now = Date.now();
    const normalizedRelease = {
      ...cloneRelease(release),
      topicId,
      topicUrl: normalizedTopicUrl,
      cachedAt: now
    };

    const existing = records.get(key);
    if (existing) {
      const oldPayload = JSON.stringify(existing.release);
      const newPayload = JSON.stringify(normalizedRelease);
      if (oldPayload === newPayload) {
        return { changed: false, release: cloneRelease(existing.release) };
      }
    }

    records.set(key, {
      key,
      topicId,
      topicUrl: normalizedTopicUrl,
      cachedAt: now,
      release: normalizedRelease
    });

    saveToDisk();

    return {
      changed: true,
      release: cloneRelease(normalizedRelease)
    };
  }

  loadFromDisk();

  return {
    getByTopicUrl,
    upsert,
    normalizeTopicUrl,
    flushSave
  };
}

module.exports = {
  createReleaseCacheStore,
  normalizeTopicUrl
};
