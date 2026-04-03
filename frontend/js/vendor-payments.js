// ============================================================
// vendor-payments.js — Track what you owe/paid vendors (multi-currency)
// ============================================================

let allVendorPayments = [];
let allVendors = [];

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadVendors(), loadPayments()]);
    // Populate currency dropdown from auth.js helper
    if (typeof buildCurrencySelect === 'function') buildCurrencySelect(document.getElementById('vpCurrency'), 'INR');
    document.getElementById('addVPBtn')?.addEventListener('click', openAddPayment);
    document.getElementById('closeVPModal')?.addEventListener('click', () => closeModal('vpModal'));
    document.getElementById('cancelVPBtn')?.addEventListener('click', () => closeModal('vpModal'));
    document.getElementById('vpModalOverlay')?.addEventListener('click', () => closeModal('vpModal'));
    document.getElementById('saveVPBtn')?.addEventListener('click', savePayment);
    document.getElementById('searchVP')?.addEventListener('input', applyFilters);
    document.getElementById('filterVPStatus')?.addEventListener('change', applyFilters);
    document.getElementById('filterVPVendor')?.addEventListener('change', applyFilters);
    document.getElementById('vpAmount')?.addEventListener('input', recalcTds);
    document.getElementById('vpTdsPct')?.addEventListener('input', recalcTds);
});

async function loadVendors() {
    const { data } = await window.supabase.from('vendors').select('id, name').order('name');
    allVendors = data || [];
    const sel = document.getElementById('filterVPVendor');
    const sel2 = document.getElementById('vpVendorId');
    if (sel) sel.innerHTML = '<option value="">All Vendors</option>' + allVendors.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
    if (sel2) sel2.innerHTML = '<option value="">— Select Vendor —</option>' + allVendors.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
}

async function loadPayments() {
    const { data } = await window.supabase
        .from('vendor_payments')
        .select('*, vendors(name), bookings(booking_ref, destination)')
        .order('created_at', { ascending: false });
    allVendorPayments = data || [];
    renderStats();
    renderTable(allVendorPayments);
}

function renderStats() {
    const pending  = allVendorPayments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount_inr || p.net_payable || 0), 0);
    const overdue  = allVendorPayments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < new Date().toISOString().split('T')[0]);
    const paidMth  = allVendorPayments.filter(p => p.status === 'paid' && p.payment_date?.startsWith(new Date().toISOString().slice(0,7))).reduce((s, p) => s + (p.amount_inr || p.amount || 0), 0);
    const tdsTotal = allVendorPayments.reduce((s, p) => s + (p.tds_amount || 0), 0);

    const setEl = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    setEl('vpTotalPaid', `<strong>${formatINR(paidMth)}</strong>`);
    setEl('vpTotalTds', `<strong>${formatINR(tdsTotal)}</strong>`);
    setEl('vpPending', `<strong>${formatINR(pending)}</strong>`);
    setEl('vpVendorCount', `<strong>${new Set(allVendorPayments.filter(p => p.status === 'paid').map(p => p.vendor_id)).size}</strong>`);
}

function applyFilters() {
    const q      = document.getElementById('searchVP')?.value.toLowerCase() || '';
    const status = document.getElementById('filterVPStatus')?.value || '';
    const vendor = document.getElementById('filterVPVendor')?.value || '';
    const today  = new Date().toISOString().split('T')[0];
    const filtered = allVendorPayments.filter(p => {
        if (status === 'overdue') return p.status !== 'paid' && p.due_date && p.due_date < today;
        if (status && p.status !== status) return false;
        if (vendor && p.vendor_id !== vendor) return false;
        if (q) {
            const hay = [p.vendors?.name, p.bookings?.booking_ref, p.bookings?.destination, p.reference].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderTable(filtered);
}

function renderTable(payments) {
    const tbody = document.getElementById('vpTable');
    const today = new Date().toISOString().split('T')[0];
    if (!payments.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No payments found</td></tr>'; return; }
    tbody.innerHTML = payments.map(p => {
        const isOverdue = p.status !== 'paid' && p.due_date && p.due_date < today;
        const cur = p.currency || 'INR';
        const showCur = cur !== 'INR';
        return `<tr ${isOverdue ? 'style="background:rgba(239,68,68,0.05)"' : ''}>
            <td>${p.payment_date ? formatDate(p.payment_date) : '—'}</td>
            <td>${escHtml(p.vendors?.name || '—')}</td>
            <td>${escHtml(p.bookings?.booking_ref || '—')}<br><small>${escHtml(p.bookings?.destination || '')}</small></td>
            <td>${showCur ? formatCurrency(p.original_amount || p.amount, cur) : formatINR(p.amount)}${showCur ? `<br><small style="color:var(--text-muted)">${formatINR(p.amount_inr || p.amount)}</small>` : ''}</td>
            <td>${p.tds_amount > 0 ? formatINR(p.tds_amount) : '—'}</td>
            <td><strong>${formatINR(p.net_payable || p.amount)}</strong></td>
            <td>${p.mode || '—'}</td>
            <td>${escHtml(p.reference || '—')}</td>
            <td>${p.due_date ? `<span ${isOverdue ? 'style="color:var(--danger)"' : ''}>${formatDate(p.due_date)}</span>` : '—'}</td>
            <td><span class="badge badge-${p.status}">${p.status}</span></td>
            <td>
                ${p.status !== 'paid' ? `<button class="btn-success" style="padding:3px 8px;font-size:0.78rem" onclick="markPaid('${p.id}')">Mark Paid</button>` : ''}
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="deleteVP('${p.id}')">&times;</button>
            </td>
        </tr>`;
    }).join('');
}

// Currency change handler
function onCurrencyChange() {
    const cur = document.getElementById('vpCurrency')?.value || 'INR';
    const rate = getExchangeRate(cur);
    document.getElementById('vpExRate').value = rate;
    recalcTds();
}

function recalcTds() {
    const amount = parseFloat(document.getElementById('vpAmount')?.value) || 0;
    const tds = parseFloat(document.getElementById('vpTdsPct')?.value) || 0;
    const exRate = parseFloat(document.getElementById('vpExRate')?.value) || 1;
    const cur = document.getElementById('vpCurrency')?.value || 'INR';
    const tdsAmt = amount * (tds / 100);
    const net = amount - tdsAmt;
    const amountINR = amount * exRate;
    document.getElementById('vpTdsAmt').textContent = formatCurrency(tdsAmt, cur);
    const netEl = document.getElementById('vpNetAmt');
    if (netEl) netEl.textContent = formatCurrency(net, cur);
    const inrEl = document.getElementById('vpAmountINR');
    if (inrEl) inrEl.textContent = cur !== 'INR' ? formatINR(amountINR) : '—';
}

function openAddPayment() {
    document.getElementById('vpAmount').value = '';
    document.getElementById('vpTdsPct').value = '0';
    document.getElementById('vpDueDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('vpDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('vpTdsAmt').textContent = '₹0';
    const netEl = document.getElementById('vpNetAmt');
    if (netEl) netEl.textContent = '₹0';
    const inrEl = document.getElementById('vpAmountINR');
    if (inrEl) inrEl.textContent = '—';
    if (typeof buildCurrencySelect === 'function') buildCurrencySelect(document.getElementById('vpCurrency'), 'INR');
    document.getElementById('vpExRate').value = 1;
    openModal('vpModal');
}

async function savePayment() {
    const vendorId = document.getElementById('vpVendorId')?.value;
    const amount = parseFloat(document.getElementById('vpAmount')?.value) || 0;
    if (!vendorId || !amount) { showToast('Vendor and amount required', 'error'); return; }
    const currency = document.getElementById('vpCurrency')?.value || 'INR';
    const exchangeRate = parseFloat(document.getElementById('vpExRate')?.value) || 1;
    const tdsPct = parseFloat(document.getElementById('vpTdsPct')?.value) || 0;
    const tdsAmt = amount * (tdsPct / 100);
    const amountINR = currency !== 'INR' ? amount * exchangeRate : amount;

    const payload = {
        vendor_id: vendorId,
        booking_id: document.getElementById('vpBookingId')?.value || null,
        amount: currency === 'INR' ? amount : amountINR,
        original_amount: currency !== 'INR' ? amount : null,
        currency: currency,
        exchange_rate: currency !== 'INR' ? exchangeRate : null,
        amount_inr: amountINR,
        tds_percent: tdsPct,
        tds_amount: tdsAmt * (currency !== 'INR' ? exchangeRate : 1),
        net_payable: amountINR - (tdsAmt * (currency !== 'INR' ? exchangeRate : 1)),
        payment_date: document.getElementById('vpDate')?.value || null,
        due_date: document.getElementById('vpDueDate')?.value || null,
        mode: document.getElementById('vpMode')?.value || null,
        reference: document.getElementById('vpRef')?.value.trim() || null,
        status: 'pending',
        notes: document.getElementById('vpNotes')?.value.trim() || null,
        created_by: await getCurrentUserId(),
    };
    const { error } = await window.supabase.from('vendor_payments').insert(payload);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Payment entry added');
    closeModal('vpModal');
    await loadPayments();
}

async function markPaid(paymentId) {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await window.supabase.from('vendor_payments').update({ status: 'paid', payment_date: today }).eq('id', paymentId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Marked as paid');
    await loadPayments();
}

async function deleteVP(paymentId) {
    if (!confirm('Delete this payment entry?')) return;
    const { error } = await window.supabase.from('vendor_payments').delete().eq('id', paymentId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Deleted');
    await loadPayments();
}
