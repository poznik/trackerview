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
      },
      {
        thumbUrl: "https://images.example/two.jpg",
        previewUrl: "https://images.example/two-preview.jpg",
        fullUrl: "https://images.example/two-full.jpg"
      },
      {
        thumbUrl: "https://images.example/three.jpg",
        previewUrl: "https://images.example/three-preview.jpg",
        fullUrl: "https://images.example/three-full.jpg"
      },
      {
        thumbUrl: "https://images.example/four.jpg",
        previewUrl: "https://images.example/four-preview.jpg",
        fullUrl: "https://images.example/four-full.jpg"
      }
    ]
  });

  assert.match(release.posterUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=poster&u=/);
  assert.match(release.screenshots[0].thumbUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=preview&u=/);
  assert.match(release.screenshots[0].previewUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=preview&u=/);
  assert.match(release.screenshots[2].previewUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=preview&u=/);
  assert.match(release.screenshots[3].thumbUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=rest&u=/);
  assert.match(release.screenshots[3].previewUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=rest&u=/);
  assert.match(release.screenshots[3].fullUrl, /^\/cache\/pics\/[a-f0-9]{64}\.jpg\?p=rest&u=/);
  assert.equal(
    release.screenshots[0].fullUrl,
    "https://fastpic.org/view/123/2026/0504/abcdxy.jpg.html"
  );
});

test("image cache strips expiring Fastpic signatures from rewritten URLs", () => {
  const cache = createImageCache({ cacheDir: "cache/pics" });
  const unsignedUrl =
    "https://i126.fastpic.org/big/2025/1120/f2/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg";
  const signedUrl = `${unsignedUrl}?md5=expired&expires=1`;
  const release = cache.rewriteRelease({
    screenshots: [
      {
        thumbUrl: "https://i126.fastpic.org/thumb/2025/1120/f2/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg",
        previewUrl: signedUrl,
        fullUrl: "https://fastpic.org/view/126/2025/1120/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg.html"
      }
    ]
  });

  const previewUrl = new URL(release.screenshots[0].previewUrl, "http://localhost");
  assert.equal(decodeURIComponent(previewUrl.searchParams.get("u")), unsignedUrl);
  assert.match(previewUrl.pathname, new RegExp(`/${fileNameForImageUrl(unsignedUrl)}$`));
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

test("image cache downloads cache misses by priority", async () => {
  const originalFetch = global.fetch;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerview-pics-"));
  const order = [];
  let releaseFirstDownload = null;

  global.fetch = async (url) => {
    order.push(String(url));
    if (order.length === 1) {
      await new Promise((resolve) => {
        releaseFirstDownload = resolve;
      });
    }
    return new Response(Buffer.from([1, 2, 3]), {
      headers: { "content-type": "image/jpeg" }
    });
  };

  function createResponse() {
    return {
      setHeader() {},
      sendFile() {
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(message) {
        this.message = message;
        return this;
      }
    };
  }

  function createRequest(rawUrl, priority) {
    const imageUrl = normalizeImageUrl(rawUrl);
    return {
      params: { fileName: fileNameForImageUrl(imageUrl) },
      query: { u: imageUrl, p: priority }
    };
  }

  try {
    const cache = createImageCache({ cacheDir: tempDir, downloadConcurrency: 1 });
    const restOne = "https://images.example/rest-one.jpg";
    const restTwo = "https://images.example/rest-two.jpg";
    const poster = "https://images.example/poster.jpg";

    const first = cache.handleRequest(createRequest(restOne, "rest"), createResponse());
    while (order.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const second = cache.handleRequest(createRequest(restTwo, "rest"), createResponse());
    const third = cache.handleRequest(createRequest(poster, "poster"), createResponse());
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(order, [restOne]);

    releaseFirstDownload();
    await Promise.all([first, second, third]);

    assert.deepEqual(order, [restOne, poster, restTwo]);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("image cache resolves signed Fastpic big image URL when unsigned URL returns HTML", async () => {
  const originalFetch = global.fetch;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerview-pics-"));
  const unsignedUrl =
    "https://i127.fastpic.org/big/2026/0504/58/_a75ebb87ef9f4fc2f2b73efc77f47e58.jpg";
  const viewUrl =
    "https://fastpic.org/view/127/2026/0504/_a75ebb87ef9f4fc2f2b73efc77f47e58.jpg.html";
  const signedUrl = `${unsignedUrl}?md5=test&amp;expires=1777896000`;
  const calls = [];

  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value === unsignedUrl) {
      return new Response("<html>not an image</html>", {
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    }
    if (value === viewUrl) {
      return new Response(`<img src="${signedUrl}">`, {
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    }
    if (value === signedUrl.replace(/&amp;/g, "&")) {
      return new Response(Buffer.from([4, 5, 6]), {
        headers: { "content-type": "image/jpeg" }
      });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };

  try {
    const cache = createImageCache({ cacheDir: tempDir });
    const fileName = fileNameForImageUrl(normalizeImageUrl(unsignedUrl));
    const headers = {};
    let sentFile = "";
    const response = {
      setHeader(name, value) {
        headers[name] = value;
      },
      sendFile(filePath) {
        sentFile = filePath;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(message) {
        this.message = message;
        return this;
      }
    };

    await cache.handleRequest(
      { params: { fileName }, query: { u: unsignedUrl, p: "preview" } },
      response
    );

    assert.deepEqual(calls, [unsignedUrl, viewUrl, signedUrl.replace(/&amp;/g, "&")]);
    assert.equal(headers["X-Image-Cache"], "MISS");
    assert.equal(await fs.readFile(sentFile, "hex"), "040506");
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("image cache refreshes expired Fastpic signed URLs through the stable big URL", async () => {
  const originalFetch = global.fetch;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "trackerview-pics-"));
  const unsignedUrl =
    "https://i126.fastpic.org/big/2025/1120/f2/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg";
  const staleSignedUrl = `${unsignedUrl}?md5=expired&expires=1`;
  const freshSignedUrl = `${unsignedUrl}?md5=fresh&expires=1777896000`;
  const viewUrl =
    "https://fastpic.org/view/126/2025/1120/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg.html";
  const calls = [];

  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value === staleSignedUrl) {
      throw new Error("Stale signed URL should not be fetched.");
    }
    if (value === unsignedUrl) {
      return new Response("<html>not an image</html>", {
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    }
    if (value === viewUrl) {
      return new Response(`<img src="${freshSignedUrl}">`, {
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    }
    if (value === freshSignedUrl) {
      return new Response(Buffer.from([7, 8, 9]), {
        headers: { "content-type": "image/jpeg" }
      });
    }
    throw new Error(`Unexpected URL: ${value}`);
  };

  try {
    const cache = createImageCache({ cacheDir: tempDir });
    const fileName = fileNameForImageUrl(normalizeImageUrl(staleSignedUrl));
    await fs.writeFile(path.join(tempDir, fileName), Buffer.from("expired hotlink placeholder"));
    let sentFile = "";
    const response = {
      setHeader() {},
      sendFile(filePath) {
        sentFile = filePath;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(message) {
        this.message = message;
        return this;
      }
    };

    await cache.handleRequest(
      { params: { fileName }, query: { u: staleSignedUrl, p: "preview" } },
      response
    );

    assert.deepEqual(calls, [unsignedUrl, viewUrl, freshSignedUrl]);
    assert.equal(await fs.readFile(sentFile, "hex"), "070809");
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
