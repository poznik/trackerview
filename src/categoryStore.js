const fs = require("fs");
const path = require("path");

function normalizeCategoryName(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || "Без категории";
}

const SAVE_DEBOUNCE_MS = 500;

function createCategoryStore(filePath) {
  const categories = new Map();
  let saveTimer = null;
  let savePending = false;

  function ensureDirectory() {
    const directoryPath = path.dirname(filePath);
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
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
      const list = Array.isArray(parsed.categories) ? parsed.categories : [];

      for (const item of list) {
        const name = normalizeCategoryName(item?.name);
        const enabled = typeof item?.enabled === "boolean" ? item.enabled : true;
        const createdAt = Number.isFinite(item?.createdAt) ? item.createdAt : Date.now();
        const updatedAt = Number.isFinite(item?.updatedAt) ? item.updatedAt : createdAt;
        categories.set(name, {
          name,
          enabled,
          createdAt,
          updatedAt
        });
      }
    } catch (error) {
      console.warn(`Failed to load categories store from ${filePath}: ${error.message}`);
    }
  }

  function saveToDiskNow() {
    ensureDirectory();

    const payload = {
      categories: list()
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
        console.warn(`Failed to flush store ${filePath}: ${error.message}`);
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
        console.warn(`Failed to save store ${filePath}: ${error.message}`);
      }
    }, SAVE_DEBOUNCE_MS);
    if (typeof saveTimer.unref === "function") {
      saveTimer.unref();
    }
  }

  function list() {
    return Array.from(categories.values())
      .map((entry) => ({ ...entry }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "ru", {
          sensitivity: "base"
        })
      );
  }

  function upsertMany(entries, options = {}) {
    const defaultEnabled =
      typeof options.defaultEnabled === "boolean" ? options.defaultEnabled : true;

    let changed = false;

    for (const entry of entries || []) {
      const name = normalizeCategoryName(entry?.name);
      const hasEnabled = typeof entry?.enabled === "boolean";
      const enabled = hasEnabled ? entry.enabled : defaultEnabled;

      if (!categories.has(name)) {
        const now = Date.now();
        categories.set(name, {
          name,
          enabled,
          createdAt: now,
          updatedAt: now
        });
        changed = true;
        continue;
      }

      if (hasEnabled) {
        const existing = categories.get(name);
        if (existing.enabled !== enabled) {
          existing.enabled = enabled;
          existing.updatedAt = Date.now();
          changed = true;
        }
      }
    }

    if (changed) {
      saveToDisk();
    }

    return {
      changed,
      categories: list()
    };
  }

  function ensureCategory(name) {
    return upsertMany([{ name }], { defaultEnabled: true });
  }

  loadFromDisk();

  return {
    list,
    upsertMany,
    ensureCategory,
    flushSave
  };
}

module.exports = {
  createCategoryStore,
  normalizeCategoryName
};
