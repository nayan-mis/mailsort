#!/bin/sh
# One command from "files on my laptop" to "live download page".
#
#   1. Install the GitHub CLI:  https://cli.github.com
#   2. Log in once:             gh auth login
#   3. Run:                     sh scripts/publish.sh
#
# It fills in your GitHub name, creates the repo (or reuses it), turns on GitHub Pages, and pushes.
# After that, every push to main rebuilds the zip and updates the website on its own.
set -e
cd "$(dirname "$0")/.."
REPO=${1:-mailsort}

command -v git >/dev/null || { echo "git is missing. Install it from https://git-scm.com and run this again."; exit 1; }
command -v gh  >/dev/null || { echo "The GitHub CLI is missing. Install it from https://cli.github.com and run this again."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "You are not logged in. Run: gh auth login"; exit 1; }

USER_NAME=$(gh api user -q .login)
echo "Publishing as $USER_NAME/$REPO"

sh scripts/set-repo.sh "$USER_NAME/$REPO" >/dev/null
# The zip in docs/ is already built. Rebuild only if this machine has "zip" (Git Bash on Windows does not);
# GitHub rebuilds it anyway on every push.
if command -v zip >/dev/null && command -v node >/dev/null; then sh scripts/build.sh >/dev/null; fi

[ -d .git ] || git init -q -b main
git add -A
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json | head -1)
git commit -q -m "mailsort $VERSION" 2>/dev/null || echo "Nothing new to commit."
git branch -M main

if gh repo view "$USER_NAME/$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$USER_NAME/$REPO.git"
else
  gh repo create "$USER_NAME/$REPO" --public --source=. --remote=origin \
    --description "Sorts your Gmail and Yahoo inbox in your browser. No server, no agent, no account."
fi

# Pages has to be switched on before the first push, or the first deploy has nothing to land on.
gh api -X POST "repos/$USER_NAME/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$USER_NAME/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || echo "Could not switch Pages on automatically. In the repo: Settings > Pages > Source > GitHub Actions."

git push -u origin main

echo
echo "Done. The site goes live in about a minute at:"
echo "  https://$USER_NAME.github.io/$REPO/"
echo "Watch it deploy: https://github.com/$USER_NAME/$REPO/actions"
