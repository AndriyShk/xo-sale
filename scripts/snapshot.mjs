// Append one snapshot of the Jumper sale (Legion) + the XO market price to data/history.json.
// Runs locally (loop) or in the GitHub Action every few minutes. No keys needed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const FILE = new URL('../data/history.json', import.meta.url);
const XO_EVENT = '3a7a66d0-d123-496a-8fef-b68dc813f19d';
const j = async u => { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 xo-jumper-tracker' } }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };
const stats = await j('https://api.legion.cc/public/sales/live/stats?slugs=jumper');
const it = stats.items && stats.items[0];
let yes = null;
try { const ev = await j(`https://api-mainnet.xo.market/api/v1/events/${XO_EVENT}`); const o = ev.data.markets[0].market.outcomes.find(x => x.index === 0); yes = +o.currentPrice / 1e6; } catch {}
const hist = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
if (it) {
  const row = { t: Math.floor(Date.now() / 1000), deposits: it.totalRequestedAllocation, participants: it.totalParticipants };
  if (yes != null) row.yes = yes;
  const last = hist[hist.length - 1];
  if (!last || last.deposits !== row.deposits || row.t - last.t >= 1800) hist.push(row);   // skip unchanged within 30 min
  writeFileSync(FILE, JSON.stringify(hist));
  console.log(new Date().toISOString(), row.deposits, row.participants, yes);
}
