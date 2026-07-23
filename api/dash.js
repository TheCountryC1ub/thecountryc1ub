/* /api/dash — live GA4 + Commas feed for The Clubhouse Report (/dashboard).
   Pass-gated: requires ?pass= matching env DASHBOARD_PASS (case/space-insensitive).
   Env (Vercel → Settings → Environment Variables):
     GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN — OAuth for the GA4 Data API
     GA4_DASH_PROPERTY_ID — GA4 property (EGC = 544196923, the default below)
     DASHBOARD_PASS       — the page password
     COMMAS_API_KEY       — optional; TCC-org Commas key for subscriber/transaction tiles
                            (EGC sells through The Country Club org since 2026-07-21;
                            queries are product-scoped so C1ub sales never leak in)
     COMMAS_PRODUCT_IDS   — optional; comma-separated product IDs to count
                            (default "Npgn8"; add qDvjk if the EGC org ever goes live)
   Returns only aggregated numbers — raw credentials never reach the client.
   Sibling of thecountryc1ub-site/api/stats.js, reshaped for EGC + ESM (repo is type:module). */

const SEASON_START = '2026-07-01';
const RANGES = { today: 'today', '7d': '7daysAgo', '28d': '28daysAgo', season: SEASON_START };

/* Paid-traffic filter for The Gallery: the Chapter 2 Meta campaign by name, plus any
   paid medium (covers the Google Display campaign later — and surfaces untagged cpc). */
const ADS_FILTER = {
  orGroup: { expressions: [
    { filter: { fieldName: 'sessionCampaignName', stringFilter: { value: 'survey-egc' } } },
    { filter: { fieldName: 'sessionMedium', inListFilter: { values: ['paid', 'cpc', 'display'] } } },
  ] },
};
const ADS_EVENTS = ['assessment_complete', 'add_to_cart', 'begin_checkout', 'purchase'];

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
/* Meta's {{ad.name}} arrives URL-encoded ("Ad+1+-+Slider") — make it readable */
const deplus = (s) => {
  const t = String(s || '').replace(/\+/g, ' ');
  try { return decodeURIComponent(t); } catch { return t; }
};

async function commasSnapshot() {
  const key = process.env.COMMAS_API_KEY;
  if (!key) return null;
  const productIds = (process.env.COMMAS_PRODUCT_IDS || 'Npgn8')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const opts = { headers: { 'x-api-key': key }, signal: ctrl.signal };
    const out = { subscribers: 0, transactions: 0, collected_cents: 0 };
    let known = true;
    for (const pid of productIds) {
      const [subsR, txR] = await Promise.all([
        fetch('https://www.fanbasis.com/public-api/subscribers?per_page=1&product_id=' + encodeURIComponent(pid), opts),
        fetch('https://www.fanbasis.com/public-api/checkout-sessions/transactions?per_page=100&product_id=' + encodeURIComponent(pid), opts),
      ]);
      if (!subsR.ok || !txR.ok) return null;
      const subs = (await subsR.json()).data;
      const tx = (await txR.json()).data;
      const txs = tx.transactions || [];
      out.subscribers += subs.pagination?.total_items ?? 0;
      out.transactions += tx.pagination?.total_items ?? txs.length;
      for (const t of txs) {
        const v = t.amount_cents ?? (t.amount != null ? Math.round(parseFloat(t.amount) * 100) : NaN);
        if (!Number.isFinite(v)) { known = false; continue; }
        /* net of refunds — a refunded test purchase shouldn't count as money collected */
        const refunded = (t.refunds || []).reduce((s, r) => s + Math.round(parseFloat(r.amount || 0) * 100), 0);
        out.collected_cents += Math.max(0, v - refunded);
      }
      /* per_page=100 covers early days; add pagination before ~100 tx/product */
    }
    if (!known) out.collected_cents = null;
    return out;
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

  const range = q.range in RANGES ? q.range : 'season';
  const isToday = range === 'today';
  const dateRanges = [{ startDate: RANGES[range], endDate: 'today' }];
  try {
    const token = await accessToken();
    const pid = process.env.GA4_DASH_PROPERTY_ID || '544196923';
    const call = (requests) => fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + pid + ':batchRunReports', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    /* batchRunReports caps at 5 requests — the Gallery reports ride a second, parallel batch */
    const [batch, adsBatch] = await Promise.all([
      call([
        { dateRanges,
          metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' },
                    { name: 'averageSessionDuration' }, { name: 'engagementRate' }, { name: 'newUsers' }] },
        { dateRanges,
          /* the day view charts hour-by-hour; longer ranges chart day-by-day */
          dimensions: [{ name: isToday ? 'hour' : 'date' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys: [{ dimension: { dimensionName: isToday ? 'hour' : 'date' } }], limit: 100 },
        { dateRanges,
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }], limit: 100 },
        { dateRanges,
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
          /* 100 so low-traffic /mentor + /pro rows reach the dashboard's profile panel */
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 100 },
        { dateRanges,
          dimensions: [{ name: 'sessionSourceMedium' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 15 },
      ]),
      call([
        { dateRanges,
          dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }, { name: 'sessionSourceMedium' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
          dimensionFilter: ADS_FILTER,
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 50 },
        { dateRanges,
          dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionManualAdContent' }, { name: 'sessionSourceMedium' }, { name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: { andGroup: { expressions: [
            ADS_FILTER,
            { filter: { fieldName: 'eventName', inListFilter: { values: ADS_EVENTS } } },
          ] } }, limit: 200 },
      ]),
    ]);
    if (!batch.ok) throw new Error('GA4 API ' + batch.status + ': ' + (await batch.text()).slice(0, 300));
    const reports = (await batch.json()).reports || [];
    const rows = (i) => reports[i]?.rows || [];
    const dims = (r) => (r.dimensionValues || []).map((v) => v.value);
    const mets = (r) => (r.metricValues || []).map((v) => Number(v.value));

    const t = rows(0)[0] ? mets(rows(0)[0]) : [0, 0, 0, 0, 0, 0];
    const events = {};
    for (const r of rows(2)) events[dims(r)[0]] = mets(r)[0];

    /* merge the two Gallery reports into one row per (campaign, ad content, source) */
    let ads = [];
    if (adsBatch.ok) {
      const areports = (await adsBatch.json()).reports || [];
      const arows = (i) => areports[i]?.rows || [];
      const admap = new Map();
      const blank = (camp, content, srcmed) => ({
        campaign: camp, content: deplus(content), srcmed,
        sessions: 0, users: 0, assessment_complete: 0, add_to_cart: 0, begin_checkout: 0, purchase: 0,
      });
      for (const r of arows(0)) {
        const [camp, content, srcmed] = dims(r), [sessions, users] = mets(r);
        const k = camp + '|' + content + '|' + srcmed;
        admap.set(k, Object.assign(blank(camp, content, srcmed), { sessions, users }));
      }
      for (const r of arows(1)) {
        const [camp, content, srcmed, ev] = dims(r), [count] = mets(r);
        const k = camp + '|' + content + '|' + srcmed;
        if (!admap.has(k)) admap.set(k, blank(camp, content, srcmed));
        admap.get(k)[ev] = count;
      }
      ads = [...admap.values()].sort((a, b) => b.sessions - a.sessions);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      range,
      totals: t,
      daily: isToday ? [] : rows(1).map((r) => [dims(r)[0], ...mets(r)]),
      hourly: isToday ? rows(1).map((r) => [dims(r)[0], ...mets(r)]) : [],
      events,
      pages: rows(3).map((r) => [dims(r)[0], ...mets(r)]),
      sources: rows(4).map((r) => [dims(r)[0], mets(r)[0]]),
      ads,
      commas: await commasSnapshot(),
    });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
