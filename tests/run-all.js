// Runs every Node test. The browser tests (tests/browser) need Playwright and are run separately: see tests/README.md.
const { spawnSync } = require("child_process");
const path = require("path");
const suites = ["engine", "hardening", "commands", "catalog", "docs-sync", "model-validator", "training", "learner", "privacy-audit"];
let failed = 0;
for (const name of suites) {
  const file = path.join(__dirname, "unit", name + ".test.js");
  const run = spawnSync("node", [file], { encoding: "utf8" });
  const last = (run.stdout || "").trim().split("\n").slice(-1)[0].slice(0, 80);
  console.log((run.status === 0 ? "PASS " : "FAIL ") + name.padEnd(16) + last);
  if (run.status !== 0) { failed++; console.log((run.stdout || "").split("\n").filter(l => /FAIL/.test(l)).join("\n") + (run.stderr || "")); }
}
process.exit(failed ? 1 : 0);
