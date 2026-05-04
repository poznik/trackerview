const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeReleaseGroupTitle } = require("../public/releaseGrouping");

test("normalizeReleaseGroupTitle collapses variants with different source blocks and metadata tags", () => {
  const highQualityTitle =
    "[StudioOne.com / StudioTwo.com / Long Studio Name] Performer Name (Alias One, Alias Two) - Shared Release Name CODE046 4K [2021-12-18, tag one, tag two, 2160p, HDRip]";
  const lowerQualityTitle =
    "[StudioOne.com / StudioTwo.com / LSN] Performer Name (Alias One, Alias Two) - Shared Release Name CODE046 [18-12-2021, Russian, Tag One, 1080p]";

  assert.equal(normalizeReleaseGroupTitle(highQualityTitle), normalizeReleaseGroupTitle(lowerQualityTitle));
  assert.equal(
    normalizeReleaseGroupTitle(highQualityTitle),
    "performer name alias one alias two shared release name code046"
  );
});
