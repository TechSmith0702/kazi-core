/* ============================================================
   Kazi Core Holdings — app logic
   Vanilla JS: view routing, cart, shop filters/sort, checkout.
   Prices are stored in cents (ZAR) to avoid float rounding.
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Data ----------
     available:true items are on sale now (need price + image).
     available:false items show as "Coming soon" (not buyable).
     Prices in cents. Keep in sync with the server-side catalogue in
     netlify/functions/payfast-sign.js. */
  const PRODUCTS = [
    // Linen Sprays (R70)
    { id: 'fl', name: 'Fresh Linen', cat: 'Linen Spray', price: 7000, blurb: 'Freshens the air and protects the fabric. 100 ml.', image: 'assets/products/fresh-linen.jpg', available: true },
    { id: 'wrl', name: 'Wild Rose Linen', cat: 'Linen Spray', price: 7000, blurb: 'Wild rose scent — freshens the air and protects the fabric. 100 ml.', image: 'assets/products/wild-rose-linen.jpg', available: true },
    // Body Mists (R65)
    { id: 'sv', name: 'Sweet Vanilla', cat: 'Body Mist', price: 6500, blurb: 'Sweet vanilla body mist. 100 ml.', image: 'assets/products/sweet-vanilla.jpg', available: true },
    { id: 'br', name: 'Botanical Rose', cat: 'Body Mist', price: 6500, blurb: 'Botanical rose body mist. 100 ml.', image: 'assets/products/botanical-rose.jpg', available: true },
  ];

  const DELIVERY_FAR_CENTS = 12000; // R120 courier fee beyond a 10km radius (free within)
  const CART_KEY = 'kazi-cart';
  const PAGES = ['home', 'services', 'shop', 'checkout'];
  // Bump this whenever a product photo is replaced (same filename) so
  // browsers fetch the new image instead of a cached old one.
  const ASSET_V = '4';
  const imgSrc = (p) => p.image + '?v=' + ASSET_V;

  /* ---------- State ---------- */
  let cart = loadCart();          // { [id]: qty }
  let page = 'home';
  let filters = { 'Linen Spray': true, 'Body Mist': true };
  let sort = 'featured';
  let priceCap = Infinity;        // max price (Rand) from the slider
  let deliveryFar = false;        // true = beyond 10km (R120), false = within 10km (free)
  let deliveryDone = false;       // has the delivery fee been calculated from the address?
  const deliveryCents = () => (deliveryFar ? DELIVERY_FAR_CENTS : 0);

  /* ---------- Helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const money = (cents) => 'R' + (cents / 100).toFixed(2);
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const buyable = (p) => !!(p && p.available && p.price);
  const cartCount = () => Object.values(cart).reduce((n, q) => n + q, 0);
  const subtotal = () => Object.keys(cart).reduce((s, id) => {
    const p = byId(id);
    return s + (buyable(p) ? p.price * cart[id] : 0);
  }, 0);

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      // Drop anything no longer buyable (stale ids, coming-soon items).
      const clean = {};
      Object.keys(obj).forEach((id) => {
        const q = parseInt(obj[id], 10);
        if (buyable(byId(id)) && q > 0) clean[id] = q;
      });
      return clean;
    } catch (e) { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* ignore */ }
  }

  /* ---------- Routing ---------- */
  function go(target, openDrawer) {
    if (!PAGES.includes(target)) target = 'home';
    page = target;
    // Clear transient checkout banners so "Order confirmed" only shows right
    // after Place order (and disappears on Back to home / Keep shopping).
    ['#confirmBlock', '#payDemo', '#payCancelled', '#payError'].forEach((sel) => {
      const el = $(sel); if (el) el.hidden = true;
    });
    PAGES.forEach((p) => {
      const el = $('#view-' + p);
      if (el) el.hidden = p !== page;
    });
    $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
    if (page === 'shop') renderShop();
    if (page === 'checkout') renderCheckout();
    if (openDrawer !== true) closeDrawer();
    if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
    window.scrollTo(0, 0);
  }

  /* ---------- Cart operations ---------- */
  function addToCart(id) {
    if (!buyable(byId(id))) return; // coming-soon items can't be added
    cart[id] = (cart[id] || 0) + 1;
    saveCart();
    syncCartUI();
    openDrawer();
  }
  function changeQty(id, delta) {
    cart[id] = (cart[id] || 0) + delta;
    if (cart[id] <= 0) delete cart[id];
    saveCart();
    syncCartUI();
  }

  /* Keep every cart-dependent surface in sync after any change */
  function syncCartUI() {
    const count = cartCount();
    const badge = $('#cartBadge');
    badge.textContent = count;
    badge.hidden = count === 0;
    renderDrawer();
    if (page === 'checkout') renderCheckout();
  }

  /* ---------- Drawer ---------- */
  function openDrawer() {
    $('#cartDrawer').classList.add('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'false');
    $('#drawerOverlay').classList.add('open');
  }
  function closeDrawer() {
    $('#cartDrawer').classList.remove('open');
    $('#cartDrawer').setAttribute('aria-hidden', 'true');
    $('#drawerOverlay').classList.remove('open');
  }

  /* ---------- Rendering: product cards ---------- */
  function productCard(p, addClass) {
    const tagClass = p.cat === 'Linen Spray' ? 'tag-linen' : 'tag-mist';
    const canBuy = buyable(p);
    const el = document.createElement('div');
    el.className = 'product' + (canBuy ? '' : ' product-soon');

    // Photo: <img> covers the "Product photo" fallback; if the file is
    // missing, onerror removes the img and the fallback shows through.
    const media =
      '<div class="product-media">' +
        (canBuy ? '' : '<span class="soon-flag">Coming soon</span>') +
        (p.image ? '<img class="product-img" src="' + imgSrc(p) + '" alt="' + p.name + '" loading="lazy" onerror="this.remove()">' : '') +
        '<span class="product-media-ph">Product photo</span>' +
      '</div>';

    const priceHtml = canBuy
      ? '<span class="product-price">' + money(p.price) + '</span>'
      : '<span class="product-price product-price-soon">Coming soon</span>';

    const btnHtml = canBuy
      ? '<button class="btn-add ' + addClass + '" type="button" data-add="' + p.id + '">Add to cart</button>'
      : '<button class="btn-add btn-add-soon" type="button" disabled>Coming soon</button>';

    el.innerHTML =
      media +
      '<div class="product-body">' +
        '<span class="product-tag ' + tagClass + '">' + p.cat + '</span>' +
        '<h4 class="product-name">' + p.name + '</h4>' +
        (p.blurb ? '<p class="product-blurb">' + p.blurb + '</p>' : '') +
        priceHtml + btnHtml +
      '</div>';
    return el;
  }

  // Available products first, coming-soon after.
  function availableFirst(list) {
    return list.slice().sort((a, b) => (b.available ? 1 : 0) - (a.available ? 1 : 0));
  }

  function renderFeatured() {
    const grid = $('#featuredGrid');
    if (!grid) return;
    grid.innerHTML = '';
    availableFirst(PRODUCTS).slice(0, 4).forEach((p) => grid.appendChild(productCard(p, 'btn-add-terra')));
  }

  /* ---------- Rendering: shop ---------- */
  function renderShop() {
    // Category + price-cap filter (coming-soon items have no price → always kept).
    const list = PRODUCTS.filter((p) => filters[p.cat] && (p.price == null || p.price <= priceCap * 100));
    // Sort only the buyable items; coming-soon always sit at the end.
    let avail = list.filter((p) => p.available);
    const soon = list.filter((p) => !p.available);
    if (sort === 'low') avail = avail.slice().sort((a, b) => a.price - b.price);
    else if (sort === 'high') avail = avail.slice().sort((a, b) => b.price - a.price);
    else if (sort === 'az') avail = avail.slice().sort((a, b) => a.name.localeCompare(b.name));
    const ordered = avail.concat(soon);

    const grid = $('#shopGrid');
    grid.innerHTML = '';
    ordered.forEach((p) => grid.appendChild(productCard(p, 'btn-add-green')));

    $('#resultCount').textContent = ordered.length;
    $('#shopEmpty').hidden = ordered.length !== 0;
  }

  /* ---------- Rendering: drawer ---------- */
  function renderDrawer() {
    const body = $('#drawerBody');
    const foot = $('#drawerFoot');
    const ids = Object.keys(cart);

    if (ids.length === 0) {
      body.innerHTML = '<div class="drawer-empty">Nothing here yet.<br><span>Add an Essentials product to get started.</span></div>';
      foot.hidden = true;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'drawer-items';
    ids.forEach((id) => {
      const p = byId(id);
      const row = document.createElement('div');
      row.className = 'drawer-item';
      row.innerHTML =
        '<span class="drawer-thumb' + (p.image ? ' has-img' : '') + '">' +
          (p.image ? '<img class="thumb-img" src="' + imgSrc(p) + '" alt="' + p.name + '" onerror="this.parentNode.classList.remove(\'has-img\');this.remove()">' : '') +
        '</span>' +
        '<div class="drawer-item-info">' +
          '<span class="drawer-item-name">' + p.name + '</span>' +
          '<span class="drawer-item-price">' + money(p.price) + '</span>' +
        '</div>' +
        '<div class="qty-ctrl">' +
          '<button class="qty-btn" type="button" data-dec="' + id + '">−</button>' +
          '<span class="qty-val">' + cart[id] + '</span>' +
          '<button class="qty-btn" type="button" data-inc="' + id + '">+</button>' +
        '</div>';
      wrap.appendChild(row);
    });
    body.innerHTML = '';
    body.appendChild(wrap);

    $('#drawerSubtotal').textContent = money(subtotal());
    foot.hidden = false;
  }

  /* ---------- Rendering: checkout ---------- */
  function renderCheckout() {
    const ids = Object.keys(cart);
    const empty = $('#checkoutEmpty');
    const filled = $('#checkoutFilled');

    if (ids.length === 0) {
      empty.hidden = false;
      filled.hidden = true;
      return;
    }
    empty.hidden = true;
    filled.hidden = false;

    const lines = $('#summaryLines');
    lines.innerHTML = '';
    ids.forEach((id) => {
      const p = byId(id);
      const qty = cart[id];
      const row = document.createElement('div');
      row.className = 'summary-item';
      row.innerHTML =
        '<span class="summary-thumb' + (p.image ? ' has-img' : '') + '">' +
          (p.image ? '<img class="thumb-img" src="' + imgSrc(p) + '" alt="' + p.name + '" onerror="this.parentNode.classList.remove(\'has-img\');this.remove()">' : '') +
        '</span>' +
        '<span class="summary-item-info">' +
          '<span class="summary-item-name">' + p.name + '</span>' +
          '<span class="summary-item-qty">Qty ' + qty + '</span>' +
        '</span>' +
        '<span class="summary-item-line">' + money(p.price * qty) + '</span>';
      lines.appendChild(row);
    });

    const sub = subtotal();
    const delivery = deliveryCents();
    $('#sumSubtotal').textContent = money(sub);
    $('#sumDelivery').textContent = delivery ? money(delivery) : 'Free';
    $('#sumTotal').textContent = money(sub + delivery);
  }

  function setDeliveryResult(msg, kind) {
    const el = $('#deliveryResult');
    if (!el) return;
    el.textContent = msg;
    el.className = 'delivery-result delivery-' + (kind || 'info');
    el.hidden = false;
  }

  // ---------- Delivery distance ----------
  const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // Eastleigh — LOCAL TESTING ONLY. In production the hidden server function
  // (delivery-quote, origin from env vars) is authoritative and this is unused.
  const TEST_ORIGIN = { lat: -26.1328, lng: 28.1602 };

  function haversineKm(la1, lo1, la2, lo2) {
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Local/testing geocode via OpenStreetMap Nominatim (free, no key).
  function localGeocodeQuote(addr) {
    const q = [addr.street, addr.suburb, addr.city, addr.postal, 'South Africa'].filter(Boolean).join(', ');
    return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=za&q=' + encodeURIComponent(q))
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list) || !list.length) return { configured: true, resolved: false };
        const km = haversineKm(TEST_ORIGIN.lat, TEST_ORIGIN.lng, parseFloat(list[0].lat), parseFloat(list[0].lon));
        const within = km <= 10;
        return { configured: true, resolved: true, km: Math.round(km * 10) / 10, within: within, fee: within ? 0 : DELIVERY_FAR_CENTS };
      });
  }

  // Prefer the deployed server function (hidden origin); on localhost fall
  // back to client-side geocoding so it's testable without deploying.
  function quoteDelivery(addr) {
    return fetch('/.netlify/functions/delivery-quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addr)
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fn ' + r.status))))
      .then((d) => ((d && d.configured === false && isLocalHost) ? localGeocodeQuote(addr) : d))
      .catch(() => { if (isLocalHost) return localGeocodeQuote(addr); throw new Error('unavailable'); });
  }

  // Split a full name into first / last for Payfast
  function splitName(full) {
    var parts = (full || '').trim().split(/\s+/);
    return { first: parts.shift() || '', last: parts.join(' ') };
  }

  function showConfirmation() {
    cart = {};
    saveCart();
    syncCartUI();
    renderCheckout();
    $('#confirmBlock').hidden = false;
    $('#confirmBlock').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function placeOrder() {
    if (cartCount() === 0) return;

    var method = (document.querySelector('input[name="pay"]:checked') || {}).value;

    if (method === 'card' && window.KaziPayfast) {
      // Hand off to Payfast. On return, the ?payment= handler in init()
      // shows the confirmation (success) or the cancelled note.
      var nm = splitName((document.querySelector('[name="c-name"]') || {}).value);
      $('#payError').hidden = true;
      var result = window.KaziPayfast.checkout({
        cart: cart,
        deliveryFar: deliveryFar,
        firstName: nm.first,
        lastName: nm.last,
        email: (document.querySelector('[name="c-email"]') || {}).value || '',
        cell: (document.querySelector('[name="c-phone"]') || {}).value || '',
        paymentId: 'KC-' + Date.now()
      }, {
        onError: function () { $('#payError').hidden = false; }
      });

      if (result && result.simulated) {
        // Demo mode — no real redirect. Show the flow's outcome.
        $('#payDemo').hidden = false;
        showConfirmation();
      }
      return; // for real payments the browser navigates to Payfast
    }

    // Cash on delivery (or Payfast not loaded) — confirm locally.
    showConfirmation();
  }

  // Handle the redirect back from Payfast (?payment=success | cancelled)
  function handlePaymentReturn() {
    var params = new URLSearchParams(location.search);
    var status = params.get('payment');
    if (!status) return;

    // Clean the query out of the URL so a refresh doesn't re-trigger it
    history.replaceState(null, '', location.pathname + '#checkout');

    if (status === 'success') {
      go('checkout');
      showConfirmation();
    } else if (status === 'cancelled') {
      go('checkout');
      $('#payCancelled').hidden = false;
    }
  }

  /* ---------- Phone formatting (0__ ___ ____) ---------- */
  function formatPhone(v) {
    const d = v.replace(/\D/g, '').slice(0, 10);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
  }

  /* ---------- Wire up events ---------- */
  function init() {
    // Nav / any element with data-nav
    document.body.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-nav]');
      if (navEl) { e.preventDefault(); go(navEl.dataset.nav); return; }

      const addEl = e.target.closest('[data-add]');
      if (addEl) { addToCart(addEl.dataset.add); return; }

      const incEl = e.target.closest('[data-inc]');
      if (incEl) { changeQty(incEl.dataset.inc, 1); return; }

      const decEl = e.target.closest('[data-dec]');
      if (decEl) { changeQty(decEl.dataset.dec, -1); return; }
    });

    // Cart drawer open/close
    $('#openCart').addEventListener('click', openDrawer);
    $('#closeCart').addEventListener('click', closeDrawer);
    $('#drawerOverlay').addEventListener('click', closeDrawer);
    $('#drawerCheckout').addEventListener('click', () => go('checkout'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    // Shop filters + sort
    $('#filterLinen').addEventListener('change', (e) => { filters['Linen Spray'] = e.target.checked; renderShop(); });
    $('#filterMist').addEventListener('change', (e) => { filters['Body Mist'] = e.target.checked; renderShop(); });
    $('#sortSelect').addEventListener('change', (e) => { sort = e.target.value; renderShop(); });

    // Price slider — bounds derived from the products, defaults to "show all".
    const priceEl = $('#priceRange');
    if (priceEl) {
      const prices = PRODUCTS.filter(buyable).map((p) => p.price / 100);
      const maxP = prices.length ? Math.ceil(Math.max.apply(null, prices) / 5) * 5 : 100;
      priceEl.min = 0;
      priceEl.max = maxP;
      priceEl.value = maxP;
      priceEl.step = 5;
      priceCap = maxP;
      $('#priceCapVal').textContent = 'R' + maxP;
      priceEl.addEventListener('input', (e) => {
        priceCap = Number(e.target.value);
        $('#priceCapVal').textContent = 'R' + priceCap;
        renderShop();
      });
    }

    // Delivery fee — computed from the customer's address (free within 10km
    // of us, R120 beyond) via the delivery-quote serverless function.
    const calcBtn = $('#calcDelivery');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => {
        const v = (n) => ((document.querySelector('[name="' + n + '"]') || {}).value || '').trim();
        const addr = { street: v('c-street'), suburb: v('c-suburb'), city: v('c-city'), postal: v('c-postal') };
        if (!addr.street || !addr.city) { setDeliveryResult('Please enter your delivery address above first.', 'warn'); return; }
        setDeliveryResult('Checking distance…', 'info');
        calcBtn.disabled = true;
        quoteDelivery(addr)
          .then((data) => {
            if (!data || data.configured === false) throw new Error('not configured');
            if (data.resolved === false) { setDeliveryResult('We couldn\'t locate that address — please double-check it.', 'warn'); return; }
            deliveryFar = !data.within;
            deliveryDone = true;
            const kmTxt = (data.km != null) ? ' (~' + data.km + ' km away)' : '';
            setDeliveryResult(
              data.within ? '✓ You\'re within 10 km' + kmTxt + ' — delivery is free.'
                          : 'You\'re beyond 10 km' + kmTxt + ' — R120 delivery fee applies.',
              data.within ? 'ok' : 'warn');
            renderCheckout();
          })
          .catch(() => {
            setDeliveryResult('We couldn\'t work it out just now — Kazi Core will confirm your delivery fee from the address you gave.', 'info');
          })
          .finally(() => { calcBtn.disabled = false; });
      });
    }

    // Checkout
    $('#placeOrder').addEventListener('click', placeOrder);

    // Booking form → submitted to Netlify Forms via AJAX (keeps the SPA
    // on the page and shows an inline thank-you). Netlify captures it and
    // can email the booking to the owner. Only records on the live Netlify
    // site — locally the POST has nowhere to go, so it shows the error note.
    $('#bookingForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      $('#bookingNote').hidden = true;
      $('#bookingErr').hidden = true;
      const body = new URLSearchParams(new FormData(form)).toString();
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      })
        .then((res) => {
          if (!res.ok) throw new Error('booking submit failed: ' + res.status);
          form.reset();
          $('#bookingNote').hidden = false;
        })
        .catch((err) => {
          console.error('[booking]', err);
          $('#bookingErr').hidden = false;
        });
    });

    // Live phone formatting on any [data-phone] input
    $$('[data-phone]').forEach((input) => {
      input.addEventListener('input', (e) => { e.target.value = formatPhone(e.target.value); });
    });


    // Initial render
    renderFeatured();
    syncCartUI();

    // Open on the page named in the URL hash, if valid
    const initial = (location.hash || '').replace('#', '');
    go(PAGES.includes(initial) ? initial : 'home');

    // If we've just come back from Payfast, react to the result
    handlePaymentReturn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
