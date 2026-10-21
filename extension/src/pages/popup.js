const $ = s => document.querySelector(s);
const MODES = [["rules", "Smart"], ["only", "Only VIPs"], ["all", "Everything"], ["none", "Silent"]];
const el = (tag, attrs, text) => { const e = document.createElement(tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; return e; };

async function render() {
  const s = await MS.getSettings();
  const modes = $("#modes"); modes.textContent = "";
  MODES.forEach(([k, l]) => modes.append(el("button", { "data-m": k, class: s.notifications.mode === k ? "on" : "", "aria-pressed": String(s.notifications.mode === k) }, l)));
  $("#pause").checked = s.paused;
  const { stats = { decisions: 0, corrections: 0 }, status = {} } = await chrome.storage.local.get(["stats", "status"]);
  $("#acc").textContent = stats.decisions >= 20 ? "Left as sorted: about " + Math.max(0, Math.round(100 - 100 * stats.corrections / stats.decisions)) + "% (" + stats.corrections + " fixes)" : "Learning from your mail...";
  const box = $("#status"); box.textContent = "";
  if (!s.gmail.feed) box.textContent = "Gmail background check is off.";
  else if (!Object.keys(status).length) box.textContent = "Gmail background check starts shortly.";
  else Object.entries(status).forEach(([i, st]) => { box.append(el("div", { class: st.ok ? "ok" : "err" }, st.ok ? "Gmail #" + i + ": " + st.unread + " unread" : "Gmail #" + i + ": " + String(st.error).slice(0, 120))); });
  pageStatus();
}
async function pageStatus() {
  const where = $("#where");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const mail = tab && /^https:\/\/(mail\.google\.com|(.+\.)?mail\.yahoo\.com)\//.test(tab.url || "");
  if (!mail) { where.textContent = "Open Gmail or Yahoo Mail to use mailsort."; return; }
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "diag" });
    where.textContent = r.rows ? "Working on this page: " + r.rows + " emails sorted." : "Active, but no emails are showing in this view.";
    where.className = "m ok";
  } catch (e) { where.textContent = "Reload this tab once to switch mailsort on."; where.className = "m err"; }
}
$("#modes").addEventListener("click", async e => { const m = e.target.dataset && e.target.dataset.m; if (m) { await MS.mutate(s => { s.notifications.mode = m; }); render(); } });
$("#pause").addEventListener("change", async e => { await MS.mutate(s => { s.paused = e.target.checked; }); });
$("#opts").addEventListener("click", () => { chrome.runtime.openOptionsPage(); window.close(); });
$("#diag").addEventListener("click", async () => {
  const out = $("#out"), [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "diag" });
    out.textContent = r.site + ": found " + r.rows + " emails, badges on " + r.decorated + "." + (r.rows ? "\n" + r.sample.join("\n") : "\nNo emails found - open your inbox list, or the page markup has changed.");
  } catch (e) { out.textContent = "Open Gmail or Yahoo Mail in this tab (and reload it once after installing)."; }
});
render();
