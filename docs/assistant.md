# The assistant

A chat box on top of Gmail and Yahoo Mail. Click the blue **mailsort ✦** button. It turns plain sentences into changes to mailsort's own settings, and shows you what it did with an **Undo**.

It runs on your device with no model and no network. Sentences are matched against a fixed grammar, so it understands the phrasings below (in English), not free-form chat. If it does not understand something it says so and points you to `help`.

## What you can say

| To do this | Say something like |
|---|---|
| Limit who can notify you | `notify me only for boss@example.com and priya@example.org` |
| Always be notified | `always notify me about my bank` · `make boss@example.com a vip` |
| Silence a sender or category | `mute linkedin, facebook and quora` · `mute promotions` |
| Undo a mute or VIP | `unmute linkedin` · `remove linkedin from my vips` |
| Re-file a sender | `move swiggy to Food/Delivery and don't notify me` |
| Make a rule from a keyword | `if the subject contains invoice, make it Finance and tag it bills` · `move all emails with salary or payslip to Finance` |
| Block or trust | `block lucky-draw.example` · `trust mybank.example` |
| Quiet hours | `quiet hours 10pm to 7am` · `turn off quiet hours` |
| Daily digest | `daily digest at 6pm` · `turn off the digest` |
| Change mode | `mode only vips` · `silence everything` · `notify me about everything` · `reset notifications` |
| Pause | `pause mailsort` · `resume mailsort` |
| Look at the page | `show promotions` · `show all` · `how many from amazon` · `select all from flipkart` |
| Review | `list my rules` · `list my vips` · `delete rule 2` |
| Reverse the last change | `undo` |

You can chain instructions: `mute linkedin and block spam.example and show promotions`, or separate them with a semicolon or a full stop.

## Who or what a name refers to

A name is matched against the senders on the page you have open. If it clearly belongs to one website, the whole site is used (`@linkedin.com`). If you name a site or address yourself (`linkedin.com`, `boss@example.com`) that is used as written. If it matches several senders, or none, mailsort matches any address containing the name and tells you so.

## What it will not do

- **It never deletes, forwards, sends or replies to mail.** "Delete all from X" only ticks the emails on the page so you can press Delete in Gmail's own toolbar.
- It refuses a whole mail provider (`mute gmail.com`) because that would match millions of unrelated people, and names too short to match safely.
- It refuses to move a whole category (`move promotions to Food`); name a sender instead.
- Vague phrases ("mute everything about gmail") are refused rather than turned into a rule that matches nothing.
- It works on the emails on the current page, not the whole mailbox.

## Adding a phrase

The grammar lives in [`extension/src/core/commands.js`](../extension/src/core/commands.js), in `parseClause`, one regular expression per way of saying something. To add one: write the pattern, make it return the same step objects the existing patterns return, add cases to [`tests/unit/commands.test.js`](../tests/unit/commands.test.js), and add a line to the table above. Anything that changes settings must go through `C.apply`, so it is covered by Undo and by validation.

## The optional model

If you add a small on-device model, sentences the grammar does not understand are sent to it. It sees only the sentence (never email text or sender names), its answer is checked against the [catalog](catalog.md), shown to you as a plain-language list, and applied only when you press **Apply**.
