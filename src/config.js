require("dotenv").config();
const path = require("path");
const { resolveAppVersion } = require("./version");
const { loadTomlConfig } = require("./tomlConfig");

function toNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readConfigValue(source, pathSegments) {
  let current = source;
  for (const segment of pathSegments) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function configPath() {
  return path.resolve(
    process.env.TRACKERVIEW_CONFIG_PATH || path.join(__dirname, "..", "config.toml")
  );
}

const fileConfig = loadTomlConfig(configPath());

function valueFromEnvOrConfig(envName, pathSegments, fallback = "") {
  const envValue = process.env[envName];
  if (envValue !== undefined && envValue !== "") {
    return envValue;
  }

  const configValue = readConfigValue(fileConfig, pathSegments);
  return configValue === undefined || configValue === null ? fallback : configValue;
}

const config = {
  app: {
    port: toNumber(valueFromEnvOrConfig("PORT", ["app", "port"], 3000), 3000),
    version: resolveAppVersion(),
    updateScriptPath: String(
      valueFromEnvOrConfig("APP_UPDATE_SCRIPT_PATH", ["app", "update_script_path"], "")
    )
  },
  tracker: {
    baseUrl: String(
      valueFromEnvOrConfig("TRACKER_BASE_URL", ["tracker", "base_url"], "https://tracker.example/forum")
    ),
    defaultSourceUrl: String(
      valueFromEnvOrConfig("TRACKER_DEFAULT_SOURCE_URL", ["tracker", "default_source_url"], "")
    ),
    popularUrl: String(valueFromEnvOrConfig("TRACKER_POPULAR_URL", ["tracker", "popular_url"], "")),
    textSearchPath: String(
      valueFromEnvOrConfig("TRACKER_TEXT_SEARCH_PATH", ["tracker", "text_search_path"], "tracker.php")
    ),
    username: process.env.TRACKER_USERNAME || "",
    password: process.env.TRACKER_PASSWORD || "",
    directDownloadDir: String(
      valueFromEnvOrConfig("TRACKER_DIRECT_DOWNLOAD_DIR", ["tracker", "direct_download_dir"], "/volume1/Downloads/data")
    ),
    maxReleases: toNumber(
      valueFromEnvOrConfig("TRACKER_MAX_RELEASES", ["tracker", "max_releases"], 80),
      80
    ),
    hardMaxReleases: toNumber(
      valueFromEnvOrConfig("TRACKER_HARD_MAX_RELEASES", ["tracker", "hard_max_releases"], 700),
      700
    ),
    concurrency: toNumber(valueFromEnvOrConfig("TRACKER_CONCURRENCY", ["tracker", "concurrency"], 4), 4),
    requestTimeoutMs: toNumber(
      valueFromEnvOrConfig("TRACKER_REQUEST_TIMEOUT_MS", ["tracker", "request_timeout_ms"], 25000),
      25000
    ),
    userAgent: String(
      valueFromEnvOrConfig("TRACKER_USER_AGENT", ["tracker", "user_agent"], "TrackerViewBot/0.1 (+https://localhost)")
    )
  }
};

module.exports = { config, configPath };
