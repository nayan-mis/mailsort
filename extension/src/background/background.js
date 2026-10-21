/* mailsort background worker: notifications (browser + optional ntfy phone push), a daily digest of held-back mail,
 * and the Gmail unread-feed poller. Accepts messages only from this extension's own pages and scripts. */
importScripts("../core/engine.js", "../core/learner.js");

const DEDUPE_MS = 120000;
let brainPromise = null;
const getBrain = () => brainPromise || (brainPromise = MS.loadBrain());
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.learnerDelta) brainPromise = null; });

// opts: { title, body, priority, url, push: { title, body } }  - the browser notification stays on the device,
// the phone push (optional) can be reduced to the sender only, or to nothing.
async function deliver(opts) {
  const s = await MS.getSettings();
  const n = s.notifications;
  const url = MS.safeUrl(opts.url);
  if (n.desktop) {
    const id = "ms-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await chrome.notifications.create(id, {
      type: "basic", iconUrl: chrome.runtime.getURL("icons/icon128.png"), title: opts.title, message: opts.body,
      priority: opts.priority === "urgent" ? 2 : 0, requireInteraction: opts.priority === "urgent"
    });
    const { urls = {} } = await chrome.storage.session.get("urls");
    urls[id] = url;
    Object.keys(urls).slice(0, Math.max(0, Object.keys(urls).length - 50)).forEach(k => delete urls[k]);
    await chrome.storage.session.set({ urls });
  }
  if (n.ntfy && n.ntfy.topic) {
    try {
      const push = opts.push || { title: opts.title, body: opts.body };
      const headers = { Title: push.title.replace(/[^\x20-\x7e]/g, "") || "mailsort", Priority: String({ low: 2, normal: 3, high: 4, urgent: 5 }[opts.priority] || 3) };
      if (url) headers.Click = url;
      await fetch(n.ntfy.server.replace(/\/$/, "") + "/" + encodeURIComponent(n.ntfy.topic), { method: "POST", body: push.body, headers });
    } catch (e) { /* phone push is best effort */ }
  }
}

function pushText(detail, cat, m) {
  if (detail === "full") return { title: "[" + cat + "] " + m.source, body: m.subject || "(no subject)" };
  if (detail === "none") return { title: "mailsort", body: "New important email" };
  return { title: "[" + cat + "] " + m.source, body: "New email" };       // default: sender only, never the subject
}

async function seenRecently(key) {
  const now = Date.now();
  const { recent = {} } = await chrome.storage.session.get("recent");
  Object.keys(recent).forEach(k => { if (now - recent[k] > DEDUPE_MS) delete recent[k]; });
  if (recent[key]) return true;
  recent[key] = now;
  await chrome.storage.session.set({ recent });
  return false;
}

async function handleItem(raw) {
  const item = MS.cleanItem(raw);
  const s = await MS.getSettings();
  if (s.paused) return { skipped: "paused" };
  const m = MS.build(item);
  const res = MS.classify(m, s, await getBrain());
  const key = (m.from_addr || m.from_name) + "|" + m.subject_l;
  const cat = res.category + (res.subcategory ? "/" + res.subcategory : "");
  if (!res.notify_final) {
    // Held-back mail can be summed up once a day instead of being lost entirely.
    if (s.notifications.digest.enabled && !["spam", "mode none", "muted sender"].includes(res.notify_why) && !(await seenRecently(key))) {
      const { digestQueue } = await chrome.storage.local.get("digestQueue");
      const q = digestQueue || { counts: {}, total: 0 };
      q.counts[res.category] = (q.counts[res.category] || 0) + 1; q.total++;
      await chrome.storage.local.set({ digestQueue: q });
      return { digest: true };
    }
    return { skipped: res.notify_why };
  }
  if (MS.inQuietHours(s.notifications.quiet) && res.priority !== "urgent") return { skipped: "quiet hours" };
  if (await seenRecently(key)) return { skipped: "duplicate" };
  await deliver({ title: "[" + cat + "] " + m.source, body: m.subject || "(no subject)", priority: res.priority, url: item.url,
    push: pushText(s.notifications.ntfy.detail, cat, m) });
  return { notified: true };
}

async function sendDigest() {
  const { digestQueue } = await chrome.storage.local.get("digestQueue");
  if (!digestQueue || !digestQueue.total) return;
  const parts = Object.entries(digestQueue.counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => n + " " + c);
  await deliver({ title: "mailsort daily digest", body: digestQueue.total + " emails held back: " + parts.join(", "), priority: "low", url: "" });
  await chrome.storage.local.set({ digestQueue: { counts: {}, total: 0 } });
}

// Gmail: poll the signed-in account's unread feed so notifications work even with no Gmail tab open.
// (Not an official API - if Google changes it, turn the feed off in settings and notifications fall back to open tabs.)
async function pollGmail() {
  const s = await MS.getSettings();
  if (!s.gmail.feed || s.paused) return;
  const got = await chrome.storage.local.get("status");
  const status = got.status || {};
  for (const idx of s.gmail.accounts) {
    const sk = "feedSeen:" + idx;
    try {
      const r = await fetch("https://mail.google.com/mail/u/" + idx + "/feed/atom", { credentials: "include", cache: "no-store" });
      const text = await r.text();
      if (!r.ok || !text.includes("<feed")) {
        throw new Error(r.status === 401 || /ServiceLogin|accounts\.google\.com/.test(text)
          ? "Not signed in to Gmail account #" + idx : "Gmail feed unavailable (HTTP " + r.status + ")");
      }
      const feed = MS.parseAtom(text);
      const stored = await chrome.storage.local.get(sk);
      const seen = new Set(stored[sk] || []);
      const baseline = !stored[sk];                       // first poll: remember what is there, notify nothing
      const fresh = feed.entries.filter(e => !seen.has(e.id));
      await chrome.storage.local.set({ [sk]: feed.entries.map(e => e.id) });
      if (!baseline) {
        for (const e of fresh.slice(0, 5)) await handleItem(Object.assign({}, e, { account: feed.account, unread: true }));
      }
      status[idx] = { ok: true, time: Date.now(), account: feed.account, unread: feed.fullcount, fresh: baseline ? 0 : fresh.length };
    } catch (e) {
      status[idx] = { ok: false, time: Date.now(), error: String(e.message || e) };
    }
  }
  await chrome.storage.local.set({ status });
}


// ---- optional on-device language model: runs in a hidden extension page, never touches the network, answers only with a proposal
async function ensureOffscreen() {
  const have = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (have.length) return;
  await chrome.offscreen.createDocument({ url: "src/ai/offscreen.html", reasons: ["WORKERS"],
    justification: "Runs the optional small on-device language model that understands loosely worded assistant requests." });
}
async function askModel(type, payload) {
  await ensureOffscreen();
  let last;
  for (let i = 0; i < 15; i++) {                 // the hidden page may need a moment to start listening
    try { return await chrome.runtime.sendMessage(Object.assign({ target: "offscreen", type }, payload)); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 200)); }
  }
  throw last;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("The model took too long to answer.")), ms))]);
async function aiParse(prompt) {
  const s = await MS.getSettings();
  if (!s.ai.enabled) return { ok: false, error: "disabled" };
  if (!prompt || typeof prompt.system !== "string" || typeof prompt.user !== "string" || prompt.system.length > 8000 || prompt.user.length > 1200) return { ok: false, error: "bad request" };
  return withTimeout(askModel("ai-generate", { prompt: { system: prompt.system, user: prompt.user } }), 120000);
}

function nextAt(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
async function ensureAlarm() {
  const s = await MS.getSettings();
  await chrome.alarms.clear("poll");
  await chrome.alarms.clear("digest");
  if (s.gmail.feed && !s.paused) {
    chrome.alarms.create("poll", { delayInMinutes: 0.1, periodInMinutes: Math.max(0.5, Number(s.gmail.interval_min) || 1) });
  }
  if (s.notifications.digest.enabled && !s.paused) chrome.alarms.create("digest", { when: nextAt(s.notifications.digest.time) });
}

chrome.runtime.onInstalled.addListener(d => {
  ensureAlarm();
  if (d.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("src/pages/options.html#welcome") });   // 3-step getting started page
});
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.settings) ensureAlarm(); });
chrome.alarms.onAlarm.addListener(async a => {
  if (a.name === "poll") pollGmail();
  if (a.name === "digest") { await sendDigest(); ensureAlarm(); }
});

chrome.notifications.onClicked.addListener(async id => {
  const { urls = {} } = await chrome.storage.session.get("urls");
  chrome.notifications.clear(id);
  const url = MS.safeUrl(urls[id]);                        // only ever open Gmail or Yahoo Mail addresses
  if (url) chrome.tabs.create({ url });
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!sender || sender.id !== chrome.runtime.id || !msg || typeof msg.type !== "string") return false;   // ignore anyone but ourselves
  (async () => {
    if (msg.type === "notify") send(await handleItem(msg.item));
    else if (msg.type === "test") { await deliver({ title: "mailsort test", body: "Notifications are working.", priority: "normal", url: "" }); send({ ok: true }); }
    else if (msg.type === "openOptions") { chrome.runtime.openOptionsPage(); send({ ok: true }); }
    else if (msg.type === "pollNow") { await pollGmail(); send({ ok: true }); }
    else if (msg.type === "ai-parse") send(await aiParse(msg.prompt));
    else if (msg.type === "ai-status") send(await withTimeout(askModel("ai-status", {}), 15000));
    else send({ error: "unknown message" });
  })().catch(e => send({ error: String(e) }));
  return true;
});
