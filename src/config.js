require("dotenv").config();

function toNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  app: {
    port: toNumber(process.env.PORT, 3000)
  },
  tracker: {
    baseUrl: process.env.TRACKER_BASE_URL || "https://tracker.example/forum",
    username: process.env.TRACKER_USERNAME || "",
    password: process.env.TRACKER_PASSWORD || "",
    maxReleases: toNumber(process.env.TRACKER_MAX_RELEASES, 80),
    concurrency: toNumber(process.env.TRACKER_CONCURRENCY, 4),
    requestTimeoutMs: toNumber(process.env.TRACKER_REQUEST_TIMEOUT_MS, 25000),
    userAgent:
      process.env.TRACKER_USER_AGENT ||
      "TrackerViewBot/0.1 (+https://localhost)"
  }
};

module.exports = { config };
