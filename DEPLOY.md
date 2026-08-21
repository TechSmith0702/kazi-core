# Deploying Kazi Core + turning on Payfast payments

This gets the site live on the internet and switches card payments from **demo** to **real**.
Nothing here charges anyone until you deliberately switch to live mode at the end.

There are two parts:
- **A. Put the site online** (Netlify — free)
- **B. Connect Payfast** (env vars + test + go live)

---

## A. Put the site online with Netlify

Netlify hosts the site **and** runs the two payment functions in `netlify/functions/`.
The most reliable way (auto-updates whenever we change the site) is via GitHub:

### Recommended: GitHub → Netlify
1. Create a free account at **github.com** and a free account at **netlify.com**
   (you can "Sign up with GitHub" to link them).
2. Put this `kazi-core` folder into a GitHub repository.
   *(I can set the folder up as a git repo and prep it for pushing — just ask.)*
3. In Netlify: **Add new site → Import an existing project → GitHub**, and pick the repo.
4. Build settings (Netlify usually detects these from `netlify.toml`, but confirm):
   - **Publish directory:** `.` (or `kazi-core` if the repo contains this folder inside it)
   - **Functions directory:** `netlify/functions`
   - No build command needed.
5. Click **Deploy**. In ~1 minute you'll get a live URL like
   `https://kazi-core.netlify.app` (you can rename it, or add the real
   `kazicore.co.za` domain later under **Domain settings**).

### Simpler alternative: Netlify CLI (no GitHub)
On a computer with Node installed, inside the `kazi-core` folder:
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```
When it asks, set **publish directory** to `.`. This bundles the functions too.

---

## B. Connect Payfast

### 1. Add the secret keys as environment variables
In Netlify: **Site configuration → Environment variables → Add a variable**.
Add these four (your friend gets the values from Payfast → **Settings → Integration**):

| Key | Value | Notes |
|-----|-------|-------|
| `PAYFAST_MERCHANT_ID` | `36649789` | Already known |
| `PAYFAST_MERCHANT_KEY` | *(her Merchant Key)* | From the dashboard |
| `PAYFAST_PASSPHRASE` | *(her Passphrase)* | 🔒 The secret. She types it **here**, not in chat or code |
| `PAYFAST_MODE` | `sandbox` | Keep on `sandbox` until testing passes, then change to `live` |

After adding/changing variables, **redeploy** (Netlify → Deploys → Trigger deploy) so the
functions pick them up.

> Make sure the same **Passphrase** is set in the Payfast dashboard *and* here — they must match,
> or Payfast rejects the signature.

### 2. Point Payfast's notify URL (ITN) at the site
In the Payfast dashboard, set the **Notify URL / ITN URL** to:
```
https://YOUR-SITE.netlify.app/.netlify/functions/payfast-notify
```
(Replace `YOUR-SITE` with the real Netlify address.)

### 3. Turn on real payments in the site
In `js/payfast.js`, change:
```js
demo: true,
```
to:
```js
demo: false,
```
Save and redeploy. Now the **Card** option calls the signing function for real.

### 4. Test in Sandbox first (no real money)
With `PAYFAST_MODE = sandbox`, add something to the cart and check out with **Card**.
Payfast's sandbox lets you complete a test payment with test card details. Confirm:
- You get redirected to Payfast, can "pay", and come back to the confirmation.
- In Netlify → **Functions → payfast-notify → logs**, you see `Payment COMPLETE`.

### 5. Go live
When the sandbox test works:
1. Set `PAYFAST_MODE = live` in Netlify and redeploy.
2. Do **one small real purchase** yourselves (e.g. the cheapest item) to confirm a real
   card works and the money lands in her Payfast account, then refund it from the Payfast
   dashboard if you like.

That's it — real card + Instant EFT payments are live. 🎉

---

## C. Booking requests (Netlify Forms)

The "Request a booking" form on the Kazi Kleen page is wired up as a **Netlify Form**
(named `booking`). Netlify captures submissions automatically once the site is deployed —
no extra code. To receive the bookings:

1. Deploy the site (Part A). On the first deploy, Netlify detects the `booking` form.
2. In Netlify: **Forms** (left sidebar) → you'll see **booking** listed. Submissions appear here.
3. To get emailed on each booking: **Forms → Settings & usage → Form notifications →
   Add notification → Email notification**, and enter `kazicoreholdings@gmail.com`.
   (You can also add a notification on the `booking` form specifically.)
4. Test it: open the live site, submit a booking, and check it appears under **Forms** and
   arrives by email.

Notes:
- Free tier covers 100 submissions/month. Spam is filtered by a hidden honeypot field.
- Bookings do **not** work on `localhost` — only on the deployed Netlify site.

---

## D. Delivery fee by zone (free — no API key)

Checkout works out the courier fee from a **free-delivery zone list**: **free** if the customer's
suburb is on the list (all measured to be within ~10 km of the business), **R120** otherwise.
The customer enters their suburb, clicks **"Check my delivery fee"**, and it's matched instantly
against the list — **no geocoding, no API, no key, no card, nothing to dispute.**

Why a list instead of live distance: free SA map data is patchy and mis-locates some suburbs
(e.g. it put Sebenza and Modderfontein 60+ km away when they're ~2–7 km). A curated list — measured
once and human-checked — is accurate, instant, and can't be gamed by the customer.

The list lives in `js/app.js` as `FREE_SUBURBS`. To change it:
1. Edit the `FREE_SUBURBS` array (names match loosely — case / spaces / punctuation ignored).
2. Redeploy. That's it — no env vars.

**Henny approves the zone.** Borderline suburbs (10–13 km: Germiston, Sandton, Birchleigh,
Lambton, Morningside, Observatory) are currently **off** the list (charged R120) until she opts
them in. See the "Free-delivery zone" sheet sent for sign-off.

Anti-gaming note: when card payments go live, `payfast-sign` should re-check the suburb against
the same `FREE_SUBURBS` list server-side (rather than trust the client's `deliveryFar` flag)
before charging. Flagged for the payments go-live step.

---

## Later (optional, nice to have)
- **Order emails:** right now a completed payment is verified and logged. We can add a step in
  `payfast-notify.js` to email each order to `kazicoreholdings@gmail.com`.
- **Custom domain:** attach `kazicore.co.za` in Netlify → Domain settings.
