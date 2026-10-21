// Scores a model's answers on the eval set.   node training/eval-predictions.js dataset/eval.jsonl predictions.jsonl
// predictions.jsonl: one line per example, {"id": <id from eval.jsonl>, "output": "<the model's raw text>"}
const fs = require("fs");
const MS = require("../extension/src/core/engine.js"); require("../extension/src/core/learner.js"); require("../extension/src/core/commands.js");
const C = MS.Commands, ctx = { senders: [], categories: [] };
const lines = f => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
function score(gold, preds) {
  const byId = new Map(preds.map(p => [p.id, p.output]));
  let valid = 0, exact = 0, safe = 0, n = 0;
  gold.forEach(g => {
    n++;
    const want = g.messages[2].content, out = byId.get(g.id);
    const a = C.fromModel(want, ctx), b = C.fromModel(out || "", ctx);
    const sig = r => JSON.stringify(r.steps.map(s => [s.type, s.mode, s.list, s.on, s.enabled, s.start, s.end, s.time, s.what, s.category, s.subcategory, s.notify, s.words, s.target && (s.target.pattern || s.target.category), (s.targets || []).map(t => t.pattern || t.category)]));
    const wantEmpty = JSON.parse(want).actions.length === 0;
    if (b.steps.length || (wantEmpty && out && /"actions"\s*:\s*\[\s*\]/.test(out))) valid++;
    if (wantEmpty ? !b.steps.length : sig(a) === sig(b)) exact++;
    if (!b.steps.length || b.errors.length === 0) safe++;      // anything the validator rejects never reaches the user as an action
  });
  return { n, valid: valid / n, exact: exact / n };
}
if (require.main === module) { const r = score(lines(process.argv[2]), lines(process.argv[3])); console.log(`${r.n} examples: ${(100 * r.valid).toFixed(1)}% parsable, ${(100 * r.exact).toFixed(1)}% exactly right`); }
module.exports = { score };
