// Hidden page that hosts the optional small on-device language model. Reachable only from this extension's own background worker.
// It never fetches anything from the internet: the library is vendor/transformers.min.js and the model files are in models/assistant-model/.
let backend = null, loading = null;

async function exists(path) {
  try { const r = await fetch(chrome.runtime.getURL(path)); return r.ok; } catch (e) { return false; }
}
async function probe() {
  const custom = await exists("vendor/backend.js");
  const library = await exists("vendor/transformers.min.js");
  const model = await exists("models/assistant-model/config.json");
  return { ready: custom || (library && model), custom, library, model };
}
async function loadBackend() {
  if (backend) return backend;
  loading = loading || (async () => {
    try { const m = await import("../../vendor/backend.js"); backend = m.default || m.backend || null; } catch (e) { backend = null; }   // custom or test backend
    if (!backend) { const m = await import("./backend-transformers.js"); backend = await m.default(); }
    return backend;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!msg || msg.target !== "offscreen" || sender.id !== chrome.runtime.id) return false;
  (async () => {
    if (msg.type === "ai-status") send(Object.assign({ ok: true }, await probe()));
    else if (msg.type === "ai-generate") {
      const p = await probe();
      if (!p.ready) { send({ ok: false, error: "not-installed" }); return; }
      const b = await loadBackend();
      send({ ok: true, text: String(await b.generate(msg.prompt)).slice(0, 6000) });
    } else send({ ok: false, error: "unknown" });
  })().catch(e => send({ ok: false, error: String((e && e.message) || e).slice(0, 200) }));
  return true;
});
