const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseReleasePage,
  parseReleasesFromCollection,
  enrichReleaseScreenshots,
  isCachedReleaseUsable,
  resolveReleaseQualityInfo,
  extractPopularChartTopicLinks,
  SCREENSHOTS_SCHEMA_VERSION
} = require("../src/parser");

const TOPIC_URL = "https://tracker.example/forum/viewtopic.php?t=12345";

function buildReleaseHtml(overrides = {}) {
  const {
    title = "Some Studio - Cool Release [2024, 1080p, BDRip] :: tracker.example",
    description = "Описание: A wonderful release with everything you ever wanted.",
    breadcrumbCategory = "Кино / Фильмы",
    publicationDate = "01-янв-25 10:30",
    size = "8.41 GB",
    seeds = "42",
    torrentHref = "/forum/dl.php?t=12345",
    posterImg =
      '<var class="postImg postImgAligned" title="https://example.com/poster_o.jpg"></var>',
    bodyExtra = ""
  } = overrides;

  return `<!doctype html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="tracker.Net » ${breadcrumbCategory} » ${title} » Скачать торрент" />
</head>
<body>
  <table>
    <tr>
      <td class="nav">
        <a href="index.php">Index</a> &raquo;
        <a href="viewforum.php?f=10">${breadcrumbCategory}</a>
      </td>
    </tr>
  </table>
  <div class="post_body">
    ${posterImg}
    ${bodyExtra}
    <span class="post-b">Описание</span>: ${description.replace(/^Описание:\s*/i, "")}
    <span class="post-br"><br/></span>
  </div>
  <div id="tor-reged">
    <span title="Зарегистрирован">[ ${publicationDate} ]</span>
    <table>
      <tr><td>Размер:</td><td>${size}</td></tr>
    </table>
    <a class="dl-link" href="${torrentHref}">Скачать .torrent</a>
    <span class="seed">Сиды: <b>${seeds}</b></span>
  </div>
</body>
</html>`;
}

test("parseReleasePage extracts core fields", () => {
  const html = buildReleaseHtml();
  const release = parseReleasePage(TOPIC_URL, html);

  assert.equal(release.topicId, "12345");
  assert.equal(release.topicUrl, TOPIC_URL);
  assert.match(release.title, /Cool Release/);
  assert.equal(release.category, "Кино / Фильмы");
  assert.equal(release.size, "8.41 GB");
  assert.equal(release.seeds, 42);
  assert.equal(release.publicationDate, "01-янв-25 10:30");
  assert.equal(
    release.torrentUrl,
    "https://tracker.example/forum/dl.php?t=12345"
  );
  assert.equal(release.posterUrl, "https://example.com/poster_o.jpg");
  assert.ok(Array.isArray(release.tags));
  assert.equal(release.screenshotsSchemaVersion, SCREENSHOTS_SCHEMA_VERSION);
  assert.ok(Array.isArray(release.screenshots));
});

test("parseReleasePage handles missing optional fields gracefully", () => {
  const html = `<!doctype html><html><body>
    <div class="post_body"></div>
  </body></html>`;
  const release = parseReleasePage(TOPIC_URL, html);

  assert.equal(release.topicId, "12345");
  assert.equal(release.size, "");
  assert.equal(release.seeds, null);
  assert.equal(release.torrentUrl, "");
  assert.equal(release.posterUrl, "");
  assert.deepEqual(release.tags, []);
  assert.deepEqual(release.screenshots, []);
});

test("parseReleasePage falls back to meta-description category", () => {
  const html = `<!doctype html><html><head>
    <meta name="description" content="rutracker » Музыка » Rock » Скачать торрент Some Album" />
  </head><body>
    <div class="post_body"></div>
  </body></html>`;
  const release = parseReleasePage(TOPIC_URL, html);
  assert.equal(release.category, "Rock");
});

test("isCachedReleaseUsable rejects stale schema versions", () => {
  assert.equal(
    isCachedReleaseUsable({
      screenshotsSchemaVersion: SCREENSHOTS_SCHEMA_VERSION - 1,
      torrentUrl: "https://x/y"
    }),
    false
  );
});

test("isCachedReleaseUsable rejects entries without torrentUrl", () => {
  assert.equal(
    isCachedReleaseUsable({
      screenshotsSchemaVersion: SCREENSHOTS_SCHEMA_VERSION,
      tags: []
    }),
    false
  );
});

test("isCachedReleaseUsable rejects entries without parsed tags", () => {
  assert.equal(
    isCachedReleaseUsable({
      screenshotsSchemaVersion: SCREENSHOTS_SCHEMA_VERSION,
      torrentUrl: "https://tracker.example/forum/dl.php?t=1"
    }),
    false
  );
});

test("parseReleasePage extracts genre and performer tags", () => {
  const html = buildReleaseHtml({
    title:
      "[StudioA.example / StudioB.example] Rebecca Nikson - Star Wars Day 2026 (04.05.2026) [2026 г., Young, Gonzo, Hardcore, All Sex, 1080p]",
    description: "Описание: Жанр: Young, Gonzo, Hardcore Актрисы: Rebecca Nikson"
  });
  const release = parseReleasePage(TOPIC_URL, html);
  assert.ok(release.tags.includes("Rebecca Nikson"));
  assert.ok(release.tags.includes("Young"));
  assert.ok(release.tags.includes("Gonzo"));
  assert.ok(release.tags.includes("Hardcore"));
  assert.ok(release.tags.includes("All Sex"));
  assert.equal(release.tags.includes("1080p"), false);
});

test("extractPopularChartTopicLinks ignores sticky rows and returns topics section links", () => {
  const html = `<!doctype html><html><body><table>
    <tr><td class="row3 topicSep">Прилеплены</td></tr>
    <tr><td><a class="topictitle" href="viewtopic.php?t=111">Pinned yearly topic</a></td></tr>
    <tr><td class="row3 topicSep">Топики</td></tr>
    <tr><td><a class="topictitle" href="viewtopic.php?t=222">20.04.2026-26.04.2026</a></td></tr>
    <tr><td><a class="topictitle" href="viewtopic.php?t=333">Март / March 2026</a></td></tr>
  </table></body></html>`;

  assert.deepEqual(
    extractPopularChartTopicLinks(html, "https://tracker.example/forum/viewforum.php?f=popular"),
    [
      "https://tracker.example/forum/viewtopic.php?t=222",
      "https://tracker.example/forum/viewtopic.php?t=333"
    ]
  );
});

test("resolveReleaseQualityInfo detects 1080p", () => {
  const info = resolveReleaseQualityInfo("Movie Title 2024 1080p BDRip");
  assert.equal(info.label, "1080p");
  assert.equal(info.height, 1080);
  assert.equal(info.tone, "green");
});

test("resolveReleaseQualityInfo detects 4K and prefers higher height", () => {
  const info = resolveReleaseQualityInfo("Some Show 2160p 4K UHD");
  assert.equal(info.height, 2160);
  assert.equal(info.tone, "blue");
});

test("resolveReleaseQualityInfo returns N/A for releases without quality", () => {
  const info = resolveReleaseQualityInfo("Plain Title No Quality Info");
  assert.equal(info.label, "N/A");
  assert.equal(info.tone, "na");
});

test("parseReleasePage attaches quality field to release", () => {
  const html = `<!doctype html><html><head><title>Foo 720p :: tracker</title></head>
    <body><div class="post_body"></div></body></html>`;
  const release = parseReleasePage("https://t/forum/viewtopic.php?t=99", html);
  assert.ok(release.quality);
  assert.equal(release.quality.label, "720p");
  assert.equal(release.quality.tone, "yellow");
});

test("enrichReleaseScreenshots derives Fastpic big image URL without fetching view page", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("Unexpected Fastpic view page fetch.");
  };

  try {
    const release = await enrichReleaseScreenshots({
      topicUrl: TOPIC_URL,
      screenshots: [
        {
          thumbUrl: "https://i123.fastpic.org/thumb/2026/0504/xy/abcdxy.jpg",
          fullUrl: "https://fastpic.org/view/123/2026/0504/abcdxy.jpg.html",
          previewUrl: "https://i123.fastpic.org/thumb/2026/0504/xy/abcdxy.jpg"
        }
      ]
    });

    assert.equal(
      release.screenshots[0].previewUrl,
      "https://i123.fastpic.org/big/2026/0504/xy/abcdxy.jpg"
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("enrichReleaseScreenshots drops expiring Fastpic signatures from preview URLs", async () => {
  const unsignedUrl =
    "https://i126.fastpic.org/big/2025/1120/f2/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg";
  const release = await enrichReleaseScreenshots({
    topicUrl: TOPIC_URL,
    screenshots: [
      {
        thumbUrl: "https://i126.fastpic.org/thumb/2025/1120/f2/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg",
        fullUrl: "https://fastpic.org/view/126/2025/1120/_8c5b0b36034fd73ca4fd01b7ccc8e0f2.jpg.html",
        previewUrl: `${unsignedUrl}?md5=expired&expires=1`
      }
    ]
  });

  assert.equal(release.screenshots[0].previewUrl, unsignedUrl);
});

test("parseReleasesFromCollection publishes parsed release before screenshot enrichment progress", async () => {
  const listUrl = "https://tracker.example/forum/viewforum.php?f=10";
  const topicUrl = "https://tracker.example/forum/viewtopic.php?t=12345";
  const topicHtml = buildReleaseHtml({
    bodyExtra:
      '<a href="https://fastpic.org/view/123/2026/0504/abcdxy.jpg.html">' +
      '<var class="postImg" title="https://i123.fastpic.org/thumb/2026/0504/xy/abcdxy.jpg"></var>' +
      "</a>"
  });
  const events = [];
  const client = {
    async request(url) {
      if (url === listUrl) {
        return {
          ok: true,
          status: 200,
          url,
          text: '<a class="topictitle" href="/forum/viewtopic.php?t=12345">Topic</a>'
        };
      }
      if (url === topicUrl) {
        return {
          ok: true,
          status: 200,
          url,
          text: topicHtml
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  };

  const result = await parseReleasesFromCollection(client, listUrl, {
    maxReleases: 1,
    concurrency: 1,
    onReleaseUpdate: ({ phase, release }) => {
      events.push({ type: "release_update", phase, previewUrl: release.screenshots[0]?.previewUrl });
    },
    onProgress: ({ release }) => {
      events.push({ type: "progress", previewUrl: release.screenshots[0]?.previewUrl });
    }
  });

  assert.deepEqual(
    events.map((event) => event.type),
    ["release_update", "progress"]
  );
  assert.equal(events[0].phase, "parsed");
  assert.equal(events[0].previewUrl, "https://i123.fastpic.org/big/2026/0504/xy/abcdxy.jpg");
  assert.equal(result.releases[0].screenshots[0].previewUrl, events[1].previewUrl);
});

test("isCachedReleaseUsable accepts well-formed entries", () => {
  assert.equal(
    isCachedReleaseUsable({
      screenshotsSchemaVersion: SCREENSHOTS_SCHEMA_VERSION,
      torrentUrl: "https://tracker.example/forum/dl.php?t=1",
      tags: []
    }),
    true
  );
});
