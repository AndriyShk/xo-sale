#!/bin/sh
# Publishes data/history.json to the repo's `data` branch as a single force-pushed commit (the same thing the
# snapshot workflow does). Use it for the first publish, or after rebuilding the history at home.
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp data/history.json "$TMP/"
cd "$TMP"
git init -q -b data
# Vercel reads vercel.json from the branch it is about to deploy; this one tells it not to deploy data pushes
echo '{"git":{"deploymentEnabled":false}}' > vercel.json
git add history.json vercel.json
git -c user.name="xo-sale-bot" -c user.email="actions@users.noreply.github.com" commit -q -m "data: snapshot"
git push -f "$REMOTE" data
rm -rf "$TMP"
