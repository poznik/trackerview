const cheerio = require("cheerio");
const SCREENSHOTS_SCHEMA_VERSION = 5;

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function toAbsoluteHttpUrl(rawUrl, baseUrl) {
  const source = cleanText(rawUrl);
  if (!source) {
    return "";
  }

  try {
    const absolute = new URL(source, baseUrl);
    if (!/^https?:$/i.test(absolute.protocol)) {
      return "";
    }
    return absolute.toString();
  } catch (error) {
    return "";
  }
}

function isImageUrl(url) {
  return /\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:$|\?)/i.test(String(url || ""));
}

function parseSafeUrl(url) {
  try {
    return new URL(String(url || ""));
  } catch (error) {
    return null;
  }
}

function isFastpicDomainUrl(url) {
  const parsed = parseSafeUrl(url);
  if (!parsed) {
    return false;
  }

  return /(^|\.)fastpic\.org$/i.test(parsed.hostname);
}

function isFastpicImageUrl(url) {
  return isFastpicDomainUrl(url) && isImageUrl(url);
}

function isFastpicViewPageUrl(url) {
  const parsed = parseSafeUrl(url);
  if (!parsed || !isFastpicDomainUrl(parsed.toString())) {
    return false;
  }

  return /^\/view\/\d+\/\d{4}\/\d{4}\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif|bmp|avif)\.html$/i.test(
    parsed.pathname
  );
}

function isFastpicBigImageUrl(url) {
  const parsed = parseSafeUrl(url);
  if (!parsed || !isFastpicImageUrl(parsed.toString())) {
    return false;
  }

  return /\/big\//i.test(parsed.pathname);
}

function isImgboxDomainUrl(url) {
  const parsed = parseSafeUrl(url);
  if (!parsed) {
    return false;
  }

  return /(^|\.)imgbox\.com$/i.test(parsed.hostname);
}

function isSupportedScreenshotDomainUrl(url) {
  return isFastpicDomainUrl(url) || isImgboxDomainUrl(url);
}

function isSupportedScreenshotImageUrl(url) {
  return isSupportedScreenshotDomainUrl(url) && isImageUrl(url);
}

function buildFastpicImageUrlFromView(viewUrl) {
  const parsed = parseSafeUrl(viewUrl);
  if (!parsed || !isFastpicDomainUrl(parsed.toString())) {
    return "";
  }

  const match = parsed.pathname.match(
    /^\/view\/(\d+)\/(\d{4})\/(\d{4})\/([A-Za-z0-9_-]+)\.(jpg|jpeg|png|webp|gif|bmp|avif)\.html$/i
  );
  if (!match) {
    return "";
  }

  const server = match[1];
  const year = match[2];
  const monthDay = match[3];
  const fileName = match[4];
  const ext = match[5].toLowerCase();
  if (!fileName || fileName.length < 2) {
    return "";
  }

  const folder = fileName.slice(-2).toLowerCase();
  return `https://i${server}.fastpic.org/big/${year}/${monthDay}/${folder}/${fileName}.${ext}`;
}

function buildFastpicImageUrlFromThumb(thumbUrl) {
  const parsed = parseSafeUrl(thumbUrl);
  if (!parsed || !isFastpicImageUrl(parsed.toString())) {
    return "";
  }

  if (!/^\/thumb\//i.test(parsed.pathname)) {
    return "";
  }

  const full = new URL(parsed.toString());
  full.pathname = parsed.pathname.replace(/^\/thumb\//i, "/big/");
  return full.toString();
}

function buildImgboxImageUrlFromThumb(thumbUrl) {
  const parsed = parseSafeUrl(thumbUrl);
  if (!parsed || !isImgboxDomainUrl(parsed.toString()) || !isImageUrl(parsed.toString())) {
    return "";
  }

  if (!/^thumbs/i.test(parsed.hostname)) {
    return "";
  }

  const full = new URL(parsed.toString());
  full.hostname = parsed.hostname.replace(/^thumbs/i, "images");
  full.pathname = full.pathname.replace(/_t(\.[a-z0-9]+)$/i, "_o$1");

  return full.toString();
}

function resolveScreenshotPreviewUrl(thumbUrl, fullUrl) {
  const candidates = [];

  if (isSupportedScreenshotImageUrl(fullUrl)) {
    candidates.push(fullUrl);
  }

  const imgboxFromThumb = buildImgboxImageUrlFromThumb(thumbUrl);
  if (isSupportedScreenshotImageUrl(imgboxFromThumb)) {
    candidates.push(imgboxFromThumb);
  }

  if (isSupportedScreenshotImageUrl(thumbUrl)) {
    candidates.push(thumbUrl);
  }

  const fastpicFromView = buildFastpicImageUrlFromView(fullUrl);
  if (isSupportedScreenshotImageUrl(fastpicFromView)) {
    candidates.push(fastpicFromView);
  }

  const fastpicFromThumb = buildFastpicImageUrlFromThumb(thumbUrl);
  if (isSupportedScreenshotImageUrl(fastpicFromThumb)) {
    candidates.push(fastpicFromThumb);
  }

  return candidates.find(Boolean) || "";
}

function extractFastpicDirectImageUrlFromViewPageHtml(viewUrl, html) {
  const rawHtml = String(html || "");
  if (!rawHtml.trim()) {
    return "";
  }

  const $ = cheerio.load(rawHtml);
  let firstMatch = "";

  $("img[src]").each((_, element) => {
    const src = toAbsoluteHttpUrl($(element).attr("src"), viewUrl);
    if (!isFastpicImageUrl(src)) {
      return;
    }

    if (isFastpicBigImageUrl(src)) {
      firstMatch = src;
      return false;
    }

    if (!firstMatch) {
      firstMatch = src;
    }

    return;
  });

  if (isFastpicImageUrl(firstMatch)) {
    return firstMatch;
  }

  const fallbackMatches = rawHtml.match(/https?:\/\/i\d+\.fastpic\.org\/big\/[^"'<>\\\s]+/gi) || [];
  for (const candidate of fallbackMatches) {
    const normalized = toAbsoluteHttpUrl(candidate, viewUrl);
    if (isFastpicImageUrl(normalized)) {
      return normalized;
    }
  }

  return "";
}

async function fetchFastpicDirectImageUrlFromViewPage(viewUrl, timeoutMs = 12000) {
  if (!isFastpicViewPageUrl(viewUrl)) {
    return "";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(viewUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return "";
    }

    const html = await response.text();
    const directUrl = extractFastpicDirectImageUrlFromViewPageHtml(viewUrl, html);
    if (isFastpicImageUrl(directUrl)) {
      return directUrl;
    }
  } catch (error) {
    return "";
  } finally {
    clearTimeout(timer);
  }

  return "";
}

function parseStartOffset(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (!/^\d+$/.test(String(value).trim())) {
    return 0;
  }

  return Number.parseInt(String(value).trim(), 10);
}

function getPageStartOffset(url) {
  try {
    const parsed = new URL(url);
    return parseStartOffset(parsed.searchParams.get("start"));
  } catch (error) {
    return 0;
  }
}

function normalizeCollectionPageUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.searchParams.delete("sid");

  const startOffset = parseStartOffset(parsed.searchParams.get("start"));
  if (startOffset > 0) {
    parsed.searchParams.set("start", String(startOffset));
  } else {
    parsed.searchParams.delete("start");
  }

  const sortedEntries = Array.from(parsed.searchParams.entries()).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

  parsed.search = "";
  for (const [key, value] of sortedEntries) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}

function isSameCollectionPage(source, candidate) {
  if (candidate.hostname !== source.hostname) {
    return false;
  }

  if (candidate.pathname !== source.pathname) {
    return false;
  }

  if (/viewtopic\.php$/i.test(source.pathname)) {
    const sourceTopicId = source.searchParams.get("t");
    const candidateTopicId = candidate.searchParams.get("t");
    return sourceTopicId ? sourceTopicId === candidateTopicId : true;
  }

  if (/viewforum\.php$/i.test(source.pathname)) {
    const sourceForumId = source.searchParams.get("f");
    const candidateForumId = candidate.searchParams.get("f");
    return sourceForumId ? sourceForumId === candidateForumId : true;
  }

  // tracker.php pagination switches from explicit filter params to search_id,
  // so strict query equality would drop valid page links (2,3,...,Next).
  if (/tracker\.php$/i.test(source.pathname)) {
    return true;
  }

  for (const [key, value] of source.searchParams.entries()) {
    if (key === "start" || key === "sid") {
      continue;
    }
    if (candidate.searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

function extractCollectionPageLinks(indexHtml, sourceUrl) {
  const $ = cheerio.load(indexHtml);
  const source = new URL(sourceUrl);
  const sourceNormalized = normalizeCollectionPageUrl(source.toString());

  const unique = new Set([sourceNormalized]);
  const links = [sourceNormalized];

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) {
      return;
    }

    let absolute;
    try {
      absolute = new URL(href, sourceUrl);
    } catch (error) {
      return;
    }

    if (!isSameCollectionPage(source, absolute)) {
      return;
    }

    const linkText = cleanText($(anchor).text());
    const hasStartOffset = parseStartOffset(absolute.searchParams.get("start")) > 0;
    const looksLikePager =
      /^\d+$/.test(linkText) || /^(?:след|next|пред|prev)/i.test(linkText);

    if (!hasStartOffset && !looksLikePager) {
      return;
    }

    const normalized = normalizeCollectionPageUrl(absolute.toString());
    if (unique.has(normalized)) {
      return;
    }

    unique.add(normalized);
    links.push(normalized);
  });

  links.sort((left, right) => getPageStartOffset(left) - getPageStartOffset(right));
  return links;
}

function extractTopicLinks(indexHtml, sourceUrl, maxReleases = Number.POSITIVE_INFINITY) {
  const $ = cheerio.load(indexHtml);
  const source = new URL(sourceUrl);
  const sourceTopicId = parseTopicIdFromUrl(sourceUrl);
  const anchors = $(".post_body a[href]").length ? $(".post_body a[href]") : $("a[href]");

  const unique = new Set();
  const links = [];

  anchors.each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) {
      return;
    }

    let absolute;
    try {
      absolute = new URL(href, sourceUrl);
    } catch (error) {
      return;
    }

    if (absolute.hostname !== source.hostname) {
      return;
    }

    if (!/viewtopic\.php$/i.test(absolute.pathname)) {
      return;
    }

    const topicId = absolute.searchParams.get("t");
    if (!topicId || !/^\d+$/.test(topicId)) {
      return;
    }

    if (sourceTopicId && topicId === sourceTopicId) {
      return;
    }

    if (unique.has(topicId)) {
      return;
    }

    unique.add(topicId);
    links.push(`${source.protocol}//${source.host}${absolute.pathname}?t=${topicId}`);
  });

  const limit = Number.isFinite(maxReleases)
    ? Math.max(1, Number.parseInt(String(maxReleases), 10))
    : Number.POSITIVE_INFINITY;

  return links.slice(0, limit);
}

function extractBestPoster($, firstPost) {
  const candidates = [];

  firstPost.find("var.postImg[title]").each((_, element) => {
    const url = cleanText($(element).attr("title"));
    if (!/^https?:\/\//i.test(url)) {
      return;
    }

    if (!/\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i.test(url)) {
      return;
    }

    const className = cleanText($(element).attr("class"));

    let score = 0;
    if (className.includes("postImgAligned")) {
      score += 4;
    }
    if (/_o\./i.test(url)) {
      score += 3;
    }
    if (!/thumb/i.test(url)) {
      score += 2;
    }
    if (/\/pic\/(?:smilies|icons?)\//i.test(url) || /release_month/i.test(url)) {
      score -= 20;
    }

    candidates.push({ url, score });
  });

  if (!candidates.length) {
    return "";
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

function extractScreenshots($, firstPost, topicUrl, posterUrl) {
  const screenshots = [];
  const unique = new Set();

  function pushScreenshot(rawThumbUrl, rawFullUrl, className = "") {
    const thumbUrl = toAbsoluteHttpUrl(rawThumbUrl, topicUrl);
    if (!thumbUrl || !isSupportedScreenshotImageUrl(thumbUrl)) {
      return;
    }

    const fullUrlCandidate = toAbsoluteHttpUrl(rawFullUrl, topicUrl);
    let fullUrl =
      fullUrlCandidate && isSupportedScreenshotDomainUrl(fullUrlCandidate) ? fullUrlCandidate : thumbUrl;
    if (!fullUrl) {
      fullUrl = thumbUrl;
    }

    const previewUrl = resolveScreenshotPreviewUrl(thumbUrl, fullUrl) || thumbUrl;

    if (posterUrl && (thumbUrl === posterUrl || fullUrl === posterUrl || previewUrl === posterUrl)) {
      return;
    }

    if (/postImgAligned/i.test(className) && posterUrl) {
      return;
    }

    if (/\/pic\/smilies\//i.test(thumbUrl) || /\/pic\/icons?\//i.test(thumbUrl)) {
      return;
    }

    const key = `${thumbUrl}|${fullUrl}|${previewUrl}`;
    if (unique.has(key)) {
      return;
    }

    unique.add(key);
    screenshots.push({
      thumbUrl,
      fullUrl,
      previewUrl
    });
  }

  firstPost.find("var.postImg[title]").each((_, element) => {
    const thumbUrl = cleanText($(element).attr("title"));
    const className = cleanText($(element).attr("class"));
    const parentLink = $(element).closest("a[href]").first();
    const href = cleanText(parentLink.attr("href"));

    pushScreenshot(thumbUrl, href || thumbUrl, className);
  });

  if (screenshots.length === 0) {
    firstPost.find("a[href] img[src]").each((_, image) => {
      const imageNode = $(image);
      const thumbUrl = cleanText(imageNode.attr("data-src") || imageNode.attr("src"));
      const href = cleanText(imageNode.closest("a[href]").attr("href"));
      const className = cleanText(
        `${imageNode.attr("class") || ""} ${imageNode.closest("a[href]").attr("class") || ""}`
      );

      const width = Number.parseInt(cleanText(imageNode.attr("width")), 10);
      const height = Number.parseInt(cleanText(imageNode.attr("height")), 10);
      if (Number.isFinite(width) && Number.isFinite(height) && Math.max(width, height) < 100) {
        return;
      }

      pushScreenshot(thumbUrl, href || thumbUrl, className);
    });
  }

  return screenshots.slice(0, 36);
}

function isCachedReleaseUsable(cachedRelease) {
  if (!cachedRelease || typeof cachedRelease !== "object") {
    return false;
  }

  if (Number(cachedRelease.screenshotsSchemaVersion || 0) !== SCREENSHOTS_SCHEMA_VERSION) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(cachedRelease, "torrentUrl")) {
    return false;
  }

  if (typeof cachedRelease.torrentUrl !== "string") {
    return false;
  }

  return true;
}

function extractDescription($, firstPost) {
  const rawHtml = firstPost.html() || "";
  const descriptionFromHtml = rawHtml.match(
    /<span class="post-b">\s*Описание\s*<\/span>\s*:\s*([\s\S]*?)(?=<span class="post-br"><br\s*\/?><\/span>\s*<span class="post-b">|<span class="post-b">|<\/div>|$)/i
  );

  if (descriptionFromHtml && descriptionFromHtml[1]) {
    const descriptionText = cleanText(cheerio.load(`<div>${descriptionFromHtml[1]}</div>`).text());
    if (descriptionText) {
      return descriptionText;
    }
  }

  const plainText = cleanText(firstPost.text());
  const plainDescription = plainText.match(/Описание\s*:\s*(.+?)(?:P\.S\.|$)/i);
  if (plainDescription && plainDescription[1]) {
    return cleanText(plainDescription[1]);
  }

  const metaDescription = cleanText($("meta[name='description']").attr("content"));
  if (metaDescription) {
    return cleanText(metaDescription.replace(/^.*?Скачать торрент\s*/i, ""));
  }

  return "";
}

function extractPublicationDate($) {
  const explicit = cleanText($("#tor-reged span[title='Зарегистрирован']").first().text());
  if (explicit) {
    return explicit.replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
  }

  const blockText = cleanText($("#tor-reged").text());
  const match = blockText.match(/Зарегистрирован\s*\[\s*([^\]]+)\]/i);
  if (match && match[1]) {
    return cleanText(match[1]);
  }

  return "";
}

function extractCategory($) {
  const breadcrumbCategory = cleanText($("td.nav a[href*='viewforum.php']").last().text());
  if (breadcrumbCategory) {
    return breadcrumbCategory;
  }

  const metaDescription = cleanText($("meta[name='description']").attr("content"));
  const fromMeta = metaDescription.match(/tracker\\.Net\\s*»\\s*(.*?)\\s*»\\s*Скачать торрент/i);
  if (fromMeta && fromMeta[1]) {
    return cleanText(fromMeta[1]);
  }

  return "";
}

function extractSize($) {
  let size = "";

  $("#tor-reged tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2 || size) {
      return;
    }

    const label = cleanText($(cells[0]).text()).replace(/:$/, "");
    if (label === "Размер") {
      size = cleanText($(cells[1]).text());
    }
  });

  if (size) {
    return size;
  }

  const fallback = $("#tor-reged").html() || "";
  const match = fallback.match(/Размер:\s*<\/td>\s*<td>([^<]+)/i);
  if (match && match[1]) {
    return cleanText(match[1].replace(/&nbsp;/g, " "));
  }

  return "";
}

function extractTorrentUrl($, topicUrl) {
  const selectors = [
    "#tor-reged a.dl-link[href]",
    "#tor-reged a[href*='dl.php?t=']",
    "#tor-reged a[href$='.torrent']",
    "a[href*='dl.php?t=']",
    "a[href$='.torrent']"
  ];

  for (const selector of selectors) {
    const node = $(selector).first();
    if (!node.length) {
      continue;
    }

    const href = cleanText(node.attr("href"));
    const absoluteUrl = toAbsoluteHttpUrl(href, topicUrl);
    if (absoluteUrl) {
      return absoluteUrl;
    }
  }

  return "";
}

function extractSeeds($) {
  const seedValue = cleanText($("span.seed b").first().text());
  if (seedValue) {
    const numberMatch = seedValue.match(/\d+/);
    if (numberMatch) {
      return Number.parseInt(numberMatch[0], 10);
    }
  }

  const html = $.html();
  const fallback = html.match(/Сиды:\s*&nbsp;\s*<b>(\d+)/i);
  if (fallback && fallback[1]) {
    return Number.parseInt(fallback[1], 10);
  }

  return null;
}

function parseReleasePage(topicUrl, html) {
  const $ = cheerio.load(html);
  const firstPost = $(".post_body").first();

  const rawTitle = cleanText($("title").first().text());
  const title = rawTitle.includes("::")
    ? cleanText(rawTitle.split("::")[0])
    : rawTitle;

  const posterUrl = extractBestPoster($, firstPost);
  const screenshots = extractScreenshots($, firstPost, topicUrl, posterUrl);
  const description = extractDescription($, firstPost) || title;
  const publicationDate = extractPublicationDate($);
  const category = extractCategory($);
  const seeds = extractSeeds($);
  const size = extractSize($);
  const torrentUrl = extractTorrentUrl($, topicUrl);

  return {
    topicId: parseTopicIdFromUrl(topicUrl),
    topicUrl,
    title,
    category,
    posterUrl,
    screenshots,
    screenshotsSchemaVersion: SCREENSHOTS_SCHEMA_VERSION,
    description,
    publicationDate,
    seeds,
    size,
    torrentUrl
  };
}

async function mapWithConcurrency(items, limit, mapper, onItemComplete) {
  const maxWorkers = Math.max(1, limit);
  const workersCount = Math.min(maxWorkers, items.length);
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;

      if (current >= items.length) {
        return;
      }

      const result = await mapper(items[current], current);
      results[current] = result;
      if (typeof onItemComplete === "function") {
        await onItemComplete({
          item: items[current],
          index: current,
          result
        });
      }
    }
  }

  const workers = [];
  for (let i = 0; i < workersCount; i += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

async function enrichReleaseScreenshots(release, options = {}) {
  if (!release || typeof release !== "object" || release.error) {
    return release;
  }

  const screenshots = Array.isArray(release.screenshots) ? release.screenshots : [];
  if (screenshots.length === 0) {
    return release;
  }

  const screenshotConcurrency =
    Number.isFinite(options.screenshotConcurrency) && options.screenshotConcurrency > 0
      ? Math.max(1, Number.parseInt(String(options.screenshotConcurrency), 10))
      : 3;
  const fastpicTimeoutMs =
    Number.isFinite(options.fastpicTimeoutMs) && options.fastpicTimeoutMs > 0
      ? Math.max(1000, Number.parseInt(String(options.fastpicTimeoutMs), 10))
      : 12000;

  const resolvedFastpicViewUrls = new Map();

  const normalizedScreenshots = await mapWithConcurrency(
    screenshots,
    screenshotConcurrency,
    async (rawScreenshot) => {
      const thumbUrl = toAbsoluteHttpUrl(rawScreenshot?.thumbUrl || "", release.topicUrl);
      if (!thumbUrl || !isSupportedScreenshotImageUrl(thumbUrl)) {
        return null;
      }

      const fullUrlCandidate = toAbsoluteHttpUrl(rawScreenshot?.fullUrl || thumbUrl, release.topicUrl);
      const fullUrl =
        fullUrlCandidate && isSupportedScreenshotDomainUrl(fullUrlCandidate) ? fullUrlCandidate : thumbUrl;

      let previewUrl = toAbsoluteHttpUrl(rawScreenshot?.previewUrl || "", release.topicUrl);
      if (!previewUrl || !isSupportedScreenshotImageUrl(previewUrl)) {
        previewUrl = resolveScreenshotPreviewUrl(thumbUrl, fullUrl) || thumbUrl;
      }

      if (isFastpicViewPageUrl(fullUrl)) {
        let pending = resolvedFastpicViewUrls.get(fullUrl);
        if (!pending) {
          pending = fetchFastpicDirectImageUrlFromViewPage(fullUrl, fastpicTimeoutMs);
          resolvedFastpicViewUrls.set(fullUrl, pending);
        }

        try {
          const resolvedFastpicUrl = await pending;
          if (isFastpicImageUrl(resolvedFastpicUrl)) {
            previewUrl = resolvedFastpicUrl;
          }
        } catch (error) {
          // Keep best-effort previewUrl already resolved above.
        }
      }

      return {
        thumbUrl,
        fullUrl,
        previewUrl
      };
    }
  );

  const unique = new Set();
  const dedupedScreenshots = [];
  for (const screenshot of normalizedScreenshots) {
    if (!screenshot) {
      continue;
    }

    const key = `${screenshot.thumbUrl}|${screenshot.fullUrl}|${screenshot.previewUrl}`;
    if (unique.has(key)) {
      continue;
    }

    unique.add(key);
    dedupedScreenshots.push(screenshot);
  }

  return {
    ...release,
    screenshots: dedupedScreenshots
  };
}

function buildCachedRelease(release) {
  return {
    ...release,
    seeds: "-",
    fromCache: true
  };
}

async function collectTopicLinksFromCollectionPages(client, pageUrl, firstPage, options) {
  const maxReleases =
    Number.isFinite(options.maxReleases) && options.maxReleases > 0
      ? Math.max(1, Number.parseInt(String(options.maxReleases), 10))
      : Number.POSITIVE_INFINITY;

  const topicLinks = [];
  const topicKeys = new Set();

  function notifyDiscovered() {
    if (typeof options.onDiscovered === "function") {
      options.onDiscovered({ totalFound: topicLinks.length });
    }
  }

  function addTopicLinks(links) {
    let added = 0;
    for (const topicUrl of links) {
      if (topicLinks.length >= maxReleases) {
        break;
      }

      const topicId = parseTopicIdFromUrl(topicUrl);
      const key = topicId || topicUrl;
      if (topicKeys.has(key)) {
        continue;
      }

      topicKeys.add(key);
      topicLinks.push(topicUrl);
      added += 1;
    }

    if (added > 0) {
      notifyDiscovered();
    }
  }

  const initialSourceUrl = firstPage.url || pageUrl;
  const initialNormalized = normalizeCollectionPageUrl(initialSourceUrl);
  const visitedPages = new Set([initialNormalized]);
  const queuedPages = new Set();
  const pagesQueue = [];

  function enqueuePageLinks(links) {
    for (const link of links) {
      if (visitedPages.has(link) || queuedPages.has(link)) {
        continue;
      }

      queuedPages.add(link);
      pagesQueue.push(link);
    }
  }

  addTopicLinks(extractTopicLinks(firstPage.text, initialSourceUrl));
  enqueuePageLinks(extractCollectionPageLinks(firstPage.text, initialSourceUrl));

  while (pagesQueue.length > 0 && topicLinks.length < maxReleases) {
    const nextPageUrl = pagesQueue.shift();
    queuedPages.delete(nextPageUrl);

    if (visitedPages.has(nextPageUrl)) {
      continue;
    }
    visitedPages.add(nextPageUrl);

    const page = await client.request(nextPageUrl);
    if (!page.ok) {
      throw new Error(`Failed to open source page (${page.status}).`);
    }

    const pageSourceUrl = page.url || nextPageUrl;
    visitedPages.add(normalizeCollectionPageUrl(pageSourceUrl));

    addTopicLinks(extractTopicLinks(page.text, pageSourceUrl));
    enqueuePageLinks(extractCollectionPageLinks(page.text, pageSourceUrl));
  }

  return topicLinks;
}

async function parseReleasesFromCollection(client, pageUrl, options) {
  const runtimeOptions = options || {};
  const releaseCache = runtimeOptions.releaseCache || null;
  const concurrency =
    Number.isFinite(runtimeOptions.concurrency) && runtimeOptions.concurrency > 0
      ? runtimeOptions.concurrency
      : 4;

  const listPage = await client.request(pageUrl);
  if (!listPage.ok) {
    throw new Error(`Failed to open source page (${listPage.status}).`);
  }

  const topicLinks = await collectTopicLinksFromCollectionPages(client, pageUrl, listPage, runtimeOptions);
  if (!topicLinks.length) {
    const $ = cheerio.load(listPage.text);
    const hasTorrentBlock = $("#tor-reged").length > 0;
    if (hasTorrentBlock) {
      if (typeof runtimeOptions.onDiscovered === "function") {
        runtimeOptions.onDiscovered({ totalFound: 1 });
      }

      let release = null;
      if (releaseCache && typeof releaseCache.getByTopicUrl === "function") {
        const cachedRelease = releaseCache.getByTopicUrl(pageUrl);
        if (isCachedReleaseUsable(cachedRelease)) {
          release = buildCachedRelease(cachedRelease);
        }
      }

      if (!release) {
        release = parseReleasePage(pageUrl, listPage.text);
        release = await enrichReleaseScreenshots(release, runtimeOptions);
        if (releaseCache && typeof releaseCache.upsert === "function") {
          releaseCache.upsert(release);
        }
      } else {
        release = await enrichReleaseScreenshots(release, runtimeOptions);
      }

      if (typeof runtimeOptions.onProgress === "function") {
        runtimeOptions.onProgress({
          processed: 1,
          totalFound: 1,
          index: 0,
          release
        });
      }

      return {
        sourceUrl: pageUrl,
        totalFound: 1,
        releases: [release]
      };
    }

    throw new Error("No release links found on source page.");
  }

  if (typeof runtimeOptions.onDiscovered === "function") {
    runtimeOptions.onDiscovered({ totalFound: topicLinks.length });
  }

  let processed = 0;

  const releases = await mapWithConcurrency(
    topicLinks,
    concurrency,
    async (topicUrl) => {
      try {
        let release = null;

        if (releaseCache && typeof releaseCache.getByTopicUrl === "function") {
          const cachedRelease = releaseCache.getByTopicUrl(topicUrl);
          if (isCachedReleaseUsable(cachedRelease)) {
            release = buildCachedRelease(cachedRelease);
          }
        }

        if (!release) {
          const page = await client.request(topicUrl);
          if (!page.ok) {
            throw new Error(`HTTP ${page.status}`);
          }

          release = parseReleasePage(topicUrl, page.text);
          release = await enrichReleaseScreenshots(release, runtimeOptions);
          if (releaseCache && typeof releaseCache.upsert === "function") {
            releaseCache.upsert(release);
          }
        } else {
          release = await enrichReleaseScreenshots(release, runtimeOptions);
        }

        return release;
      } catch (error) {
        return {
          topicId: parseTopicIdFromUrl(topicUrl),
          topicUrl,
          title: "",
          category: "",
          posterUrl: "",
          screenshots: [],
          description: "",
          publicationDate: "",
          seeds: null,
          size: "",
          torrentUrl: "",
          error: error.message
        };
      }
    },
    ({ index, result }) => {
      processed += 1;
      if (typeof runtimeOptions.onProgress === "function") {
        runtimeOptions.onProgress({
          processed,
          totalFound: topicLinks.length,
          index,
          release: result
        });
      }
    }
  );

  return {
    sourceUrl: pageUrl,
    totalFound: topicLinks.length,
    releases
  };
}

module.exports = {
  parseReleasePage,
  parseReleasesFromCollection,
  enrichReleaseScreenshots,
  isCachedReleaseUsable,
  SCREENSHOTS_SCHEMA_VERSION
};
