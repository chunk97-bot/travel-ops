// ============================================================
// revenue-trends.js — Revenue Trends Dashboard + Pipeline Value
// ============================================================

async function initRevenueTrends(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:14px;align-items:center">
            <select id="trendYear" class="filter-select" style="width:auto" onchange="loadTrendData()">
                ${Array.from({length: 5}, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return `<option value="${y}" ${i === 0 ? 'selected' : ''}>${y}</option>`;
                }).join('')}
            </select>
            <span style="color:var(--text-muted);font-size:0.85rem">Revenue trend by month</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px" id="trendKpis"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div class="chart-card"><h3 style="font-size:0.92rem;margin-bottom:10px">Monthly Revenue</h3><canvas id="trendChart" height="220"></canvas></div>
            <div class="chart-card"><h3 style="font-size:0.92rem;margin-bottom:10px">Revenue vs Expenses</h3><canvas id="revenueVsExpenseChart" height="220"></canvas></div>
        </div>
    `;

    await loadTrendData();
}

let _trendChart = null;
let _rveChart = null;

async function loadTrendData() {
    const year = parseInt(document.getElementById('trendYear')?.value || new Date().getFullYear());
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;

    const [revenue, expenses] = await Promise.all([
        window.supabase.from('invoices').select('issue_date, total_amount, status').gte('issue_date', from).lt('issue_date', to),
        window.supabase.from('expenses').select('expense_date, amount').gte('expense_date', from).lt('expense_date', to),
    ]);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const revMonthly = Array(12).fill(0);
    const expMonthly = Array(12).fill(0);

    (revenue.data || []).filter(i => i.status === 'paid' || i.status === 'partial')
        .forEach(i => { revMonthly[new Date(i.issue_date).getMonth()] += parseFloat(i.total_amount) || 0; });
    (expenses.data || []).forEach(e => { expMonthly[new Date(e.expense_date).getMonth()] += parseFloat(e.amount) || 0; });

    const totalRev = revMonthly.reduce((a, b) => a + b, 0);
    const totalExp = expMonthly.reduce((a, b) => a + b, 0);
    const profit = totalRev - totalExp;
    const curMonth = new Date().getMonth();
    const prevMonthRev = curMonth > 0 ? revMonthly[curMonth - 1] : 0;
    const curMonthRev = revMonthly[curMonth];
    const growth = prevMonthRev > 0 ? (((curMonthRev - prevMonthRev) / prevMonthRev) * 100).toFixed(1) : '—';

    const kpis = document.getElementById('trendKpis');
    if (kpis) {
        kpis.innerHTML = `
            <div class="stat-card"><div class="stat-info"><div class="stat-label">Total Revenue</div><div class="stat-value">${formatINR(totalRev)}</div></div></div>
            <div class="stat-card"><div class="stat-info"><div class="stat-label">Total Expenses</div><div class="stat-value" style="color:var(--danger)">${formatINR(totalExp)}</div></div></div>
            <div class="stat-card"><div class="stat-info"><div class="stat-label">Net Profit</div><div class="stat-value" style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatINR(profit)}</div></div></div>
            <div class="stat-card"><div class="stat-info"><div class="stat-label">MoM Growth</div><div class="stat-value">${growth}%</div></div></div>
        `;
    }

    // Revenue trend chart
    if (_trendChart) _trendChart.destroy();
    const ctx1 = document.getElementById('trendChart');
    if (ctx1 && typeof Chart !== 'undefined') {
        _trendChart = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Revenue',
                    data: revMonthly,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 4,
                }],
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
    }

    // Revenue vs Expenses
    if (_rveChart) _rveChart.destroy();
    const ctx2 = document.getElementById('revenueVsExpenseChart');
    if (ctx2 && typeof Chart !== 'undefined') {
        _rveChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Revenue', data: revMonthly, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 3 },
                    { label: 'Expenses', data: expMonthly, backgroundColor: 'rgba(239,68,68,0.5)', borderRadius: 3 },
                ],
            },
            options: { plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } },
        });
    }
}

// ============================================================
// Booking Pipeline Value — shows ₹ value at each stage
// ============================================================
async function initPipelineValue(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const { data: leads } = await window.supabase.from('leads').select('stage, budget_range');
    if (!leads?.length) { el.innerHTML = '<p class="empty-state">No leads in pipeline</p>'; return; }

    const budgetMap = { 'under1L': 50000, '1L-3L': 200000, '3L-6L': 450000, '6L-10L': 800000, '10L+': 1500000 };
    const stages = ['new', 'contacted', 'quoted', 'negotiating', 'confirmed'];
    const stageLabels = { new: 'New', contacted: 'Contacted', quoted: 'Quoted', negotiating: 'Negotiating', confirmed: 'Confirmed' };
    const stageColors = { new: '#94a3b8', contacted: '#60a5fa', quoted: '#fbbf24', negotiating: '#c084fc', confirmed: '#34d399' };

    const pipeline = {};
    stages.forEach(s => pipeline[s] = { count: 0, value: 0 });
    leads.forEach(l => {
        if (pipeline[l.stage] !== undefined) {
            pipeline[l.stage].count++;
            pipeline[l.stage].value += budgetMap[l.budget_range] || 100000;
        }
    });

    const totalValue = Object.values(pipeline).reduce((s, p) => s + p.value, 0);

    el.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
            <span style="font-size:0.9rem;font-weight:600">Total Pipeline: <span style="color:var(--primary)">${formatINR(totalValue)}</span></span>
        </div>
        ${stages.map(s => {
            const pct = totalValue > 0 ? ((pipeline[s].value / totalValue) * 100).toFixed(0) : 0;
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:6px 0">
                    <span style="min-width:100px;font-size:0.85rem;color:var(--text-muted)">${stageLabels[s]}</span>
                    <div style="flex:1;background:var(--bg-input);border-radius:4px;height:24px;overflow:hidden">
                        <div style="height:100%;width:${Math.max(3, pct)}%;background:${stageColors[s]};border-radius:4px;transition:width 0.3s"></div>
                    </div>
                    <span style="min-width:80px;text-align:right;font-weight:600;font-size:0.85rem">${formatINR(pipeline[s].value)}</span>
                    <span style="min-width:40px;text-align:right;font-size:0.78rem;color:var(--text-muted)">${pipeline[s].count}</span>
                </div>
            `;
        }).join('')}
    `;
}
