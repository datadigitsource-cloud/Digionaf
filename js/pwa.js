/* =========================================================
   pwa.js — service worker registration, install prompt and
   update-available banner.
   -----------------------------------------------------------
   Include this file on every page. It behaves differently
   depending on what's present in that page's HTML:

   - The "Install Application" button only appears if the page
     has an element with id="pwa-install-btn". Add that button
     to index.html and create-order.html (representative
     pages). Do NOT add it to order.html (customer page) — with
     no button to wire up, this script simply suppresses the
     browser's own install prompt there and does nothing else,
     so the customer is never shown any install UI.
   ========================================================= */

let _deferredInstallPrompt = null;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .then((registration) => {
        // Check for an updated worker already waiting (e.g. user had the
        // tab open when a new version was deployed).
        if (registration.waiting) {
          showUpdateBanner(registration);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A previous version was already controlling this page, so
              // this is a genuine update, not the first install.
              showUpdateBanner(registration);
            }
          });
        });
      })
      .catch((err) => console.warn('Service worker registration failed', err));

    // When the new worker takes over, reload once to run the fresh assets.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}

function showUpdateBanner(registration) {
  if (qs('#pwa-update-banner')) return; // already showing
  const bar = document.createElement('div');
  bar.id = 'pwa-update-banner';
  bar.className = 'pwa-update-banner';
  bar.innerHTML = `
    <span>🔄 New update available</span>
    <button type="button" class="btn btn--sm" id="pwa-update-reload">Reload</button>
  `;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('pwa-update-banner--show'));

  qs('#pwa-update-reload', bar).addEventListener('click', () => {
    if (registration.waiting) {
      registration.waiting.postMessage('SKIP_WAITING');
    } else {
      window.location.reload();
    }
  });
}

function initInstallPrompt() {
  const btn = qs('#pwa-install-btn');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Always prevent the browser's own mini-infobar/prompt — we show our
    // own button instead, and only where that button actually exists.
    e.preventDefault();
    _deferredInstallPrompt = e;
    if (btn) btn.style.display = 'inline-flex';
  });

  if (!btn) return; // customer page (order.html) — nothing further to wire up

  btn.addEventListener('click', async () => {
    if (!_deferredInstallPrompt) {
      showToast?.('App is already installed, or install isn\u2019t available in this browser yet', 'info');
      return;
    }
    btn.disabled = true;
    _deferredInstallPrompt.prompt();
    const { outcome } = await _deferredInstallPrompt.userChoice;
    _deferredInstallPrompt = null;
    btn.disabled = false;
    if (outcome === 'accepted') {
      btn.style.display = 'none';
      showToast?.('App installed', 'success');
    }
  });

  window.addEventListener('appinstalled', () => {
    btn.style.display = 'none';
    _deferredInstallPrompt = null;
  });

  // Already running as an installed app? Hide the button — nothing to install.
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) btn.style.display = 'none';
}

function initRippleEffect() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'btn__ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
}

/**
 * Hides the splash screen (an element with id="pwa-splash" — add it as
 * the very first child of <body> on pages that want the branded loading
 * screen, typically index.html). No-ops if the page doesn't have one.
 */
function hideSplashScreen() {
  const splash = qs('#pwa-splash');
  if (!splash) return;
  const MIN_VISIBLE_MS = 450; // avoid an ugly instant flash on fast loads
  const start = Date.now();
  const finish = () => {
    const elapsed = Date.now() - start;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    setTimeout(() => {
      splash.classList.add('pwa-splash--hidden');
      setTimeout(() => splash.remove(), 450);
    }, wait);
  };
  if (document.readyState === 'complete') finish();
  else window.addEventListener('load', finish);
}

document.addEventListener('DOMContentLoaded', () => {
  initInstallPrompt();
  initRippleEffect();
  hideSplashScreen();
});
registerServiceWorker();
