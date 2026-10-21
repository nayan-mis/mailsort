# Architecture

mailsort is a Manifest V3 browser extension written in plain JavaScript: no build step, no bundler, no third-party code. This page explains how the pieces fit together.

## The idea

Models and phrase parsers only **translate**; code **decides and acts**. Everything a rule can match on or do is written down once, in a fixed catalog. A person's sentence becomes a catalog rule, the rule is validated, shown back in plain English, and only then applied.

```text
sentence -> normalize -> parse (phrases, or optional model) -> validate against the catalog -> describe -> confirm -> apply -> Undo
```

## Modules

| Path | Responsibility |
|---|---|
| `extension/src/core/engine.js` | Builds an email's features, runs the rules, scores spam, decides whether to notify |
| `extension/src/core/learner.js` | The tiny on-device classifier and its seed examples |
| `extension/src/core/catalog.js` | The catalog of conditions and actions; validation, per-place checks, compilers to the page engine and to Gmail filters |
| `extension/src/core/commands.js` | The assistant's phrase grammar and the validator for an optional model's answers |
| `extension/src/core/normalize.js` | Cleans up text (Latin accents, invisible characters) without touching Hindi |
| `extension/src/content/content.js` | Runs inside Gmail and Yahoo: reads the inbox list through site adapters, draws badges and the filter bar, opens the sender menu |
| `extension/src/content/chat.js` | The assistant window |
| `extension/src/background/background.js` | Notifications, the Gmail unread-feed check, the daily digest, the relay to the optional model |
| `extension/src/pages/` | The settings page and the toolbar popup |
| `extension/src/ai/` | The hidden page that can host an optional model |

`core/` has no knowledge of the browser page and is loaded in every context (content script, background worker, settings page), which is why the same rules give the same answer everywhere.

## From inbox row to badge

1. A **site adapter** in `content.js` turns a row of the inbox list into `{ from_addr, from_name, subject, snippet, unread, has_attachment }`. This is the only site-specific code; when Gmail or Yahoo change their layout, this block is what needs updating.
2. `MS.build` derives features: the sender's domain, whether it looks like a person, a mass mailing or an automated sender, and so on.
3. `MS.classify` runs your rules, then the built-in rules, and, if nothing specific matched, asks the learner. It then scores spam and decides about notification.
4. The page shows the result. Results are cached per row and recomputed only when the email or your settings change.

## Notifications

- **Gmail:** the background worker polls the signed-in account's unread feed on an alarm. The first poll only records what is there. New entries go through the same `classify` and notification decision as everything else.
- **Yahoo (and Gmail when the feed is off):** the content script notices new unread rows at the top of the list and sends them to the background worker. A batch of more than three at once is treated as a page change, not as new mail.
- The background worker de-duplicates, respects quiet hours, and either shows a browser notification, sends a push, or adds the mail to the digest.

## The assistant

`chat.js` sends text to `commands.js`, which returns a list of **steps** (set a mode, add a VIP, create a rule, filter the page, and so on). Steps that change settings are applied together in one `MS.mutate` call, with a snapshot taken first, which is what makes Undo exact.

If a sentence is not understood and the optional model is enabled, `chat.js` asks the background worker, which relays a prompt to the hidden page. The answer is parsed by `C.fromModel`: it must be JSON, every action must be one of the allowed ones, every target passes the same checks as a typed command, and the user presses **Apply**. The model never sees email text or sender names.

## What is stored

Everything is in `chrome.storage.local`, on this device:

| Key | Contents |
|---|---|
| `settings` | Mode, lists, rules, overrides, display options |
| `learnerDelta` | What the learner has learned from you (counts of hashed word fragments, and a list of hashed ids it has already seen) |
| `stats` | Two counters used for the accuracy estimate |
| `status`, `feedSeen:<n>` | The state of the Gmail unread-feed check |
| `digestQueue` | Counts of mail waiting for the daily digest |

Short-lived data (notification de-duplication) is in session storage and disappears when the browser closes.

## Trust boundaries

- **Email content is untrusted.** It is only ever displayed with `textContent` (the content script and popup never use `innerHTML`), and nothing derived from it is ever executed or sent to a model.
- **Web pages cannot talk to the extension.** There is no externally connectable surface, and the background worker rejects messages whose sender is not the extension itself.
- **Links are allow-listed.** A notification click or push link may only open a Gmail or Yahoo Mail address.
- **The model, if present, is a proposer.** It cannot act; it can only suggest a rule from the catalog for you to approve.

## Testing

| Layer | Where | What it covers |
|---|---|---|
| Unit | `tests/unit/` | Rules, spam scoring, the learner, the phrase grammar, the catalog (including a fuzz test against a reference evaluator), the model-answer validator, the training-data generator |
| Privacy audit | `tests/unit/privacy-audit.test.js` | Permissions, network call sites, forbidden APIs, allowed web addresses, personal data in the repository |
| Browser | `tests/browser/` | The real extension in Chromium against a mock inbox: badges, the filter bar, the assistant, notifications, push privacy, the settings page, hostile text everywhere |
| Docs | `tests/unit/docs-sync.test.js` | The generated catalog docs match the code |

The mock inbox reproduces the page structure we believe Gmail uses. It cannot tell us when the real page changes, which is why verification against live Gmail and Yahoo Mail is the next milestone.
