const fs = require("fs");
const path = require("path");

function normalizeSearchName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function createSavedSearchStore(filePath) {
  const searchesByUrl = new Map();

  function ensureDirectory() {
    const directoryPath = path.dirname(filePath);
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }
  }

  function list() {
    return Array.from(searchesByUrl.values()).map((entry) => ({ ...entry }));
  }

  function saveToDisk() {
    ensureDirectory();

    const payload = {
      searches: list()
    };

    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
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
      const entries = Array.isArray(parsed.searches) ? parsed.searches : [];

      for (const entry of entries) {
        const url = normalizeSearchUrl(entry?.url);
        const name = normalizeSearchName(entry?.name);
        if (!url || !name) {
          continue;
        }

        const createdAt = Number.isFinite(entry?.createdAt) ? entry.createdAt : Date.now();
        const updatedAt = Number.isFinite(entry?.updatedAt) ? entry.updatedAt : createdAt;

        searchesByUrl.set(url, {
          name,
          url,
          createdAt,
          updatedAt
        });
      }
    } catch (error) {
      console.warn(`Failed to load saved searches store from ${filePath}: ${error.message}`);
    }
  }

  function upsert(search) {
    const name = normalizeSearchName(search?.name);
    const url = normalizeSearchUrl(search?.url);

    if (!name) {
      throw new Error("Search name must not be empty.");
    }

    if (!url) {
      throw new Error("Search URL must be a valid URL.");
    }

    const now = Date.now();
    const existing = searchesByUrl.get(url);

    if (!existing) {
      searchesByUrl.set(url, {
        name,
        url,
        createdAt: now,
        updatedAt: now
      });
      saveToDisk();
      return {
        changed: true,
        search: { ...searchesByUrl.get(url) }
      };
    }

    if (existing.name === name) {
      return {
        changed: false,
        search: { ...existing }
      };
    }

    existing.name = name;
    existing.updatedAt = now;
    saveToDisk();

    return {
      changed: true,
      search: { ...existing }
    };
  }

  loadFromDisk();

  return {
    list,
    upsert,
    normalizeSearchUrl
  };
}

module.exports = {
  createSavedSearchStore,
  normalizeSearchName,
  normalizeSearchUrl
};
