/* =========================================================
   script.js — Dashboard (index.html) logic
   ========================================================= */

// Password required before a BULK download or bulk delete goes through —
// separate from the customer-approval password in order.js. Same caveat
// applies: this is a soft deterrent, visible in the browser's source, not
// real security. Change it to whatever your team wants to use.
const BULK_ACTION_PASSWORD = 'Asiaformsdigital@2026';

let currentTerm = '';
let currentStatus = 'All';
let currentType = 'All';
let allOrders = [];
let selectedIds = new Set();

function renderStatsFrom(orders) {
  qs('#stat-total').textContent = orders.length;
  qs('#stat-pending').textContent = orders.filter((o) => o.status === 'Pending').length;
  qs('#stat-approved').textContent = orders.filter((o) => o.status === 'Approved').length;
  qs('#stat-rejected').textContent = orders.filter((o) => o.status === 'Rejected').length;
}

function orderRowHtml(order) {
  const name = escapeHtml(order.customer?.name || 'Unnamed Customer');
  const rep = escapeHtml(order.topSection?.repName || '—');
  const rejectBtn =
    order.status === 'Pending'
      ? `<button class="btn btn--danger btn--sm" data-action="reject">Reject</button>`
      : '';
  const hasLocation = order.status === 'Approved' && !!order.approval?.location;
  const noLocationWarning =
    order.status === 'Approved' && !order.approval?.location
      ? `<span class="badge badge--pending" title="Approved without a captured location">⚠️ No Location</span>`
      : '';
  const locationBtn = hasLocation
    ? `<a href="${googleMapsLink(order.approval.location)}" target="_blank" class="btn btn--ghost btn--sm">📍 Location</a>`
    : '';
  const checked = selectedIds.has(order.id) ? 'checked' : '';
  return `
    <div class="order-row" data-id="${order.id}">
      <div class="order-row__checkbox-wrap">
        <input type="checkbox" class="order-row__select" data-select-id="${order.id}" ${checked} aria-label="Select order" />
      </div>
      <div class="order-row__main">
        <div class="order-row__id">${shortOrderNumber(order.id)} ${statusBadge(order.status)} ${noLocationWarning}</div>
        <div class="order-row__name">${name}</div>
        <div class="order-row__meta">Rep: ${rep} &middot; ${formatDate(order.topSection?.date)} &middot; ${formatCurrency(order.rate?.totalValue)}</div>
      </div>
      <div class="order-row__actions">
        <button class="btn btn--soft btn--sm" data-action="view">View</button>
        <button class="btn btn--ghost btn--sm" data-action="edit">Edit</button>
        <button class="btn btn--ghost btn--sm" data-action="link">Link</button>
        <button class="btn btn--ghost btn--sm" data-action="pdf">PDF</button>
        <button class="btn btn--ghost btn--sm" data-action="duplicate">Duplicate</button>
        ${locationBtn}
        ${rejectBtn}
        <button class="btn btn--danger btn--sm" data-action="delete">Delete</button>
      </div>
    </div>`;
}

function filterOrders(orders) {
  let result = orders;
  if (currentStatus !== 'All') result = result.filter((o) => o.status === currentStatus);
  if (currentType !== 'All') result = result.filter((o) => o.topSection?.[currentType]);
  if (currentTerm.trim()) {
    const t = currentTerm.trim().toLowerCase();
    result = result.filter((o) => {
      const hay = [o.customer?.name, o.customer?.mobile, o.customer?.gstin, o.topSection?.repName, shortOrderNumber(o.id)]
        .join(' ')
        .toLowerCase();
      return hay.includes(t);
    });
  }
  return result;
}

function currentVisibleOrders() {
  return filterOrders(allOrders);
}

function renderListFrom(orders) {
  const container = qs('#order-list');
  const filtered = filterOrders(orders);
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__emoji">🗂️</div>
        <h3>No orders yet</h3>
        <p>Create your first digital order confirmation to get started.</p>
        <a href="create-order.html" class="btn btn--primary" style="margin-top:14px;">＋ Create Order</a>
      </div>`;
    return;
  }
  container.innerHTML = filtered.map(orderRowHtml).join('');
  updateSelectAllCheckbox();
}

function renderAll() {
  renderStatsFrom(allOrders);
  renderListFrom(allOrders);
  updateBulkBar();
}

function setLoading(isLoading) {
  const container = qs('#order-list');
  if (isLoading) {
    container.innerHTML = `<div class="text-center muted" style="padding:32px 0;">Loading orders…</div>`;
  }
}

async function loadOrders() {
  setLoading(true);
  allOrders = await Storage.getOrders();
  // Drop selections for orders that no longer exist/are no longer visible
  const validIds = new Set(allOrders.map((o) => o.id));
  selectedIds.forEach((id) => {
    if (!validIds.has(id)) selectedIds.delete(id);
  });
  renderAll();
}

/* ---------------- Bulk selection ---------------- */

function updateSelectAllCheckbox() {
  const selectAll = qs('#select-all-checkbox');
  if (!selectAll) return;
  const visible = currentVisibleOrders();
  const allSelected = visible.length > 0 && visible.every((o) => selectedIds.has(o.id));
  selectAll.checked = allSelected;
  selectAll.indeterminate = !allSelected && visible.some((o) => selectedIds.has(o.id));
}

function updateBulkBar() {
  const bar = qs('#bulk-actions-bar');
  if (!bar) return;
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    qs('#bulk-selected-count').textContent = `${selectedIds.size} selected`;
  } else {
    bar.style.display = 'none';
  }
}

/**
 * Password-confirmation modal for bulk download/delete — mirrors the
 * approval-password pattern used on the customer page in order.js.
 */
function promptBulkPassword(actionLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3 class="modal__title">🔒 Confirm ${escapeHtml(actionLabel)}</h3>
        <p class="modal__body">Enter the password to ${escapeHtml(actionLabel.toLowerCase())} the selected orders.</p>
        <div class="field">
          <input type="password" id="bulk-password-input" placeholder="Password" autocomplete="off" />
        </div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
          <button type="button" class="btn btn--primary" data-action="confirm">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));

    const input = qs('#bulk-password-input', overlay);
    setTimeout(() => input.focus(), 50);

    function close(result) {
      overlay.classList.remove('modal-overlay--show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }
    function attemptConfirm() {
      if (input.value === BULK_ACTION_PASSWORD) {
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

async function bulkDownload() {
  const ok = await promptBulkPassword('Download');
  if (!ok) return;

  const ids = Array.from(selectedIds);
  showToast(`Downloading ${ids.length} PDF${ids.length > 1 ? 's' : ''}…`, 'info', 2000);
  let done = 0;
  for (const id of ids) {
    const order = allOrders.find((o) => o.id === id);
    if (!order) continue;
    try {
      await PDFBuilder.downloadPdf(order, buildShareLink(id));
      done += 1;
    } catch (e) {
      console.error('Bulk PDF failed for', id, e);
    }
  }
  showToast(`Downloaded ${done} of ${ids.length} PDF${ids.length > 1 ? 's' : ''}`, 'success');
}

async function bulkDelete() {
  const ok = await promptBulkPassword('Delete');
  if (!ok) return;

  const ids = Array.from(selectedIds);
  const confirmed = await confirmDialog({
    title: `Delete ${ids.length} order${ids.length > 1 ? 's' : ''}?`,
    message: 'This will permanently remove all selected orders. This cannot be undone.',
    confirmLabel: 'Delete All',
    danger: true,
  });
  if (!confirmed) return;

  let done = 0;
  for (const id of ids) {
    try {
      await Storage.deleteOrder(id);
      done += 1;
    } catch (e) {
      console.error('Bulk delete failed for', id, e);
    }
  }
  selectedIds.clear();
  showToast(`Deleted ${done} of ${ids.length} order${ids.length > 1 ? 's' : ''}`, 'success');
  await loadOrders();
}

/* ---------------- Row actions ---------------- */

async function handleRowAction(action, id) {
  const order = allOrders.find((o) => o.id === id) || (await Storage.getOrderById(id));
  if (!order) return;

  if (action === 'view') {
    window.location.href = `order.html?id=${encodeURIComponent(id)}&admin=1`;
  } else if (action === 'edit') {
    window.location.href = `create-order.html?id=${encodeURIComponent(id)}`;
  } else if (action === 'link') {
    const link = buildShareLink(id);
    await navigator.clipboard?.writeText(link).catch(() => {});
    showToast('Customer link copied to clipboard', 'success');
  } else if (action === 'pdf') {
    showToast('Generating PDF…', 'info', 1500);
    try {
      await PDFBuilder.downloadPdf(order, buildShareLink(id));
      showToast('PDF downloaded', 'success');
    } catch (e) {
      console.error(e);
      showToast('Could not generate PDF', 'error');
    }
  } else if (action === 'duplicate') {
    const copy = await Storage.duplicateOrder(id);
    if (copy) showToast(`Duplicated as ${shortOrderNumber(copy.id)}`, 'success');
    await loadOrders();
  } else if (action === 'reject') {
    const ok = await confirmDialog({
      title: 'Reject this order?',
      message: `Order ${shortOrderNumber(id)} for ${order.customer?.name || 'this customer'} will be marked as Rejected. The customer will see this if they open their link again.`,
      confirmLabel: 'Reject Order',
      danger: true,
    });
    if (ok) {
      await Storage.updateStatus(id, 'Rejected');
      showToast('Order rejected', 'success');
      await loadOrders();
    }
  } else if (action === 'delete') {
    const ok = await confirmDialog({
      title: 'Delete this order?',
      message: `Order ${shortOrderNumber(id)} for ${order.customer?.name || 'this customer'} will be permanently removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) {
      await Storage.deleteOrder(id);
      showToast('Order deleted', 'success');
      await loadOrders();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadOrders();

  // Realtime: reflect approvals/edits happening elsewhere (e.g. customer
  // approving on their own phone) without needing a manual refresh.
  Storage.onOrdersChange((orders) => {
    const previousStatusById = new Map(allOrders.map((o) => [o.id, o.status]));
    orders.forEach((o) => {
      const prevStatus = previousStatusById.get(o.id);
      if (prevStatus && prevStatus !== 'Approved' && o.status === 'Approved') {
        const who = o.customer?.name || 'Customer';
        const locNote = o.approval?.location ? '📍 Location captured.' : '⚠️ No location captured.';
        showToast(`✅ ${who} just approved ${shortOrderNumber(o.id)}. ${locNote}`, 'success', 6000);
      }
    });

    allOrders = orders;
    const validIds = new Set(allOrders.map((o) => o.id));
    selectedIds.forEach((id) => {
      if (!validIds.has(id)) selectedIds.delete(id);
    });
    renderAll();
  });

  qs('#order-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const row = e.target.closest('.order-row');
    handleRowAction(btn.dataset.action, row.dataset.id);
  });

  qs('#order-list').addEventListener('change', (e) => {
    const chk = e.target.closest('[data-select-id]');
    if (!chk) return;
    const id = chk.dataset.selectId;
    if (chk.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateSelectAllCheckbox();
    updateBulkBar();
  });

  qs('#select-all-checkbox').addEventListener('change', (e) => {
    const visible = currentVisibleOrders();
    if (e.target.checked) {
      visible.forEach((o) => selectedIds.add(o.id));
    } else {
      visible.forEach((o) => selectedIds.delete(o.id));
    }
    renderListFrom(allOrders);
    updateBulkBar();
  });

  qs('#bulk-download-btn').addEventListener('click', bulkDownload);
  qs('#bulk-delete-btn').addEventListener('click', bulkDelete);
  qs('#bulk-clear-btn').addEventListener('click', () => {
    selectedIds.clear();
    renderListFrom(allOrders);
    updateBulkBar();
  });

  qs('#search-input').addEventListener(
    'input',
    debounce((e) => {
      currentTerm = e.target.value;
      renderListFrom(allOrders);
    }, 250)
  );

  qs('#filter-status').addEventListener('change', (e) => {
    currentStatus = e.target.value;
    renderListFrom(allOrders);
  });

  qs('#filter-type').addEventListener('change', (e) => {
    currentType = e.target.value;
    renderListFrom(allOrders);
  });
});
