const MS = require("../../extension/src/core/engine.js"); require("../../extension/src/core/learner.js"); require("../../extension/src/core/commands.js");
const C = MS.Commands;
let bad = 0; const ok = (name, cond, extra) => { if (!cond) bad++; console.log((cond ? "ok   " : "FAIL ") + name + (!cond && extra ? "  -> " + extra : "")); };
const ctx = { categories: ["Food"], senders: [
  { addr: "offers@flipkart.com", source: "Flipkart", org: "flipkart", domain: "flipkart.com", category: "Promotions" },
  { addr: "invitations@linkedin.com", source: "LinkedIn", org: "linkedin", domain: "linkedin.com", category: "Social" },
  { addr: "no-reply@swiggy.in", source: "Swiggy", org: "swiggy", domain: "swiggy.in", category: "Automated" },
  { addr: "orders@amazon.in", source: "Amazon.in", org: "amazon", domain: "amazon.in", category: "Shopping" },
  { addr: "no-reply@aws.amazon.com", source: "Amazon Web Services", org: "amazon", domain: "aws.amazon.com", category: "Developer" },
  { addr: "rahul@example.com", source: "Rahul Sharma", org: "example", domain: "example.com", category: "Personal" },
  { addr: "crew@morningbrew.com", source: "Morning Brew", org: "morningbrew", domain: "morningbrew.com", category: "Subscriptions" } ] };
const run = (text, start) => {
  const s = MS.merge(MS.DEFAULTS, start || {}); const r = C.parse(text, ctx); const msgs = [];
  r.steps.filter(C.isSettingsStep).forEach(st => { try { msgs.push(C.apply(st, s)); } catch (e) { msgs.push("ERR " + e.message); } });
  MS.validate(s); return { s, r, msgs };
};
let o;
o = run("Notify me only for boss@example.com and priya@example.org");
ok("only-for: mode and VIPs", o.s.notifications.mode === "only" && o.s.notifications.only_senders.join() === "boss@example.com,priya@example.org", JSON.stringify(o.s.notifications));
o = run("mute linkedin, facebook and quora");
ok("mute three (name on page -> domain; unknown -> wildcard)", o.s.notifications.mute_senders.join() === "@linkedin.com,*facebook*,*quora*", o.s.notifications.mute_senders.join());
ok("wildcard note mentions it was not seen", o.msgs.join(" ").includes("did not see"));
o = run("mute promotions");
ok("mute a category", o.s.notifications.mute_categories.includes("Promotions") && !o.s.notifications.notify_categories.includes("Promotions"));
o = run("notify me about promotions");
ok("notify for a category removes it from muted", o.s.notifications.notify_categories.includes("Promotions") && !o.s.notifications.mute_categories.includes("Promotions"));
o = run("Move swiggy to Food/Delivery and don't notify me");
ok("override with subcategory and quiet", o.s.senders["@swiggy.in"] && o.s.senders["@swiggy.in"].category === "Food" && o.s.senders["@swiggy.in"].subcategory === "Delivery" && o.s.senders["@swiggy.in"].notify === false, JSON.stringify(o.s.senders));
o = run("put flipkart in promotions and notify me");
ok("override: notify true, known category name", o.s.senders["@flipkart.com"].category === "Promotions" && o.s.senders["@flipkart.com"].notify === true);
o = run("if the subject contains invoice, make it Finance and tag it bills");
ok("keyword rule (subject only) with tag", o.s.rules.length === 1 && JSON.stringify(o.s.rules[0].when) === '{"subject_any":["invoice"]}' && o.s.rules[0].category === "Finance" && o.s.rules[0].tags[0] === "bills", JSON.stringify(o.s.rules));
o = run("move all emails with salary or payslip to Finance");
ok("keyword rule without 'subject' covers the preview too", o.s.rules.length === 1 && o.s.rules[0].when.any_of && o.s.rules[0].when.any_of[0].subject_any.join() === "salary,payslip", JSON.stringify(o.s.rules));
const rule = o.s.rules[0]; const cl = MS.classify(MS.build({ from_name: "HR", from_addr: "hr@company.example", subject: "Your payslip for September", snippet: "" }), o.s);
ok("the created rule really classifies mail", cl.category === "Finance", cl.category);
o = run("Block lucky-draw.example, trust rahul@example.com");
ok("two clauses: block + trust", o.s.spam.blocked_senders.join() === "@lucky-draw.example" && o.s.spam.trusted_senders.join() === "rahul@example.com", JSON.stringify(o.s.spam));
o = run("Quiet hours 10pm to 7am; daily digest at 6pm");
ok("quiet hours + digest", o.s.notifications.quiet.enabled && o.s.notifications.quiet.start === "22:00" && o.s.notifications.quiet.end === "07:00" && o.s.notifications.digest.enabled && o.s.notifications.digest.time === "18:00", JSON.stringify(o.s.notifications.quiet));
o = run("don't notify me between 11pm and 6:30 am"); ok("natural quiet hours phrasing", o.s.notifications.quiet.start === "23:00" && o.s.notifications.quiet.end === "06:30");
o = run("turn off notifications"); ok("silence", o.s.notifications.mode === "none");
o = run("mode only vips"); ok("mode only vips", o.s.notifications.mode === "only");
o = run("pause mailsort"); ok("pause", o.s.paused === true);
o = run("make boss@example.com a vip, mute linkedin and block spam.example");
ok("three different actions in one sentence", o.r.steps.length === 3 && o.s.notifications.only_senders.includes("boss@example.com") && o.s.notifications.mute_senders.includes("@linkedin.com") && o.s.spam.blocked_senders.includes("@spam.example"), o.r.steps.map(x => x.type).join());
o = run("unmute linkedin", { notifications: { mute_senders: ["@linkedin.com"] } }); ok("unmute", o.s.notifications.mute_senders.length === 0);
o = run("remove rahul@example.com from my vips", { notifications: { only_senders: ["rahul@example.com"] } }); ok("remove from vip list", o.s.notifications.only_senders.length === 0);
o = run("delete rule 1", { rules: [{ name: "chat: x", when: { subject_any: ["abc"] }, category: "A" }] }); ok("delete rule by number", o.s.rules.length === 0);
o = run("delete rule payslip", { rules: [{ name: "chat: payslip rule", when: { subject_any: ["abc"] }, category: "A" }] }); ok("delete rule by name", o.s.rules.length === 0);
// safety
o = run("mute gmail.com"); ok("refuses a free-mail domain", o.r.unknown.length === 1 && /mail provider/.test(o.r.unknown[0].error) && o.s.notifications.mute_senders.length === 0);
o = run("block @yahoo.com"); ok("refuses @yahoo.com too", o.r.unknown.length === 1);
o = run("mute ab"); ok("refuses a too-short name", o.r.unknown.length === 1 && /too short/.test(o.r.unknown[0].error));
o = run("move promotions to Food"); ok("refuses to re-file a whole category", o.r.unknown.length === 1 && /not whole categories/.test(o.r.unknown[0].error));
o = run("delete all emails from flipkart"); ok("'delete' only selects (never deletes)", o.r.steps.length === 1 && o.r.steps[0].type === "ui_select" && o.r.steps[0].wasDelete === true);
o = run("if the subject contains ab make it X"); ok("refuses 2-letter keywords", o.r.unknown.length === 1);
o = run("blorp the gizmo"); ok("unknown sentence is reported, not guessed", o.r.steps.length === 0 && o.r.unknown.length === 1);
const long = run("mute " + "a".repeat(5000)); ok("very long input is cut and handled", long.msgs.length === 0 || long.msgs.join("").length < 1500);
o = run("mute <img src=x onerror=alert(1)>"); ok("markup in a command stays inert text (only ever shown via textContent)", !/onerror=alert\(1\)>$/.test(JSON.stringify(o.s.notifications.mute_senders)) || o.s.notifications.mute_senders.every(x => x.startsWith("*")));
// ui steps
let u = C.parse("show promotions", ctx).steps[0]; ok("show promotions -> category filter", u.type === "ui_filter" && u.target.kind === "category" && u.target.category === "Promotions");
u = C.parse("select all from flipkart", ctx).steps[0]; ok("select all from flipkart -> sender", u.type === "ui_select" && u.target.pattern === "@flipkart.com");
u = C.parse("how many from amazon", ctx).steps[0]; ok("how many from amazon (two amazon domains -> wildcard)", u.type === "ui_count" && u.target.pattern === "*amazon*", JSON.stringify(u));
u = C.parse("show all", ctx).steps[0]; ok("show all clears the filter", u.type === "ui_clear");
u = C.parse("list my rules", ctx).steps[0]; ok("list my rules", u.type === "list" && u.what === "rule");
u = C.parse("undo", ctx).steps[0]; ok("undo", u.type === "undo");
u = C.parse("help", ctx).steps[0]; ok("help", u.type === "help");
ok("describe lists settings", /Notifications: smart/.test(C.describe(MS.merge(MS.DEFAULTS, {}), "settings")));
// splitting
ok("'and' inside a target list is not a new command", C.splitClauses("mute linkedin and facebook").length === 1);
ok("'and notify me' stays attached to its rule", C.splitClauses("move swiggy to Food and notify me").length === 1);
ok("verbs after 'and' start a new clause", C.splitClauses("mute linkedin and block spam.example and show promotions").length === 3);
process.exit(bad ? 1 : 0);
