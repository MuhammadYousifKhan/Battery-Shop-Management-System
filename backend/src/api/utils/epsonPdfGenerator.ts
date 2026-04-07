import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { IBilling } from '../models/Billing';
import { ICustomerInvoice } from '../models/CustomerInvoice';
import { IOrder } from '../models/Order';
import { getCachedStoreSettings } from './storeSettingsService';

// ==========================================
// 1. CONFIGURATION — Half-A4 PORTRAIT (148mm x 210mm) FIXED PAGE SIZE
// ==========================================

const PAGE_WIDTH = 419.53;   // 148mm in points (half A4 width)
const PAGE_HEIGHT = 595.28;  // 210mm in points (A4 height = half A4 long side)
const MARGIN = 25;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2); // ~370pt
const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN;        // max y before needing new page

const FONT_REGULAR = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const formatCurrency = (amount: number) => {
    const val = amount || 0;
    const rounded = Math.round(val);
    return `Rs ${rounded.toLocaleString('en-PK')}`;
};

const formatNumber = (amount: number) => {
    const val = amount || 0;
    const rounded = Math.round(val);
    return rounded.toLocaleString('en-PK');
};

const formatBalance = (amount: number) => {
    const abs = Math.abs(amount || 0);
    if (!abs) return formatCurrency(0);
    return `${formatCurrency(abs)} ${amount < 0 ? 'CR' : 'DR'}`;
};

const formatBalanceAmountOnly = (amount: number) => {
    const abs = Math.abs(amount || 0);
    return formatCurrency(abs);
};

const formatDate = (date: Date | string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: '2-digit'
    });
};

const getDigitId = (obj: any) => {
    let rawId = "";
    if (obj.invoiceNumber) {
        rawId = obj.invoiceNumber.toString();
    } else {
        // @ts-ignore
        const hex = obj?._id?.toString().slice(-6) || '000000';
        rawId = parseInt(hex, 16).toString();
    }
    return rawId.slice(-8).padStart(8, '0');
};

// ==========================================
// 3. DRAWING HELPERS
// ==========================================

const drawDashedLine = (doc: PDFKit.PDFDocument, y: number) => {
    doc.moveTo(MARGIN, y)
       .lineTo(MARGIN + CONTENT_WIDTH, y)
       .strokeColor('#999999')
       .lineWidth(0.5)
       .dash(3, { space: 2 })
       .stroke();
    doc.undash();
};

const drawSolidLine = (doc: PDFKit.PDFDocument, y: number) => {
    doc.moveTo(MARGIN, y)
       .lineTo(MARGIN + CONTENT_WIDTH, y)
       .strokeColor('#000000')
       .lineWidth(0.5)
       .undash()
       .stroke();
};

const getStoreHeader = () => {
    const settings = getCachedStoreSettings();
    const storeName = settings.storeName || 'My Store';
    return {
        storeName,
        address: settings.address || '',
        phone: settings.phone || '',
        watermarkName: settings.watermarkName || storeName
    };
};

const drawWatermark = (doc: PDFKit.PDFDocument) => {
    doc.save();
    const { watermarkName, storeName } = getStoreHeader();
    const text = watermarkName || storeName;
    const x = PAGE_WIDTH / 2;
    const wy = PAGE_HEIGHT / 2;
    doc.translate(x, wy);
    doc.rotate(-45);
    doc.font(FONT_BOLD);
    doc.fontSize(48);
    doc.fillColor('#e0e0e0');
    doc.opacity(0.1);
    doc.text(text, -doc.widthOfString(text) / 2, -20, { lineBreak: false });
    doc.restore();
};

const drawDeveloperFooter = (doc: PDFKit.PDFDocument, y: number) => {
    drawDashedLine(doc, y);
    y += 4;
    doc.font(FONT_REGULAR).fontSize(6)
       .text("Software Developed by: Yousif & Usman | 0336-7544180", MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
};

// ==========================================
// 4. PAGINATION HELPERS
// ==========================================

/**
 * Check if we have enough space on the current page.
 * If not, adds a new page with watermark and returns MARGIN (top).
 * Otherwise returns the same y unchanged.
 */
const checkPageBreak = (doc: PDFKit.PDFDocument, y: number, needed: number): number => {
    if (y + needed > BOTTOM_LIMIT) {
        doc.addPage();
        drawWatermark(doc);
        return MARGIN;
    }
    return y;
};

/**
 * Draw a small continuation header on a new page.
 * Returns the y position after the header.
 */
const drawContinuationHeader = (doc: PDFKit.PDFDocument, title: string): number => {
    let y = MARGIN;
    doc.font(FONT_BOLD).fontSize(10)
       .text(`${title} (continued)`, MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
    y += 16;
    drawSolidLine(doc, y);
    y += 6;
    return y;
};

/**
 * Draw page number at the bottom-right of the page.
 */
const drawPageNumber = (doc: PDFKit.PDFDocument, pageNum: number) => {
    doc.font(FONT_REGULAR).fontSize(7)
       .text(`Page ${pageNum}`, MARGIN, PAGE_HEIGHT - 15, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
};

// ==========================================
// 5. RECEIPT HEADER
// ==========================================

const drawReceiptHeader = (doc: PDFKit.PDFDocument, title: string, docId: string, date: Date, customerName: string, customerPhone?: string) => {
     const { storeName, address, phone } = getStoreHeader();
    let y = MARGIN;

    doc.font(FONT_BOLD).fontSize(14)
         .text(storeName, MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
    y += 18;
     if (address) {
          doc.font(FONT_REGULAR).fontSize(8)
              .text(address, MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
          y += 12;
     }
     if (phone) {
          doc.font(FONT_REGULAR).fontSize(8)
              .text(`Ph: ${phone}`, MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
          y += 14;
     }

    // Title bar (transparent with black text and border)
    doc.rect(MARGIN, y, CONTENT_WIDTH, 20).stroke('#000000');
    doc.fillColor('black').font(FONT_BOLD).fontSize(11)
       .text(title, MARGIN, y + 4, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
    y += 26;

    // ID + Date row
    doc.font(FONT_REGULAR).fontSize(9);
    doc.text(`ID: ${docId}`, MARGIN, y, { lineBreak: false });
    doc.text(formatDate(date), MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
    y += 13;

    // Customer + Phone
    const phoneStr = customerPhone ? `  |  ${customerPhone}` : '';
    doc.text(`Customer: ${customerName || 'Walk-in'}${phoneStr}`, MARGIN, y, { lineBreak: false });
    y += 13;

    drawSolidLine(doc, y);
    return y + 6;
};

// ==========================================
// 6. TABLE ITEM ROW (5-column)
// ==========================================

const COL = {
    sku:   MARGIN,
    name:  MARGIN + 90,
    qty:   MARGIN + 210,
    price: MARGIN + 250,
    total: MARGIN + 310,
};

const COL_W = {
    sku:   85,
    name:  115,
    qty:   35,
    price: 55,
    total: CONTENT_WIDTH - 310,
};

const drawItemRow = (
    doc: PDFKit.PDFDocument, y: number,
    sku: string, name: string, qty: string, price: string, total: string,
    isHeader: boolean = false
): number => {
    const font = isHeader ? FONT_BOLD : FONT_REGULAR;
    const size = isHeader ? 10 : 9;
    doc.font(font).fontSize(size);

    if (isHeader) {
        doc.text("SKU",   COL.sku,   y, { width: COL_W.sku, lineBreak: false });
        doc.text("Item",  COL.name,  y, { width: COL_W.name, lineBreak: false });
        doc.text("Qty",   COL.qty,   y, { width: COL_W.qty,   align: 'center', lineBreak: false });
        doc.text("Price", COL.price, y, { width: COL_W.price, align: 'right', lineBreak: false });
        doc.text("Total", COL.total, y, { width: COL_W.total, align: 'right', lineBreak: false });
        return 16;
    }

    const nameH = doc.heightOfString(name, { width: COL_W.name });
    const itemAvailH = BOTTOM_LIMIT - y;
    doc.text(sku,   COL.sku,   y, { width: COL_W.sku, lineBreak: false });
    doc.text(name,  COL.name,  y, { width: COL_W.name, height: itemAvailH });
    doc.text(qty,   COL.qty,   y, { width: COL_W.qty,   align: 'center', lineBreak: false });
    doc.text(price, COL.price, y, { width: COL_W.price, align: 'right', lineBreak: false });
    doc.text(total, COL.total, y, { width: COL_W.total, align: 'right', lineBreak: false });
    return Math.max(nameH, 12) + 4;
};

/** Draw table header row and return new y */
const drawTableHeader = (doc: PDFKit.PDFDocument, y: number): number => {
    y += drawItemRow(doc, y, "SKU", "Item", "Qty", "Price", "Total", true);
    drawSolidLine(doc, y - 2);
    y += 4;
    return y;
};

// Helper: right-aligned label + value row
const drawLabelValue = (doc: PDFKit.PDFDocument, y: number, label: string, value: string, fontSize: number = 10, bold: boolean = true) => {
    doc.font(bold ? FONT_BOLD : FONT_REGULAR).fontSize(fontSize);
    doc.text(label, MARGIN, y, { lineBreak: false });
    doc.text(value, MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
};

// ============================================================
// 7. SALE RECEIPT (Bill) — PAGINATED
// ============================================================
export const generateBillPDF = (res: Response, bill: IBilling & { customerBalance?: number, scrapAmount?: number }): void => {
    try {
        const scrap = bill.scrapAmount || 0;
        const paymentHistory = bill.paymentHistory || [];

        // FIXED page size — margin:0 prevents PDFKit auto page breaks (we manage pages manually)
        const doc = new PDFDocument({
            margin: 0,
            size: [PAGE_WIDTH, PAGE_HEIGHT]
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=bill-${bill._id}.pdf`);
        doc.pipe(res);

        let pageNum = 1;
        drawWatermark(doc);
        let y = drawReceiptHeader(doc, "SALE RECEIPT", getDigitId(bill), bill.createdAt, bill.customerName, bill.customerPhone);

        // Table header
        y = drawTableHeader(doc, y);

        // Items (paginate if they overflow the page)
        bill.items.forEach((item) => {
            const nameLen = item.productName ? item.productName.length : 10;
            const estHeight = Math.ceil(nameLen / 40) * 12 + 22;

            const newY = checkPageBreak(doc, y, estHeight);
            if (newY < y) {
                // We moved to a new page
                drawPageNumber(doc, pageNum);
                pageNum++;
                y = drawContinuationHeader(doc, "SALE RECEIPT");
                y = drawTableHeader(doc, y);
            } else {
                y = newY;
            }

            const total = item.quantity * item.price;
            let desc = item.productName;
            // @ts-ignore
            if (item.chassisNumber) desc += `  [CH: ${item.chassisNumber}]`;
            // @ts-ignore
            const sku = item.sku || item.productRef?.sku || "-";
            const rowH = drawItemRow(doc, y, sku, desc, item.quantity.toString(), formatNumber(item.price), formatNumber(total));
            y += rowH;
        });

        // --- SUMMARY SECTION ---
        // Estimate space needed for the full summary block
        const summarySpace = 120 + (scrap > 0 ? 48 : 0) + (paymentHistory.length > 0 ? 40 + paymentHistory.length * 14 : 0);
        const newY = checkPageBreak(doc, y, Math.min(summarySpace, 200));
        if (newY < y) {
            drawPageNumber(doc, pageNum);
            pageNum++;
        }
        y = newY;

        y += 4;
        drawSolidLine(doc, y);
        y += 8;

        const totalItems = bill.items.length;
        const totalQty = bill.items.reduce((sum, i) => sum + i.quantity, 0);

        drawLabelValue(doc, y, "Total Items:", totalItems.toString());
        y += 16;
        drawLabelValue(doc, y, "Total Qty:", totalQty.toString());
        y += 16;

        const grossAmount = bill.amount;
        drawLabelValue(doc, y, scrap > 0 ? "Sub Total:" : "Bill Total:", formatCurrency(grossAmount));
        y += 16;

        let netPayable = grossAmount;

        if (scrap > 0) {
            doc.font(FONT_BOLD).fontSize(10);
            doc.text("Less Scrap:", MARGIN, y, { lineBreak: false });
            doc.text(`- ${formatCurrency(scrap)}`, MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
            y += 16;

            netPayable = grossAmount - scrap;
            drawLabelValue(doc, y, "Net Total:", formatCurrency(netPayable));
            y += 16;
        }

        // Payment History
        if (paymentHistory.length > 0) {
            const pmtY = checkPageBreak(doc, y, 30 + paymentHistory.length * 14);
            if (pmtY < y) { drawPageNumber(doc, pageNum); pageNum++; }
            y = pmtY;

            y += 4;
            drawDashedLine(doc, y);
            y += 6;
            doc.font(FONT_BOLD).fontSize(9).text("Payment History:", MARGIN, y, { lineBreak: false });
            y += 14;

            doc.font(FONT_REGULAR).fontSize(9);
            paymentHistory.forEach((pmt: any) => {
                const pY = checkPageBreak(doc, y, 16);
                if (pY < y) { drawPageNumber(doc, pageNum); pageNum++; }
                y = pY;

                const pmtDate = formatDate(pmt.date);
                doc.text(pmtDate, MARGIN, y, { lineBreak: false });
                doc.text("Installment", MARGIN + 80, y, { lineBreak: false });
                doc.text(formatCurrency(pmt.amount), MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
                y += 14;
            });

            drawDashedLine(doc, y);
            y += 6;
        }

        // Total Due section
        const dueY = checkPageBreak(doc, y, 60);
        if (dueY < y) { drawPageNumber(doc, pageNum); pageNum++; }
        y = dueY;

        drawLabelValue(doc, y, "Total Paid:", formatCurrency(bill.paidAmount));
        y += 14;

        const outstanding = (bill.balance !== undefined)
            ? bill.balance
            : (netPayable - (bill.paidAmount || 0));

        doc.font(FONT_BOLD).fontSize(11)
           .text("TOTAL DUE:", MARGIN, y, { lineBreak: false });
        doc.text(formatCurrency(outstanding), MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
        y += 16;

        // Warranty note
        drawDashedLine(doc, y);
        y += 4;
        doc.font(FONT_BOLD).fontSize(8).text("Warranty Note:", MARGIN, y, { lineBreak: false });
        y += 10;
        doc.font(FONT_REGULAR).fontSize(8);
        doc.text("Warranty: Battery Cell Only  (Warranty Sirf Battery Cell Ki Hai)", MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
        y += 12;

        doc.font(FONT_REGULAR).fontSize(8);
        doc.text("Thank you for your visit!", MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
        y += 10;
        doc.fontSize(7);
        doc.text("No Return/Exchange without bill", MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
        y += 10;

        const footY = checkPageBreak(doc, y, 20);
        if (footY < y) { drawPageNumber(doc, pageNum); pageNum++; }
        y = footY;
        drawDeveloperFooter(doc, y);
        drawPageNumber(doc, pageNum);
        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Bill PDF");
    }
};

// ============================================================
// 8. ORDER SLIP — PAGINATED
// ============================================================

const drawOrderContent = (doc: PDFKit.PDFDocument, order: any) => {
    let pageNum = 1;
    drawWatermark(doc);
    let y = drawReceiptHeader(doc, "ORDER SLIP", getDigitId(order), order.createdAt, order.customerName, order.customerPhone);

    // Status badge
    doc.rect(MARGIN, y - 4, CONTENT_WIDTH, 18).stroke();
    doc.font(FONT_BOLD).fontSize(10)
       .text(`STATUS: ${(order.status || '').toUpperCase()}`, MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
    y += 22;

    // Table header
    y = drawTableHeader(doc, y);

    // Items
    order.items.forEach((item: any) => {
        const nameLen = item.productName ? item.productName.length : 10;
        const estHeight = Math.ceil(nameLen / 40) * 12 + 22;

        const newY = checkPageBreak(doc, y, estHeight);
        if (newY < y) {
            drawPageNumber(doc, pageNum);
            pageNum++;
            y = drawContinuationHeader(doc, "ORDER SLIP");
            y = drawTableHeader(doc, y);
        } else {
            y = newY;
        }

        const total = item.quantity * item.price;
        let desc = item.productName;
        if (item.chassisNumber) desc += `  [CH: ${item.chassisNumber}]`;
        const sku = item.sku || "-";
        const h = drawItemRow(doc, y, sku, desc, item.quantity.toString(), formatNumber(item.price), formatNumber(total));
        y += h;
    });

    // Summary
    const sumY = checkPageBreak(doc, y, 90);
    if (sumY < y) { drawPageNumber(doc, pageNum); pageNum++; }
    y = sumY;

    drawSolidLine(doc, y);
    y += 8;

    const totalItems = order.items.length;
    const totalQty = order.items.reduce((sum: number, i: any) => sum + i.quantity, 0);

    drawLabelValue(doc, y, "Total Items:", totalItems.toString());
    y += 16;
    drawLabelValue(doc, y, "Total Qty:", totalQty.toString());
    y += 16;
    drawSolidLine(doc, y);
    y += 8;

    doc.font(FONT_BOLD).fontSize(11)
       .text(`TOTAL: ${formatCurrency(order.totalAmount)}`, MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });

    const footY = checkPageBreak(doc, y + 14, 20);
    if (footY < y + 14) { drawPageNumber(doc, pageNum); pageNum++; }
    drawDeveloperFooter(doc, footY);
    drawPageNumber(doc, pageNum);
};

export const generateOrderPDF = (res: Response, order: IOrder): void => {
    try {
        const doc = new PDFDocument({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=order-${order._id}.pdf`);
        doc.pipe(res);

        drawOrderContent(doc, order);
        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Order PDF");
    }
};

export const generateOrderPDFBuffer = (order: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
        const buffers: Buffer[] = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', err => reject(err));

        drawOrderContent(doc, order);
        doc.end();
    });
};

// ============================================================
// 9. CUSTOMER INVOICE — PAGINATED
// ============================================================
export const generateCustomerInvoicePDF = (res: Response, invoice: ICustomerInvoice): void => {
    try {
        const doc = new PDFDocument({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=invoice-${invoice.invoiceNumber}.pdf`);
        doc.pipe(res);

        let pageNum = 1;
        drawWatermark(doc);
        let y = drawReceiptHeader(doc, "INVOICE", getDigitId(invoice), invoice.date, invoice.customerName, (invoice as any).customerPhone);

        y = drawTableHeader(doc, y);

        invoice.items.forEach((item) => {
            const newY = checkPageBreak(doc, y, 22);
            if (newY < y) {
                drawPageNumber(doc, pageNum);
                pageNum++;
                y = drawContinuationHeader(doc, "INVOICE");
                y = drawTableHeader(doc, y);
            } else {
                y = newY;
            }

            // @ts-ignore
            const sku = item.sku || "-";
            const h = drawItemRow(doc, y, sku, item.productName, item.quantity.toString(), formatNumber(item.price), formatNumber(item.total));
            y += h;
        });

        // Summary
        const sumY = checkPageBreak(doc, y, 80);
        if (sumY < y) { drawPageNumber(doc, pageNum); pageNum++; }
        y = sumY;

        drawSolidLine(doc, y);
        y += 8;

        drawLabelValue(doc, y, "Prev Balance:", formatCurrency(invoice.previousBalance), 10, false);
        y += 16;
        drawLabelValue(doc, y, "Current Bill:", formatCurrency(invoice.subtotal), 10, false);
        y += 16;
        drawSolidLine(doc, y);
        y += 8;

        doc.font(FONT_BOLD).fontSize(11)
           .text(`NET: ${formatCurrency(invoice.totalAmount)}`, MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });

        const footY = checkPageBreak(doc, y + 14, 20);
        if (footY < y + 14) { drawPageNumber(doc, pageNum); pageNum++; }
        drawDeveloperFooter(doc, footY);
        drawPageNumber(doc, pageNum);
        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Invoice PDF");
    }
};

// ============================================================
// 10. CUSTOMER LEDGER (Statement) — PAGINATED
// ============================================================

const drawLedgerColumnHeaders = (doc: PDFKit.PDFDocument, y: number, lCol: any, lW: any): number => {
    doc.font(FONT_BOLD).fontSize(9).fillColor('black');
    doc.text("Date",        lCol.date,    y, { width: lW.date, lineBreak: false });
    doc.text("Description", lCol.desc,    y, { width: lW.desc, lineBreak: false });
    doc.text("Amount",      lCol.amount,  y, { width: lW.amount,  align: 'right', lineBreak: false });
    doc.text("Balance",     lCol.balance, y, { width: lW.balance, align: 'right', lineBreak: false });
    y += 14;
    drawSolidLine(doc, y);
    y += 6;
    return y;
};

const drawLedgerContent = (
    doc: PDFKit.PDFDocument,
    customer: any,
    transactions: any[],
    openingBalance: number,
    startDate: Date,
    endDate: Date
) => {
    const sortedTransactions = [...transactions].sort((a, b) => {
        const da = new Date(a.transactionDate || a.date || a.createdAt).getTime();
        const db = new Date(b.transactionDate || b.date || b.createdAt).getTime();
        return da - db;
    });

    let pageNum = 1;
    drawWatermark(doc);

    let y = drawReceiptHeader(doc, "CUSTOMER STATEMENT", getDigitId(customer), startDate, customer?.name, customer?.phone);

    doc.font(FONT_REGULAR).fontSize(10)
       .text(`Period: ${formatDate(startDate)}  TO  ${formatDate(endDate)}`, MARGIN, y, { align: 'center', width: CONTENT_WIDTH, lineBreak: false });
    y += 16;
    drawSolidLine(doc, y);
    y += 8;

    // --- OPENING BALANCE ---
    doc.font(FONT_BOLD).fontSize(11)
       .text("OPENING BALANCE", MARGIN, y, { lineBreak: false });
    doc.text(formatBalanceAmountOnly(openingBalance), MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
    y += 16;
    drawSolidLine(doc, y);
    y += 8;

    let runningBalance = openingBalance;

    // Ledger column positions
    const lCol = {
        date:    MARGIN,
        desc:    MARGIN + 55,
        amount:  MARGIN + 240,
        balance: MARGIN + 305
    };
    const lW = {
        date:    50,
        desc:    180,
        amount:  60,
        balance: CONTENT_WIDTH - 305
    };

    // Column headers on first page
    y = drawLedgerColumnHeaders(doc, y, lCol, lW);

    for (const tx of sortedTransactions) {
        const isDebit = (tx.type === 'Invoice' || tx.type === 'SALE' || tx.debit > 0);
        const amount = tx.debit > 0 ? tx.debit : tx.credit;

        const date = formatDate(tx.transactionDate || tx.date || tx.createdAt);
        let rawDesc = tx.description || tx.narration || 'Transaction';
        const desc = rawDesc.replace(/(bill #|Inv #)([a-fA-F0-9]+)/gi, (match: string, prefix: string, hex: string) => {
            const shortHex = hex.substring(0, 8);
            const decimalValue = parseInt(shortHex, 16);
            return `${prefix}${decimalValue}`;
        });

        if (isDebit) {
            runningBalance += amount;
        } else {
            runningBalance -= amount;
        }

        const isOrder = tx.orderRef && tx.orderRef.items && Array.isArray(tx.orderRef.items) && tx.orderRef.items.length > 0;

        // Calculate actual description height BEFORE page-break check
        doc.font(FONT_REGULAR).fontSize(9);
        const descH = doc.heightOfString(desc, { width: lW.desc });
        const mainRowH = Math.max(descH, 12) + 6;

        // For orders, ensure main row + some buffer fits; sub-items have their own page-break checks
        const neededH = isOrder ? mainRowH + 30 : mainRowH;
        const newY = checkPageBreak(doc, y, neededH);
        if (newY < y) {
            drawPageNumber(doc, pageNum);
            pageNum++;
            y = drawContinuationHeader(doc, "CUSTOMER STATEMENT");
            y = drawLedgerColumnHeaders(doc, y, lCol, lW);
        } else {
            y = newY;
        }

        // Main row — constrain text to available space to prevent PDFKit auto page breaks
        const rowAvailH = BOTTOM_LIMIT - y;
        doc.font(FONT_REGULAR).fontSize(9).fillColor('black');
        doc.text(date, lCol.date, y, { width: lW.date, lineBreak: false });
        doc.text(desc, lCol.desc, y, { width: lW.desc, height: rowAvailH });

        if (!isOrder) {
            doc.font(FONT_BOLD).fontSize(9);
            doc.text(formatCurrency(amount), lCol.amount, y, { width: lW.amount, align: 'right', lineBreak: false });
            doc.text(formatBalance(runningBalance), lCol.balance, y, { width: lW.balance, align: 'right', lineBreak: false });
        }

        y += Math.max(descH, 12) + 4;

        // Item breakdown for orders
        if (isOrder) {
            let itemTrackBalance = isDebit ? (runningBalance - amount) : (runningBalance + amount);

            doc.font(FONT_REGULAR).fontSize(8).fillColor('#333333');

            const iCol = {
                sku:   MARGIN + 10,
                name:  MARGIN + 95,
                qtyP:  MARGIN + 195,
                total: MARGIN + 250,
                bal:   MARGIN + 305
            };

            tx.orderRef.items.forEach((item: any) => {
                const sku = item.sku || item.productRef?.sku || "-";
                const itemName = item.productName || "Item";
                const qty = item.quantity || 0;
                const price = item.price || 0;
                const itemTotal = qty * price;

                // Calculate actual sub-item height for accurate page-break check
                doc.font(FONT_REGULAR).fontSize(8);
                const itemNameH = Math.max(doc.heightOfString(itemName, { width: 95 }), 12) + 4;
                const subY = checkPageBreak(doc, y, itemNameH);
                if (subY < y) {
                    drawPageNumber(doc, pageNum);
                    pageNum++;
                    y = drawContinuationHeader(doc, "CUSTOMER STATEMENT");
                    y = drawLedgerColumnHeaders(doc, y, lCol, lW);
                    doc.font(FONT_REGULAR).fontSize(8).fillColor('#333333');
                } else {
                    y = subY;
                }

                itemTrackBalance += itemTotal;

                doc.font(FONT_REGULAR).fontSize(8);
                const subAvailH = BOTTOM_LIMIT - y;
                doc.text(sku, iCol.sku, y, { width: 80, lineBreak: false });
                doc.text(itemName, iCol.name, y, { width: 95, height: subAvailH });
                doc.text(`${qty} x ${formatNumber(price)}`, iCol.qtyP, y, { width: 50, align: 'right', lineBreak: false });
                doc.text(formatNumber(itemTotal), iCol.total, y, { width: 50, align: 'right', lineBreak: false });
                doc.font(FONT_BOLD).fontSize(8);
                doc.text(formatBalance(itemTrackBalance), iCol.bal, y, { width: lW.balance, align: 'right', lineBreak: false });
                doc.font(FONT_REGULAR);

                const h = Math.max(doc.heightOfString(itemName, { width: 95 }), 12);
                y += h + 4;
            });

            doc.fillColor('black');
        }

        drawSolidLine(doc, y);
        y += 6;
    }

    // --- CLOSING BALANCE ---
    const closeY = checkPageBreak(doc, y, 60);
    if (closeY < y) { drawPageNumber(doc, pageNum); pageNum++; }
    y = closeY;
    y += 6;

    doc.font(FONT_BOLD).fontSize(11).fillColor('black')
       .text("CLOSING BALANCE", MARGIN, y, { lineBreak: false });
    doc.text(formatBalance(runningBalance), MARGIN, y, { align: 'right', width: CONTENT_WIDTH, lineBreak: false });
    y += 14;
    drawSolidLine(doc, y);

    const footY = checkPageBreak(doc, y + 10, 20);
    if (footY < y + 10) { drawPageNumber(doc, pageNum); pageNum++; }
    drawDeveloperFooter(doc, footY);
    drawPageNumber(doc, pageNum);
};

export const generateLedgerPDF = (
    res: Response,
    customer: any,
    transactions: any[],
    openingBalance: number,
    startDate: Date,
    endDate: Date
): void => {
    const doc = new PDFDocument({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Ledger_${customer?.name}.pdf`);
    doc.pipe(res);

    drawLedgerContent(doc, customer, transactions, openingBalance, startDate, endDate);
    doc.end();
};

export const generateLedgerPDFBuffer = (
    customer: any,
    transactions: any[],
    openingBalance: number,
    startDate: Date,
    endDate: Date
): Promise<Buffer> => {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
        const buffers: Buffer[] = [];

        doc.on('data', d => buffers.push(d));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        drawLedgerContent(doc, customer, transactions, openingBalance, startDate, endDate);
        doc.end();
    });
};
