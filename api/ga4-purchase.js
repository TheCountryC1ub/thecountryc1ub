/* /api/ga4-purchase — GA4 Measurement Protocol proxy for server-side purchase events (EGC).

   Why this exists: GHL's native "Add to Google Analytics" (GA4) action can only send FLAT
   key-value data. GA4's Measurement Protocol requires a NESTED body —
   {client_id, events:[{name:'purchase', params:{currency, value, transaction_id}}]}.
   Without `currency` alongside `value`, GA4 registers the `purchase` event but drops the
   revenue, so transactions/purchaseRevenue stay at $0 (the bug flagged in EGC notes
   2026-07-13: "GA4 currency param may be needed for revenue to populate"). This function
   accepts GHL's flat webhook and reshapes it into a valid MP payload, and keeps the MP API
   secret in a Vercel env var instead of the GHL workflow.

   Twin of the TCC endpoint (thecountryc1ub-site/api/ga4-purchase.js) — same code, EGC's own
   property/secret/ingest-key. Default measurement id below is EGC's so a missing env var
   can't misroute EGC revenue into TCC's property.

   Wired from: GHL "All Paid Invoice -> EGC" workflow — replace its "Add to Google Analytics"
   node with a Webhook action pointing here.

   GHL Webhook config:
     Method: POST
     URL:    https://get.elitegolfconsulting.com/api/ga4-purchase
     Custom Data (key / value pairs — NOT Headers):
       key             = <EGC_GA4_INGEST_KEY value>   shared secret, blocks spam
       client_id       = {{contact.id}}
       value           = 36                            EGC is flat $36/yr today; if the
                                                       trigger exposes an invoice total use
                                                       {{invoice.total_price}} instead. When
                                                       the $72 tier ships, update per branch.
       transaction_id  = {{contact.id}}                dedup key; swap for an invoice/payment
                                                       id if one is available on the trigger
       currency        = USD                           optional, defaults to USD

   Env (Vercel -> project thecountryc1ub -> Settings -> Environment Variables):
     GA4_MP_API_SECRET    EGC's MP API secret (required)
     EGC_GA4_INGEST_KEY   shared secret GHL must send as `key` (required)
     GA4_MEASUREMENT_ID   optional, defaults to G-5KD888CEP2 (EGC)

   Note on attribution: client_id here is the GHL contact id, not the browser `_ga` cookie
   id, so revenue registers but won't stitch to the original web session/source. Acceptable
   tradeoff — the goal is getting purchase revenue to REGISTER. */

var DEFAULT_MEASUREMENT_ID = 'G-5KD888CEP2';

/* Look for a field across both the top-level body and GHL's nested customData object,
   accepting a few likely aliases. Case-INSENSITIVE on the field name (so "key"/"Key"
   and "value"/"Value" all match) and returns the first non-empty match — forgiving of
   casing typos. Name order is preferred over source order. */
function pick(body, names) {
  var sources = [body, body.customData || {}, body.custom_data || {}];
  for (var s = 0; s < sources.length; s++) {
    var src = sources[s];
    if (!src || typeof src !== 'object') continue;
    var keys = Object.keys(src);
    for (var i = 0; i < names.length; i++) {
      var want = names[i].toLowerCase();
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase() === want) {
          var v = src[keys[k]];
          if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
      }
    }
  }
  return undefined;
}

/* Strip currency symbols / commas so "$36.00" or "36" both become 36. */
function toNumber(v) {
  if (v === undefined || v === null) return NaN;
  return parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
}

/* ESM export — this repo's package.json has "type":"module", so CommonJS
   module.exports would crash the function on load (FUNCTION_INVOCATION_FAILED). */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  var body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  /* shared-secret gate — without it, anyone who found the URL could POST fake revenue.
     Trim both sides so stray whitespace from a copy-paste can't cause a false 401. */
  var ingestKey = process.env.EGC_GA4_INGEST_KEY;
  var sentKey = pick(body, ['key', 'ingest_key']);
  if (!ingestKey || String(sentKey).trim() !== String(ingestKey).trim()) {
    res.status(401).json({ error: 'clearance required' });
    return;
  }

  var measurementId = process.env.GA4_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
  var apiSecret = process.env.GA4_MP_API_SECRET;
  if (!apiSecret) {
    res.status(500).json({ error: 'server not configured (missing GA4_MP_API_SECRET)' });
    return;
  }

  var clientId = pick(body, ['client_id', 'clientId', 'contact_id']);
  var transactionId = pick(body, ['transaction_id', 'invoice_number', 'invoiceId', 'invoice_id']);
  if (!clientId) clientId = 'ghl.' + (transactionId || 'unknown');
  clientId = String(clientId);

  var value = toNumber(pick(body, ['value', 'total_price', 'amount', 'total']));
  var currency = String(pick(body, ['currency']) || 'USD').toUpperCase();

  var params = { currency: currency };
  if (!isNaN(value)) params.value = value;
  if (transactionId) params.transaction_id = String(transactionId);

  var payload = {
    client_id: clientId,
    non_personalized_ads: false,
    events: [{ name: 'purchase', params: params }]
  };

  var debug = !!(pick(body, ['debug']) || (req.query && req.query.debug));
  var base = debug ? 'https://www.google-analytics.com/debug/mp/collect'
                   : 'https://www.google-analytics.com/mp/collect';
  var endpoint = base
    + '?measurement_id=' + encodeURIComponent(measurementId)
    + '&api_secret=' + encodeURIComponent(apiSecret);

  try {
    var r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var text = await r.text();
    var parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch (_) { parsed = text; } }
    res.status(200).json({
      ok: r.ok,
      sent: {
        name: 'purchase',
        client_id: clientId,
        value: params.value !== undefined ? params.value : null,
        currency: currency,
        transaction_id: params.transaction_id || null
      },
      ga4Status: r.status,
      ga4Response: parsed
    });
  } catch (e) {
    res.status(502).json({ error: 'forward failed', detail: String((e && e.message) || e) });
  }
};
