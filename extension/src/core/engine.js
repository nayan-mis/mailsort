/* mailsort engine - shared by the content script, background worker, options page and popup.
 * Pure rules, no AI, no network. Works from what an inbox LIST shows: sender, subject, snippet, attachment icon. */
(function (root) {
  "use strict";
  const MS = {};

  MS.DEFAULTS = {
    paused: false,
    notifications: {
      mode: "rules",                    // rules | only | all | none
      desktop: true,
      ntfy: { topic: "", server: "https://ntfy.sh", detail: "sender" },
      digest: { enabled: false, time: "18:00" },
      quiet: { enabled: false, start: "22:00", end: "07:00" },
      notify_categories: ["Personal", "Work", "Security", "Finance/Due"],
      mute_categories: ["Promotions", "Subscriptions", "Social", "Spam", "Automated"],
      only_senders: [], only_categories: [], mute_senders: []
    },
    spam: { label_threshold: 5, move_threshold: 9, trusted_senders: [], blocked_senders: [] },
    senders: {}, rules: [], use_builtin_rules: true,
    ui: { badges: true, filterBar: true, dimSpam: true, showTags: true },
    gmail: { feed: true, accounts: [0], autoAccounts: true, interval_min: 1 },
    learning: { enabled: true, threshold: 0.3 },
    onboarding: { done: false },
    ai: { enabled: false, tuned: false }
  };

  const PRIORITIES = ["low", "normal", "high", "urgent"];
  const KNOWN_WHEN = ["unread", "all_of", "account", "from", "from_contains", "from_name_any", "subject_any", "subject_regex",
    "body_any", "body_regex", "has_attachment", "sender_kind", "bulk", "any_of", "not"];

  // ---------------------------------------------------------------- helpers
  const lst = v => (typeof v === "string" ? [v] : Array.isArray(v) ? v : []);
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const kwCache = new Map();
  function kwIn(text, kw) {          // word-prefix match: "order" matches "orders", not "border"
    kw = String(kw).toLowerCase();
    let re = kwCache.get(kw);
    if (!re) { re = new RegExp((/^[a-z0-9]/.test(kw) ? "(?<![a-z0-9])" : "") + esc(kw)); kwCache.set(kw, re); }
    return re.test(text);
  }
  function matchAddr(pattern, addr) {
    let p = String(pattern).trim().toLowerCase();
    addr = String(addr || "").toLowerCase();
    if (!p) return false;
    if (p.includes("@") && !p.startsWith("@")) {
      return new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$").test(addr);
    }
    if (p.includes("*") && !p.startsWith("*.")) return new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(addr);
    p = p.replace(/^@/, "");
    while (p.startsWith("*.")) p = p.slice(2);
    const dom = addr.split("@").pop();
    return dom === p || dom.endsWith("." + p);
  }
  const TWO = new Set(["co.uk", "com.au", "co.in", "co.jp", "com.br", "org.uk", "ac.in", "gov.in", "com.sg", "co.nz", "net.in", "org.in", "com.cn", "com.mx", "co.za", "ac.uk", "gov.uk"]);
  function orgOf(domain) {
    const p = domain.split(".");
    if (p.length >= 3 && TWO.has(p.slice(-2).join("."))) return p[p.length - 3];
    return p.length >= 2 ? p[p.length - 2] : domain;
  }
  function catIn(entries, cat, sub) {
    const full = sub ? (cat + "/" + sub).toLowerCase() : cat.toLowerCase();
    return entries.some(e => { e = e.toLowerCase(); return e === cat.toLowerCase() || e === full; });
  }
  MS.matchAddr = matchAddr;
  const clone = v => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);
  MS.merge = function merge(base, over) {          // always returns fresh copies: nothing is ever shared with MS.DEFAULTS
    const out = clone(base);
    Object.keys(over || {}).forEach(k => {
      const v = over[k];
      out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : clone(v);
    });
    return out;
  };

  // ---------------------------------------------------------------- message features
  const BULK_TEXT = /\b(unsubscribe|view (this )?(email )?in (your )?browser|manage (your )?(email )?preferences|newsletter|weekly digest|daily digest|issue #\d+)\b/i;
  const BULK_LOCAL = /^(newsletter|news|digest|updates?|offers?|deals?|marketing|promo(tion)?s?|mailer|campaigns?|rewards?)([._+-]|\d|$)/;
  const BULK_DOMAINS = ["substack.com", "beehiiv.com", "mailchimp.com", "medium.com", "convertkit.com", "mailerlite.com", "constantcontact.com", "klaviyo.com"];
  const AUTOMATED = /(no[-_.]?reply|do[-_.]?not[-_.]?reply|notification|alert|mailer-daemon|postmaster|bounce|automated|system)/;

  MS.build = function (raw) {
    let addr = String(raw.from_addr || "").toLowerCase().trim();
    const name = String(raw.from_name || "").trim();
    // Some inboxes (Yahoo) show only a display name. Make a stable pseudo-address so sender rules still work.
    const synthetic = !addr && !!name;
    if (synthetic) addr = name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") + "@name.local";
    const domain = !synthetic && addr.includes("@") ? addr.split("@").pop() : "";
    const org = domain ? orgOf(domain) : "";
    let source = name && !name.includes("@") ? name : cap(org);
    source = source.replace(/[\\/:*?"<>|&]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || cap(org) || "Unknown";
    const subject = String(raw.subject || "").trim();
    const snippet = String(raw.snippet || "").trim();
    const local = addr.split("@")[0] || "";
    const bulk = BULK_TEXT.test(subject + " " + snippet) || BULK_LOCAL.test(local) || BULK_DOMAINS.some(d => matchAddr(d, addr));
    const automated = AUTOMATED.test(local);
    return {
      from_addr: addr, from_name: name, domain, org, source, subject, subject_l: subject.toLowerCase(),
      body: snippet.toLowerCase(), has_attachment: !!raw.has_attachment, account: String(raw.account || "").toLowerCase(),
      bulk, kind: bulk ? "bulk" : automated ? "automated" : "person", unread: !!raw.unread, synthetic, id: String(raw.id || "")
    };
  };

  // ---------------------------------------------------------------- built-in rules
  const PROMO = ["% off", "sale", "discount", "offer", "deal", "coupon", "cashback", "free shipping", "limited time", "flash sale",
    "save up to", "bogo", "voucher", "promo", "clearance", "last chance", "hurry", "exclusive"];
  const SHOP = ["amazon.in", "amazon.com", "flipkart.com", "myntra.com", "ajio.com", "meesho.com", "nykaa.com", "bigbasket.com", "swiggy.in",
    "zomato.com", "blinkit.com", "zepto.com", "ebay.com", "etsy.com", "aliexpress.com", "croma.com", "tatacliq.com"];
  const DEV = ["github.com", "gitlab.com", "bitbucket.org", "atlassian.net", "atlassian.com", "vercel.com", "netlify.com", "render.com",
    "heroku.com", "sentry.io", "digitalocean.com", "cloudflare.com", "npmjs.com", "pypi.org", "docker.com", "aws.amazon.com",
    "cloud.google.com", "firebase.google.com", "supabase.com", "mongodb.com"];
  MS.BUILTIN_RULES = [
    { name: "One-time codes", when: { any_of: [
        { subject_regex: "\\b(otp|one[- ]time (password|passcode|code)|verification code|security code|login code|your code is|passcode|authentication code)\\b" },
        { body_any: ["otp is", "one time password", "verification code is", "your code is"] }] },
      category: "Security", subcategory: "Verification codes", tags: ["otp"], notify: true, priority: "high" },
    { name: "Account security alerts", when: { subject_any: ["password reset", "reset your password", "new sign-in", "new login", "unusual activity",
        "security alert", "sign-in attempt", "password was changed", "unrecognized device", "suspicious login"] },
      category: "Security", subcategory: "Account alerts", tags: ["security"], notify: true, priority: "urgent" },
    { name: "Payments due / failed", when: { subject_any: ["payment due", "is due", "due on", "due date", "overdue", "final notice", "payment failed",
        "failed payment", "card declined", "autopay failed"] },
      category: "Finance", subcategory: "Due", tags: ["finance", "bill-due"], notify: true, priority: "high" },
    { name: "Bank & payment senders", when: { from: ["hdfcbank.net", "hdfcbank.com", "icicibank.com", "sbi.co.in", "onlinesbi.sbi", "axisbank.com",
        "kotak.com", "paytm.com", "phonepe.com", "razorpay.com", "paypal.com", "wise.com", "stripe.com", "bankofbaroda.com", "idfcfirstbank.com", "yesbank.in"] },
      category: "Finance", subcategory: "Banking", tags: ["finance"] },
    { name: "Receipts, invoices, statements", when: { subject_any: ["invoice", "receipt", "payment received", "payment confirmation", "bill", "statement",
        "your payment", "subscription renewal", "auto-renew", "emi", "debited", "credited", "transaction", "tax"] },
      weak: true, category: "Finance", subcategory: "Receipts", tags: ["finance", "receipt"], notify: false },
    { name: "Delivery updates", when: { subject_any: ["out for delivery", "delivered", "arriving today", "arriving tomorrow"], not: { subject_any: PROMO } },
      category: "Shopping", subcategory: "Delivery", tags: ["order", "delivery"], notify: true },
    { name: "Orders", when: { subject_any: ["order", "shipped", "dispatched", "tracking", "your package", "shipment", "return request", "refund"],
        not: { any_of: [{ subject_any: PROMO }, { bulk: true }] } },
      category: "Shopping", subcategory: "Orders", tags: ["order"] },
    { name: "Travel", when: { any_of: [
        { from: ["irctc.co.in", "makemytrip.com", "goibibo.com", "booking.com", "airbnb.com", "agoda.com", "goindigo.in", "airindia.com", "airindia.in", "uber.com", "olacabs.com", "redbus.in"] },
        { subject_any: ["boarding pass", "itinerary", "pnr", "e-ticket", "flight", "check-in", "reservation confirmed", "hotel booking", "trip confirmation"] }],
        not: { subject_any: PROMO } },
      category: "Travel", subcategory: "Bookings", tags: ["travel"] },
    { name: "Jobs", when: { any_of: [
        { from: ["naukri.com", "indeed.com", "glassdoor.com", "wellfound.com", "instahyre.com", "cutshort.io", "foundit.in"] },
        { subject_any: ["job alert", "jobs for you", "interview", "application received", "your application", "recruiter", "we're hiring", "job opportunity", "offer letter"] }] },
      category: "Jobs", subcategory: "Alerts & applications", tags: ["career"] },
    { name: "Social networks", when: { from: ["linkedin.com", "facebook.com", "facebookmail.com", "instagram.com", "twitter.com", "x.com", "reddit.com",
        "redditmail.com", "quora.com", "pinterest.com", "discord.com", "telegram.org", "youtube.com", "snapchat.com", "tiktok.com", "meetup.com"] },
      category: "Social", subcategory: "{org}", tags: ["social"] },
    { name: "Developer failures & incidents", when: { from: DEV, subject_regex: "\\b(failed|failure|error|incident|outage|down|broken|alert)\\b" },
      category: "Developer", subcategory: "Failures", tags: ["dev", "failure"], notify: true, priority: "high" },
    { name: "Developer tools", when: { from: DEV }, category: "Developer", subcategory: "{org}", tags: ["dev"], notify: false },
    { name: "Meetings & calendar", when: { subject_any: ["invitation:", "invitation from", "meeting", "calendar", "zoom", "google meet", "teams meeting",
        "standup", "rescheduled", "accepted:", "declined:", "updated invitation"], not: { bulk: true } },
      category: "Work", subcategory: "Meetings", tags: ["calendar"], notify: true },
    { name: "Promotions", when: { any_of: [{ subject_any: PROMO }, { from: SHOP, bulk: true }] },
      category: "Promotions", subcategory: "Offers", tags: ["promo"], notify: false },
    { name: "Subscriptions & newsletters", when: { bulk: true }, weak: true, category: "Subscriptions", subcategory: "{source}", tags: ["bulk"] },
    { name: "Automated notifications", when: { sender_kind: ["automated"] }, weak: true, category: "Automated", subcategory: "{source}", tags: ["automated"] },
    { name: "tag: attachment", when: { has_attachment: true }, tags: ["attachment"] },
    { name: "tag: urgent wording", when: { subject_any: ["urgent", "asap", "action required", "immediate action", "final reminder", "deadline"], not: { bulk: true } },
      tags: ["urgent"], priority: "high" },
    { name: "tag: question from a person", when: { subject_regex: "\\?\\s*$", sender_kind: ["person"] }, tags: ["question"] }
  ];

  // ---------------------------------------------------------------- rule engine
  function check(key, val, m) {
    switch (key) {
      case "account": return lst(val).some(x => m.account.includes(String(x).toLowerCase()));
      case "from": return lst(val).some(p => matchAddr(p, m.from_addr));
      case "from_contains": return lst(val).some(x => m.from_addr.includes(String(x).toLowerCase()));
      case "from_name_any": return lst(val).some(x => kwIn(m.from_name.toLowerCase(), x));
      case "subject_any": return lst(val).some(x => kwIn(m.subject_l, x));
      case "subject_regex": return new RegExp(val, "i").test(m.subject);
      case "body_any": return lst(val).some(x => kwIn(m.body, x));
      case "body_regex": return new RegExp(val, "i").test(m.body);
      case "has_attachment": return m.has_attachment === !!val;
      case "sender_kind": return lst(val).includes(m.kind);
      case "bulk": return m.bulk === !!val;
      case "unread": return m.unread === !!val;
      case "all_of": return val.every(w => ruleMatches(w, m));
      case "any_of": return val.some(w => ruleMatches(w, m));
      case "not": return !ruleMatches(val, m);
      default: throw new Error("unknown condition: " + key);
    }
  }
  function ruleMatches(when, m) { return Object.keys(when).every(k => check(k, when[k], m)); }
  const fmt = (s, m) => String(s || "").replace(/\{(\w+)\}/g, (all, k) =>
    k === "source" ? m.source : k === "org" ? cap(m.org) : k === "domain" ? m.domain : all);

  function absorb(res, spec, m, name) {
    if (spec.category && !res.category) { res.category = fmt(spec.category, m); res.subcategory = fmt(spec.subcategory, m) || null; res.weak = !!spec.weak; }
    (spec.tags || []).forEach(t => res.tagSet.add(t));
    if (res.notify === null && "notify" in spec) res.notify = !!spec.notify;
    const p = spec.priority;
    if (PRIORITIES.includes(p) && (res.priority === null || PRIORITIES.indexOf(p) > PRIORITIES.indexOf(res.priority))) res.priority = p;
    res.reasons.push(name);
  }

  const SPAM_WORDS = ["viagra", "cialis", "lottery", "you have won", "you've won", "claim your prize", "winner", "congratulations you", "100% free",
    "act now", "wire transfer", "inheritance", "bitcoin doubling", "crypto giveaway", "double your", "make money fast", "work from home",
    "no investment required", "casino", "loan approved", "pre-approved", "dear beneficiary", "dear friend", "weight loss", "miracle",
    "risk-free", "earn $", "earn rs", "jackpot", "unclaimed"];
  const PHISH = [/verify your account/, /confirm your identity/, /account (has been )?(suspended|limited|locked)/, /account will be (closed|locked|suspended)/,
    /update your payment/, /click here to (verify|confirm|login|log in|unlock)/, /confirm your password/, /gift card/];
  const BRANDS = ["paypal", "amazon", "google", "microsoft", "apple", "netflix", "hdfc", "icici", "sbi", "axis", "paytm", "facebook", "instagram",
    "whatsapp", "dhl", "fedex", "bank", "irs", "flipkart"];
  const BAD_TLD = [".xyz", ".top", ".click", ".loan", ".work", ".gq", ".tk", ".ml", ".cf", ".ga", ".icu", ".monster", ".buzz"];

  function spamScore(m, s) {
    const sp = s.spam;
    if (sp.blocked_senders.some(p => matchAddr(p, m.from_addr))) return [100, ["blocked sender"]];
    if (sp.trusted_senders.some(p => matchAddr(p, m.from_addr))) return [0, ["trusted sender"]];
    let score = 0; const why = [];
    const add = (n, r) => { score += n; why.push((n > 0 ? "+" : "") + n + " " + r); };
    let hits = 0;
    SPAM_WORDS.forEach(w => { if (kwIn(m.subject_l, w)) hits += 2; else if (kwIn(m.body, w)) hits += 1; });
    if (hits) add(Math.min(hits, 6), "spammy wording");
    const text = m.subject_l + " " + m.body;
    if (PHISH.some(r => r.test(text))) add(2, "phishing-style phrase");
    if (m.domain && BAD_TLD.some(t => m.domain.endsWith(t))) add(2, "suspicious domain ending");
    const shown = m.from_name.toLowerCase();
    for (const b of BRANDS) {
      if (kwIn(shown, b) && m.org && !m.org.includes(b) && !m.domain.includes(b)) { add(4, "display name claims '" + b + "' but domain is " + m.domain); break; }
    }
    const em = shown.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    if (em && m.from_addr && em[0] !== m.from_addr) add(3, "display name shows a different email address");
    if (/https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(m.body)) add(2, "link to a raw IP address");
    const letters = m.subject.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 10 && (letters.replace(/[^A-Z]/g, "").length / letters.length) > 0.7) add(1, "ALL-CAPS subject");
    if ((m.subject.match(/!/g) || []).length >= 3) add(1, "many exclamation marks");
    if (!m.subject.trim()) add(1, "empty subject");
    return [Math.max(score, 0), why];
  }

  function shouldNotify(res, m, s) {
    const n = s.notifications, cat = res.category, sub = res.subcategory, addr = m.from_addr;
    if (n.mode === "none") return [false, "mode none"];
    if (cat === "Spam") return [false, "spam"];
    if (n.mute_senders.some(p => matchAddr(p, addr))) return [false, "muted sender"];
    const vip = n.only_senders.some(p => matchAddr(p, addr));
    if (n.mode === "only") { const ok = vip || catIn(n.only_categories, cat, sub); return [ok, ok ? "VIP/only-list" : "not on the only-list"]; }
    if (vip) return [true, "VIP sender"];
    if (n.mode === "all") return [!catIn(n.mute_categories, cat, sub), "mode all"];
    if (res.notify !== null) return [res.notify, "rule/override says " + (res.notify ? "yes" : "no")];
    if (res.priority === "urgent") return [true, "urgent"];
    if (catIn(n.notify_categories, cat, sub) && !catIn(n.mute_categories, cat, sub)) return [true, "category " + cat];
    return [false, "category not in notify list"];
  }

  MS.classify = function (m, s, brain) {
    if (!s || !s.notifications || !s.spam || !s.learning) s = MS.merge(MS.DEFAULTS, s || {});
    const res = { category: null, subcategory: null, tagSet: new Set(), notify: null, priority: null, reasons: [], weak: false };
    let locked = false;
    Object.keys(s.senders).forEach(pat => {
      if (matchAddr(pat, m.from_addr)) { absorb(res, s.senders[pat], m, "sender:" + pat); locked = locked || !!s.senders[pat].category; }
    });
    const rules = s.rules.concat(s.use_builtin_rules ? MS.BUILTIN_RULES : []);
    for (const r of rules) {
      if (locked && r.category) continue;
      if (ruleMatches(r.when, m)) { absorb(res, r, m, r.name || "rule"); if (r.stop) break; }
    }
    res.learnedApplied = false;
    if (brain && s.learning.enabled && (!res.category || res.weak)) {
      const pred = brain.predict(m);
      const need = pred && pred.label === "Spam" ? Math.max(0.85, s.learning.threshold) : s.learning.threshold;
      if (pred && pred.p >= need && pred.label !== res.category) {
        res.category = pred.label; res.subcategory = null; res.learnedApplied = true; res.tagSet.add("learned");
        res.reasons.push("learned: " + pred.label + " " + Math.round(pred.p * 100) + "%");
      }
    }
    const [score, why] = spamScore(m, s);
    if (score >= s.spam.label_threshold) {
      res.category = "Spam"; res.subcategory = score >= s.spam.move_threshold ? "Junk" : "Suspicious"; res.tagSet.add("spam"); res.notify = false;
    }
    if (!res.category) { if (m.kind === "person") { res.category = "Personal"; res.subcategory = "People"; } else { res.category = "Other"; res.subcategory = "Uncategorized"; } }
    res.priority = res.priority || "normal";
    if (res.priority === "high" || res.priority === "urgent") res.tagSet.add("priority-" + res.priority);
    const [notify, notifyWhy] = shouldNotify(res, m, s);
    res.tags = Array.from(res.tagSet).sort();
    delete res.tagSet;
    return Object.assign(res, { spam_score: score, spam_reasons: why, notify_final: notify, notify_why: notifyWhy });
  };

  MS.inQuietHours = function (q, now) {
    if (!q || !q.enabled) return false;
    now = now || new Date();
    const t = now.getHours() * 60 + now.getMinutes();
    const p = x => { const [h, mi] = x.split(":").map(Number); return h * 60 + mi; };
    const a = p(q.start), b = p(q.end);
    return a < b ? (t >= a && t < b) : (t >= a || t < b);
  };

  MS.validate = function (s) {
    if (!["rules", "only", "all", "none"].includes(s.notifications.mode)) throw new Error("Notification mode must be rules, only, all or none");
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(s.notifications.digest.time)) throw new Error("Digest time must look like 18:00");
    if (!["full", "sender", "none"].includes(s.notifications.ntfy.detail)) throw new Error("Phone push detail must be full, sender or none");
    ["start", "end"].forEach(k => { if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(s.notifications.quiet[k])) throw new Error("Quiet hours must look like 22:00"); });
    const walk = (w, where) => Object.keys(w).forEach(k => {
      if (!KNOWN_WHEN.includes(k)) throw new Error("Unknown condition '" + k + "' in " + where + ". Allowed: " + KNOWN_WHEN.join(", "));
      if (k === "any_of" || k === "all_of") w[k].forEach(x => walk(x, where)); else if (k === "not") walk(w[k], where);
      if (k === "subject_regex" || k === "body_regex") { try { new RegExp(w[k]); } catch (e) { throw new Error("Bad regex in " + where); } }
    });
    s.rules.forEach((r, i) => { if (!r.when) throw new Error("Rule " + (i + 1) + " has no 'when'"); walk(r.when, "rule '" + (r.name || i + 1) + "'"); });
    return s;
  };

  // ---------------------------------------------------------------- storage (extension pages only)
  MS.getSettings = async function () {
    const { settings } = await chrome.storage.local.get("settings");
    return MS.merge(MS.DEFAULTS, settings || {});
  };
  MS.mutate = async function (fn) {
    const s = await MS.getSettings();
    fn(s);
    MS.validate(s);
    await chrome.storage.local.set({ settings: s });
    return s;
  };

  // ---------------------------------------------------------------- Gmail unread feed (atom) parser
  MS.parseAtom = function (xml) {
    const dec = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
    const tag = (t, name) => { const m = t.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">")); return m ? dec(m[1].trim()) : ""; };
    const head = xml.split("<entry>")[0];
    const account = (tag(head, "title").match(/[\w.+-]+@[\w.-]+\.\w+/) || [""])[0];
    const entries = []; const re = /<entry>([\s\S]*?)<\/entry>/g; let m;
    while ((m = re.exec(xml))) {
      const e = m[1], author = (e.match(/<author>[\s\S]*?<\/author>/) || [""])[0], link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1];
      entries.push({ id: tag(e, "id"), subject: tag(e, "title"), snippet: tag(e, "summary"), url: link ? dec(link) : "",
        from_name: tag(author, "name"), from_addr: tag(author, "email"), issued: tag(e, "issued") });
    }
    return { account, entries, fullcount: parseInt(tag(head, "fullcount") || "0", 10) };
  };

  // ---------------------------------------------------------------- Gmail filter export (Settings > Filters > Import)
  const xe = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");
  const qt = v => (/\s/.test(v) ? '"' + v + '"' : v);
  function toQuery(w) {
    const parts = [];
    for (const k of Object.keys(w)) {
      const v = w[k]; let s;
      if (k === "from") s = "from:(" + lst(v).map(p => p.replace(/\*/g, "").replace(/^@/, "")).map(qt).join(" OR ") + ")";
      else if (k === "from_contains") s = "from:(" + lst(v).map(qt).join(" OR ") + ")";
      else if (k === "subject_any") s = "subject:(" + lst(v).map(qt).join(" OR ") + ")";
      else if (k === "body_any") s = "(" + lst(v).map(qt).join(" OR ") + ")";
      else if (k === "has_attachment") s = v ? "has:attachment" : "-has:attachment";
      else if (k === "any_of") { const subs = v.map(toQuery); if (subs.includes(null)) return null; s = "{" + subs.map(x => "(" + x + ")").join(" ") + "}"; }
      else if (k === "not") { const sub = toQuery(v); if (sub === null) return null; s = "-(" + sub + ")"; }
      else return null;               // regex / bulk / sender_kind / account cannot be expressed as a Gmail search
      parts.push(s);
    }
    return parts.join(" ");
  }
  MS.exportGmailFilters = function (s, opts) {
    opts = opts || {};
    const entries = [], skipped = [];
    const entry = props => entries.push("<entry><category term='filter'></category><title>Mail Filter</title>" +
      Object.keys(props).map(k => "<apps:property name='" + k + "' value='" + xe(props[k]) + "'/>").join("") + "</entry>");
    const labelOf = r => [r.category, r.subcategory].filter(x => x && !/\{\w+\}/.test(x)).join("/");
    const chunks = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
    const fromQ = pats => "from:(" + pats.map(p => qt(p.replace(/\*/g, "").replace(/^@/, ""))).join(" OR ") + ")";
    const muted = !!opts.archiveMuted;
    const rules = s.rules.concat(opts.includeBuiltin ? MS.BUILTIN_RULES : []);
    rules.forEach(r => {
      const lab = labelOf(r);
      if (!lab) return;
      const q = toQuery(r.when);
      if (q === null || q === "") { skipped.push(r.name || "rule"); return; }
      const p = { hasTheWord: q, label: lab };
      if (muted && r.notify === false) p.shouldArchive = "true";
      entry(p);
    });
    Object.keys(s.senders).forEach(pat => { const o = s.senders[pat]; const lab = labelOf(o); if (lab) entry({ hasTheWord: fromQ([pat]), label: lab }); });
    chunks(s.notifications.only_senders, 25).forEach(c => entry({ hasTheWord: fromQ(c), label: "VIP", shouldAlwaysMarkAsImportant: "true", shouldNeverSpam: "true" }));
    chunks(s.notifications.mute_senders, 25).forEach(c => entry({ hasTheWord: fromQ(c), label: "Muted" }));
    chunks(s.spam.blocked_senders, 25).forEach(c => entry({ hasTheWord: fromQ(c), label: "Blocked", shouldArchive: "true", shouldMarkAsRead: "true" }));
    chunks(s.spam.trusted_senders, 25).forEach(c => entry({ hasTheWord: fromQ(c), shouldNeverSpam: "true" }));
    const xml = "<?xml version='1.0' encoding='UTF-8'?>\n<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>\n<title>mailsort filters</title>\n" +
      entries.join("\n") + "\n</feed>\n";
    return { xml, count: entries.length, skipped };
  };

  // ---------------------------------------------------------------- hardening: nothing from an email is trusted
  MS.safeUrl = function (u) {
    try {
      const x = new URL(String(u));
      const h = x.hostname;
      if (x.protocol === "https:" && (h === "mail.google.com" || h === "mail.yahoo.com" || h.endsWith(".mail.yahoo.com"))) return x.href;
    } catch (err) { /* not a URL */ }
    return "";
  };
  const cut = (v, n) => String(v == null ? "" : v).slice(0, n);
  MS.cleanItem = function (it) {
    it = it || {};
    return { from_addr: cut(it.from_addr, 200), from_name: cut(it.from_name, 200), subject: cut(it.subject, 500), snippet: cut(it.snippet, 500),
      account: cut(it.account, 200), id: cut(it.id, 100), unread: !!it.unread, has_attachment: !!it.has_attachment, url: MS.safeUrl(it.url) };
  };

  // ---------------------------------------------------------------- starter presets and shareable rule packs (data, not code)
  MS.PRESETS = {
    student: { label: "Student", notify: ["Personal", "Study", "Jobs", "Security", "Finance/Due"], mute: ["Promotions", "Subscriptions", "Social", "Spam", "Automated", "Shopping"],
      rules: [{ name: "preset: study mail", when: { subject_any: ["assignment", "exam", "lecture", "class", "semester", "timetable", "scholarship", "result", "admit card", "syllabus"] },
        category: "Study", subcategory: "College", tags: ["study"], notify: true }] },
    freelancer: { label: "Freelancer", notify: ["Personal", "Clients", "Finance/Due", "Security"], mute: ["Promotions", "Subscriptions", "Social", "Spam", "Automated"],
      rules: [{ name: "preset: client mail", when: { subject_any: ["invoice", "payment received", "proposal", "contract", "project", "milestone", "feedback"] },
        category: "Clients", subcategory: "Projects", tags: ["client"], notify: true }] },
    founder: { label: "Founder", notify: ["Personal", "Work", "Investors", "Finance/Due", "Security", "Developer/Failures"], mute: ["Promotions", "Subscriptions", "Social", "Spam", "Automated"],
      rules: [{ name: "preset: investors and board", when: { subject_any: ["investor", "term sheet", "board", "funding", "pitch", "due diligence", "cap table"] },
        category: "Investors", subcategory: "Funding", tags: ["investor"], notify: true, priority: "high" }] }
  };
  MS.applyPreset = function (s, key) {
    const p = MS.PRESETS[key];
    if (!p) throw new Error("Unknown preset");
    s.notifications.notify_categories = p.notify.slice();
    s.notifications.mute_categories = p.mute.slice();
    s.rules = s.rules.filter(r => !String(r.name || "").startsWith("preset: "));
    p.rules.slice().reverse().forEach(r => s.rules.unshift(JSON.parse(JSON.stringify(r))));
    return s;
  };
  MS.packExport = (s, name) => ({ mailsortPack: 1, name: name || "My rules", rules: s.rules });
  MS.packImport = function (s, pack) {
    if (!pack || pack.mailsortPack !== 1 || !Array.isArray(pack.rules)) throw new Error("This is not a mailsort rules pack");
    const have = new Set(s.rules.map(r => r.name));
    let added = 0;
    pack.rules.forEach(r => { if (r && typeof r === "object" && r.when && !have.has(r.name)) { s.rules.push(r); have.add(r.name); added++; } });
    return added;
  };
  MS.addStats = async function (d) {
    const got = await chrome.storage.local.get("stats");
    const st = got.stats || { decisions: 0, corrections: 0 };
    st.decisions += d.decisions || 0; st.corrections += d.corrections || 0;
    await chrome.storage.local.set({ stats: st });
    return st;
  };

  root.MS = MS;
  if (typeof module !== "undefined" && module.exports) module.exports = MS;
})(typeof globalThis !== "undefined" ? globalThis : self);
