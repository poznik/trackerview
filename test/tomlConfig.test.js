const assert = require("node:assert/strict");
const test = require("node:test");

const { parseTomlConfig } = require("../src/tomlConfig");

test("parseTomlConfig parses app and tracker sections", () => {
  const parsed = parseTomlConfig(`
    [app]
    port = 3000
    update_script_path = ""

    [tracker]
    base_url = "https://tracker.example/forum"
    popular_url = ""
    direct_download_dir = "/volume1/Downloads/data"
    max_releases = 80
    request_timeout_ms = 25000
  `);

  assert.equal(parsed.app.port, 3000);
  assert.equal(parsed.app.update_script_path, "");
  assert.equal(parsed.tracker.base_url, "https://tracker.example/forum");
  assert.equal(parsed.tracker.direct_download_dir, "/volume1/Downloads/data");
  assert.equal(parsed.tracker.max_releases, 80);
  assert.equal(parsed.tracker.request_timeout_ms, 25000);
});

test("parseTomlConfig keeps hash characters inside quoted strings", () => {
  const parsed = parseTomlConfig(`
    [tracker]
    user_agent = "TrackerViewBot/0.1 (+https://localhost#dev)" # comment
  `);

  assert.equal(parsed.tracker.user_agent, "TrackerViewBot/0.1 (+https://localhost#dev)");
});

test("parseTomlConfig accepts bare string values for NAS-edited configs", () => {
  const parsed = parseTomlConfig(`
    [tracker]
    popular_url = https://tracker.example/forum/viewforum.php?f=popular
    direct_download_dir = /volume1/Downloads/data
  `);

  assert.equal(parsed.tracker.popular_url, "https://tracker.example/forum/viewforum.php?f=popular");
  assert.equal(parsed.tracker.direct_download_dir, "/volume1/Downloads/data");
});
