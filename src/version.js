const path = require("path");

function normalizeExplicitVersion(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  if (/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    return value;
  }

  return "";
}

function readPackageVersion(repoRoot) {
  try {
    const packageJson = require(path.join(repoRoot, "package.json"));
    return normalizeExplicitVersion(packageJson.version);
  } catch (error) {
    return "";
  }
}

function resolveAppVersion() {
  const explicit = normalizeExplicitVersion(process.env.APP_VERSION);
  if (explicit) {
    return explicit;
  }

  const repoRoot = path.resolve(__dirname, "..");
  return readPackageVersion(repoRoot) || "0.0.0";
}

module.exports = {
  normalizeExplicitVersion,
  resolveAppVersion
};
