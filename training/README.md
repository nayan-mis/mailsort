# Training data for the optional on-device model
A stock small model will be hit and miss at turning loose sentences into mailsort actions. Fine-tuning it on this generated set is what makes it reliable.

    node training/make-dataset.js dataset 6000 400      # writes dataset/train.jsonl and dataset/eval.jsonl (chat format, fictional names only)

1. Fine-tune a small open-weight chat or function-calling model (roughly 270M to 600M parameters) on `train.jsonl` with any standard supervised
   fine-tuning tool. Check the base model's licence first. The short prompt in the data is the one the extension uses when you tick
   "My model was fine-tuned" in settings.
2. Run the model over `eval.jsonl`, save its raw answers as `predictions.jsonl` (`{"id": ..., "output": "..."}`), then:
       node training/eval-predictions.js dataset/eval.jsonl predictions.jsonl
   Only ship it if the exact-match rate is high enough for you. The extension never trusts the model anyway (see SECURITY.md), but a weak model just makes more "I could not do that" replies.
3. Convert and quantise to a browser-friendly format, then follow `extension/models/README.md`.

The generator prints how much of the eval set the built-in typed-phrase parser already gets right on its own, so you can see what the model adds.
