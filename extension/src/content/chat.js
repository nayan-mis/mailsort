/* mailsort assistant: a small chat window on top of Gmail / Yahoo Mail. Type what you want ("mute linkedin", "notify me only
 * for boss@example.com", "if the subject contains invoice, make it Finance") and it changes mailsort's own settings.
 * Everything is understood on this device by commands.js; nothing is sent anywhere. It never deletes or sends mail. */
(function () {
  "use strict";
  if (window.__mailsortChat || !window.MS || !MS.page || !MS.Commands) return;
  window.__mailsortChat = true;
  const C = MS.Commands;
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => k === "class" ? (el.className = attrs[k]) : el.setAttribute(k, attrs[k]));
    kids.forEach(c => { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  };
  const undoStack = [];
  let panel = null, log = null, input = null;

  function context() {
    const rows = MS.page.rows(), s = MS.page.settings() || MS.DEFAULTS;
    const cats = new Set();
    rows.forEach(r => cats.add(r.res.category));
    s.rules.forEach(r => r.category && cats.add(r.category));
    Object.keys(s.senders).forEach(k => s.senders[k].category && cats.add(s.senders[k].category));
    return { categories: [...cats], senders: rows.map(r => ({ addr: r.m.from_addr, source: r.m.source, org: r.m.org, domain: r.m.domain, category: r.res.category })) };
  }
  const matcher = t => t.kind === "category"
    ? (m, res) => res.category === t.category
    : (m) => MS.matchAddr(t.pattern, m.from_addr);

  function say(who, text, undoable) {
    const bubble = h("div", { class: "ms-c-msg ms-c-" + who }, h("div", { class: "ms-c-text" }, text));
    if (undoable) {
      const u = h("button", { class: "ms-c-undo" }, "Undo");
      u.addEventListener("click", () => { u.remove(); handle("undo", true); });
      bubble.append(u);
    }
    log.append(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  async function snapshotMutate(fn) {
    let before = null;
    await MS.mutate(s => { before = JSON.parse(JSON.stringify(s)); fn(s); });
    undoStack.push(before); if (undoStack.length > 20) undoStack.shift();
  }

  // Runs a list of steps exactly as if the user had typed them. Returns the reply lines and whether anything is undoable.
  async function execute(steps) {
    const lines = [], settingsSteps = [];
    for (const st of steps) {
      if (C.isSettingsStep(st)) settingsSteps.push(st);
      else if (st.type === "help") lines.push(C.help());
      else if (st.type === "list") lines.push(C.describe(MS.page.settings(), st.what));
      else if (st.type === "undo") {
        const snap = undoStack.pop();
        if (!snap) { lines.push("Nothing to undo."); continue; }
        await MS.mutate(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, snap); });
        lines.push("Undone.");
      } else if (st.type === "ui_clear") { MS.page.setFilter(""); lines.push("Showing everything again."); }
      else if (st.type === "ui_unselect") { lines.push("Unselected " + MS.page.unselect() + " email(s)."); }
      else if (st.type === "ui_filter") {
        const t = st.target; const n = MS.page.count(matcher(t));
        if (t.kind === "category") { MS.page.setFilter(t.category); lines.push("Showing " + t.category + " (" + n + " on this page). Say \"show all\" to clear."); }
        else lines.push(n ? "I found " + n + " email(s) from " + t.label + " on this page. Say \"select all from " + t.label + "\" to tick them." : "I don't see any mail from " + t.label + " on this page.");
      } else if (st.type === "ui_count") { const n = MS.page.count(matcher(st.target)); lines.push(n + " email(s) from " + (st.target.label || st.target.category) + " on this page."); }
      else if (st.type === "ui_select") {
        const res = MS.page.select(matcher(st.target)), label = st.target.label || st.target.category;
        lines.push(res.matched ? "Selected " + res.matched + " email(s) from " + label + "." + (st.wasDelete ? " I never delete mail myself: press Delete in Gmail's toolbar if you want them in the Trash, or say \"unselect\" to cancel." : " Now use Gmail's own buttons on them.") : "No visible mail from " + label + " on this page.");
      }
    }
    let changed = false;
    if (settingsSteps.length) {
      const msgs = [];
      try {
        await snapshotMutate(s => { settingsSteps.forEach(st => { msgs.push(C.apply(st, s)); }); });
        lines.unshift(...msgs); changed = true;
      } catch (e) { lines.unshift("I could not do that: " + e.message); }
    }
    return { lines, changed };
  }

  // The optional small on-device model: it only ever PROPOSES. The user sees the plain-language list and presses Apply.
  async function askModel(text, ctx) {
    const s = MS.page.settings();
    if (!s || !s.ai || !s.ai.enabled) return null;
    const thinking = say("bot", "Thinking... (the first answer can take a while as the model starts)");
    let resp;
    try { resp = await chrome.runtime.sendMessage({ type: "ai-parse", prompt: C.modelPrompt(text, ctx, { fewShot: !s.ai.tuned }) }); }
    catch (e) { resp = { ok: false, error: String((e && e.message) || e) }; }
    thinking.remove();
    if (!resp || !resp.ok) {
      say("bot", resp && resp.error === "not-installed"
        ? "Smarter understanding is turned on, but no model is installed yet. See models/README.md, or turn it off in Settings > Display & backup."
        : "The on-device model could not answer" + (resp && resp.error ? " (" + resp.error + ")" : "") + ".");
      return { handled: true };
    }
    const m = C.fromModel(resp.text, ctx);
    if (!m.steps.length) { say("bot", ["I could not turn that into something safe I can do.", ...m.errors, "Say \"help\" to see what I can do."].join("\n")); return { handled: true }; }
    proposal(m);
    return { handled: true };
  }
  function proposal(m) {
    const bubble = h("div", { class: "ms-c-msg ms-c-bot" }, h("div", { class: "ms-c-text" },
      ["I think you mean:", ...m.steps.map(s => "- " + C.describeStep(s)), ...m.errors, "This is a suggestion from the small on-device assistant, so please check it."].join("\n")));
    const apply = h("button", { class: "ms-c-undo" }, "Apply"), cancel = h("button", { class: "ms-c-undo" }, "Cancel");
    apply.addEventListener("click", async () => { bubble.querySelectorAll("button").forEach(b => b.remove()); const r = await execute(m.steps); say("bot", r.lines.join("\n") || "Done.", r.changed); });
    cancel.addEventListener("click", () => { bubble.querySelectorAll("button").forEach(b => b.remove()); say("bot", "Okay, nothing changed."); });
    bubble.append(apply, cancel);
    log.append(bubble); log.scrollTop = log.scrollHeight;
  }

  async function handle(text, silentUser) {
    text = String(text || "").trim();
    if (!text) return;
    if (!silentUser) say("user", text);
    const ctx = context();
    const r = C.parse(text, ctx);
    if (!r.steps.length && !r.unknown.some(u => u.error)) {        // plain phrases did not understand it: ask the optional model
      const m = await askModel(text, ctx);
      if (m && m.handled) return;
    }
    const out = await execute(r.steps);
    const lines = out.lines;
    r.unknown.forEach(u => lines.push(u.error ? u.error : "I did not understand \"" + u.clause + "\"."));
    if (r.unknown.some(u => !u.error) && !r.steps.length) lines.push("Say \"help\" to see what I can do.");
    say("bot", lines.join("\n") || "Done.", out.changed);
  }

  function build() {
    log = h("div", { class: "ms-c-log", role: "log", "aria-live": "polite" });
    input = h("input", { type: "text", placeholder: "Tell me what to do...", "aria-label": "Message to the mailsort assistant", maxlength: "400", autocomplete: "off" });
    const send = h("button", { class: "ms-c-send", type: "button" }, "Send");
    const close = h("button", { class: "ms-c-x", "aria-label": "Close assistant" }, "×");
    const chips = h("div", { class: "ms-c-chips" });
    [["Notify me only for…", "Notify me only for "], ["Mute…", "Mute "], ["Show promotions", "Show promotions", true], ["List my rules", "List my rules", true], ["Help", "Help", true]].forEach(([label, text, now]) => {
      const b = h("button", { type: "button" }, label);
      b.addEventListener("click", () => { if (now) handle(text); else { input.value = text; input.focus(); } });
      chips.append(b);
    });
    const form = h("div", { class: "ms-c-form" }, input, send);
    const go = () => { const t = input.value; input.value = ""; handle(t); };
    send.addEventListener("click", go);
    input.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") go(); if (e.key === "Escape") toggle(false); }, true);
    ["keyup", "keypress"].forEach(ev => input.addEventListener(ev, e => e.stopPropagation(), true));     // Gmail shortcuts must not fire while typing
    close.addEventListener("click", () => toggle(false));
    panel = h("div", { id: "ms-chat", role: "dialog", "aria-label": "mailsort assistant" },
      h("div", { class: "ms-c-head" }, h("div", {}, h("b", {}, "mailsort assistant"), h("div", { class: "ms-c-sub" }, "Runs on your device. Nothing is sent anywhere.")), close), log, chips, form);
    say("bot", "Hi! Tell me what you want in plain words, for example \"mute linkedin\" or \"notify me only for boss@example.com\". Say \"help\" for more. I change mailsort's settings; I never delete or send mail.");
    document.body.appendChild(panel);
  }
  function toggle(open) {
    const btn = document.getElementById("ms-chat-btn");
    if (open === undefined) open = !(panel && document.body.contains(panel));
    if (open) { if (!panel) build(); else document.body.appendChild(panel); input.focus(); if (btn) btn.setAttribute("aria-expanded", "true"); }
    else { if (panel) panel.remove(); if (btn) { btn.setAttribute("aria-expanded", "false"); btn.focus(); } }
  }
  function ensureButton() {
    if (document.getElementById("ms-chat-btn") || !document.body) return;
    const btn = h("button", { id: "ms-chat-btn", type: "button", "aria-label": "Open the mailsort assistant", "aria-expanded": "false", title: "mailsort assistant" }, "mailsort ✦");
    btn.addEventListener("click", e => { e.stopPropagation(); toggle(); });
    document.body.appendChild(btn);
  }
  // the button lives on mail pages only while mailsort is not paused
  setInterval(() => { const s = MS.page.settings(); const btn = document.getElementById("ms-chat-btn"); if (s && !s.paused) ensureButton(); else if (btn) btn.remove(); }, 1500);
  setTimeout(() => { const s = MS.page.settings(); if (s && !s.paused) ensureButton(); }, 800);
})();
