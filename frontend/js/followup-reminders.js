// ============================================================
// followup-reminders.js — Follow-up Reminders Dashboard Widget
// Provides smart reminders: overdue, today, upcoming, by agent
// ============================================================

async function initFollowupReminders(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="reminder-tabs" style="display:flex;gap:4px;margin-bottom:12px">
            <button class="tab-btn active" onclick="loadReminderTab('overdue',this)">🔴 Overdue</button>
            <button class="tab-btn" onclick="loadReminderTab('today',this)">🟡 Today</button>
            <button class="tab-btn" onclick="loadReminderTab('upcoming',this)">🟢 Upcoming</button>
            <button class="tab-btn" onclick="loadReminderTab('all',this)">📋 All</button>
        </div>
        <div id="reminderStats" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px"></div>
        <div id="reminderList"></div>
    `;

    await loadReminderStats();
    await loadReminderTab('overdue');
}

async function loadReminderStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

    const [overdue, today, upcoming] = await Promise.all([
        window.supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('is_done', false).lt('due_date', todayStart),
        window.supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('is_done', false).gte('due_date', todayStart).lt('due_date', todayEnd),
        window.supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('is_done', false).gte('due_date', todayEnd).lt('due_date', in7Days),
    ]);

    const el = document.getElementById('reminderStats');
    if (!el) return;
    el.innerHTML = `
        <div class="stat-card" style="border-left:3px solid var(--danger)"><div class="stat-info"><div class="stat-label">Overdue</div><div class="stat-value urgent">${overdue.count || 0}</div></div></div>
        <div class="stat-card" style="border-left:3px solid var(--warning)"><div class="stat-info"><div class="stat-label">Due Today</div><div class="stat-value" style="color:var(--warning)">${today.count || 0}</div></div></div>
        <div class="stat-card" style="border-left:3px solid var(--success)"><div class="stat-info"><div class="stat-label">Next 7 Days</div><div class="stat-value">${upcoming.count || 0}</div></div></div>
    `;
}

async function loadReminderTab(tab, btnEl) {
    // Update tab highlight
    if (btnEl) {
        btnEl.closest('.reminder-tabs').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }

    const listEl = document.getElementById('reminderList');
    if (!listEl) return;
    listEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Loading...</p>';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const in7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

    let query = window.supabase.from('follow_ups')
        .select('*, leads(name, phone, destination)')
        .eq('is_done', false)
        .order('due_date');

    if (tab === 'overdue') query = query.lt('due_date', todayStart);
    else if (tab === 'today') query = query.gte('due_date', todayStart).lt('due_date', todayEnd);
    else if (tab === 'upcoming') query = query.gte('due_date', todayEnd).lt('due_date', in7Days);
    // 'all' = no additional filter

    const { data } = await query.limit(50);
    if (!data?.length) {
        listEl.innerHTML = `<p class="empty-state">${tab === 'overdue' ? 'No overdue follow-ups 🎉' : 'No follow-ups in this category'}</p>`;
        return;
    }

    listEl.innerHTML = data.map(f => {
        const dueDate = new Date(f.due_date);
        const isOverdue = dueDate < now;
        const isToday = dueDate.toDateString() === now.toDateString();
        const urgencyClass = isOverdue ? 'overdue' : isToday ? 'today' : '';
        const icon = f.type === 'call' ? '📞' : f.type === 'whatsapp' ? '💬' : '📧';
        const daysLabel = isOverdue ? `<span style="color:var(--danger);font-weight:600">${Math.ceil((now - dueDate) / 86400000)}d overdue</span>` : isToday ? '<span style="color:var(--warning);font-weight:600">Today</span>' : `in ${Math.ceil((dueDate - now) / 86400000)}d`;

        return `
            <div class="followup-item ${urgencyClass}" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:1.3rem">${icon}</span>
                <div style="flex:1">
                    <div style="font-weight:600">${escHtml(f.leads?.name || 'Unknown')}</div>
                    <div style="font-size:0.82rem;color:var(--text-muted)">${escHtml(f.leads?.destination || '')} · ${formatDate(f.due_date)} · ${daysLabel}</div>
                    ${f.message ? `<div style="font-size:0.8rem;color:var(--text-muted);font-style:italic;margin-top:2px">${escHtml(f.message)}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px">
                    ${f.leads?.phone ? `<button class="btn-primary" style="padding:4px 10px;font-size:0.78rem" onclick="window.open('https://wa.me/91${escHtml(f.leads.phone.replace(/\\D/g,''))}','_blank')">💬</button>` : ''}
                    <button class="btn-success" style="padding:4px 10px;font-size:0.78rem" onclick="markReminderDone('${f.id}','${escHtml(tab)}')">Done ✓</button>
                </div>
            </div>
        `;
    }).join('');
}

async function markReminderDone(id, tab) {
    await window.supabase.from('follow_ups').update({ is_done: true }).eq('id', id);
    showToast('Follow-up marked done');
    await loadReminderStats();
    await loadReminderTab(tab || 'overdue');
}
