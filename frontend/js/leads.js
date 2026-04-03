// ============================================================
// leads.js — Full leads management: table, kanban, CRUD, drawer
// ============================================================

let allLeads = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let currentView = 'table';
let editingLeadId = null;
let myLeadsOnly = false;
let currentUserId = null;

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    currentUserId = await getCurrentUserId();
    // Sales role defaults to My Leads view
    if (typeof hasRole === 'function' && hasRole(['sales'])) {
        myLeadsOnly = true;
    }
    await loadLeads();
    await loadStaffOptions(document.getElementById('filterAssigned'));
    await loadStaffOptions(document.getElementById('leadAssigned'), false);

    // My Leads toggle
    const myLeadsBtn = document.getElementById('myLeadsToggle');
    if (myLeadsBtn) {
        myLeadsBtn.classList.toggle('active', myLeadsOnly);
        myLeadsBtn.addEventListener('click', () => {
            myLeadsOnly = !myLeadsOnly;
            myLeadsBtn.classList.toggle('active', myLeadsOnly);
            currentPage = 1;
            filterAndRender();
        });
    }

    // Filters
    ['searchLeads','filterStage','filterSource','filterAssigned'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', filterAndRender);
    });

    // View toggle
    document.getElementById('viewTable')?.addEventListener('click', () => switchView('table'));
    document.getElementById('viewKanban')?.addEventListener('click', () => switchView('kanban'));

    // Add Lead modal
    document.getElementById('addLeadBtn')?.addEventListener('click', () => openAddLead());
    document.getElementById('cancelLeadBtn')?.addEventListener('click', () => closeModal('leadModal'));
    document.getElementById('closeLeadModal')?.addEventListener('click', () => closeModal('leadModal'));
    document.getElementById('leadModalOverlay')?.addEventListener('click', () => closeModal('leadModal'));
    document.getElementById('leadForm')?.addEventListener('submit', saveLead);

    // Drawer close
    document.getElementById('closeDrawer')?.addEventListener('click', () => closeDrawer('leadDrawer'));
    document.getElementById('leadDrawerOverlay')?.addEventListener('click', () => closeDrawer('leadDrawer'));
});

// ── Load leads from Supabase ──────────────────────────────
async function loadLeads() {
    let query = window.supabase
        .from('leads')
        .select(`*, staff_profiles(name)`)
        .order('created_at', { ascending: false });

    // Assignment enforcement: sales role only sees their own leads by default
    if (myLeadsOnly && currentUserId) {
        query = query.eq('assigned_to', currentUserId);
    }

    const { data, error } = await query;
    if (error) { showToast('Failed to load leads', 'error'); return; }
    allLeads = data || [];
    filterAndRender();
}

// ── Filter + Render ───────────────────────────────────────
function filterAndRender() {
    const search = document.getElementById('searchLeads')?.value.toLowerCase() || '';
    const stage = document.getElementById('filterStage')?.value || '';
    const source = document.getElementById('filterSource')?.value || '';
    const assigned = document.getElementById('filterAssigned')?.value || '';

    let filtered = allLeads.filter(l => {
        if (stage && l.stage !== stage) return false;
        if (source && l.source !== source) return false;
        if (assigned && l.assigned_to !== assigned) return false;
        if (search) {
            const hay = [l.name, l.phone, l.email, l.destination].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    if (currentView === 'table') renderTable(filtered);
    else renderKanban(filtered);
}

// ── Table render ──────────────────────────────────────────
function renderTable(leads) {
    const tbody = document.getElementById('leadsTable');
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = leads.slice(start, start + PAGE_SIZE);

    if (!page.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No leads found</td></tr>';
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
}

// ── Kanban render ─────────────────────────────────────────
function renderKanban(leads) {
    const stages = ['new','contacted','quoted','negotiating','confirmed'];
    stages.forEach(stage => {
        const col = document.querySelector(`#kanban-${stage} .kanban-cards`);
        const count = document.querySelector(`#kanban-${stage} .col-count`);
        if (!col) return;
        const stageLeads = leads.filter(l => l.stage === stage);
        if (count) count.textContent = stageLeads.length;
        col.innerHTML = stageLeads.length
            ? stageLeads.map(l => `
                <div class="kanban-card" onclick="openLeadDrawer('${l.id}')">
                    <div class="kanban-card-name">${escHtml(l.name)}</div>
                    <div class="kanban-card-dest">✈ ${escHtml(l.destination || 'TBD')}</div>
                    <div class="kanban-card-date">${formatDate(l.travel_date)} · ${escHtml(l.budget_range || '—')}</div>
                </div>
            `).join('')
            : '<p style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:20px 0">Empty</p>';
    });
}

// ── Lead Drawer ───────────────────────────────────────────
async function openLeadDrawer(leadId) {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;

    document.getElementById('drawerLeadName').textContent = lead.name;

    // Load activities
    const { data: activities } = await window.supabase
        .from('lead_activities')
        .select('*, staff_profiles(name)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

    // Load follow-ups
    const { data: followups } = await window.supabase
        .from('follow_ups')
        .select('*')
        .eq('lead_id', leadId)
        .eq('is_done', false)
        .order('due_date');

    document.getElementById('drawerBody').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
            <div><p style="color:var(--text-muted);font-size:0.78rem">Phone</p><p>${escHtml(lead.phone)}</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Email</p><p>${escHtml(lead.email||'—')}</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Destination</p><p>${escHtml(lead.destination||'—')}</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Travel Date</p><p>${formatDate(lead.travel_date)}</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Pax</p><p>${lead.pax_adults||1} adults, ${lead.pax_children||0} children</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Budget</p><p>${escHtml(lead.budget_range||'—')}</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Source</p><p>${escHtml(lead.source||'—')}</p></div>
            <div><p style="color:var(--text-muted);font-size:0.78rem">Stage</p><p>${stageBadge(lead.stage)}</p></div>
        </div>

        <div style="margin-bottom:20px">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn-primary" style="font-size:0.82rem;padding:6px 12px" onclick="window.open('https://wa.me/91${escHtml(lead.phone?.replace(/\D/g,''))}','_blank')">💬 WhatsApp</button>
                <button class="btn-secondary" style="font-size:0.82rem;padding:6px 12px" onclick="quickStageUpdate('${lead.id}')">↑ Move Stage</button>
                <button class="btn-secondary" style="font-size:0.82rem;padding:6px 12px" onclick="window.location.href='itinerary.html?lead=${lead.id}'">🗺 Build Itinerary</button>
                <button class="btn-secondary" style="font-size:0.82rem;padding:6px 12px" onclick="openEditLead('${lead.id}');closeDrawer('leadDrawer')">✏ Edit</button>
            </div>
        </div>

        ${followups?.length ? `
        <h4 style="margin-bottom:8px;font-size:0.9rem">Pending Follow-ups</h4>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
            ${followups.map(f => `
                <div style="background:var(--bg-input);border-radius:6px;padding:8px 12px;font-size:0.85rem">
                    <span>${f.type === 'call' ? '📞' : f.type === 'whatsapp' ? '💬' : '📧'}</span>
                    <span style="margin-left:6px">${formatDate(f.due_date)}</span>
                    ${f.message ? `<p style="color:var(--text-muted);margin-top:4px">${escHtml(f.message)}</p>` : ''}
                </div>
            `).join('')}
        </div>` : ''}

        <h4 style="margin-bottom:8px;font-size:0.9rem">Log Activity</h4>
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
            <select id="activityType" style="background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:0.85rem">
                <option value="call">📞 Call</option>
                <option value="whatsapp">💬 WhatsApp</option>
                <option value="email">📧 Email</option>
                <option value="note">📝 Note</option>
            </select>
            <input type="text" id="activityNote" placeholder="Outcome / notes..." style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:0.85rem;min-width:120px">
            <button class="btn-primary" style="font-size:0.82rem;padding:6px 12px" onclick="logActivity('${lead.id}')">Log</button>
        </div>

        <h4 style="margin-bottom:8px;font-size:0.9rem">Activity History</h4>
        <div style="display:flex;flex-direction:column;gap:6px">
            ${activities?.length ? activities.map(a => `
                <div style="background:var(--bg-input);border-radius:6px;padding:8px 12px;font-size:0.82rem">
                    <span style="color:var(--text-muted)">${formatDate(a.created_at)}</span>
                    <span style="margin-left:8px;background:var(--bg-card);padding:2px 7px;border-radius:4px">${escHtml(a.type)}</span>
                    ${a.staff_profiles?.name ? `<span style="margin-left:6px;color:var(--text-muted)">${escHtml(a.staff_profiles.name)}</span>` : ''}
                    ${a.notes ? `<p style="margin-top:4px;color:var(--text-primary)">${escHtml(a.notes)}</p>` : ''}
                </div>
            `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem">No activity yet</p>'}
        </div>
    `;

    openDrawer('leadDrawer');
}

// ── Log Activity ──────────────────────────────────────────
async function logActivity(leadId) {
    const type = document.getElementById('activityType')?.value;
    const notes = document.getElementById('activityNote')?.value.trim();
    if (!notes) return;
    const userId = await getCurrentUserId();
    const { error } = await window.supabase.from('lead_activities').insert({ lead_id: leadId, staff_id: userId, type, notes });
    if (error) { showToast('Failed to log activity', 'error'); return; }
    showToast('Activity logged');
    openLeadDrawer(leadId); // refresh drawer
}

// ── Quick Stage Move ──────────────────────────────────────
async function quickStageUpdate(leadId) {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;
    const stages = ['new','contacted','quoted','negotiating','confirmed'];
    const idx = stages.indexOf(lead.stage);
    const nextStage = stages[idx + 1];
    if (!nextStage) { showToast('Already at final stage'); return; }
    const { error } = await window.supabase.from('leads').update({ stage: nextStage }).eq('id', leadId);
    if (error) { showToast('Failed to update stage', 'error'); return; }
    showToast(`Moved to ${nextStage}`);
    await loadLeads();
    openLeadDrawer(leadId);
}

// ── Add / Edit Lead Modal ─────────────────────────────────
function openAddLead() {
    editingLeadId = null;
    document.getElementById('leadModalTitle').textContent = 'New Lead';
    document.getElementById('leadForm').reset();
    openModal('leadModal');
}

async function openEditLead(leadId) {
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) return;
    editingLeadId = leadId;
    document.getElementById('leadModalTitle').textContent = 'Edit Lead';
    document.getElementById('leadName').value = lead.name || '';
    document.getElementById('leadPhone').value = lead.phone || '';
    document.getElementById('leadEmail').value = lead.email || '';
    document.getElementById('leadSource').value = lead.source || 'whatsapp';
    document.getElementById('leadDestination').value = lead.destination || '';
    document.getElementById('leadTripType').value = lead.trip_type || 'leisure';
    document.getElementById('leadTravelDate').value = lead.travel_date || '';
    document.getElementById('leadReturnDate').value = lead.return_date || '';
    document.getElementById('leadPaxAdults').value = lead.pax_adults || 2;
    document.getElementById('leadPaxChildren').value = lead.pax_children || 0;
    document.getElementById('leadBudget').value = lead.budget_range || '1L-3L';
    document.getElementById('leadAssigned').value = lead.assigned_to || '';
    document.getElementById('leadStage').value = lead.stage || 'new';
    document.getElementById('leadNotes').value = lead.notes || '';
    openModal('leadModal');
}

// ── Save Lead ─────────────────────────────────────────────
async function saveLead(e) {
    e.preventDefault();
    const userId = await getCurrentUserId();
    const payload = {
        name: document.getElementById('leadName').value.trim(),
        phone: document.getElementById('leadPhone').value.trim(),
        email: document.getElementById('leadEmail').value.trim() || null,
        source: document.getElementById('leadSource').value,
        destination: document.getElementById('leadDestination').value.trim() || null,
        trip_type: document.getElementById('leadTripType').value,
        travel_date: document.getElementById('leadTravelDate').value || null,
        return_date: document.getElementById('leadReturnDate').value || null,
        pax_adults: parseInt(document.getElementById('leadPaxAdults').value) || 1,
        pax_children: parseInt(document.getElementById('leadPaxChildren').value) || 0,
        budget_range: document.getElementById('leadBudget').value,
        assigned_to: document.getElementById('leadAssigned').value || userId,
        stage: document.getElementById('leadStage').value,
        notes: document.getElementById('leadNotes').value.trim() || null,
    };

    let error;
    if (editingLeadId) {
        ({ error } = await window.supabase.from('leads').update(payload).eq('id', editingLeadId));
    } else {
        ({ error } = await window.supabase.from('leads').insert(payload));
    }

    if (error) { showToast('Failed to save lead: ' + error.message, 'error'); return; }
    showToast(editingLeadId ? 'Lead updated' : 'Lead added');
    closeModal('leadModal');
    await loadLeads();
}

// ── View switch ───────────────────────────────────────────
function switchView(view) {
    currentView = view;
    document.getElementById('tableView').classList.toggle('hidden', view !== 'table');
    document.getElementById('kanbanView').classList.toggle('hidden', view !== 'kanban');
    document.getElementById('viewTable').classList.toggle('active', view === 'table');
    document.getElementById('viewKanban').classList.toggle('active', view === 'kanban');
    filterAndRender();
}

// ── Pagination ────────────────────────────────────────────
function renderPagination(total) {
    const pages = Math.ceil(total / PAGE_SIZE);
    const el = document.getElementById('pagination');
    if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
    el.innerHTML = Array.from({length: pages}, (_, i) =>
        `<button class="page-btn ${currentPage === i+1 ? 'active' : ''}" onclick="goPage(${i+1})">${i+1}</button>`
    ).join('');
}

function goPage(p) { currentPage = p; filterAndRender(); }
