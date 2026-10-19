// Vercel serverless proxy: the 1win sale API only answers its own site, so the browser can't call it directly.
// GET /api/sale → { fetchedAt, deposits, participants, oversub, price, supply, open, close, phase, markets }   (edge-cached 10 s)
// `markets`: the XO markets on this sale with their best prices. XO's order books only answer XO's own site, so they come from here too.
const REPO = 'AndriyShk/xo-sale';
const XO_MARKETS = ['total-commitments-for-the-1win-1win-public-sale-ab-9330', 'will-the-1win-token-sale-get-more-than-20m-in-depo-8761'];

const getJson = async (url) => { const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 xo-sale-tracker' }, signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); };
// best ask (cheapest to buy) and best bid of one outcome token
async function book(token) {
  const b = await getJson(`https://orderbooks.xo.market/book?token_id=${token}`);
  const px = (side) => (b[side] || []).map((o) => +o.price).filter((p) => p > 0 && p < 1);
  const asks = px('asks'), bids = px('bids');
  return { ask: asks.length ? Math.min(...asks) : null, bid: bids.length ? Math.max(...bids) : null };
}
async function xoMarket(slug) {
  const ev = (await getJson(`https://api-mainnet.xo.market/api/v1/events/slug/${slug}`)).data;
  const m = ev.markets[0].market;
  const tok = (i) => m.outcomes.find((o) => o.index === i);
  const [yes, no] = await Promise.all([0, 1].map((i) => book(tok(i).outcomeTokenId).catch(() => ({ ask: null, bid: null }))));
  return { slug, title: m.title, expiresAt: m.expiresAt, status: m.status, last: +tok(0).currentPrice / 1e6, volume: +m.totalVolumeInUSD, yes, no };
}

// GitHub often skips or delays the Action's */10 schedule. With a GH_TOKEN env var (fine-grained, Actions: write on this repo)
// every cache miss checks when the snapshot Action last ran and starts it again after 10 minutes.
async function nudgeSnapshot() {
  const token = process.env.GH_TOKEN;
  if (!token) return;
  const gh = (path, opt = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opt, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'xo-sale' }, signal: AbortSignal.timeout(4000) });
  const runs = await (await gh('/actions/workflows/snapshot.yml/runs?per_page=1')).json();
  const last = runs.workflow_runs && runs.workflow_runs[0];
  if (last && Date.now() - Date.parse(last.created_at) < 10 * 6e4) return;
  await gh('/actions/workflows/snapshot.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
}

export default async function handler(req, res) {
  try {
    const [r, markets] = await Promise.all([
      fetch('https://1wtoken.com/api/v1/token-api/token/sale/state', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 xo-sale-tracker' }, body: '{}', signal: AbortSignal.timeout(8000) }),
      Promise.all(XO_MARKETS.map((slug) => xoMarket(slug).catch((e) => { console.error('xo market', slug, e); return null; }))),
      nudgeSnapshot().catch(() => {}),
    ]);
    if (!r.ok) throw new Error(`sale API ${r.status}`);
    const { state, stats } = await r.json();
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      fetchedAt: Date.now(),
      deposits: +stats.totalMoneySpent,
      participants: stats.totalUserAmount,
      oversub: +stats.multiplicator,
      price: +state.usdcPrice,
      supply: +state.emission,
      open: state.saleStartDate,
      close: state.saleEndDate,
      phase: state.phase,
      paused: !!state.paused,
      markets: markets.filter(Boolean),
    });
  } catch (e) {
    console.error('sale proxy:', e);
    res.status(502).json({ error: 'Sale data unavailable' });
  }
}
