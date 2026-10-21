/* mailsort in-page script: badges, category filter bar, sender menu, and (Yahoo / fallback) new-mail detection.
 * The only site-specific part is the ADAPTERS block - if Gmail or Yahoo change their page markup, adjust the selectors there. */
(function () {
  "use strict";
  if (window.__mailsortLoaded) return;
  window.__mailsortLoaded = true;

  const SITE = /google/.test(location.hostname) ? "gmail" : "yahoo";
  const txt = el => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const emailIn = s => ((s || "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [""])[0];
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
  function h(tag, attrs) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => k === "class" ? (el.className = attrs[k]) : el.setAttribute(k, attrs[k]));
    for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); }
    return el;
  }

  // ------------------------------------------------------------------ ADAPTERS (site-specific selectors)
  const GMAIL = {
    rows: () => document.querySelectorAll("tr.zA"),
    parse(row) {
      const s = row.querySelector("span[email]");
      const idEl = row.querySelector("[data-legacy-thread-id]");
      return {
        from_addr: s ? s.getAttribute("email") : "",
        from_name: s ? (s.getAttribute("name") || txt(s)) : "",
        subject: txt(row.querySelector("span.bog")),
        snippet: txt(row.querySelector("span.y2")).replace(/^[-–—]\s*/, ""),
        unread: row.classList.contains("zE"),
        has_attachment: !!row.querySelector("img[alt*='ttachment' i], [aria-label*='ttachment' i]"),
        id: idEl ? idEl.getAttribute("data-legacy-thread-id") : ""
      };
    },
    checkbox: row => row.querySelector('td.oZ-x3 [role="checkbox"], div[role="checkbox"]'),
    anchor: row => row.querySelector("div.y6") || (row.querySelector("span.bog") || {}).parentElement,
    account() {
      const a = document.querySelector('a[aria-label*="@"]');
      return emailIn(a && a.getAttribute("aria-label")) || emailIn(document.title);
    },
    openUrl(item) {
      const u = (location.pathname.match(/\/mail\/u\/(\d+)/) || [0, "0"])[1];
      return "https://mail.google.com/mail/u/" + u + "/#inbox" + (item.id ? "/" + item.id : "");
    }
  };

  const YAHOO = {
    rows() {
      let r = document.querySelectorAll('[data-test-id="message-list-item"]');
      if (!r.length) r = document.querySelectorAll('ul[role="listbox"] > li, div[role="listbox"] > [role="option"]');
      return r;
    },
    parse(row) {
      const q = sel => row.querySelector(sel);
      const fromEl = q('[data-test-id="senders"], [data-test-id="message-from"], [data-test-id="from"], [data-test-id="sender"]');
      const subjEl = q('[data-test-id="message-subject"], [data-test-id="subject"]');
      const snipEl = q('[data-test-id="message-snippet"], [data-test-id="snippet"], [data-test-id="message-preview"]');
      let from_name = txt(fromEl), subject = txt(subjEl), snippet = txt(snipEl);
      const from_addr = emailIn(fromEl && (fromEl.getAttribute("title") || fromEl.getAttribute("data-email") || fromEl.getAttribute("aria-label")));
      if (!subject) {                      // selectors missed: fall back to the row's visible text lines (sender, subject, preview)
        const lines = (row.innerText || "").split("\n").map(x => x.trim()).filter(Boolean);
        from_name = from_name || lines[0] || ""; subject = lines[1] || ""; snippet = snippet || lines.slice(2).join(" ");
      }
      return {
        from_addr, from_name, subject, snippet,
        unread: /unread/i.test(row.getAttribute("aria-label") || "") || !!q('[data-test-id="unread"], [aria-label*="nread" i]') || /unread/i.test(row.className),
        has_attachment: !!q('[data-test-id*="attachment" i], [aria-label*="ttachment" i]'),
        id: row.getAttribute("data-test-mid") || row.getAttribute("data-mid") || ""
      };
    },
    anchor(row) {
      const s = row.querySelector('[data-test-id="message-subject"], [data-test-id="subject"]');
      return (s && s.parentElement) || row;
    },
    checkbox: row => row.querySelector('[role="checkbox"], input[type="checkbox"]'),
    account: () => emailIn(document.title),
    openUrl: () => location.href
  };
  const AD = SITE === "gmail" ? GMAIL : YAHOO;

  // ------------------------------------------------------------------ state
  let S = null, brain = null, brainVer = 0, savingOwn = false, settingsVer = 0, scanTimer = null, viewKey = "", baselineUntil = 0, activeFilter = "", collapsed = false;
  const seen = new Set(), autoAdded = new Set(), decided = new Set();
  let pending = { decisions: 0, corrections: 0 }, welcomeShown = false, toastTimer = null;
  const HUES = { Security: [0, 70], Finance: [140, 60], Shopping: [28, 85], Travel: [180, 65], Jobs: [270, 60], Social: [210, 75], Developer: [195, 40],
    Work: [235, 65], Personal: [330, 65], Promotions: [45, 85], Subscriptions: [220, 15], Automated: [220, 10], Spam: [355, 80], Other: [220, 8] };
  const hueOf = c => HUES[c] || [(parseInt(hash(c), 10) % 360 + 360) % 360, 55];
  const fullName = res => res.category + (res.subcategory ? "/" + res.subcategory : "");
  const LISTS = { vip: ["notifications", "only_senders"], mute: ["notifications", "mute_senders"], block: ["spam", "blocked_senders"], trust: ["spam", "trusted_senders"] };

  // ------------------------------------------------------------------ decorate rows
  function buildWrap(c, sig, row) {
    const res = c.res, hue = hueOf(res.category);
    const label = res.category + (res.subcategory && res.subcategory !== res.category ? " · " + res.subcategory.slice(0, 18) : "");
    const wrap = h("span", { class: "ms-wrap" });
    const badge = h("span", { class: "ms-badge", role: "button", tabindex: "0", "aria-label": "mailsort: " + label + ". Press Enter for options.",
      style: "--h:" + hue[0] + ";--s:" + hue[1] + "%", title: res.learnedApplied ? "mailsort guessed this - click to confirm or fix" : "mailsort: click for options" }, label);
    wrap.append(badge);
    if (S.ui.showTags) {
      res.tags.filter(t => !/^priority-/.test(t) && t !== "spam" && t !== res.category.toLowerCase()).slice(0, 3).forEach(t => wrap.append(h("span", { class: "ms-tag" }, t)));
      if (res.priority === "urgent") wrap.append(h("span", { class: "ms-tag" }, "!"));
    }
    wrap.__sig = sig; wrap.__row = row;
    return wrap;
  }
  function decorate(row, c) {
    const res = c.res;
    const sig = [res.category, res.subcategory, res.tags.join(","), res.spam_score, S.ui.showTags].join("|");
    const old = row.querySelector(".ms-wrap");
    if (old && old.__sig === sig) return;
    const anchor = AD.anchor(row);
    if (!anchor) return;
    const nw = buildWrap(c, sig, row);
    if (old) old.replaceWith(nw); else anchor.insertBefore(nw, anchor.firstChild);
  }
  function unhide(row) { if (row.__msHidden) { row.style.display = row.__msPrev || ""; row.__msHidden = false; } }
  function cleanup() {
    document.querySelectorAll(".ms-wrap").forEach(e => e.remove());
    document.querySelectorAll(".ms-dim").forEach(e => e.classList.remove("ms-dim"));
    AD.rows().forEach(unhide);
    const bar = document.getElementById("ms-bar"); if (bar) bar.remove();
  }

  // ------------------------------------------------------------------ main scan
  function scan() {
    scanTimer = null;
    try { doScan(); } catch (e) { console.debug("[mailsort]", e); }
  }
  function schedule() { if (!scanTimer) scanTimer = setTimeout(scan, 300); }

  function doScan() {
    if (!S) return;
    if (S.paused) { cleanup(); return; }
    const vk = location.pathname + "|" + location.hash.split("/")[0];
    if (vk !== viewKey) { viewKey = vk; baselineUntil = Date.now() + 4000; seen.clear(); activeFilter = ""; }
    const inBaseline = Date.now() < baselineUntil;
    const account = AD.account();
    if (SITE === "gmail") {      // "connect" step: any Gmail account you open gets included in the background check
      const u = Number((location.pathname.match(/\/mail\/u\/(\d+)/) || [])[1]);
      if (Number.isInteger(u) && S.gmail.autoAccounts !== false && !S.gmail.accounts.includes(u) && !autoAdded.has(u)) {
        autoAdded.add(u);
        MS.mutate(s => { if (!s.gmail.accounts.includes(u)) s.gmail.accounts.push(u); }).catch(() => {});
      }
    }
    const counts = new Map(), subs = new Map(), fresh = [], samples = [];
    let total = 0;
    Array.from(AD.rows()).forEach((row, i) => {
      let item;
      try { item = AD.parse(row); } catch (e) { return; }
      if (!item || !(item.subject || item.from_addr || item.from_name)) return;
      item.account = account;
      const idKey = item.id || hash(item.from_addr + "|" + item.from_name + "|" + item.subject);
      item.id = idKey;
      const ckey = idKey + "|" + item.subject + "|" + settingsVer + "|" + brainVer;
      let c = row.__ms;
      if (!c || c.key !== ckey) {
        const m = MS.build(item);
        c = row.__ms = { key: ckey, m, res: MS.classify(m, S, brain), item };
        if (brain && S.learning.enabled) MS.learnFrom(brain, m, c.res, S);   // teach only from decisions the rules or the user made
      }
      const res = c.res, full = fullName(res);
      total++;
      if (!decided.has(idKey)) { decided.add(idKey); pending.decisions++; }
      if (samples.length < 40) samples.push({ row, c });
      counts.set(res.category, (counts.get(res.category) || 0) + 1);
      subs.set(full, (subs.get(full) || 0) + 1);
      if (S.ui.badges) decorate(row, c); else { const w = row.querySelector(".ms-wrap"); if (w) w.remove(); }
      const show = !activeFilter || full === activeFilter || res.category === activeFilter;
      if (show) unhide(row); else if (!row.__msHidden) { row.__msPrev = row.style.display; row.style.display = "none"; row.__msHidden = true; }
      row.classList.toggle("ms-dim", S.ui.dimSpam && res.category === "Spam");
      if (item.unread && !seen.has(idKey) && !inBaseline && i < 10) fresh.push(item);
      seen.add(idKey);
    });
    // New mail shows up one to three rows at a time; a bigger jump is just a page/view change.
    if (fresh.length && fresh.length <= 3 && (SITE === "yahoo" || !S.gmail.feed)) {
      fresh.forEach(it => {
        try {
          chrome.runtime.sendMessage({ type: "notify", item: { from_addr: it.from_addr, from_name: it.from_name, subject: it.subject, snippet: it.snippet,
            account, unread: true, has_attachment: it.has_attachment, url: AD.openUrl(it) } }).catch(() => {});
        } catch (e) { /* extension was reloaded; page needs a refresh */ }
      });
    }
    renderBar(counts, subs, total);
    maybeWelcome(samples);
  }

  // ------------------------------------------------------------------ filter bar
  function renderBar(counts, subs, total) {
    let bar = document.getElementById("ms-bar");
    if (!S.ui.filterBar || !total) { if (bar) bar.remove(); return; }
    if (!bar) { bar = h("div", { id: "ms-bar" }); document.body.appendChild(bar); }
    bar.className = collapsed ? "ms-collapsed" : "";
    bar.textContent = "";
    bar.append(h("div", { class: "ms-head" }, h("b", {}, "mailsort"), h("span", {}, total + " on this page"),
      h("button", { class: "ms-x", "data-ms-collapse": "1" }, collapsed ? "▴" : "▾")));
    const chips = h("div", { class: "ms-chips" });
    const chip = (label, key, on) => chips.append(h("button", { class: on ? "on" : "", "aria-pressed": on ? "true" : "false", "data-ms-filter": key }, label));
    chip("All " + total, "", !activeFilter);
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => chip(c + " " + n, c, activeFilter === c || activeFilter.startsWith(c + "/")));
    bar.append(chips);
    const ac = activeFilter.split("/")[0];
    const subList = Array.from(subs.entries()).filter(([k]) => ac && k.startsWith(ac + "/")).sort((a, b) => b[1] - a[1]);
    if (subList.length > 1) {
      const sc = h("div", { class: "ms-chips" });
      subList.forEach(([k, n]) => sc.append(h("button", { class: activeFilter === k ? "on" : "", "data-ms-filter": k }, k.slice(ac.length + 1) + " " + n)));
      bar.append(sc);
    }
  }


  // ------------------------------------------------------------------ toast (with undo) and first-run check
  function toast(msg, label, fn) {
    const old = document.getElementById("ms-toast"); if (old) old.remove();
    const t = h("div", { id: "ms-toast", role: "status" }, h("span", {}, msg));
    if (label) { const b = h("button", {}, label); b.addEventListener("click", e => { e.stopPropagation(); try { fn(); } catch (err) { /* ignore */ } t.remove(); }); t.append(b); }
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 8000);
  }
  function setOverride(m, v) {
    const parts = v.split("/"), p = m.from_addr, cat = parts[0].trim();
    let prev;
    return MS.mutate(s => { prev = s.senders[p]; s.senders[p] = { category: cat, subcategory: (parts[1] || "").trim() || undefined }; }).then(() => {
      if (brain) brain.learn(m, cat, 4, true);
      MS.addStats({ corrections: 1 }).catch(() => {});          // saved at once, so closing the tab can't lose it
      toast("Moved to " + v.trim(), "Undo", () => MS.mutate(s => { if (prev) s.senders[p] = prev; else delete s.senders[p]; }));
    });
  }
  function maybeWelcome(samples) {
    if (welcomeShown || !S || S.onboarding.done || samples.length < 3) return;
    const seenCat = new Set(), pick = [];
    samples.forEach(s => { const k = s.c.res.category; if (!seenCat.has(k) && pick.length < 4) { seenCat.add(k); pick.push(s); } });
    if (pick.length < 3) samples.slice(0, 4).forEach(s => { if (pick.length < 4 && !pick.includes(s)) pick.push(s); });
    welcomeShown = true;
    const card = h("div", { id: "ms-welcome", role: "dialog", "aria-label": "mailsort first check" });
    const close = h("button", { class: "ms-x", "aria-label": "Close" }, "×");
    close.addEventListener("click", () => card.remove());
    card.append(h("div", { class: "ms-head" }, h("b", {}, "Does this look right?"), close),
      h("div", { class: "ms-w-sub" }, "I sorted what is on this page. Tick or cross each one and I will learn from you."));
    pick.forEach(({ c }) => {
      const m = c.m, res = c.res, row = h("div", { class: "ms-w-row" });
      const yes = h("button", { "aria-label": "Correct" }, "✓"), no = h("button", { "aria-label": "Wrong" }, "✗");
      yes.addEventListener("click", () => { if (brain) brain.learn(m, res.category, 2, true); row.remove(); });
      no.addEventListener("click", () => {
        const v = prompt('Which category should "' + m.source + '" go to? Use Category or Category/Subcategory', res.category);
        if (v && v.trim()) setOverride(m, v).then(() => row.remove()).catch(err => alert("mailsort: " + err.message));
      });
      row.append(h("div", { class: "ms-w-txt" }, h("b", {}, m.source), h("div", { class: "ms-w-sub" }, (m.subject || "").slice(0, 60))),
        h("span", { class: "ms-w-cat" }, res.category), yes, no);
      card.append(row);
    });
    const done = h("button", { class: "on" }, "Looks good, done");
    done.addEventListener("click", () => { MS.mutate(s => { s.onboarding.done = true; }).catch(() => {}); card.remove(); });
    card.append(done);
    document.body.appendChild(card);
  }

  // ------------------------------------------------------------------ sender menu
  function closeMenu() { const m = document.getElementById("ms-menu"); if (m) m.remove(); }
  const getList = (s, name) => s[LISTS[name][0]][LISTS[name][1]];
  function openMenu(badge) {
    closeMenu();
    const row = badge.parentElement && badge.parentElement.__row, c = row && row.__ms;
    if (!c) return;
    const m = c.m, res = c.res;
    const menu = h("div", { id: "ms-menu" });
    menu.append(h("div", { class: "ms-m-title" }, m.source), h("div", { class: "ms-m-sub" }, m.synthetic ? "(address hidden by this site - matching by name)" : m.from_addr));
    const why = (res.reasons.filter(r => !/^tag:/.test(r)).join(", ") || "no rule matched") + (res.spam_score ? " | spam " + res.spam_score + ": " + res.spam_reasons.join("; ") : "") + " | notify: " + (res.notify_final ? "yes" : "no") + " (" + res.notify_why + ")";
    menu.append(h("div", { class: "ms-m-why" }, "Why: " + why));
    let dom = null;
    if (m.domain) { dom = h("input", { type: "checkbox" }); menu.append(h("label", { class: "ms-m-opt" }, dom, " apply to everyone @" + m.domain)); }
    const pattern = () => (dom && dom.checked ? "@" + m.domain : m.from_addr);
    const btns = h("div", { class: "ms-m-btns" });
    const names = { vip: "VIP", mute: "Mute", block: "Block", trust: "Trust" };
    Object.keys(names).forEach(k => {
      const on = getList(S, k).some(p => MS.matchAddr(p, m.from_addr));
      btns.append(h("button", { class: on ? "on" : "", "data-k": k }, (on ? "✓ " : "") + names[k]));
    });
    if (res.learnedApplied) btns.append(h("button", { class: "on", "data-k": "confirm" }, "✓ Yes, it's " + res.category));
    btns.append(h("button", { "data-k": "move" }, "Move…"), h("button", { "data-k": "settings" }, "Settings"));
    menu.append(btns);
    menu.addEventListener("click", async e => {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k) return;
      e.stopPropagation();
      try {
        if (k === "settings") chrome.runtime.sendMessage({ type: "openOptions" });
        else if (k === "confirm") { if (brain) brain.learn(m, res.category, 3, true); toast("Thanks - I will remember that"); }
        else if (k === "move") {
          const v = prompt('Move mail from "' + m.source + '" to which category? Use Category or Category/Subcategory', res.category + (res.subcategory ? "/" + res.subcategory : ""));
          if (v && v.trim()) await setOverride(Object.assign({}, m, { from_addr: pattern() }), v);
        } else {
          const p = pattern();
          await MS.mutate(s => { const arr = getList(s, k); const i = arr.findIndex(x => MS.matchAddr(x, m.from_addr));
            if (i >= 0) arr.splice(i, 1); else arr.push(p); });
        }
      } catch (err) { alert("mailsort: " + err.message); }
      closeMenu();
    });
    document.body.appendChild(menu);
    const r = badge.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - 266)) + "px";
    menu.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)) + "px";
  }

  document.addEventListener("click", e => {
    const t = e.target;
    const badge = t.closest && t.closest(".ms-badge");
    if (badge) { e.preventDefault(); e.stopPropagation(); openMenu(badge); return; }
    const bar = t.closest && t.closest("#ms-bar");
    if (bar) {
      e.stopPropagation();
      if (t.dataset.msCollapse) { collapsed = !collapsed; schedule(); }
      else if (t.dataset.msFilter !== undefined) { activeFilter = t.dataset.msFilter; schedule(); }
      return;
    }
    if (!(t.closest && t.closest("#ms-menu"))) closeMenu();
  }, true);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeMenu();
    else if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("ms-badge")) { e.preventDefault(); e.stopPropagation(); openMenu(e.target); }
  }, true);


  // ------------------------------------------------------------------ bridge for the chat assistant (chat.js)
  const isChecked = cb => cb.getAttribute("aria-checked") === "true" || cb.checked === true;
  MS.page = {
    site: SITE,
    settings: () => S,
    rows: () => Array.from(AD.rows()).filter(r => r.__ms).map(r => ({ row: r, m: r.__ms.m, res: r.__ms.res })),
    setFilter(v) { activeFilter = v || ""; schedule(); },
    count(pred) { return this.rows().filter(x => pred(x.m, x.res)).length; },
    select(pred) {                        // ticks the checkbox of every visible matching row; never deletes anything
      let matched = 0, ticked = 0;
      this.rows().forEach(({ row, m, res }) => {
        if (row.__msHidden || !pred(m, res)) return;
        matched++;
        const cb = AD.checkbox(row);
        if (cb && !isChecked(cb)) { cb.click(); ticked++; }
      });
      return { matched, ticked };
    },
    unselect() {
      let n = 0;
      this.rows().forEach(({ row }) => { const cb = AD.checkbox(row); if (cb && isChecked(cb)) { cb.click(); n++; } });
      return n;
    }
  };

  // ------------------------------------------------------------------ wiring
  const ours = n => n.nodeType === 1 && (n.id === "ms-chat" || n.id === "ms-chat-btn" || n.id === "ms-bar" || n.id === "ms-menu" || n.id === "ms-welcome" || n.id === "ms-toast" || n.classList.contains("ms-wrap"));
  new MutationObserver(muts => {
    for (const mu of muts) {
      const tgt = mu.target.nodeType === 1 ? mu.target : mu.target.parentElement;
      if (tgt && tgt.closest && tgt.closest("#ms-chat,#ms-chat-btn,#ms-bar,#ms-menu,#ms-welcome,#ms-toast,.ms-wrap")) continue;
      if ([].concat(Array.from(mu.addedNodes), Array.from(mu.removedNodes)).every(ours) && (mu.addedNodes.length || mu.removedNodes.length)) continue;
      schedule(); return;
    }
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(schedule, 3000);
  window.addEventListener("hashchange", schedule);

  chrome.storage.onChanged.addListener((c, area) => {
    if (area === "local" && c.settings) { S = MS.merge(MS.DEFAULTS, c.settings.newValue || {}); settingsVer++; schedule(); }
  });
  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (msg && msg.type === "diag") {
      const rows = Array.from(AD.rows());
      send({ site: SITE, rows: rows.length, decorated: document.querySelectorAll(".ms-wrap").length, account: AD.account(),
        sample: rows.slice(0, 3).map(r => { try { const it = AD.parse(r); return (it.from_addr || it.from_name) + " - " + it.subject; } catch (e) { return "parse error"; } }) });
    }
  });
  MS.loadBrain().then(b => { brain = b; brainVer++; schedule(); });
  const flushStats = () => { if (pending.decisions) { const d = pending; pending = { decisions: 0, corrections: 0 }; MS.addStats(d).catch(() => {}); } };
  setInterval(flushStats, 6000);
  window.addEventListener("pagehide", flushStats);
  setInterval(() => { if (brain && brain.dirty && !savingOwn) { savingOwn = true; MS.saveBrain(brain).finally(() => setTimeout(() => { savingOwn = false; }, 500)); } }, 5000);
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.learnerDelta && !savingOwn && !(brain && brain.dirty)) MS.loadBrain().then(b => { brain = b; brainVer++; schedule(); });
  });
  chrome.storage.local.get("settings").then(r => { S = MS.merge(MS.DEFAULTS, r.settings || {}); schedule(); });
})();
