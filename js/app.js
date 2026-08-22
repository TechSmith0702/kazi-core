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
  const WA_NUMBER = '27634902590';  // WhatsApp: 063 490 2590 in international format
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

    // Delivery follows the customer's suburb (free-zone list) — recomputed on
    // every render so the summary updates live as they type their address.
    const subVal = ((document.querySelector('[name="c-suburb"]') || {}).value || '').trim();
    deliveryDone = !!subVal;
    deliveryFar = subVal ? !inFreeZone(subVal) : false;

    const sub = subtotal();
    const delivery = deliveryCents();
    $('#sumSubtotal').textContent = money(sub);
    $('#sumDelivery').textContent = deliveryDone ? (delivery ? money(delivery) : 'Free') : 'Enter suburb';
    $('#sumTotal').textContent = money(sub + delivery);
  }

  // ---------- Delivery zone ----------
  // Free courier delivery within ~10km of our base; R120 beyond. Rather than
  // geocode every address live (free SA map data is patchy and mis-locates
  // some suburbs), we match the customer's suburb against a curated free-zone
  // measured once from our base. Anything not on the list is charged R120.
  // Names match loosely (case / spacing / punctuation ignored). Henny approves
  // this list — see the "Free-delivery zone" sheet. Borderline areas
  // (Germiston, Sandton, Birchleigh, Lambton, Morningside, Observatory) are
  // left OFF (R120) until she opts them in.
  const FREE_SUBURBS = [
    'Alexandra', 'Bedfordview', 'Bonaero Park', 'Bramley', 'Bramley Park',
    'Bruma', 'Cyrildene', 'Dowerglen', 'Eastleigh', 'Edenvale', 'Edleen',
    'Elandsfontein', 'Founders Hill', 'Founders View', 'Gardenview',
    'Greenstone', 'Greenstone Hill', 'Harmelia', 'Hurleyvale', 'Illiondale',
    'Isando', 'Kelvin', 'Kempton Park', 'Kensington', 'Linbro Park',
    'Lombardy East', 'Lyndhurst', 'Malvern', 'Marlboro', 'Meadowdale',
    'Modderfontein', 'Primrose', 'Rhodesfield', 'Sebenza', 'Spartan',
    'Sydenham', 'Van Riebeeck Park', 'Wynberg'
  ];
  const normZone = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  const FREE_ZONE = new Set(FREE_SUBURBS.map(normZone));
  const inFreeZone = (suburb) => FREE_ZONE.has(normZone(suburb));

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

  // Save the full order (items + delivery address) to sessionStorage before
  // the Payfast redirect, so we can record it and show its reference when the
  // customer returns. sessionStorage survives the round-trip to Payfast.
  function stashPendingOrder(ref) {
    var val = function (n) { return ((document.querySelector('[name="' + n + '"]') || {}).value || '').trim(); };
    var items = Object.keys(cart).map(function (id) {
      var p = byId(id);
      return p ? (cart[id] + '× ' + p.name + ' (' + money(p.price * cart[id]) + ')') : '';
    }).filter(Boolean).join(', ');
    var order = {
      ref: ref,
      name: val('c-name'),
      email: val('c-email'),
      phone: val('c-phone'),
      address: ['c-street', 'c-suburb', 'c-city', 'c-postal'].map(val).filter(Boolean).join(', '),
      items: items,
      subtotal: money(subtotal()),
      delivery: deliveryCents() ? money(deliveryCents()) : 'Free',
      total: money(subtotal() + deliveryCents())
    };
    try { sessionStorage.setItem('kc-pending-order', JSON.stringify(order)); } catch (e) { /* ignore */ }
  }

  // Record a paid order via the hidden Netlify "order" form (emails the
  // business the full order incl. delivery address). Fires only on success.
  function submitOrderRecord(order) {
    var body = new URLSearchParams({
      'form-name': 'order',
      ref: order.ref, name: order.name, email: order.email, phone: order.phone,
      address: order.address, items: order.items,
      subtotal: order.subtotal, delivery: order.delivery, total: order.total
    }).toString();
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body })
      .catch(function (e) { console.error('[order] record failed', e); });
  }

  function placeOrder() {
    if (cartCount() === 0) return;

    var method = (document.querySelector('input[name="pay"]:checked') || {}).value;

    if (method === 'card' && window.KaziPayfast) {
      // Stash the order, then hand off to Payfast. On return, the ?payment=
      // handler shows the confirmation and records the paid order.
      var nm = splitName((document.querySelector('[name="c-name"]') || {}).value);
      var ref = 'KC-' + Date.now();
      stashPendingOrder(ref);
      $('#payError').hidden = true;
      var result = window.KaziPayfast.checkout({
        cart: cart,
        deliveryFar: deliveryFar,
        firstName: nm.first,
        lastName: nm.last,
        email: (document.querySelector('[name="c-email"]') || {}).value || '',
        cell: (document.querySelector('[name="c-phone"]') || {}).value || '',
        paymentId: ref
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

    // Payfast not loaded — confirm locally (fallback).
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
      // Recover the stashed order: show its real reference and record it.
      var order = null;
      try { order = JSON.parse(sessionStorage.getItem('kc-pending-order') || 'null'); } catch (e) { order = null; }
      if (order) {
        if (order.ref) $('#orderNumber').textContent = order.ref;
        submitOrderRecord(order);
        sessionStorage.removeItem('kc-pending-order');
      }
      showConfirmation();
    } else if (status === 'cancelled') {
      go('checkout');
      sessionStorage.removeItem('kc-pending-order');
      $('#payCancelled').hidden = false;
    }
  }

  /* ---------- Wire up events ---------- */
  function init() {
    // Point the floating WhatsApp button at WA_NUMBER (single source of truth)
    var waFloat = document.getElementById('waFloat');
    if (waFloat) waFloat.href = 'https://wa.me/' + WA_NUMBER;

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

    // Delivery fee updates live in the order summary as the customer types
    // their suburb — free if it's in our free-delivery zone, else R120.
    const suburbEl = document.querySelector('[name="c-suburb"]');
    if (suburbEl) suburbEl.addEventListener('input', () => { if (page === 'checkout') renderCheckout(); });

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
