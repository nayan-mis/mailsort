#!/bin/sh
# Swaps the OWNER placeholder for your real GitHub name, everywhere it appears.
#   sh scripts/set-repo.sh yourname/mailsort
set -e
[ -n "$1" ] || { echo "usage: sh scripts/set-repo.sh yourname/mailsort"; exit 1; }
cd "$(dirname "$0")/.."
USER_NAME=${1%%/*}
grep -rIl "OWNER\|owner\.github\.io" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude=set-repo.sh | while read -r f; do
  sed -i.bak -e "s#OWNER/mailsort#$1#g" -e "s#OWNER\.github\.io#$USER_NAME.github.io#g" -e "s#owner\.github\.io#$USER_NAME.github.io#g" "$f" && rm -f "$f.bak"
done
echo "Done. See what changed with: git diff --stat"
