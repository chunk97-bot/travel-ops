// ============================================================
// sla-timers.js — Pipeline SLA Timers for leads
// Tracks stage durations, shows countdown/breach indicators
// ============================================================

let slaConfig = [];
let slaEvents = {};

document.addEventListener('DOMContentLoaded', async () => {
    await loadSlaConfig();
    _injectSlaUI();
    _hookSlaIntoLeads();
});

// ── Load SLA configuration ────────────────────────────────
async function loadSlaConfig() {
    const { data, error } = await window.supabase
        .from('sla_config')
        .select('*')
        .eq('is_active', true)
        .order('max_hours', { ascending: true });
    if (error) { console.error('SLA config load failed:', error); return; }
    slaConfig = data || [];
}

// ── Load SLA events for a set of leads ────────────────────
async function loadSlaEvents(leadIds) {
    if (!leadIds.length) return;
    const { data, error } = await window.supabase
        .from('lead_sla_events')
        .select('*')
        .in('lead_id', leadIds)
        .is('responded_at', null)
        .order('entered_at', { ascending: false });
    if (error) return;
    slaEvents = {};
    (data || []).forEach(ev => {
        if (!slaEvents[ev.lead_id]) slaEvents[ev.lead_id] = ev;
    });
}

// ── Get SLA rule for a stage ──────────────────────────────
function getSlaRule(stage) {
    return slaConfig.find(c => c.stage === stage);
}

// ── Calculate SLA status for a lead ───────────────────────
function getSlaStatus(leadId, stage) {
    const rule = getSlaRule(stage);
    if (!rule) return null;

    const event = slaEvents[leadId];
    const enteredAt = event ? new Date(event.entered_at) : null;
    if (!enteredAt) return { status: 'no-data', label: '—' };

    const now = new Date();
    const elapsedMs = now - enteredAt;
    const maxMs = rule.max_hours * 3600000;
    const warnMs = (rule.warning_hours || rule.max_hours * 0.5) * 3600000;
    const remainMs = maxMs - elapsedMs;

    if (remainMs <= 0) {
        return { status: 'breached', label: 'BREACHED', elapsed: elapsedMs, max: maxMs, pct: 100 };
    } else if (elapsedMs >= warnMs) {
        return { status: 'warning', label: formatCountdown(remainMs), elapsed: elapsedMs, max: maxMs, pct: Math.round((elapsedMs / maxMs) * 100) };
    } else {
        return { status: 'ok', label: formatCountdown(remainMs), elapsed: elapsedMs, max: maxMs, pct: Math.round((elapsedMs / maxMs) * 100) };
    }
}

// ── Format countdown ──────────────────────────────────────
function formatCountdown(ms) {
    if (ms <= 0) return '0m';
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

function formatElapsed(ms) {
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
}

// ── Render SLA badge HTML ─────────────────────────────────
function slaBadge(leadId, stage) {
    const sla = getSlaStatus(leadId, stage);
    if (!sla || sla.status === 'no-data') return '';

    const cls = sla.status === 'breached' ? 'sla-breached'
        : sla.status === 'warning' ? 'sla-warning'
        : 'sla-ok';
    const icon = sla.status === 'breached' ? '<span class="dot dot-danger"></span>'
        : sla.status === 'warning' ? '<span class="dot dot-warning"></span>'
        : '<span class="dot dot-success"></span>';

    return `<span class="sla-badge ${cls}" title="SLA: ${sla.pct || 0}% elapsed">${icon} ${escHtml(sla.label)}</span>`;
}

// ── Hook into leads rendering ─────────────────────────────
function _hookSlaIntoLeads() {
    // Override renderTable to include SLA column
    const origRenderTable = window.renderTable;
    if (typeof origRenderTable !== 'function') return;

    window.renderTable = async function(leads) {
        const leadIds = leads.map(l => l.id);
        await loadSlaEvents(leadIds);

        const tbody = document.getElementById('leadsTable');
        const start = (currentPage - 1) * PAGE_SIZE;
        const page = leads.slice(start, start + PAGE_SIZE);

        if (!page.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No leads found</td></tr>';
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = page.map(l => `
            <tr>
                <td><strong>${escHtml(l.name)}</strong>${l.tag ? `<br><span class="badge badge-${escHtml(l.tag)}">${escHtml(l.tag.toUpperCase())}</span>` : ''}</td>
                <td>${escHtml(l.phone)}</td>
                <td>${escHtml(l.destination || '—')}</td>
                <td>${formatDate(l.travel_date)}</td>
                <td>${(l.pax_adults || 0) + (l.pax_children || 0)} pax</td>
                <td>${escHtml(l.budget_range || '—')}</td>
                <td>${stageBadge(l.stage)}</td>
                <td>${slaBadge(l.id, l.stage)}</td>
                <td>${escHtml(l.source || '—')}</td>
                <td>${escHtml(l.staff_profiles?.name || '—')}</td>
                <td><span class="badge">${l.lead_score || 0}</span></td>
                <td>
                    <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem" onclick="openLeadDrawer('${l.id}')">View</button>
                    <button class="btn-primary" style="padding:4px 8px;font-size:0.78rem;margin-left:4px" onclick="openEditLead('${l.id}')">Edit</button>
                </td>
            </tr>
        `).join('');

        renderPagination(leads.length);
    };

    // Hook kanban cards to show SLA indicator
    const origRenderKanban = window.renderKanban;
    if (typeof origRenderKanban === 'function') {
        window.renderKanban = async function(leads) {
            const leadIds = leads.map(l => l.id);
            await loadSlaEvents(leadIds);
            // Render kanban with SLA indicators on cards
            const stages = ['new','contacted','quoted','negotiating','confirmed'];
            stages.forEach(stage => {
                const col = document.querySelector(`#kanban-${stage} .kanban-cards`);
                const count = document.querySelector(`#kanban-${stage} .col-count`);
                if (!col) return;
                const stageLeads = leads.filter(l => l.stage === stage);
                if (count) count.textContent = stageLeads.length;

                col.ondragover = (e) => { e.preventDefault(); col.classList.add('drag-over'); };
                col.ondragleave = () => col.classList.remove('drag-over');
                col.ondrop = (e) => { e.preventDefault(); col.classList.remove('drag-over'); handleKanbanDrop(e, stage); };

                col.innerHTML = stageLeads.length
                    ? stageLeads.map(l => `
                        <div class="kanban-card" draggable="true" data-lead-id="${l.id}"
                            ondragstart="event.dataTransfer.setData('text/plain','${l.id}')"
                            onclick="openLeadDrawer('${l.id}')">
                            <div class="kanban-card-name">${escHtml(l.name)}</div>
                            <div class="kanban-card-dest"><i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(l.destination || 'TBD')}</div>
                            <div class="kanban-card-date">${formatDate(l.travel_date)} · ${escHtml(l.budget_range || '—')}</div>
                            <div style="margin-top:4px;display:flex;gap:6px;align-items:center">
                                ${typeof scoreBadge === 'function' ? scoreBadge(l.lead_score || 0) : ''}
                                ${slaBadge(l.id, l.stage)}
                            </div>
                        </div>
                    `).join('')
                    : '<p style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:20px 0">Empty</p>';
            });
        };
    }

    // Hook stage changes to create SLA events
    const origKanbanDrop = window.handleKanbanDrop;
    if (typeof origKanbanDrop === 'function') {
        window.handleKanbanDrop = async function(e, newStage) {
            const leadId = e.dataTransfer.getData('text/plain');
            if (leadId) {
                const lead = allLeads.find(l => l.id === leadId);
                if (lead && lead.stage !== newStage) {
                    await recordStageTransition(leadId, lead.stage, newStage);
                }
            }
            return origKanbanDrop.call(this, e, newStage);
        };
    }
}

// ── Record SLA stage transition ───────────────────────────
async function recordStageTransition(leadId, oldStage, newStage) {
    const userId = await getCurrentUserId();

    // Close current SLA event (mark as responded)
    if (slaEvents[leadId]) {
        await window.supabase
            .from('lead_sla_events')
            .update({ responded_at: new Date().toISOString() })
            .eq('id', slaEvents[leadId].id);
    }

    // Open new SLA event for new stage
    await window.supabase.from('lead_sla_events').insert({
        lead_id: leadId,
        stage: newStage,
        entered_at: new Date().toISOString(),
        assigned_to: userId
    });
}

// ── Auto-create SLA event on new lead save ────────────────
function _hookSlaOnSave() {
    const origDoSave = window._doSaveLead;
    if (typeof origDoSave !== 'function') return;

    window._doSaveLead = async function(phone, email, userId) {
        const isNew = !editingLeadId;
        const oldStage = isNew ? null : allLeads.find(l => l.id === editingLeadId)?.stage;
        const newStage = document.getElementById('leadStage').value;

        await origDoSave.call(this, phone, email, userId);

        // After save, create SLA event if stage changed or new lead
        if (isNew || (oldStage && oldStage !== newStage)) {
            // Find the lead that was just saved
            const savedLead = allLeads.find(l => {
                if (isNew) return l.phone === phone && l.stage === newStage;
                return l.id === editingLeadId;
            });
            if (savedLead) {
                if (!isNew && oldStage !== newStage) {
                    await recordStageTransition(savedLead.id, oldStage, newStage);
                } else if (isNew) {
                    await window.supabase.from('lead_sla_events').insert({
                        lead_id: savedLead.id,
                        stage: newStage,
                        entered_at: new Date().toISOString(),
                        assigned_to: userId
                    });
                }
            }
        }
    };
}

// ── Inject SLA Dashboard Panel ────────────────────────────
function _injectSlaUI() {
    // SLA dashboard button in the filters bar
    const filterBar = document.querySelector('.filter-bar, .filters, .actions-bar');
    if (filterBar) {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary';
        btn.id = 'slaDashBtn';
        btn.innerHTML = '<i data-lucide="timer" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> SLA Dashboard';
        btn.style.cssText = 'margin-left:8px';
        btn.addEventListener('click', toggleSlaDashboard);
        filterBar.appendChild(btn);
    }

    // SLA slide-out panel
    const panel = document.createElement('div');
    panel.id = 'slaPanel';
    panel.className = 'sla-panel hidden';
    panel.innerHTML = `
        <div class="sla-panel-header">
            <h3><i data-lucide="timer" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> SLA Dashboard</h3>
            <button class="btn-icon" onclick="toggleSlaDashboard()">&times;</button>
        </div>
        <div class="sla-panel-body">
            <div class="sla-summary" id="slaSummary"></div>
            <div class="sla-breaches" id="slaBreaches"></div>
            <div class="sla-config-section" id="slaConfigSection"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // Inject SLA styles
    const style = document.createElement('style');
    style.textContent = `
        .sla-badge { display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;font-weight:600;padding:2px 7px;border-radius:10px;white-space:nowrap; }
        .sla-ok { background:rgba(0,200,83,0.15);color:#00c853; }
        .sla-warning { background:rgba(255,193,7,0.15);color:#ffc107; }
        .sla-breached { background:rgba(244,67,54,0.15);color:#f44336;animation:slaPulse 1.5s infinite; }
        @keyframes slaPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        .sla-panel { position:fixed;top:0;right:0;width:420px;max-width:95vw;height:100vh;background:var(--bg-card,#1a1a2e);
            border-left:1px solid var(--border,rgba(255,255,255,0.1));z-index:1050;overflow-y:auto;
            transition:transform 0.3s ease;box-shadow:-4px 0 20px rgba(0,0,0,0.3); }
        .sla-panel.hidden { transform:translateX(100%); }
        .sla-panel-header { display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid var(--border,rgba(255,255,255,0.1)); }
        .sla-panel-header h3 { margin:0;font-size:1.1rem; }
        .sla-panel-body { padding:16px; }

        .sla-summary { display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:20px; }
        .sla-stat-card { background:var(--bg-surface,rgba(255,255,255,0.05));padding:14px;border-radius:10px;text-align:center; }
        .sla-stat-card .num { font-size:1.8rem;font-weight:700; }
        .sla-stat-card .label { font-size:0.75rem;color:var(--text-muted,#aaa);margin-top:4px; }

        .sla-breach-item { background:var(--bg-surface,rgba(255,255,255,0.05));padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #f44336; }
        .sla-breach-item .lead-name { font-weight:600;margin-bottom:4px; }
        .sla-breach-item .breach-info { font-size:0.8rem;color:var(--text-muted,#aaa); }

        .sla-config-table { width:100%;border-collapse:collapse;margin-top:12px;font-size:0.85rem; }
        .sla-config-table th { text-align:left;padding:8px;border-bottom:1px solid var(--border,rgba(255,255,255,0.1));color:var(--text-muted,#aaa);font-weight:500; }
        .sla-config-table td { padding:8px;border-bottom:1px solid rgba(255,255,255,0.05); }
    `;
    document.head.appendChild(style);

    // Hook save too
    setTimeout(() => _hookSlaOnSave(), 100);
}

// ── Toggle SLA Dashboard Panel ────────────────────────────
async function toggleSlaDashboard() {
    const panel = document.getElementById('slaPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        await renderSlaDashboard();
    }
}

// ── Render SLA Dashboard Content ──────────────────────────
async function renderSlaDashboard() {
    // Load all active (open) SLA events
    const { data: events, error } = await window.supabase
        .from('lead_sla_events')
        .select('*, leads(name, stage, phone, destination, assigned_to, staff_profiles(name))')
        .is('responded_at', null)
        .order('entered_at', { ascending: true });

    if (error) { showToast('Failed to load SLA data', 'error'); return; }
    const allEvents = events || [];

    // Compute stats
    let totalActive = allEvents.length;
    let breached = 0;
    let warning = 0;
    let onTrack = 0;
    const breachList = [];

    allEvents.forEach(ev => {
        const rule = getSlaRule(ev.stage);
        if (!rule) return;
        const elapsed = Date.now() - new Date(ev.entered_at).getTime();
        const maxMs = rule.max_hours * 3600000;
        const warnMs = (rule.warning_hours || rule.max_hours * 0.5) * 3600000;

        if (elapsed >= maxMs) {
            breached++;
            breachList.push({ event: ev, elapsed, maxMs });
            // Mark breached in DB if not already
            if (!ev.breached) {
                window.supabase.from('lead_sla_events').update({ breached: true }).eq('id', ev.id);
            }
        } else if (elapsed >= warnMs) {
            warning++;
        } else {
            onTrack++;
        }
    });

    // Summary cards
    document.getElementById('slaSummary').innerHTML = `
        <div class="sla-stat-card"><div class="num" style="color:#00c853">${onTrack}</div><div class="label">On Track</div></div>
        <div class="sla-stat-card"><div class="num" style="color:#ffc107">${warning}</div><div class="label">Warning</div></div>
        <div class="sla-stat-card"><div class="num" style="color:#f44336">${breached}</div><div class="label">Breached</div></div>
        <div class="sla-stat-card"><div class="num">${totalActive}</div><div class="label">Active</div></div>
    `;

    // Breach list
    const breachesEl = document.getElementById('slaBreaches');
    if (breachList.length) {
        breachesEl.innerHTML = `<h4 style="margin:0 0 10px;font-size:0.95rem"><span class="dot dot-danger"></span> SLA Breaches</h4>` +
            breachList.map(b => {
                const lead = b.event.leads;
                return `<div class="sla-breach-item">
                    <div class="lead-name">${escHtml(lead?.name || 'Unknown')} — ${escHtml(lead?.destination || 'N/A')}</div>
                    <div class="breach-info">
                        Stage: <strong>${escHtml(b.event.stage)}</strong> · 
                        Elapsed: ${formatElapsed(b.elapsed)} · 
                        Limit: ${formatElapsed(b.maxMs)} · 
                        Agent: ${escHtml(lead?.staff_profiles?.name || '—')}
                    </div>
                </div>`;
            }).join('');
    } else {
        breachesEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> No SLA breaches — all leads on track</p>';
    }

    // Config table
    document.getElementById('slaConfigSection').innerHTML = `
        <h4 style="margin:16px 0 8px;font-size:0.95rem"><i data-lucide="settings" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ SLA Rules</h4>
        <table class="sla-config-table">
            <thead><tr><th>Stage</th><th>Max Time</th><th>Warning</th><th>Escalate To</th></tr></thead>
            <tbody>
                ${slaConfig.map(c => `<tr>
                    <td>${escHtml(c.stage)}</td>
                    <td>${c.max_hours}h</td>
                    <td>${c.warning_hours || '—'}h</td>
                    <td>${escHtml(c.escalation_to || '—')}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
}
