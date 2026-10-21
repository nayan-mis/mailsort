// Runtime for a small open-weight chat model using Transformers.js (Apache-2.0; see the Transformers.js project on GitHub).
// NOT TESTED against a real model: it is the one piece I could not run offline. Expect to adjust the pipeline call for your model.
// Install: put the built library at  vendor/transformers.min.js  and the model files at  models/assistant-model/  (see models/README.md).
export default async function create() {
  const { pipeline, env } = await import("../../vendor/transformers.min.js");
  env.allowRemoteModels = false;                       // never download anything: only the files shipped inside the extension
  env.allowLocalModels = true;
  env.localModelPath = chrome.runtime.getURL("models/");
  const device = navigator.gpu ? "webgpu" : "wasm";
  const generator = await pipeline("text-generation", "assistant-model", { device, dtype: device === "webgpu" ? "q4" : "q8" });
  return {
    async generate(prompt) {
      const out = await generator([{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], { max_new_tokens: 320, do_sample: false });
      const g = out[0].generated_text;
      return Array.isArray(g) ? String(g[g.length - 1].content) : String(g);
    }
  };
}
