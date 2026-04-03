// ============================================================
// dashboard.js — Dashboard stats + follow-ups + pipeline
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadStats(),
        loadFollowupsToday(),
        loadRecentLeads(),
        loadPipeline(),
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
    if (!data?.length) { el.innerHTML = '<p class="empty-state">No follow-ups due today 🎉</p>'; return; }

    const now = new Date();
    el.innerHTML = data.map(f => {
        const isOverdue = new Date(f.due_date) < now;
        const icon = f.type === 'call' ? '📞' : f.type === 'whatsapp' ? '💬' : '📧';
        return `
            <div class="followup-item ${isOverdue ? 'overdue' : 'today'}">
                <span style="font-size:1.3rem">${icon}</span>
                <div style="flex:1">
                    <div class="followup-name">${escHtml(f.leads?.name || 'Unknown')}</div>
                    <div class="followup-meta">${escHtml(f.leads?.destination || '')} · ${formatDate(f.due_date)}</div>
                </div>
                <div class="followup-actions">
                    <button class="btn-primary" style="padding:5px 10px;font-size:0.78rem" onclick="window.open('https://wa.me/91${escHtml(f.leads?.phone?.replace(/\D/g,'')||'')}','_blank')">WhatsApp</button>
                    <button class="btn-secondary" style="padding:5px 10px;font-size:0.78rem" onclick="markFollowupDone('${f.id}')">Done ✓</button>
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
