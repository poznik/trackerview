#!/usr/bin/env node

const fs = require("fs");
const readline = require("readline");

function usage() {
  console.error("Usage: node scripts/diagnostics-summary.js <trackerview.log>");
  process.exit(1);
}

const logPath = process.argv[2];
if (!logPath) {
  usage();
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio));
  return sorted[index];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function fmtMs(value) {
  return `${Math.round(value)}ms`;
}

function fmtMb(bytes) {
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

function topBy(items, key, limit = 10) {
  return [...items]
    .sort((left, right) => Number(right[key] || 0) - Number(left[key] || 0))
    .slice(0, limit);
}

const events = [];

(async () => {
  const stream = fs.createReadStream(logPath, "utf8");
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    const start = line.indexOf("{");
    if (start < 0) continue;

    try {
      const payload = JSON.parse(line.slice(start));
      if (payload?.level === "diagnostic" && payload?.event) {
        events.push(payload);
      }
    } catch (error) {
      // Ignore non-JSON application log lines.
    }
  }

  const httpRequests = events.filter((event) => event.event === "http.request");
  const releases = events.filter((event) => event.event === "release.done");
  const screenshots = events.filter((event) => event.event === "screenshots.enrich.done");
  const jobs = events.filter((event) => ["job.done", "job.error", "job.cancelled"].includes(event.event));

  console.log(`Diagnostic events: ${events.length}`);
  console.log(`HTTP requests: ${httpRequests.length}`);
  console.log(`Releases: ${releases.length}`);
  console.log(`Screenshot enrich events: ${screenshots.length}`);
  console.log(`Jobs finished: ${jobs.length}`);

  if (jobs.length) {
    console.log("\nJobs");
    for (const job of jobs.slice(-5)) {
      const cpu = job.cpu || {};
      console.log(
        `- ${job.event} job=${job.jobId || ""} duration=${fmtMs(job.durationMs || 0)} ` +
          `cpu=${fmtMs(cpu.totalMs || 0)} processed=${job.processed || 0}/${job.totalFound || 0} ` +
          `errors=${job.errors || 0}`
      );
    }
  }

  if (httpRequests.length) {
    const durations = httpRequests.map((event) => Number(event.durationMs || 0));
    const bytes = httpRequests.map((event) => Number(event.bytes || 0));
    console.log("\nHTTP summary");
    console.log(`- total duration: ${fmtMs(sum(durations))}`);
    console.log(`- p50/p95/max: ${fmtMs(percentile(durations, 0.5))} / ${fmtMs(percentile(durations, 0.95))} / ${fmtMs(Math.max(...durations))}`);
    console.log(`- total bytes: ${fmtMb(sum(bytes))}`);

    console.log("\nSlowest HTTP requests");
    for (const event of topBy(httpRequests, "durationMs")) {
      console.log(
        `- ${fmtMs(event.durationMs || 0)} ${event.status || ""} ${event.bytes || 0}B ` +
          `${event.method || "GET"} ${event.url || ""} ${event.contentType || ""}`
      );
    }
  }

  if (releases.length) {
    const totalMs = releases.map((event) => Number(event.durationMs || 0));
    const fetchMs = releases.map((event) => Number(event.fetchMs || 0));
    const parseMs = releases.map((event) => Number(event.parseMs || 0));
    const enrichMs = releases.map((event) => Number(event.enrichMs || 0));
    const cacheCounts = releases.reduce((counts, event) => {
      const key = event.cache || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});

    console.log("\nRelease summary");
    console.log(`- cache: ${Object.entries(cacheCounts).map(([key, value]) => `${key}=${value}`).join(", ")}`);
    console.log(`- total p50/p95/max: ${fmtMs(percentile(totalMs, 0.5))} / ${fmtMs(percentile(totalMs, 0.95))} / ${fmtMs(Math.max(...totalMs))}`);
    console.log(`- fetch sum: ${fmtMs(sum(fetchMs))}`);
    console.log(`- parse sum: ${fmtMs(sum(parseMs))}`);
    console.log(`- enrich sum: ${fmtMs(sum(enrichMs))}`);

    console.log("\nSlowest releases");
    for (const event of topBy(releases, "durationMs")) {
      console.log(
        `- ${fmtMs(event.durationMs || 0)} topic=${event.topicId || ""} cache=${event.cache || ""} ` +
          `fetch=${fmtMs(event.fetchMs || 0)} parse=${fmtMs(event.parseMs || 0)} ` +
          `enrich=${fmtMs(event.enrichMs || 0)} screenshots=${event.screenshots || 0}`
      );
    }
  }

  if (screenshots.length) {
    const durations = screenshots.map((event) => Number(event.durationMs || 0));
    const fastpicPages = screenshots.map((event) => Number(event.fastpicViewPages || 0));

    console.log("\nScreenshot summary");
    console.log(`- enrich p50/p95/max: ${fmtMs(percentile(durations, 0.5))} / ${fmtMs(percentile(durations, 0.95))} / ${fmtMs(Math.max(...durations))}`);
    console.log(`- fastpic view pages: ${sum(fastpicPages)}`);
  }
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
