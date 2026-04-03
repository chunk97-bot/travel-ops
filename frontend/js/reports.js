// ============================================================
// reports.js — Revenue, Bookings, Funnel & Expenses Charts
// ============================================================

let revenueChart = null;
let destChart    = null;
let expenseChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    populateYearFilter();
    document.getElementById('reportYear')?.addEventListener('change', loadAll);
    await loadAll();
});

function getYear() { return parseInt(document.getElementById('reportYear')?.value || new Date().getFullYear()); }

function populateYearFilter() {
    const sel = document.getElementById('reportYear');
    const cur = new Date().getFullYear();
    for (let y = cur; y >= cur - 4; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        if (y === cur) opt.selected = true;
        sel.appendChild(opt);
    }
}

async function loadAll() {
    await Promise.all([
        loadRevenue(),
        loadDestinations(),
        loadFunnel(),
        loadExpenseBreakdown(),
        loadTopClients(),
        loadStaffPerformance(),
        loadPnL(),
    ]);
}

// ── Revenue by Month ─────────────────────────────────────
async function loadRevenue() {
    const year = getYear();
    const from = `${year}-01-01`;
    const to   = `${year}-12-31`;
    const { data } = await window.supabase
        .from('invoices')
        .select('issue_date, total_amount')
        .gte('issue_date', from)
        .lte('issue_date', to)
        .eq('status', 'paid');

    const monthly = Array(12).fill(0);
    (data || []).forEach(inv => {
        const m = new Date(inv.issue_date).getMonth();
        monthly[m] += parseFloat(inv.total_amount) || 0;
    });
    const total = monthly.reduce((a, b) => a + b, 0);
    const totalBookings = await countBookings(year);
    setTxt('kpiRevenue', formatINR(total));
    setTxt('kpiBookings', totalBookings);
    setTxt('kpiAvg', totalBookings ? formatINR(total / totalBookings) : '—');

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenueChart'), {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Revenue (₹)',
                data: monthly,
                backgroundColor: 'rgba(99,102,241,0.7)',
                borderRadius: 4,
            }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
}

async function countBookings(year) {
    const { count } = await window.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`);
    return count || 0;
}

// ── Destinations ─────────────────────────────────────────
async function loadDestinations() {
    const year = getYear();
    const { data } = await window.supabase
        .from('bookings')
        .select('destination')
        .gte('created_at', `${year}-01-01`)
        .lt('created_at', `${year + 1}-01-01`);

    const tally = {};
    (data || []).forEach(b => { if (b.destination) tally[b.destination] = (tally[b.destination] || 0) + 1; });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (destChart) destChart.destroy();
    destChart = new Chart(document.getElementById('destinationsChart'), {
        type: 'bar',
        data: {
            labels: sorted.map(x => x[0]),
            datasets: [{ label: 'Bookings', data: sorted.map(x => x[1]), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 }],
        },
        options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true } },
        },
    });
}

// ── Lead Funnel ───────────────────────────────────────────
async function loadFunnel() {
    const stages = ['new', 'contacted', 'interested', 'proposal_sent', 'converted', 'lost'];
    const labels = ['New', 'Contacted', 'Interested', 'Proposal Sent', 'Converted', 'Lost'];
    const counts = await Promise.all(stages.map(async s => {
        const { count } = await window.supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', s);
        return count || 0;
    }));
    const total = counts[0] || 1;
    const conversion = counts[4] ? ((counts[4] / total) * 100).toFixed(1) : '0';
    setTxt('kpiConversion', conversion + '%');

    const colors = ['#6366f1','#8b5cf6','#06b6d4','#f59e0b','#10b981','#ef4444'];
    const container = document.getElementById('funnelContainer');
    container.innerHTML = stages.map((_, i) => `
        <div class="funnel-row">
            <div class="funnel-label">${labels[i]}</div>
            <div class="funnel-bar-wrap">
                <div class="funnel-bar" style="width:${Math.max(4, (counts[i]/total)*100)}%;background:${colors[i]}"></div>
            </div>
            <div class="funnel-count">${counts[i]}</div>
        </div>
    `).join('');
}

// ── Expense Breakdown ─────────────────────────────────────
async function loadExpenseBreakdown() {
    const year = getYear();
    const { data } = await window.supabase
        .from('expenses')
        .select('category, amount')
        .gte('expense_date', `${year}-01-01`)
        .lt('expense_date', `${year + 1}-01-01`);

    const tally = {};
    (data || []).forEach(e => { if (e.category) tally[e.category] = (tally[e.category] || 0) + (parseFloat(e.amount) || 0); });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

    if (expenseChart) expenseChart.destroy();
    if (!sorted.length) return;
    expenseChart = new Chart(document.getElementById('expenseChart'), {
        type: 'doughnut',
        data: {
            labels: sorted.map(x => x[0].replace(/_/g, ' ')),
            datasets: [{ data: sorted.map(x => x[1]), borderWidth: 0 }],
        },
        options: { plugins: { legend: { position: 'right' } } },
    });
}

// ── Top Clients ───────────────────────────────────────────
async function loadTopClients() {
    const year = getYear();
    const { data } = await window.supabase
        .from('invoices')
        .select('client_id, total_amount, clients(name)')
        .gte('issue_date', `${year}-01-01`)
        .lt('issue_date', `${year + 1}-01-01`)
        .eq('status', 'paid');

    const tally = {};
    (data || []).forEach(inv => {
        const id = inv.client_id;
        if (!tally[id]) tally[id] = { name: inv.clients?.name || id, revenue: 0, count: 0 };
        tally[id].revenue += parseFloat(inv.total_amount) || 0;
        tally[id].count++;
    });
    const sorted = Object.values(tally).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const tbody = document.getElementById('topClientsBody');
    tbody.innerHTML = sorted.map((c, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escHtml(c.name)}</td>
            <td>${c.count}</td>
            <td>${formatINR(c.revenue)}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="empty-state">No data</td></tr>';
}

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

// ── CSV Export ────────────────────────────────────────────
async function exportReport() {
    const year = getYear();
    const { data } = await window.supabase
        .from('invoices')
        .select('invoice_number, issue_date, total_amount, status, clients(name)')
        .gte('issue_date', `${year}-01-01`)
        .lt('issue_date', `${year + 1}-01-01`)
        .order('issue_date');

    const rows = [['Invoice No', 'Date', 'Client', 'Amount', 'Status']];
    (data || []).forEach(r => rows.push([r.invoice_number, r.issue_date, r.clients?.name || '', r.total_amount, r.status]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `revenue-report-${year}.csv`; a.click();
}

// ============================================================
// Enhancement #6 — Staff Performance Board
// ============================================================
async function loadStaffPerformance() {
    const container = document.getElementById('staffPerformanceBody');
    if (!container) return;
    const year = getYear();
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;

    const [staffData, leadsData, bookingsData, invoicesData] = await Promise.all([
        window.supabase.from('staff_profiles').select('id, name, role').eq('is_active', true),
        window.supabase.from('leads').select('id, stage, assigned_to').gte('created_at', from).lt('created_at', to),
        window.supabase.from('bookings').select('id, created_by').gte('created_at', from).lt('created_at', to),
        window.supabase.from('invoices').select('total_amount, created_by, status').in('status', ['paid','partial']).gte('created_at', from).lt('created_at', to),
    ]);

    const staff = staffData.data || [];
    const leads = leadsData.data || [];
    const bookings = bookingsData.data || [];
    const invoices = invoicesData.data || [];

    const board = staff.map(s => {
        const myLeads = leads.filter(l => l.assigned_to === s.id);
        const myConfirmed = myLeads.filter(l => l.stage === 'confirmed').length;
        const myBookings = bookings.filter(b => b.created_by === s.id).length;
        const myRevenue = invoices.filter(i => i.created_by === s.id).reduce((sum, i) => sum + (i.total_amount || 0), 0);
        const convRate = myLeads.length > 0 ? ((myConfirmed / myLeads.length) * 100).toFixed(0) : 0;
        return { name: s.name, role: s.role, leads: myLeads.length, confirmed: myConfirmed, bookings: myBookings, revenue: myRevenue, convRate };
    }).sort((a, b) => b.revenue - a.revenue);

    container.innerHTML = board.length ? board.map((s, i) => `
        <tr>
            <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
            <td><strong>${escHtml(s.name)}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${escHtml(s.role)}</span></td>
            <td>${s.leads}</td>
            <td>${s.confirmed}</td>
            <td>${s.convRate}%</td>
            <td>${s.bookings}</td>
            <td>${formatINR(s.revenue)}</td>
        </tr>
    `).join('') : '<tr><td colspan="7" class="empty-state">No staff data</td></tr>';
}

// ============================================================
// Enhancement #13 — Backup & Export (CSV for any table)
// ============================================================
async function exportTable(tableName, columns, filename) {
    const { data, error } = await window.supabase.from(tableName).select(columns.map(c => c.key).join(', ')).order('created_at', { ascending: false });
    if (error || !data?.length) { showToast('No data to export', 'error'); return; }

    const header = columns.map(c => c.label);
    const rows = data.map(row => columns.map(c => {
        const val = c.key.includes('.') ? c.key.split('.').reduce((o, k) => o?.[k], row) : row[c.key];
        return String(val ?? '').replace(/"/g, '""');
    }));

    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast(`Exported ${data.length} rows`);
}

function exportLeads() {
    exportTable('leads', [
        { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'destination', label: 'Destination' }, { key: 'travel_date', label: 'Travel Date' },
        { key: 'stage', label: 'Stage' }, { key: 'source', label: 'Source' }, { key: 'budget_range', label: 'Budget' },
        { key: 'created_at', label: 'Created' },
    ], 'leads-export');
}

function exportClients() {
    exportTable('clients', [
        { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
        { key: 'city', label: 'City' }, { key: 'segment', label: 'Segment' },
        { key: 'total_revenue', label: 'Revenue' }, { key: 'total_trips', label: 'Trips' },
        { key: 'created_at', label: 'Since' },
    ], 'clients-export');
}

function exportInvoices() {
    exportTable('invoices', [
        { key: 'invoice_number', label: 'Invoice No' }, { key: 'total_amount', label: 'Amount' },
        { key: 'gst_amount', label: 'GST' }, { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Date' },
    ], 'invoices-export');
}

function exportExpenses() {
    exportTable('expenses', [
        { key: 'expense_date', label: 'Date' }, { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount' },
        { key: 'paid_to', label: 'Paid To' }, { key: 'mode', label: 'Mode' },
    ], 'expenses-export');
}

// ============================================================
// P&L Statement
// ============================================================
let pnlChart = null;
let pnlData = [];

async function loadPnL() {
    const year = getYear();
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const [invoicesRes, vendorRes, expensesRes, commissionsRes] = await Promise.all([
        window.supabase.from('invoices').select('issue_date, total_amount').gte('issue_date', from).lte('issue_date', to).eq('status', 'paid'),
        window.supabase.from('vendor_payments').select('payment_date, amount_inr, amount, status').gte('payment_date', from).lte('payment_date', to).eq('status', 'paid'),
        window.supabase.from('expenses').select('expense_date, amount').gte('expense_date', from).lte('expense_date', to),
        window.supabase.from('staff_commissions').select('created_at, amount, status').gte('created_at', from).lte('created_at', `${year + 1}-01-01`).in('status', ['approved', 'paid']),
    ]);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const revenue = Array(12).fill(0);
    const vendorCosts = Array(12).fill(0);
    const expenses = Array(12).fill(0);

    (invoicesRes.data || []).forEach(i => { revenue[new Date(i.issue_date).getMonth()] += parseFloat(i.total_amount) || 0; });
    (vendorRes.data || []).forEach(v => { vendorCosts[new Date(v.payment_date).getMonth()] += parseFloat(v.amount_inr || v.amount) || 0; });
    (expensesRes.data || []).forEach(e => { expenses[new Date(e.expense_date).getMonth()] += parseFloat(e.amount) || 0; });
    (commissionsRes.data || []).forEach(c => { expenses[new Date(c.created_at).getMonth()] += parseFloat(c.amount) || 0; });

    const totalRevenue = revenue.reduce((a, b) => a + b, 0);
    const totalVendor = vendorCosts.reduce((a, b) => a + b, 0);
    const totalExpenses = expenses.reduce((a, b) => a + b, 0);
    const netProfit = totalRevenue - totalVendor - totalExpenses;

    setTxt('pnlRevenue', formatINR(totalRevenue));
    setTxt('pnlVendorCosts', formatINR(totalVendor));
    setTxt('pnlExpenses', formatINR(totalExpenses));
    const profitEl = document.getElementById('pnlNetProfit');
    if (profitEl) {
        profitEl.textContent = formatINR(netProfit);
        profitEl.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    // Monthly table
    pnlData = months.map((m, i) => {
        const profit = revenue[i] - vendorCosts[i] - expenses[i];
        const margin = revenue[i] > 0 ? ((profit / revenue[i]) * 100).toFixed(1) : '0.0';
        return { month: m, revenue: revenue[i], costs: vendorCosts[i], expenses: expenses[i], profit, margin };
    });
    const tbody = document.getElementById('pnlTableBody');
    if (tbody) {
        tbody.innerHTML = pnlData.map(r => `
            <tr>
                <td>${r.month}</td>
                <td>${formatINR(r.revenue)}</td>
                <td style="color:var(--danger)">${formatINR(r.costs)}</td>
                <td style="color:var(--warning)">${formatINR(r.expenses)}</td>
                <td style="color:${r.profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700">${formatINR(r.profit)}</td>
                <td>${r.margin}%</td>
            </tr>
        `).join('');
    }

    // Chart
    if (pnlChart) pnlChart.destroy();
    const ctx = document.getElementById('pnlChart');
    if (ctx) {
        pnlChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Revenue', data: revenue, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
                    { label: 'Vendor Costs', data: vendorCosts, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 },
                    { label: 'Expenses', data: expenses, backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 4 },
                    { label: 'Net Profit', data: pnlData.map(r => r.profit), type: 'line', borderColor: '#6366f1', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 3 },
                ],
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } },
            },
        });
    }
}

function exportPnL() {
    if (!pnlData.length) { showToast('No P&L data', 'error'); return; }
    const rows = [['Month','Revenue','Vendor Costs','Expenses','Net Profit','Margin %']];
    pnlData.forEach(r => rows.push([r.month, r.revenue, r.costs, r.expenses, r.profit, r.margin]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pnl-report-${getYear()}.csv`; a.click();
    showToast('P&L exported');
}
