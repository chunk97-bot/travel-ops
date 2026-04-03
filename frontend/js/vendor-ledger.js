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
    renderAging();
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
                <button class="btn-primary" style="padding:4px 10px;font-size:0.78rem;margin-left:4px"
                    onclick="reconcileVendor('${r.id}')">Reconcile</button>
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

// ============================================================
// Enhancement #11 — Expense Reconciliation
// ============================================================
async function reconcileVendor(vendorId) {
    const vendor = allVendorRows.find(r => r.id === vendorId);
    if (!vendor) return;

    const { data: services } = await window.supabase
        .from('booking_services')
        .select('id, description, cost_price, service_type, bookings(booking_ref)')
        .eq('vendor_id', vendorId);

    const totalServicesCost = (services || []).reduce((s, svc) => s + (svc.cost_price || 0), 0);
    const diff = totalServicesCost - vendor.totalBilled;

    document.getElementById('drawerVendorName').textContent = vendor.name + ' — Reconciliation';
    const body = document.getElementById('ledgerDrawerBody');
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
            <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center">
                <div style="font-size:0.78rem;color:var(--text-muted)">Services Owed</div>
                <div style="font-size:1.2rem;font-weight:700">${formatINR(totalServicesCost)}</div>
            </div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center">
                <div style="font-size:0.78rem;color:var(--text-muted)">Billed</div>
                <div style="font-size:1.2rem;font-weight:700">${formatINR(vendor.totalBilled)}</div>
            </div>
            <div style="background:var(--bg-input);padding:12px;border-radius:8px;text-align:center">
                <div style="font-size:0.78rem;color:var(--text-muted)">Discrepancy</div>
                <div style="font-size:1.2rem;font-weight:700;color:${Math.abs(diff) < 1 ? 'var(--success)' : 'var(--danger)'}">${formatINR(diff)}</div>
            </div>
        </div>
        <h4 style="margin-bottom:8px;font-size:0.88rem;color:var(--text-muted)">Linked Booking Services</h4>
        ${(services || []).length ? services.map(svc => `
            <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                <strong>${escHtml(svc.service_type)}</strong> — ${escHtml(svc.description || '')}
                ${svc.bookings ? `<span style="color:var(--text-muted);margin-left:6px">(${escHtml(svc.bookings.booking_ref)})</span>` : ''}
                <span style="float:right;font-weight:700">${formatINR(svc.cost_price)}</span>
            </div>
        `).join('') : '<p style="color:var(--text-muted)">No services linked to this vendor</p>'}
    `;
    document.getElementById('ledgerDrawer').classList.remove('hidden');
    document.getElementById('ledgerDrawerOverlay').classList.remove('hidden');
}

// ============================================================
// Aging Analysis
// ============================================================
async function renderAging() {
    const { data: payments } = await window.supabase
        .from('vendor_payments')
        .select('amount, amount_inr, due_date, status')
        .neq('status', 'paid');

    const today = new Date();
    const buckets = { d030: [], d3160: [], d6190: [], d90plus: [] };

    (payments || []).forEach(p => {
        if (!p.due_date) return;
        const due = new Date(p.due_date);
        const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
        const amt = parseFloat(p.amount_inr || p.amount) || 0;
        if (diffDays <= 30) buckets.d030.push(amt);
        else if (diffDays <= 60) buckets.d3160.push(amt);
        else if (diffDays <= 90) buckets.d6190.push(amt);
        else buckets.d90plus.push(amt);
    });

    const sum = arr => arr.reduce((a, b) => a + b, 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('aging030', formatINR(sum(buckets.d030)));
    set('aging030Count', buckets.d030.length + ' payments');
    set('aging3160', formatINR(sum(buckets.d3160)));
    set('aging3160Count', buckets.d3160.length + ' payments');
    set('aging6190', formatINR(sum(buckets.d6190)));
    set('aging6190Count', buckets.d6190.length + ' payments');
    set('aging90plus', formatINR(sum(buckets.d90plus)));
    set('aging90plusCount', buckets.d90plus.length + ' payments');
}
