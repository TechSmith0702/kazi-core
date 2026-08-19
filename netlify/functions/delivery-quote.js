/* ============================================================
   delivery-quote — courier delivery fee from the customer's address
   ------------------------------------------------------------
   Free within DELIVERY_RADIUS_KM of the business origin, else
   DELIVERY_FEE_CENTS. The customer never chooses — the distance is
   measured — so the fee can't be gamed.

   The business ORIGIN (Eastleigh) and the Google key live ONLY in
   Netlify environment variables — never in this repo, never shown
   to visitors. Env vars:
     GOOGLE_MAPS_KEY        Google Geocoding API key
     DELIVERY_ORIGIN_LAT    origin latitude  (e.g. -26.1408)
     DELIVERY_ORIGIN_LNG    origin longitude (e.g.  28.1553)
     DELIVERY_RADIUS_KM     free radius, default 10
     DELIVERY_FEE_CENTS     fee beyond radius, default 12000 (R120)
   ============================================================ */

const KEY = process.env.GOOGLE_MAPS_KEY || '';
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

  // Not set up yet → tell the client to fall back gracefully.
  if (!KEY || isNaN(ORIGIN_LAT) || isNaN(ORIGIN_LNG)) return json(200, { configured: false });

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  let a;
  try { a = JSON.parse(raw || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  const parts = [a.street, a.suburb, a.city, a.postal, 'South Africa'].filter(Boolean);
  if (parts.length < 2) return json(400, { error: 'Address required' });

  try {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?region=za&address=' +
      encodeURIComponent(parts.join(', ')) + '&key=' + KEY;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.results || !data.results.length) {
      return json(200, { configured: true, resolved: false });
    }
    const loc = data.results[0].geometry.location;
    const km = haversineKm(ORIGIN_LAT, ORIGIN_LNG, loc.lat, loc.lng);
    const within = km <= RADIUS_KM;
    return json(200, { configured: true, resolved: true, km: Math.round(km * 10) / 10, within: within, fee: within ? 0 : FEE_CENTS });
  } catch (e) {
    console.error('[delivery-quote]', e);
    return json(502, { error: 'Geocoding failed' });
  }
};
