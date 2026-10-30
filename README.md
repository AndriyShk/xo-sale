# Xo Sale: live token sale tracker (XO community)

A live page for a token sale with XO markets on it: deposits, participants and a forecast of the final raise, with a chart
from the first day of the sale, set against those markets: our chance vs the price to buy each side.
With no sale set, it says so and waits for the next one.

## A new sale: only `sale.json`

Fill it in and push; the page, the function and the snapshot Action all read it. `{ "sale": null }` puts the site back to waiting.
`sales/1win.json` is a complete example (and `sales/1win-history.json` that sale's final record).

| Field | |
|---|---|
| `name`, `short` | Full name ("1win Token (1W)") and the short one for the headline ("1win"). |
| `site` | The official sale page. |
| `open`, `end` | UTC times, `2026-10-15T15:00:00Z`. |
| `source` | The sale's own API: `url`, `method`, `body`, and `fields`, where each number sits in its answer (`deposits` is required; also `participants`, `close`, `phase`, `paused`, `oversub`, `price`, `supply`). Leave it out if there's no API: deposits then come from `vault`'s balance. |
| `vault` | The sale's USDC account on Solana: fills gaps in the history. Optional when there is a `source`. |
| `markets` | Each XO market: `slug` (from its URL), `goal` (the total it needs), `at` if it's counted at a set moment instead of the close, and an optional `note`. |
| `resolve` | How the markets resolve, for "Good to know" (HTML). |

Old rows drop out of the history by themselves: anything from before `open` is ignored and removed by the next snapshot.

## Files

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
