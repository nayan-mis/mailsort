/* mailsort normalize: the first, code-only step that cleans up what a person typed or said before any model sees it.
 * It folds Latin accents (café -> cafe), removes invisible characters, straightens quotes and collapses spacing.
 * Hindi and other scripts are left exactly as they are: their vowel signs are "combining marks" too, so only Latin letters are touched. */
(function (root) {
  "use strict";
  const MS = root.MS, N = {};
  const LATIN_ACCENTED = /[\u00C0-\u024F\u1E00-\u1EFF]+/g;
  N.fold = function (s) {
    return String(s).replace(LATIN_ACCENTED, run => run.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").normalize("NFC"));
  };
  N.text = function (s) {
    return N.fold(String(s == null ? "" : s))
      .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
      .replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-")
      .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  };
  MS.Normalize = N;
  if (typeof module !== "undefined" && module.exports) module.exports = MS;
})(typeof globalThis !== "undefined" ? globalThis : self);
