# Kazi Core Holdings — website

A website for **Kazi Core Holdings (Pty) Ltd**, built from the approved wireframe.
Two divisions: **Kazi Kleen** (cleaning services) and **Essentials** (detergents, perfumes & home fragrances).

Plain HTML / CSS / JavaScript — no build tools, no frameworks. Just open and go.

## Pages / views
- **Home** — hero, the two divisions, why-choose-us, services & featured products, call-to-action
- **Kazi Kleen** — services list, 3-step process, booking request form
- **Essentials Shop** — product grid with category filter + sort, add-to-cart
- **Checkout** — details, payment method, order summary, order confirmation
- **Cart drawer** — slide-out cart with quantity controls (works across all pages)

The cart is saved in the browser (`localStorage`), so it survives a page refresh.

## Open it in VS Code
1. Open the `kazi-core` folder in VS Code (**File → Open Folder…**).
2. Install the **Live Server** extension (by Ritwick Dey) if you don't have it.
3. Right-click `index.html` → **Open with Live Server**.
   Your browser opens the site and auto-reloads whenever you save a file.

No Live Server? You can just double-click `index.html` to open it in a browser —
everything works except it's nicer to develop with live reload.

## Where things live
| File | What it holds |
|------|----------------|
| `index.html` | All page content and structure |
| `css/styles.css` | All styling — colours, fonts, layout (design tokens are the `--variables` at the top) |
| `js/app.js` | Behaviour — page switching, cart, shop filters/sort, checkout. Products are the `PRODUCTS` list at the top |
| `assets/logo.jpg` | The Kazi Core lotus logo |

## Easy things to change
- **Products / prices** — edit the `PRODUCTS` array at the top of `js/app.js`.
  Prices are in cents (e.g. `4999` = R49.99).
- **Delivery fee** — courier: free within 10km, `DELIVERY_FAR_CENTS` (R120) beyond. The
  customer picks their zone at checkout. Change the amount in `js/app.js` (and keep
  `netlify/functions/payfast-sign.js` in sync).
- **Colours** — the `:root { --green … }` block at the top of `css/styles.css`.
- **Contact details / social links** — the footer in `index.html`.

## Payments (Payfast)
The checkout offers **Card / Instant EFT via Payfast** and **Cash on delivery**.

- **Cash on delivery** works fully today.
- **Card** currently runs in **demo mode** (`demo: true` in `js/payfast.js`) — it simulates
  the Payfast round-trip and shows the confirmation, but charges nothing. This lets you
  see the full flow before going live.

### Turning on real card payments
The secure server pieces are **already built**:
- `netlify/functions/payfast-sign.js` — recomputes the price and signs the payment with the
  secret passphrase (kept in Netlify env vars, never in code).
- `netlify/functions/payfast-notify.js` — verifies each payment server-to-server with Payfast.
- `js/payfast.js` calls the signing function; set `demo: false` to go live.

To actually switch it on, follow **[DEPLOY.md](DEPLOY.md)** — it deploys the site to Netlify,
sets the four `PAYFAST_*` environment variables, tests in sandbox, then flips to live.
Payfast Merchant ID `36649789` is already in place; the Merchant Key + Passphrase are entered
in Netlify during deploy.

## Other things still to do (Phase 2)
- Real product photos & a hero image (swap the dashed "placeholder" boxes)
- Sending the booking form and completed orders somewhere (email or a small backend)
- A real domain (e.g. kazicore.co.za) — pairs with the Netlify hosting above
- Facebook & TikTok links once those pages exist (Instagram is already live)
