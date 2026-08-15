/* ============================================================
   Payfast — server-side signing (Netlify Function)
   ------------------------------------------------------------
   The browser sends the cart + customer details here. This
   function recomputes the price from its OWN catalogue (so the
   amount can't be tampered with), signs the request with the
   SECRET passphrase, and returns the ready-to-submit fields.

   Secrets come from Netlify environment variables — never code:
     PAYFAST_MERCHANT_ID
     PAYFAST_MERCHANT_KEY
     PAYFAST_PASSPHRASE
     PAYFAST_MODE   = 'sandbox' (testing) or 'live'
   ============================================================ */

const crypto = require('crypto');

const MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID || '';
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || '';
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE || '';
const MODE = (process.env.PAYFAST_MODE || 'sandbox').toLowerCase();

const PROCESS_URL = MODE === 'live'
  ? 'https://www.payfast.co.za/eng/process'
  : 'https://sandbox.payfast.co.za/eng/process';

// Source-of-truth catalogue (prices in cents). Only on-sale products go
// here. Keep in sync with the buyable items in js/app.js.
const PRODUCTS = {
  fl: { name: 'Fresh Linen', price: 7000 },
  wrl: { name: 'Wild Rose Linen', price: 7000 },
  sv: { name: 'Sweet Vanilla', price: 6500 },
  br: { name: 'Botanical Rose', price: 6500 }
};
const DELIVERY_CENTS = 6000;

// PHP-style urlencoding (spaces -> '+', uppercase hex) to match Payfast.
function pfEncode(v) {
  return encodeURIComponent(String(v).trim())
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

function sign(fields, passphrase) {
  var str = fields
    .filter(function (f) { return f.value !== undefined && f.value !== null && String(f.value).length > 0; })
    .map(function (f) { return f.name + '=' + pfEncode(f.value); })
    .join('&');
  if (passphrase && passphrase.length > 0) str += '&passphrase=' + pfEncode(passphrase);
  return crypto.createHash('md5').update(str).digest('hex');
}

function json(statusCode, obj) {
  return { statusCode: statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!MERCHANT_ID || !MERCHANT_KEY) return json(500, { error: 'Payment not configured' });

  var raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  var data;
  try { data = JSON.parse(raw || '{}'); } catch (e) { return json(400, { error: 'Bad request' }); }

  // Recompute the amount from OUR catalogue — ignore any client-sent amount.
  var cart = data.cart || {};
  var cents = 0, count = 0;
  Object.keys(cart).forEach(function (id) {
    var p = PRODUCTS[id];
    var q = Math.max(0, parseInt(cart[id], 10) || 0);
    if (p && q) { cents += p.price * q; count += q; }
  });
  if (count === 0) return json(400, { error: 'Cart is empty' });
  cents += DELIVERY_CENTS;
  var amount = (cents / 100).toFixed(2);

  // Where Payfast redirects the customer back to.
  var origin = String(data.origin || event.headers.origin || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(origin)) origin = '';

  var fields = [
    { name: 'merchant_id', value: MERCHANT_ID },
    { name: 'merchant_key', value: MERCHANT_KEY },
    { name: 'return_url', value: origin + '/?payment=success#checkout' },
    { name: 'cancel_url', value: origin + '/?payment=cancelled#checkout' },
    { name: 'notify_url', value: origin + '/.netlify/functions/payfast-notify' },
    { name: 'name_first', value: data.firstName || '' },
    { name: 'name_last', value: data.lastName || '' },
    { name: 'email_address', value: data.email || '' },
    { name: 'cell_number', value: data.cell || '' },
    { name: 'm_payment_id', value: data.paymentId || ('KC-' + Date.now()) },
    { name: 'amount', value: amount },
    { name: 'item_name', value: 'Kazi Core Essentials order' },
    { name: 'item_description', value: count + ' item(s) from Kazi Core Essentials' }
  ];

  var signature = sign(fields, PASSPHRASE);
  var out = fields.filter(function (f) { return String(f.value).length > 0; });
  out.push({ name: 'signature', value: signature });

  return json(200, { action: PROCESS_URL, fields: out, amount: amount });
};
