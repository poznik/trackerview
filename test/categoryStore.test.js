const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createCategoryStore } = require("../src/categoryStore");

test("category store persists favorite flag without resetting it on plain upsert", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerview-store-"));
  try {
    const storePath = path.join(tempDir, "tags.json");
    const store = createCategoryStore(storePath);

    store.upsertMany([{ name: "Favorite Tag", enabled: true, favorite: true }]);
    store.upsertMany([{ name: "Favorite Tag", enabled: false }]);
    store.flushSave();

    const reloaded = createCategoryStore(storePath);
    const tag = reloaded.list().find((entry) => entry.name === "Favorite Tag");

    assert.equal(tag.enabled, false);
    assert.equal(tag.favorite, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
