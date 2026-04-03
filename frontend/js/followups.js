// ============================================================
// followups.js — Follow-up scheduler
// ============================================================

let allFollowups = [];
let activeTab = 'today';

document.addEventListener('DOMContentLoaded', async () => {
    await loadLeadOptions();
    await loadFollowups();

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('addFollowupBtn')?.addEventListener('click', openAddFollowup);
    document.getElementById('closeFollowupModal')?.addEventListener('click', () => closeModal('followupModal'));
    document.getElementById('cancelFollowupBtn')?.addEventListener('click', () => closeModal('followupModal'));
    document.getElementById('followupModalOverlay')?.addEventListener('click', () => closeModal('followupModal'));
    document.getElementById('saveFollowupBtn')?.addEventListener('click', saveFollowup);

    // Set default due date to today
    const due = document.getElementById('fDueDate');
    if (due) due.value = new Date().toISOString().split('T')[0];
});

async function loadLeadOptions() {
    const { data } = await window.supabase.from('leads').select('id, name').order('name');
    const sel = document.getElementById('fLeadId');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Lead —</option>' +
        (data || []).map(l => `<option value="${l.id}">${escHtml(l.name)}</option>`).join('');
}

async function loadFollowups() {
    const { data } = await window.supabase
        .from('follow_ups')
        .select('*, leads(name, phone, stage)')
        .order('due_date', { ascending: true });

    allFollowups = data || [];
    updateTabCounts();
    renderActiveTab();
}

function updateTabCounts() {
    const today = new Date().toISOString().split('T')[0];
    const counts = {
        overdue: allFollowups.filter(f => f.status === 'pending' && f.due_date < today).length,
        today:   allFollowups.filter(f => f.status === 'pending' && f.due_date === today).length,
        upcoming:allFollowups.filter(f => f.status === 'pending' && f.due_date > today).length,
        done:    allFollowups.filter(f => f.status === 'done').length,
    };
    Object.entries(counts).forEach(([tab, count]) => {
        const el = document.getElementById(`count-${tab}`);
        if (el) el.textContent = count;
    });
}

function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderActiveTab();
}

function renderActiveTab() {
    const today = new Date().toISOString().split('T')[0];
    const filtered = allFollowups.filter(f => {
        if (activeTab === 'overdue')  return f.status === 'pending' && f.due_date < today;
        if (activeTab === 'today')    return f.status === 'pending' && f.due_date === today;
        if (activeTab === 'upcoming') return f.status === 'pending' && f.due_date > today;
        if (activeTab === 'done')     return f.status === 'done';
        return true;
    });
    renderFollowupCards(filtered);
}

function renderFollowupCards(followups) {
    const container = document.getElementById('followupCards');
    if (!followups.length) {
        container.innerHTML = `<div class="empty-state">No follow-ups in this section.</div>`;
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    container.innerHTML = followups.map(f => {
        const isOverdue = f.status === 'pending' && f.due_date < today;
        return `
        <div class="followup-card ${isOverdue ? 'overdue' : ''}">
            <div class="followup-header">
                <div>
                    <div class="followup-lead">${escHtml(f.leads?.name || '—')}</div>
                    <div class="followup-type">${escHtml(f.type)} · ${stageBadge(f.leads?.stage || '')}</div>
                </div>
                <div class="followup-date ${isOverdue ? 'text-danger' : ''}">
                    ${isOverdue ? '<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ ' : ''}${formatDate(f.due_date)}
                </div>
            </div>
            <div class="followup-notes">${escHtml(f.notes || '')}</div>
            <div class="followup-actions">
                ${f.leads?.phone ? `
                    <a href="tel:${escHtml(f.leads.phone)}" class="btn-secondary" style="padding:5px 10px;font-size:0.8rem;text-decoration:none"><i data-lucide="phone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Call</a>
                    <a href="https://wa.me/91${escHtml(f.leads.phone.replace(/\D/g,''))}" target="_blank" class="btn-whatsapp" style="padding:5px 10px;font-size:0.8rem;text-decoration:none">WhatsApp</a>
                ` : ''}
                ${f.status === 'pending' ? `<button class="btn-success" onclick="markDone('${f.id}')"><i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Done</button>` : ''}
                <button class="btn-danger" onclick="deleteFollowup('${f.id}')">Delete</button>
            </div>
        </div>
        `;
    }).join('');
}

function openAddFollowup() {
    document.getElementById('followupModalTitle').textContent = 'Schedule Follow-up';
    document.getElementById('followupForm').reset();
    document.getElementById('fDueDate').value = new Date().toISOString().split('T')[0];
    openModal('followupModal');
}

async function saveFollowup() {
    const leadId = document.getElementById('fLeadId')?.value;
    const type = document.getElementById('fType')?.value;
    const dueDate = document.getElementById('fDueDate')?.value;
    if (!leadId || !type || !dueDate) { showToast('Lead, type and due date are required', 'error'); return; }

    const { error } = await window.supabase.from('follow_ups').insert({
        lead_id: leadId,
        type,
        due_date: dueDate,
        notes: document.getElementById('fNotes')?.value.trim() || null,
        assigned_to: document.getElementById('fAssigned')?.value || await getCurrentUserId(),
        status: 'pending',
        created_by: await getCurrentUserId(),
    });

    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Follow-up scheduled');
    closeModal('followupModal');
    await loadFollowups();
}

async function markDone(followupId) {
    const { error } = await window.supabase
        .from('follow_ups')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', followupId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    // Log activity on lead
    const f = allFollowups.find(f => f.id === followupId);
    if (f?.lead_id) {
        await window.supabase.from('lead_activities').insert({
            lead_id: f.lead_id,
            type: f.type || 'follow_up',
            notes: `Follow-up completed: ${f.notes || ''}`,
            created_by: await getCurrentUserId(),
        });
    }
    showToast('Marked as done');
    await loadFollowups();
}

async function deleteFollowup(followupId) {
    if (!confirm('Delete this follow-up?')) return;
    const { error } = await window.supabase.from('follow_ups').delete().eq('id', followupId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Deleted');
    await loadFollowups();
}
