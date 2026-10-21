#!/bin/sh
# Builds dist/mailsort-<version>.zip. The archive is reproducible: files are sorted, timestamps are fixed and no
# owner or machine details are stored, so the same source always gives the same file (and the same checksum).
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./extension/manifest.json').version")
OUT="$(pwd)/dist/mailsort-$VERSION.zip"
TMP=$(mktemp -d)
mkdir -p dist && rm -f "$OUT"
cp -R extension "$TMP/mailsort-extension"
find "$TMP" -exec touch -t 202601010000 {} +
( cd "$TMP" && find mailsort-extension -type f | LC_ALL=C sort | zip -X -q "$OUT" -@ )
rm -rf "$TMP"
( cd dist && { sha256sum "mailsort-$VERSION.zip" 2>/dev/null || shasum -a 256 "mailsort-$VERSION.zip"; } > SHA256SUMS )
# Chrome Web Store / Edge Add-ons want the manifest at the top level of the zip, not inside a folder.
STORE="$(pwd)/dist/mailsort-store-$VERSION.zip"
rm -f "$STORE"
( cd extension && find . -type f | LC_ALL=C sort | zip -X -q "$STORE" -@ )
# The website serves this copy, so the download button always matches the source.
cp "$OUT" docs/mailsort.zip
echo "Built dist/mailsort-$VERSION.zip, dist/mailsort-store-$VERSION.zip (for the store) and docs/mailsort.zip"; cat dist/SHA256SUMS
