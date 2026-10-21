# Permissions

mailsort asks for the least that makes each feature work. The test `tests/unit/privacy-audit.test.js` fails if this list grows without the test being changed on purpose.

| Permission | Why it is needed |
|---|---|
| `storage` | Saves your settings, rules, sender lists and what the learner has learned, in this browser only |
| `notifications` | Shows a desktop notification for mail from senders you chose |
| `alarms` | Schedules the periodic Gmail check and the daily digest |
| `offscreen` | Hosts a hidden page for the optional on-device model. Unused unless you add a model |
| Access to `mail.google.com` | Reads the visible inbox list to add badges, and fetches the signed-in account's own unread feed to detect new mail |
| Access to `mail.yahoo.com` (and its subdomains) | Reads the visible inbox list to add badges and detect new mail |
| Optional access to a server you name | Requested only if you turn on phone push, so notification text can be sent to the push server you chose |

Also in the manifest: a content security policy of `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. The WebAssembly allowance exists only so the optional model can run. It does not allow `eval` or remote code.

## What is deliberately absent

No `tabs`, `history`, `cookies`, `webRequest`, `identity` or `scripting`. No access to other websites. The extension cannot be reached by web pages or by other extensions, and its background worker ignores any message that does not come from its own pages and scripts.
