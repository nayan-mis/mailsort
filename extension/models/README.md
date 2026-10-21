# Optional: a small on-device language model (experimental)
mailsort works without any model. If you want the assistant to also understand looser wording ("stop the job site pinging me"),
you can add a small open-weight model. It runs in a hidden extension page on your own computer, never downloads anything, and its
answers are only proposals: you press Apply before anything changes. It sees only the sentence you type, never your email.

1. Put the built Transformers.js file at `vendor/transformers.min.js`.
2. Put your model's files (ONNX weights, tokenizer, config) in `models/assistant-model/` so that `models/assistant-model/config.json` exists.
3. Reload the extension, then Settings > Display & backup > "Smarter understanding" > turn on, and press "Check status".

Good candidates are small function-calling models of roughly 270M to 600M parameters. For reliable results, fine-tune one on the dataset
from `training/` in the repository: a stock model will be hit and miss. Check the model's licence before you ship it inside a package.
The model runner in `ai/backend-transformers.js` has not been tested against a real model.
