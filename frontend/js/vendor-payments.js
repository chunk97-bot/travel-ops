// ============================================================
// vendor-payments.js — Track what you owe/paid vendors
// ============================================================

let allVendorPayments = [];
let allVendors = [];

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadVendors(), loadPayments()]);
    document.getElementById('addPaymentBtn')?.addEventListener('click', openAddPayment);
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
    const pending  = allVendorPayments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.net_payable || 0), 0);
    const overdue  = allVendorPayments.filter(p => p.status !== 'paid' && p.due_date && p.due_date < new Date().toISOString().split('T')[0]);
    const paidMth  = allVendorPayments.filter(p => p.status === 'paid' && p.payment_date?.startsWith(new Date().toISOString().slice(0,7))).reduce((s, p) => s + (p.amount || 0), 0);
    document.getElementById('vpPending').innerHTML = `<strong>${formatINR(pending)}</strong> Pending`;
    document.getElementById('vpOverdue').innerHTML = `<strong>${overdue.length}</strong> Overdue`;
    document.getElementById('vpPaidMonth').innerHTML = `<strong>${formatINR(paidMth)}</strong> Paid this month`;
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
    if (!payments.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No payments found</td></tr>'; return; }
    tbody.innerHTML = payments.map(p => {
        const isOverdue = p.status !== 'paid' && p.due_date && p.due_date < today;
        return `<tr ${isOverdue ? 'style="background:rgba(239,68,68,0.05)"' : ''}>
            <td>${escHtml(p.vendors?.name || '—')}</td>
            <td>${escHtml(p.bookings?.booking_ref || '—')}<br><small>${escHtml(p.bookings?.destination || '')}</small></td>
            <td>${formatINR(p.amount)}</td>
            <td>${p.tds_amount > 0 ? formatINR(p.tds_amount) : '—'}</td>
            <td><strong>${formatINR(p.net_payable || p.amount)}</strong></td>
            <td>${p.due_date ? `<span ${isOverdue ? 'style="color:var(--danger)"' : ''}>${formatDate(p.due_date)}</span>` : '—'}</td>
            <td>${p.payment_date ? formatDate(p.payment_date) : '—'}</td>
            <td><span class="badge badge-${p.status}">${p.status}</span></td>
            <td>
                ${p.status !== 'paid' ? `<button class="btn-success" style="padding:3px 8px;font-size:0.78rem" onclick="markPaid('${p.id}')">Mark Paid</button>` : ''}
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="deleteVP('${p.id}')">✕</button>
            </td>
        </tr>`;
    }).join('');
}

function recalcTds() {
    const amount = parseFloat(document.getElementById('vpAmount')?.value) || 0;
    const tds = parseFloat(document.getElementById('vpTdsPct')?.value) || 0;
    const tdsAmt = amount * (tds / 100);
    const net = amount - tdsAmt;
    document.getElementById('vpTdsAmt').textContent = formatINR(tdsAmt);
    document.getElementById('vpNetPayable').textContent = formatINR(net);
}

function openAddPayment() {
    document.getElementById('vpForm').reset();
    document.getElementById('vpDueDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('vpTdsAmt').textContent = '₹0';
    document.getElementById('vpNetPayable').textContent = '₹0';
    openModal('vpModal');
}

async function savePayment() {
    const vendorId = document.getElementById('vpVendorId')?.value;
    const amount = parseFloat(document.getElementById('vpAmount')?.value) || 0;
    if (!vendorId || !amount) { showToast('Vendor and amount required', 'error'); return; }
    const tdsPct = parseFloat(document.getElementById('vpTdsPct')?.value) || 0;
    const tdsAmt = amount * (tdsPct / 100);
    const payload = {
        vendor_id: vendorId,
        booking_id: document.getElementById('vpBookingId')?.value || null,
        amount,
        tds_percent: tdsPct,
        tds_amount: tdsAmt,
        net_payable: amount - tdsAmt,
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
