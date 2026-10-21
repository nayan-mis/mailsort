/* mailsort catalog: ONE fixed description of everything a rule can match on and do. Models only translate a person's sentence into
 * this format; plain code validates it, explains it, and compiles it for each place it can run (the Gmail page, a Gmail filter
 * file, later the Gmail API). Adding an entry here automatically extends validation, the checks per place, and the model prompt.
 *
 * A rule looks like:
 *   { "name": "bank codes", "when": { "all": [ { "from": ["bank.example"] }, { "subject_has": ["otp"] } ] },
 *     "then": [ { "do": "notify", "mode": "urgent" }, { "do": "label", "name": "Security/OTP" } ] }
 */
(function (root) {
  "use strict";
  const MS = root.MS;
  const K = {};

  // ---------------------------------------------------------------- the catalog
  // page: how well the Gmail/Yahoo PAGE can do it (it only sees sender, subject, preview line): exact | approx | no
  // filter: can an exported Gmail filter do it:  yes | no     api: the Gmail API can do all of it (needs Google's approval)
  K.CONDITIONS = {
    from:          { type: "strings", help: "sender address, @domain or name", gmail: "from:", page: "exact", filter: "yes", examples: ["from my bank", "emails from linkedin"] },
    to:            { type: "strings", help: "recipient address", gmail: "to:", page: "no", filter: "yes", examples: ["sent to my work address"] },
    subject_has:   { type: "strings", help: "words in the subject (any of)", gmail: "subject:", page: "exact", filter: "yes", examples: ["subject says invoice"] },
    text_has:      { type: "strings", help: "words anywhere in the mail (any of)", gmail: "words", page: "approx", filter: "yes", examples: ["mentions refund"], note: "the page only sees the subject and preview line" },
    text_lacks:    { type: "strings", help: "words that must NOT appear (any of)", gmail: "-words", page: "approx", filter: "yes", examples: ["doesn't mention unsubscribe"] },
    has_attachment:{ type: "bool", help: "has an attachment", gmail: "has:attachment", page: "approx", filter: "yes", examples: ["with attachments"], note: "the page detects the paperclip icon on a best-effort basis" },
    filename:      { type: "string", help: "attachment file name or type", gmail: "filename:", page: "no", filter: "yes", examples: ["a pdf attached"] },
    label:         { type: "string", help: "a Gmail label", gmail: "label:", page: "no", filter: "yes", examples: ["under my Work label"] },
    category:      { type: "enum", values: ["primary", "social", "promotions", "updates", "forums", "reservations", "purchases"], help: "Gmail's own category tab", gmail: "category:", page: "no", filter: "yes", examples: ["in promotions"] },
    status:        { type: "enum", values: ["unread", "read", "starred", "important", "muted"], help: "read or marked state", gmail: "is:", page: "partial", filter: "yes", examples: ["unread mail"], note: "the page only knows unread and read" },
    location:      { type: "enum", values: ["inbox", "archive", "snoozed", "trash", "sent", "drafts", "spam", "anywhere"], help: "where the mail is", gmail: "in:", page: "no", filter: "yes", examples: ["in the archive"] },
    mailing_list:  { type: "string", help: "a mailing list address", gmail: "list:", page: "no", filter: "yes", examples: ["from the dev mailing list"] },
    size:          { type: "size", help: "larger or smaller than N megabytes", gmail: "larger:/smaller:", page: "no", filter: "yes", examples: ["bigger than 10 MB"] },
    age:           { type: "age", help: "older or newer than N days, months or years", gmail: "older_than:/newer_than:", page: "no", filter: "yes", examples: ["older than 6 months"] },
    sender_kind:   { type: "enum", values: ["person", "bulk", "automated"], help: "mailsort's own guess at who is sending", gmail: null, page: "exact", filter: "no", examples: ["from a real person"] }
  };
  // risk: safe = apply, then Undo | confirm = show how many mails first | confirm_twice = ask twice, trash only, never permanent
  K.ACTIONS = {
    label:              { risk: "safe", params: { name: "label" }, page: "exact", filter: "yes", help: "file under a label or category (Work/Clients)" },
    notify:             { risk: "safe", params: { mode: ["always", "never", "urgent"] }, page: "exact", filter: "approx", help: "decide whether you are alerted", note: "a Gmail filter can only mark such mail important" },
    star:               { risk: "safe", params: {}, page: "no", filter: "yes", help: "star it" },
    mark_important:     { risk: "safe", params: {}, page: "no", filter: "yes", help: "always mark important" },
    mark_not_important: { risk: "safe", params: {}, page: "no", filter: "yes", help: "never mark important" },
    never_spam:         { risk: "safe", params: {}, page: "no", filter: "yes", help: "never send to spam" },
    archive:            { risk: "confirm", params: {}, page: "no", filter: "yes", help: "skip the inbox" },
    mark_read:          { risk: "confirm", params: {}, page: "no", filter: "yes", help: "mark as read" },
    trash:              { risk: "confirm_twice", params: {}, page: "no", filter: "yes", help: "move to Trash (Gmail keeps it 30 days)" }
  };
  // Things a sentence can ask for that this product will never do, with the reason shown to the user.
  K.BLOCKED = {
    forward: "forwarding can send your mail to someone else", auto_reply: "it would send mail in your name", send_template: "it would send mail in your name",
    send_email: "it would send mail in your name", delete_forever: "permanent deletion cannot be undone", delete_permanently: "permanent deletion cannot be undone",
    delete: "use trash instead: it keeps mail for 30 days and asks you twice", change_forwarding: "it could redirect all your mail", delegate: "it would give someone access to your mailbox",
    share_mailbox: "it would give someone access to your mailbox", change_password: "account security is out of scope", unsubscribe: "unsubscribing contacts the sender, so you do it yourself"
  };
  const RISK = ["safe", "confirm", "confirm_twice"];
  const LIMITS = { depth: 4, nodes: 14, strings: 8, str: 80, name: 60, then: 6 };

  // ---------------------------------------------------------------- validation
  const clean = s => String(s).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} &\/-]{0,59}$/u;

  function leaf(id, v, errs) {
    const c = K.CONDITIONS[id];
    if (!c) { errs.push("unknown condition \"" + clean(id).slice(0, 30) + "\""); return null; }
    switch (c.type) {
      case "strings": {
        const a = typeof v === "string" ? [v] : v;
        if (!Array.isArray(a) || !a.length || a.length > LIMITS.strings || a.some(x => typeof x !== "string" || !clean(x) || clean(x).length > LIMITS.str)) { errs.push(id + " needs 1 to " + LIMITS.strings + " short texts"); return null; }
        return { [id]: a.map(clean) };
      }
      case "string": if (typeof v !== "string" || !clean(v) || clean(v).length > LIMITS.str) { errs.push(id + " needs a short text"); return null; } return { [id]: clean(v) };
      case "bool": if (typeof v !== "boolean") { errs.push(id + " must be true or false"); return null; } return { [id]: v };
      case "enum": if (!c.values.includes(v)) { errs.push(id + " must be one of " + c.values.join(", ")); return null; } return { [id]: v };
      case "size": if (!v || !["larger", "smaller"].includes(v.op) || !Number.isFinite(v.mb) || v.mb <= 0 || v.mb > 1000) { errs.push("size needs {op: larger|smaller, mb: 1-1000}"); return null; } return { size: { op: v.op, mb: v.mb } };
      case "age": if (!v || !["older_than", "newer_than"].includes(v.op) || !Number.isInteger(v.n) || v.n < 1 || v.n > 999 || !["d", "m", "y"].includes(v.unit)) { errs.push("age needs {op: older_than|newer_than, n, unit: d|m|y}"); return null; } return { age: { op: v.op, n: v.n, unit: v.unit } };
    }
    return null;
  }
  function node(n, depth, ctr, errs) {
    if (++ctr.n > LIMITS.nodes) { errs.push("the condition is too long"); return null; }
    if (depth > LIMITS.depth) { errs.push("the condition is nested too deeply"); return null; }
    if (!n || typeof n !== "object" || Array.isArray(n)) { errs.push("a condition must be an object"); return null; }
    const keys = Object.keys(n);
    if (keys.length !== 1) { errs.push("each condition has exactly one key"); return null; }
    const k = keys[0], v = n[k];
    if (k === "all" || k === "any") {
      if (!Array.isArray(v) || !v.length || v.length > 8) { errs.push(k + " needs 1 to 8 conditions"); return null; }
      const kids = v.map(x => node(x, depth + 1, ctr, errs));
      return kids.includes(null) ? null : { [k]: kids };
    }
    if (k === "not") { const kid = node(v, depth + 1, ctr, errs); return kid ? { not: kid } : null; }
    return leaf(k, v, errs);
  }
  // Returns { ok, errors, risk, rule } - rule is a cleaned copy that is safe to store or compile.
  K.validate = function (rule) {
    const errors = [], out = { kind: "rule" };
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) return { ok: false, errors: ["a rule must be an object"], risk: "safe", rule: null };
    out.name = typeof rule.name === "string" ? clean(rule.name).slice(0, 60) : "rule";
    out.when = node(rule.when, 1, { n: 0 }, errors);
    let risk = "safe";
    const acts = [];
    if (!Array.isArray(rule.then) || !rule.then.length || rule.then.length > LIMITS.then) errors.push("then needs 1 to " + LIMITS.then + " actions");
    else rule.then.forEach(a => {
      const id = a && typeof a === "object" ? a.do : null, def = K.ACTIONS[id];
      if (!def) {
        errors.push(id && K.BLOCKED[id] ? "\"" + id + "\" is not allowed: " + K.BLOCKED[id] : "unknown action \"" + clean(id).slice(0, 30) + "\"");
        return;
      }
      if (id === "label") { if (typeof a.name !== "string" || !NAME_RE.test(clean(a.name))) { errors.push("label needs a plain name like Work/Clients"); return; } acts.push({ do: id, name: clean(a.name) }); }
      else if (id === "notify") { if (!def.params.mode.includes(a.mode)) { errors.push("notify mode must be always, never or urgent"); return; } acts.push({ do: id, mode: a.mode }); }
      else acts.push({ do: id });
      if (RISK.indexOf(def.risk) > RISK.indexOf(risk)) risk = def.risk;
    });
    out.then = acts;
    if (out.when && acts.length === (rule.then || []).length && !errors.length) return { ok: true, errors: [], risk, rule: out };
    return { ok: false, errors, risk, rule: null };
  };

  // ---------------------------------------------------------------- where can it run? (page | filter | api)
  K.check = function (rule, surface) {
    const v = K.validate(rule);
    if (!v.ok) return { ok: false, issues: v.errors, notes: [] };
    const issues = [], notes = [];
    (function walk(n) {
      const k = Object.keys(n)[0], val = n[k];
      if (k === "all" || k === "any") return val.forEach(walk);
      if (k === "not") return walk(val);
      const c = K.CONDITIONS[k];
      if (surface === "api") return;
      const lvl = surface === "page" ? c.page : (c.filter === "yes" ? "exact" : "no");
      if (lvl === "no" || (lvl === "partial" && !(k === "status" && val === "unread" || k === "status" && val === "read"))) issues.push(c.help + " (" + k + ") cannot be used " + (surface === "page" ? "on the Gmail page" : "in a Gmail filter"));
      else if (lvl === "approx" || lvl === "partial") notes.push(k + ": " + (c.note || "approximate"));
    })(v.rule.when);
    v.rule.then.forEach(a => {
      const d = K.ACTIONS[a.do];
      if (surface === "api") return;
      const lvl = surface === "page" ? d.page : d.filter;
      if (lvl === "no") issues.push("\"" + a.do + "\" (" + d.help + ") cannot be done " + (surface === "page" ? "on the Gmail page" : "by a Gmail filter"));
      else if (lvl === "approx") notes.push(a.do + ": " + (d.note || "approximate"));
    });
    if (surface === "api") notes.push("needs the Gmail API, which requires Google's app verification");
    return { ok: issues.length === 0, issues, notes };
  };

  // ---------------------------------------------------------------- compile: Gmail search / filter text
  const quote = s => (/[\s"():{}]/.test(s) ? '"' + String(s).replace(/"/g, "") + '"' : s);
  const orList = a => a.map(x => quote(String(x).replace(/^@/, ""))).join(" OR ");
  function gq(n) {
    const k = Object.keys(n)[0], v = n[k];
    if (k === "all") return v.map(x => { const s = gq(x); return /^\{/.test(s) || /^-/.test(s) || !/ OR /.test(s) || /^[a-z_]+:\(/.test(s) ? s : "(" + s + ")"; }).join(" ");
    if (k === "any") return "{" + v.map(x => { const s = gq(x); return / /.test(s) && !/^[a-z_]+:\(.*\)$/.test(s) && !/^\{.*\}$/.test(s) ? "(" + s + ")" : s; }).join(" ") + "}";
    if (k === "not") { const s = gq(v); return "-" + (/^\(.*\)$/.test(s) || /^[a-z_]+:\(.*\)$/.test(s) ? s.replace(/^-/, "") : "(" + s + ")"); }
    switch (k) {
      case "from": case "to": return k + ":(" + orList(v) + ")";
      case "subject_has": return "subject:(" + orList(v) + ")";
      case "text_has": return "(" + orList(v) + ")";
      case "text_lacks": return "-(" + orList(v) + ")";
      case "has_attachment": return v ? "has:attachment" : "-has:attachment";
      case "filename": return "filename:" + quote(v);
      case "label": return "label:" + quote(v);
      case "category": return "category:" + v;
      case "status": return "is:" + v;
      case "location": return "in:" + v;
      case "mailing_list": return "list:" + quote(v);
      case "size": return (v.op === "larger" ? "larger:" : "smaller:") + v.mb + "M";
      case "age": return v.op + ":" + v.n + v.unit;
      default: throw new Error("cannot express \"" + k + "\" as a Gmail search");
    }
  }
  K.toGmailQuery = function (rule) {
    const v = K.validate(rule);
    if (!v.ok) throw new Error(v.errors.join("; "));
    return gq(v.rule.when);
  };

  const xe = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
  // Builds the file Gmail imports (Settings > Filters). trash is only exported when allowTrash is set explicitly.
  K.toFilterXml = function (rules, opts) {
    opts = opts || {};
    const entries = [], skipped = [];
    rules.forEach((r, i) => {
      const v = K.validate(r), nm = (r && r.name) || "rule " + (i + 1);
      if (!v.ok) { skipped.push(nm + ": " + v.errors.join("; ")); return; }
      const chk = K.check(v.rule, "filter");
      if (!chk.ok) { skipped.push(nm + ": " + chk.issues.join("; ")); return; }
      if (v.rule.then.some(a => a.do === "trash") && !opts.allowTrash) { skipped.push(nm + ": trash is not exported unless you switch it on"); return; }
      const p = { hasTheWord: gq(v.rule.when) };
      v.rule.then.forEach(a => {
        if (a.do === "label") p.label = a.name;
        else if (a.do === "notify" && a.mode !== "never") p.shouldAlwaysMarkAsImportant = "true";
        else if (a.do === "star") p.shouldStar = "true";
        else if (a.do === "mark_important") p.shouldAlwaysMarkAsImportant = "true";
        else if (a.do === "mark_not_important") p.shouldNeverMarkAsImportant = "true";
        else if (a.do === "never_spam") p.shouldNeverSpam = "true";
        else if (a.do === "archive") p.shouldArchive = "true";
        else if (a.do === "mark_read") p.shouldMarkAsRead = "true";
        else if (a.do === "trash") p.shouldTrash = "true";
      });
      entries.push("<entry><category term='filter'></category><title>Mail Filter</title>" + Object.keys(p).map(k => "<apps:property name='" + k + "' value='" + xe(p[k]) + "'/>").join("") + "</entry>");
    });
    return { xml: "<?xml version='1.0' encoding='UTF-8'?>\n<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>\n<title>mailsort filters</title>\n" + entries.join("\n") + "\n</feed>\n", count: entries.length, skipped };
  };

  // ---------------------------------------------------------------- compile: the rule format the page engine already runs
  const isName = s => !/[@.]/.test(s);
  function pg(n) {
    const k = Object.keys(n)[0], v = n[k];
    if (k === "all") { const kids = v.map(pg); return kids.length === 1 ? kids[0] : { all_of: kids }; }
    if (k === "any") return { any_of: v.map(pg) };
    if (k === "not") return { not: pg(v) };
    switch (k) {
      case "from": { const names = v.filter(isName), pats = v.filter(x => !isName(x)); return names.length && pats.length ? { any_of: [{ from: pats }, { from_name_any: names }] } : names.length ? { from_name_any: names } : { from: pats }; }
      case "subject_has": return { subject_any: v };
      case "text_has": return { any_of: [{ subject_any: v }, { body_any: v }] };
      case "text_lacks": return { not: { any_of: [{ subject_any: v }, { body_any: v }] } };
      case "has_attachment": return { has_attachment: v };
      case "status": return { unread: v === "unread" ? true : false };
      case "sender_kind": return { sender_kind: [v] };
      default: throw new Error("the Gmail page cannot check \"" + k + "\"");
    }
  }
  // Returns the engine's own rule object. then-actions: label -> category/subcategory, notify -> notify/priority.
  K.toPageRule = function (rule) {
    const v = K.validate(rule);
    if (!v.ok) throw new Error(v.errors.join("; "));
    const chk = K.check(v.rule, "page");
    if (!chk.ok) throw new Error(chk.issues.join("; "));
    const out = { name: v.rule.name, when: pg(v.rule.when) };
    v.rule.then.forEach(a => {
      if (a.do === "label") { const parts = a.name.split("/"); out.category = parts[0].trim(); if (parts[1]) out.subcategory = parts.slice(1).join("/").trim(); }
      else if (a.do === "notify") { if (a.mode === "never") out.notify = false; else { out.notify = true; if (a.mode === "urgent") out.priority = "urgent"; } }
    });
    return out;
  };

  // ---------------------------------------------------------------- plain-English description (for the confirmation step)
  const list = a => a.map(x => "\"" + x + "\"").join(" or ");
  function dn(n) {
    const k = Object.keys(n)[0], v = n[k];
    if (k === "all") return v.map(dn).join(" and ");
    if (k === "any") return "(" + v.map(dn).join(" or ") + ")";
    if (k === "not") return "not " + dn(v);
    switch (k) {
      case "from": return "it is from " + list(v); case "to": return "it is sent to " + list(v);
      case "subject_has": return "the subject mentions " + list(v); case "text_has": return "it mentions " + list(v); case "text_lacks": return "it does not mention " + list(v);
      case "has_attachment": return v ? "it has an attachment" : "it has no attachment"; case "filename": return "an attachment is named " + v;
      case "label": return "it has the label " + v; case "category": return "Gmail files it under " + v; case "status": return "it is " + v;
      case "location": return "it is in " + v; case "mailing_list": return "it is from the mailing list " + v;
      case "size": return "it is " + v.op + " than " + v.mb + " MB"; case "age": return "it is " + v.op.replace("_", " ") + " " + v.n + { d: " day(s)", m: " month(s)", y: " year(s)" }[v.unit];
      case "sender_kind": return "it looks like it comes from " + { person: "a person", bulk: "a mass mailing", automated: "an automated sender" }[v];
    }
    return k;
  }
  K.describe = function (rule) {
    const v = K.validate(rule);
    if (!v.ok) return "Not a valid rule: " + v.errors.join("; ");
    const acts = v.rule.then.map(a => ({ label: "file it under " + (a.name || ""), notify: a.mode === "never" ? "do not notify me" : a.mode === "urgent" ? "notify me urgently" : "notify me", star: "star it", mark_important: "mark it important",
      mark_not_important: "never mark it important", never_spam: "never send it to spam", archive: "skip the inbox", mark_read: "mark it read", trash: "move it to Trash" }[a.do]));
    return "When " + dn(v.rule.when) + ": " + acts.join(", ") + ".";
  };

  // ---------------------------------------------------------------- for the model prompt and the training data (always in sync with the catalog)
  K.promptSpec = function () {
    const cs = Object.keys(K.CONDITIONS).map(k => { const c = K.CONDITIONS[k]; return k + (c.values ? "(" + c.values.join("|") + ")" : c.type === "bool" ? "(true|false)" : c.type === "size" ? "{op:larger|smaller,mb}" : c.type === "age" ? "{op:older_than|newer_than,n,unit:d|m|y}" : "[...]"); });
    const as = Object.keys(K.ACTIONS).map(k => k === "label" ? "label{name}" : k === "notify" ? "notify{mode:always|never|urgent}" : k);
    return "Conditions: " + cs.join(", ") + ". Combine with all[...], any[...], not{...}.\nActions: " + as.join(", ") + ".\nNever allowed: " + Object.keys(K.BLOCKED).join(", ") + ".";
  };
  K.exportJson = function () { return JSON.stringify({ conditions: K.CONDITIONS, actions: K.ACTIONS, blocked: K.BLOCKED, limits: LIMITS }, null, 2); };

  MS.Catalog = K;
  if (typeof module !== "undefined" && module.exports) module.exports = MS;
})(typeof globalThis !== "undefined" ? globalThis : self);
