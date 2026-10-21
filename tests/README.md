# Tests

```sh
npm test                          # from the repository root: unit tests and the privacy audit
sh scripts/run-browser-tests.sh   # real Chromium against a mock inbox
```

## Unit tests (`tests/unit`)

Plain Node, no dependencies. `run-all.js` runs them all.

| File | Covers |
|---|---|
| `engine.test.js` | rules, spam scoring, notification modes, Gmail filter export |
| `commands.test.js` | the assistant's phrase grammar and its safety rules |
| `catalog.test.js` | the catalog: validation, compilers, per-place checks, a fuzz test against a reference evaluator, the text normalizer |
| `model-validator.test.js` | that an optional model's answer can never do anything outside the allowed list |
| `learner.test.js` | the learner on 35 hard held-out sentences |
| `hardening.test.js` | link allow-list, input cleaning, presets, rule packs, Hindi and Hinglish |
| `training.test.js` | the training-data generator and scorer |
| `docs-sync.test.js` | that `docs/catalog.md` matches the code |
| `privacy-audit.test.js` | permissions, network call sites, forbidden APIs, personal data in the repository |

## Browser tests (`tests/browser`)

They load the real extension into Chromium with Playwright and drive a mock Gmail-style inbox (`mockmail.py`, all senders fictional).

```sh
pip install playwright
playwright install chromium
sh scripts/run-browser-tests.sh   # on a machine with no display: xvfb-run -a sh scripts/run-browser-tests.sh
```

| File | Covers |
|---|---|
| `test_core_flows.py` | badges, filter bar, sender menu, first-run check, undo, notifications, push privacy, digest, settings |
| `test_welcome_savebar_and_hostile_data.py` | the welcome page, unsaved-changes bar, and hostile text in every screen |
| `test_assistant.py` | the chat box: rules, undo, filtering, selecting, refusals, keyboard isolation |
| `test_optional_model.py` | the optional model path with a stand-in model, and the "not installed" path |

The mock inbox cannot notice when the real Gmail or Yahoo page changes. Before a release, also open your own mail, press the toolbar icon, and use **Check this page**.
