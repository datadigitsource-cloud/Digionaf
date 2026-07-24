/* =========================================================
   create-order.js — logic for create-order.html
   Handles: populating/reading the form via dot-path names,
   draft autosave/restore, edit-mode loading, and the
   "Generate Customer Link" flow with QR + share options.
   ========================================================= */

let currentOrder = null;
let editingExisting = false;

/** Get a nested value from an object using a "a.b.c" path */
function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

/** Set a nested value on an object using a "a.b.c" path, creating objects as needed */
function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Fill the form's fields from an order object */
function populateForm(form, order) {
  qsa('[name]', form).forEach((el) => {
    const val = getPath(order, el.name);
    if (el.type === 'checkbox') {
      el.checked = !!val;
    } else if (el.type === 'radio') {
      el.checked = el.value === val;
    } else if (val !== undefined && val !== null) {
      el.value = val;
    }
  });
}

/* ---------------- Product Details (repeatable list) ----------------
   Product rows are NOT part of the generic [name]-based form reading —
   they're rendered from currentOrder.products and kept in sync directly
   via a delegated input listener, so readForm() below never touches or
   overwrites them. */

const PRODUCT_FIELDS = [
  { key: 'productDetails', label: 'Product Details', type: 'textarea' },
  { key: 'colour', label: 'Colour', type: 'text' },
  { key: 'gsm', label: 'GSM', type: 'text' },
  { key: 'hp', label: 'HP', type: 'text' },
  { key: 'vp', label: 'VP', type: 'text' },
  { key: 'rollIn', label: 'Roll In', type: 'text' },
  { key: 'rollOut', label: 'Roll Out', type: 'text' },
];

function productRowHtml(product, index, canRemove) {
  const fieldHtml = (f) => {
    const val = escapeHtml(product[f.key] || '');
    if (f.type === 'textarea') {
      return `
        <div class="field">
          <label>${f.label}</label>
          <textarea rows="2" data-product-field="${f.key}">${val}</textarea>
        </div>`;
    }
    return `
      <div class="field">
        <label>${f.label}</label>
        <input type="text" value="${val}" data-product-field="${f.key}" />
      </div>`;
  };

  return `
    <div class="product-row" data-product-index="${index}">
      <div class="flex-between" style="margin-bottom:8px;">
        <span class="chip">Product ${index + 1}</span>
        ${canRemove ? `<button type="button" class="btn btn--danger btn--sm" data-action="remove-product">Remove</button>` : ''}
      </div>
      ${fieldHtml(PRODUCT_FIELDS[0])}
      <div class="grid-3">
        ${fieldHtml(PRODUCT_FIELDS[1])}
        ${fieldHtml(PRODUCT_FIELDS[2])}
        ${fieldHtml(PRODUCT_FIELDS[3])}
      </div>
      <div class="grid-3">
        ${fieldHtml(PRODUCT_FIELDS[4])}
        ${fieldHtml(PRODUCT_FIELDS[5])}
        ${fieldHtml(PRODUCT_FIELDS[6])}
      </div>
    </div>`;
}

function renderProductRows() {
  const container = qs('#product-list');
  if (!container) return;
  const products = currentOrder.products;
  container.innerHTML = products.map((p, i) => productRowHtml(p, i, products.length > 1)).join('');
}

function bindProductListEvents() {
  const container = qs('#product-list');
  if (!container) return;

  // Keep currentOrder.products in sync as the rep types — this runs
  // during the bubble phase before the form-level autosave listener, so
  // autosave always captures the latest values.
  container.addEventListener('input', (e) => {
    const field = e.target.dataset.productField;
    if (!field) return;
    const row = e.target.closest('[data-product-index]');
    const idx = Number(row.dataset.productIndex);
    currentOrder.products[idx][field] = e.target.value;
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-product"]');
    if (!btn) return;
    const row = btn.closest('[data-product-index]');
    const idx = Number(row.dataset.productIndex);
    if (currentOrder.products.length <= 1) return; // always keep at least one
    currentOrder.products.splice(idx, 1);
    renderProductRows();
    autosave();
  });

  const addBtn = qs('#btn-add-product');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      currentOrder.products.push(blankProduct());
      renderProductRows();
      const rows = qsa('.product-row', container);
      rows[rows.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

/** Read the form's fields back into a plain nested object (merged onto base) */
function readForm(form, base) {
  const result = JSON.parse(JSON.stringify(base));
  qsa('[name]', form).forEach((el) => {
    if (el.type === 'checkbox') {
      setPath(result, el.name, el.checked);
    } else if (el.type === 'radio') {
      if (el.checked) setPath(result, el.name, el.value);
    } else {
      setPath(result, el.name, el.value);
    }
  });
  return result;
}

function updateAutosaveHint() {
  const hintEl = qs('#autosave-hint');
  if (!hintEl) return;
  hintEl.textContent = 'Draft saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  setTimeout(() => {
    if (hintEl) hintEl.textContent = '';
  }, 2500);
}

const autosave = debounce(() => {
  if (editingExisting) return; // don't clobber a saved order with the generic draft slot
  const form = qs('#order-form');
  const data = readForm(form, currentOrder);
  Storage.saveDraft(data);
  updateAutosaveHint();
}, 600);

function bindAutosave() {
  const form = qs('#order-form');
  form.addEventListener('input', autosave);
  form.addEventListener('change', autosave);
}

async function initForm() {
  const form = qs('#order-form');
  const { id } = getQueryParams();

  if (id) {
    const existing = await Storage.getOrderById(id);
    if (existing) {
      currentOrder = existing;
      editingExisting = true;
      qs('#page-heading').textContent = 'Edit Order Confirmation';
      const badge = qs('#order-id-badge');
      badge.style.display = 'inline-flex';
      badge.textContent = shortOrderNumber(existing.id);
      ensureProductsArray(currentOrder);
      populateForm(form, existing);
      renderProductRows();
      bindProductListEvents();
      bindAutosave();
      return;
    }
    showToast('Order not found — starting a new one', 'warning');
  }

  // New order: try to restore an autosaved draft first
  const draft = Storage.getDraft();
  currentOrder = draft?.data || Storage.blankOrder();
  ensureProductsArray(currentOrder);
  populateForm(form, currentOrder);
  renderProductRows();
  bindProductListEvents();
  if (draft) {
    showToast(`Draft restored from ${formatDateTime(draft.savedAt)}`, 'info');
  }
  bindAutosave();
}

function buildQr(containerId, text) {
  const el = qs(containerId);
  el.innerHTML = '';
  // eslint-disable-next-line no-undef
  new QRCode(el, { text, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
}

function openShareModal(order) {
  const link = buildShareLink(order.id);
  qs('#share-link-text').textContent = link;
  buildQr('#share-qr', link);

  qs('#btn-copy-link').onclick = async () => {
    await navigator.clipboard?.writeText(link).catch(() => {});
    showToast('Link copied to clipboard', 'success');
  };
  qs('#btn-whatsapp-share').onclick = () => {
    const text = encodeURIComponent(`Hi ${order.customer.name || ''}, please review and confirm your order from AsiaformS: ${link}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };
  qs('#btn-email-share').onclick = () => {
    const subject = encodeURIComponent(`Order Confirmation — ${shortOrderNumber(order.id)}`);
    const body = encodeURIComponent(`Hi ${order.customer.name || ''},\n\nPlease review and approve your order using the link below:\n${link}\n\nThank you,\n${order.topSection.repName || 'AsiaformS Team'}`);
    window.location.href = `mailto:${order.customer.mailId || ''}?subject=${subject}&body=${body}`;
  };
  qs('#btn-open-link').onclick = () => window.open(link, '_blank');
  qs('#btn-close-modal').onclick = () => closeShareModal();

  const overlay = qs('#share-modal');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeShareModal();
  });
}

function closeShareModal() {
  const overlay = qs('#share-modal');
  overlay.classList.remove('modal-overlay--show');
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 200);
  // After creating a fresh order, head back to the dashboard so the rep
  // isn't left staring at a stale form.
  window.location.href = 'index.html';
}

function validateRequired(form) {
  const required = qsa('[required]', form);
  for (const el of required) {
    if (!el.value.trim()) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`Please fill "${el.previousElementSibling?.textContent || el.name}"`, 'error');
      return false;
    }
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  initForm();

  const form = qs('#order-form');

  qs('#btn-save-draft').addEventListener('click', async () => {
    const data = readForm(form, currentOrder);
    if (editingExisting) {
      currentOrder = data;
      const btn = qs('#btn-save-draft');
      btn.disabled = true;
      try {
        await Storage.saveOrder(currentOrder);
        showToast('Order saved', 'success');
      } catch (e) {
        console.error(e);
        showToast('Could not save — check your connection', 'error');
      } finally {
        btn.disabled = false;
      }
    } else {
      Storage.saveDraft(data);
      updateAutosaveHint();
      showToast('Draft saved', 'success');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateRequired(form)) return;

    const data = readForm(form, currentOrder);
    currentOrder = data;
    if (!currentOrder.id) currentOrder.id = generateId();
    if (!currentOrder.createdAt) currentOrder.createdAt = new Date().toISOString();
    if (!currentOrder.status) currentOrder.status = 'Pending';

    const submitBtn = qs('#btn-generate-link');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    try {
      await Storage.saveOrder(currentOrder);
      if (!editingExisting) Storage.clearDraft();
      showToast('Order saved — link generated', 'success');
      openShareModal(currentOrder);
    } catch (err) {
      console.error(err);
      showToast('Could not save the order — check your connection', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate Customer Link';
    }
  });
});
