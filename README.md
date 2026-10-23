# Xo Sale: live token sale tracker (XO community)

A live page for the 1win Token (1W) sale (https://1wtoken.com): deposits, oversubscription, participants and a
forecast of the final raise, with a chart from the first day of the sale, set against the two XO markets on it
(above $10M by Oct 30 00:00 UTC, above $20M by the close): our chance vs the price to buy each side.

- `index.html`: the whole site (static, no build step).
- `api/sale.js`: Vercel function that proxies the sale's API. It only answers its own site, so the browser can't call it directly.
  With a `GH_TOKEN` env var (fine-grained, Actions: write on this repo) it also restarts the snapshot Action when GitHub skips it.
- `scripts/snapshot.mjs` + `.github/workflows/snapshot.yml`: every ~10 min, append deposits and participants to `history.json` and
  force-push it to the `data` branch as a single commit, so data updates never redeploy the site.
  Gaps (the first run, skipped schedules) are filled from Solana: the balance of the sale's USDC account after each purchase.
- `api/data.js`: serves `history.json` from the `data` branch through the GitHub API (raw.githubusercontent caches a file for 5 minutes).
  The page reads through it, then falls back to the raw file and to the copy in the repo (`data/history.json`).
- `scripts/publish.sh`: push the local `data/history.json` to the `data` branch by hand.
- Local preview: `node dev.mjs` → http://localhost:8769

Reusing it for another sale: change the sale API and vault in `api/sale.js` and `scripts/snapshot.mjs`, and `CFG` and the
texts in `index.html`.
