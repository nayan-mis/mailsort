const MS = require("../../extension/src/core/engine.js"); require("../../extension/src/core/learner.js"); require("../../extension/src/core/commands.js");
require("../../extension/src/core/catalog.js"); require("../../extension/src/core/normalize.js");
const K = MS.Catalog, N = MS.Normalize;
let bad = 0; const ok = (n, c, x) => { if (!c) bad++; console.log((c ? "ok   " : "FAIL ") + n + (!c && x !== undefined ? "  -> " + (typeof x === "string" ? x : JSON.stringify(x)) : "")); };
const R = (when, then, name) => ({ name: name || "t", when, then });
const bank = R({ all: [{ from: ["bank.example"] }, { subject_has: ["otp"] }] }, [{ do: "notify", mode: "urgent" }, { do: "label", name: "Security/OTP" }], "bank codes");

// ---- validation
let v = K.validate(bank); ok("valid rule accepted, risk safe", v.ok && v.risk === "safe", v);
ok("risk is the highest action risk", K.validate(R({ from: ["a.example"] }, [{ do: "label", name: "X" }, { do: "archive" }])).risk === "confirm" && K.validate(R({ from: ["a.example"] }, [{ do: "trash" }])).risk === "confirm_twice");
for (const [name, bl] of [["forward", "forwarding"], ["auto_reply", "send mail in your name"], ["send_email", "send mail"], ["delete_forever", "cannot be undone"], ["delete", "trash"], ["change_forwarding", "redirect"], ["delegate", "access"], ["unsubscribe", "contacts the sender"]]) {
  v = K.validate(R({ from: ["a.example"] }, [{ do: name }])); ok("blocked: " + name + " explains why", !v.ok && v.errors[0].includes("not allowed") && v.errors[0].includes(bl), v.errors);
}
for (const [name, rule] of [["unknown action", R({ from: ["a.example"] }, [{ do: "launch_missiles" }])], ["unknown condition", R({ colour: ["red"] }, [{ do: "star" }])], ["two keys in one node", R({ from: ["a.example"], to: ["b.example"] }, [{ do: "star" }])],
  ["empty then", R({ from: ["a.example"] }, [])], ["not an array", R({ from: ["a.example"] }, "star")], ["string instead of list", R({ from: [""] }, [{ do: "star" }])],
  ["bad enum", R({ category: "wizards" }, [{ do: "star" }])], ["bad size", R({ size: { op: "larger", mb: -3 } }, [{ do: "star" }])], ["bad age", R({ age: { op: "older_than", n: 2.5, unit: "d" } }, [{ do: "star" }])],
  ["bad notify mode", R({ from: ["a.example"] }, [{ do: "notify", mode: "shout" }])], ["markup label", R({ from: ["a.example"] }, [{ do: "label", name: "<img src=x onerror=alert(1)>" }])],
  ["null rule", null], ["array rule", []], ["too deep", R({ not: { not: { not: { not: { not: { from: ["a.example"] } } } } } }, [{ do: "star" }])],
  ["too many nodes", R({ all: Array.from({ length: 8 }, () => ({ any: Array.from({ length: 4 }, () => ({ from: ["a.example"] })) })) }, [{ do: "star" }])],
  ["50 targets", R({ from: Array.from({ length: 50 }, (_, i) => "a" + i + ".example") }, [{ do: "star" }])], ["200-char word", R({ from: ["x".repeat(200)] }, [{ do: "star" }])],
  ["proto pollution key", JSON.parse('{"when":{"__proto__":["x"]},"then":[{"do":"star"}]}')]]) {
  ok("rejected: " + name, !K.validate(rule).ok);
}
v = K.validate(R({ from: ["  a.example \n"] }, [{ do: "label", name: " Work/Clients " }])); ok("input is cleaned", v.ok && v.rule.when.from[0] === "a.example" && v.rule.then[0].name === "Work/Clients");
ok("validate never returns the caller's object", K.validate(bank).rule !== bank && K.validate(bank).rule.when !== bank.when);

// ---- compile to Gmail search text
const q = (when) => K.toGmailQuery(R(when, [{ do: "star" }]));
ok("from + subject", q({ all: [{ from: ["bank.example", "@pay.example"] }, { subject_has: ["otp", "one time"] }] }) === 'from:(bank.example OR pay.example) subject:(otp OR "one time")', q({ all: [{ from: ["bank.example", "@pay.example"] }, { subject_has: ["otp", "one time"] }] }));
ok("any uses braces", q({ any: [{ from: ["a.example"] }, { subject_has: ["sale"] }] }) === "{from:(a.example) subject:(sale)}");
ok("not", q({ all: [{ from: ["a.example"] }, { not: { has_attachment: true } }] }) === "from:(a.example) -(has:attachment)" || q({ all: [{ from: ["a.example"] }, { not: { has_attachment: true } }] }) === "from:(a.example) -has:attachment", q({ all: [{ from: ["a.example"] }, { not: { has_attachment: true } }] }));
ok("status / category / location / list", q({ all: [{ status: "unread" }, { category: "promotions" }, { location: "inbox" }, { mailing_list: "dev@list.example" }] }) === "is:unread category:promotions in:inbox list:dev@list.example");
ok("size and age", q({ all: [{ size: { op: "larger", mb: 10 } }, { age: { op: "older_than", n: 6, unit: "m" } }] }) === "larger:10M older_than:6m");
ok("text_has / text_lacks / filename / label", q({ all: [{ text_has: ["refund"] }, { text_lacks: ["unsubscribe"] }, { filename: "pdf" }, { label: "Work" }] }) === "(refund) -(unsubscribe) filename:pdf label:Work", q({ all: [{ text_has: ["refund"] }, { text_lacks: ["unsubscribe"] }, { filename: "pdf" }, { label: "Work" }] }));
let threw = false; try { q({ sender_kind: "person" }); } catch (e) { threw = true; } ok("mailsort-only condition cannot be written as a Gmail search", threw);
ok("quotes and injection characters are made harmless", !q({ from: ['a" OR from:(everyone'] }).includes('"a"'), q({ from: ['a" OR from:(everyone'] }));

// ---- compile to the page engine, then really classify mail with it
const page = (rule) => MS.merge(MS.DEFAULTS, { rules: [K.toPageRule(rule)] });
const mail = (from, subj, snip, extra) => MS.build(Object.assign({ from_name: "X", from_addr: from, subject: subj, snippet: snip || "" }, extra || {}));
let s = page(bank), r1 = MS.classify(mail("alerts@bank.example", "Your OTP is 1234"), s), r2 = MS.classify(mail("alerts@other.example", "Your OTP is 1234"), s);
ok("page rule fires for the right mail", r1.category === "Security" && r1.subcategory === "OTP" && r1.notify_final === true && r1.priority === "urgent", r1);
ok("page rule ignores other senders", r2.category !== "Security" || r2.subcategory !== "OTP");
s = page(R({ all: [{ from: ["shop.example"] }, { not: { subject_has: ["order"] } }, { status: "unread" }] }, [{ do: "label", name: "Shop/Offers" }, { do: "notify", mode: "never" }]));
r1 = MS.classify(mail("hi@shop.example", "Big sale", "", { unread: true }), s); r2 = MS.classify(mail("hi@shop.example", "Your order shipped", "", { unread: true }), s); let r3 = MS.classify(mail("hi@shop.example", "Big sale", "", { unread: false }), s);
ok("all + not + unread on the page", r1.category === "Shop" && r1.notify_final === false && r2.category !== "Shop" && r3.category !== "Shop", [r1.category, r2.category, r3.category]);
s = page(R({ all: [{ subject_has: ["alpha"] }, { subject_has: ["beta"] }] }, [{ do: "label", name: "Both" }]));
ok("two conditions of the same kind are ANDed correctly (all_of)", MS.classify(mail("a@x.example", "alpha beta"), s).category === "Both" && MS.classify(mail("a@x.example", "alpha only"), s).category !== "Both");
s = page(R({ from: ["Flipkart", "@amazon.in"] }, [{ do: "label", name: "Shopping" }]));
ok("names and addresses in one from-list", MS.classify(mail("x@amazon.in", "hi"), s).category === "Shopping" && MS.classify(MS.build({ from_name: "Flipkart", from_addr: "o@mail.example", subject: "hi" }), s).category === "Shopping");
s = page(R({ any: [{ text_has: ["refund"] }, { sender_kind: "person" }] }, [{ do: "label", name: "Care" }]));
ok("text_has sees the preview line", MS.classify(mail("a@x.example", "Hello", "your refund is ready"), s).category === "Care");
for (const [nm, rule] of [["age", R({ age: { op: "older_than", n: 1, unit: "y" } }, [{ do: "label", name: "Old" }])], ["star action", R({ from: ["a.example"] }, [{ do: "star" }])], ["to", R({ to: ["me@example.com"] }, [{ do: "label", name: "X" }])]]) {
  let t = false; try { K.toPageRule(rule); } catch (e) { t = true; } ok("page refuses what it cannot do: " + nm, t);
}
for (const rule of [bank, R({ any: [{ from: ["a.example"] }, { not: { has_attachment: true } }] }, [{ do: "label", name: "X" }])]) { const pr = K.toPageRule(R(rule.when || rule, rule.then || [{ do: "label", name: "X" }])); try { MS.validate(MS.merge(MS.DEFAULTS, { rules: [pr] })); ok("compiled page rule passes the engine's own validator", true); } catch (e) { ok("compiled page rule passes the engine's own validator", false, e.message); } }

// ---- where can it run?
const chk = (rule, surf) => K.check(rule, surf);
ok("check: bank rule runs on page and as a filter (urgent is approximate)", chk(bank, "page").ok && chk(bank, "filter").ok && chk(bank, "filter").notes.some(n => n.startsWith("notify")), [chk(bank, "page"), chk(bank, "filter")]);
let old = R({ all: [{ age: { op: "older_than", n: 1, unit: "y" } }, { category: "promotions" }] }, [{ do: "archive" }]);
ok("check: age+category cannot run on the page but can be a filter", !chk(old, "page").ok && chk(old, "filter").ok && chk(old, "api").ok && chk(old, "api").notes.length === 1, [chk(old, "page"), chk(old, "filter")]);
ok("check: star works as a filter, not on the page", chk(R({ from: ["a.example"] }, [{ do: "star" }]), "filter").ok && !chk(R({ from: ["a.example"] }, [{ do: "star" }]), "page").ok);
ok("check: sender_kind is mailsort-only", chk(R({ sender_kind: "person" }, [{ do: "label", name: "P" }]), "page").ok && !chk(R({ sender_kind: "person" }, [{ do: "label", name: "P" }]), "filter").ok);
ok("check: only unread/read are exact on the page", chk(R({ status: "unread" }, [{ do: "label", name: "U" }]), "page").ok && !chk(R({ status: "starred" }, [{ do: "label", name: "U" }]), "page").ok);

// ---- filter file
let f = K.toFilterXml([old, bank, R({ from: ["spam.example"] }, [{ do: "trash" }]), R({ sender_kind: "person" }, [{ do: "label", name: "P" }]), { name: "broken", when: {}, then: [] }]);
ok("filter file keeps what a filter can do and explains the rest", f.count === 2 && f.skipped.length === 3 && /trash is not exported/.test(f.skipped.join()) && /broken/.test(f.skipped.join()), f);
ok("filter file content", f.xml.includes("shouldArchive") && f.xml.includes("hasTheWord") && f.xml.includes("older_than:1y") && f.xml.includes("shouldAlwaysMarkAsImportant"), f.xml);
ok("trash exported only when explicitly allowed", K.toFilterXml([R({ from: ["spam.example"] }, [{ do: "trash" }])], { allowTrash: true }).xml.includes("shouldTrash") && !f.xml.includes("shouldTrash"));
ok("XML special characters are escaped", K.toFilterXml([R({ subject_has: ["a&b <c> 'd'"] }, [{ do: "label", name: "A & B" }])]).xml.includes("a&amp;b &lt;c&gt; &apos;d&apos;") && K.toFilterXml([R({ subject_has: ["x"] }, [{ do: "label", name: "A & B" }])]).xml.includes("A &amp; B"));

// ---- describe
ok("plain-English description", K.describe(bank) === 'When it is from "bank.example" and the subject mentions "otp": notify me urgently, file it under Security/OTP.', K.describe(bank));
ok("describe says why an invalid rule is invalid", /Not a valid rule/.test(K.describe(R({ from: ["a.example"] }, [{ do: "forward" }]))));

// ---- catalog stays in sync with the model prompt
const spec = K.promptSpec();
ok("prompt lists every condition and action", Object.keys(K.CONDITIONS).every(k => spec.includes(k)) && Object.keys(K.ACTIONS).every(k => spec.includes(k)), spec);
ok("prompt lists every blocked action", Object.keys(K.BLOCKED).every(k => spec.includes(k)));
ok("no blocked action is also an allowed action", Object.keys(K.BLOCKED).every(k => !K.ACTIONS[k]));
ok("every condition has examples and a Gmail operator or is mailsort-only", Object.keys(K.CONDITIONS).every(k => K.CONDITIONS[k].examples.length && (K.CONDITIONS[k].gmail || K.CONDITIONS[k].filter === "no")));
ok("exported catalog is valid JSON", !!JSON.parse(K.exportJson()).conditions.from);

// ---- fuzz: whatever the generator makes must validate, compile, and never throw unexpectedly
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; const pick = a => a[Math.floor(rnd() * a.length)];
const W = ["alpha", "beta", "otp", "sale", "bank.example", "@shop.example", "Flipkart", "a@b.example", "two words"];
const rl = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(W));
const pageLeaf = () => pick([{ from: rl() }, { subject_has: rl() }, { text_has: rl() }, { text_lacks: rl() }, { has_attachment: rnd() < 0.5 }, { status: pick(["unread", "read"]) }, { sender_kind: pick(["person", "bulk", "automated"]) }]);
const anyLeaf = () => rnd() < 0.5 ? pageLeaf() : pick([{ to: rl() }, { filename: "pdf" }, { label: "Work" }, { category: pick(K.CONDITIONS.category.values) }, { location: pick(K.CONDITIONS.location.values) }, { mailing_list: "l@list.example" }, { size: { op: "larger", mb: 1 + Math.floor(rnd() * 50) } }, { age: { op: "older_than", n: 1 + Math.floor(rnd() * 30), unit: pick(["d", "m", "y"]) } }]);
const tree = (leafFn, d) => { const x = rnd(); if (d >= 2 || x < 0.55) return leafFn(); if (x < 0.75) return { all: [tree(leafFn, d + 1), tree(leafFn, d + 1)] }; if (x < 0.9) return { any: [tree(leafFn, d + 1), tree(leafFn, d + 1)] }; return { not: tree(leafFn, d + 1) }; };
let fz = { valid: 0, query: 0, page: 0, engine: 0, bad: [] };
for (let i = 0; i < 600; i++) {
  const rule = R(tree(anyLeaf, 0), [{ do: "label", name: "Fuzz/Test" }, { do: pick(["star", "archive", "notify"]) }]);
  if (rule.then[1].do === "notify") rule.then[1].mode = pick(["always", "never", "urgent"]);
  if (!K.validate(rule).ok) { fz.bad.push(["validate", JSON.stringify(rule).slice(0, 120)]); continue; }
  fz.valid++;
  try { const t = K.toGmailQuery(rule); if (typeof t === "string" && t.length) fz.query++; else fz.bad.push(["query-empty", JSON.stringify(rule.when)]); } catch (e) { if (!/cannot express/.test(e.message)) fz.bad.push(["query", e.message]); else fz.query++; }
  const pr = K.check(rule, "page");
  if (pr.ok) { try { const pg = K.toPageRule(rule); fz.page++; MS.validate(MS.merge(MS.DEFAULTS, { rules: [pg] })); MS.classify(mail("x@shop.example", "alpha sale", "beta"), MS.merge(MS.DEFAULTS, { rules: [pg] })); fz.engine++; } catch (e) { fz.bad.push(["page", e.message + " " + JSON.stringify(rule.when).slice(0, 100)]); } }
}
ok("fuzz: 600 random rules, all valid, all compile or are explained (" + JSON.stringify({ valid: fz.valid, query: fz.query, page: fz.page, engine: fz.engine }) + ")", fz.bad.length === 0 && fz.valid === 600, fz.bad.slice(0, 3));
// compiled page rules must agree with direct evaluation of the tree on random mail
const evalTree = (n, m) => { const k = Object.keys(n)[0], v = n[k]; const lw = x => x.toLowerCase();
  if (k === "all") return v.every(c => evalTree(c, m)); if (k === "any") return v.some(c => evalTree(c, m)); if (k === "not") return !evalTree(v, m);
  const subj = lw(m.subject), body = lw(m.body || "");
  const has = (txt, w) => new RegExp("(?<![a-z0-9])" + lw(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(txt);
  if (k === "subject_has") return v.some(w => has(subj, w)); if (k === "text_has") return v.some(w => has(subj, w) || has(body, w)); if (k === "text_lacks") return !v.some(w => has(subj, w) || has(body, w));
  if (k === "has_attachment") return m.has_attachment === v; if (k === "status") return m.unread === (v === "unread"); if (k === "sender_kind") return m.kind === v;
  if (k === "from") return v.some(w => (/[@.]/.test(w) ? MS.matchAddr(w, m.from_addr) : (m.from_name || "").toLowerCase().split(/[^a-z0-9]+/).some(t => t.startsWith(lw(w)))) );
  throw new Error("no evaluator for " + k); };
let agree = 0, total = 0, disagreements = [];
const SUBJ = ["alpha sale", "beta", "otp now", "hello", "two words here", "sale beta alpha"], FR = [["Flipkart", "o@mail.example"], ["Bob", "bob@shop.example"], ["Bank", "x@bank.example"], ["Al", "a@b.example"]];
for (let i = 0; i < 400; i++) {
  const w = tree(pageLeaf, 0), rule = R(w, [{ do: "label", name: "Fuzz/Hit" }]);
  if (!K.check(rule, "page").ok) continue;
  const pr = K.toPageRule(rule), S2 = MS.merge(MS.DEFAULTS, { rules: [pr], use_builtin_rules: false });
  for (let j = 0; j < 4; j++) {
    const fr = pick(FR), raw = { from_name: fr[0], from_addr: fr[1], subject: pick(SUBJ), snippet: pick(["", "alpha", "refund beta"]), has_attachment: rnd() < 0.5, unread: rnd() < 0.5 };
    const m = MS.build(raw), got = MS.classify(m, S2).category === "Fuzz", want = evalTree(K.validate(rule).rule.when, m);
    total++; if (got === want) agree++; else if (disagreements.length < 3) disagreements.push({ when: JSON.stringify(w), raw, got, want });
  }
}
ok("compiled page rules behave exactly like the rule tree on " + total + " random mails", agree === total && total > 800, disagreements);

// ---- normalizer
ok("accents folded: café RÉSUMÉ naïve", N.text("Café RÉSUMÉ naïve") === "cafe resume naive");
ok("Hindi vowel signs are NOT stripped", N.text("ओटीपी भेजें") === "ओटीपी भेजें" && N.fold("आपका ऑर्डर") === "आपका ऑर्डर");
ok("mixed Hindi + accented Latin", N.text("  Mute  LINKEDIN  और  café ") === "mute linkedin और cafe");
ok("invisible characters and odd quotes", N.text("mu\u200bte \u201clinkedin\u201d\u2014now") === 'mute "linkedin"-now');
ok("idempotent", ["Café ओटीपी", "  X  y  ", "\u200b\u200c"].every(x => N.text(N.text(x)) === N.text(x)));
ok("never throws on odd input", [null, undefined, 42, "\u0000\u0001", "🙂"].every(x => typeof N.text(x) === "string"));
process.exit(bad ? 1 : 0);
