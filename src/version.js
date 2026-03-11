const path = require("path");
const { execSync } = require("child_process");

const VERSION_PREFIX = "1.1.";
const VERSION_STAMP_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4

function toTwoDigits(value) {
  return String(value).padStart(2, "0");
}

function formatVersionStampFromDate(date) {
  const shifted = new Date(date.getTime() + VERSION_STAMP_OFFSET_MS);
  const year = String(shifted.getUTCFullYear()).slice(-2);
  const month = toTwoDigits(shifted.getUTCMonth() + 1);
  const day = toTwoDigits(shifted.getUTCDate());
  const hour = toTwoDigits(shifted.getUTCHours());
  const minute = toTwoDigits(shifted.getUTCMinutes());
  return `${year}${month}${day}${hour}${minute}`;
}

function readGitHeadTimestamp(repoRoot) {
  try {
    const raw = execSync("git log -1 --format=%ct", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    });
    const parsed = Number.parseInt(String(raw || "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch (error) {
    return null;
  }
}

function normalizeExplicitVersion(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  if (/^1\.1\.\d{10}$/.test(value)) {
    return value;
  }

  if (/^\d{10}$/.test(value)) {
    return `${VERSION_PREFIX}${value}`;
  }

  return "";
}

function resolveAppVersion() {
  const explicit = normalizeExplicitVersion(process.env.APP_VERSION);
  if (explicit) {
    return explicit;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const gitTimestamp = readGitHeadTimestamp(repoRoot);
  if (gitTimestamp) {
    return `${VERSION_PREFIX}${formatVersionStampFromDate(new Date(gitTimestamp * 1000))}`;
  }

  return `${VERSION_PREFIX}${formatVersionStampFromDate(new Date())}`;
}

module.exports = {
  resolveAppVersion
};
