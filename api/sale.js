// Vercel serverless proxy: the 1win sale API only answers its own site, so the browser can't call it directly.
// GET /api/sale → { fetchedAt, deposits, participants, oversub, price, supply, open, close, phase }   (edge-cached 10 s)
const REPO = 'AndriyShk/xo-sale';

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
    const [r] = await Promise.all([
      fetch('https://1wtoken.com/api/v1/token-api/token/sale/state', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 xo-sale-tracker' }, body: '{}', signal: AbortSignal.timeout(8000) }),
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
    });
  } catch (e) {
    console.error('sale proxy:', e);
    res.status(502).json({ error: 'Sale data unavailable' });
  }
}
