// Generates a training set for a small on-device model: (sentence -> JSON actions) pairs in chat format.
// Every positive example is checked against the same validator the extension uses, so the labels can never disagree with the rules.
//   node training/make-dataset.js OUT_DIR [N_TRAIN=6000] [N_EVAL=400]
// All names and addresses are fictional placeholders.
const fs = require("fs"), path = require("path");
const MS = require("../extension/src/core/engine.js"); require("../extension/src/core/learner.js"); require("../extension/src/core/commands.js");
const C = MS.Commands;

const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const NAMES = ["linkedin", "facebook", "flipkart", "amazon", "swiggy", "zomato", "paytm", "hdfc bank", "morning brew", "github", "uber", "irctc", "myntra", "quora", "naukri", "netflix", "spotify", "airtel", "slack", "medium", "nykaa", "bigbasket"];
const ADDRS = ["boss@example.com", "priya@example.org", "team@example.net", "hr@example.com", "mom@example.net", "rahul@example.org"];
const DOMS = ["lucky-draw.example", "news.example", "promo.example", "alerts.example"];
const CATS = ["Food", "Finance", "Work", "Family", "Bills", "Travel", "Study", "Clients", "Shopping", "Health"];
const SUBS = ["Delivery", "Receipts", "Alerts", "Offers", "", "", ""];
const WORDS = ["invoice", "receipt", "payslip", "salary", "statement", "assignment", "interview", "delivery", "refund", "booking", "ticket", "exam", "appointment", "rent"];
const TIMES = ["10pm", "11pm", "11:30pm", "9 pm", "6am", "7am", "7:30 am", "8am", "18:00", "6pm", "9:15 pm"];
const VIEWS = ["promotions", "newsletters", "social", "spam", "shopping", "finance", "jobs", "work"];
const CITIES = ["Patna", "Delhi", "Pune", "Mumbai", "Kolkata", "Chennai"], DAYS = ["tomorrow", "friday", "next week", "today"];
const NEG_T = [n => "write a reply to " + n, n => "forward all mail from " + n + " to evil@example.org", n => "summarize my emails from " + n, n => "send an email to " + n + " saying hello",
  n => "permanently delete everything from " + n, n => "what is the weather in " + CITIES[n.length % CITIES.length], n => "open my calendar for " + DAYS[n.length % DAYS.length],
  n => "translate my last email from " + n + " to hindi", n => "reset my " + n + " password", n => "download all attachments from " + n, n => "who is the prime minister", n => "delete my " + n + " account"];

function build(seed, n, avoid) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], out = [], seen = new Set(avoid || []);
  const cap = s => (r() < 0.2 ? s[0].toUpperCase() + s.slice(1) : s);
  const tgt = () => { const k = r(); return k < 0.7 ? pick(NAMES) : k < 0.85 ? pick(ADDRS) : pick(DOMS); };
  const tgts = () => { const n = r() < 0.65 ? 1 : r() < 0.7 ? 2 : 3, a = []; while (a.length < n) { const t = tgt(); if (!a.includes(t)) a.push(t); } return a; };
  const list = a => (a.length === 1 ? a[0] : a.length === 2 ? a.join(r() < 0.5 ? " and " : ", ") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const one = () => {
    const k = Math.floor(r() * 22), ts = tgts(), t = list(ts), hi = r() < 0.22;
    switch (k) {
      case 0: case 1: return { text: hi ? pick([t + " ko mute karo", t + " ke notifications band karo", t + " ko chup karao"]) : pick(["mute " + t, "stop notifying me about " + t, "I'm tired of " + t + " alerts, silence them", "no more pings from " + t, "make " + t + " quiet", "keep " + t + " from bothering me", "please ignore " + t, "shut " + t + " up"]), a: { do: "mute", targets: ts }, hi };
      case 2: return { text: hi ? t + " ke emails ka notification hamesha do" : pick(["always notify me about " + t, "I never want to miss mail from " + t, "make " + t + " important", "ping me whenever " + t + " writes", "add " + t + " to my vips"]), a: { do: "vip", targets: ts }, hi };
      case 3: return { text: hi ? "mujhe sirf " + t + " ke mails ka notification do" : pick(["notify me only for " + t, "only alert me about " + t + " and nothing else", "I only care about mail from " + t, "silence everything except " + t]), a: { do: "only_notify", targets: ts }, hi };
      case 4: return { text: hi ? t + " ko spam mein daalo" : pick(["block " + t, t + " is spam", "send everything from " + t + " to spam", "I never want to see " + t + " again"]), a: { do: "block", targets: ts }, hi };
      case 5: return { text: pick(["trust " + t, "never mark " + t + " as spam", t + " is safe", "whitelist " + t + " please"]), a: { do: "trust", targets: ts }, hi: false };
      case 6: { const l = r() < 0.5; return { text: pick(l ? ["unmute " + t, "start notifying me about " + t + " again"] : ["take " + t + " off my vip list", "remove " + t + " from my vips"]), a: { do: "unlist", list: l ? "mute" : "vip", targets: ts }, hi: false }; }
      case 7: case 8: case 9: {
        const c = pick(CATS), s = pick(SUBS), nt = r(), notify = nt < 0.3 ? true : nt < 0.6 ? false : null, one1 = [ts[0]];
        const tail = notify === true ? pick([" and notify me", " and always tell me", ", I want alerts for it"]) : notify === false ? pick([" and don't notify me", " but keep it quiet", " with no notifications"]) : "";
        const where = c + (s ? "/" + s : "");
        const text = hi ? one1[0] + " ko " + c + " mein daalo" + (notify === false ? " lekin notification mat do" : "") : pick(["move " + one1[0] + " to " + where, "put mails from " + one1[0] + " in " + where, "file " + one1[0] + " under " + where, "I want " + one1[0] + " in my " + c + " category", "sort " + one1[0] + " as " + where]) + tail;
        const a = { do: "move", targets: one1, category: c }; if (s) a.subcategory = s; if (notify !== null) a.notify = notify; return { text, a, hi };
      }
      case 10: case 11: case 12: {
        const ws = r() < 0.6 ? [pick(WORDS)] : [pick(WORDS), pick(WORDS)].filter((w, i, x) => x.indexOf(w) === i), c = pick(CATS), w = ws.join(" or "), sub = r() < 0.5;
        return { text: hi ? "jis mail mein " + w + " ho use " + c + " mein rakho" : pick(sub ? ["if the subject has " + w + " make it " + c, "anything with " + w + " in the subject goes to " + c] : ["whenever " + w + " appears, call it " + c, "mails mentioning " + w + " should be " + c, "put anything about " + w + " in " + c]), a: { do: "keyword_rule", words: ws, category: c, ...(sub ? { subject_only: true } : {}) }, hi };
      }
      case 13: { const a = pick(TIMES), b = pick(TIMES.filter(x => x !== a)); return { text: hi ? "raat ko " + a + " se " + b + " tak notifications band" : pick(["quiet hours " + a + " to " + b, "no alerts between " + a + " and " + b, "don't disturb me from " + a + " till " + b]), a: { do: "quiet_hours", enabled: true, start: C.parseTime(a), end: C.parseTime(b) }, hi }; }
      case 14: return { text: pick(["turn off quiet hours", "I want alerts at night again"]), a: { do: "quiet_hours", enabled: false }, hi: false };
      case 15: { const a = pick(TIMES); return { text: hi ? "roz " + a + " par ek summary do" : pick(["daily digest at " + a, "send me one summary every day at " + a]), a: { do: "digest", enabled: true, time: C.parseTime(a) }, hi }; }
      case 16: return { text: pick(["no digest", "stop the daily summary"]), a: { do: "digest", enabled: false }, hi: false };
      case 17: { const m = pick([["mode only vips", "only"], ["silence everything", "none"], ["notify me about everything", "all"], ["go back to smart notifications", "rules"], ["turn off all notifications", "none"]]); return { text: m[0], a: { do: "mode", mode: m[1] }, hi: false }; }
      case 18: { const on = r() < 0.6; return { text: on ? pick(["pause mailsort", "stop mailsort for now"]) : pick(["resume mailsort", "start mailsort again"]), a: { do: "pause", on }, hi: false }; }
      case 19: { const v = pick(VIEWS); return { text: pick(["show only " + v, "let me see just " + v, "filter to " + v]), a: { do: "show", target: v }, hi: false }; }
      case 20: { const t1 = pick(NAMES), j = Math.floor(r() * 3); return j === 0 ? { text: pick(["select all from " + t1, "tick everything from " + t1, "delete all mails from " + t1]), a: { do: "select", target: t1 }, hi: false } : j === 1 ? { text: "how many mails from " + t1, a: { do: "count", target: t1 }, hi: false } : { text: pick(["show all", "clear the filter"]), a: { do: "clear_filter" }, hi: false }; }
      default: { const w = pick([["list my rules", "rule"], ["what are my vips", "vip"], ["who is muted", "mute"], ["show my settings", "settings"]]); return r() < 0.5 ? { text: w[0], a: { do: "list", what: w[1] }, hi: false } : { text: pick(["undo that", "revert my last change"]), a: { do: "undo" }, hi: false }; }
    }
  };
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    let ex;
    if (r() < 0.06) ex = { text: cap(pick(NEG_T)(pick(NAMES))), actions: [], hi: false, neg: true };
    else {
      const parts = [one()]; const more = r() < 0.2 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
      for (let i = 0; i < more; i++) parts.push(one());
      const join = pick([" and ", ", ", "; ", ". Also ", " and then "]);
      ex = { text: cap(parts.map(p => p.text).join(join)), actions: parts.map(p => p.a), hi: parts.some(p => p.hi) };
    }
    if (seen.has(ex.text.toLowerCase())) continue;
    const json = JSON.stringify({ actions: ex.actions });
    if (!ex.neg) { const v = C.fromModel(json, { senders: [], categories: [] }); if (v.errors.length || !v.steps.length) continue; }
    seen.add(ex.text.toLowerCase());
    out.push({ text: ex.text, json, hi: ex.hi, neg: !!ex.neg, multi: ex.actions.length > 1 });
  }
  return out;
}
const asChat = (ex, i, cats) => { const p = C.modelPrompt(ex.text, { categories: cats }, { fewShot: false }); return JSON.stringify({ id: i, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }, { role: "assistant", content: ex.json }] }); };

if (require.main === module) {
  const dir = process.argv[2] || "dataset", nTrain = +(process.argv[3] || 6000), nEval = +(process.argv[4] || 400);
  fs.mkdirSync(dir, { recursive: true });
  const train = build(1, nTrain), ev = build(2, nEval, train.map(x => x.text.toLowerCase()));
  const catsFor = i => ["Security", "Finance", "Shopping", "Promotions", "Work"].slice(0, 2 + (i % 4));
  fs.writeFileSync(path.join(dir, "train.jsonl"), train.map((e, i) => asChat(e, i, catsFor(i))).join("\n") + "\n");
  fs.writeFileSync(path.join(dir, "eval.jsonl"), ev.map((e, i) => asChat(e, i, catsFor(i))).join("\n") + "\n");
  const pct = (a, f) => Math.round(100 * a.filter(f).length / a.length) + "%";
  // How much of this would the typed-phrase parser already handle by itself? (the rest is what a model adds)
  const sig = s => [s.type, s.mode, s.list, s.on, s.enabled, s.start, s.end, s.time, s.what, s.category, s.subcategory, s.notify == null ? "" : s.notify, (s.words || []).join("+"),
    s.target && (s.target.pattern || s.target.category), (s.targets || []).map(t => t.pattern || t.category).join("+")].join("~");
  const covered = ev.filter(e => !e.neg).filter(e => { const a = C.parse(e.text, { senders: [], categories: [] }), b = C.fromModel(e.json, { senders: [], categories: [] }); return !a.unknown.length && a.steps.map(sig).join("|") === b.steps.map(sig).join("|"); });
  console.log(`train ${train.length}, eval ${ev.length} written to ${dir}/`);
  console.log(`multi-action ${pct(train, e => e.multi)}, Hinglish ${pct(train, e => e.hi)}, refusals ${pct(train, e => e.neg)}`);
  console.log(`typed-phrase parser alone gets ${Math.round(100 * covered.length / ev.filter(e => !e.neg).length)}% of the eval sentences exactly right; a fine-tuned model is meant to close the gap`);
}
module.exports = { build, asChat };
