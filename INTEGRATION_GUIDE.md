# AsiaformS — PWA Upgrade Kit (Integration Guide)

This is a **drop-in add-on** — it doesn't touch any of your existing
files. Copy the new files into your project, paste a few small snippets
into your existing HTML `<head>`/`<body>`, and you're done. No Node, no
build step, no npm — works directly on GitHub Pages or InfinityFree.

## 1. Copy these new files into your project

```
manifest.json                          → project root
service-worker.js                      → project root (MUST be at root, not in js/)
offline.html                           → project root
browserconfig.xml                      → project root
css/pwa-extra.css                      → into your existing css/ folder
js/pwa.js                              → into your existing js/ folder
assets/icons/icon-192x192.png          → into your existing assets/ folder (new icons/ subfolder)
assets/icons/icon-512x512.png
assets/icons/maskable-icon-192x192.png
assets/icons/maskable-icon-512x512.png
assets/icons/apple-touch-icon.png
assets/icons/favicon.ico
assets/icons/mstile-150x150.png
```

## 2. Add this to the `<head>` of **every** HTML page

(`index.html`, `create-order.html`, `order.html`, and any others)

```html
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#0D3C7A">
<link rel="icon" href="assets/icons/favicon.ico">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="AsiaformS">
<meta name="msapplication-TileImage" content="assets/icons/mstile-150x150.png">
<meta name="msapplication-TileColor" content="#0D3C7A">
<meta name="msapplication-config" content="browserconfig.xml">
<link rel="stylesheet" href="css/pwa-extra.css">
```

Put it right after your existing `<link rel="stylesheet" href="css/style.css">`
line so `pwa-extra.css` loads second (it's additive-only, so order doesn't
strictly matter, but this keeps things tidy).

## 3. Add this just before `</body>` on **every** page

Put it **after** your existing `js/utils.js` script tag (pwa.js uses the
`qs()` and `showToast()` helpers from it):

```html
<script src="js/pwa.js"></script>
```

## 4. Add the Install button — representative pages ONLY

On **`index.html`** and **`create-order.html`** only (never on
`order.html`), add this button somewhere in your header/topbar actions —
for example next to your existing dark-mode toggle button:

```html
<button id="pwa-install-btn" class="btn btn--sm btn--install">⬇ Install App</button>
```

It's hidden by default (`#pwa-install-btn { display:none; }` in
`pwa-extra.css`) and `js/pwa.js` only reveals it once the browser
confirms the app is actually installable. **Do not add this button to
`order.html`** — since the element won't exist there, the script quietly
suppresses the browser's own install prompt on that page and shows
nothing, exactly as required.

## 5. (Optional but recommended) Branded loading splash on the dashboard

On **`index.html`** only, add this as the very first thing inside `<body>`,
before your topbar:

```html
<div id="pwa-splash" class="pwa-splash">
  <img src="assets/logo.png" alt="AsiaformS" />
  <div class="pwa-splash__bar"><div class="pwa-splash__bar-fill"></div></div>
</div>
```

`pwa.js` fades this out automatically once the page has finished loading.

## 6. Double-check the service worker's file list

Open `service-worker.js` and look at the `APP_SHELL` array near the top —
it lists the files to cache for offline use. It's written to match the
project structure from our earlier build (`index.html`, `create-order.html`,
`order.html`, `css/style.css`, the `js/*.js` files, etc.). **If your actual
project has different or additional file names, add them to that list** so
they get cached too. Anything not listed there just won't be available
offline — it won't break the page.

## 7. Shipping updates later

Whenever you upload changed files, open `service-worker.js` and bump:

```js
const CACHE_VERSION = 'v1.0.0';   // → 'v1.0.1', 'v1.1.0', etc.
```

That's the entire "new version" signal — visitors who already have the
app open (or installed) will see a **"🔄 New update available — Reload"**
pill at the bottom of the screen, and tapping Reload swaps in the new
version instantly. Forgetting to bump this is the #1 reason "my update
isn't showing" — the browser will otherwise keep serving the old cached
files.

## 8. Test it

1. Upload everything to GitHub Pages / InfinityFree (HTTPS is required for
   service workers to run — both platforms provide this automatically).
2. Open the dashboard in Chrome or Edge on desktop → you should see an
   install icon in the address bar, and/or your custom "Install App"
   button becomes active after a few seconds of engagement (this is a
   browser heuristic, not something you control directly).
3. Click it → the app opens in its own standalone window, gets a
   taskbar/dock icon, and shows up in your Start Menu / Applications.
4. On Android Chrome, visiting the dashboard should offer "Add to Home
   screen" the same way.
5. Turn on airplane mode after visiting the dashboard once online → reload
   → it should still load from cache instead of showing a browser error.
6. Open `order.html` (a customer link) → confirm no install button or
   prompt appears anywhere.

## What this kit deliberately does NOT touch

- Your Firebase / localStorage logic, order data, or collections
- Your PDF generation (`pdf.js`) or QR code logic
- Your existing `style.css`, dashboard, form, and customer-page markup
  and behavior
- Your folder structure — everything here is additive

If anything doesn't line up with your actual current file names (since I
wasn't able to open your `.rar` to check), the fix is almost always just
updating a path inside `service-worker.js`'s `APP_SHELL` list or the
`<script src="...">` paths above to match what you actually have.
