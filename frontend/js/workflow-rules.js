// ============================================================
// workflow-rules.js — If X happens → auto do Y
// Loaded on settings page for rule management
// Called from other pages when events happen
// ============================================================

// ── Rule engine: evaluate and execute ─────────────────────
async function triggerWorkflow(triggerType, context) {
    try {
        const { data: rules } = await window.supabase.from('workflow_rules')
            .select('*')
            .eq('trigger_type', triggerType)
            .eq('is_active', true);
        if (!rules?.length) return;

        for (const rule of rules) {
            if (_matchConditions(rule.conditions, context)) {
                await _executeActions(rule.actions, context);
            }
        }
    } catch (_) { /* non-blocking */ }
}

function _matchConditions(conditions, context) {
    if (!conditions || !Object.keys(conditions).length) return true;
    for (const [key, expected] of Object.entries(conditions)) {
        if (Array.isArray(expected)) {
            if (!expected.includes(context[key])) return false;
        } else if (context[key] !== expected) {
            return false;
        }
    }
    return true;
}

async function _executeActions(actions, context) {
    if (!Array.isArray(actions)) return;
    const userId = await getCurrentUserId();

    for (const action of actions) {
        switch (action.type) {
            case 'create_follow_up':
                await window.supabase.from('follow_ups').insert({
                    lead_id: context.lead_id || null,
                    assigned_to: context.assigned_to || userId,
                    type: action.follow_up_type || 'call',
                    due_date: new Date(Date.now() + (action.delay_hours || 24) * 3600000).toISOString(),
                    message: action.message || 'Auto-created by workflow rule',
                    is_done: false,
                });
                break;

            case 'send_notification':
                await window.supabase.from('notifications').insert({
                    user_id: context.assigned_to || userId,
                    title: action.title || 'Workflow Notification',
                    body: _interpolate(action.body || '', context),
                    link: action.link || null,
                    is_read: false,
                });
                break;

            case 'update_lead_tag':
                if (context.lead_id) {
                    await window.supabase.from('leads').update({ tag: action.tag }).eq('id', context.lead_id);
                }
                break;

            case 'send_whatsapp':
                if (context.phone) {
                    const msg = _interpolate(action.message || 'Hello!', context);
                    // Will use the WhatsApp worker if available, else wa.me fallback
                    try {
                        const WHATSAPP_WORKER = 'https://whereto-whatsapp.chunky199701.workers.dev/send';
                        await fetch(WHATSAPP_WORKER, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone: context.phone, message: msg }),
                        });
                    } catch (_) { /* silent fail */ }
                }
                break;

            case 'assign_to':
                if (context.lead_id && action.staff_id) {
                    await window.supabase.from('leads').update({ assigned_to: action.staff_id }).eq('id', context.lead_id);
                }
                break;
        }
    }
}

function _interpolate(template, context) {
    return template.replace(/\{(\w+)\}/g, (_, key) => context[key] || '');
}

// ── Default rules (seed if empty) ─────────────────────────
async function seedDefaultRules() {
    const { count } = await window.supabase.from('workflow_rules').select('id', { count: 'exact', head: true });
    if (count > 0) return;

    const defaults = [
        {
            name: 'New lead → Notify manager',
            trigger_type: 'lead_created',
            conditions: {},
            actions: [{ type: 'send_notification', title: 'New Lead: {name}', body: '{name} from {source} — {destination}' }],
        },
        {
            name: 'Lead quoted → Follow up in 2 days',
            trigger_type: 'lead_stage_change',
            conditions: { new_stage: 'quoted' },
            actions: [{ type: 'create_follow_up', follow_up_type: 'whatsapp', delay_hours: 48, message: 'Follow up on quote for {destination}' }],
        },
        {
            name: 'Booking confirmed → WhatsApp acknowledgment',
            trigger_type: 'booking_created',
            conditions: {},
            actions: [{ type: 'send_notification', title: 'Booking Confirmed', body: 'New booking for {destination} — {name}' }],
        },
        {
            name: 'Follow-up missed → Escalate',
            trigger_type: 'follow_up_missed',
            conditions: {},
            actions: [{ type: 'send_notification', title: '<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ Missed Follow-up', body: '{name} — follow-up was due {due_date}' }],
        },
    ];

    const userId = await getCurrentUserId();
    for (const rule of defaults) {
        await window.supabase.from('workflow_rules').insert({ ...rule, created_by: userId });
    }
}

// ── Render rules UI (for settings page) ──────────────────
async function loadWorkflowRules() {
    const container = document.getElementById('workflowRulesContainer');
    if (!container) return;

    const { data: rules } = await window.supabase.from('workflow_rules').select('*').order('created_at');
    if (!rules?.length) {
        container.innerHTML = '<p class="empty-state">No workflow rules. Click "Seed Defaults" to add starter rules.</p>';
        return;
    }

    container.innerHTML = rules.map(r => `
        <div class="section-card" style="margin-bottom:12px;padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <strong>${escHtml(r.name)}</strong>
                    <span class="badge badge-${r.is_active ? 'active' : 'inactive'}" style="margin-left:8px">${r.is_active ? 'Active' : 'Paused'}</span>
                </div>
                <div style="display:flex;gap:6px">
                    <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem" onclick="toggleWorkflowRule('${r.id}', ${!r.is_active})">${r.is_active ? 'Pause' : 'Enable'}</button>
                    <button class="btn-danger-sm" onclick="deleteWorkflowRule('${r.id}')"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></button>
                </div>
            </div>
            <div style="margin-top:6px;font-size:0.8rem;color:var(--text-muted)">
                Trigger: <span class="badge">${escHtml(r.trigger_type)}</span>
                ${r.conditions && Object.keys(r.conditions).length ? ' · Conditions: ' + escHtml(JSON.stringify(r.conditions)) : ''}
            </div>
            <div style="margin-top:4px;font-size:0.8rem;color:var(--text-muted)">
                Actions: ${(r.actions||[]).map(a => `<span class="badge badge-info">${escHtml(a.type)}</span>`).join(' ')}
            </div>
        </div>
    `).join('');
}

async function toggleWorkflowRule(id, newState) {
    await window.supabase.from('workflow_rules').update({ is_active: newState }).eq('id', id);
    showToast(newState ? 'Rule enabled' : 'Rule paused');
    loadWorkflowRules();
}

async function deleteWorkflowRule(id) {
    if (!confirm('Delete this workflow rule?')) return;
    await window.supabase.from('workflow_rules').delete().eq('id', id);
    showToast('Rule deleted');
    loadWorkflowRules();
}
