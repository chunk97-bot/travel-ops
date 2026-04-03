// ============================================================
// templates.js — WhatsApp / Email message templates
// ============================================================

let allTemplates = [];
let editingTemplateId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadTemplates();
    document.getElementById('addTemplateBtn')?.addEventListener('click', openAddTemplate);
    document.getElementById('closeTplModal')?.addEventListener('click', () => closeModal('tplModal'));
    document.getElementById('cancelTplBtn')?.addEventListener('click', () => closeModal('tplModal'));
    document.getElementById('tplModalOverlay')?.addEventListener('click', () => closeModal('tplModal'));
    document.getElementById('saveTplBtn')?.addEventListener('click', saveTemplate);
    document.getElementById('filterTplChannel')?.addEventListener('change', filterTemplates);
    document.getElementById('filterTplCat')?.addEventListener('change', filterTemplates);
    document.getElementById('closeSendModal')?.addEventListener('click', () => closeModal('sendModal'));
    document.getElementById('sendModalOverlay')?.addEventListener('click', () => closeModal('sendModal'));
    document.getElementById('cancelSendBtn')?.addEventListener('click', () => closeModal('sendModal'));
    document.getElementById('sendNowBtn')?.addEventListener('click', sendMessage);
    // Preview: update as user edits body
    document.getElementById('tplBody')?.addEventListener('input', updatePreview);
});

async function loadTemplates() {
    const { data } = await window.supabase.from('message_templates').select('*').order('created_at');
    allTemplates = data || [];
    renderTemplates(allTemplates);
}

function filterTemplates() {
    const ch  = document.getElementById('filterTplChannel')?.value || '';
    const cat = document.getElementById('filterTplCat')?.value || '';
    const filtered = allTemplates.filter(t => {
        if (ch && t.channel !== ch) return false;
        if (cat && t.category !== cat) return false;
        return true;
    });
    renderTemplates(filtered);
}

function renderTemplates(templates) {
    const grid = document.getElementById('tplGrid');
    if (!templates.length) { grid.innerHTML = '<div class="empty-state">No templates yet.</div>'; return; }
    grid.innerHTML = templates.map(t => `
        <div class="tpl-card">
            <div class="tpl-card-header">
                <div class="tpl-name">${escHtml(t.name)}</div>
                <div class="tpl-badges">
                    <span class="badge badge-${t.channel}">${t.channel}</span>
                    ${t.category ? `<span class="badge" style="background:rgba(255,255,255,0.08)">${t.category?.replace(/_/g,' ')}</span>` : ''}
                </div>
            </div>
            ${t.subject ? `<div class="tpl-subject">Subject: <em>${escHtml(t.subject)}</em></div>` : ''}
            <div class="tpl-body">${escHtml(t.body)}</div>
            <div class="tpl-actions">
                <button class="btn-primary" onclick="openSendModal('${t.id}')">Use Template</button>
                <button class="btn-secondary" onclick="openEditTemplate('${t.id}')">Edit</button>
                <button class="btn-danger" onclick="deleteTemplate('${t.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function openAddTemplate() {
    editingTemplateId = null;
    document.getElementById('tplModalTitle').textContent = 'New Template';
    document.getElementById('tplForm').reset();
    document.getElementById('tplPreview').textContent = '';
    openModal('tplModal');
}

function openEditTemplate(id) {
    const t = allTemplates.find(x => x.id === id);
    if (!t) return;
    editingTemplateId = id;
    document.getElementById('tplModalTitle').textContent = 'Edit Template';
    document.getElementById('tplName').value = t.name || '';
    document.getElementById('tplChannel').value = t.channel || 'whatsapp';
    document.getElementById('tplCategory').value = t.category || '';
    document.getElementById('tplSubject').value = t.subject || '';
    document.getElementById('tplBody').value = t.body || '';
    updatePreview();
    openModal('tplModal');
}

function updatePreview() {
    const body = document.getElementById('tplBody')?.value || '';
    const preview = body
        .replace(/{{name}}/g, 'Rajesh Kumar')
        .replace(/{{destination}}/g, 'Goa')
        .replace(/{{travel_date}}/g, '15-Apr-2026')
        .replace(/{{booking_ref}}/g, 'BKG-2026-0042')
        .replace(/{{amount}}/g, '₹45,000')
        .replace(/{{balance}}/g, '₹15,000')
        .replace(/{{nights}}/g, '4')
        .replace(/{{agency_name}}/g, 'My Travel Agency');
    document.getElementById('tplPreview').textContent = preview;
}

async function saveTemplate() {
    const name = document.getElementById('tplName')?.value.trim();
    const body = document.getElementById('tplBody')?.value.trim();
    if (!name || !body) { showToast('Name and body required', 'error'); return; }
    const payload = {
        name,
        channel: document.getElementById('tplChannel')?.value || 'whatsapp',
        category: document.getElementById('tplCategory')?.value || null,
        subject: document.getElementById('tplSubject')?.value.trim() || null,
        body,
        created_by: await getCurrentUserId(),
    };
    let error;
    if (editingTemplateId) {
        ({ error } = await window.supabase.from('message_templates').update(payload).eq('id', editingTemplateId));
    } else {
        ({ error } = await window.supabase.from('message_templates').insert(payload));
    }
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast(editingTemplateId ? 'Template updated' : 'Template saved');
    closeModal('tplModal');
    await loadTemplates();
}

async function deleteTemplate(id) {
    if (!confirm('Delete this template?')) return;
    await window.supabase.from('message_templates').delete().eq('id', id);
    showToast('Deleted');
    await loadTemplates();
}

// ── Send Modal ────────────────────────────────────────────
let sendTemplateId = null;
async function openSendModal(templateId) {
    sendTemplateId = templateId;
    const t = allTemplates.find(x => x.id === templateId);
    document.getElementById('sendTplName').textContent = t.name;
    // Load clients for recipient
    const { data } = await window.supabase.from('clients').select('id, name, phone, email').order('name');
    const sel = document.getElementById('sendRecipient');
    sel.innerHTML = '<option value="">— Select Client —</option>' +
        (data || []).map(c => `<option value="${c.id}" data-phone="${c.phone||''}" data-email="${c.email||''}" data-name="${c.name||''}">${escHtml(c.name)}</option>`).join('');
    sel.onchange = function() {
        const opt = sel.options[sel.selectedIndex];
        document.getElementById('sendTo').value = opt.dataset.phone || opt.dataset.email || '';
        // Pre-fill body
        const body = t.body.replace(/{{name}}/g, opt.dataset.name);
        document.getElementById('sendBody').value = body;
    };
    document.getElementById('sendBody').value = t.body;
    document.getElementById('sendChannel').value = t.channel;
    openModal('sendModal');
}

async function sendMessage() {
    const to = document.getElementById('sendTo')?.value.trim();
    const body = document.getElementById('sendBody')?.value.trim();
    const channel = document.getElementById('sendChannel')?.value;
    if (!to || !body) { showToast('Recipient and message required', 'error'); return; }
    // Dispatch to worker
    const workerUrl = channel === 'whatsapp'
        ? 'https://travel-ops-whatsapp.YOUR_SUBDOMAIN.workers.dev'
        : 'https://travel-ops-email.YOUR_SUBDOMAIN.workers.dev';
    try {
        const resp = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, message: body, subject: 'Message from Travel Ops' }),
        });
        const result = await resp.json();
        if (result.success) { showToast('Sent!'); closeModal('sendModal'); }
        else showToast('Send failed: ' + (result.error || 'Unknown'), 'error');
    } catch {
        showToast('Worker not configured yet. Copy message below and send manually.', 'error');
    }
}
