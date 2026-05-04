const fs = require("fs");

function stripInlineComment(line) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inDoubleQuote && char === "\\") {
      escaped = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "#") {
      return line.slice(0, index);
    }
  }

  return line;
}

function parseQuotedString(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value);
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return null;
}

function parseTomlValue(rawValue, lineNumber) {
  const value = rawValue.trim();
  const quoted = parseQuotedString(value);
  if (quoted !== null) {
    return quoted;
  }

  if (/^(?:true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }

  if (/^[+-]?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  if (/^[+-]?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }

  if (value) {
    return value;
  }

  throw new Error(`Unsupported TOML value at line ${lineNumber}. Use strings, numbers, booleans, or bare strings.`);
}

function parseTomlConfig(rawText) {
  const root = {};
  let currentSection = root;

  const lines = String(rawText || "").split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripInlineComment(lines[index]).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/u);
    if (sectionMatch) {
      currentSection = root;
      for (const part of sectionMatch[1].split(".")) {
        if (!Object.prototype.hasOwnProperty.call(currentSection, part)) {
          currentSection[part] = {};
        }
        if (!currentSection[part] || typeof currentSection[part] !== "object") {
          throw new Error(`TOML section conflict at line ${lineNumber}.`);
        }
        currentSection = currentSection[part];
      }
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*([\s\S]+)$/u);
    if (!keyValueMatch) {
      throw new Error(`Invalid TOML syntax at line ${lineNumber}.`);
    }

    currentSection[keyValueMatch[1]] = parseTomlValue(keyValueMatch[2], lineNumber);
  }

  return root;
}

function loadTomlConfig(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  return parseTomlConfig(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
  loadTomlConfig,
  parseTomlConfig
};
