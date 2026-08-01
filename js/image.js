/* =========================================================
   image.js — Order Confirmation single-IMAGE builder
   Renders the same content as pdf.js (customer info, product
   table, transport, approval seal, QR, map link) onto ONE tall
   canvas — no page breaks, since an image just grows as long as
   it needs to — and downloads it as a PNG.

   Every text block wraps to its own column width before the
   next block is drawn, and the y-cursor only ever advances by
   however many lines that block actually used, so however much
   detail an order has, it all fits on the single image without
   any overlap ("responsive" layout, same fix as pdf.js).
   ========================================================= */

const ImageBuilder = {
  _money(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /** Turn a customer name into a filesystem-safe file name fragment */
  _safeFileName(name) {
    const cleaned = String(name || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);
    return cleaned || 'Customer';
  },

  /** Word-wrap `text` to fit `maxWidth` using the ctx's currently-set font */
  _wrapText(ctx, text, maxWidth) {
    const words = String(text ?? '').trim() === '' ? ['—'] : String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : ['—'];
  },

  /** Load an <img> element from a URL (site asset) */
  _loadImageEl(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  /**
   * Build the canvas. Returns { canvas } cropped to the exact content
   * height used, at 2x scale for a crisp download on any screen.
   */
  async build(order, shareLink) {
    ensureProductsArray(order);

    const logo = await this._loadImageEl('assets/logo-white.png');

    const W = 820; // logical (unscaled) width
    const margin = 30;
    const contentW = W - margin * 2;
    const SCALE = 2; // retina-quality output
    const MAX_H = 8000; // generous ceiling; cropped to actual content below

    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE;
    canvas.height = MAX_H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'alphabetic';

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, MAX_H);

    let y = 0;

    // ---- Header band ----
    const headerH = 78;
    ctx.fillStyle = '#0d3c7a';
    ctx.fillRect(0, 0, W, headerH);
    if (logo) {
      const maxW = 130,
        maxH = 42;
      const scale = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
      const dw = logo.naturalWidth * scale;
      const dh = logo.naturalHeight * scale;
      ctx.drawImage(logo, margin, (headerH - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.fillText('AsiaformS', margin, headerH / 2 + 8);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Order No: ${shortOrderNumber(order.id)}`, W - margin, 34);
    ctx.fillText(`Date: ${formatDate(order.topSection.date)}`, W - margin, 52);
    ctx.textAlign = 'left';

    y = headerH + 24;

    const sectionTitle = (title) => {
      ctx.fillStyle = '#e8f0fa';
      ctx.fillRect(margin, y, contentW, 24);
      ctx.fillStyle = '#0d3c7a';
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.fillText(title, margin + 8, y + 16);
      y += 34;
      ctx.fillStyle = '#141414';
      ctx.font = '12px Arial, sans-serif';
    };

    /** Full-width wrapping label:value row */
    const row = (label, value, width = contentW) => {
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillStyle = '#141414';
      ctx.fillText(`${label}:`, margin + 8, y);
      const labelW = ctx.measureText(`${label}: `).width;
      ctx.font = '12px Arial, sans-serif';
      const lines = this._wrapText(ctx, value, width - labelW - 16);
      lines.forEach((line, i) => ctx.fillText(line, margin + 8 + labelW + 8, y + i * 16));
      return lines.length;
    };

    /** Two label:value pairs on one row, each independently wrapped to its own half — never overlaps the other column */
    const twoCol = (leftLabel, leftVal, rightLabel, rightVal) => {
      const half = contentW / 2;
      const gap = 16;
      const xLeft = margin + 8;
      const xRight = margin + half + 8;

      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillStyle = '#141414';
      ctx.fillText(`${leftLabel}:`, xLeft, y);
      const leftLabelW = ctx.measureText(`${leftLabel}: `).width;
      ctx.font = '12px Arial, sans-serif';
      const leftLines = this._wrapText(ctx, leftVal, Math.max(half - leftLabelW - gap, 40));
      leftLines.forEach((line, i) => ctx.fillText(line, xLeft + leftLabelW + 6, y + i * 16));

      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.fillText(`${rightLabel}:`, xRight, y);
      const rightLabelW = ctx.measureText(`${rightLabel}: `).width;
      ctx.font = '12px Arial, sans-serif';
      const rightLines = this._wrapText(ctx, rightVal, Math.max(half - rightLabelW - gap, 40));
      rightLines.forEach((line, i) => ctx.fillText(line, xRight + rightLabelW + 6, y + i * 16));

      const lineCount = Math.max(leftLines.length, rightLines.length, 1);
      y += lineCount * 16 + 6;
    };

    // ---- Order Type ----
    sectionTitle('ORDER TYPE');
    const typeLabels = [];
    if (order.topSection.common) typeLabels.push('Cannon');
    if (order.topSection.newCustomer) typeLabels.push('New Customer');
    if (order.topSection.regularCustomer) typeLabels.push('Regular Customer');
    if (order.topSection.newProduct) typeLabels.push('New Product');
    if (order.topSection.oldDesignFSBS) typeLabels.push('Old Design FS / BS');
    if (order.topSection.newDesignFSBS) typeLabels.push('New Design FS / BS');
    if (order.topSection.oldDesignNewFilm) typeLabels.push('Old Design / New Film');
    const typeLines = row('Order Type', typeLabels.length ? typeLabels.join(', ') : '—');
    y += typeLines * 16 + 10;

    // ---- Customer Information ----
    sectionTitle('CUSTOMER INFORMATION');
    const custLines = row('Customer', order.customer.name);
    y += custLines * 16 + 10;
    twoCol('Contact Person', order.customer.contactPerson, 'Mobile', order.customer.mobile);
    twoCol('GSTIN', order.customer.gstin, 'Mail ID', order.customer.mailId);
    const desigLines = row('Designation', order.customer.designation);
    y += desigLines * 16 + 10;
    const addrLines = row('Address', order.customer.address);
    y += addrLines * 16 + 4;
    const delivAddr = order.customer.deliveryAddressType === 'Same' ? 'Same as above' : order.customer.deliveryAddress;
    const delivLines = row('Delivery Address', delivAddr);
    y += delivLines * 16 + 12;

    // ---- Product Details table ----
    sectionTitle('PRODUCT DETAILS');
    y = this._drawProductsTable(ctx, order.products, y, margin, contentW);

    // ---- Transport & Payment ----
    sectionTitle('TRANSPORT & PAYMENT');
    twoCol('Freight', order.transport.freight, 'Transport', order.transport.transport);
    twoCol('Delivery Period', order.transport.deliveryPeriod, 'Payment Terms', order.transport.paymentTerms);
    twoCol('Last Bill Date', formatDate(order.transport.lastBillDate), 'Last Amount Received Date', formatDate(order.transport.amtRecdDate));
    y += 8;

    // ---- Remarks ----
    if (order.remarks) {
      sectionTitle('REMARKS');
      const remLines = row('Remarks', order.remarks);
      y += remLines * 16 + 10;
    }

    // ---- Representative & Approval, seal, QR, and map link are
    // intentionally left out of the image export (kept only in the PDF) ----

    y += 14;

    // ---- Footer ----
    ctx.strokeStyle = '#dcdcdc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(W - margin, y);
    ctx.stroke();
    y += 16;
    ctx.fillStyle = '#828282';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillText('AsiaformS — All types of Computer Billing Papers', margin, y);
    y += 14;

    // ---- Crop to actual content height ----
    const finalH = Math.ceil(y + 10);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = W * SCALE;
    finalCanvas.height = finalH * SCALE;
    const fctx = finalCanvas.getContext('2d');
    fctx.drawImage(canvas, 0, 0, W * SCALE, finalH * SCALE, 0, 0, W * SCALE, finalH * SCALE);

    return finalCanvas;
  },

  /**
   * Draws the Product Details table with dynamic row heights (each row
   * grows to fit however many lines its Product Name / Description wrap
   * to), plus a Taxable Total row and a Grand Total row. No page-break
   * logic needed here — unlike the PDF, the image just keeps growing.
   * Returns the y position after the table.
   */
  _drawProductsTable(ctx, products, startY, margin, contentW) {
    const cols = [
      { key: 'sno', label: 'S.No', width: 28, align: 'center' },
      { key: 'productName', label: 'Product', width: 158, align: 'left' },
      { key: 'description', label: 'Description', width: 210, align: 'left' },
      { key: 'qty', label: 'Qty', width: 44, align: 'right' },
      { key: 'rate', label: 'Rate', width: 62, align: 'right' },
      { key: 'taxableAmount', label: 'Taxable Amt', width: 98, align: 'right' },
      { key: 'gstPercent', label: 'GST%', width: 48, align: 'right' },
      { key: 'totalAmount', label: 'Total Amt', width: 92, align: 'right' },
    ];
    const tableW = cols.reduce((s, c) => s + c.width, 0);
    let y = startY;
    const colX = (i) => margin + cols.slice(0, i).reduce((s, c) => s + c.width, 0);

    const drawHeader = () => {
      ctx.fillStyle = '#e8f0fa';
      ctx.fillRect(margin, y, tableW, 22);
      ctx.fillStyle = '#0d3c7a';
      ctx.font = 'bold 10.5px Arial, sans-serif';
      cols.forEach((c, i) => {
        ctx.textAlign = c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left';
        const x = c.align === 'right' ? colX(i) + c.width - 4 : c.align === 'center' ? colX(i) + c.width / 2 : colX(i) + 4;
        ctx.fillText(c.label, x, y + 14);
      });
      ctx.textAlign = 'left';
      y += 22;
    };

    drawHeader();

    products.forEach((p, idx) => {
      ctx.font = '11px Arial, sans-serif';
      const nameLines = this._wrapText(ctx, p.productName || '—', cols[1].width - 8);
      const descLines = this._wrapText(ctx, p.description || '—', cols[2].width - 8);
      const lineCount = Math.max(nameLines.length, descLines.length, 1);
      const rowH = lineCount * 14 + 8;

      if (idx % 2 === 1) {
        ctx.fillStyle = '#f8fafd';
        ctx.fillRect(margin, y, tableW, rowH);
      }

      const vals = {
        sno: String(idx + 1),
        qty: String(p.qty || '—'),
        rate: String(p.rate || '—'),
        taxableAmount: this._money(p.taxableAmount),
        gstPercent: p.gstPercent ? `${p.gstPercent}%` : '—',
        totalAmount: this._money(p.totalAmount),
      };

      ctx.fillStyle = '#141414';
      cols.forEach((c, i) => {
        ctx.textAlign = c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left';
        const x = c.align === 'right' ? colX(i) + c.width - 4 : c.align === 'center' ? colX(i) + c.width / 2 : colX(i) + 4;
        if (c.key === 'productName') {
          nameLines.forEach((line, li) => ctx.fillText(line, x, y + 13 + li * 14));
        } else if (c.key === 'description') {
          descLines.forEach((line, li) => ctx.fillText(line, x, y + 13 + li * 14));
        } else {
          ctx.fillText(vals[c.key], x, y + 13);
        }
      });
      ctx.textAlign = 'left';

      ctx.strokeStyle = '#e1e7f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin, y + rowH);
      ctx.lineTo(margin + tableW, y + rowH);
      ctx.stroke();
      y += rowH;
    });

    // Taxable total row
    const taxableTotal = productsTaxableTotal(products);
    ctx.fillStyle = '#e8f0fa';
    ctx.fillRect(margin, y, tableW, 22);
    ctx.fillStyle = '#0d3c7a';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('TOTAL TAXABLE AMOUNT', margin + 8, y + 15);
    ctx.textAlign = 'right';
    ctx.fillText(this._money(taxableTotal), margin + tableW - 6, y + 15);
    ctx.textAlign = 'left';
    y += 22;

    // Grand total row
    const grandTotal = productsGrandTotal(products);
    ctx.fillStyle = '#0d3c7a';
    ctx.fillRect(margin, y, tableW, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText('GRAND TOTAL', margin + 8, y + 18);
    ctx.textAlign = 'right';
    ctx.fillText(this._money(grandTotal), margin + tableW - 6, y + 18);
    ctx.textAlign = 'left';
    y += 36;

    ctx.fillStyle = '#141414';
    return y;
  },

  /** Build the image and trigger a browser download as a PNG, saved under the customer's name */
  async downloadImage(order, shareLink) {
    const canvas = await this.build(order, shareLink);
    const customerName = this._safeFileName(order.customer && order.customer.name);
    const a = document.createElement('a');
    a.download = `OrderConfirmation_${customerName}_${shortOrderNumber(order.id)}.png`;
    a.href = canvas.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};
