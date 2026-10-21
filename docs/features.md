# Features

A complete reference. For a quick tour, see the [README](../README.md).

## Sorting

Every email in the inbox list gets a **category**, a **subcategory** and **tags**. Rules run in order and the first rule that sets a category wins; tags from every matching rule are added.

| Category | What it recognises |
|---|---|
| Security | one-time codes, new sign-in alerts, password resets |
| Finance | payments due or failed, bank and payment senders, receipts and statements |
| Shopping | orders, shipping, delivery updates |
| Travel | bookings, boarding passes, itineraries, ride and rail senders |
| Jobs | job alerts, applications, interviews, job boards |
| Social | LinkedIn, Facebook, Instagram, Reddit, Discord and similar |
| Developer | GitHub, GitLab, cloud and hosting alerts; failures are flagged separately |
| Work | meetings and calendar invitations |
| Promotions | sales and offers |
| Subscriptions | newsletters and bulk mail, grouped by sender |
| Automated | no-reply and notification senders |
| Spam | clear spam and look-alike senders, shown as Suspicious or Junk |
| Personal | mail that looks like it is from a person |

Tags: `otp`, `security`, `finance`, `bill-due`, `receipt`, `order`, `delivery`, `travel`, `career`, `social`, `dev`, `failure`, `calendar`, `promo`, `bulk`, `automated`, `attachment`, `urgent`, `question`, `unsubscribable`, `new-sender`, `learned`, `priority-high`, `priority-urgent`, plus any tags you add.

Everything is decided from what the inbox *list* shows: sender, subject, the preview line and the attachment icon.

### Spam and look-alike senders

Scored from several signals: spammy wording, phishing-style phrases, suspicious domain endings, a display name that claims to be a brand the address does not belong to, a display name that contains a different address, links to raw IP addresses, all-caps subjects and similar. Below the first threshold nothing changes; above it the mail is labelled Suspicious, and above the second Junk. Nothing is ever deleted or moved.

## The learner

A very small text classifier (hashed word and word-pair counts, Naive Bayes) that runs in about a millisecond. It is consulted only when the rules are unsure: no category matched, or only a generic one (newsletter, automated). It starts from a few hundred seed phrases (about two hundred) in English, Hindi and Hinglish and then improves from your corrections.

- It learns from rule and user decisions, never from its own guesses.
- It stores sender addresses and hashed word fragments, never the text of an email.
- A guess is marked with the `learned` tag. "Yes, it's X" in the badge menu confirms it.
- **Settings, Display and backup** lets you choose how willing it is to guess, and has **Forget what it learned**.

## Notifications

| Mode | Behaviour |
|---|---|
| Smart (default) | Notifies by category and rules; VIPs always; muted never. By default: Personal, Work, Security and payments-due mail |
| Only my VIPs | Notifies only for your VIP senders and any categories you list |
| Everything | Everything except muted senders and categories |
| Silent | No notifications |

**Lists.** VIP, muted, blocked and trusted lists accept an address (`a@b.com`), a domain (`@b.com`) or a name. Blocked senders are always treated as spam; trusted senders never are.

**Quiet hours.** Hold notifications between two times; urgent mail still comes through.

**Daily digest.** One notification at a time you choose, summing up the mail you decided not to be alerted about.

**Age limit.** Mail older than a set number of hours never triggers a notification, so opening a backlog is quiet.

**Where alerts come from.** Gmail: a background check of Gmail's unread feed for every Gmail account you are signed into, so alerts work with no Gmail tab open. Yahoo Mail: while a Yahoo tab is open. The first check after a page or folder loads never notifies.

**Phone push (optional).** Enter a topic from the free ntfy app. By default only the sender is sent, never the subject; you can allow the subject, or send nothing at all. The permission for the push server is requested only when you turn this on.

## Controls inside your inbox

- **Badge menu.** Click a badge to make the sender a VIP, mute, block or trust them, move them to another category, confirm a guess, or read the *Why* line that explains the decision.
- **Filter bar.** Show one category at a time, then drill into its subcategories.
- **First-run check.** "Does this look right?" with a tick and a cross for a few sample emails.
- **Undo** after every correction and every assistant action.
- **Presets** for students, freelancers and founders; **rule packs** you can export and share (plain data, no code).
- **Accuracy estimate.** How often you had to correct it.
- **Your data.** A screen showing exactly what is stored, with **Delete everything**. Backup and restore as a file.
- Dark mode, keyboard access (badges open with Enter) and screen-reader labels.

## The assistant

A chat box on top of your inbox. See [assistant.md](assistant.md).

## Export as Gmail filters

*Settings, Gmail and filters, Download filters* turns your rules and sender lists into a file that Gmail imports (*Gmail settings, Filters and blocked addresses, Import filters*). Gmail then applies the labels on its own servers, so they appear in the Gmail phone app too. Gmail matches whole words only and applies every matching filter, and rules that need checks only mailsort can make are skipped with an explanation.

## The command catalog

One fixed description of every condition and action a rule can use, with the risk of each action and what each place (the Gmail page, a Gmail filter, the Gmail API) can really do. Everything above is built on it. Generated reference: [catalog.md](catalog.md).

## Optional on-device model

Off by default; no model is included. A small open-weight model can be added so the assistant understands looser wording. It sees only the sentence you type, its answer is a proposal, and nothing changes until you press **Apply**. See [../extension/models/README.md](../extension/models/README.md) and [../training/README.md](../training/README.md).
