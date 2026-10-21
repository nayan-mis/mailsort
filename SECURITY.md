# Security policy

## Reporting a vulnerability

Please report security problems **privately**, using GitHub's **Report a vulnerability** button on this repository's Security tab. Please do not open a public issue.

Include what you found, how to reproduce it, and what you think the impact is. We aim to acknowledge a report within a few days and to fix confirmed problems promptly. Please do not include real email content.

## Supported versions

Only the latest release receives fixes while the project is in beta.

## What we consider in scope

- Anything that lets an email, a web page or another extension make mailsort do something the user did not ask for.
- Anything that sends data off the device, or stores more than described in [PRIVACY.md](PRIVACY.md).
- Anything that lets the assistant or the optional model take an action outside the catalog.

## Design rules we hold ourselves to

These are enforced by `tests/unit/privacy-audit.test.js` in CI.

- Permissions are limited to `storage`, `notifications`, `alarms` and `offscreen`, plus Gmail and Yahoo Mail pages.
- Only two network call sites exist: Gmail's unread feed, and an optional push server chosen by the user. The hidden model page may only fetch the extension's own files.
- No `eval`, no remote code, no `innerHTML` in the scripts that run inside mail pages, no analytics.
- Text that comes from an email is only ever displayed as plain text.
- The catalog (`extension/src/core/catalog.js`) is the single list of what a rule may do. Forwarding, auto-replies, sending mail, permanent deletion and delegation are blocked and rejected with a reason.

## The optional on-device model

Off by default, and no model is included. When enabled it runs in a hidden extension page with no network access of its own. It is shown only the sentence the user types, never email text or sender names, so an email cannot steer it. Its answer is only a proposal: it is parsed against a fixed list of actions, every target passes the same checks as a typed command, and nothing changes until the user presses **Apply**.
