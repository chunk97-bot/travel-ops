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
