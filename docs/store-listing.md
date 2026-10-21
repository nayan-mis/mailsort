# Chrome Web Store listing (copy and paste)

Upload `dist/mailsort-store-<version>.zip` (made by `sh scripts/build.sh`). Edge users can install straight from the Chrome Web Store, so one listing covers Chrome, Edge and Brave. You can also submit the same zip to Edge Add-ons if you want a listing there.

**Name:** mailsort: inbox organizer for Gmail and Yahoo Mail

**Short description (132 characters max):**
Sorts Gmail and Yahoo Mail into categories, flags spam, and picks who can notify you. Runs on your device. No account.

**Category:** Productivity

**Single purpose:** Organize the inbox list in Gmail and Yahoo Mail with categories, tags and per-sender notification rules.

**Long description:**
Your inbox is mostly companies shouting. mailsort sorts it into piles, flags spam and look-alike senders, and lets you choose exactly who is allowed to notify you.

It runs entirely in your browser. There is no account, no mailsort server, no analytics and no AI service. Nothing you read or type leaves your device.

What you get: a category, subcategory and tags on every email; a filter bar; notification modes (Smart, Only my VIPs, Everything, Silent) with quiet hours and an optional daily digest; a small chat box where you type things like "mute linkedin" and get a rule with a preview and Undo; a learner that adjusts to your corrections; several Gmail accounts; some Hindi and Hinglish.

It cannot delete, forward, send or reply to mail. Those actions do not exist in the extension.

Beta note: it has been tested against a mock inbox, not yet against live Gmail and Yahoo Mail. The toolbar popup has a "Check this page" button that tells you straight away whether it can see your emails.

**Privacy policy URL:** https://nayan-mis.github.io/mailsort/privacy.html

**Permission justifications** (the store asks for each one; the full table is in permissions.md):
- storage: saves your settings, rules and what the learner has learned, in this browser only.
- notifications: shows a desktop notification for mail from senders the user chose.
- alarms: schedules the periodic Gmail check and the daily digest.
- offscreen: hosts a hidden page for an optional on-device model. Unused unless the user adds one.
- mail.google.com and mail.yahoo.com: reads the visible inbox list to add badges, and detects new mail.
- Optional host access: requested only if the user turns on phone push, for the one server they name.

**Data usage declarations:** collects nothing; does not sell or transfer user data; does not use data for unrelated purposes.

**You will also need:** at least one 1280x800 (or 640x400) screenshot, the 128px icon (already in `extension/icons`), and a one-time $5 developer registration fee. A review usually takes from a few days up to a couple of weeks, and the optional all-sites host permission may get extra scrutiny, so be ready to explain it.
