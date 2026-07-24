/* =========================================================
   order.js — logic for order.html (customer-facing, read-only)
   ========================================================= */

let viewOrder = null;

// A lightweight extra confirmation step before an order is marked
// Approved — mainly to stop a representative from casually tapping
// Approve themselves while browsing pending orders from the dashboard.
// NOTE: this is a soft deterrent, not real security — the code is
// visible in the browser's source, same as anything client-side-only.
// Change this to whatever your team wants to use.
const APPROVAL_PASSWORD = 'Asiaformsdigital@2026';

// True only when opened via the representative dashboard's "View" button
// (which appends &admin=1) — never true for a customer's shared link,
// since buildShareLink() in utils.js never includes that flag.
const isAdminView = getQueryParams().admin === '1';

const BACK_TO_DASHBOARD_HTML = isAdminView
  ? `<a href="index.html" class="btn btn--ghost btn--sm" style="margin-bottom:14px;">← Back to Dashboard</a>`
  : '';

function checklistChips(order) {
  const labels = [];
  if (order.topSection.common) labels.push('Cannon');
  if (order.topSection.newCustomer) labels.push('New Customer');
  if (order.topSection.regularCustomer) labels.push('Regular Customer');
  if (order.topSection.newProduct) labels.push('New Product');
  if (order.topSection.oldDesignFSBS) labels.push('Old Design FS / BS');
  if (order.topSection.newDesignFSBS) labels.push('New Design FS / BS');
  if (order.topSection.oldDesignNewFilm) labels.push('Old Design / New Film');
  if (!labels.length) return '';
  return `<div class="chip-row">${labels.map((l) => `<span class="chip">${escapeHtml(l)}</span>`).join('')}</div>`;
}

function rrow(label, value) {
  return `<div class="readonly-row"><span class="readonly-row__label">${escapeHtml(label)}</span><span class="readonly-row__value">${escapeHtml(value || '—')}</span></div>`;
}

function renderNotFound() {
  qs('#order-content').innerHTML = `
    ${BACK_TO_DASHBOARD_HTML}
    <div class="card text-center">
      <div class="empty-state">
        <div class="empty-state__emoji">🔍</div>
        <h3>Order not found</h3>
        <p>This link may be incorrect, or the order was created on a different device / browser.</p>
      </div>
    </div>`;
}

function productBlockHtml(p, index, showHeading) {
  return `
    <div class="product-row">
      ${showHeading ? `<div class="chip" style="margin-bottom:8px; display:inline-block;">Product ${index + 1}</div>` : ''}
      ${rrow('Product Details', p.productDetails)}
      ${rrow('Colour', p.colour)}
      ${rrow('GSM', p.gsm)}
      ${rrow('HP', p.hp)}
      ${rrow('VP', p.vp)}
      ${rrow('Roll In', p.rollIn)}
      ${rrow('Roll Out', p.rollOut)}
    </div>`;
}

function renderOrder(order) {
  ensureProductsArray(order); // migrates any order saved under the old single-product shape
  const c = order.customer, s = order.sticker, r = order.rate, t = order.transport;
  const deliveryAddr = order.customer.deliveryAddressType === 'Same' ? 'Same as billing address' : order.customer.deliveryAddress;

  const statusBanner =
    order.status === 'Approved'
      ? `<div class="declaration" style="border-color:var(--success); background:var(--success-tint);">
           <p style="font-style:normal; font-weight:700; color:var(--success); margin:0;">✅ This order was confirmed on ${formatDateTime(order.approval.approvedAt)}.</p>
           ${
             order.approval.location
               ? `<p style="font-style:normal; font-size:12px; color:var(--ink-soft); margin:6px 0 0;">📍 <a href="${googleMapsLink(order.approval.location)}" target="_blank" style="color:var(--primary); font-weight:600;">View approval location</a></p>`
               : ''
           }
         </div>`
      : order.status === 'Rejected'
      ? `<div class="declaration" style="border-color:var(--danger); background:var(--danger-tint);">
           <p style="font-style:normal; font-weight:700; color:var(--danger); margin:0;">This order was marked as changes requested. Please contact your representative.</p>
         </div>`
      : '';

  qs('#order-content').innerHTML = `
    ${BACK_TO_DASHBOARD_HTML}
    <div class="flex-between" style="margin-bottom:10px;">
      <h1 style="font-size:18px;">Order Confirmation Message</h1>
      ${statusBadge(order.status)}
    </div>
    ${statusBanner}

    <section class="card">
      <div class="card__header"><div class="card__title">Order Type &amp; Date</div></div>
      ${checklistChips(order)}
      ${rrow('Date', formatDate(order.topSection.date))}
      ${rrow('Representative Name', order.topSection.repName)}
    </section>

    <section class="card">
      <div class="card__header"><div class="card__title">Customer Details</div></div>
      ${rrow('Customer Name', c.name)}
      ${rrow('Address', c.address)}
      ${rrow('GSTIN', c.gstin)}
      ${rrow('Mail ID', c.mailId)}
      ${rrow('Contact Person', c.contactPerson)}
      ${rrow('Designation', c.designation)}
      ${rrow('Mobile Number', c.mobile)}
      ${rrow('Delivery Address', deliveryAddr)}
    </section>

    <section class="card">
      <div class="card__header"><div class="card__title">Product Details</div></div>
      ${order.products.map((p, i) => productBlockHtml(p, i, order.products.length > 1)).join('')}
    </section>

    <section class="card">
      <div class="card__header"><div class="card__title">Stickers &amp; Tag Order</div></div>
      ${rrow('Numbering &amp; Other Details', s.numberingDetails)}
      ${rrow('UPS', s.ups)}
      ${rrow('Core Size', s.coreSize)}
      ${rrow('No. of Qty Roll', s.qtyRoll)}
      ${rrow('Offset Type (Manual)', s.offsetType ? 'Yes' : 'No')}
      ${rrow('Barcode Type', s.barcodeType ? 'Yes' : 'No')}
      ${rrow('Winding Direction', s.windingDirection)}
    </section>

    <section class="card">
      <div class="card__header"><div class="card__title">Rate Details</div></div>
      ${rrow('Qty', r.qty)}
      ${rrow('Rate', r.rate)}
      ${rrow('Taxable Amount', formatCurrency(r.taxableAmount))}
      ${rrow('GST %', r.gstPercent ? `${r.gstPercent}%` : '')}
      ${rrow('GST Value', formatCurrency(r.gstValue))}
      ${rrow('Total Value', formatCurrency(r.totalValue))}
      ${rrow('Approximate Value', r.approxValue)}
    </section>

    <section class="card">
      <div class="card__header"><div class="card__title">Transport &amp; Payment</div></div>
      ${rrow('Freight', t.freight)}
      ${rrow('Transport', t.transport)}
      ${rrow('Delivery Period', t.deliveryPeriod)}
      ${rrow('Payment Terms', t.paymentTerms)}
      ${rrow('Last Bill Date', formatDate(t.lastBillDate))}
      ${rrow('Amount Received Date', formatDate(t.amtRecdDate))}
    </section>

    ${
      order.remarks
        ? `<section class="card"><div class="card__header"><div class="card__title">Remarks</div></div><p style="font-size:13.5px; margin:0;">${escapeHtml(order.remarks)}</p></section>`
        : ''
    }

    <section id="approval-section"></section>
  `;

  renderApprovalSection(order);
}

function renderApprovalSection(order) {
  const el = qs('#approval-section');

  if (order.status === 'Approved') {
    el.innerHTML = `
      <div class="card">
        <div class="success-screen" style="padding:16px 8px 8px;">
          <div class="mascot-scene">
            <svg class="mascot" id="order-mascot" viewBox="0 0 140 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <g class="mascot__leg mascot__leg--left"><rect x="50" y="95" width="10" height="35" rx="5" style="fill:var(--primary-dark)"/></g>
              <g class="mascot__leg mascot__leg--right"><rect x="80" y="95" width="10" height="35" rx="5" style="fill:var(--primary-dark)"/></g>
              <rect x="40" y="55" width="60" height="55" rx="20" style="fill:var(--primary)"/>
              <rect x="18" y="70" width="30" height="38" rx="4" style="fill:#fff" stroke="var(--primary-dark)" stroke-width="2"/>
              <line class="mascot__notebook-line mascot__notebook-line1" x1="23" y1="80" x2="43" y2="80" style="stroke:var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
              <line class="mascot__notebook-line mascot__notebook-line2" x1="23" y1="88" x2="43" y2="88" style="stroke:var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
              <line class="mascot__notebook-line mascot__notebook-line3" x1="23" y1="96" x2="38" y2="96" style="stroke:var(--accent)" stroke-width="2.4" stroke-linecap="round"/>
              <rect x="34" y="60" width="10" height="26" rx="5" style="fill:var(--primary)"/>
              <g class="mascot__arm-pen">
                <rect x="92" y="62" width="10" height="26" rx="5" style="fill:var(--primary)"/>
                <line x1="96" y1="86" x2="106" y2="98" style="stroke:var(--ink)" stroke-width="3" stroke-linecap="round"/>
              </g>
              <g class="mascot__head">
                <circle cx="70" cy="35" r="26" style="fill:var(--primary)"/>
                <circle cx="61" cy="33" r="3.2" fill="#fff"/>
                <circle cx="79" cy="33" r="3.2" fill="#fff"/>
                <circle cx="61" cy="33" r="1.4" style="fill:var(--ink)"/>
                <circle cx="79" cy="33" r="1.4" style="fill:var(--ink)"/>
                <path d="M60 44 Q70 51 80 44" style="stroke:var(--ink)" stroke-width="2" fill="none" stroke-linecap="round"/>
              </g>
            </svg>
          </div>
          <div class="success-seal">✅</div>
          <h2>Thank You.</h2>
          <p>Your Order has been Successfully Confirmed.</p>
          <button class="btn btn--primary btn--block" id="btn-download-pdf">⬇ Download PDF</button>
        </div>
      </div>`;
    qs('#btn-download-pdf').addEventListener('click', async () => {
      showToast('Preparing PDF…', 'info', 1200);
      await PDFBuilder.downloadPdf(order, window.location.href);
    });
    playMascotAnimation();
    return;
  }

  if (order.status === 'Rejected') {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card__header"><div class="card__title">Approval</div></div>
      <div class="declaration">
        <p>"I have verified all order details and approve this order."</p>
        <label class="checkbox">
          <input type="checkbox" id="chk-agree" />
          I Agree
        </label>
      </div>
      <p class="hint" style="margin-top:10px;">📍 Your device's location will be requested to confirm this approval. Please allow location access when prompted.</p>
      <button class="btn btn--success btn--block" id="btn-approve" style="margin-top:10px;" disabled>✔ Approve Order</button>
    </div>`;

  const chk = qs('#chk-agree');
  const btn = qs('#btn-approve');
  chk.addEventListener('change', () => {
    btn.disabled = !chk.checked;
  });
  btn.addEventListener('click', async () => {
    if (isAdminView) {
      const ok = await promptApprovalPassword();
      if (!ok) return;
    }
    await requestLocationAndApprove(order);
  });
}

/**
 * Requires a successful GPS location fix before an order can be marked
 * Approved — this is the anti-fake-approval measure: it makes it obvious
 * (via the captured coordinates) where the approval actually happened,
 * and blocks approval outright if location access isn't granted.
 */
async function requestLocationAndApprove(order) {
  const btn = qs('#btn-approve');
  if (btn) btn.disabled = true;
  showLoadingOverlay('Getting your location…');

  let location;
  try {
    location = await getCurrentLocation();
  } catch (e) {
    hideLoadingOverlay();
    if (btn) btn.disabled = false;
    console.warn('Location capture failed', e);
    showToast('Location access is required to approve this order. Please allow location access in your browser and try again.', 'error', 6000);
    return;
  }

  hideLoadingOverlay();
  await approveOrder(order, location);
}

/**
 * Small password-confirmation modal shown right before an order is
 * marked Approved. Resolves true only if the correct password was
 * entered; resolves false on cancel or clicking outside the modal.
 */
function promptApprovalPassword() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3 class="modal__title">🔒 Confirm Approval</h3>
        <p class="modal__body">Enter the approval password to confirm this order.</p>
        <div class="field">
          <input type="password" id="approval-password-input" placeholder="Password" autocomplete="off" />
        </div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn--success" data-action="confirm">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));

    const input = qs('#approval-password-input', overlay);
    setTimeout(() => input.focus(), 50);

    function close(result) {
      overlay.classList.remove('modal-overlay--show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }

    function attemptConfirm() {
      if (input.value === APPROVAL_PASSWORD) {
        close(true);
      } else {
        showToast('Incorrect password', 'error');
        input.value = '';
        input.focus();
      }
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    qs('[data-action="cancel"]', overlay).addEventListener('click', () => close(false));
    qs('[data-action="confirm"]', overlay).addEventListener('click', attemptConfirm);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') attemptConfirm();
    });
  });
}

/**
 * Sequences the mascot's two animation phases: it walks in (CSS handles
 * the translate + leg swing via .mascot--walking), then once that finishes
 * we switch to .mascot--writing so it starts scribbling in the notebook.
 * Respects prefers-reduced-motion by skipping straight to the end state.
 */
function playMascotAnimation() {
  const mascotEl = qs('#order-mascot');
  if (!mascotEl) return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mascotEl.classList.add('mascot--writing');
    return;
  }

  mascotEl.classList.add('mascot--walking');
  const onWalkEnd = (e) => {
    if (e.target !== mascotEl || e.animationName !== 'mascotWalkIn') return;
    mascotEl.classList.remove('mascot--walking');
    mascotEl.classList.add('mascot--writing');
    mascotEl.removeEventListener('animationend', onWalkEnd);
  };
  mascotEl.addEventListener('animationend', onWalkEnd);
}

function showLoadingOverlay(message) {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(message)}</p>`;
  document.body.appendChild(overlay);
}
function hideLoadingOverlay() {
  qs('#loading-overlay')?.remove();
}

async function approveOrder(order, location) {
  const btn = qs('#btn-approve');
  if (btn) btn.disabled = true;
  showLoadingOverlay('Confirming your order…');

  try {
    const approvedAt = new Date().toISOString();
    const updated = await Storage.updateStatus(order.id, 'Approved', {
      approval: { agreed: true, approvedAt, location: location || null },
    });
    viewOrder = updated;

    try {
      await PDFBuilder.downloadPdf(updated, window.location.href);
    } catch (e) {
      console.error('PDF generation failed', e);
    }

    hideLoadingOverlay();
    showToast('Order confirmed successfully', 'success');
    renderOrder(updated);
  } catch (e) {
    console.error('Approval failed', e);
    hideLoadingOverlay();
    showToast('Could not confirm the order — check your connection and try again', 'error');
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const { id } = getQueryParams();
  if (!id) {
    renderNotFound();
    return;
  }
  qs('#order-content').innerHTML = `<div class="card text-center"><p class="muted">Loading order…</p></div>`;
  try {
    const order = await Storage.getOrderById(id);
    if (!order) {
      renderNotFound();
      return;
    }
    viewOrder = order;
    renderOrder(order);
  } catch (e) {
    console.error(e);
    qs('#order-content').innerHTML = `
      ${BACK_TO_DASHBOARD_HTML}
      <div class="card text-center">
        <div class="empty-state">
          <div class="empty-state__emoji">📡</div>
          <h3>Could not load this order</h3>
          <p>Please check your internet connection and reopen the link.</p>
        </div>
      </div>`;
  }
});
