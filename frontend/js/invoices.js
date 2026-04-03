// ============================================================
// invoices.js — GST Invoice management
// ============================================================

let allInvoices = [];
let editingInvoiceId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadInvoices();
    setupInvoiceForm();
    setupFilters();

    document.getElementById('newInvoiceBtn')?.addEventListener('click', openNewInvoice);
    document.getElementById('closeInvoiceModal')?.addEventListener('click', () => closeModal('invoiceModal'));
    document.getElementById('cancelInvoiceBtn')?.addEventListener('click', () => closeModal('invoiceModal'));
    document.getElementById('invoiceModalOverlay')?.addEventListener('click', () => closeModal('invoiceModal'));
    document.getElementById('saveInvoiceBtn')?.addEventListener('click', () => saveInvoice(false));
    document.getElementById('saveAndPdfBtn')?.addEventListener('click', () => saveInvoice(true));
    document.getElementById('closePaymentModal')?.addEventListener('click', () => closeModal('paymentModal'));
    document.getElementById('paymentModalOverlay')?.addEventListener('click', () => closeModal('paymentModal'));
    document.getElementById('cancelPaymentBtn')?.addEventListener('click', () => closeModal('paymentModal'));
    document.getElementById('savePaymentBtn')?.addEventListener('click', savePayment);

    // Set today's payment date
    const payDate = document.getElementById('payDate');
    if (payDate) payDate.value = new Date().toISOString().split('T')[0];
});

async function loadInvoices() {
    const { data } = await window.supabase
        .from('invoices')
        .select('*, clients(name, phone), invoice_payments(amount)')
        .order('created_at', { ascending: false });

    allInvoices = (data || []).map(inv => {
        const received = inv.invoice_payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
        return { ...inv, received, balance: (inv.total_amount || 0) - received };
    });

    renderStats();
    renderTable(allInvoices);
}

function renderStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = allInvoices.filter(i => new Date(i.created_at) >= monthStart);
    const billed = thisMonth.reduce((s, i) => s + (i.total_amount || 0), 0);
    const collected = thisMonth.reduce((s, i) => s + i.received, 0);
    const pending = allInvoices.filter(i => ['sent','partial','overdue'].includes(i.status)).reduce((s, i) => s + i.balance, 0);
    const gst = thisMonth.reduce((s, i) => s + (i.gst_amount || 0), 0);

    document.getElementById('totalBilled').textContent = formatINR(billed);
    document.getElementById('totalCollected').textContent = formatINR(collected);
    document.getElementById('totalPending').textContent = formatINR(pending);
    document.getElementById('totalGst').textContent = formatINR(gst);
}

function renderTable(invoices) {
    const tbody = document.getElementById('invoiceTable');
    if (!invoices.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No invoices yet</td></tr>'; return; }
    tbody.innerHTML = invoices.map(i => `
        <tr>
            <td><strong>${escHtml(i.invoice_number)}</strong></td>
            <td>${escHtml(i.clients?.name || '—')}</td>
            <td>${escHtml(i.notes?.split('\n')[0] || '—')}</td>
            <td>${formatDate(i.travel_date)}</td>
            <td>${formatINR(i.base_amount)}</td>
            <td>${formatINR(i.gst_amount)}</td>
            <td><strong>${formatINR(i.total_amount)}</strong></td>
            <td style="color:var(--success)">${formatINR(i.received)}</td>
            <td style="${i.balance > 0 ? 'color:var(--danger)' : ''}"><strong>${formatINR(i.balance)}</strong></td>
            <td>${invoiceBadge(i.status)}</td>
            <td>
                <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem" onclick="downloadInvoicePdf('${i.id}')">PDF</button>
                ${i.balance > 0 ? `<button class="btn-success" style="padding:4px 8px;font-size:0.78rem;margin-left:4px" onclick="openPaymentModal('${i.id}')">+ Pay</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function setupFilters() {
    ['searchInvoices','filterStatus','filterMonth'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            const search = document.getElementById('searchInvoices')?.value.toLowerCase() || '';
            const status = document.getElementById('filterStatus')?.value || '';
            const month = document.getElementById('filterMonth')?.value || '';
            const filtered = allInvoices.filter(i => {
                if (status && i.status !== status) return false;
                if (month && !i.invoice_number.includes(month.split('-')[0])) return false;
                if (search) {
                    const hay = [i.invoice_number, i.clients?.name].join(' ').toLowerCase();
                    if (!hay.includes(search)) return false;
                }
                return true;
            });
            renderTable(filtered);
        });
    });
}

function setupInvoiceForm() {
    ['invBaseAmount','invGstPercent','invTcsPercent'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', recalcInvoice);
    });
}

function recalcInvoice() {
    const base = parseFloat(document.getElementById('invBaseAmount')?.value) || 0;
    const gstPct = parseFloat(document.getElementById('invGstPercent')?.value) || 5;
    const tcsPct = parseFloat(document.getElementById('invTcsPercent')?.value) || 0;
    const gst = base * (gstPct / 100);
    const tcs = base * (tcsPct / 100);
    const total = base + gst + tcs;
    document.getElementById('invCbBase').textContent = formatINR(base);
    document.getElementById('invCbGst').textContent = formatINR(gst);
    document.getElementById('invCbTcs').textContent = formatINR(tcs);
    document.getElementById('invCbTotal').textContent = formatINR(total);
}

function openNewInvoice() {
    editingInvoiceId = null;
    document.getElementById('invoiceModalTitle').textContent = 'New Invoice';
    document.getElementById('invBaseAmount').value = '';
    document.getElementById('invGstPercent').value = 5;
    document.getElementById('invTcsPercent').value = 0;
    document.getElementById('invNotes').value = '';
    recalcInvoice();
    openModal('invoiceModal');
}

async function saveInvoice(andPdf = false) {
    const userId = await getCurrentUserId();
    const base = parseFloat(document.getElementById('invBaseAmount')?.value) || 0;
    const gstPct = parseFloat(document.getElementById('invGstPercent')?.value) || 5;
    const tcsPct = parseFloat(document.getElementById('invTcsPercent')?.value) || 0;
    const gst = base * (gstPct / 100);
    const tcs = base * (tcsPct / 100);
    const total = base + gst + tcs;

    if (!base) { showToast('Enter base amount', 'error'); return; }

    // Generate invoice number via Supabase function
    const { data: numData } = await window.supabase.rpc('next_invoice_number');

    const payload = {
        invoice_number: numData || `INV-${Date.now()}`,
        client_id: document.getElementById('invClientId')?.value || null,
        itinerary_id: document.getElementById('invItinerary')?.value || null,
        travel_date: document.getElementById('invTravelDate')?.value || null,
        pax_count: parseInt(document.getElementById('invPax')?.value) || 1,
        base_amount: base,
        gst_percent: gstPct,
        gst_amount: gst,
        tcs_percent: tcsPct,
        tcs_amount: tcs,
        total_amount: total,
        status: 'draft',
        due_date: document.getElementById('invDueDate')?.value || null,
        notes: document.getElementById('invNotes')?.value.trim() || null,
        created_by: userId,
    };

    const { data, error } = await window.supabase.from('invoices').insert(payload).select().single();
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Invoice created: ' + data.invoice_number);
    closeModal('invoiceModal');
    if (andPdf) downloadInvoicePdf(data.id);
    await loadInvoices();
}

async function openPaymentModal(invoiceId) {
    const inv = allInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    document.getElementById('payInvoiceRef').textContent = `${inv.invoice_number} — ${inv.clients?.name || ''}`;
    document.getElementById('payBalance').textContent = formatINR(inv.balance);
    document.getElementById('payAmount').value = inv.balance;
    document.getElementById('payRef').value = '';
    document.getElementById('payDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('savePaymentBtn').dataset.invoiceId = invoiceId;
    openModal('paymentModal');
}

async function savePayment() {
    const invoiceId = document.getElementById('savePaymentBtn').dataset.invoiceId;
    const amount = parseFloat(document.getElementById('payAmount')?.value) || 0;
    const userId = await getCurrentUserId();
    if (!amount) { showToast('Enter payment amount', 'error'); return; }

    const { error } = await window.supabase.from('invoice_payments').insert({
        invoice_id: invoiceId,
        amount,
        payment_date: document.getElementById('payDate')?.value || new Date().toISOString().split('T')[0],
        mode: document.getElementById('payMode')?.value,
        reference: document.getElementById('payRef')?.value.trim() || null,
        recorded_by: userId,
    });

    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    // Update invoice status
    const inv = allInvoices.find(i => i.id === invoiceId);
    const newReceived = (inv?.received || 0) + amount;
    const newStatus = newReceived >= (inv?.total_amount || 0) ? 'paid' : 'partial';
    await window.supabase.from('invoices').update({ status: newStatus }).eq('id', invoiceId);

    // Auto-calculate commission when invoice fully paid
    if (newStatus === 'paid' && inv) {
        try {
            const createdBy = inv.created_by;
            const { data: staffRow } = await window.supabase
                .from('staff_profiles')
                .select('commission_percent')
                .eq('user_id', createdBy)
                .single();
            const pct = staffRow?.commission_percent || 0;
            if (pct > 0) {
                const commAmt = Math.round((inv.total_amount * pct) / 100);
                await window.supabase.from('staff_commissions').insert({
                    staff_id: createdBy,
                    invoice_id: invoiceId,
                    commission_percent: pct,
                    commission_amount: commAmt,
                    status: 'pending',
                });
            }
        } catch (_) { /* commission insert is best-effort */ }
    }

    showToast('Payment recorded');
    closeModal('paymentModal');
    await loadInvoices();
}

async function downloadInvoicePdf(invoiceId) {
    const inv = allInvoices.find(i => i.id === invoiceId);
    if (!inv) return;

    // Fetch agency settings for letterhead
    let agency = {};
    try {
        const { data } = await window.supabase
            .from('agency_settings')
            .select('*')
            .limit(1)
            .single();
        if (data) agency = data;
    } catch (_) {}

    // Fetch booking services for line items
    let services = [];
    if (inv.itinerary_id) {
        try {
            const { data } = await window.supabase
                .from('booking_services')
                .select('service_type, vendor_name, amount, notes')
                .eq('itinerary_id', inv.itinerary_id);
            if (data) services = data;
        } catch (_) {}
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4'); // A4 portrait
    const pw = 210; // page width
    const lm = 15;  // left margin
    const rm = 195;  // right margin x
    let y = 15;

    // ── Helper: draw a horizontal line ──────────────────────
    const hLine = (yPos, color) => {
        doc.setDrawColor(...(color || [0, 120, 200]));
        doc.setLineWidth(0.5);
        doc.line(lm, yPos, rm, yPos);
    };

    // ── HEADER BAR ──────────────────────────────────────────
    doc.setFillColor(0, 120, 200);
    doc.rect(0, 0, pw, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(agency.agency_name || 'Travel Agency', lm, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const tagParts = [];
    if (agency.phone) tagParts.push(agency.phone);
    if (agency.email) tagParts.push(agency.email);
    if (agency.website) tagParts.push(agency.website);
    if (tagParts.length) doc.text(tagParts.join('  |  '), lm, 22);
    if (agency.address) doc.text(agency.address, lm, 28);

    // "TAX INVOICE" label right-aligned
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TAX INVOICE', rm, 14, { align: 'right' });

    // ── GSTIN / PAN row ─────────────────────────────────────
    y = 38;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const taxParts = [];
    if (agency.gstin) taxParts.push(`GSTIN: ${agency.gstin}`);
    if (agency.pan_number) taxParts.push(`PAN: ${agency.pan_number}`);
    if (agency.iata_number) taxParts.push(`IATA: ${agency.iata_number}`);
    if (taxParts.length) {
        doc.text(taxParts.join('    |    '), lm, y);
        y += 6;
    }

    // ── INVOICE META (left) + BILL TO (right) ───────────────
    hLine(y, [200, 200, 200]);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Details', lm, y);
    doc.text('Bill To', 115, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice No:  ${inv.invoice_number}`, lm, y);
    doc.text(inv.clients?.name || '—', 115, y);
    y += 5;
    doc.text(`Invoice Date:  ${formatDate(inv.invoice_date || inv.created_at)}`, lm, y);
    if (inv.clients?.phone) doc.text(`Phone: ${inv.clients.phone}`, 115, y);
    y += 5;
    doc.text(`Travel Date:  ${formatDate(inv.travel_date)}`, lm, y);
    y += 5;
    if (inv.due_date) {
        doc.text(`Due Date:  ${formatDate(inv.due_date)}`, lm, y);
        y += 5;
    }
    doc.text(`Pax:  ${inv.pax_count || 1}`, lm, y);
    y += 3;

    // ── LINE ITEMS TABLE ────────────────────────────────────
    y += 4;
    hLine(y, [0, 120, 200]);
    y += 1;

    // Table header
    doc.setFillColor(240, 247, 255);
    doc.rect(lm, y, rm - lm, 7, 'F');
    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('#', lm + 2, y);
    doc.text('Description', lm + 10, y);
    doc.text('HSN/SAC', 110, y);
    doc.text('Amount', rm - 2, y, { align: 'right' });
    y += 4;
    hLine(y, [200, 200, 200]);
    y += 4;

    doc.setFont('helvetica', 'normal');
    // HSN/SAC mapping for common travel services
    const hsnMap = {
        'flight': '996411', 'hotel': '996311', 'transport': '996412',
        'visa': '998599', 'insurance': '997133', 'cruise': '996416',
        'activity': '999799', 'package': '998551', 'train': '996413',
        'other': '998599'
    };

    if (services.length > 0) {
        services.forEach((s, i) => {
            const sType = (s.service_type || 'other').toLowerCase();
            const hsn = hsnMap[sType] || '998599';
            const desc = `${s.service_type || 'Service'}${s.vendor_name ? ' - ' + s.vendor_name : ''}`;
            doc.text(`${i + 1}`, lm + 2, y);
            doc.text(desc.substring(0, 55), lm + 10, y);
            doc.text(hsn, 110, y);
            doc.text(formatINR(s.amount || 0), rm - 2, y, { align: 'right' });
            y += 6;
        });
    } else {
        // Single line item from invoice
        const desc = inv.notes?.split('\n')[0] || 'Travel Services';
        doc.text('1', lm + 2, y);
        doc.text(desc.substring(0, 55), lm + 10, y);
        doc.text('998551', 110, y); // Tour operator SAC
        doc.text(formatINR(inv.base_amount), rm - 2, y, { align: 'right' });
        y += 6;
    }

    hLine(y, [200, 200, 200]);
    y += 5;

    // ── TOTALS (right-aligned block) ────────────────────────
    const labelX = 130;
    const valX = rm - 2;

    doc.setFontSize(9);
    doc.text('Base Amount', labelX, y);
    doc.text(formatINR(inv.base_amount), valX, y, { align: 'right' });
    y += 6;

    doc.text(`GST @ ${inv.gst_percent || 0}%`, labelX, y);
    doc.text(formatINR(inv.gst_amount || 0), valX, y, { align: 'right' });
    y += 6;

    if (inv.tcs_amount > 0) {
        doc.text(`TCS @ ${inv.tcs_percent || 0}%`, labelX, y);
        doc.text(formatINR(inv.tcs_amount), valX, y, { align: 'right' });
        y += 6;
    }

    // Total row
    hLine(y - 2, [0, 120, 200]);
    y += 3;
    doc.setFillColor(0, 120, 200);
    doc.rect(labelX - 2, y - 5, rm - labelX + 4, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', labelX, y);
    doc.text(formatINR(inv.total_amount), valX, y, { align: 'right' });
    y += 10;

    // Amount in words
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text(`Amount in words: ${amountToWords(inv.total_amount)} only`, lm, y);
    y += 6;

    // Payment received
    if (inv.received > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0, 150, 0);
        doc.text(`Received: ${formatINR(inv.received)}`, lm, y);
        if (inv.balance > 0) {
            doc.setTextColor(200, 0, 0);
            doc.text(`Balance Due: ${formatINR(inv.balance)}`, lm + 60, y);
        }
        y += 6;
    }

    // ── BANK DETAILS ────────────────────────────────────────
    if (agency.bank_name || agency.upi_id) {
        y += 2;
        hLine(y, [200, 200, 200]);
        y += 6;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Payment Details', lm, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        if (agency.bank_name) {
            doc.text(`Bank: ${agency.bank_name}`, lm, y); y += 4;
            doc.text(`A/C No: ${agency.bank_account_number || '—'}`, lm, y); y += 4;
            doc.text(`IFSC: ${agency.bank_ifsc || '—'}`, lm, y);
            doc.text(`Type: ${(agency.bank_account_type || 'current').toUpperCase()}`, lm + 60, y);
            y += 4;
        }
        if (agency.upi_id) {
            doc.text(`UPI: ${agency.upi_id}`, lm, y); y += 4;
        }
    }

    // ── TERMS & FOOTER ──────────────────────────────────────
    y += 4;
    hLine(y, [200, 200, 200]);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    const terms = agency.invoice_footer || `Payment due within ${agency.payment_terms_days || 7} days of invoice date. All disputes subject to ${agency.state || 'Karnataka'} jurisdiction.`;
    const splitTerms = doc.splitTextToSize(terms, rm - lm);
    doc.text(splitTerms, lm, y);
    y += splitTerms.length * 3 + 4;

    doc.text('This is a computer-generated invoice and does not require a signature.', pw / 2, y, { align: 'center' });

    // ── SAVE ────────────────────────────────────────────────
    doc.save(`${inv.invoice_number}.pdf`);
}

// ── Convert number to Indian English words ──────────────────
function amountToWords(num) {
    if (!num || num <= 0) return 'Zero';
    num = Math.round(num);
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
        'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

    function twoDigit(n) {
        if (n < 20) return ones[n];
        return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    }
    function threeDigit(n) {
        if (n >= 100) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigit(n % 100) : '');
        return twoDigit(n);
    }

    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const rest = num % 1000;

    let words = '';
    if (crore) words += threeDigit(crore) + ' Crore ';
    if (lakh) words += twoDigit(lakh) + ' Lakh ';
    if (thousand) words += twoDigit(thousand) + ' Thousand ';
    if (rest) words += threeDigit(rest);
    return 'Rupees ' + words.trim();
}
