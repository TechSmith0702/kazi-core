/* ============================================================
   Kazi Core Holdings — Payfast integration (front-end)
   ------------------------------------------------------------
   HOW THIS WORKS (secure redirect method)
   1. Customer picks "Card" and clicks Place order.
   2. We send the cart + their details to our serverless signing
      function (netlify/functions/payfast-sign). That function
      recomputes the price and signs the request with the SECRET
      passphrase — the browser never sees the passphrase.
   3. It returns the signed fields; we build a form and POST to
      Payfast. The customer pays on Payfast's own secure page and
      is redirected back. We never touch card details.

   MODES
   - demo: true  -> simulate the round-trip (no charge). Use until
                    the site is hosted with the function + env vars.
   - demo: false -> real payments via the signing function. The
                    sandbox-vs-live choice is made SERVER-SIDE by the
                    PAYFAST_MODE environment variable on Netlify.
   ============================================================ */

window.KaziPayfast = (function () {
  'use strict';

  var CONFIG = {
    // Flip to false once the site is deployed to Netlify with the
    // function + environment variables in place. See DEPLOY.md.
    demo: true,

    // Serverless endpoint that returns { action, fields } already
    // signed with the secret passphrase. Same-origin path on Netlify.
    sign_endpoint: '/.netlify/functions/payfast-sign'
  };

  // Build a hidden form from the signed fields and submit it,
  // which redirects the browser to Payfast.
  function submitToPayfast(action, fields) {
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.style.display = 'none';
    fields.forEach(function (f) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = f.name;
      input.value = f.value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  /* checkout(order, handlers)
     order    = { cart, firstName, lastName, email, cell, paymentId }
     handlers = { onError: fn }   (optional)
     Returns { simulated: true } in demo mode so the caller can show
     the confirmation itself. In live mode it returns { pending: true }
     and navigates to Payfast once the signature comes back. */
  function checkout(order, handlers) {
    handlers = handlers || {};

    if (CONFIG.demo) {
      return { simulated: true };
    }

    fetch(CONFIG.sign_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cart: order.cart || {},
        firstName: order.firstName || '',
        lastName: order.lastName || '',
        email: order.email || '',
        cell: order.cell || '',
        paymentId: order.paymentId || '',
        origin: location.origin
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('sign failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.action || !data.fields) throw new Error('bad sign response');
        submitToPayfast(data.action, data.fields);
      })
      .catch(function (err) {
        console.error('[payfast] could not start payment:', err);
        if (typeof handlers.onError === 'function') handlers.onError(err);
      });

    return { pending: true };
  }

  return {
    checkout: checkout,
    isDemo: function () { return CONFIG.demo === true; }
  };
})();
