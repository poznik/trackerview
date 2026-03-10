const cheerio = require("cheerio");

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

function extractTopicLinks(indexHtml, sourceUrl, maxReleases) {
  const $ = cheerio.load(indexHtml);
  const source = new URL(sourceUrl);
  const sourceTopicId = parseTopicIdFromUrl(sourceUrl);
  const firstPost = $(".post_body").first();
  const anchors = firstPost.length ? firstPost.find("a[href]") : $("a[href]");

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

  return links.slice(0, Math.max(1, maxReleases));
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
    if (/static\.tracker\.net\/pic\//i.test(url) || /release_month/i.test(url)) {
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
  const description = extractDescription($, firstPost) || title;
  const publicationDate = extractPublicationDate($);
  const category = extractCategory($);
  const seeds = extractSeeds($);
  const size = extractSize($);

  return {
    topicId: parseTopicIdFromUrl(topicUrl),
    topicUrl,
    title,
    category,
    posterUrl,
    description,
    publicationDate,
    seeds,
    size
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

async function parseReleasesFromCollection(client, pageUrl, options) {
  const listPage = await client.request(pageUrl);
  if (!listPage.ok) {
    throw new Error(`Failed to open source page (${listPage.status}).`);
  }

  const topicLinks = extractTopicLinks(listPage.text, pageUrl, options.maxReleases);
  if (!topicLinks.length) {
    const $ = cheerio.load(listPage.text);
    const hasTorrentBlock = $("#tor-reged").length > 0;
    if (hasTorrentBlock) {
      if (typeof options.onDiscovered === "function") {
        options.onDiscovered({ totalFound: 1 });
      }

      const release = parseReleasePage(pageUrl, listPage.text);
      if (typeof options.onProgress === "function") {
        options.onProgress({
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

  if (typeof options.onDiscovered === "function") {
    options.onDiscovered({ totalFound: topicLinks.length });
  }

  let processed = 0;

  const releases = await mapWithConcurrency(
    topicLinks,
    options.concurrency,
    async (topicUrl) => {
      try {
        const page = await client.request(topicUrl);
        if (!page.ok) {
          throw new Error(`HTTP ${page.status}`);
        }

        return parseReleasePage(topicUrl, page.text);
      } catch (error) {
        return {
          topicId: parseTopicIdFromUrl(topicUrl),
          topicUrl,
          title: "",
          category: "",
          posterUrl: "",
          description: "",
          publicationDate: "",
          seeds: null,
          size: "",
          error: error.message
        };
      }
    },
    ({ index, result }) => {
      processed += 1;
      if (typeof options.onProgress === "function") {
        options.onProgress({
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
  parseReleasesFromCollection
};
