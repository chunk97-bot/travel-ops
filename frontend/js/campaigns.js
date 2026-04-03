// ============================================================
// campaigns.js — Bulk WhatsApp / Email campaign manager
// ============================================================

const WHATSAPP_WORKER = 'https://whereto-whatsapp.chunky199701.workers.dev/send'; // update to actual URL

let campaignsData = [];
let editingCampId = null;
let recipientsCache = [];

window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadCampaigns(), loadTemplates()]);
    previewRecipients();
});

// ── Load campaigns ────────────────────────────────────────────
async function loadCampaigns() {
    const { data } = await window.supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
    campaignsData = data || [];
    renderStats();
    renderGrid();
}

function renderStats() {
    const total = campaignsData.length;
    const completed = campaignsData.filter(c => c.status === 'completed').length;
    const totalSent = campaignsData.reduce((s, c) => s + (c.sent_count || 0), 0);
    const draft = campaignsData.filter(c => ['draft'].includes(c.status)).length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statSent').textContent = totalSent.toLocaleString('en-IN');
    document.getElementById('statDraft').textContent = draft;
}

function renderGrid() {
    const grid = document.getElementById('campaignsGrid');
    if (campaignsData.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No campaigns yet. Create your first one!</div>';
        return;
    }
    grid.innerHTML = campaignsData.map(c => {
        const pct = c.total_count > 0 ? Math.round(c.sent_count / c.total_count * 100) : 0;
        const channelIcon = c.channel === 'whatsapp' ? '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>';
        return `<div class="campaign-card">
            <div class="camp-actions">
                ${c.status === 'draft' ? `<button onclick="launchCampaign('${escHtml(c.id)}')"><i data-lucide="rocket" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Send</button>` : ''}
                <button onclick="viewRecipients('${escHtml(c.id)}')"><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Recipients</button>
            </div>
            <div class="camp-name">${channelIcon} ${escHtml(c.name)}</div>
            <div class="camp-meta">
                Audience: <strong>${escHtml(c.audience.replace(/_/g,' '))}</strong> •
                Status: <span class="camp-status-${escHtml(c.status)}">${escHtml(c.status)}</span>
            </div>
            ${c.scheduled_at ? `<div class="camp-meta" style="margin-top:4px;">Scheduled: ${formatDate(c.scheduled_at)}</div>` : ''}
            <div class="camp-meta" style="margin-top:8px;">
                ${c.sent_count} / ${c.total_count} sent
                ${c.failed_count > 0 ? `• <span style="color:#f87171">${c.failed_count} failed</span>` : ''}
            </div>
            ${c.total_count > 0 ? `<div class="camp-progress"><div class="camp-progress-bar" style="width:${pct}%"></div></div>` : ''}
            <div class="camp-meta" style="margin-top:10px; font-style:italic; color:var(--text-muted);">"${escHtml((c.message_body||'').substring(0,80))}${c.message_body?.length>80?'…':''}"</div>
        </div>`;
    }).join('');
}

// ── Template loading ─────────────────────────────────────────
async function loadTemplates() {
    const { data } = await window.supabase.from('message_templates').select('id, name, body').order('name');
    const sel = document.getElementById('campTemplate');
    (data || []).forEach(t => {
        sel.insertAdjacentHTML('beforeend', `<option value="${escHtml(t.id)}" data-body="${escHtml(t.body)}">${escHtml(t.name)}</option>`);
    });
}

function fillMessageFromTemplate() {
    const sel = document.getElementById('campTemplate');
    const opt = sel.options[sel.selectedIndex];
    const body = opt?.dataset?.body || '';
    if (body) { document.getElementById('campMessage').value = body; updatePreview(); }
}

// ── Recipients preview ────────────────────────────────────────
async function previewRecipients() {
    const audience = document.getElementById('campAudience').value;
    const clients = await fetchAudience(audience);
    recipientsCache = clients;
    const badge = document.getElementById('recipientsBadge');
    badge.textContent = `${clients.length} recipients`;
}

async function fetchAudience(audience) {
    let query = window.supabase.from('clients').select('id, name, phone, segment');
    switch (audience) {
        case 'segment_hni':       query = query.eq('segment', 'hni'); break;
        case 'segment_corporate': query = query.eq('segment', 'corporate'); break;
        case 'segment_leisure':   query = query.eq('segment', 'leisure'); break;
        case 'balance_due':
            query = window.supabase.from('invoices').select('client_id, clients(id, name, phone)').eq('status', 'unpaid');
            const { data: inv } = await query;
            return (inv || []).map(i => i.clients).filter(Boolean);
        case 'upcoming_trip':
            const next30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            const today = new Date().toISOString().split('T')[0];
            const { data: bk } = await window.supabase.from('bookings')
                .select('client_id, clients(id, name, phone)')
                .gte('travel_date', today).lte('travel_date', next30).eq('status', 'confirmed');
            return (bk || []).map(b => b.clients).filter(Boolean);
    }
    const { data } = await query.not('phone', 'is', null);
    return data || [];
}

function updatePreview() {
    const msg = document.getElementById('campMessage').value;
    const sample = msg.replace(/{name}/g, 'Priya Sharma').replace(/{destination}/g, 'Goa');
    document.getElementById('campPreview').textContent = sample || 'Message preview…';
}

// ── Save / send campaign ──────────────────────────────────────
async function openNewCampaign() {
    editingCampId = null;
    document.getElementById('campName').value = '';
    document.getElementById('campChannel').value = 'whatsapp';
    document.getElementById('campAudience').value = 'all_clients';
    document.getElementById('campTemplate').value = '';
    document.getElementById('campMessage').value = '';
    document.getElementById('campSchedule').value = '';
    updatePreview();
    await previewRecipients();
    document.getElementById('campaignModal').classList.add('open');
}

function closeCampaignModal() {
    document.getElementById('campaignModal').classList.remove('open');
}

async function saveCampaign(sendNow) {
    const name = document.getElementById('campName').value.trim();
    const msg = document.getElementById('campMessage').value.trim();
    if (!name) { showToast('Campaign name is required', 'error'); return; }
    if (!msg) { showToast('Message body is required', 'error'); return; }

    const audience = document.getElementById('campAudience').value;
    const recipients = recipientsCache.length > 0 ? recipientsCache : await fetchAudience(audience);
    const scheduledAt = document.getElementById('campSchedule').value || null;
    const userId = await getCurrentUserId();

    const { data: camp, error } = await window.supabase.from('campaigns').insert({
        name,
        channel: document.getElementById('campChannel').value,
        audience,
        message_body: msg,
        status: sendNow ? 'running' : 'draft',
        total_count: recipients.length,
        sent_count: 0,
        failed_count: 0,
        scheduled_at: scheduledAt,
        created_by: userId
    }).select('id').single();

    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }

    // Insert recipient rows
    if (recipients.length > 0) {
        const rows = recipients.map(c => ({
            campaign_id: camp.id,
            client_id: c.id || null,
            phone: c.phone || null,
            status: 'pending'
        }));
        await window.supabase.from('campaign_recipients').insert(rows);
    }

    closeCampaignModal();
    showToast(sendNow ? `Sending to ${recipients.length} recipients…` : 'Campaign saved as draft');

    if (sendNow && !scheduledAt) {
        sendCampaignMessages(camp.id, recipients, msg);
    }

    logAudit('create', 'campaigns', camp.id, { audience, count: recipients.length });
    loadCampaigns();
}

// ── Actual send loop ──────────────────────────────────────────
async function sendCampaignMessages(campId, recipients, messageTemplate) {
    let sentCount = 0; let failedCount = 0;

    for (const client of recipients) {
        if (!client.phone) { failedCount++; continue; }
        const personalMsg = messageTemplate.replace(/{name}/g, client.name || 'Valued Customer');
        try {
            const res = await fetch(WHATSAPP_WORKER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: client.phone, message: personalMsg })
            });
            const ok = res.ok;
            await window.supabase.from('campaign_recipients')
                .update({ status: ok ? 'sent' : 'failed', sent_at: new Date().toISOString() })
                .eq('campaign_id', campId).eq('client_id', client.id);
            if (ok) sentCount++; else failedCount++;
        } catch {
            failedCount++;
        }
        // Brief pause to avoid rate limits
        await new Promise(r => setTimeout(r, 150));
    }

    await window.supabase.from('campaigns').update({
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString()
    }).eq('id', campId);

    showToast(`Campaign done: ${sentCount} sent, ${failedCount} failed`);
    loadCampaigns();
}

async function launchCampaign(campId) {
    const { data: camp } = await window.supabase.from('campaigns').select('*').eq('id', campId).single();
    if (!camp) return;
    const conf = confirm(`Send "${camp.name}" to ${camp.total_count} recipients now?`);
    if (!conf) return;
    const { data: recips } = await window.supabase.from('campaign_recipients')
        .select('client_id, phone, clients(name)').eq('campaign_id', campId).eq('status', 'pending');
    const list = (recips || []).map(r => ({ id: r.client_id, phone: r.phone, name: r.clients?.name }));
    await window.supabase.from('campaigns').update({ status: 'running' }).eq('id', campId);
    showToast(`Sending to ${list.length} recipients…`);
    sendCampaignMessages(campId, list, camp.message_body);
    loadCampaigns();
}

async function viewRecipients(campId) {
    const { data } = await window.supabase.from('campaign_recipients')
        .select('phone, status, sent_at, clients(name)').eq('campaign_id', campId).order('status');
    if (!data) return;
    const lines = data.map(r => `${r.clients?.name || 'Unknown'} (${r.phone}) — ${r.status}`).join('\n');
    alert('Recipients:\n\n' + lines);
}
