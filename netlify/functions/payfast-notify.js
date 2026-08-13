/* ============================================================
   Payfast — ITN (Instant Transaction Notification) handler
   ------------------------------------------------------------
   Payfast calls this server-to-server after a payment. This is
   the ONLY trustworthy confirmation that money changed hands
   (the browser redirect can be faked, so never fulfil an order
   on the redirect alone).

   It performs the checks Payfast recommends:
     1. Verify the signature of the posted data.
     2. Confirm the data really came from Payfast (validate call).
     3. Check payment_status === 'COMPLETE'.
   Then it's the place to fulfil the order (see the TODO).

   Env vars used: PAYFAST_PASSPHRASE, PAYFAST_MODE
   ============================================================ */

const crypto = require('crypto');

const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || '';
const MODE = (process.env.PAYFAST_MODE || 'sandbox').toLowerCase();

const VALIDATE_URL = MODE === 'live'
  ? 'https://www.payfast.co.za/eng/query/validate'
  : 'https://sandbox.payfast.co.za/eng/query/validate';

function pfEncode(v) {
  return encodeURIComponent(String(v).trim())
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

// Rebuild the signature from the posted data (in received order),
// excluding the signature field itself.
function signatureOf(orderedPairs, passphrase) {
  var str = orderedPairs
    .filter(function (p) { return p[0] !== 'signature' && String(p[1]).length > 0; })
    .map(function (p) { return p[0] + '=' + pfEncode(p[1]); })
    .join('&');
  if (passphrase && passphrase.length > 0) str += '&passphrase=' + pfEncode(passphrase);
  return crypto.createHash('md5').update(str).digest('hex');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  var raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');

  // Preserve field order exactly as Payfast sent it.
  var pairs = [];
  var data = {};
  raw.split('&').forEach(function (kv) {
    if (!kv) return;
    var i = kv.indexOf('=');
    var k = decodeURIComponent(kv.slice(0, i).replace(/\+/g, ' '));
    var v = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    pairs.push([k, v]);
    data[k] = v;
  });

  // 1) Signature check
  var expected = signatureOf(pairs, PASSPHRASE);
  if (expected !== data.signature) {
    console.warn('[ITN] signature mismatch', data.m_payment_id);
    return { statusCode: 400, body: 'invalid signature' };
  }

  // 2) Confirm with Payfast that this notification is genuine
  try {
    var res = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: raw
    });
    var text = (await res.text()).trim();
    if (text !== 'VALID') {
      console.warn('[ITN] Payfast did not return VALID:', text);
      return { statusCode: 400, body: 'not valid' };
    }
  } catch (e) {
    console.error('[ITN] validation request failed', e);
    return { statusCode: 500, body: 'validation error' };
  }

  // 3) Only a COMPLETE payment counts
  if (data.payment_status === 'COMPLETE') {
    // TODO (fulfilment): record/notify the order. Good options later:
    //  - email the order to kazicoreholdings@gmail.com
    //  - save it to a spreadsheet / database
    // Available fields include: m_payment_id, pf_payment_id, amount_gross,
    // item_name, name_first, name_last, email_address, cell_number.
    console.log('[ITN] Payment COMPLETE', {
      order: data.m_payment_id,
      amount: data.amount_gross,
      email: data.email_address
    });
  } else {
    console.log('[ITN] Payment status:', data.payment_status, data.m_payment_id);
  }

  // Always 200 so Payfast stops retrying.
  return { statusCode: 200, body: 'OK' };
};
