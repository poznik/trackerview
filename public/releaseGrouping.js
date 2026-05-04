(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TrackerViewReleaseGrouping = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/&/g, " and ")
      .replace(/[()[\]{}]/g, " ")
      .replace(/[,:;|/\\]+/g, " ")
      .replace(/[._]+/g, " ")
      .replace(/[-–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function removeQualityTokensFromTitle(title) {
    return String(title || "")
      .replace(/(?:^|[^0-9a-zа-я])(?:4320|2880|2160|1800|1600|1440|1200|1080|1024|960|900|720|576|540)\s*[pр]\b/giu, " ")
      .replace(/(?:^|[^0-9a-zа-я])\d(?:[.,]\d+)?\s*[kк]\b/giu, " ")
      .replace(/\b(?:uhd|ultra\s*hd|qhd|fhd|full\s*hd|hd)\b/giu, " ")
      .replace(/\b\d{3,4}\s*[xх×]\s*\d{3,4}\b/giu, " ");
  }

  function removeDateTokensFromTitle(title) {
    return String(title || "")
      .replace(/\b(?:19|20)\d{2}[-./](?:0?[1-9]|1[0-2])[-./](?:0?[1-9]|[12]\d|3[01])\b/gu, " ")
      .replace(/\b(?:0?[1-9]|[12]\d|3[01])[-./](?:0?[1-9]|1[0-2])[-./](?:19|20)?\d{2}\b/gu, " ")
      .replace(/\b(?:19|20)\d{2}\s*(?:г\.?|year)?\b/giu, " ");
  }

  function removeVideoSourceTokensFromTitle(title) {
    return String(title || "")
      .replace(/\b(?:hdrip|web[\s.-]*dl|webrip|bdrip|bluray|blu[\s.-]*ray|dvdrip|hdtv|remux)\b/giu, " ")
      .replace(/\b(?:x264|x265|h\.?264|h\.?265|hevc|avc|hdr|sdr)\b/giu, " ");
  }

  function removeLeadingSourceBlock(title) {
    return String(title || "").replace(/^\s*\[[^\]]{2,240}\]\s*/u, " ");
  }

  function removeSquareBracketMetadata(title) {
    return String(title || "").replace(/\[[^\]]{2,320}\]/gu, " ");
  }

  function normalizeReleaseGroupTitle(title) {
    const sourceAgnosticTitle = removeLeadingSourceBlock(title);
    const withoutMetadata = removeSquareBracketMetadata(sourceAgnosticTitle);
    const withoutQuality = removeQualityTokensFromTitle(withoutMetadata);
    const withoutDates = removeDateTokensFromTitle(withoutQuality);
    const withoutVideoSource = removeVideoSourceTokensFromTitle(withoutDates);
    return normalizeText(withoutVideoSource);
  }

  return {
    normalizeReleaseGroupTitle,
    removeQualityTokensFromTitle
  };
});
