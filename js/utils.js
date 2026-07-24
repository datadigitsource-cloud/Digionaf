/* =========================================================
   utils.js — shared helper functions
   AsiaformS Digital Order Confirmation App
   ========================================================= */

/** Short DOM query helpers */
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** A single blank product entry (used by the repeatable product list) */
function blankProduct() {
  return { colour: '', productDetails: '', gsm: '', hp: '', vp: '', rollIn: '', rollOut: '' };
}

/**
 * Ensures order.products is a populated array, migrating orders saved
 * under the old single-product shape (order.product) so existing saved
 * orders keep working after the multi-product upgrade.
 */
function ensureProductsArray(order) {
  if (!order.products || !Array.isArray(order.products) || !order.products.length) {
    order.products = order.product ? [order.product] : [blankProduct()];
  }
  return order;
}

/** Generate a RFC4122-ish UUID (works without HTTPS / crypto.randomUUID fallback) */
function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Short id used for readable order numbers, e.g. AF-7F3K2B */
function shortOrderNumber(id) {
  return 'AF-' + id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

/** Format an ISO date string to dd-mm-yyyy */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Format an ISO datetime string to dd-mm-yyyy, hh:mm AM/PM */
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const datePart = formatDate(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${datePart}, ${String(h).padStart(2, '0')}:${m} ${ampm}`;
}

/** Format a number as Indian currency, e.g. 1,23,456.00 */
function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Debounce helper for autosave / search inputs */
function debounce(fn, delay = 400) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Escape user text before inserting as HTML, to avoid markup breakage */
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Toast notification system. Requires a #toast-stack container in the page. */
function showToast(message, type = 'info', duration = 3200) {
  let stack = qs('#toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const icons = { success: '✅', error: '⚠️', info: 'ℹ️', warning: '⏳' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast__icon">${icons[type] || icons.info}</span><span class="toast__msg">${escapeHtml(message)}</span>`;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--show'));
  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Confirmation dialog. Returns a Promise<boolean>.
 * Renders a lightweight modal instead of window.confirm for a consistent look.
 */
function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal--confirm" role="dialog" aria-modal="true">
        <h3 class="modal__title">${escapeHtml(title)}</h3>
        <p class="modal__body">${escapeHtml(message)}</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));

    function close(result) {
      overlay.classList.remove('modal-overlay--show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    qs('[data-action="cancel"]', overlay).addEventListener('click', () => close(false));
    qs('[data-action="confirm"]', overlay).addEventListener('click', () => close(true));
  });
}

/** Read query params as a plain object */
function getQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

/** Build an absolute shareable URL for order.html with a given id */
function buildShareLink(id) {
  const base = window.location.href.replace(/[^/]*$/, '');
  return `${base}order.html?id=${encodeURIComponent(id)}`;
}

/**
 * Requests the device's current GPS location. Used to timestamp+geotag an
 * order approval so a representative can't fake-approve on the customer's
 * behalf without it being obvious in the record. Rejects if the browser
 * has no geolocation support, the user denies permission, or it times out
 * — callers should treat rejection as "approval cannot proceed."
 */
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

/** Build a Google Maps link from a captured location object */
function googleMapsLink(location) {
  if (!location) return '';
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

/** Apply / read dark mode preference */
function initDarkMode() {
  const saved = localStorage.getItem('af_dark_mode');
  if (saved === '1') document.documentElement.classList.add('dark');
  qsa('[data-toggle="dark-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('af_dark_mode', document.documentElement.classList.contains('dark') ? '1' : '0');
    });
  });
}

/** Status badge helper — returns HTML for a status pill */
function statusBadge(status) {
  const map = {
    Pending: 'badge--pending',
    Approved: 'badge--approved',
    Rejected: 'badge--rejected',
  };
  const cls = map[status] || 'badge--pending';
  return `<span class="badge ${cls}">${escapeHtml(status || 'Pending')}</span>`;
}

document.addEventListener('DOMContentLoaded', initDarkMode);
