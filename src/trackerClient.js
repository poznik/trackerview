const iconv = require("iconv-lite");
const diagnostics = require("./diagnostics");

class SimpleCookieJar {
  constructor() {
    this.cookies = new Map();
  }

  setFromSetCookieLine(line) {
    if (!line || typeof line !== "string") {
      return;
    }

    const firstPart = line.split(";")[0];
    const separatorIndex = firstPart.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const name = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();

    if (!name) {
      return;
    }

    this.cookies.set(name, value);
  }

  updateFromResponse(response) {
    if (!response || !response.headers) {
      return;
    }

    if (typeof response.headers.getSetCookie === "function") {
      const lines = response.headers.getSetCookie();
      for (const line of lines) {
        this.setFromSetCookieLine(line);
      }
      return;
    }

    const singleLine = response.headers.get("set-cookie");
    if (singleLine) {
      const parts = singleLine.split(/,(?=[^;,\s]+=[^;,]+)/g);
      for (const part of parts) {
        this.setFromSetCookieLine(part);
      }
    }
  }

  toHeader() {
    if (!this.cookies.size) {
      return "";
    }

    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function decodeHtml(buffer, contentType) {
  const headerPart = String(contentType || "").toLowerCase();
  const sample = buffer.toString("latin1", 0, Math.min(buffer.length, 3000)).toLowerCase();
  const isCp1251 =
    headerPart.includes("windows-1251") ||
    headerPart.includes("cp1251") ||
    sample.includes("charset=windows-1251") ||
    sample.includes("charset=cp1251");

  return isCp1251 ? iconv.decode(buffer, "cp1251") : buffer.toString("utf8");
}

class TrackerClient {
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.username = options.username;
    this.password = options.password;
    this.timeoutMs = options.requestTimeoutMs;
    this.userAgent = options.userAgent;
    this.cookieJar = new SimpleCookieJar();
  }

  resolveUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    if (!pathOrUrl.startsWith("/")) {
      return `${this.baseUrl}/${pathOrUrl}`;
    }

    return `${this.baseUrl}${pathOrUrl}`;
  }

  async request(pathOrUrl, options = {}) {
    const requestStartedAt = diagnostics.startTimer();
    let currentUrl = this.resolveUrl(pathOrUrl);
    let method = options.method || "GET";
    let body = options.body;
    let redirectCount = 0;
    if (!body && options.form) {
      body = new URLSearchParams(options.form).toString();
    }

    const baseHeaders = new Headers(options.headers || {});
    if (body && !baseHeaders.has("content-type")) {
      baseHeaders.set("content-type", "application/x-www-form-urlencoded");
    }

    let response = null;

    for (; redirectCount < 8; redirectCount += 1) {
      const headers = new Headers(baseHeaders);
      headers.set("user-agent", this.userAgent);
      headers.set("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
      headers.set("accept-language", "ru-RU,ru;q=0.9,en;q=0.8");

      const cookieHeader = this.cookieJar.toHeader();
      if (cookieHeader) {
        headers.set("cookie", cookieHeader);
      } else {
        headers.delete("cookie");
      }

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        response = await fetch(currentUrl, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
          redirect: "manual",
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutHandle);
      }

      this.cookieJar.updateFromResponse(response);

      const status = response.status;
      const location = response.headers.get("location");
      const isRedirect = [301, 302, 303, 307, 308].includes(status);

      if (!isRedirect || !location) {
        break;
      }

      currentUrl = new URL(location, currentUrl).toString();

      if ([301, 302, 303].includes(status) && method !== "GET" && method !== "HEAD") {
        method = "GET";
        body = undefined;
        baseHeaders.delete("content-type");
      }
    }

    if (!response) {
      throw new Error("No response received from tracker.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    diagnostics.logHttpRequest({
      method,
      url: currentUrl,
      status: response.status,
      ok: response.ok,
      bytes: buffer.length,
      durationMs: diagnostics.elapsedMs(requestStartedAt),
      redirects: redirectCount,
      contentType: response.headers.get("content-type") || "",
      context: options.diagnosticContext || ""
    });

    return {
      url: currentUrl,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type") || "",
      contentDisposition: response.headers.get("content-disposition") || "",
      buffer,
      text: decodeHtml(buffer, response.headers.get("content-type") || "")
    };
  }

  async login() {
    const response = await this.request("/login.php", {
      method: "POST",
      form: {
        login_username: this.username,
        login_password: this.password,
        login: "Вход",
        redirect: "index.php"
      }
    });

    const looksLoggedIn =
      response.text.includes("LOGGED_IN     = 1") ||
      response.text.includes("Вы зашли как") ||
      /logged-in-username[^>]*>[^<]*<\/a>/i.test(response.text);

    if (!looksLoggedIn) {
      throw new Error("Tracker login failed. Check TRACKER_USERNAME/TRACKER_PASSWORD.");
    }
  }
}

module.exports = {
  TrackerClient,
  decodeHtml
};
