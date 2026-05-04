const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");

const diagnostics = require("./diagnostics");

const CACHE_ROUTE_PREFIX = "/cache/pics";
const DEFAULT_MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif"
};

function parseSafeUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || "").trim());
  } catch (error) {
    return null;
  }
}

function normalizeRoutePrefix(rawValue) {
  const value = String(rawValue || CACHE_ROUTE_PREFIX).trim().replace(/\/+$/, "");
  return value.startsWith("/") ? value : `/${value}`;
}

function resolveCacheDir(rawDir) {
  const value = String(rawDir || "").trim() || path.join("cache", "pics");
  if (path.isAbsolute(value)) {
    return path.resolve(value);
  }
  return path.resolve(path.join(__dirname, "..", value));
}

function normalizeImageUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return "";
  }

  parsed.hash = "";
  return parsed.toString();
}

function extensionFromUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed) {
    return "";
  }

  const extension = path.extname(parsed.pathname).replace(/^\./, "").toLowerCase();
  return SUPPORTED_EXTENSIONS.has(extension) ? extension : "";
}

function isSupportedImageUrl(rawUrl) {
  const normalized = normalizeImageUrl(rawUrl);
  return Boolean(normalized && extensionFromUrl(normalized));
}

function hashImageUrl(normalizedUrl) {
  return crypto.createHash("sha256").update(normalizedUrl).digest("hex");
}

function fileNameForImageUrl(normalizedUrl) {
  const extension = extensionFromUrl(normalizedUrl);
  if (!extension) {
    return "";
  }
  return `${hashImageUrl(normalizedUrl)}.${extension}`;
}

function isCacheUrl(rawUrl, routePrefix) {
  const value = String(rawUrl || "").trim();
  return value === routePrefix || value.startsWith(`${routePrefix}/`);
}

function contentTypeForFileName(fileName) {
  const extension = path.extname(fileName).replace(/^\./, "").toLowerCase();
  return CONTENT_TYPES[extension] || "application/octet-stream";
}

async function fileExists(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    return false;
  }
}

function createImageCache(options = {}) {
  const cacheDir = resolveCacheDir(options.cacheDir);
  const routePrefix = normalizeRoutePrefix(options.routePrefix);
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.max(1000, Number.parseInt(String(options.timeoutMs), 10))
      : 25000;
  const maxImageBytes =
    Number.isFinite(options.maxImageBytes) && options.maxImageBytes > 0
      ? Math.max(1024, Number.parseInt(String(options.maxImageBytes), 10))
      : DEFAULT_MAX_IMAGE_BYTES;
  const userAgent = String(options.userAgent || "TrackerViewBot/0.1 (+https://localhost)");
  const pendingDownloads = new Map();

  function toCacheUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value || isCacheUrl(value, routePrefix)) {
      return value;
    }

    const normalizedUrl = normalizeImageUrl(value);
    if (!normalizedUrl || !isSupportedImageUrl(normalizedUrl)) {
      return value;
    }

    const fileName = fileNameForImageUrl(normalizedUrl);
    if (!fileName) {
      return value;
    }

    return `${routePrefix}/${fileName}?u=${encodeURIComponent(normalizedUrl)}`;
  }

  function rewriteRelease(release) {
    if (!release || typeof release !== "object") {
      return release;
    }

    const nextRelease = {
      ...release,
      posterUrl: toCacheUrl(release.posterUrl)
    };

    if (Array.isArray(release.screenshots)) {
      nextRelease.screenshots = release.screenshots.map((screenshot) => {
        if (!screenshot || typeof screenshot !== "object") {
          return screenshot;
        }

        return {
          ...screenshot,
          thumbUrl: toCacheUrl(screenshot.thumbUrl),
          previewUrl: toCacheUrl(screenshot.previewUrl),
          fullUrl: toCacheUrl(screenshot.fullUrl)
        };
      });
    }

    return nextRelease;
  }

  function rewriteReleases(releases) {
    return Array.isArray(releases) ? releases.map(rewriteRelease) : [];
  }

  function targetPathForFileName(fileName) {
    return path.join(cacheDir, fileName);
  }

  function validateRequest(fileName, rawUrl) {
    if (!/^[a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(fileName)) {
      return { ok: false, status: 404, error: "Invalid cache file name." };
    }

    const normalizedUrl = normalizeImageUrl(rawUrl);
    if (!normalizedUrl || !isSupportedImageUrl(normalizedUrl)) {
      return { ok: false, status: 404, error: "Image URL is required for cache miss." };
    }

    if (fileNameForImageUrl(normalizedUrl).toLowerCase() !== fileName.toLowerCase()) {
      return { ok: false, status: 400, error: "Cache key does not match image URL." };
    }

    return { ok: true, normalizedUrl };
  }

  async function downloadImage(normalizedUrl, targetPath, fileName) {
    const startedAt = diagnostics.startTimer();
    const tmpPath = `${targetPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    let bytes = 0;

    try {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      const response = await fetch(normalizedUrl, {
        headers: {
          "user-agent": userAgent,
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        },
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Image download failed with HTTP ${response.status}.`);
      }

      const contentLength = Number.parseInt(String(response.headers.get("content-length") || ""), 10);
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
        throw new Error(`Image is too large (${contentLength} bytes).`);
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
        throw new Error(`Unexpected image content type: ${contentType}.`);
      }

      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > maxImageBytes) {
            callback(new Error(`Image is too large (${bytes} bytes).`));
            return;
          }
          callback(null, chunk);
        }
      });

      await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(tmpPath));
      if (bytes <= 0) {
        throw new Error("Image download returned an empty body.");
      }

      await fs.promises.rename(tmpPath, targetPath);
      diagnostics.log("image_cache.download.done", {
        imageUrl: normalizedUrl,
        fileName,
        bytes,
        durationMs: diagnostics.elapsedMs(startedAt)
      });
    } catch (error) {
      try {
        await fs.promises.rm(tmpPath, { force: true });
      } catch (cleanupError) {
        // Best-effort cleanup only.
      }
      diagnostics.log("image_cache.download.error", {
        imageUrl: normalizedUrl,
        fileName,
        bytes,
        durationMs: diagnostics.elapsedMs(startedAt),
        error: error.message
      });
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function ensureCached(normalizedUrl, fileName) {
    const targetPath = targetPathForFileName(fileName);
    if (await fileExists(targetPath)) {
      return { targetPath, hit: true };
    }

    let pending = pendingDownloads.get(fileName);
    if (!pending) {
      pending = downloadImage(normalizedUrl, targetPath, fileName).finally(() => {
        pendingDownloads.delete(fileName);
      });
      pendingDownloads.set(fileName, pending);
    }

    await pending;
    return { targetPath, hit: false };
  }

  function sendCachedFile(response, targetPath, fileName, hit) {
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    response.setHeader("Content-Type", contentTypeForFileName(fileName));
    response.setHeader("X-Image-Cache", hit ? "HIT" : "MISS");
    return response.sendFile(targetPath);
  }

  async function handleRequest(request, response) {
    const fileName = path.basename(String(request.params?.fileName || ""));
    const targetPath = targetPathForFileName(fileName);
    if (await fileExists(targetPath)) {
      diagnostics.log("image_cache.hit", { fileName });
      return sendCachedFile(response, targetPath, fileName, true);
    }

    const validation = validateRequest(fileName, request.query?.u);
    if (!validation.ok) {
      return response.status(validation.status).send(validation.error);
    }

    try {
      const result = await ensureCached(validation.normalizedUrl, fileName);
      return sendCachedFile(response, result.targetPath, fileName, result.hit);
    } catch (error) {
      return response.status(502).send(error.message || "Failed to cache image.");
    }
  }

  return {
    cacheDir,
    routePrefix,
    toCacheUrl,
    rewriteRelease,
    rewriteReleases,
    handleRequest
  };
}

module.exports = {
  CACHE_ROUTE_PREFIX,
  createImageCache,
  extensionFromUrl,
  fileNameForImageUrl,
  isSupportedImageUrl,
  normalizeImageUrl,
  resolveCacheDir
};
