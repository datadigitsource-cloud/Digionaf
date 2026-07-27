/* =========================================================
   utils.js — shared helper functions
   AsiaformS Digital Order Confirmation App
   ========================================================= */

/** Short DOM query helpers */
const qs = (sel, ctx = document) => ctx.querySelector(sel);
const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/** A single blank product row for the Product Details table */
function blankProduct() {
  return { productName: '', description: '', qty: '', rate: '', taxableAmount: '', gstPercent: '', totalAmount: '' };
}

/** Round to 2 decimals, avoiding floating-point noise like 12.000000001 */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Recalculates a product row's auto-filled amounts in place:
 * Taxable Amount = Qty × Rate, Total Amount = Taxable Amount + GST% of it.
 */
function recalcProductRow(row) {
  const qty = parseFloat(row.qty) || 0;
  const rate = parseFloat(row.rate) || 0;
  const gstPercent = parseFloat(row.gstPercent) || 0;
  const taxable = round2(qty * rate);
  const total = round2(taxable + (taxable * gstPercent) / 100);
  row.taxableAmount = qty || rate ? taxable : '';
  row.totalAmount = qty || rate ? total : '';
  return row;
}

/** Sum of every product row's Total Amount — the order's grand total */
function productsGrandTotal(products) {
  return round2((products || []).reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0));
}

/**
 * Ensures order.products is populated using the CURRENT table-row shape,
 * migrating a best-effort single row out of whatever older shape a saved
 * order used (the free-text product fields, and/or the old order-level
 * Rate Details block) so existing orders keep opening instead of erroring.
 */
function ensureProductsArray(order) {
  const rows = order.products;
  const looksCurrent = Array.isArray(rows) && rows.length && rows[0] && ('productName' in rows[0] || 'qty' in rows[0]);
  if (looksCurrent) return order;

  const oldProduct = (Array.isArray(rows) && rows[0]) || order.product || {};
  const oldRate = order.rate || {};
  const migrated = {
    productName: oldProduct.colour || '',
    description: oldProduct.productDetails || '',
    qty: oldRate.qty || '',
    rate: oldRate.rate || '',
    taxableAmount: oldRate.taxableAmount || '',
    gstPercent: oldRate.gstPercent || '',
    totalAmount: oldRate.totalValue || '',
  };
  const isEmpty = !migrated.productName && !migrated.description && !migrated.qty && !migrated.rate;
  order.products = [isEmpty ? blankProduct() : migrated];
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

/**
 * Format an ISO date string to dd-mm-yyyy — always rendered in India
 * time (Asia/Kolkata), NOT the viewing device's own timezone. Two people
 * looking at the same stored moment on two different phones (one with a
 * misconfigured timezone/clock) will always see the same date/time here.
 */
function formatDate(iso) {
  if (!iso) return "—";

  const d = new Date(iso);
  if (isNaN(d)) return iso;

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";

  const d = new Date(iso);
  if (isNaN(d)) return iso;

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
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
