// ============================================================
// vendor-ledger.js — Running balance owed per vendor
// ============================================================

let allVendorRows = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadVendorLedger();
    document.getElementById('searchVendors')?.addEventListener('input', filterLedger);
    document.getElementById('closeLedgerDrawer')?.addEventListener('click', closeLedgerDrawer);
    document.getElementById('ledgerDrawerOverlay')?.addEventListener('click', closeLedgerDrawer);
});

async function loadVendorLedger() {
    // Fetch all vendors
    const { data: vendors, error: vErr } = await window.supabase
        .from('vendors')
        .select('id, name, category, phone, email')
        .order('name');
    if (vErr) { showToast('Failed to load vendors', 'error'); return; }

    // Fetch vendor payments (billed amounts per vendor)
    const { data: payments } = await window.supabase
        .from('vendor_payments')
        .select('vendor_id, amount, paid_amount, payment_date, description, status');

    // Build per-vendor ledger
    allVendorRows = (vendors || []).map(v => {
        const vPayments = (payments || []).filter(p => p.vendor_id === v.id);
        const totalBilled = vPayments.reduce((s, p) => s + (p.amount || 0), 0);
        const totalPaid = vPayments.reduce((s, p) => s + (p.paid_amount || 0), 0);
        const balance = totalBilled - totalPaid;
        const lastDate = vPayments.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))[0]?.payment_date;
        return { ...v, totalBilled, totalPaid, balance, lastDate, payments: vPayments };
    });

    renderLedger(allVendorRows);
    renderSummary(allVendorRows);
}

function renderSummary(rows) {
    const totalBilled = rows.reduce((s, r) => s + r.totalBilled, 0);
    const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
    const outstanding = rows.reduce((s, r) => s + r.balance, 0);
    const withBalance = rows.filter(r => r.balance > 0).length;
    document.getElementById('totalBilled').textContent = formatINR(totalBilled);
    document.getElementById('totalPaid').textContent = formatINR(totalPaid);
    document.getElementById('totalOutstanding').textContent = formatINR(outstanding);
    document.getElementById('vendorCount').textContent = withBalance;
}

function filterLedger() {
    const q = document.getElementById('searchVendors')?.value.toLowerCase() || '';
    const filtered = allVendorRows.filter(r =>
        !q || r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q)
    );
    renderLedger(filtered);
}

function renderLedger(rows) {
    const tbody = document.getElementById('ledgerBody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No vendors found</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>
                <strong>${escHtml(r.name)}</strong>
                ${r.phone ? `<div style="font-size:0.78rem;color:var(--text-muted)">${escHtml(r.phone)}</div>` : ''}
            </td>
            <td>${escHtml(r.category || '—')}</td>
            <td>${formatINR(r.totalBilled)}</td>
            <td style="color:var(--success)">${formatINR(r.totalPaid)}</td>
            <td style="${r.balance > 0 ? 'color:var(--danger);font-weight:700' : 'color:var(--text-muted)'}">
                ${formatINR(r.balance)}
            </td>
            <td>${r.lastDate ? formatDate(r.lastDate) : '—'}</td>
            <td>
                <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem"
                    onclick="openVendorBreakdown('${r.id}')">Breakdown</button>
            </td>
        </tr>
    `).join('');
}

function openVendorBreakdown(vendorId) {
    const vendor = allVendorRows.find(r => r.id === vendorId);
    if (!vendor) return;

    document.getElementById('drawerVendorName').textContent = vendor.name + ' — Breakdown';
    const body = document.getElementById('ledgerDrawerBody');

    if (!vendor.payments.length) {
        body.innerHTML = '<p style="color:var(--text-muted)">No payment records for this vendor.</p>';
    } else {
        const sorted = [...vendor.payments].sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
        let runningBalance = 0;
        const rows = sorted.reverse().map(p => {
            runningBalance += (p.amount || 0) - (p.paid_amount || 0);
            return { ...p, runningBalance };
        }).reverse();

        body.innerHTML = `
            <table class="data-table" style="font-size:0.83rem">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Billed</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(p => `
                        <tr>
                            <td>${formatDate(p.payment_date)}</td>
                            <td>${escHtml(p.description || '—')}</td>
                            <td>${formatINR(p.amount)}</td>
                            <td style="color:var(--success)">${formatINR(p.paid_amount)}</td>
                            <td style="${p.runningBalance > 0 ? 'color:var(--danger)' : ''}">${formatINR(p.runningBalance)}</td>
                            <td><span class="badge">${escHtml(p.status || 'pending')}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr style="border-top:2px solid var(--border);font-weight:700">
                        <td colspan="2">Total</td>
                        <td>${formatINR(vendor.totalBilled)}</td>
                        <td style="color:var(--success)">${formatINR(vendor.totalPaid)}</td>
                        <td style="${vendor.balance > 0 ? 'color:var(--danger)' : ''}">${formatINR(vendor.balance)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

    document.getElementById('ledgerDrawer').classList.remove('hidden');
    document.getElementById('ledgerDrawerOverlay').classList.remove('hidden');
}

function closeLedgerDrawer() {
    document.getElementById('ledgerDrawer').classList.add('hidden');
    document.getElementById('ledgerDrawerOverlay').classList.add('hidden');
}
