/* /api/dash — live GA4 + Commas feed for The Clubhouse Report (/dashboard).
   Pass-gated: requires ?pass= matching env DASHBOARD_PASS (case/space-insensitive).
   Env (Vercel → Settings → Environment Variables):
     GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN — OAuth for the GA4 Data API
     GA4_DASH_PROPERTY_ID — GA4 property (EGC = 544196923, the default below)
     DASHBOARD_PASS       — the page password
     COMMAS_API_KEY       — optional; EGC-org Commas key for subscriber/transaction tiles
   Returns only aggregated numbers — raw credentials never reach the client.
   Sibling of thecountryc1ub-site/api/stats.js, reshaped for EGC + ESM (repo is type:module). */

const SEASON_START = '2026-07-01';
const RANGES = { '7d': '7daysAgo', '28d': '28daysAgo', season: SEASON_START };

let tokenCache = { value: null, exp: 0 };

async function accessToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60000) return tokenCache.value;
  const body = new URLSearchParams({
    client_id: process.env.GA4_CLIENT_ID,
    client_secret: process.env.GA4_CLIENT_SECRET,
    refresh_token: process.env.GA4_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!r.ok) throw new Error('token exchange failed: ' + r.status);
  const j = await r.json();
  tokenCache = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

async function commasSnapshot() {
  const key = process.env.COMMAS_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const opts = { headers: { 'x-api-key': key }, signal: ctrl.signal };
    const [subsR, txR] = await Promise.all([
      fetch('https://www.fanbasis.com/public-api/subscribers?per_page=1', opts),
      fetch('https://www.fanbasis.com/public-api/checkout-sessions/transactions?per_page=50', opts),
    ]);
    if (!subsR.ok || !txR.ok) return null;
    const subs = (await subsR.json()).data;
    const tx = (await txR.json()).data;
    const txs = tx.transactions || [];
    let cents = 0;
    let known = true;
    for (const t of txs) {
      const v = t.amount_cents ?? (t.amount != null ? Math.round(parseFloat(t.amount) * 100) : NaN);
      if (Number.isFinite(v)) cents += v; else known = false;
    }
    return {
      subscribers: subs.pagination?.total_items ?? 0,
      transactions: tx.pagination?.total_items ?? txs.length,
      collected_cents: known ? cents : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  const q = req.query || {};
  const pass = process.env.DASHBOARD_PASS;
  const ready = pass && process.env.GA4_CLIENT_ID && process.env.GA4_CLIENT_SECRET && process.env.GA4_REFRESH_TOKEN;
  if (!ready) { res.status(503).json({ error: 'not configured', snapshot: true }); return; }
  if (norm(q.pass) !== norm(pass)) { res.status(401).json({ error: 'not tonight' }); return; }

  const startDate = RANGES[q.range] || RANGES.season;
  const dateRanges = [{ startDate, endDate: 'today' }];
  try {
    const token = await accessToken();
    const pid = process.env.GA4_DASH_PROPERTY_ID || '544196923';
    const batch = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + pid + ':batchRunReports', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { dateRanges,
            metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' },
                      { name: 'averageSessionDuration' }, { name: 'engagementRate' }, { name: 'newUsers' }] },
          { dateRanges,
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 100 },
          { dateRanges,
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }], limit: 100 },
          { dateRanges,
            dimensions: [{ name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
            orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 40 },
          { dateRanges,
            dimensions: [{ name: 'sessionSourceMedium' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 15 },
        ],
      }),
    });
    if (!batch.ok) throw new Error('GA4 API ' + batch.status + ': ' + (await batch.text()).slice(0, 300));
    const reports = (await batch.json()).reports || [];
    const rows = (i) => reports[i]?.rows || [];
    const dims = (r) => (r.dimensionValues || []).map((v) => v.value);
    const mets = (r) => (r.metricValues || []).map((v) => Number(v.value));

    const t = rows(0)[0] ? mets(rows(0)[0]) : [0, 0, 0, 0, 0, 0];
    const events = {};
    for (const r of rows(2)) events[dims(r)[0]] = mets(r)[0];

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      range: q.range in RANGES ? q.range : 'season',
      totals: t,
      daily: rows(1).map((r) => [dims(r)[0], ...mets(r)]),
      events,
      pages: rows(3).map((r) => [dims(r)[0], ...mets(r)]),
      sources: rows(4).map((r) => [dims(r)[0], mets(r)[0]]),
      commas: await commasSnapshot(),
    });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
