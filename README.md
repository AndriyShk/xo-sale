# Xo-Jumper: Jumper × Legion tracker (XO community)

A live page for the XO market "Will the Jumper sale on Legion.cc surpass $35M in total deposits?".
It shows Legion deposits, the XO crowd's odds, a projection model and a comparison with past Legion sales.

- `index.html`: the whole site (static, no build step).
- `api/legion.js`: Vercel function that proxies Legion's public API. Legion only allows its own origin, so the browser can't call it directly.
- `scripts/snapshot.mjs` + `.github/workflows/snapshot.yml`: every ~10 min, append deposits + the XO price to `data/history.json`.
- `vercel.json`: skips redeploys for commits that only touch `data/history.json`. The page reads history from raw.githubusercontent.
- Local preview: `node dev.mjs` → http://localhost:8769
