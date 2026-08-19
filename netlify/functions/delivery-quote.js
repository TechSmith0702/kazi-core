/* ============================================================
   delivery-quote — courier delivery fee from the customer's address
   ------------------------------------------------------------
   Free within DELIVERY_RADIUS_KM of the business origin, else
   DELIVERY_FEE_CENTS. The customer never chooses — the distance is
   measured — so the fee can't be gamed.

   Geocoding uses OpenStreetMap Nominatim (free, no API key, no card).
   The business ORIGIN (Eastleigh) lives ONLY in Netlify environment
   variables — never in this repo, never shown to visitors. Env vars:
     DELIVERY_ORIGIN_LAT    origin latitude  (e.g. -26.1328)
     DELIVERY_ORIGIN_LNG    origin longitude (e.g.  28.1602)
     DELIVERY_RADIUS_KM     free radius, default 10
     DELIVERY_FEE_CENTS     fee beyond radius, default 12000 (R120)
   ============================================================ */

const ORIGIN_LAT = parseFloat(process.env.DELIVERY_ORIGIN_LAT);
const ORIGIN_LNG = parseFloat(process.env.DELIVERY_ORIGIN_LNG);
const RADIUS_KM = parseFloat(process.env.DELIVERY_RADIUS_KM || '10');
const FEE_CENTS = parseInt(process.env.DELIVERY_FEE_CENTS || '12000', 10);

function json(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// Straight-line (radius) distance in km between two lat/lng points.
function haversineKm(la1, lo1, la2, lo2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLa = toRad(la2 - la1);
  const dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  // Origin not set yet → tell the client to fall back gracefully.
  if (isNaN(ORIGIN_LAT) || isNaN(ORIGIN_LNG)) return json(200, { configured: false });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  let a;
  try { a = JSON.parse(raw || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  const parts = [a.street, a.suburb, a.city, a.postal, 'South Africa'].filter(Boolean);
  if (parts.length < 2) return json(400, { error: 'Address required' });

  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=za&q=' +
      encodeURIComponent(parts.join(', '));
    // Nominatim's usage policy asks for a descriptive User-Agent.
    const res = await fetch(url, { headers: { 'User-Agent': 'KaziCore-Delivery/1.0 (kazicore.netlify.app)' } });
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) {
      return json(200, { configured: true, resolved: false });
    }
    const km = haversineKm(ORIGIN_LAT, ORIGIN_LNG, parseFloat(list[0].lat), parseFloat(list[0].lon));
    const within = km <= RADIUS_KM;
    return json(200, { configured: true, resolved: true, km: Math.round(km * 10) / 10, within: within, fee: within ? 0 : FEE_CENTS });
  } catch (e) {
    console.error('[delivery-quote]', e);
    return json(502, { error: 'Geocoding failed' });
  }
};
