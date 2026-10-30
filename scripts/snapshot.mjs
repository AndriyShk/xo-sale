// Append one snapshot of the sale in sale.json to data/history.json: deposits and participants from the sale's own API,
// or the balance of its Solana account when it has no API. Rows from before the sale opened (the previous sale) are dropped.
// Any gap in the history (the first run, or hours the scheduler skipped) is filled from the Solana chain when the sale has
// a `vault`: every purchase moves USDC into it, and its balance after a purchase is the running total.
// Runs locally or in the GitHub Action. No keys needed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const FILE = new URL('../data/history.json', import.meta.url);
const { sale: SALE } = JSON.parse(readFileSync(new URL('../sale.json', import.meta.url), 'utf8'));
if (!SALE) { console.log('no sale in sale.json'); process.exit(0); }
const RPC = 'https://api.mainnet-beta.solana.com';
const VAULT = SALE.vault; // the sale's USDC account
const OPEN = Date.parse(SALE.open) / 1000;
const STEP = 15 * 60; // one chain point per 15 minutes is plenty for the chart
const UA = { 'user-agent': 'Mozilla/5.0 xo-sale-tracker' };

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function rpc(method, params, tries = 6) {
  for (let i = 0; ; i++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json', ...UA }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = r.ok ? await r.json() : null;
    if (j && !j.error) return j.result;
    if (i >= tries) throw new Error(`${method}: ${r.status} ${j && JSON.stringify(j.error)}`);
    await wait(1000 * 2 ** i); // the public RPC rate-limits: back off
  }
}

// vault balance over (from, to], one point per STEP, newest purchase in each step
async function fromChain(from, to) {
  const sigs = [];
  let before;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [VAULT, { limit: 1000, ...(before ? { before } : {}) }]);
    if (!page.length) break;
    for (const s of page) if (!s.err && s.blockTime > from && s.blockTime <= to) sigs.push(s);
    before = page[page.length - 1].signature;
    if (page[page.length - 1].blockTime <= from) break;
    await wait(250);
  }
  const last = new Map(); // step → newest signature in it
  for (const s of sigs) { const k = Math.floor(s.blockTime / STEP); if (!last.has(k) || s.blockTime > last.get(k).blockTime) last.set(k, s); }
  const rows = [];
  for (const s of [...last.values()].sort((a, b) => a.blockTime - b.blockTime)) {
    const tx = await rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
    const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey || k);
    const bal = tx.meta.postTokenBalances.find((b) => keys[b.accountIndex] === VAULT);
    if (bal) rows.push({ t: s.blockTime, deposits: Math.round(bal.uiTokenAmount.uiAmount * 100) / 100 });
    await wait(250);
  }
  return rows;
}

const hist = (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []).filter((r) => r.t > OPEN);
const field = (o, path) => (path || '').split('.').reduce((x, k) => (x == null ? x : x[k]), o);
let n;
if (SALE.source) {
  const src = SALE.source;
  const r = await fetch(src.url, { method: src.method || 'GET', headers: { 'content-type': 'application/json', ...UA }, ...(src.body ? { body: JSON.stringify(src.body) } : {}) });
  if (!r.ok) throw new Error(`sale API ${r.status}`);
  const d = await r.json();
  n = { deposits: field(d, src.fields.deposits), participants: field(d, src.fields.participants), close: field(d, src.fields.close) };
} else n = { deposits: (await rpc('getTokenAccountBalance', [VAULT])).value.uiAmount };
const now = Math.floor(Date.now() / 1000);
const end = Math.floor(Date.parse(n.close || SALE.end) / 1000);

// fill a gap longer than half an hour from the chain (before the sale closes; afterwards refunds may move the vault)
const lastT = hist.length ? hist[hist.length - 1].t : OPEN;
if (VAULT && now - lastT > 1800 && lastT < end) {
  try {
    const rows = await fromChain(lastT, Math.min(now, end));
    hist.push(...rows);
    console.log(`chain: ${rows.length} points filled since ${new Date(lastT * 1000).toISOString()}`);
  } catch (e) { console.log('chain fill skipped:', e.message); }
}

const row = { t: now, deposits: Math.round(+n.deposits * 100) / 100, participants: n.participants };
const prev = hist[hist.length - 1];
if (!prev || prev.deposits !== row.deposits || row.t - prev.t >= 1800) hist.push(row); // skip unchanged within 30 min
hist.sort((a, b) => a.t - b.t);
writeFileSync(FILE, JSON.stringify(hist));
console.log(new Date().toISOString(), row.deposits, row.participants);
