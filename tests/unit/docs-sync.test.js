const fs = require("fs"), path = require("path");
const { build } = require("../../scripts/export-catalog.js");
const o = build(), d = p => fs.readFileSync(path.join(__dirname, "..", "..", "docs", p), "utf8");
let bad = 0; const ok = (n, c) => { if (!c) bad++; console.log((c ? "ok   " : "FAIL ") + n); };
ok("docs/capabilities.json matches the catalog (run: node scripts/export-catalog.js)", d("capabilities.json") === o.json);
ok("docs/catalog.md matches the catalog (run: node scripts/export-catalog.js)", d("catalog.md") === o.md);
process.exit(bad ? 1 : 0);
