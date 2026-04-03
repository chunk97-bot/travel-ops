// ============================================================
// activity-timeline.js — Unified activity feed per client/lead
// Merges: lead_activities, call_logs, email_logs, follow_ups, invoices, bookings
// ============================================================

async function loadActivityTimeline(targetEl, { leadId, clientId }) {
    if (!targetEl) return;
    targetEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Loading timeline...</p>';

    const events = [];

    // 1. Lead activities
    if (leadId) {
        const { data } = await window.supabase.from('lead_activities')
            .select('type, notes, created_at, staff_profiles(name)')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false }).limit(50);
        (data || []).forEach(a => events.push({
            icon: a.type === 'call' ? '📞' : a.type === 'whatsapp' ? '💬' : a.type === 'email' ? '📧' : '📝',
            label: a.type, detail: a.notes, by: a.staff_profiles?.name, at: a.created_at, source: 'activity'
        }));
    }

    // 2. Call logs
    const callQ = window.supabase.from('call_logs')
        .select('phone, direction, duration_sec, outcome, notes, created_at, staff_profiles:staff_id(name)')
        .order('created_at', { ascending: false }).limit(20);
    if (leadId) callQ.eq('lead_id', leadId);
    else if (clientId) callQ.eq('client_id', clientId);
    const { data: calls } = await callQ;
    (calls || []).forEach(c => {
        const mins = Math.floor((c.duration_sec || 0) / 60);
        const secs = (c.duration_sec || 0) % 60;
        events.push({
            icon: c.direction === 'inbound' ? '📥' : '📤',
            label: `${c.direction} call`,
            detail: `${c.outcome} · ${mins}m ${secs}s${c.notes ? ' — ' + c.notes : ''}`,
            by: c.staff_profiles?.name, at: c.created_at, source: 'call'
        });
    });

    // 3. Email logs
    const emailQ = window.supabase.from('email_logs')
        .select('subject, direction, status, created_at, staff_profiles:staff_id(name)')
        .order('created_at', { ascending: false }).limit(20);
    if (leadId) emailQ.eq('lead_id', leadId);
    else if (clientId) emailQ.eq('client_id', clientId);
    const { data: emails } = await emailQ;
    (emails || []).forEach(e => events.push({
        icon: e.direction === 'received' ? '📨' : '📧',
        label: `Email ${e.direction}`,
        detail: `${e.subject || 'No subject'} · ${e.status}`,
        by: e.staff_profiles?.name, at: e.created_at, source: 'email'
    }));

    // 4. Follow-ups
    if (leadId) {
        const { data } = await window.supabase.from('follow_ups')
            .select('type, due_date, message, is_done, created_at')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false }).limit(20);
        (data || []).forEach(f => events.push({
            icon: f.is_done ? '✅' : '🔔',
            label: `Follow-up (${f.type})`,
            detail: `${f.is_done ? 'Done' : 'Due ' + formatDate(f.due_date)}${f.message ? ' — ' + f.message : ''}`,
            by: null, at: f.created_at, source: 'followup'
        }));
    }

    // 5. Invoices (by client)
    if (clientId) {
        const { data } = await window.supabase.from('invoices')
            .select('invoice_number, total_amount, status, created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false }).limit(10);
        (data || []).forEach(i => events.push({
            icon: '🧾', label: 'Invoice',
            detail: `${i.invoice_number} · ${formatINR(i.total_amount)} · ${i.status}`,
            by: null, at: i.created_at, source: 'invoice'
        }));
    }

    // Sort all by date descending
    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    if (!events.length) {
        targetEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No activity yet</p>';
        return;
    }

    // Render timeline
    targetEl.innerHTML = `<div class="activity-timeline">
        ${events.map(e => `
            <div class="timeline-item">
                <div class="timeline-dot" data-source="${e.source}">${e.icon}</div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <span class="timeline-label">${escHtml(e.label)}</span>
                        ${e.by ? `<span class="timeline-by">${escHtml(e.by)}</span>` : ''}
                        <span class="timeline-time">${_timeAgo(e.at)}</span>
                    </div>
                    ${e.detail ? `<div class="timeline-detail">${escHtml(e.detail)}</div>` : ''}
                </div>
            </div>`).join('')}
    </div>`;
}

function _timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
}
