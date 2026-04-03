// ============================================================
// dashboard.js — Dashboard stats + follow-ups + pipeline
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadStats(),
        loadFollowupsToday(),
        loadRecentLeads(),
        loadPipeline(),
        loadBirthdayWidget(),
        loadNotificationBadge(),
        loadDashboardKPIs(),
    ]);
});

async function loadStats() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [leadsToday, followupsDue, confirmed, revenue, invoicesPending, allLeads] = await Promise.all([
        window.supabase.from('leads').select('id', { count: 'exact' }).gte('created_at', todayStart).lt('created_at', todayEnd),
        window.supabase.from('follow_ups').select('id', { count: 'exact' }).lte('due_date', new Date().toISOString()).eq('is_done', false),
        window.supabase.from('leads').select('id', { count: 'exact' }).eq('stage', 'confirmed').gte('created_at', monthStart),
        window.supabase.from('invoices').select('total_amount').gte('created_at', monthStart).in('status', ['paid','partial']),
        window.supabase.from('invoices').select('id', { count: 'exact' }).in('status', ['sent','partial','overdue']),
        window.supabase.from('leads').select('stage', { count: 'exact' }),
    ]);

    const totalRevenue = revenue.data?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0;
    const totalLeadsCount = allLeads.count || 1;
    const confirmedCount = confirmed.count || 0;
    const convRate = Math.round((confirmedCount / totalLeadsCount) * 100);

    document.getElementById('statLeadsToday').textContent = leadsToday.count || 0;
    document.getElementById('statFollowups').textContent = followupsDue.count || 0;
    document.getElementById('statConfirmed').textContent = confirmed.count || 0;
    document.getElementById('statRevenue').textContent = formatINR(totalRevenue);
    document.getElementById('statInvoicesPending').textContent = invoicesPending.count || 0;
    document.getElementById('statConversion').textContent = convRate + '%';
}

async function loadFollowupsToday() {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59);
    const { data } = await window.supabase
        .from('follow_ups')
        .select('*, leads(name, phone, destination)')
        .eq('is_done', false)
        .lte('due_date', todayEnd.toISOString())
        .order('due_date')
        .limit(10);

    const el = document.getElementById('followupList');
    if (!data?.length) { el.innerHTML = '<p class="empty-state">No follow-ups due today <i data-lucide="party-popper" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></p>'; return; }

    const now = new Date();
    el.innerHTML = data.map(f => {
        const isOverdue = new Date(f.due_date) < now;
        const icon = f.type === 'call' ? '<i data-lucide="phone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : f.type === 'whatsapp' ? '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>';
        return `
            <div class="followup-item ${isOverdue ? 'overdue' : 'today'}">
                <span style="font-size:1.3rem">${icon}</span>
                <div style="flex:1">
                    <div class="followup-name">${escHtml(f.leads?.name || 'Unknown')}</div>
                    <div class="followup-meta">${escHtml(f.leads?.destination || '')} · ${formatDate(f.due_date)}</div>
                </div>
                <div class="followup-actions">
                    <button class="btn-primary" style="padding:5px 10px;font-size:0.78rem" onclick="window.open('https://wa.me/91${escHtml(f.leads?.phone?.replace(/\D/g,'')||'')}','_blank')">WhatsApp</button>
                    <button class="btn-secondary" style="padding:5px 10px;font-size:0.78rem" onclick="markFollowupDone('${f.id}')">Done <i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

async function markFollowupDone(id) {
    await window.supabase.from('follow_ups').update({ is_done: true }).eq('id', id);
    showToast('Follow-up marked done');
    await loadFollowupsToday();
    await loadStats();
}

async function loadRecentLeads() {
    const { data } = await window.supabase
        .from('leads')
        .select('*, staff_profiles(name)')
        .order('created_at', { ascending: false })
        .limit(10);

    const tbody = document.getElementById('recentLeadsTable');
    if (!data?.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No leads yet</td></tr>'; return; }

    tbody.innerHTML = data.map(l => `
        <tr>
            <td><strong>${escHtml(l.name)}</strong></td>
            <td>${escHtml(l.destination || '—')}</td>
            <td>${escHtml(l.budget_range || '—')}</td>
            <td>${stageBadge(l.stage)}</td>
            <td>${escHtml(l.source || '—')}</td>
            <td>${formatDate(l.created_at)}</td>
            <td><a href="leads.html" class="btn-secondary" style="padding:4px 8px;font-size:0.78rem">View</a></td>
        </tr>
    `).join('');
}

async function loadPipeline() {
    const { data } = await window.supabase.from('leads').select('stage');
    if (!data) return;
    const counts = { new: 0, contacted: 0, quoted: 0, negotiating: 0, confirmed: 0 };
    data.forEach(l => { if (counts[l.stage] !== undefined) counts[l.stage]++; });
    Object.entries(counts).forEach(([stage, count]) => {
        const el = document.getElementById(`p${stage.charAt(0).toUpperCase() + stage.slice(1)}`);
        if (el) el.textContent = count;
    });
}

// ── Birthday & Anniversary Widget ────────────────────────
async function loadBirthdayWidget() {
    const el = document.getElementById('birthdayWidget');
    if (!el) return;

    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const in7MD = `${String(in7Days.getMonth() + 1).padStart(2, '0')}-${String(in7Days.getDate()).padStart(2, '0')}`;

    // Query clients with matching DOB month-day range
    const { data: birthdays } = await window.supabase
        .from('clients')
        .select('id, name, phone, dob, anniversary')
        .not('dob', 'is', null);

    const { data: anniversaries } = await window.supabase
        .from('clients')
        .select('id, name, phone, anniversary')
        .not('anniversary', 'is', null);

    const thisWeekBirthdays = (birthdays || []).filter(c => {
        if (!c.dob) return false;
        const md = c.dob.slice(5); // MM-DD
        return md >= todayMD && md <= in7MD;
    });

    const thisWeekAnniversaries = (anniversaries || []).filter(c => {
        if (!c.anniversary) return false;
        const md = c.anniversary.slice(5);
        return md >= todayMD && md <= in7MD;
    });

    const items = [
        ...thisWeekBirthdays.map(c => ({ ...c, type: '<i data-lucide="cake" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: 'Birthday', date: c.dob })),
        ...thisWeekAnniversaries.map(c => ({ ...c, type: '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: 'Anniversary', date: c.anniversary })),
    ];

    if (!items.length) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No birthdays or anniversaries this week <i data-lucide="party-popper" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></p>';
        return;
    }

    el.innerHTML = items.map(item => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:1.3rem">${item.type}</span>
            <div style="flex:1">
                <div style="font-weight:600">${escHtml(item.name)}</div>
                <div style="font-size:0.78rem;color:var(--text-muted)">${item.label} · ${formatDate(item.date)}</div>
            </div>
            ${item.phone ? `<a href="https://wa.me/91${item.phone.replace(/\D/g,'')}" target="_blank" class="btn-primary" style="padding:4px 10px;font-size:0.78rem"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Wish</a>` : ''}
        </div>
    `).join('');
}

// ── Notification Badge ────────────────────────────────────
async function loadNotificationBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    try {
        const userId = await getCurrentUserId();
        const { count } = await window.supabase
            .from('notifications')
            .select('id', { count: 'exact' })
            .eq('user_id', userId)
            .eq('is_read', false);
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (_) { /* notifications table may not exist yet */ }
}

// ============================================================
// Enhancement #3 — Dashboard KPIs
// ============================================================
async function loadDashboardKPIs() {
    const kpiEl = document.getElementById('kpiSection');
    if (!kpiEl) return;

    const now = new Date();
    const year = now.getFullYear();
    const monthStart = new Date(year, now.getMonth(), 1).toISOString();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    const [bookingsData, leadsYtd, revenueYtd, expensesYtd] = await Promise.all([
        window.supabase.from('bookings').select('id, created_at').gte('created_at', yearStart).lt('created_at', yearEnd),
        window.supabase.from('leads').select('id, stage, created_at').gte('created_at', yearStart).lt('created_at', yearEnd),
        window.supabase.from('invoices').select('total_amount, created_at').in('status', ['paid','partial']).gte('created_at', yearStart).lt('created_at', yearEnd),
        window.supabase.from('expenses').select('amount').gte('expense_date', yearStart).lt('expense_date', yearEnd),
    ]);

    const totalBookingsYtd = bookingsData.data?.length || 0;
    const totalLeadsYtd = leadsYtd.data?.length || 0;
    const confirmedLeads = leadsYtd.data?.filter(l => l.stage === 'confirmed').length || 0;
    const conversionRate = totalLeadsYtd > 0 ? ((confirmedLeads / totalLeadsYtd) * 100).toFixed(1) : '0';
    const revenueTotal = revenueYtd.data?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0;
    const expensesTotal = expensesYtd.data?.reduce((s, e) => s + (e.amount || 0), 0) || 0;
    const avgDealSize = totalBookingsYtd > 0 ? Math.round(revenueTotal / totalBookingsYtd) : 0;
    const profitMargin = revenueTotal > 0 ? (((revenueTotal - expensesTotal) / revenueTotal) * 100).toFixed(1) : '0';

    kpiEl.innerHTML = `
        <div class="stat-card"><span class="stat-icon"><i data-lucide="layout-dashboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></span><div class="stat-info"><div class="stat-label">Conversion Rate (YTD)</div><div class="stat-value">${conversionRate}%</div></div></div>
        <div class="stat-card"><span class="stat-icon"><i data-lucide="indian-rupee" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></span><div class="stat-info"><div class="stat-label">Avg Deal Size</div><div class="stat-value">${formatINR(avgDealSize)}</div></div></div>
        <div class="stat-card"><span class="stat-icon"><i data-lucide="bar-chart-3" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></span><div class="stat-info"><div class="stat-label">Revenue (YTD)</div><div class="stat-value">${formatINR(revenueTotal)}</div></div></div>
        <div class="stat-card"><span class="stat-icon"><i data-lucide="trending-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></span><div class="stat-info"><div class="stat-label">Profit Margin</div><div class="stat-value">${profitMargin}%</div></div></div>
    `;
}
