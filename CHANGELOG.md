# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.9.0] - 2026-10-19

First public beta.

### Added
- **Sorting** of the Gmail and Yahoo Mail inbox list into categories, subcategories and tags, with spam and look-alike-sender flags.
- **A small on-device learner** that improves from your corrections, with English, Hindi and Hinglish starter examples.
- **Notification control:** Smart, Only my VIPs, Everything and Silent modes; VIP, muted, blocked and trusted lists; quiet hours; an optional daily digest; background checks for every signed-in Gmail account; optional phone push that sends only the sender by default.
- **The assistant,** a chat box on top of the inbox that turns plain sentences into rules, with a preview and Undo. It never deletes or sends mail.
- **A fixed catalog** of conditions and actions, with risk levels and per-place checks, and a compiler to Gmail search text and Gmail filter files.
- **Export as Gmail filters,** so rules reach the Gmail phone app.
- **Comfort features:** a first-run check, presets, rule packs, an accuracy estimate, a "Your data" screen with Delete everything, backup and restore, dark mode, keyboard and screen-reader support.
- **An optional on-device model slot** (off by default, no model included): proposals only, validated against the catalog, applied only on confirmation. A training-data generator and scorer are included.
- **Tests:** unit tests, a privacy audit, and browser tests that run the real extension against a mock inbox.

### Known limitations
- Not yet verified against live Gmail and Yahoo Mail; the page selectors may need adjusting.
- The code that runs an optional model has not been tried against real model weights.

[0.9.0]: https://github.com/nayan-mis/mailsort/releases/tag/v0.9.0
