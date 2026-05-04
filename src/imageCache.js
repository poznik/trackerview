const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable, Transform } = require("stream");
const { pipeline } = require("stream/promises");

const diagnostics = require("./diagnostics");

const CACHE_ROUTE_PREFIX = "/cache/pics";
const DEFAULT_MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const DEFAULT_DOWNLOAD_CONCURRENCY = 3;
const SUPPORTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"]);
const PRIORITY_VALUES = {
  poster: 0,
  preview: 1,
  rest: 2
};

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

function normalizeFastpicCacheSourceUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed) {
    return normalizeImageUrl(rawUrl);
  }

  const normalized = normalizeImageUrl(parsed.toString());
  if (!normalized || !isFastpicBigImageUrl(normalized)) {
    return normalized;
  }

  parsed.hash = "";
  parsed.searchParams.delete("md5");
  parsed.searchParams.delete("expires");
  return normalizeImageUrl(parsed.toString());
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

function isImageContentType(value) {
  const contentType = String(value || "").toLowerCase();
  return Boolean(contentType.startsWith("image/") || contentType.includes("octet-stream"));
}

function normalizePriority(rawPriority) {
  const value = String(rawPriority || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRIORITY_VALUES, value) ? value : "rest";
}

function isFastpicDomainUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed) {
    return false;
  }
  return /(^|\.)fastpic\.org$/i.test(parsed.hostname);
}

function isFastpicImageUrl(rawUrl) {
  return isFastpicDomainUrl(rawUrl) && isSupportedImageUrl(rawUrl);
}

function isFastpicBigImageUrl(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed || !isFastpicImageUrl(parsed.toString())) {
    return false;
  }
  return /^\/big\//i.test(parsed.pathname);
}

function buildFastpicViewUrlFromBigImage(rawUrl) {
  const parsed = parseSafeUrl(rawUrl);
  if (!parsed || !isFastpicBigImageUrl(parsed.toString())) {
    return "";
  }

  const hostMatch = parsed.hostname.match(/^i(\d+)\.fastpic\.org$/i);
  const pathMatch = parsed.pathname.match(
    /^\/big\/(\d{4})\/(\d{4})\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|bmp|avif))$/i
  );
  if (!hostMatch || !pathMatch) {
    return "";
  }

  return `https://fastpic.org/view/${hostMatch[1]}/${pathMatch[1]}/${pathMatch[2]}/${pathMatch[3]}.html`;
}

function extractFastpicDirectImageUrlFromViewPageHtml(viewUrl, html) {
  const rawHtml = String(html || "");
  const matches = rawHtml.match(/https?:\/\/i\d+\.fastpic\.org\/big\/[^"'<>\\\s]+/gi) || [];
  for (const candidate of matches) {
    const normalized = normalizeImageUrl(candidate.replace(/&amp;/gi, "&"));
    if (isFastpicBigImageUrl(normalized)) {
      return normalized;
    }
  }

  const srcMatches = rawHtml.match(/src\s*=\s*["']([^"']+)["']/gi) || [];
  for (const rawMatch of srcMatches) {
    const match = rawMatch.match(/src\s*=\s*["']([^"']+)["']/i);
    let src = "";
    try {
      src = match ? normalizeImageUrl(new URL(match[1].replace(/&amp;/gi, "&"), viewUrl).toString()) : "";
    } catch (error) {
      src = "";
    }
    if (isFastpicBigImageUrl(src)) {
      return src;
    }
  }

  return "";
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch (error) {
    // Best-effort connection cleanup only.
  }
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
  const downloadConcurrency =
    Number.isFinite(options.downloadConcurrency) && options.downloadConcurrency > 0
      ? Math.max(1, Number.parseInt(String(options.downloadConcurrency), 10))
      : DEFAULT_DOWNLOAD_CONCURRENCY;
  const pendingDownloads = new Map();
  const downloadQueue = [];
  let activeDownloads = 0;
  let sequence = 0;

  function toCacheUrl(rawUrl, options = {}) {
    const value = String(rawUrl || "").trim();
    if (!value || isCacheUrl(value, routePrefix)) {
      return value;
    }

    const normalizedUrl = normalizeFastpicCacheSourceUrl(value);
    if (!normalizedUrl || !isSupportedImageUrl(normalizedUrl)) {
      return value;
    }

    const fileName = fileNameForImageUrl(normalizedUrl);
    if (!fileName) {
      return value;
    }

    const priority = normalizePriority(options.priority);
    return `${routePrefix}/${fileName}?p=${priority}&u=${encodeURIComponent(normalizedUrl)}`;
  }

  function rewriteRelease(release) {
    if (!release || typeof release !== "object") {
      return release;
    }

    const nextRelease = {
      ...release,
      posterUrl: toCacheUrl(release.posterUrl, { priority: "poster" })
    };

    if (Array.isArray(release.screenshots)) {
      nextRelease.screenshots = release.screenshots.map((screenshot, index) => {
        if (!screenshot || typeof screenshot !== "object") {
          return screenshot;
        }

        const screenshotPriority = index < 3 ? "preview" : "rest";
        return {
          ...screenshot,
          thumbUrl: toCacheUrl(screenshot.thumbUrl, { priority: screenshotPriority }),
          previewUrl: toCacheUrl(screenshot.previewUrl, { priority: screenshotPriority }),
          fullUrl: toCacheUrl(screenshot.fullUrl, { priority: "rest" })
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

    const originalUrl = normalizeImageUrl(rawUrl);
    const normalizedUrl = normalizeFastpicCacheSourceUrl(rawUrl);
    if (!normalizedUrl || !isSupportedImageUrl(normalizedUrl)) {
      return { ok: false, status: 404, error: "Image URL is required for cache miss." };
    }

    const canonicalFileName = fileNameForImageUrl(normalizedUrl).toLowerCase();
    const originalFileName = originalUrl ? fileNameForImageUrl(originalUrl).toLowerCase() : "";
    const expectedFileNames = new Set([canonicalFileName]);
    if (originalUrl && originalUrl !== normalizedUrl) {
      expectedFileNames.add(originalFileName);
    }

    if (!expectedFileNames.has(fileName.toLowerCase())) {
      return { ok: false, status: 400, error: "Cache key does not match image URL." };
    }

    return {
      ok: true,
      normalizedUrl,
      refreshExisting: Boolean(originalFileName && originalFileName !== canonicalFileName && originalFileName === fileName.toLowerCase())
    };
  }

  function drainQueue() {
    while (activeDownloads < downloadConcurrency && downloadQueue.length > 0) {
      downloadQueue.sort((left, right) => {
        const priorityDelta = PRIORITY_VALUES[left.priority] - PRIORITY_VALUES[right.priority];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return left.sequence - right.sequence;
      });

      const item = downloadQueue.shift();
      activeDownloads += 1;
      downloadImage(item.normalizedUrl, item.targetPath, item.fileName, item.priority)
        .then(item.resolve, item.reject)
        .finally(() => {
          activeDownloads -= 1;
          drainQueue();
        });
    }
  }

  function enqueueDownload(normalizedUrl, targetPath, fileName, priority) {
    return new Promise((resolve, reject) => {
      downloadQueue.push({
        normalizedUrl,
        targetPath,
        fileName,
        priority: normalizePriority(priority),
        sequence,
        resolve,
        reject
      });
      sequence += 1;
      drainQueue();
    });
  }

  async function fetchImageResponse(rawUrl, signal) {
    return fetch(rawUrl, {
      headers: {
        "user-agent": userAgent,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      },
      signal
    });
  }

  async function resolveFastpicSignedImageUrl(rawUrl, signal) {
    const viewUrl = buildFastpicViewUrlFromBigImage(rawUrl);
    if (!viewUrl) {
      return "";
    }

    const response = await fetch(viewUrl, {
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal
    });
    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    return extractFastpicDirectImageUrlFromViewPageHtml(viewUrl, html);
  }

  async function downloadImage(normalizedUrl, targetPath, fileName, priority = "rest") {
    const startedAt = diagnostics.startTimer();
    const tmpPath = `${targetPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    let bytes = 0;
    let effectiveUrl = normalizedUrl;

    try {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      let response = await fetchImageResponse(normalizedUrl, controller.signal);
      let contentType = String(response.headers.get("content-type") || "").toLowerCase();

      if (response.ok && !isImageContentType(contentType) && isFastpicBigImageUrl(normalizedUrl)) {
        await cancelResponseBody(response);
        const signedUrl = await resolveFastpicSignedImageUrl(normalizedUrl, controller.signal);
        if (signedUrl && signedUrl !== normalizedUrl) {
          effectiveUrl = signedUrl;
          response = await fetchImageResponse(signedUrl, controller.signal);
          contentType = String(response.headers.get("content-type") || "").toLowerCase();
        }
      }

      if (!response.ok || !response.body) {
        throw new Error(`Image download failed with HTTP ${response.status}.`);
      }

      const contentLength = Number.parseInt(String(response.headers.get("content-length") || ""), 10);
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
        throw new Error(`Image is too large (${contentLength} bytes).`);
      }

      if (contentType && !isImageContentType(contentType)) {
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
        effectiveImageUrl: effectiveUrl === normalizedUrl ? "" : effectiveUrl,
        fileName,
        priority,
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
        effectiveImageUrl: effectiveUrl === normalizedUrl ? "" : effectiveUrl,
        fileName,
        priority,
        bytes,
        durationMs: diagnostics.elapsedMs(startedAt),
        error: error.message
      });
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async function ensureCached(normalizedUrl, fileName, priority = "rest") {
    const targetPath = targetPathForFileName(fileName);
    if (await fileExists(targetPath)) {
      return { targetPath, hit: true };
    }

    let pending = pendingDownloads.get(fileName);
    if (!pending) {
      pending = enqueueDownload(normalizedUrl, targetPath, fileName, priority).finally(() => {
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
    const rawUrl = request.query?.u;

    if (!rawUrl && (await fileExists(targetPath))) {
      diagnostics.log("image_cache.hit", { fileName });
      return sendCachedFile(response, targetPath, fileName, true);
    }

    const validation = validateRequest(fileName, rawUrl);
    if (!validation.ok) {
      return response.status(validation.status).send(validation.error);
    }

    if (!validation.refreshExisting && (await fileExists(targetPath))) {
      diagnostics.log("image_cache.hit", { fileName });
      return sendCachedFile(response, targetPath, fileName, true);
    }

    try {
      if (validation.refreshExisting) {
        await fs.promises.rm(targetPath, { force: true });
      }
      const priority = normalizePriority(request.query?.p);
      const result = await ensureCached(validation.normalizedUrl, fileName, priority);
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
