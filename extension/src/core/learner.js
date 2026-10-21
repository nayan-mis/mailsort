/* mailsort learner - the on-device "System 1": a tiny text classifier (hashed n-gram Naive Bayes) that runs in about a millisecond,
 * needs no download and no GPU, starts from a small built-in seed, and keeps learning from the user's own mail and corrections.
 * It is only consulted when the rules are unsure (generic bucket or no match). */
(function (root) {
  "use strict";
  const MS = root.MS;

  MS.SEED = {
    Security: ["your verification code is", "use this code to sign in", "someone tried to log in to your account", "new device signed in to your account",
      "we noticed a login from a new location", "reset your password", "your account security alert", "confirm it's you", "two-factor authentication code",
      "unusual sign-in attempt blocked", "your password was changed", "verify your email address", "login approval required",
      "suspicious activity detected on your account", "secure your account now", "aapka otp hai", "aapke account mein naya login hua", "आपका ओटीपी"],
    Finance: ["your credit card statement is ready", "payment received thank you", "amount debited from your account", "your sip was successful",
      "mutual fund purchase confirmed", "your loan emi is due", "bank account balance update", "upi transaction successful", "your invoice is attached",
      "tax filing reminder", "your credit limit has been increased", "dividend credited to your account", "insurance premium due", "transaction alert",
      "salary credited to your account", "aapke account se paise kat gaye", "aapka payment safal raha", "आपके खाते से राशि कटी"],
    Shopping: ["your order has been shipped", "your parcel is on the way", "order confirmed thank you for shopping", "out for delivery today",
      "your package was delivered", "we received your order", "return pickup scheduled", "refund initiated for your order", "track your shipment",
      "items in your cart are waiting", "your order is being packed", "delivery partner is arriving", "thank you for your purchase",
      "your groceries are on the way", "your parcel has left the warehouse", "aapka order bhej diya gaya hai", "aapka parcel kal tak pahunch jayega", "आपका ऑर्डर भेज दिया गया है"],
    Travel: ["your flight booking is confirmed", "boarding pass attached", "web check-in is now open", "your hotel reservation", "train ticket booked pnr",
      "gate change for your flight", "your trip itinerary", "cab booking confirmed", "your journey details", "your holiday package",
      "visa application update", "bus ticket confirmation", "your upcoming trip", "airline schedule change", "your trip is confirmed", "aapki flight ka ticket confirm ho gaya", "aapki yatra ki jaankari", "आपका टिकट कन्फर्म हो गया"],
    Jobs: ["new jobs matching your profile", "your application has been received", "interview scheduled for", "congratulations you have been shortlisted",
      "recruiter wants to connect with you", "next steps in the hiring process", "we are hiring apply now", "job alert software engineer",
      "offer letter attached", "your resume was viewed", "technical round feedback", "internship opportunity", "assessment link for the role",
      "salary and joining details", "roles you may like", "aapka interview schedule ho gaya hai", "naukri ke naye avsar aapke liye", "आपके लिए नई नौकरियां"],
    Social: ["someone commented on your post", "you have a new follower", "new connection request", "liked your photo", "tagged you in a post",
      "replied to your comment", "friend request", "you appeared in searches this week", "birthday reminders from your network",
      "new message from a member", "kudos on your activity", "people you may know", "your post is getting views", "mentioned you in a thread",
      "invited you to join a group", "aapki post par naya comment aaya", "aapko naya follower mila"],
    Developer: ["build failed on main", "pull request opened", "you were assigned an issue", "deployment succeeded", "new commit pushed", "pipeline failed",
      "your api key was created", "server downtime incident report", "code review requested", "security advisory for your dependency",
      "release notes version", "your monitor detected errors", "merge conflict", "usage limit reached for your plan", "cloud billing alert for project"],
    Work: ["meeting notes and action items", "agenda for tomorrow's sync", "please review the attached proposal", "quarterly roadmap discussion",
      "project status update", "can we reschedule our call", "client feedback on the deck", "team standup summary", "following up on our meeting",
      "sprint planning invite", "please find the report attached", "weekly team update", "unread messages in your workspace", "timesheet reminder",
      "performance review cycle"],
    Personal: ["are you free this weekend", "call me when you get a chance", "thanks for yesterday", "happy birthday", "dinner tonight", "did you reach home",
      "see you soon", "photos from the trip", "let's catch up", "hope you are doing well", "kal milte hain", "ghar kab aa rahe ho", "how was your day",
      "can you send me that number", "lunch tomorrow", "khana kha liya", "kab aa rahe ho ghar", "aaj shaam ko milte hain"],
    Promotions: ["buy one get one free this weekend", "flat 50% off on everything", "end of season sale up to 60% extra", "exclusive offer just for you",
      "use coupon code at checkout", "cashback on your next order", "limited time deal ends tonight", "festive sale is live", "free delivery on orders above",
      "new arrivals you will love", "save big on your favourites", "membership offer upgrade now", "don't miss out mega sale",
      "your reward points are expiring", "early access to our sale", "aaj hi kharidein pachas pratishat chhoot", "khaas offer sirf aapke liye", "बंपर सेल आज ही"],
    Subscriptions: ["this week's newsletter", "the weekly digest of top stories", "your daily briefing", "monthly roundup of insights",
      "new article from your subscription", "issue of our newsletter", "top reads this week", "morning brief markets and startups", "new podcast episode is out",
      "curated links for you", "editor's picks", "weekly product updates and tips", "what's new this month", "read online manage preferences",
      "latest posts from the blog"],
    Spam: ["you have won a cash prize", "claim your reward now", "lottery winner notification", "urgent wire transfer needed", "selected to receive a cash reward",
      "earn money from home guaranteed", "your account will be suspended click here", "cheap pills no prescription", "dear beneficiary inheritance funds",
      "make 5000 daily no investment", "congratulations you are our lucky winner", "click the link to verify your bank details", "free gift card claim today",
      "crypto doubling scheme", "final warning verify immediately"]
  };

  const ALPHA = 0.1, SEEN_CAP = 3000;
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return String(h >>> 0); }

  function featurize(m) {
    const f = new Map();
    const add = (k, w) => { const h = hash(k); f.set(h, (f.get(h) || 0) + w); };
    const toks = s => (s.match(/[\p{L}\p{N}]+/gu) || []).filter(x => x.length > 1 && !/^\d+$/.test(x));
    const sub = toks(m.subject_l).slice(0, 30), body = toks(m.body).slice(0, 60);
    sub.forEach((w, i) => { add("s:" + w, 1); if (i) add("b:" + sub[i - 1] + "_" + w, 1); });
    body.forEach((w, i) => { add("w:" + w, 1); if (i) add("b:" + body[i - 1] + "_" + w, 1); });
    if (m.domain) { add("d:" + m.domain, 3); add("o:" + m.org, 2); }
    (m.from_addr.split("@")[0].replace(/\d+/g, " ").match(/[a-z]+/g) || []).slice(0, 4).forEach(t => add("l:" + t, 1.5));
    (m.from_name.toLowerCase().match(/\p{L}+/gu) || []).slice(0, 4).forEach(t => add("n:" + t, 1));
    add("k:" + m.kind, 1);
    if (m.has_attachment) add("att", 1);
    return f;
  }

  class Learner {
    constructor(state) { this.cls = {}; this.g = {}; this.vsize = 0; this.docs = 0; this.seen = []; if (state) this.load(state); }
    load(st) { this.docs = 0; Object.keys(st.cls || {}).forEach(l => this._addCounts(l, st.cls[l])); this.docs = st.docs || 0; this.seen = (st.seen || []).slice(-SEEN_CAP); }
    _addCounts(label, c) {
      const t = this.cls[label] || (this.cls[label] = { n: 0, tot: 0, f: {} });
      t.n += c.n; t.tot += c.tot; this.docs += c.n;
      Object.keys(c.f).forEach(h => { t.f[h] = (t.f[h] || 0) + c.f[h]; if (this.g[h] === undefined) { this.g[h] = 0; this.vsize++; } this.g[h] += c.f[h]; });
    }
    add(m, label, w) {
      const c = { n: w, tot: 0, f: {} };
      featurize(m).forEach((v, h) => { c.f[h] = v * w; c.tot += v * w; });
      this._addCounts(label, c);
    }
    merge(o) { Object.keys(o.cls).forEach(l => this._addCounts(l, o.cls[l])); o.seen.forEach(s => this.seen.push(s)); this.seen = this.seen.slice(-SEEN_CAP); }
    predict(m) {
      const labels = Object.keys(this.cls);
      if (labels.length < 2 || this.docs < 10) return null;
      const f = featurize(m);
      let ntok = 0; f.forEach(v => { ntok += v; });
      if (!ntok) return null;
      const V = Math.max(1, this.vsize);
      const lp = labels.map(l => {
        const c = this.cls[l], denom = c.tot + ALPHA * V;
        let s = Math.log((c.n + 1) / (this.docs + labels.length));
        f.forEach((v, h) => { s += v * Math.log(((c.f[h] || 0) + ALPHA) / denom); });
        return s;
      });
      const T = Math.max(1, ntok / 6);                       // Naive Bayes is over-confident on long texts; temper it
      const mx = Math.max.apply(null, lp), ex = lp.map(x => Math.exp((x - mx) / T)), z = ex.reduce((a, b) => a + b, 0);
      let best = 0; ex.forEach((x, i) => { if (x > ex[best]) best = i; });
      return { label: labels[best], p: ex[best] / z, probs: labels.map((l, i) => [l, ex[i] / z]).sort((a, b) => b[1] - a[1]).slice(0, 3) };
    }
    toJSON() { return { cls: this.cls, docs: this.docs, seen: this.seen.slice(-SEEN_CAP) }; }
  }

  // Brain = seed knowledge + what this user taught it. Only the user-taught part is saved.
  class Brain {
    constructor(deltaState) {
      this.delta = new Learner(deltaState);
      this.all = new Learner();
      const fake = (text) => MS.build({ from_addr: "", from_name: "", subject: text, snippet: "" });
      Object.keys(MS.SEED).forEach(label => MS.SEED[label].forEach(t => this.all.add(Object.assign(fake(t), { kind: "person" }), label, 1)));
      this.all.merge(this.delta);
      this.dirty = false;
    }
    predict(m) { return this.all.predict(m); }
    learn(m, label, w, force) {
      const key = hash((m.id || "") + "|" + m.from_addr + "|" + m.subject_l);
      if (!force && this.delta.seen.includes(key)) return false;
      this.delta.add(m, label, w || 1); this.all.add(m, label, w || 1);
      this.delta.seen.push(key); if (this.delta.seen.length > SEEN_CAP) this.delta.seen.shift();
      this.dirty = true;
      return true;
    }
    get taught() { return Math.round(this.delta.docs); }
    toJSON() { return this.delta.toJSON(); }
  }
  MS.Learner = Learner;
  MS.Brain = Brain;
  MS.loadBrain = async function () { const { learnerDelta } = await chrome.storage.local.get("learnerDelta"); return new Brain(learnerDelta); };
  MS.saveBrain = async function (b) { await chrome.storage.local.set({ learnerDelta: b.toJSON() }); b.dirty = false; };
  MS.learnFrom = function (brain, m, res, s) {   // teach from decisions that came from rules / user choices - never from the learner's own guesses
    if (!brain || res.learnedApplied || res.weak || !res.category || res.category === "Other") return false;
    if (res.category === "Spam" && res.spam_score < s.spam.move_threshold) return false;
    return brain.learn(m, res.category, 1, false);
  };
  if (typeof module !== "undefined" && module.exports) module.exports = MS;
})(typeof globalThis !== "undefined" ? globalThis : self);
