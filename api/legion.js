// Vercel serverless proxy: Legion's API only answers its own origin, so the browser can't call it directly.
// GET /api/legion → { live, stats, fetchedAt }   (edge-cached 30 s)
export default async function handler(req, res) {
  const get = async u => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 xo-jumper-tracker' } }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };
  try {
    const [live, stats] = await Promise.all([
      get('https://api.legion.cc/public/sales/live?platform=legion'),
      get('https://api.legion.cc/public/sales/live/stats?slugs=jumper'),
    ]);
    const sale = (live.items || []).find(s => s.slug === 'jumper') || null;
    const st = (stats.items || [])[0] || null;
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      fetchedAt: Date.now(),
      sale: sale && { name: sale.name, logo: sale.logo, oneLiner: sale.oneLiner, website: sale.website, open: sale.applicationsOpenDate, close: sale.applicationsCloseDate, target: sale.raiseTarget, hardCap: sale.raiseTargetHardCap },
      deposits: st ? st.totalRequestedAllocation : null,
      participants: st ? st.totalParticipants : null,
    });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
}
