const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TABS = [["notifications", "Notifications"], ["senders", "Senders"], ["rules", "Rules"], ["gmail", "Gmail & filters"], ["display", "Display & backup"]];
let dirty = false, welcome = location.hash === "#welcome", S, taught = 0, stats = { decisions: 0, corrections: 0 }, bytes = 0, feedStatus = {}, tab = "notifications", toastT;
const val = id => $("#" + id).value.trim(), chk = id => $("#" + id).checked, csv = s => s.split(",").map(x => x.trim()).filter(Boolean);
const LISTS = { vip: ["notifications", "only_senders", "VIP senders (always notify)"], mute: ["notifications", "mute_senders", "Muted senders (never notify)"],
  block: ["spam", "blocked_senders", "Blocked (always Spam)"], trust: ["spam", "trusted_senders", "Trusted (never Spam)"] };

function toast(m, bad) { const t = $("#toast"); t.textContent = m; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastT); toastT = setTimeout(() => t.className = "toast", 3500); }
async function load() { S = await MS.getSettings(); taught = (await MS.loadBrain()).taught; stats = (await chrome.storage.local.get("stats")).stats || stats; bytes = await chrome.storage.local.getBytesInUse(null); feedStatus = (await chrome.storage.local.get("status")).status || {}; render(); }
async function save(fn, msg) { try { await MS.mutate(fn); toast(msg || "Saved"); await load(); } catch (e) { toast(e.message, true); } }
function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function chips(arr, name) { return arr.map(p => `<span class="chip">${esc(p)} <a href="#" data-act="del" data-name="${name}" data-p="${esc(p)}">×</a></span>`).join("") || '<span class="muted">none</span>'; }

const SAVE_ACT = { notifications: "save_notif", gmail: "save_gmail", display: "save_display" };
const FIELD = /^(c_|n_|q_|d_|g_|l_|u_(?!builtin))/;
function setDirty(v) { dirty = v; $("#savebar").hidden = !v; }
function vWelcome() {
  return `<div class="card" style="border-color:var(--accent)"><h3>Welcome to mailsort</h3><div class="muted">Nothing is uploaded and there is no account. Three steps:</div>
  <ol class="steps"><li><b>Open or reload Gmail or Yahoo Mail.</b> <button class="g" data-act="reload_tabs">Reload my open mail tabs</button></li>
  <li><b>Check the first few emails</b> in the "Does this look right?" card that appears. Your answers teach it.</li>
  <li><b>Choose who may notify you</b> below, for example "Only my VIPs".</li>
  <li><b>Or just tell the assistant:</b> click the blue <b>mailsort ✦</b> button in Gmail and type something like "mute linkedin" or "notify me only for my boss". Type "help" to see what it understands.</li></ol>
  <div class="row"><button class="g" data-act="hide_welcome">Got it</button></div></div>`;
}
function render() {
  setDirty(false);
  $("#nav").innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-k="${k}" class="${k === tab ? "on" : ""}">${l}</button>`).join("");
  $("#main").innerHTML = (welcome ? vWelcome() : "") + { notifications: vNotif, senders: vSenders, rules: vRules, gmail: vGmail, display: vDisplay }[tab]();
}
function vNotif() {
  const n = S.notifications;
  const modes = [["rules", "Smart (default)", "Notify by category and rules; VIPs always; muted never."], ["only", "Only my VIPs", "Notify ONLY for VIP senders (plus any categories listed below)."],
    ["all", "Everything", "Notify for all new mail except muted senders and muted categories."], ["none", "Silent", "No notifications."]];
  return `<div class="card"><h3>Who can notify me?</h3>${modes.map(([k, l, d]) => `<label style="display:block;margin:6px 0"><input type="radio" name="mode" value="${k}" ${n.mode === k ? "checked" : ""}> <b>${l}</b> <span class="muted">${d}</span></label>`).join("")}</div>
  <div class="card"><h3>Categories</h3><label class="f">Notify for these (comma separated, e.g. Personal, Finance/Due)</label><input id="n_cats" style="width:100%" value="${esc(n.notify_categories.join(", "))}">
  <label class="f">Never notify for these</label><input id="n_mute" style="width:100%" value="${esc(n.mute_categories.join(", "))}">
  <label class="f">Also allowed in "Only my VIPs" mode</label><input id="n_only" style="width:100%" value="${esc(n.only_categories.join(", "))}"></div>
  <div class="grid2"><div class="card"><h3>Where to send</h3><label><input type="checkbox" id="c_desktop" ${n.desktop ? "checked" : ""}> Browser notification</label>
  <label class="f">ntfy topic (free phone push: install the ntfy app and subscribe to a private topic name)</label><input id="c_ntfy" style="width:100%" value="${esc(n.ntfy.topic)}">
  <label class="f">ntfy server</label><input id="c_ntfys" style="width:100%" value="${esc(n.ntfy.server)}">
  <label class="f">What the phone push may reveal (the browser notification on this computer always shows the subject)</label>
  <select id="c_detail" style="width:100%"><option value="sender" ${n.ntfy.detail === "sender" ? "selected" : ""}>Sender only (recommended)</option><option value="full" ${n.ntfy.detail === "full" ? "selected" : ""}>Sender and subject</option><option value="none" ${n.ntfy.detail === "none" ? "selected" : ""}>Nothing - just "new important email"</option></select>
  <div class="row"><button class="g" data-act="test">Send test notification</button></div></div>
  <div class="card"><h3>Quiet hours</h3><label><input type="checkbox" id="q_on" ${n.quiet.enabled ? "checked" : ""}> Hold notifications during quiet hours (urgent ones still come through)</label>
  <div class="row"><input id="q_s" size="5" value="${esc(n.quiet.start)}"> to <input id="q_e" size="5" value="${esc(n.quiet.end)}"></div>
  <label style="display:block;margin-top:10px"><input type="checkbox" id="d_on" ${n.digest.enabled ? "checked" : ""}> Daily digest: one summary notification of the mail I chose not to be notified about</label>
  <div class="row">at <input id="d_t" size="5" value="${esc(n.digest.time)}"></div></div></div>
  <button class="b" data-act="save_notif">Save</button>`;
}
function vSenders() {
  const L = { vip: S.notifications.only_senders, mute: S.notifications.mute_senders, block: S.spam.blocked_senders, trust: S.spam.trusted_senders };
  const ov = Object.entries(S.senders);
  return `<div class="muted" style="margin-bottom:10px">Patterns: <code>name@site.com</code> (one address), <code>@site.com</code> (a whole domain), <code>*@site.com</code>. You can also manage senders straight from the badge on any email in Gmail or Yahoo.</div>
  <div class="grid2">${Object.keys(LISTS).map(k => `<div class="card"><h3>${LISTS[k][2]}</h3>${chips(L[k], k)}<div class="row"><input id="add_${k}" placeholder="a@b.com or @b.com"><button class="g" data-act="add" data-name="${k}">Add</button></div></div>`).join("")}</div>
  <div class="card"><h3>Per-sender category overrides</h3><table>${ov.map(([p, o]) => `<tr><td>${esc(p)}</td><td>${esc((o.category || "") + (o.subcategory ? "/" + o.subcategory : ""))}</td><td align="right"><button class="d" data-act="unassign" data-p="${esc(p)}">Delete</button></td></tr>`).join("") || '<tr><td class="muted">None yet. Use "Move…" in the badge menu on an email.</td></tr>'}</table></div>`;
}
function vRules() {
  return `<div class="card"><h3>Start from a preset</h3><div class="muted">Sets who can notify you and adds one starter rule. You can change everything afterwards.</div>
  <div class="row">${Object.keys(MS.PRESETS).map(k => `<button class="g" data-act="preset" data-k="${k}">${esc(MS.PRESETS[k].label)}</button>`).join("")}</div></div>
  <div class="card"><h3>Rule packs</h3><div class="muted">A pack is a plain data file of rules. Share yours, or import one from someone you trust. Packs cannot run code.</div>
  <div class="row"><button class="g" data-act="pack_export">Download my rules</button><label class="g" style="cursor:pointer">Import a pack<input type="file" id="pack_file" accept=".json" hidden></label></div></div>
  <div class="card"><h3>Add a rule</h3><div class="muted">Your rules run before the built-in ones. The extension sees an inbox row: sender, subject and the short preview text.</div>
  <div class="grid2"><div><label class="f">If sender is (comma separated: a@b.com, @company.com)</label><input id="r_from" style="width:100%"></div><div><label class="f">and/or subject contains (comma separated)</label><input id="r_subj" style="width:100%"></div>
  <div><label class="f">only for account (part of the address, optional)</label><input id="r_acct" style="width:100%" placeholder="work@"></div><div><label class="f">Rule name</label><input id="r_name" style="width:100%"></div>
  <div><label class="f">Category</label><input id="r_cat" style="width:100%" placeholder="Work"></div><div><label class="f">Subcategory</label><input id="r_sub" style="width:100%" placeholder="Clients"></div>
  <div><label class="f">Tags (comma separated)</label><input id="r_tags" style="width:100%"></div><div><label class="f">Notify?</label><select id="r_notify" style="width:100%"><option value="">follow my notification settings</option><option value="yes">always</option><option value="no">never</option></select></div></div>
  <div class="row"><button class="b" data-act="rule_add">Add rule</button></div></div>
  <div class="card"><h3>Your rules</h3><table>${S.rules.map((r, i) => `<tr><td><b>${esc(r.name || "rule")}</b><div class="muted">${esc(JSON.stringify(r.when))}</div></td><td>${esc((r.category || "") + (r.subcategory ? "/" + r.subcategory : ""))}</td><td align="right"><button class="d" data-act="rule_del" data-i="${i}">Delete</button></td></tr>`).join("") || '<tr><td class="muted">No custom rules yet.</td></tr>'}</table></div>
  <details class="card"><summary><b>Advanced: edit rules as JSON</b></summary><textarea id="r_json" rows="10">${esc(JSON.stringify(S.rules, null, 2))}</textarea><div class="row"><button class="b" data-act="rules_json">Save JSON</button></div>
  <div class="muted">Conditions: from, from_contains, from_name_any, subject_any, subject_regex, body_any (preview text), body_regex, has_attachment, sender_kind (person/bulk/automated), bulk, account, any_of, not.</div></details>
  <details class="card"><summary><b>Built-in rules (read only)</b></summary><label><input type="checkbox" id="u_builtin" ${S.use_builtin_rules ? "checked" : ""} data-act="builtin_toggle"> Use built-in rules</label><pre>${esc(JSON.stringify(MS.BUILTIN_RULES, null, 1))}</pre></details>`;
}
function vGmail() {
  const g = S.gmail, rows = Object.entries(feedStatus).map(([i, s]) => `<tr><td>#${esc(i)}</td><td>${esc(s.account || "")}</td><td class="${s.ok ? "ok" : "err"}">${s.ok ? "OK - " + s.unread + " unread" : esc(s.error)}</td><td class="muted">${new Date(s.time).toLocaleTimeString()}</td></tr>`).join("");
  return `<div class="card"><h3>Gmail background notifications</h3><label><input type="checkbox" id="g_feed" ${g.feed ? "checked" : ""}> Check my Gmail for new mail even when no Gmail tab is open</label>
  <div class="muted">Uses the unread feed of the Gmail account(s) you are signed in to in this browser. It is not an official API; if Google changes it, untick this and notifications work while a Gmail tab is open.</div>
  <label style="display:block;margin-top:8px"><input type="checkbox" id="g_auto" ${g.autoAccounts ? "checked" : ""}> Automatically include every Gmail account I open in this browser</label>
  <label class="f">Account numbers (the 0 in mail.google.com/mail/u/0 - comma separated, e.g. 0,1)</label><input id="g_acc" value="${esc(g.accounts.join(","))}">
  <label class="f">Check every (minutes, minimum 0.5)</label><input id="g_int" value="${esc(g.interval_min)}"><div class="row"><button class="b" data-act="save_gmail">Save</button><button class="g" data-act="poll">Check now</button></div>
  <table>${rows || '<tr><td class="muted">No checks yet.</td></tr>'}</table></div>
  <div class="card"><h3>Export as Gmail filters</h3><div class="muted">Turns your rules, VIP/muted/blocked/trusted senders and overrides into a file Gmail applies on its own servers, even when your browser is closed. In Gmail: Settings → See all settings → Filters and Blocked Addresses → Import filters. Gmail applies every matching filter (labels can stack), and matches whole words only. Rules that need regex or sender-kind checks are skipped.</div>
  <div class="row"><label><input type="checkbox" id="x_builtin"> include the built-in rules that can be expressed as Gmail searches</label></div>
  <div class="row"><label><input type="checkbox" id="x_arch"> skip the inbox for rules set to "never notify"</label></div>
  <div class="row"><button class="b" data-act="export_filters">Download filters (.xml)</button><span id="x_out" class="muted"></span></div></div>`;
}
function vDisplay() {
  const u = S.ui;
  return `<div class="card"><h3>In the inbox</h3><label style="display:block"><input type="checkbox" id="u_badges" ${u.badges ? "checked" : ""}> Category badges on every email</label>
  <label style="display:block"><input type="checkbox" id="u_tags" ${u.showTags ? "checked" : ""}> Show tags next to the badge</label><label style="display:block"><input type="checkbox" id="u_bar" ${u.filterBar ? "checked" : ""}> Category filter bar (bottom-left)</label>
  <label style="display:block"><input type="checkbox" id="u_dim" ${u.dimSpam ? "checked" : ""}> Dim emails flagged as spam</label>
  <label style="display:block;margin-top:8px"><input type="checkbox" id="u_pause" ${S.paused ? "checked" : ""}> Pause mailsort completely</label><div class="row"><button class="b" data-act="save_display">Save</button></div></div>
  <div class="card"><h3>Learning (on your device)</h3><label style="display:block"><input type="checkbox" id="l_on" ${S.learning.enabled ? "checked" : ""}> Let mailsort learn from my mail and corrections</label>
  <label class="f">When the rules don't know, how willing should it be to guess?</label><select id="l_th"><option value="0.5" ${S.learning.threshold >= 0.45 ? "selected" : ""}>Cautious</option><option value="0.3" ${S.learning.threshold < 0.45 && S.learning.threshold > 0.25 ? "selected" : ""}>Balanced</option><option value="0.2" ${S.learning.threshold <= 0.25 ? "selected" : ""}>Eager</option></select>
  <div class="muted" style="margin-top:6px">It has learned from ${taught} of your mails and corrections. Learning never leaves this browser, uses no AI service, and costs nothing. Fix a wrong guess with "Move…" in the badge menu and it learns from that. Guesses show a "learned" tag.</div>
  <div class="muted" style="margin-top:6px">${stats.decisions >= 20 ? "You have corrected about " + stats.corrections + " of " + stats.decisions + " emails it sorted (roughly " + Math.max(0, Math.round(100 - 100 * stats.corrections / stats.decisions)) + "% left as it was)." : "The accuracy estimate appears after about 20 emails."}</div>
  <div class="row"><button class="g" data-act="learn_reset">Forget what it learned</button></div></div>
  <div class="card"><h3>Smarter understanding (optional, experimental)</h3>
  <div class="muted">Lets the chat assistant understand looser wording by using a small AI model that runs on this computer. It sees only the sentence you type, never your email, and it only proposes: you press Apply. No model is included; see models/README.md to add one.</div>
  <label style="display:block;margin-top:8px"><input type="checkbox" id="l_ai" ${S.ai.enabled ? "checked" : ""}> Use an on-device model when the plain phrases are not enough</label>
  <label style="display:block"><input type="checkbox" id="l_tuned" ${S.ai.tuned ? "checked" : ""}> My model was fine-tuned on mailsort's training set (use the short prompt)</label>
  <div class="row"><button class="g" data-act="ai_check">Check status</button><span id="ai_out" class="muted"></span></div></div>
  <div class="card"><h3>Your data</h3><div class="muted">Everything lives in this browser profile on this device. Nothing is uploaded and there is no account.</div>
  <table><tr><td>Custom rules</td><td>${S.rules.length}</td></tr><tr><td>Sender overrides</td><td>${Object.keys(S.senders).length}</td></tr>
  <tr><td>VIP / muted / blocked / trusted senders</td><td>${S.notifications.only_senders.length} / ${S.notifications.mute_senders.length} / ${S.spam.blocked_senders.length} / ${S.spam.trusted_senders.length}</td></tr>
  <tr><td>Things it has learned from</td><td>${taught}</td></tr><tr><td>Space used</td><td>${(bytes / 1024).toFixed(1)} KB</td></tr></table>
  <div class="muted" style="margin-top:6px">It stores sender addresses and hashed word fragments for learning, never the text of your emails.</div>
  <div class="row"><button class="d" data-act="wipe_all">Delete everything mailsort has stored</button></div></div>
  <div class="card"><h3>Backup</h3><div class="row"><button class="g" data-act="backup">Download settings (.json)</button><label class="g" style="cursor:pointer">Restore from file<input type="file" id="restore" accept=".json" hidden></label>
  <button class="d" data-act="reset">Reset everything</button></div><div class="muted">Settings are stored in this browser profile only.</div></div>`;
}

const H = {
  tab: el => { if (dirty && !confirm("You have unsaved changes. Discard them?")) return; tab = el.dataset.k; render(); },
  reload_tabs: async () => { const tabs = await chrome.tabs.query({ url: ["https://mail.google.com/*", "https://mail.yahoo.com/*", "https://*.mail.yahoo.com/*"] }); tabs.forEach(t => chrome.tabs.reload(t.id)); toast(tabs.length ? "Reloaded " + tabs.length + " mail tab(s)" : "No mail tabs are open - just open Gmail or Yahoo Mail"); },
  hide_welcome: () => { welcome = false; history.replaceState(null, "", location.pathname); render(); },
  save_notif: async () => {
    const topic = val("c_ntfy"), server = val("c_ntfys") || "https://ntfy.sh";
    if (topic) {   // phone push is the only feature that talks to a server other than Gmail, so it asks first
      try { if (!(await chrome.permissions.request({ origins: [new URL(server).origin + "/*"] }))) return toast("Phone push needs permission to contact " + server, true); }
      catch (e) { return toast("That ntfy server address is not valid", true); }
    }
    return save(s => { const n = s.notifications; n.mode = $("input[name=mode]:checked").value; n.notify_categories = csv(val("n_cats")); n.mute_categories = csv(val("n_mute"));
    n.only_categories = csv(val("n_only")); n.desktop = chk("c_desktop"); n.ntfy = { topic: val("c_ntfy"), server: val("c_ntfys") || "https://ntfy.sh", detail: val("c_detail") }; n.digest = { enabled: chk("d_on"), time: val("d_t") };
    n.quiet = { enabled: chk("q_on"), start: val("q_s"), end: val("q_e") }; });
  },
  test: () => chrome.runtime.sendMessage({ type: "test" }).then(() => toast("Test sent")),
  add: el => { const v = val("add_" + el.dataset.name); if (v) save(s => { const [a, b] = LISTS[el.dataset.name]; if (!s[a][b].includes(v)) s[a][b].push(v); }); },
  del: el => save(s => { const [a, b] = LISTS[el.dataset.name]; s[a][b] = s[a][b].filter(x => x !== el.dataset.p); }),
  unassign: el => save(s => { delete s.senders[el.dataset.p]; }),
  rule_add: () => { const w = {}; if (val("r_from")) w.from = csv(val("r_from")); if (val("r_subj")) w.subject_any = csv(val("r_subj")); if (val("r_acct")) w.account = [val("r_acct")];
    if (!w.from && !w.subject_any) return toast("Add a sender or subject condition", true); if (!val("r_cat")) return toast("Pick a category", true);
    const r = { name: val("r_name") || "My rule", when: w, category: val("r_cat") }; if (val("r_sub")) r.subcategory = val("r_sub"); if (val("r_tags")) r.tags = csv(val("r_tags")); if (val("r_notify")) r.notify = val("r_notify") === "yes";
    save(s => { s.rules.unshift(r); }, "Rule added"); },
  rule_del: el => save(s => { s.rules.splice(Number(el.dataset.i), 1); }, "Rule deleted"),
  rules_json: () => { let R; try { R = JSON.parse($("#r_json").value); } catch (e) { return toast("Invalid JSON: " + e.message, true); } save(s => { s.rules = R; }, "Rules saved"); },
  save_gmail: () => save(s => { s.gmail.feed = chk("g_feed"); s.gmail.autoAccounts = chk("g_auto"); s.gmail.accounts = csv(val("g_acc")).map(Number).filter(n => Number.isInteger(n) && n >= 0); s.gmail.interval_min = Math.max(0.5, Number(val("g_int")) || 1); }),
  poll: async () => { await chrome.runtime.sendMessage({ type: "pollNow" }); toast("Checked"); load(); },
  export_filters: () => { const r = MS.exportGmailFilters(S, { includeBuiltin: chk("x_builtin"), archiveMuted: chk("x_arch") });
    download("mailsort-gmail-filters.xml", r.xml, "application/xml");
    $("#x_out").textContent = r.count + " filter(s)" + (r.skipped.length ? "; skipped (not expressible in Gmail): " + r.skipped.join(", ") : ""); },
  save_display: () => save(s => { s.ui = { badges: chk("u_badges"), showTags: chk("u_tags"), filterBar: chk("u_bar"), dimSpam: chk("u_dim") }; s.paused = chk("u_pause"); s.learning = { enabled: chk("l_on"), threshold: Number(val("l_th")) }; s.ai = { enabled: chk("l_ai"), tuned: chk("l_tuned") }; }),
  preset: el => save(s => { MS.applyPreset(s, el.dataset.k); }, "Preset applied"),
  pack_export: () => download("mailsort-rules-pack.json", JSON.stringify(MS.packExport(S, "My rules"), null, 2), "application/json"),
  wipe_all: () => { if (confirm("Delete ALL mailsort settings, rules and learning from this browser?")) chrome.storage.local.clear().then(() => { toast("Everything deleted"); load(); }); },
  ai_check: async () => { const out = $("#ai_out"); out.textContent = "Checking..."; try { const r = await chrome.runtime.sendMessage({ type: "ai-status" });
    out.textContent = !r || !r.ok ? "Could not check." : r.ready ? "Ready: model files found." : "Not installed: " + (r.library ? "" : "library missing (vendor/transformers.min.js). ") + (r.model ? "" : "model missing (models/assistant-model/)."); } catch (e) { out.textContent = "Could not check: " + e.message; } },
  learn_reset: () => { if (confirm("Forget everything mailsort learned from your mail?")) chrome.storage.local.remove("learnerDelta").then(() => { toast("Cleared"); load(); }); },
  backup: () => download("mailsort-settings.json", JSON.stringify(S, null, 2), "application/json"),
  reset: () => { if (confirm("Reset all mailsort settings?")) chrome.storage.local.remove("settings").then(() => { toast("Reset"); load(); }); }
};
document.addEventListener("input", e => { if (FIELD.test(e.target.id || "") || e.target.name === "mode") setDirty(true); });
document.addEventListener("change", e => { if (FIELD.test(e.target.id || "") || e.target.name === "mode") setDirty(true); });
$("#savebtn").addEventListener("click", () => { const f = H[SAVE_ACT[tab]]; if (f) f(); });
$("#discardbtn").addEventListener("click", () => load());
window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
document.addEventListener("click", e => { const el = e.target.closest("[data-act]"); if (!el || el.tagName === "INPUT") return; e.preventDefault(); const f = H[el.dataset.act]; if (f) f(el); });
document.addEventListener("change", e => {
  if (e.target.id === "u_builtin") save(s => { s.use_builtin_rules = e.target.checked; });
  if (e.target.id === "pack_file") { const f = e.target.files[0]; if (!f) return; f.text().then(t => { let added = 0; return MS.mutate(s => { added = MS.packImport(s, JSON.parse(t)); }).then(() => { toast(added + " rule(s) imported"); load(); }); }).catch(err => toast(err.message, true)); }
  if (e.target.id === "restore") { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const o = JSON.parse(t); MS.validate(MS.merge(MS.DEFAULTS, o)); return chrome.storage.local.set({ settings: o }).then(() => { toast("Restored"); load(); }); } catch (err) { toast(err.message, true); } }); }
});
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.status && tab === "gmail" && !document.activeElement.matches("input,textarea")) load(); });
load();
