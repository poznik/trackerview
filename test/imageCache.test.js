const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  createImageCache,
  fileNameForImageUrl,
  normalizeImageUrl
} = require("../src/imageCache");

test("image cache rewrites release image URLs to local cache URLs", () => {
  const cache = createImageCache({ cacheDir: "cache/pics" });
  const release = cache.rewriteRelease({
    posterUrl: "https://images.example/poster.jpg",
    screenshots: [
      {
        thumbUrl: "https://i123.fastpic.org/thumb/2026/0504/xy/abcdxy.jpg",
        previewUrl: "https://i123.fastpic.org/big/2026/0504/xy/abcdxy.jpg",
        fullUrl: "https://fastpic.org/view/123/2026/0504/abcdxy.jpg.html"
      }
    ]
  });

  assert.match(release.posterUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?u=/);
  assert.match(release.screenshots[0].thumbUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?u=/);
  assert.match(release.screenshots[0].previewUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?u=/);
  assert.equal(
    release.screenshots[0].fullUrl,
    "https://fastpic.org/view/123/2026/0504/abcdxy.jpg.html"
  );
});

test("image cache serves existing file without downloading source again", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("Unexpected image download.");
  };

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerview-pics-"));
  try {
    const cache = createImageCache({ cacheDir: tempDir });
    const imageUrl = normalizeImageUrl("https://images.example/pic.jpg");
    const fileName = fileNameForImageUrl(imageUrl);
    const targetPath = path.join(tempDir, fileName);
    await fs.writeFile(targetPath, Buffer.from([1, 2, 3]));

    const headers = {};
    let sentFile = "";
    const response = {
      setHeader(name, value) {
        headers[name] = value;
      },
      sendFile(filePath) {
        sentFile = filePath;
        return this;
      }
    };

    await cache.handleRequest({ params: { fileName }, query: {} }, response);

    assert.equal(sentFile, targetPath);
    assert.equal(headers["X-Image-Cache"], "HIT");
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
