// Vercel serverless proxy: Legion's API only answers its own origin, so the browser can't call it directly.
// GET /api/legion → { live, stats, fetchedAt }   (edge-cached 10 s)
const REPO = 'AndriyShk/xo-jumper';

// GitHub often skips or delays the Action's */10 schedule. With a GH_TOKEN env var (fine-grained, Actions: write on this repo)
// every cache miss checks when the snapshot Action last ran and starts it again after 10 minutes.
async function nudgeSnapshot() {
  const token = process.env.GH_TOKEN;
  if (!token) return;
  const gh = (path, opt = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opt, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'xo-jumper' }, signal: AbortSignal.timeout(4000) });
  const runs = await (await gh('/actions/workflows/snapshot.yml/runs?per_page=1')).json();
  const last = runs.workflow_runs && runs.workflow_runs[0];
  if (last && Date.now() - Date.parse(last.created_at) < 10 * 6e4) return;
  await gh('/actions/workflows/snapshot.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
}

export default async function handler(req, res) {
  const get = async u => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 xo-jumper-tracker' } }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };
  try {
    const [live, stats] = await Promise.all([
      get('https://api.legion.cc/public/sales/live?platform=legion'),
      get('https://api.legion.cc/public/sales/live/stats?slugs=jumper'),
      nudgeSnapshot().catch(() => {}),
    ]);
    const sale = (live.items || []).find(s => s.slug === 'jumper') || null;
    const st = (stats.items || [])[0] || null;
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      fetchedAt: Date.now(),
      sale: sale && { name: sale.name, logo: sale.logo, oneLiner: sale.oneLiner, website: sale.website, open: sale.applicationsOpenDate, close: sale.applicationsCloseDate, target: sale.raiseTarget, hardCap: sale.raiseTargetHardCap },
      deposits: st ? st.totalRequestedAllocation : null,
      participants: st ? st.totalParticipants : null,
    });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}
