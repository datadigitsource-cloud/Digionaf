/* =========================================================
   pdf.js — Order Confirmation PDF builder
   Uses jsPDF (loaded via CDN as window.jspdf.jsPDF)
   and QRCode.js (davidshimjs, loaded via CDN) to render
   a scannable QR into an offscreen node, then embeds it.

   NOTE: jsPDF's built-in "helvetica" font only supports the
   WinAnsi character set — it has no ₹ or ✔ glyphs, so those
   render as broken/garbled characters. This file therefore:
     - formats money with a plain "Rs." prefix instead of ₹
     - draws the approval checkmark as vector lines instead
       of a unicode ✔ character
   ========================================================= */

const PDFBuilder = {
  /** Money formatting for the PDF only (avoids the ₹ glyph issue above) */
  _money(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return '—';
    return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /**
   * Draws the Product Details table (S.No / Product Name / Description /
   * Qty / Rate / Taxable Amount / GST% / Total Amount) plus a Grand Total
   * row, with automatic page breaks and a repeated header on new pages.
   * Returns the y position after the table.
   */
  _drawProductsTable(doc, products, startY, margin, pageW) {
    const cols = [
      { key: 'sno', label: 'S.No', width: 25, align: 'center' },
      { key: 'productName', label: 'Product Name', width: 88, align: 'left' },
      { key: 'description', label: 'Description', width: 118, align: 'left' },
      { key: 'qty', label: 'Qty', width: 38, align: 'right' },
      { key: 'rate', label: 'Rate', width: 48, align: 'right' },
      { key: 'taxableAmount', label: 'Taxable Amt', width: 62, align: 'right' },
      { key: 'gstPercent', label: 'GST%', width: 32, align: 'right' },
      { key: 'totalAmount', label: 'Total Amt', width: 62, align: 'right' },
    ];
    const tableW = cols.reduce((s, c) => s + c.width, 0);
    let y = startY;

    const colX = (i) => margin + cols.slice(0, i).reduce((s, c) => s + c.width, 0);

    const drawHeader = () => {
      doc.setFillColor(232, 240, 250);
      doc.rect(margin, y, tableW, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(13, 60, 122);
      cols.forEach((c, i) => {
        const x = c.align === 'right' ? colX(i) + c.width - 4 : colX(i) + 4;
        doc.text(c.label, x, y + 12, { align: c.align === 'right' ? 'right' : 'left' });
      });
      y += 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 20);
    };

    drawHeader();

    products.forEach((p, idx) => {
      const nameLines = doc.splitTextToSize(String(p.productName || '—'), cols[1].width - 8);
      const descLines = doc.splitTextToSize(String(p.description || '—'), cols[2].width - 8);
      const lineCount = Math.max(nameLines.length, descLines.length, 1);
      const rowH = lineCount * 11 + 6;

      // Page break — leave room for the row plus a little breathing space
      if (y + rowH > 770) {
        doc.addPage();
        y = 40;
        drawHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 253);
        doc.rect(margin, y, tableW, rowH, 'F');
      }

      const vals = {
        sno: String(idx + 1),
        qty: String(p.qty || '—'),
        rate: String(p.rate || '—'),
        taxableAmount: this._money(p.taxableAmount),
        gstPercent: p.gstPercent ? `${p.gstPercent}%` : '—',
        totalAmount: this._money(p.totalAmount),
      };

      cols.forEach((c, i) => {
        const x = c.align === 'right' ? colX(i) + c.width - 4 : colX(i) + 4;
        const align = c.align === 'right' ? 'right' : 'left';
        if (c.key === 'productName') {
          doc.text(nameLines, x, y + 8, { align });
        } else if (c.key === 'description') {
          doc.text(descLines, x, y + 8, { align });
        } else {
          doc.text(vals[c.key], x, y + 8, { align });
        }
      });

      doc.setDrawColor(225, 231, 240);
      doc.line(margin, y + rowH, margin + tableW, y + rowH);
      y += rowH;
    });

    // Grand total row
    const grandTotal = productsGrandTotal(products);
    doc.setFillColor(13, 60, 122);
    doc.rect(margin, y, tableW, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text('GRAND TOTAL', margin + 8, y + 13);
    doc.text(this._money(grandTotal), margin + tableW - 6, y + 13, { align: 'right' });
    y += 28;

    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    return y;
  },

  /**
   * Render a QR code for `text` into an offscreen div and resolve
   * with a PNG data URL. Uses the global QRCode() constructor.
   */
  _renderQrDataUrl(text) {
    return new Promise((resolve) => {
      const holder = document.createElement('div');
      holder.style.position = 'fixed';
      holder.style.left = '-9999px';
      document.body.appendChild(holder);
      // eslint-disable-next-line no-undef
      new QRCode(holder, { text, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
      // QRCode.js renders asynchronously via an <img> or <canvas>; poll briefly.
      let tries = 0;
      const poll = setInterval(() => {
        tries += 1;
        const canvas = holder.querySelector('canvas');
        const img = holder.querySelector('img');
        if (canvas) {
          clearInterval(poll);
          const dataUrl = canvas.toDataURL('image/png');
          document.body.removeChild(holder);
          resolve(dataUrl);
        } else if (img && img.src && img.src.startsWith('data:')) {
          clearInterval(poll);
          document.body.removeChild(holder);
          resolve(img.src);
        } else if (tries > 40) {
          clearInterval(poll);
          document.body.removeChild(holder);
          resolve(null);
        }
      }, 50);
    });
  },

  /** Load the logo as a data URL (+ its natural size) so jsPDF can embed it without distortion */
  _loadLogoDataUrl() {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = 'assets/logo.png';
    });
  },

  /**
   * Build and return a jsPDF document for the given order.
   * `shareLink` is the customer approval URL, embedded as a QR code.
   */
  async build(order, shareLink) {
    ensureProductsArray(order); // migrates any order saved under the old single-product shape
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 40;

    const [logo, qrDataUrl] = await Promise.all([
      this._loadLogoDataUrl(),
      this._renderQrDataUrl(shareLink || order.id),
    ]);

    // ---- Header band ----
    const headerH = 86;
    doc.setFillColor(13, 60, 122); // deep blue
    doc.rect(0, 0, pageW, headerH, 'F');

    if (logo && logo.dataUrl) {
      try {
        // Fit the logo inside a bounding box without stretching it —
        // scale to whichever dimension is the tighter constraint.
        const maxW = 110;
        const maxH = 54;
        const scale = Math.min(maxW / logo.width, maxH / logo.height);
        const drawW = logo.width * scale;
        const drawH = logo.height * scale;
        const logoX = margin;
        const logoY = (headerH - drawH) / 2;
        // Small white card behind the logo so it reads clearly on the blue band
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(logoX - 8, logoY - 6, drawW + 16, drawH + 12, 4, 4, 'F');
        doc.addImage(logo.dataUrl, 'PNG', logoX, logoY, drawW, drawH);
      } catch (e) {
        /* ignore embed failure, continue without logo */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('ORDER CONFIRMATION', pageW - margin, 38, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Order No: ${shortOrderNumber(order.id)}`, pageW - margin, 56, { align: 'right' });
    doc.text(`Date: ${formatDate(order.topSection.date)}`, pageW - margin, 70, { align: 'right' });

    y = 106;
    doc.setTextColor(20, 20, 20);

    const sectionTitle = (title) => {
      doc.setFillColor(232, 240, 250);
      doc.rect(margin, y, pageW - margin * 2, 20, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(13, 60, 122);
      doc.text(title, margin + 8, y + 14);
      y += 30;
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    };

    const row = (label, value, colWidth = (pageW - margin * 2) / 2) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin + 8, y);
      const labelW = doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      const text = doc.splitTextToSize(String(value || '—'), colWidth - labelW - 16);
      doc.text(text, margin + 8 + labelW + 8, y);
      return text.length;
    };

    // Two label/value pairs on one line. Each value starts right after its
    // own label's measured width (not a fixed offset), so long labels like
    // "Winding Direction" or "Customer Approved On" never collide with the
    // value text that follows them.
    const twoCol = (leftLabel, leftVal, rightLabel, rightVal) => {
      const half = (pageW - margin * 2) / 2;
      const colStartLeft = margin + 8;
      const colStartRight = margin + half + 8;

      doc.setFont('helvetica', 'bold');
      doc.text(`${leftLabel}:`, colStartLeft, y);
      const leftLabelW = doc.getTextWidth(`${leftLabel}: `);
      doc.setFont('helvetica', 'normal');
      doc.text(String(leftVal || '—'), colStartLeft + leftLabelW + 6, y);

      doc.setFont('helvetica', 'bold');
      doc.text(`${rightLabel}:`, colStartRight, y);
      const rightLabelW = doc.getTextWidth(`${rightLabel}: `);
      doc.setFont('helvetica', 'normal');
      doc.text(String(rightVal || '—'), colStartRight + rightLabelW + 6, y);

      y += 18;
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
    const typeLines = row('Order Type', typeLabels.length ? typeLabels.join(', ') : '—', pageW - margin * 2);
    y += Math.max(16, typeLines * 12) + 6;

    // ---- Customer Information ----
    sectionTitle('CUSTOMER INFORMATION');
    twoCol('Customer', order.customer.name, 'Mobile', order.customer.mobile);
    twoCol('GSTIN', order.customer.gstin, 'Mail ID', order.customer.mailId);
    twoCol('Contact Person', order.customer.contactPerson, 'Designation', order.customer.designation);
    const addrLines = row('Address', order.customer.address, pageW - margin * 2);
    y += Math.max(16, addrLines * 12);
    const delivAddr = order.customer.deliveryAddressType === 'Same' ? 'Same as above' : order.customer.deliveryAddress;
    const delivLines = row('Delivery Address', delivAddr, pageW - margin * 2);
    y += Math.max(16, delivLines * 12) + 6;

    // ---- Product Details table ----
    sectionTitle('PRODUCT DETAILS');
    y = this._drawProductsTable(doc, order.products, y, margin, pageW);

    // page break check
    if (y > 680) {
      doc.addPage();
      y = 40;
    }

    // ---- Transport Details ----
    sectionTitle('TRANSPORT & PAYMENT');
    twoCol('Freight', order.transport.freight, 'Transport', order.transport.transport);
    twoCol('Delivery Period', order.transport.deliveryPeriod, 'Payment Terms', order.transport.paymentTerms);
    twoCol('Last Bill Date', formatDate(order.transport.lastBillDate), 'Amount Recd. Date', formatDate(order.transport.amtRecdDate));
    y += 6;

    // ---- Remarks ----
    if (order.remarks) {
      sectionTitle('REMARKS');
      const remLines = row('Remarks', order.remarks, pageW - margin * 2);
      y += Math.max(16, remLines * 12) + 6;
    }

    if (y > 620) {
      doc.addPage();
      y = 40;
    }

    // ---- Representative & Approval ----
    sectionTitle('REPRESENTATIVE & APPROVAL');
    twoCol('Representative', order.topSection.repName, 'Order Date', formatDate(order.topSection.date));
    twoCol('Approval Status', order.status, 'Customer Approved On', order.approval.approvedAt ? formatDateTime(order.approval.approvedAt) : '—');

    if (order.approval.location) {
      const loc = order.approval.location;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Approval GPS Location:', margin + 8, y);
      const locLabelW = doc.getTextWidth('Approval GPS Location: ');
      doc.setFont('helvetica', 'normal');
      doc.text(`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`, margin + 8 + locLabelW + 6, y);
      y += 16;
      doc.setTextColor(22, 86, 168);
      doc.setFont('helvetica', 'bold');
      doc.textWithLink('View on Google Maps →', margin + 8, y, {
        url: googleMapsLink(loc),
      });
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'normal');
      y += 16;
    } else if (order.status === 'Approved') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(224, 164, 38);
      doc.text('Approval GPS Location: not captured', margin + 8, y);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'normal');
      y += 16;
    }
    y += 4;

    // ---- Approval seal + QR ----
    const boxY = y;

    if (order.status === 'Approved') {
      doc.setDrawColor(30, 158, 90);
      doc.setLineWidth(2);
      doc.roundedRect(margin, boxY, 170, 60, 6, 6);

      // Vector checkmark (avoids the unicode ✔ glyph, which jsPDF's
      // built-in font can't render and shows as a stray apostrophe).
      doc.setDrawColor(30, 158, 90);
      doc.setLineWidth(2.2);
      doc.lines(
        [
          [5, 6],
          [8, -14],
        ],
        margin + 18,
        boxY + 27,
        [1, 1],
        'S'
      );

      doc.setTextColor(30, 158, 90);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('APPROVED', margin + 40, boxY + 32);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Digitally confirmed by customer', margin + 18, boxY + 48);
    } else {
      doc.setDrawColor(224, 164, 38);
      doc.setLineWidth(2);
      doc.roundedRect(margin, boxY, 170, 60, 6, 6);
      doc.setTextColor(224, 164, 38);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('PENDING APPROVAL', margin + 14, boxY + 35);
    }

    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', pageW - margin - 80, boxY - 10, 80, 80);
        doc.setTextColor(90, 90, 90);
        doc.setFontSize(8);
        doc.text('Scan to view order', pageW - margin - 80, boxY + 78);
      } catch (e) {
        /* ignore */
      }
    }

    // ---- Footer ----
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, 800, pageW - margin, 800);
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text('AsiaformS — All types of Computer Billing Papers', margin, 812);
      doc.text(`Page ${i} of ${pageCount}`, pageW - margin, 812, { align: 'right' });
    }

    return doc;
  },

  /** Build the PDF and trigger a browser download */
  async downloadPdf(order, shareLink) {
    const doc = await this.build(order, shareLink);
    doc.save(`OrderConfirmation_${shortOrderNumber(order.id)}.pdf`);
  },
};
