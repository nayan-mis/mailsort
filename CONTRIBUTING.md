# Contributing

Thanks for wanting to help. mailsort is small enough that one person can understand all of it, and the plan is to keep it that way. If your idea needs a server, a database or a "platform", it is probably a different project. A good one, maybe. Just not this one.

## The promises we keep

Every change has to respect these. They are what the project is.

1. **Everything stays on the device.** No server, no analytics, no new network calls.
2. **No new permissions** without a strong reason written in the pull request.
3. **No third-party code** in the extension. It is plain JavaScript with no build step.
4. **It can only do what the catalog allows.** It must not gain the ability to delete, forward, send or reply to mail.
5. **Email content is untrusted.** It is only ever displayed as text.

`npm test` enforces most of these (see `tests/unit/privacy-audit.test.js`).

## Getting set up

You need Node 18 or newer. There is nothing to install.

```sh
git clone https://github.com/nayan-mis/mailsort.git
cd mailsort
npm test
```

Load the `extension/` folder in Chrome, Edge or Brave through `chrome://extensions`, **Developer mode**, **Load unpacked**. After editing, press the reload icon on the extension and reload the mail tab.

Browser tests drive the real extension in Chromium against a mock inbox. They need Python and Playwright (`pip install playwright && playwright install chromium`), then `sh scripts/run-browser-tests.sh`. See [tests/README.md](tests/README.md).

## Where things live

See the layout in the [README](README.md#development) and [docs/architecture.md](docs/architecture.md). In short: `extension/src/core` is the logic and has no knowledge of the page; `extension/src/content` is the part that touches Gmail and Yahoo.

## Common contributions

**A page-layout fix (most valuable).** Gmail and Yahoo change their markup. The selectors are in the `GMAIL` and `YAHOO` objects at the top of `extension/src/content/content.js`. In your issue or pull request, say which site and browser, and what **Check this page** printed. Do not paste real email content; describe the structure instead.

**A new rule or better recognition.** Built-in rules are in `extension/src/core/engine.js` (`BUILTIN_RULES`). Add a case to `tests/unit/engine.test.js` that shows the new behaviour.

**A new assistant phrasing.** See [docs/assistant.md](docs/assistant.md#adding-a-phrase). Add cases to `tests/unit/commands.test.js`.

**A new condition or action in the catalog.** Edit `extension/src/core/catalog.js`, then run `node scripts/export-catalog.js` to regenerate `docs/catalog.md` (a test fails if you forget). Anything that can destroy or send data needs a risk level and a very good reason.

**Starter examples in another language.** The learner's seed phrases are in `extension/src/core/learner.js`. Add phrases, then check `node tests/unit/learner.test.js` still passes.

## Style

- Plain JavaScript, `"use strict"`, two-space indentation (see `.editorconfig`), double quotes, semicolons.
- Prefer small named functions over clever one-liners. Comment *why*, not *what*.
- No real addresses, names or tokens anywhere, including tests and screenshots. Use `example.com`, `example.org` and `example.net`.
- Keep user-facing text short and in plain language.

## Pull requests

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Keep each pull request to one change.
3. Run `npm test`. If you touched anything the browser tests cover, run those too.
4. Fill in the pull request template and update [CHANGELOG.md](CHANGELOG.md) under *Unreleased*.

By contributing you agree your work is released under the [MIT License](LICENSE). Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).
