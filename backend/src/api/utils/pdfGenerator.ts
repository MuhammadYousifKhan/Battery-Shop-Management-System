import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { IBilling } from '../models/Billing'; 
import { ICustomerInvoice } from '../models/CustomerInvoice';
import { IOrder } from '../models/Order';
import { getCachedStoreSettings } from './storeSettingsService';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const THERMAL_WIDTH = 226; // approx 80mm
const THERMAL_MARGIN = 10;
const THERMAL_CONTENT_WIDTH = THERMAL_WIDTH - (THERMAL_MARGIN * 2);

const A4_WIDTH = 595.28; 
const A4_MARGIN = 30;    
const A4_CONTENT_WIDTH = A4_WIDTH - (A4_MARGIN * 2); 

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

// Calculates height for Bill/Invoice Items (Retail/Order)
const calculateAutoHeight = (items: any[], hasScrap: boolean = false, paymentHistory: any[] = []) => {
    const HEADER_HEIGHT = 175; 
    let FOOTER_HEIGHT = hasScrap ? 280 : 240; 

    if (paymentHistory && paymentHistory.length > 0) {
        FOOTER_HEIGHT += 30 + (paymentHistory.length * 15); 
    }
    
    FOOTER_HEIGHT += 30;

    const ROW_BASE_HEIGHT = 15;
    const itemsHeight = items.reduce((total: number, item: any) => {
        const nameLen = item.productName ? item.productName.length : 10;
        const lines = Math.ceil(nameLen / 15); 
        const extraDetails = item.chassisNumber ? 10 : 0;
        return total + (lines * 10) + extraDetails + ROW_BASE_HEIGHT;
    }, 0);

    return HEADER_HEIGHT + itemsHeight + FOOTER_HEIGHT;
};

// Calculate Exact Height for Ledger (To prevent Page Breaks)
const calculateLedgerHeight = (transactions: any[]) => {
    const HEADER_HEIGHT = 220; 
    const FOOTER_HEIGHT = 100;
    
    const bodyHeight = transactions.reduce((acc, tx) => {
        const dateStr = formatDate(tx.transactionDate || tx.date || tx.createdAt);
        const rawDesc = tx.description || tx.narration || 'Transaction';
        const desc = rawDesc.replace(/(bill #)([a-fA-F0-9]+)/gi, 'Bill');
        const lineText = `${dateStr} - ${desc}`;
        const charsPerLine = 35; 
        const lines = Math.ceil(lineText.length / charsPerLine) || 1;
        
        let rowHeight = (lines * 10) + 40; 
        
        // Items Height Calculation
        if (tx.orderRef && Array.isArray(tx.orderRef.items) && tx.orderRef.items.length > 0) {
            // Estimate 40px per item row (increased for stacked balance)
            rowHeight += (tx.orderRef.items.length * 40) + 15; 
        }
        if (tx.invoiceRef && Array.isArray(tx.invoiceRef.items)) {
            rowHeight += (tx.invoiceRef.items.length * 25);
        }

        return acc + rowHeight;
    }, 0);

    return HEADER_HEIGHT + bodyHeight + FOOTER_HEIGHT;
};

// ==========================================

const drawLine = (doc: PDFKit.PDFDocument, y: number, width: number = THERMAL_CONTENT_WIDTH) => {
    doc.moveTo(THERMAL_MARGIN, y)
       .lineTo(THERMAL_MARGIN + width, y)
       .strokeColor('#000000')
       .lineWidth(0.5)
       .dash(2, { space: 2 })
       .stroke();
    doc.undash(); 
};

// New Solid Line Helper for Row Separation
const drawSolidLine = (doc: PDFKit.PDFDocument, y: number, width: number = THERMAL_CONTENT_WIDTH) => {
    doc.moveTo(THERMAL_MARGIN, y)
       .lineTo(THERMAL_MARGIN + width, y)
       .strokeColor('#000000')
       .lineWidth(0.5)
       .undash()
       .stroke();
};

const drawDeveloperFooter = (doc: PDFKit.PDFDocument, y: number) => {
    drawLine(doc, y);
    y += 8;
    doc.font(FONT_REGULAR).fontSize(7)
       .text("Software Developed by:", THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
    y += 10;
    doc.font(FONT_BOLD).fontSize(8)
       .text("Yousif & Usman | 0336-7544180", THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
};

const getStoreHeader = () => {
    const settings = getCachedStoreSettings();
    const storeName = settings.storeName || 'My Store';
    return {
        storeName,
        address: settings.address || '',
        phone: settings.phone || '',
        watermarkName: settings.watermarkName || storeName,
        systemName: settings.systemName || `${storeName} Management System`
    };
};

const drawWatermark = (doc: PDFKit.PDFDocument, width: number, height: number) => {
    doc.save(); 
    const { watermarkName, storeName } = getStoreHeader();
    const text = watermarkName || storeName;
    const x = width / 2; 
    const y = height / 2;
    doc.translate(x, y); 
    doc.rotate(-45); 
    doc.font(FONT_BOLD); 
    doc.fontSize(22); 
    doc.fillColor('#e0e0e0'); 
    doc.opacity(0.15); 
    doc.text(text, -doc.widthOfString(text) / 2, -10); 
    doc.restore(); 
};

const drawReceiptHeader = (doc: PDFKit.PDFDocument, title: string, docId: string, date: Date, customerName: string) => {
    const { storeName, address, phone } = getStoreHeader();
    let y = 10;
    doc.font(FONT_BOLD).fontSize(14).text(storeName, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
    y += 18;
    if (address) {
        doc.fontSize(9).font(FONT_REGULAR)
            .text(address, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 12;
    }
    if (phone) {
        doc.fontSize(8).font(FONT_REGULAR)
            .text(`Ph: ${phone}`, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 12;
    }
    
    doc.rect(THERMAL_MARGIN, y, THERMAL_CONTENT_WIDTH, 18).fill('black');
    doc.fillColor('white').font(FONT_BOLD).fontSize(10).text(title, THERMAL_MARGIN, y + 4, { align: 'center', width: THERMAL_CONTENT_WIDTH });
    doc.fillColor('black');
    y += 24; 
    
    doc.font(FONT_REGULAR).fontSize(8);
    doc.text(`ID: ${docId}`, THERMAL_MARGIN, y, { align: 'left', width: THERMAL_CONTENT_WIDTH });
    doc.text(formatDate(date), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
    y += 12; 
    
    doc.text(`Customer: ${customerName || 'Walk-in'}`, THERMAL_MARGIN, y);
    y += 12;
    drawLine(doc, y);
    return y + 6;
};

const drawItemRow = (doc: PDFKit.PDFDocument, y: number, sku: string, name: string, qty: string, price: string, total: string, isHeader: boolean = false) => {
    const colSku = THERMAL_MARGIN;        
    const colName = 60;                   
    const colQty = 115;                   
    const colPrice = 135;                 
    const colTotal = THERMAL_MARGIN;      
    
    doc.font(isHeader ? FONT_BOLD : FONT_REGULAR).fontSize(8);

    if (isHeader) {
        doc.text("SKU", colSku, y, { width: 30 });
        doc.text("Item", colName, y, { width: 65 });
        doc.text("Qty", colQty, y, { width: 18, align: 'center' });
        doc.text("Price", colPrice, y, { width: 30, align: 'right' }); 
        doc.text("Total", colTotal, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        return 15;
    } else {
        doc.fontSize(7.5);
        doc.text(sku, colSku, y, { width: 30 });
        doc.text(name, colName, y, { width: 65 });
        const nameHeight = doc.heightOfString(name, { width: 65 });
        doc.text(qty, colQty, y, { width: 18, align: 'center' });
        doc.text(price, colPrice, y, { width: 30, align: 'right' }); 
        doc.text(total, colTotal, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        return Math.max(nameHeight, 10) + 5; 
    }
};

/* ============================================================
   CUSTOMER LEDGER PDF (LINES ONLY - UPDATED COLUMN LAYOUT)
============================================================ */

const drawLedgerContent = (
    doc: PDFKit.PDFDocument,
    customer: any,
    transactions: any[],
    openingBalance: number,
    startDate: Date,
    endDate: Date,
    height: number
) => {

    const sortedTransactions = [...transactions].sort((a, b) => {
        const da = new Date(a.transactionDate || a.date || a.createdAt).getTime();
        const db = new Date(b.transactionDate || b.date || b.createdAt).getTime();
        return da - db;
    });

    drawWatermark(doc, THERMAL_WIDTH, height);

    let y = drawReceiptHeader(
        doc,
        "CUSTOMER STATEMENT",
        getDigitId(customer),
        startDate,
        customer?.name
    );

    doc.fontSize(8)
       .text(`Period: ${formatDate(startDate)} TO ${formatDate(endDate)}`,
       THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
    y += 14;
    drawSolidLine(doc, y); // Separator
    y += 6;
    
    // --- OPENING BALANCE ---
    doc.font(FONT_BOLD).fontSize(9)
       .text("OPENING BALANCE", THERMAL_MARGIN, y);
    
    doc.text(formatBalanceAmountOnly(openingBalance), THERMAL_MARGIN, y, {
        align: 'right',
        width: THERMAL_CONTENT_WIDTH
    });
    
    y += 14;
    drawSolidLine(doc, y); // Separator
    y += 6;

    let runningBalance = openingBalance;

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

        const lineText = `${date} - ${desc}`;
        const balanceBeforeTx = runningBalance;

        if (isDebit) {
            runningBalance += amount;
        } else {
            runningBalance -= amount;
        }

        const isOrder = tx.orderRef && tx.orderRef.items && Array.isArray(tx.orderRef.items) && tx.orderRef.items.length > 0;

        // 1. Calculate Main Line Height
        doc.font(FONT_REGULAR).fontSize(8);
        const descWidth = isOrder ? THERMAL_CONTENT_WIDTH : THERMAL_CONTENT_WIDTH - 60;
        const textHeight = doc.heightOfString(lineText, { width: descWidth });
        const rowHeight = Math.max(textHeight, 10);

        // 2. Draw Main Text
        doc.fillColor('black').text(lineText, THERMAL_MARGIN, y, { width: descWidth });

        // 3. Draw Amount/Balance (Only if NOT an order)
        if (!isOrder) {
            doc.font(FONT_BOLD)
               .text(formatCurrency(amount), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH - 4 });
            // For simple tx, print balance on next line to avoid clutter
            y += rowHeight + 2;
            doc.font(FONT_BOLD).fontSize(8)
               .text(formatBalance(runningBalance), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH - 4 });
            y += 10;
        } else {
            y += rowHeight + 2;
        }

        // Draw Line below main transaction
        drawSolidLine(doc, y);
        y += 4; 

        // ============================================================
        // ✅ ITEM BREAKDOWN (LINES + STACKED BALANCE)
        // ============================================================
        if (isOrder) {
            doc.fontSize(7).fillColor('#333333'); 
            
            // 5-Column Layout
            const xSku = THERMAL_MARGIN; 
            const wSku = 70;  
            const xName = xSku + wSku + 2; 
            const wName = 40; 
            const xQty = xName + wName + 2; 
            const wQty = 30; // "Qty x Rate"
            const xTotal = xQty + wQty + 2; 
            const wTotal = 30; // Total Item Price
            const xBal = xTotal + wTotal + 2; 
            const wBal = THERMAL_CONTENT_WIDTH - (xBal - THERMAL_MARGIN); // Balance takes remaining

            let itemTrackBalance = balanceBeforeTx; 

            tx.orderRef.items.forEach((item: any) => {
                const sku = item.sku || item.productRef?.sku || "-";
                const itemName = item.productName || "Item";
                const qty = item.quantity || 0;
                const price = item.price || 0;
                const itemTotal = qty * price;

                itemTrackBalance += itemTotal; 
                
                // Calculate Dynamic Height
                const hSku = doc.heightOfString(sku, { width: wSku });
                const hName = doc.heightOfString(itemName, { width: wName });
                
                // We need extra height for the 2-line balance (Rs \n Number)
                const itemRowHeight = Math.max(hSku, hName, 22) + 4; 

                const currentY = y;

                // 1. SKU
                doc.text(sku, xSku, currentY, { width: wSku, align: 'left' });
                
                // 2. Name
                doc.text(itemName, xName, currentY, { width: wName, align: 'left' });
                
                // 3. Qty x Price
                doc.text(`${qty}x${Math.round(price)}`, xQty, currentY, { width: wQty, align: 'right' });

                // 4. Total Item Price
                doc.text(Math.round(itemTotal).toLocaleString(), xTotal, currentY, { width: wTotal, align: 'right' });

                // 5. ✅ ROW RUNNING BALANCE (STACKED)
                // "Rs" on top
                doc.font(FONT_BOLD).text("Rs", xBal, currentY, { 
                    width: wBal, 
                    align: 'right' 
                });
                // Amount on bottom
                doc.text(formatNumber(Math.abs(itemTrackBalance)), xBal, currentY + 10, { 
                    width: wBal, 
                    align: 'right' 
                });
                doc.font(FONT_REGULAR); 
                
                y += itemRowHeight; 
                
                // Draw Line below item
                drawSolidLine(doc, y);
                y += 4;
            });
            
            doc.fillColor('black'); 
        } else {
            // If it was a simple tx, we already drew the line above
            // just verify spacing
            drawSolidLine(doc, y);
            y += 4;
        }
    }

    y += 5;
    
    // --- CLOSING BALANCE ---
    doc.font(FONT_BOLD).fontSize(10)
       .text("CLOSING BALANCE", THERMAL_MARGIN, y);
    
    doc.text(formatBalance(runningBalance), THERMAL_MARGIN, y, {
        align: 'right',
        width: THERMAL_CONTENT_WIDTH
    });
    
    y += 14;
    drawSolidLine(doc, y);

    y += 20;
    drawDeveloperFooter(doc, y);
};

export const generateLedgerPDF = (
    res: Response,
    customer: any,
    transactions: any[],
    openingBalance: number,
    startDate: Date,
    endDate: Date
): void => {
    const height = calculateLedgerHeight(transactions);
    const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, height] });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Ledger_${customer?.name}.pdf`);
    doc.pipe(res);

    drawLedgerContent(doc, customer, transactions, openingBalance, startDate, endDate, height);
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
        const height = calculateLedgerHeight(transactions);
        const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, height] });
        const buffers: Buffer[] = [];

        doc.on('data', d => buffers.push(d));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        drawLedgerContent(doc, customer, transactions, openingBalance, startDate, endDate, height);
        doc.end();
    });
};

// ... (Rest of the file remains unchanged: generateBillPDF, generateOrderPDF, etc.)
// ... Be sure to keep the original imports and other functions below this point.

// ============================================================
// 3. Retail Bill (Thermal Receipt) - ✅ FIXED LOGIC
// ============================================================
export const generateBillPDF = (res: Response, bill: IBilling & { customerBalance?: number, scrapAmount?: number }): void => {
    try {
        const scrap = bill.scrapAmount || 0;
        const paymentHistory = bill.paymentHistory || [];
        
        const calculatedHeight = calculateAutoHeight(bill.items, scrap > 0, paymentHistory) + 50;

        const doc = new PDFDocument({ 
            margin: THERMAL_MARGIN, 
            size: [THERMAL_WIDTH, calculatedHeight] 
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=bill-${bill._id}.pdf`);
        doc.pipe(res);

        let y = drawReceiptHeader(doc, "SALE RECEIPT", getDigitId(bill), bill.createdAt, bill.customerName);
        
        y += drawItemRow(doc, y, "SKU", "Item", "Qty", "Price", "Total", true);
        drawLine(doc, y - 2); 
        y += 4;

        bill.items.forEach((item) => {
            const total = item.quantity * item.price;
            let desc = item.productName;
            // @ts-ignore
            if (item.chassisNumber) desc += `\n[CH: ${item.chassisNumber}]`;
            // @ts-ignore
            const sku = item.sku || item.productRef?.sku || "-";

            const rowHeight = drawItemRow(doc, y, sku, desc, item.quantity.toString(), formatNumber(item.price), formatNumber(total));
            y += rowHeight;
        });

        y += 5;
        drawLine(doc, y); 
        y += 5;

        // Totals
        doc.font(FONT_BOLD).fontSize(9);
        const totalItems = bill.items.length;
        const totalQty = bill.items.reduce((sum, i) => sum + i.quantity, 0);
        
        doc.text("Total Items:", THERMAL_MARGIN, y);
        doc.text(totalItems.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        
        doc.text("Total Qty:", THERMAL_MARGIN, y);
        doc.text(totalQty.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;

        // ✅ FIX 1: Use bill.amount as the Gross Total (e.g. 26,000)
        const grossAmount = bill.amount; 

        doc.text(scrap > 0 ? "Sub Total:" : "Bill Total:", THERMAL_MARGIN, y);
        doc.text(formatCurrency(grossAmount), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;

        let netPayable = grossAmount;

        if (scrap > 0) {
            doc.fillColor('black').text("Less Scrap:", THERMAL_MARGIN, y);
            doc.text(`- ${formatCurrency(scrap)}`, THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
            doc.fillColor('black'); 
            y += 14;
            
            // ✅ FIX 2: Net Total is Gross - Scrap (26,000 - 5,511 = 20,489)
            netPayable = grossAmount - scrap;
            doc.text("Net Total:", THERMAL_MARGIN, y);
            doc.text(formatCurrency(netPayable), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
            y += 14;
        }

        // Installments
        if (paymentHistory.length > 0) {
            y += 5;
            drawLine(doc, y); 
            y += 5;
            doc.font(FONT_BOLD).fontSize(8).text("Payment History:", THERMAL_MARGIN, y);
            y += 12;
            
            doc.font(FONT_REGULAR).fontSize(8);
            paymentHistory.forEach((pmt: any) => {
                const pmtDate = formatDate(pmt.date);
                doc.text(pmtDate, THERMAL_MARGIN, y);
                doc.text("Installment", THERMAL_MARGIN + 55, y); 
                doc.text(formatCurrency(pmt.amount), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
                y += 12;
            });
            
            drawLine(doc, y); 
            y += 5;
        }

        doc.font(FONT_BOLD).fontSize(9);
        doc.text("Total Paid:", THERMAL_MARGIN, y);
        doc.text(formatCurrency(bill.paidAmount), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;

        // ✅ FIX 3: Outstanding is Net Payable - Paid Amount
        // (20,489 - 16,000 = 4,489)
        const outstanding = (bill.balance !== undefined) 
            ? bill.balance 
            : (netPayable - (bill.paidAmount || 0));
        
        doc.fontSize(12).text("TOTAL DUE:", THERMAL_MARGIN, y);
        doc.text(formatCurrency(outstanding), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 20;

        doc.font(FONT_BOLD).fontSize(8).text("Warranty Note:", THERMAL_MARGIN, y);
        y += 10;
        doc.font(FONT_REGULAR).fontSize(8);
        const warrantyText = "Warranty: Battery Cell Only\n(Warranty Sirf Battery Cell Ki Hai)";
        doc.text(warrantyText, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 25;

        doc.font(FONT_REGULAR).fontSize(9);
        doc.text("Thank you for your visit!", THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 12;
        doc.fontSize(7);
        doc.text("No Return/Exchange without bill", THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 15;

        drawDeveloperFooter(doc, y);
        doc.end();
    } catch (err) { 
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Retail Bill PDF"); 
    }
};


export const generateOrderPDF = (res: Response, order: IOrder): void => {
    try {
        const calculatedHeight = calculateAutoHeight(order.items) + 50; 
        const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, calculatedHeight] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=order-${order._id}.pdf`);
        doc.pipe(res);

        drawWatermark(doc, THERMAL_WIDTH, calculatedHeight);
        let y = drawReceiptHeader(doc, "ORDER SLIP", getDigitId(order), order.createdAt, order.customerName);
        
        doc.rect(THERMAL_MARGIN, y - 5, THERMAL_CONTENT_WIDTH, 15).stroke();
        doc.font(FONT_BOLD).fontSize(9).text(`STATUS: ${order.status.toUpperCase()}`, THERMAL_MARGIN, y - 1, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 15;

        y += drawItemRow(doc, y, "SKU", "Item", "Qty", "Price", "Total", true);
        drawLine(doc, y - 2); y += 4;

        order.items.forEach((item) => {
            const total = item.quantity * item.price;
            let desc = item.productName;
            // @ts-ignore
            if (item.chassisNumber) desc += `\n[CH: ${item.chassisNumber}]`;
            // @ts-ignore
            const sku = item.sku || "-";
            const height = drawItemRow(doc, y, sku, desc, item.quantity.toString(), formatNumber(item.price), formatNumber(total));
            y += height;
        });

        drawLine(doc, y); y += 5;
        const totalItems = order.items.length;
        const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);

        doc.font(FONT_BOLD).fontSize(9);
        doc.text("Total Items:", THERMAL_MARGIN, y);
        doc.text(totalItems.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        doc.text("Total Qty:", THERMAL_MARGIN, y);
        doc.text(totalQty.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        drawLine(doc, y); y += 5;

        doc.font(FONT_BOLD).fontSize(12).text(`TOTAL: ${formatCurrency(order.totalAmount)}`, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        drawDeveloperFooter(doc, y + 20);
        doc.end();
    } catch (err) { res.status(500).send("Error generating Order PDF"); }
};

export const generateOrderPDFBuffer = (order: any): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const calculatedHeight = calculateAutoHeight(order.items) + 50; 
        const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, calculatedHeight] });
        const buffers: Buffer[] = [];

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', err => reject(err));

        drawWatermark(doc, THERMAL_WIDTH, calculatedHeight);
        let y = drawReceiptHeader(doc, "ORDER SLIP", getDigitId(order), order.createdAt, order.customerName);
        
        doc.rect(THERMAL_MARGIN, y - 5, THERMAL_CONTENT_WIDTH, 15).stroke();
        doc.font(FONT_BOLD).fontSize(9).text(`STATUS: ${order.status.toUpperCase()}`, THERMAL_MARGIN, y - 1, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 15;

        y += drawItemRow(doc, y, "SKU", "Item", "Qty", "Price", "Total", true);
        drawLine(doc, y - 2); y += 4;

        order.items.forEach((item: any) => {
            const total = item.quantity * item.price;
            let desc = item.productName;
            if (item.chassisNumber) desc += `\n[CH: ${item.chassisNumber}]`;
            const sku = item.sku || "-";
            const height = drawItemRow(doc, y, sku, desc, item.quantity.toString(), formatNumber(item.price), formatNumber(total));
            y += height;
        });

        drawLine(doc, y); y += 5;
        const totalItems = order.items.length;
        const totalQty = order.items.reduce((sum: number, i: any) => sum + i.quantity, 0);

        doc.font(FONT_BOLD).fontSize(9);
        doc.text("Total Items:", THERMAL_MARGIN, y);
        doc.text(totalItems.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        doc.text("Total Qty:", THERMAL_MARGIN, y);
        doc.text(totalQty.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        drawLine(doc, y); y += 5;

        doc.font(FONT_BOLD).fontSize(12).text(`TOTAL: ${formatCurrency(order.totalAmount)}`, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        drawDeveloperFooter(doc, y + 20);
        doc.end();
    });
};

export const generateCustomerInvoicePDF = (res: Response, invoice: ICustomerInvoice): void => {
    try {
        const calculatedHeight = calculateAutoHeight(invoice.items);
        const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, calculatedHeight] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=invoice-${invoice.invoiceNumber}.pdf`);
        doc.pipe(res);

        drawWatermark(doc, THERMAL_WIDTH, calculatedHeight);
        let y = drawReceiptHeader(doc, "INVOICE", getDigitId(invoice), invoice.date, invoice.customerName);

        y += drawItemRow(doc, y, "SKU", "Item", "Qty", "Price", "Total", true);
        drawLine(doc, y - 2); y += 4;

        invoice.items.forEach((item) => {
             // @ts-ignore
             const sku = item.sku || "-"; 
            const height = drawItemRow(doc, y, sku, item.productName, item.quantity.toString(), formatNumber(item.price), formatNumber(item.total));
            y += height;
        });

        drawLine(doc, y); y += 5;
        doc.font(FONT_REGULAR).fontSize(9);
        doc.text("Prev Balance:", THERMAL_MARGIN, y);
        doc.text(formatCurrency(invoice.previousBalance), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        doc.text("Current Bill:", THERMAL_MARGIN, y);
        doc.text(formatCurrency(invoice.subtotal), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;
        drawLine(doc, y); y += 5;
        doc.font(FONT_BOLD).fontSize(12).text(`NET: ${formatCurrency(invoice.totalAmount)}`, THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        drawDeveloperFooter(doc, y + 20);
        doc.end();
    } catch (err) { res.status(500).send("Error generating Invoice PDF"); }
};

export const generateInventorySnapshotPDF = (res: Response, products: any[]): void => {
    try {
        const HEADER_HEIGHT = 120;
        const ROW_HEIGHT = 30;
        const FOOTER_HEIGHT = 60;
        const calculatedHeight = HEADER_HEIGHT + (products.length * ROW_HEIGHT) + FOOTER_HEIGHT;

        const doc = new PDFDocument({ 
            margin: THERMAL_MARGIN, 
            size: [THERMAL_WIDTH, calculatedHeight] 
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Stock_Check_${Date.now()}.pdf`);
        doc.pipe(res);

        drawWatermark(doc, THERMAL_WIDTH, calculatedHeight);
        
        let y = 10;
        const { storeName } = getStoreHeader();
        doc.font(FONT_BOLD).fontSize(12).text(storeName, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 15;
        doc.fontSize(10).text("STOCK CHECK REPORT", THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 15;
        
        doc.font(FONT_REGULAR).fontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 15;
        
        drawLine(doc, y);
        y += 5;

        const col = {
            sku: THERMAL_MARGIN,
            name: THERMAL_MARGIN + 35,
            stock: THERMAL_MARGIN + 135,
            physical: THERMAL_MARGIN + 175
        };

        doc.font(FONT_BOLD).fontSize(8);
        doc.text("SKU", col.sku, y, { width: 30 });
        doc.text("Product", col.name, y, { width: 95 });
        doc.text("Sys", col.stock, y, { width: 30, align: 'center' });
        doc.text("Phy", col.physical, y, { width: 30, align: 'center' });
        y += 12;
        drawLine(doc, y);
        y += 5;

        doc.font(FONT_REGULAR).fontSize(8);
        
        products.forEach((product, i) => {
            const stockQty = product.totalStock ?? product.quantity ?? product.stock ?? 0;
            doc.text(product.sku || '-', col.sku, y, { width: 30 });
            doc.text(product.name, col.name, y, { width: 95 });
            doc.fillColor('black');
            doc.text(stockQty.toString(), col.stock, y, { width: 30, align: 'center' });
            doc.rect(col.physical, y - 2, 30, 14).stroke();
            const nameHeight = doc.heightOfString(product.name, { width: 95 });
            y += Math.max(nameHeight, 16) + 5;
        });

        y += 10;
        drawLine(doc, y);
        y += 5;
        
        doc.font(FONT_BOLD).fontSize(9);
        doc.text("Total Items:", THERMAL_MARGIN, y);
        doc.text(products.length.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 12;

        const totalStock = products.reduce((sum, p) => sum + (p.totalStock || p.quantity || 0), 0);
        doc.text("Total Sys Qty:", THERMAL_MARGIN, y);
        doc.text(totalStock.toString(), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        
        y += 20;
        drawDeveloperFooter(doc, y);

        doc.end();
    } catch (err) { 
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Snapshot PDF"); 
    }
};

export const generateSupplierInvoicePDF = (res: Response, invoice: any): void => {
    try {
        const doc = new PDFDocument({ margin: A4_MARGIN, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=purchase-${invoice.invoiceNumber}.pdf`);
        doc.pipe(res);

        doc.font(FONT_BOLD).fontSize(18).text("PURCHASE INVOICE", { align: 'center' });
        doc.fontSize(10).text(`Inv #: ${invoice.invoiceNumber}`, { align: 'center' });
        doc.moveDown();

        doc.text(`Supplier: ${(invoice.supplier as any)?.name || 'Unknown'}`, A4_MARGIN, doc.y);
        doc.text(`Date: ${formatDate(invoice.createdAt)}`, 400, doc.y - 10);
        doc.moveDown();

        const col = { sku: 30, name: 100, qty: 300, cost: 380, total: 460 };
        doc.rect(A4_MARGIN, doc.y, A4_CONTENT_WIDTH, 20).fill('#333');
        doc.fillColor('white').font(FONT_BOLD).fontSize(9);
        doc.text("SKU", col.sku, doc.y + 6);
        doc.text("Item", col.name, doc.y + 6);
        doc.text("Qty", col.qty, doc.y + 6);
        doc.text("Cost", col.cost, doc.y + 6);
        doc.text("Total", col.total, doc.y + 6);
        
        doc.fillColor('black');
        let y = doc.y + 30;

        invoice.items.forEach((item: any) => {
            const total = item.quantity * item.price;
            doc.font(FONT_REGULAR);
            doc.text(item.productName.split('-')[0], col.sku, y);
            doc.text(item.productName, col.name, y, { width: 190 });
            doc.text(item.quantity.toString(), col.qty, y);
            doc.text(formatNumber(item.price), col.cost, y);
            doc.text(formatNumber(total), col.total, y);
            y += 15;
        });

        y += 10;
        doc.font(FONT_BOLD).fontSize(12).text(`TOTAL: ${formatCurrency(invoice.totalAmount)}`, 400, y);

        doc.end();
    } catch (err) { res.status(500).send("Error generating Purchase PDF"); }
};

export const generateSupplierLedgerPDF = (
    res: Response, 
    supplier: any, 
    transactions: any[], 
    openingBalance: number,
    startDate: Date,
    endDate: Date
): void => {
    try {
        const sortedTransactions = [...transactions].sort((a: any, b: any) => {
            return new Date(a.transactionDate || a.createdAt).getTime() - new Date(b.transactionDate || b.createdAt).getTime();
        });

        // Use new calculation method
        const height = calculateLedgerHeight(sortedTransactions);

        const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, height] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Supplier_Statement_${supplier?.name}.pdf`);
        doc.pipe(res);

        drawWatermark(doc, THERMAL_WIDTH, height);

        let y = drawReceiptHeader(doc, "SUPPLIER ACCOUNT", getDigitId(supplier || {}), startDate || new Date(), supplier?.name || 'Supplier');

        doc.font(FONT_REGULAR).fontSize(8).text(`From: ${formatDate(startDate)}  To: ${formatDate(endDate)}`, THERMAL_MARGIN, y, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 12;
        drawLine(doc, y);
        y += 6;

        doc.font(FONT_BOLD).fontSize(9).text('OPENING BALANCE', THERMAL_MARGIN, y);
        doc.text(formatBalance(openingBalance).replace(' DR', ''), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 14;

        let runningBalance = openingBalance;

        for (const tx of sortedTransactions) {
            const dateStr = formatDate(new Date(tx.transactionDate || tx.createdAt));
            const isBill = (tx.type === 'Invoice'); 

            let line = `${dateStr} - ${tx.description}`;
            doc.font(FONT_REGULAR).fontSize(8);
            doc.text(line, THERMAL_MARGIN, y, { width: THERMAL_CONTENT_WIDTH - 40 });
            const lineHeight = doc.heightOfString(line, { width: THERMAL_CONTENT_WIDTH - 40 });

            const billAmount = tx.credit || 0; 
            const paidAmount = tx.debit || 0;
            
            runningBalance = runningBalance + billAmount - paidAmount;

            const amtStr = billAmount > 0 ? formatCurrency(billAmount) : `(${formatCurrency(paidAmount)})`;
            doc.font(FONT_BOLD).fontSize(8).text(amtStr, THERMAL_MARGIN, y, { width: THERMAL_CONTENT_WIDTH, align: 'right' });

            y += lineHeight + 4;

            if (isBill && tx.invoiceRef && Array.isArray(tx.invoiceRef.items)) {
                doc.font(FONT_REGULAR).fontSize(7).fillColor('#444444');
                for (const item of tx.invoiceRef.items) {
                    const itemLine = `• ${item.productName} (${item.quantity} x ${formatNumber(item.price)})`; 
                    doc.text(itemLine, THERMAL_MARGIN + 8, y, { width: THERMAL_CONTENT_WIDTH - 20 });
                    y += doc.heightOfString(itemLine, { width: THERMAL_CONTENT_WIDTH - 20 }) + 2;
                }
                doc.fillColor('black');
            }

            doc.font(FONT_BOLD).fontSize(8).text(formatBalance(runningBalance).replace(' DR', ''), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
            y += 10;

            drawLine(doc, y);
            y += 6;
        }

        y += 5;
        doc.font(FONT_BOLD).fontSize(10).text('CLOSING PAYABLE', THERMAL_MARGIN, y);
        doc.text(formatBalance(runningBalance).replace(' DR', ''), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        y += 20;

        drawDeveloperFooter(doc, y);
        doc.end();

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Supplier PDF");
    }
};

export const generateSupplierPaymentPDF = (res: Response, payment: any, supplier: any): void => {
    try {
        const height = 300;
        const doc = new PDFDocument({ margin: THERMAL_MARGIN, size: [THERMAL_WIDTH, height] });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Payment_${payment._id}.pdf`);
        doc.pipe(res);

        drawWatermark(doc, THERMAL_WIDTH, height);

        let y = drawReceiptHeader(doc, "PAYMENT VOUCHER", getDigitId(payment), payment.transactionDate, supplier.name);

        doc.font(FONT_REGULAR).fontSize(9).text("Paid To:", THERMAL_MARGIN, y);
        doc.font(FONT_BOLD).text(supplier.name, THERMAL_MARGIN, y + 12);
        y += 30;

        doc.rect(THERMAL_MARGIN, y, THERMAL_CONTENT_WIDTH, 25).stroke();
        doc.font(FONT_BOLD).fontSize(12).text(formatCurrency(payment.debit), THERMAL_MARGIN, y + 8, { align: 'center', width: THERMAL_CONTENT_WIDTH });
        y += 35;

        doc.font(FONT_REGULAR).fontSize(9).text("Description:", THERMAL_MARGIN, y);
        doc.text(payment.description, THERMAL_MARGIN, y + 12);
        y += 30;

        drawLine(doc, y);
        y += 10;

        doc.font(FONT_BOLD).fontSize(9).text("Current Balance:", THERMAL_MARGIN, y);
        doc.text(formatCurrency(payment.balance), THERMAL_MARGIN, y, { align: 'right', width: THERMAL_CONTENT_WIDTH });
        
        y += 30;
        doc.font(FONT_REGULAR).fontSize(8).text("Signature: ________________", THERMAL_MARGIN, y);

        drawDeveloperFooter(doc, y + 20);
        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Payment PDF");
    }
};

export const generateSalesReportPDF = (
    res: Response, 
    report: {
        reportType: string;
        startDate: Date;
        endDate: Date;
        summary: any;
        data: any[];
    }
): void => {
    try {
        const doc = new PDFDocument({ margin: 30, size: 'A4' }); 
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Sales_Report_${Date.now()}.pdf`);
        doc.pipe(res);

        const isInventory = report.reportType === 'inventory';
        const isCustomerPayments = report.reportType === 'customer_payments';
        const isSupplierPayments = report.reportType === 'supplier_payments';
        const isScrapDetailed = report.reportType === 'scrap_detailed';
        const isPaymentsReport = isCustomerPayments || isSupplierPayments;
        const title = isInventory
            ? "INVENTORY SNAPSHOT REPORT"
            : isCustomerPayments
                ? "CUSTOMER PAYMENTS RECEIVED REPORT"
                : isSupplierPayments
                    ? "SUPPLIER PAYMENTS MADE REPORT"
                    : isScrapDetailed
                        ? "SCRAP DETAILED REPORT"
                        : "SALES PERFORMANCE REPORT";
        const { storeName } = getStoreHeader();

        // --- HEADER ---
        let y = 50;
        doc.font('Helvetica-Bold').fontSize(20).text(storeName, { align: 'center' });
        y += 25;
        doc.fontSize(12).text(title, { align: 'center' });
        y += 20;
        doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        y += 25;

        // --- SUMMARY BOX ---
        doc.rect(30, y, 535, 60).fill('#f8fafc').stroke('#e2e8f0');
        
        if (isInventory) {
            doc.fillColor('black').font('Helvetica-Bold').fontSize(10);
            doc.text("Total Inventory Value", 50, y + 15);
            doc.fontSize(14).text(`Rs ${Number(report.summary.totalValue).toLocaleString()}`, 50, y + 35);
            
            doc.fontSize(10).text("Total SKUs", 300, y + 15);
            doc.fontSize(14).text(report.summary.totalSKUs.toString(), 300, y + 35);
        } else if (isPaymentsReport) {
            doc.fillColor('black').font('Helvetica').fontSize(9);
            doc.text(`Period: ${report.startDate.toLocaleDateString()} to ${report.endDate.toLocaleDateString()}`, 40, y + 10);

            const drawMetric = (lbl: string, val: string, x: number) => {
                doc.font('Helvetica-Bold').fontSize(8).text(lbl, x, y + 30);
                doc.fontSize(11).text(val, x, y + 45);
            };
            drawMetric(isCustomerPayments ? "Total Received" : "Total Paid", `Rs ${Number((isCustomerPayments ? report.summary.totalReceived : report.summary.totalPaid) || 0).toLocaleString()}`, 40);
            drawMetric("No. of Payments", String(report.summary.totalPayments || 0), 220);
            drawMetric(isCustomerPayments ? "Customers" : "Suppliers", String((isCustomerPayments ? report.summary.customerCount : report.summary.supplierCount) || 0), 390);
        } else if (isScrapDetailed) {
            doc.fillColor('black').font('Helvetica').fontSize(9);
            doc.text(`Period: ${report.startDate.toLocaleDateString()} to ${report.endDate.toLocaleDateString()}`, 40, y + 10);

            const drawMetric = (lbl: string, val: string, x: number) => {
                doc.font('Helvetica-Bold').fontSize(8).text(lbl, x, y + 30);
                doc.fontSize(11).text(val, x, y + 45);
            };

            drawMetric('Bought / Sold (Kg)', `${Number(report.summary.totalBoughtKg || 0).toFixed(2)} / ${Number(report.summary.totalSoldKg || 0).toFixed(2)}`, 40);
            drawMetric('Closing Stock', `${Number(report.summary.closingStockKg || 0).toFixed(2)} Kg`, 230);
            drawMetric('Sell Amount', `Rs ${Number(report.summary.totalSellAmount || 0).toLocaleString()}`, 390);
        } else {
            // Period
            doc.fillColor('black').font('Helvetica').fontSize(9);
            doc.text(`Period: ${report.startDate.toLocaleDateString()} to ${report.endDate.toLocaleDateString()}`, 40, y + 10);

            // Metrics
            const drawMetric = (lbl: string, val: string, x: number) => {
                doc.font('Helvetica-Bold').fontSize(8).text(lbl, x, y + 30);
                doc.fontSize(11).text(val, x, y + 45);
            };
            drawMetric("Total Revenue", `Rs ${Number(report.summary.totalRevenue).toLocaleString()}`, 40);
            drawMetric("Gross Profit", `Rs ${Number(report.summary.grossProfit).toLocaleString()}`, 170);
            drawMetric("Items Sold", report.summary.totalItemsSold.toString(), 300);
        }
        
        y += 80;

        // --- TABLE HEADERS ---
        const drawHeader = (currY: number) => {
            doc.rect(30, currY, 535, 20).fill('#333333');
            doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
            
            if (isInventory) {
                doc.text("SKU", 40, currY + 5);
                doc.text("Product Name", 100, currY + 5);
                doc.text("Category", 300, currY + 5);
                doc.text("Stock", 400, currY + 5, { width: 40, align: 'center' });
                doc.text("Avg Cost", 450, currY + 5, { width: 50, align: 'right' });
                doc.text("Total Value", 510, currY + 5, { width: 50, align: 'right' });
            } else if (isScrapDetailed) {
                doc.text('Date', 40, currY + 5);
                doc.text('Type', 95, currY + 5);
                doc.text('Party', 140, currY + 5);
                doc.text('Settlement', 250, currY + 5);
                doc.text('Wt', 355, currY + 5, { width: 40, align: 'right' });
                doc.text('Rate', 405, currY + 5, { width: 50, align: 'right' });
                doc.text('Amount', 470, currY + 5, { width: 85, align: 'right' });
            } else if (isPaymentsReport) {
                doc.text(isCustomerPayments ? "Customer" : "Supplier", 40, currY + 5);
                doc.text("Phone", 150, currY + 5);
                doc.text("Date / Description", 235, currY + 5);
                doc.text("Amount", 495, currY + 5, { width: 60, align: 'right' });
            } else {
                doc.text("Product / Date", 40, currY + 5);
                doc.text("Qty Sold", 280, currY + 5, { width: 40, align: 'center' });
                doc.text("Avg Price", 330, currY + 5, { width: 50, align: 'right' });
                doc.text("Revenue", 390, currY + 5, { width: 60, align: 'right' });
                doc.text("Profit", 460, currY + 5, { width: 60, align: 'right' });
                doc.text("Margin", 530, currY + 5, { width: 30, align: 'right' });
            }
            doc.fillColor('black');
        };

        drawHeader(y);
        y += 25;

        // --- DATA ROWS ---
        report.data.forEach((item, index) => {
            // Page Break Logic
            if (y > 750) {
                doc.addPage();
                y = 30;
                drawHeader(y);
                y += 25;
            }

            // --- INVENTORY ROW ---
            if (isInventory) {
                if (index % 2 === 0) doc.rect(30, y - 2, 535, 14).fill('#f9fafb'); // Stripe
                doc.fillColor('black').font('Helvetica').fontSize(8);
                
                doc.text(item.sku || '-', 40, y);
                doc.text(item.name.substring(0, 45), 100, y);
                doc.text(item.category || '-', 300, y);
                doc.text(item.totalStock.toString(), 400, y, { width: 40, align: 'center' });
                doc.text(Math.round(item.averageCost || 0).toLocaleString(), 450, y, { width: 50, align: 'right' });
                doc.font('Helvetica-Bold');
                doc.text(Math.round(item.totalStock * (item.averageCost || 0)).toLocaleString(), 510, y, { width: 50, align: 'right' });
                
                y += 14;
            }
            // --- SCRAP DETAILED ROW ---
            else if (isScrapDetailed) {
                const isGrouped = Array.isArray(item.transactions);

                if (isGrouped) {
                    if (y > 735) {
                        doc.addPage();
                        y = 30;
                        drawHeader(y);
                        y += 25;
                    }

                    doc.rect(30, y - 2, 535, 16).fill('#fee2e2');
                    doc.fillColor('#7f1d1d').font('Helvetica-Bold').fontSize(8);
                    const groupTitle = `${String(item.partyName || 'Unknown').substring(0, 28)} (${String(item.partyType || '').toUpperCase()})`;
                    doc.text(groupTitle, 40, y + 1);
                    doc.fillColor('#111827').font('Helvetica').text(item.partyPhone || '-', 200, y + 1);
                    doc.text(`${item.transactionCount || 0} tx`, 330, y + 1, { width: 60, align: 'right' });
                    doc.text(Number(item.totalWeight || 0).toFixed(2), 355, y + 1, { width: 40, align: 'right' });
                    doc.text('-', 405, y + 1, { width: 50, align: 'right' });
                    doc.font('Helvetica-Bold').text(Number(item.totalAmount || 0).toLocaleString(), 470, y + 1, { width: 85, align: 'right' });
                    y += 18;

                    (item.transactions || []).forEach((tx: any, txIdx: number) => {
                        if (y > 748) {
                            doc.addPage();
                            y = 30;
                            drawHeader(y);
                            y += 25;
                        }

                        if (txIdx % 2 === 0) doc.rect(30, y - 1, 535, 19).fill('#fff7ed');
                        doc.fillColor('black').font('Helvetica').fontSize(8);

                        const rowDate = tx.date ? new Date(tx.date).toLocaleDateString() : '-';
                        doc.text(rowDate, 40, y + 1);
                        doc.text(String(tx.type || '-').toUpperCase(), 95, y + 1);
                        doc.text(String(tx.partyName || '-').substring(0, 24), 140, y + 1);
                        doc.text(String(tx.settlementLabel || '-').substring(0, 22), 250, y + 1);
                        doc.text(Number(tx.weight || 0).toFixed(2), 355, y + 1, { width: 40, align: 'right' });
                        doc.text(Number(tx.pricePerKg || 0).toFixed(0), 405, y + 1, { width: 50, align: 'right' });
                        doc.font('Helvetica-Bold').text(Number(tx.totalAmount || 0).toLocaleString(), 470, y + 1, { width: 85, align: 'right' });
                        doc.fillColor('#4b5563').font('Helvetica').fontSize(7).text(`Stock: ${Number(tx.runningStockKg || 0).toFixed(2)} Kg`, 470, y + 10, { width: 85, align: 'right' });
                        doc.fillColor('black');
                        y += 20;
                    });

                    y += 2;
                } else {
                    if (index % 2 === 0) doc.rect(30, y - 2, 535, 20).fill('#fff7ed');
                    doc.fillColor('black').font('Helvetica').fontSize(8);

                    const rowDate = item.date ? new Date(item.date).toLocaleDateString() : '-';
                    const typeText = String(item.type || '-').toUpperCase();
                    const partyText = String(item.partyName || '-').substring(0, 24);
                    const modeText = String(item.settlementLabel || '-').substring(0, 22);

                    doc.text(rowDate, 40, y + 1);
                    doc.text(typeText, 95, y + 1);
                    doc.text(partyText, 140, y + 1);
                    doc.text(modeText, 250, y + 1);
                    doc.text(Number(item.weight || 0).toFixed(2), 355, y + 1, { width: 40, align: 'right' });
                    doc.text(Number(item.pricePerKg || 0).toFixed(0), 405, y + 1, { width: 50, align: 'right' });
                    doc.font('Helvetica-Bold').text(Number(item.totalAmount || 0).toLocaleString(), 470, y + 1, { width: 85, align: 'right' });

                    const meta = `Phone: ${item.partyPhone || '-'} | Category: ${item.customerCategory || '-'} | Running Stock: ${Number(item.runningStockKg || 0).toFixed(2)} Kg`;
                    doc.fillColor('#4b5563').font('Helvetica').fontSize(7).text(meta.substring(0, 105), 40, y + 11);
                    doc.fillColor('black');

                    y += 22;
                }
            }
            // --- CUSTOMER PAYMENT ROW ---
            else if (isPaymentsReport) {
                const ensurePage = () => {
                    if (y > 750) {
                        doc.addPage();
                        y = 30;
                        drawHeader(y);
                        y += 25;
                    }
                };

                ensurePage();
                doc.rect(30, y - 2, 535, 16).fill('#dcfce7');
                doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(8);
                const entityName = isCustomerPayments ? (item.customerName || 'Unknown') : (item.supplierName || 'Unknown');
                const entityPhone = isCustomerPayments ? item.customerPhone : item.supplierPhone;
                const entityTotal = isCustomerPayments ? (item.totalReceived || 0) : (item.totalPaid || 0);
                doc.text(String(entityName).substring(0, 22), 40, y + 1);
                doc.fillColor('#374151').font('Helvetica').text(String(entityPhone || '-'), 150, y + 1);
                doc.text(`Total Payments: ${item.totalPayments || 0}`, 235, y + 1);
                doc.fillColor('#166534').font('Helvetica-Bold').text(`Rs ${Math.round(entityTotal).toLocaleString()}`, 495, y + 1, { width: 60, align: 'right' });
                y += 18;

                if (item.dailyBreakdown && item.dailyBreakdown.length > 0) {
                    item.dailyBreakdown.forEach((day: any) => {
                        ensurePage();
                        doc.rect(30, y - 1, 535, 14).fill('#f3f4f6');
                        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8);
                        doc.text(`↳ ${day.date}`, 235, y + 1);
                        doc.text(`${day.paymentCount || 0} payments`, 410, y + 1, { width: 80, align: 'right' });
                        doc.text(`Rs ${Math.round((isCustomerPayments ? day.totalReceived : day.totalPaid) || 0).toLocaleString()}`, 495, y + 1, { width: 60, align: 'right' });
                        y += 15;

                        if (day.payments && day.payments.length > 0) {
                            day.payments.forEach((pay: any) => {
                                ensurePage();
                                doc.fillColor('#4b5563').font('Helvetica').fontSize(8);
                                const desc = `${pay.time || ''} - ${pay.description || 'Payment Received'}`;
                                doc.text(desc.substring(0, 55), 245, y);
                                doc.fillColor('#111827').font('Helvetica-Bold').text(Math.round(pay.amount || 0).toLocaleString(), 495, y, { width: 60, align: 'right' });
                                y += 13;
                            });
                        }
                    });

                    y += 3;
                }
            }
            // --- PERFORMANCE ROW ---
            else {
                // Parent Row (Product)
                doc.rect(30, y - 2, 535, 16).fill('#e0e7ff'); // Light Blue bg
                doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(9);
                
                const prodName = `[${item.sku}] ${item.name}`;
                doc.text(prodName.substring(0, 50), 40, y + 1);
                
                doc.fillColor('black');
                doc.text(item.qty.toString(), 280, y + 1, { width: 40, align: 'center' });
                doc.text(Math.round(item.avgSellPrice).toLocaleString(), 330, y + 1, { width: 50, align: 'right' });
                doc.text(Math.round(item.revenue).toLocaleString(), 390, y + 1, { width: 60, align: 'right' });
                
                doc.fillColor(item.profit >= 0 ? '#166534' : '#991b1b'); // Green/Red
                doc.text(Math.round(item.profit).toLocaleString(), 460, y + 1, { width: 60, align: 'right' });
                
                doc.fillColor('black');
                doc.text(`${item.margin.toFixed(1)}%`, 530, y + 1, { width: 30, align: 'right' });

                y += 18;

                // Child Rows (Daily Breakdown)
                if (item.dailyBreakdown && item.dailyBreakdown.length > 0) {
                    item.dailyBreakdown.forEach((day: any) => {
                        if (y > 750) { doc.addPage(); y = 30; drawHeader(y); y += 25; }

                        doc.font('Helvetica').fontSize(8).fillColor('#64748b'); // Gray text
                        doc.text(`   ↳ ${day.date}`, 40, y);
                        doc.text(day.qty.toString(), 280, y, { width: 40, align: 'center' });
                        doc.text(Math.round(day.avgPrice).toLocaleString(), 330, y, { width: 50, align: 'right' });
                        doc.text(Math.round(day.revenue).toLocaleString(), 390, y, { width: 60, align: 'right' });
                        doc.text(Math.round(day.profit).toLocaleString(), 460, y, { width: 60, align: 'right' });
                        doc.text("-", 530, y, { width: 30, align: 'center' });
                        
                        y += 14;
                    });
                    y += 5; // Spacing after group
                }
            }
        });

        // Footer
        doc.text("", 30, y);
        doc.moveDown(2);
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('black').text("Yousif & Usman | 0336-7544180", 30, 800, { align: 'center' });

        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Sales PDF");
    }
};

export const generateClosingReportPDF = (
    res: Response, 
    reportData: {
        startDate: Date;
        endDate: Date;
        summary: any;
        itemWiseSales: any[];
    }
): void => {
    try {
        const doc = new PDFDocument({ margin: 30, size: 'A4' }); 
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Closing_Report_${Date.now()}.pdf`);
        doc.pipe(res);

        // --- HEADER ---
        const { storeName } = getStoreHeader();
        let currentY = 50;
        doc.font('Helvetica-Bold').fontSize(20).text(`${storeName} - FINANCIAL CLOSING REPORT`, { align: 'center' }); 
        currentY += 25;
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        currentY += 20;

        // --- PERIOD INFO ---
        doc.rect(30, currentY, 535, 25).fill('#f3f4f6').stroke('#e5e7eb');
        doc.fillColor('black').fontSize(10).font('Helvetica-Bold');
        doc.text(
            `Period: ${new Date(reportData.startDate).toLocaleString()}   TO   ${new Date(reportData.endDate).toLocaleString()}`,
            30, currentY + 8, { align: 'center', width: 535 }
        );
        currentY += 45; 

        // --- SUMMARY SECTION ---
        doc.font('Helvetica-Bold').fontSize(12).text("1. FINANCIAL & ACTIVITY SUMMARY", 30, currentY);
        currentY += 20;
        
        const boxWidth = 125; 
        const boxHeight = 45;
        const gap = 10;
        let startX = 30;
        let startY = currentY;

        const drawSummaryBox = (row: number, col: number, title: string, value: string) => {
            const x = startX + (col * (boxWidth + gap));
            const y = startY + (row * (boxHeight + gap));
            
            doc.rect(x, y, boxWidth, boxHeight).stroke();
            doc.font('Helvetica').fontSize(8).text(title, x + 2, y + 8, { width: boxWidth - 4, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(11).text(value, x + 2, y + 25, { width: boxWidth - 4, align: 'center' });
        };

        // Row 1
        drawSummaryBox(0, 0, "Total Revenue", `Rs ${Math.round(reportData.summary.totalSales).toLocaleString()}`);
        drawSummaryBox(0, 1, "Total Profit", `Rs ${Math.round(reportData.summary.totalProfit).toLocaleString()}`);
        drawSummaryBox(0, 2, "Scrap Profit", `Rs ${Math.round(reportData.summary.scrapProfit).toLocaleString()}`);
        drawSummaryBox(0, 3, "Total Activity", (reportData.summary.totalActivity || 0).toString());

        // Row 2
        const retail = reportData.summary.retailCount || 0;
        const wholesale = reportData.summary.wholesaleCount || 0;
        const claims = reportData.summary.claimCount || 0;
        const scrapBuys = reportData.summary.scrapBuyCount || 0;

        drawSummaryBox(1, 0, "Retail Bills", retail.toString());
        drawSummaryBox(1, 1, "Wholesale Orders", wholesale.toString());
        drawSummaryBox(1, 2, "Claims Created", claims.toString());
        drawSummaryBox(1, 3, "Scrap Bought", scrapBuys.toString());
        
        currentY = startY + (boxHeight * 2) + (gap * 2) + 20;

        // --- ITEM WISE SALES TABLE ---
        doc.font('Helvetica-Bold').fontSize(12).text("2. ITEM-WISE SALES & MARGIN DETAILS", 30, currentY);
        currentY += 20;

        // Table Header
        const col = { name: 30, qty: 230, rev: 280, cost: 350, profit: 420, margin: 490 };
        
        doc.rect(30, currentY, 535, 20).fill('#333333');
        doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
        doc.text("Product Name", col.name + 5, currentY + 5);
        doc.text("Qty", col.qty, currentY + 5, { width: 40, align: 'center' });
        doc.text("Revenue", col.rev, currentY + 5, { width: 60, align: 'right' });
        doc.text("Cost", col.cost, currentY + 5, { width: 60, align: 'right' });
        doc.text("Profit", col.profit, currentY + 5, { width: 60, align: 'right' });
        doc.text("Margin", col.margin, currentY + 5, { width: 40, align: 'right' });
        
        doc.fillColor('black');
        currentY += 25;

        // Table Rows
        reportData.itemWiseSales.forEach((item, index) => {
            if (currentY > 730) { 
                doc.addPage();
                currentY = 30;
                doc.rect(30, currentY, 535, 20).fill('#333333');
                doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
                doc.text("Product Name", col.name + 5, currentY + 5);
                doc.text("Qty", col.qty, currentY + 5, { width: 40, align: 'center' });
                doc.text("Revenue", col.rev, currentY + 5, { width: 60, align: 'right' });
                doc.text("Cost", col.cost, currentY + 5, { width: 60, align: 'right' });
                doc.text("Profit", col.profit, currentY + 5, { width: 60, align: 'right' });
                doc.text("Margin", col.margin, currentY + 5, { width: 40, align: 'right' });
                doc.fillColor('black');
                currentY += 25;
            }

            if (index % 2 === 0) doc.rect(30, currentY - 2, 535, 14).fill('#f9fafb');
            doc.fillColor('black');

            doc.font('Helvetica').fontSize(8);
            
            let displayName = item.name;
            // @ts-ignore
            if (item.sku && item.sku !== '-' && item.sku !== 'undefined') {
                displayName = `[${item.sku}] ${item.name}`;
            }
            
            doc.text(displayName.substring(0, 45), col.name + 5, currentY); 
            doc.text(item.qty.toString(), col.qty, currentY, { width: 40, align: 'center' });
            doc.text(Math.round(item.revenue).toLocaleString(), col.rev, currentY, { width: 60, align: 'right' });
            doc.text(Math.round(item.cost).toLocaleString(), col.cost, currentY, { width: 60, align: 'right' });
            
            if (item.profit < 0) doc.fillColor('red');
            doc.text(Math.round(item.profit).toLocaleString(), col.profit, currentY, { width: 60, align: 'right' });
            doc.fillColor('black');

            doc.text(`${item.margin}%`, col.margin, currentY, { width: 40, align: 'right' });

            currentY += 14;
        });

        // --- BOTTOM SUMMARY SECTION ---
        currentY += 10;
        doc.moveTo(30, currentY).lineTo(565, currentY).stroke();
        currentY += 5;

        const totalRev = reportData.itemWiseSales.reduce((acc, i) => acc + i.revenue, 0);
        const totalCost = reportData.itemWiseSales.reduce((acc, i) => acc + i.cost, 0);
        const totalProf = reportData.itemWiseSales.reduce((acc, i) => acc + i.profit, 0);
        const avgMargin = totalRev > 0 ? ((totalProf / totalRev) * 100).toFixed(1) : '0.0';

        doc.font('Helvetica-Bold').fontSize(9);
        doc.text("OVERALL TOTALS:", col.name + 5, currentY);
        doc.text(Math.round(totalRev).toLocaleString(), col.rev, currentY, { width: 60, align: 'right' });
        doc.text(Math.round(totalCost).toLocaleString(), col.cost, currentY, { width: 60, align: 'right' });
        
        doc.fillColor(totalProf < 0 ? 'red' : 'black');
        doc.text(Math.round(totalProf).toLocaleString(), col.profit, currentY, { width: 60, align: 'right' });
        doc.fillColor('black');

        doc.text(`${avgMargin}%`, col.margin, currentY, { width: 40, align: 'right' });

        currentY += 30;
        doc.font('Helvetica-Oblique').fontSize(8).text("Yousif & Usman | 0336-7544180", 30, 800, { align: 'center' });

        doc.end();
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).send("Error generating Closing PDF");
    }
};

export const generateClaimLedgerPDF = (
    res: Response, 
    entity: any, // Customer or Supplier
    claims: any[], 
    startDate: Date, 
    endDate: Date, 
    type: 'customer' | 'supplier'
): void => {
    try {
        const HEADER_HEIGHT = 200;
        const ROW_HEIGHT = 60; 
        const FOOTER_HEIGHT = 100;
        const height = HEADER_HEIGHT + (claims.length * ROW_HEIGHT) + FOOTER_HEIGHT;

        const THERMAL_WIDTH = 226;
        const THERMAL_MARGIN = 10;
        const CONTENT_WIDTH = THERMAL_WIDTH - 20;

        const doc = new PDFDocument({ margin: 10, size: [THERMAL_WIDTH, height] });
        const safeName = (entity.name || 'Entity').replace(/[^a-zA-Z0-9-_]/g, '_');
        const { storeName, address } = getStoreHeader();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Claim_History_${safeName}.pdf`);
        doc.pipe(res);

        let y = 10;
        doc.font('Helvetica-Bold').fontSize(14).text(storeName, THERMAL_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
        y += 18;
        if (address) {
            doc.fontSize(9).font('Helvetica').text(address, THERMAL_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
            y += 15;
        }
        
        doc.rect(THERMAL_MARGIN, y, CONTENT_WIDTH, 18).fill('black');
        doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
           .text(`${type.toUpperCase()} CLAIM HISTORY`, THERMAL_MARGIN, y + 4, { align: 'center', width: CONTENT_WIDTH });
        doc.fillColor('black');
        y += 25; 

        doc.font('Helvetica-Bold').fontSize(9).text(entity.name || 'Unknown Name', THERMAL_MARGIN, y);
        y += 12;
        if (entity.phone) {
            doc.font('Helvetica').fontSize(8).text(`Ph: ${entity.phone}`, THERMAL_MARGIN, y);
            y += 12;
        }
        doc.fontSize(8).text(`Period: ${formatDate(startDate)} - ${formatDate(endDate)}`, THERMAL_MARGIN, y);
        y += 15;

        doc.moveTo(THERMAL_MARGIN, y).lineTo(THERMAL_WIDTH - 10, y).stroke();
        y += 10;

        if (claims.length === 0) {
            doc.font('Helvetica-Oblique').fontSize(9).text("No claims found.", THERMAL_MARGIN, y, { align: 'center' });
        } else {
            claims.forEach((claim) => {
                const date = formatDate(claim.claimDate || claim.createdAt);
                const status = (claim.status || 'PENDING').toUpperCase();
                
                doc.font('Helvetica-Bold').fontSize(8).text(date, THERMAL_MARGIN, y);
                
                if (status === 'RESOLVED') doc.fillColor('green');
                else if (status === 'REJECTED') doc.fillColor('red');
                else doc.fillColor('orange');
                
                doc.text(status, THERMAL_MARGIN, y, { align: 'right', width: CONTENT_WIDTH });
                doc.fillColor('black');
                y += 10;

                const item = claim.items && claim.items[0];
                const prodName = item ? item.productName : "Unknown Product";
                const serial = item?.serialNumber || item?.chassisNumber || "N/A";

                doc.font('Helvetica-Bold').fontSize(8).text(prodName || '-', THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                y += 10;
                doc.font('Helvetica').fontSize(7).text(`S/N: ${serial}`, THERMAL_MARGIN, y);
                y += 10;

                doc.font('Helvetica-Oblique').fontSize(7).fillColor('#555')
                   .text(`Issue: ${claim.description || 'No description'}`, THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                
                y += doc.heightOfString(`Issue: ${claim.description || ''}`, { width: CONTENT_WIDTH }) + 2;

                // --- 🚀 NEW FEATURE: PRINT CLAIM FEE ---
                if (claim.claimFee && claim.claimFee > 0) {
                    const statusStr = claim.claimFeePaid ? "Paid (Cash)" : "Added to Ledger";
                    doc.font('Helvetica-Bold').fontSize(7).fillColor('black')
                       .text(`Charges: Rs ${claim.claimFee} - ${statusStr}`, THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                    y += 10;
                }
                // ----------------------------------------

                if (status === 'RESOLVED' && claim.resolution) {
                     doc.font('Helvetica-Bold').fontSize(7).fillColor('black')
                            .text(`Action: ${claim.resolution}`, THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                         y += doc.heightOfString(`Action: ${claim.resolution}`, { width: CONTENT_WIDTH }) + 2;
                }

                y += 5;
                doc.moveTo(THERMAL_MARGIN, y)
                   .lineTo(THERMAL_WIDTH - 10, y)
                   .dash(1, { space: 1 }) 
                   .stroke()
                   .undash();
                y += 8;
            });
        }

        y += 10;
        doc.font('Helvetica-Bold').fontSize(9).text(`Total Claims: ${claims.length}`, THERMAL_MARGIN, y, { align: 'right', width: CONTENT_WIDTH });
        y += 20;
        doc.moveTo(THERMAL_MARGIN, y).lineTo(THERMAL_WIDTH - 10, y).stroke();
        y += 5;
        doc.font('Helvetica').fontSize(7).text("Software Developed by: Yousif & Usman", THERMAL_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });

        doc.end();
    } catch (err) {
        console.error("PDF Gen Error:", err);
        if (!res.headersSent) res.status(500).send("Error generating Claim Ledger");
    }
};

export const generateClaimLedgerPDFBuffer = (
    entity: any, 
    claims: any[], 
    startDate: Date, 
    endDate: Date, 
    type: 'customer' | 'supplier'
): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        try {
            const HEADER_HEIGHT = 200;
            const ROW_HEIGHT = 60; 
            const FOOTER_HEIGHT = 100;
            const height = HEADER_HEIGHT + (claims.length * ROW_HEIGHT) + FOOTER_HEIGHT;

            const THERMAL_WIDTH = 226;
            const THERMAL_MARGIN = 10;
            const CONTENT_WIDTH = THERMAL_WIDTH - 20;
            
            const doc = new PDFDocument({ margin: 10, size: [THERMAL_WIDTH, height] });
            const buffers: Buffer[] = [];
            const { storeName, address } = getStoreHeader();

            doc.on('data', d => buffers.push(d));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            let y = 10;
            doc.font('Helvetica-Bold').fontSize(14).text(storeName, THERMAL_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
            y += 18;
            if (address) {
                doc.fontSize(9).font('Helvetica').text(address, THERMAL_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });
                y += 15;
            }
            
            doc.rect(THERMAL_MARGIN, y, CONTENT_WIDTH, 18).fill('black');
            doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
               .text(`${type.toUpperCase()} CLAIM HISTORY`, THERMAL_MARGIN, y + 4, { align: 'center', width: CONTENT_WIDTH });
            doc.fillColor('black');
            y += 25; 

            doc.font('Helvetica-Bold').fontSize(9).text(entity.name || 'Unknown Name', THERMAL_MARGIN, y);
            y += 12;
            if (entity.phone) {
                doc.font('Helvetica').fontSize(8).text(`Ph: ${entity.phone}`, THERMAL_MARGIN, y);
                y += 12;
            }
            doc.fontSize(8).text(`Period: ${formatDate(startDate)} - ${formatDate(endDate)}`, THERMAL_MARGIN, y);
            y += 15;

            doc.moveTo(THERMAL_MARGIN, y).lineTo(THERMAL_WIDTH - 10, y).stroke();
            y += 10;

            if (claims.length === 0) {
                doc.font('Helvetica-Oblique').fontSize(9).text("No claims found.", THERMAL_MARGIN, y, { align: 'center' });
            } else {
                claims.forEach((claim) => {
                    const date = formatDate(claim.claimDate || claim.createdAt);
                    const status = (claim.status || 'PENDING').toUpperCase();
                    
                    doc.font('Helvetica-Bold').fontSize(8).text(date, THERMAL_MARGIN, y);
                    
                    if (status === 'RESOLVED') doc.fillColor('green');
                    else if (status === 'REJECTED') doc.fillColor('red');
                    else doc.fillColor('orange');
                    
                    doc.text(status, THERMAL_MARGIN, y, { align: 'right', width: CONTENT_WIDTH });
                    doc.fillColor('black');
                    y += 10;

                    const item = claim.items && claim.items[0];
                    const prodName = item ? item.productName : "Unknown Product";
                    const serial = item?.serialNumber || item?.chassisNumber || "N/A";

                    doc.font('Helvetica-Bold').fontSize(8).text(prodName || '-', THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                    y += 10;
                    doc.font('Helvetica').fontSize(7).text(`S/N: ${serial}`, THERMAL_MARGIN, y);
                    y += 10;

                    doc.font('Helvetica-Oblique').fontSize(7).fillColor('#555')
                       .text(`Issue: ${claim.description || 'No description'}`, THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                    
                    y += doc.heightOfString(`Issue: ${claim.description || ''}`, { width: CONTENT_WIDTH }) + 2;

                    // --- 🚀 NEW FEATURE: PRINT CLAIM FEE ---
                    if (claim.claimFee && claim.claimFee > 0) {
                        const statusStr = claim.claimFeePaid ? "Paid (Cash)" : "Added to Ledger";
                        doc.font('Helvetica-Bold').fontSize(7).fillColor('black')
                           .text(`Charges: Rs ${claim.claimFee} - ${statusStr}`, THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                        y += 10;
                    }
                    // ----------------------------------------

                    if (status === 'RESOLVED' && claim.resolution) {
                         doc.font('Helvetica-Bold').fontSize(7).fillColor('black')
                            .text(`Action: ${claim.resolution}`, THERMAL_MARGIN, y, { width: CONTENT_WIDTH });
                         y += doc.heightOfString(`Action: ${claim.resolution}`, { width: CONTENT_WIDTH }) + 2;
                    }

                    y += 5;
                    doc.moveTo(THERMAL_MARGIN, y)
                       .lineTo(THERMAL_WIDTH - 10, y)
                       .dash(1, { space: 1 }) 
                       .stroke()
                       .undash();
                    y += 8;
                });
            }

            y += 10;
            doc.font('Helvetica-Bold').fontSize(9).text(`Total Claims: ${claims.length}`, THERMAL_MARGIN, y, { align: 'right', width: CONTENT_WIDTH });
            y += 20;
            doc.moveTo(THERMAL_MARGIN, y).lineTo(THERMAL_WIDTH - 10, y).stroke();
            y += 5;
            doc.font('Helvetica').fontSize(7).text("Software Developed by: Yousif & Usman", THERMAL_MARGIN, y, { align: 'center', width: CONTENT_WIDTH });

            doc.end();
        } catch (e) { reject(e); }
    });
};