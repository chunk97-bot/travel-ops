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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('TAX INVOICE', 20, 20);
    doc.setFontSize(11); doc.text(`Invoice No: ${inv.invoice_number}`, 20, 35);
    doc.text(`Date: ${formatDate(inv.invoice_number)}`, 20, 43);
    doc.text(`Client: ${inv.clients?.name || '—'}`, 20, 51);
    doc.text(`Travel Date: ${formatDate(inv.travel_date)}`, 20, 59);
    doc.text('─'.repeat(70), 20, 65);
    doc.text(`Base Amount:  ${formatINR(inv.base_amount)}`, 20, 75);
    doc.text(`GST (${inv.gst_percent}%):    ${formatINR(inv.gst_amount)}`, 20, 83);
    if (inv.tcs_amount > 0) doc.text(`TCS (${inv.tcs_percent}%):    ${formatINR(inv.tcs_amount)}`, 20, 91);
    doc.text('─'.repeat(70), 20, 98);
    doc.setFontSize(13); doc.text(`TOTAL:  ${formatINR(inv.total_amount)}`, 20, 108);
    doc.save(`${inv.invoice_number}.pdf`);
}
