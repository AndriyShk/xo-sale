import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Vercel serverless proxy: a sale's API often only answers its own site, so the browser can't call it directly.
// The sale comes from sale.json; with none in it the answer is { idle: true }.
// GET /api/sale → { fetchedAt, deposits, participants, oversub, price, supply, open, close, phase, markets }   (edge-cached 10 s)
// `markets`: the XO markets on this sale with their best prices. XO's order books only answer XO's own site, so they come from here too.
const REPO = 'AndriyShk/xo-sale';
const { sale: SALE } = JSON.parse(readFileSync(join(process.cwd(), 'sale.json'), 'utf8'));
const RPC = 'https://api.mainnet-beta.solana.com';
const field = (o, path) => (path || '').split('.').reduce((x, k) => (x == null ? x : x[k]), o);

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
  const icon = ((ev.media || []).find((x) => x.role === 'icon') || {}).url || m.imageUrl || null;
  const by = m.creator && m.creator.username ? { name: m.creator.username, avatar: (m.creator.profilePictureUrl || '').replace('_normal.', '_400x400.') || null, verified: !!m.creator.verified } : null;
  return { slug, title: m.title, image: icon, creator: by, kind: m.type === 4 ? 'conviction' : 'market', expiresAt: m.expiresAt, status: m.status, last: +tok(0).currentPrice / 1e6, volume: +m.totalVolumeInUSD, yes, no };
}

// GitHub often skips or delays the Action's */10 schedule. With a GH_TOKEN env var (fine-grained, Actions: write on this repo)
// every cache miss checks when the snapshot Action last ran and starts it again after 10 minutes.
async function nudgeSnapshot() {
  const token = process.env.GH_TOKEN;
  // why nothing started goes to the function log, never to the visitor
  if (!token) { console.log('nudge: GH_TOKEN is not set in this deployment'); return; }
  const gh = (path, opt = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opt, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'xo-sale' }, signal: AbortSignal.timeout(4000) });
  const list = await gh('/actions/workflows/snapshot.yml/runs?per_page=1');
  if (!list.ok) console.log(`nudge: listing runs answered ${list.status} (token needs Actions: read and write on ${REPO})`);
  const runs = list.ok ? await list.json() : {};
  const last = runs.workflow_runs && runs.workflow_runs[0];
  if (last && Date.now() - Date.parse(last.created_at) < 10 * 6e4) return;
  const r = await gh('/actions/workflows/snapshot.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  if (!r.ok) console.log(`nudge: starting the snapshot answered ${r.status}`);
}

// the sale's own numbers: its API when it has one (`source`, read through `fields`), else the balance of its Solana account
async function saleNumbers() {
  const src = SALE.source;
  if (src) {
    const r = await fetch(src.url, { method: src.method || 'GET', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 xo-sale-tracker' }, ...(src.body ? { body: JSON.stringify(src.body) } : {}), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`sale API ${r.status}`);
    const d = await r.json();
    return Object.fromEntries(Object.entries(src.fields).map(([k, path]) => [k, field(d, path)]));
  }
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountBalance', params: [SALE.vault] }), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Solana RPC ${r.status}`);
  return { deposits: (await r.json()).result.value.uiAmount };
}

export default async function handler(req, res) {
  if (!SALE) {
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json({ idle: true });
  }
  try {
    const [n, markets] = await Promise.all([
      saleNumbers(),
      Promise.all(SALE.markets.map(({ slug }) => xoMarket(slug).catch((e) => { console.error('xo market', slug, e); return null; }))),
      nudgeSnapshot().catch((e) => console.log('nudge failed:', e.message)),
    ]);
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      fetchedAt: Date.now(),
      deposits: +n.deposits,
      participants: n.participants,
      oversub: n.oversub != null ? +n.oversub : null,
      price: n.price != null ? +n.price : null,
      supply: n.supply != null ? +n.supply : null,
      open: SALE.open,
      close: n.close || SALE.end,
      phase: n.phase || null,
      paused: !!n.paused,
      markets: markets.filter(Boolean),
    });
  } catch (e) {
    console.error('sale proxy:', e);
    res.status(502).json({ error: 'Sale data unavailable' });
  }
}
