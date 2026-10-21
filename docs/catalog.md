# What a mailsort rule can match and do

Generated from `extension/catalog.js`. A rule says WHEN conditions hold, THEN do actions. Models only translate a person's sentence into this format; code checks and runs it.

## Conditions (WHEN)

| Condition | Meaning | Gmail search | On the Gmail page | As a Gmail filter | Example sentence |
|---|---|---|---|---|---|
| `from` | sender address, @domain or name | `from:` | yes | yes | "from my bank" |
| `to` | recipient address | `to:` | no | yes | "sent to my work address" |
| `subject_has` | words in the subject (any of) | `subject:` | yes | yes | "subject says invoice" |
| `text_has` | words anywhere in the mail (any of) | `words` | partly | yes | "mentions refund" |
| `text_lacks` | words that must NOT appear (any of) | `-words` | partly | yes | "doesn't mention unsubscribe" |
| `has_attachment` | has an attachment | `has:attachment` | partly | yes | "with attachments" |
| `filename` | attachment file name or type | `filename:` | no | yes | "a pdf attached" |
| `label` | a Gmail label | `label:` | no | yes | "under my Work label" |
| `category` | Gmail's own category tab | `category:` | no | yes | "in promotions" |
| `status` | read or marked state | `is:` | partly | yes | "unread mail" |
| `location` | where the mail is | `in:` | no | yes | "in the archive" |
| `mailing_list` | a mailing list address | `list:` | no | yes | "from the dev mailing list" |
| `size` | larger or smaller than N megabytes | `larger:/smaller:` | no | yes | "bigger than 10 MB" |
| `age` | older or newer than N days, months or years | `older_than:/newer_than:` | no | yes | "older than 6 months" |
| `sender_kind` | mailsort's own guess at who is sending | none (mailsort only) | yes | no | "from a real person" |

Combine conditions with `all` (and), `any` (or) and `not`. Gmail itself has no operator that searches only the body of a message.

## Actions (THEN)

| Action | Meaning | Risk | On the Gmail page | As a Gmail filter |
|---|---|---|---|---|
| `label` | file under a label or category (Work/Clients) | safe | yes | yes |
| `notify` | decide whether you are alerted | safe | yes | partly |
| `star` | star it | safe | no | yes |
| `mark_important` | always mark important | safe | no | yes |
| `mark_not_important` | never mark important | safe | no | yes |
| `never_spam` | never send to spam | safe | no | yes |
| `archive` | skip the inbox | confirm | no | yes |
| `mark_read` | mark as read | confirm | no | yes |
| `trash` | move to Trash (Gmail keeps it 30 days) | confirm_twice | no | yes |

Risk: **safe** = applied with an Undo, **confirm** = shows how many emails it affects first, **confirm_twice** = asks twice, moves to Trash only, never permanent.

## Never allowed

| Request | Why |
|---|---|
| `forward` | forwarding can send your mail to someone else |
| `auto_reply` | it would send mail in your name |
| `send_template` | it would send mail in your name |
| `send_email` | it would send mail in your name |
| `delete_forever` | permanent deletion cannot be undone |
| `delete_permanently` | permanent deletion cannot be undone |
| `delete` | use trash instead: it keeps mail for 30 days and asks you twice |
| `change_forwarding` | it could redirect all your mail |
| `delegate` | it would give someone access to your mailbox |
| `share_mailbox` | it would give someone access to your mailbox |
| `change_password` | account security is out of scope |
| `unsubscribe` | unsubscribing contacts the sender, so you do it yourself |
