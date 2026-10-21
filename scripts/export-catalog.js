// Writes docs/capabilities.json and docs/catalog.md from extension/catalog.js, so the documentation can never disagree with the code.
//   node scripts/export-catalog.js          (tests/docs-sync.test.js fails if you forget to run this after changing the catalog)
const fs = require("fs"), path = require("path");
const MS = require("../extension/src/core/engine.js"); require("../extension/src/core/catalog.js");
const K = MS.Catalog;
function build() {
  const json = K.exportJson() + "\n";
  const lvl = (x, f) => ({ exact: "yes", approx: "partly", partial: "partly", no: "no", yes: "yes" }[x] || x);
  const L = ["# What a mailsort rule can match and do", "", "Generated from `extension/catalog.js`. A rule says WHEN conditions hold, THEN do actions. Models only translate a person's sentence into this format; code checks and runs it.", "",
    "## Conditions (WHEN)", "", "| Condition | Meaning | Gmail search | On the Gmail page | As a Gmail filter | Example sentence |", "|---|---|---|---|---|---|"];
  Object.keys(K.CONDITIONS).forEach(k => { const c = K.CONDITIONS[k]; L.push(`| \`${k}\` | ${c.help} | ${c.gmail ? "`" + c.gmail + "`" : "none (mailsort only)"} | ${lvl(c.page)} | ${lvl(c.filter)} | "${c.examples[0]}" |`); });
  L.push("", "Combine conditions with `all` (and), `any` (or) and `not`. Gmail itself has no operator that searches only the body of a message.", "", "## Actions (THEN)", "", "| Action | Meaning | Risk | On the Gmail page | As a Gmail filter |", "|---|---|---|---|---|");
  Object.keys(K.ACTIONS).forEach(k => { const a = K.ACTIONS[k]; L.push(`| \`${k}\` | ${a.help} | ${a.risk} | ${lvl(a.page)} | ${lvl(a.filter)} |`); });
  L.push("", "Risk: **safe** = applied with an Undo, **confirm** = shows how many emails it affects first, **confirm_twice** = asks twice, moves to Trash only, never permanent.", "", "## Never allowed", "", "| Request | Why |", "|---|---|");
  Object.keys(K.BLOCKED).forEach(k => L.push(`| \`${k}\` | ${K.BLOCKED[k]} |`));
  return { json, md: L.join("\n") + "\n" };
}
module.exports = { build };
if (require.main === module) { const o = build(); fs.writeFileSync(path.join(__dirname, "..", "docs", "capabilities.json"), o.json); fs.writeFileSync(path.join(__dirname, "..", "docs", "catalog.md"), o.md); console.log("wrote docs/capabilities.json and docs/catalog.md"); }
