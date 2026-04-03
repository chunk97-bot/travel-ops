// ============================================================
// clients.js — Client 360° profile management
// ============================================================

let allClients = [];
let editingClientId = null;
let clientPage = 1;
const CLIENT_PAGE_SIZE = 30;
let clientTotal = 0;
let clientSearchQ = '';
let clientSegFilter = '';
let clientTagFilter = '';

document.addEventListener('DOMContentLoaded', async () => {
    await loadClients();
    document.getElementById('addClientBtn')?.addEventListener('click', openAddClient);
    document.getElementById('searchClients')?.addEventListener('input', e => {
        clientSearchQ = e.target.value.toLowerCase();
        clientPage = 1;
        loadClients();
    });
    document.getElementById('filterSegment')?.addEventListener('change', e => {
        clientSegFilter = e.target.value;
        clientPage = 1;
        loadClients();
    });
    document.getElementById('filterTag')?.addEventListener('change', e => {
        clientTagFilter = e.target.value;
        clientPage = 1;
        loadClients();
    });
    document.getElementById('closeClientModal')?.addEventListener('click', () => closeModal('clientModal'));
    document.getElementById('cancelClientBtn')?.addEventListener('click', () => closeModal('clientModal'));
    document.getElementById('clientModalOverlay')?.addEventListener('click', () => closeModal('clientModal'));
    document.getElementById('saveClientBtn')?.addEventListener('click', saveClient);
    document.getElementById('drawerOverlay')?.addEventListener('click', () => closeDrawer('clientDrawer'));
});

async function loadClients() {
    let query = window.supabase
        .from('clients')
        .select('*, client_visas(count), invoices(count)', { count: 'exact' })
        .order('name');

    if (clientSearchQ) {
        query = query.or(`name.ilike.%${clientSearchQ}%,phone.ilike.%${clientSearchQ}%,email.ilike.%${clientSearchQ}%`);
    }
    if (clientSegFilter) query = query.eq('segment', clientSegFilter);

    const start = (clientPage - 1) * CLIENT_PAGE_SIZE;
    query = query.range(start, start + CLIENT_PAGE_SIZE - 1);

    const { data, count } = await query;
    allClients = data || [];
    clientTotal = count || 0;
    renderClientGrid(allClients);
    renderClientPagination();
    document.getElementById('clientCount').textContent = clientTotal;
}

function renderClientPagination() {
    const el = document.getElementById('clientPagination');
    if (!el) return;
    const pages = Math.ceil(clientTotal / CLIENT_PAGE_SIZE);
    if (pages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = Array.from({ length: pages }, (_, i) =>
        `<button class="page-btn ${clientPage === i + 1 ? 'active' : ''}" onclick="goClientPage(${i + 1})">${i + 1}</button>`
    ).join('');
}

function goClientPage(p) { clientPage = p; loadClients(); }



function renderClientGrid(clients) {
    const grid = document.getElementById('clientGrid');
    if (!clients.length) { grid.innerHTML = '<div class="empty-state">No clients yet.</div>'; return; }
    grid.innerHTML = clients.map(c => `
        <div class="client-card" onclick="openClientDrawer('${c.id}')">
            <div class="client-avatar">${escHtml(c.name.charAt(0).toUpperCase())}</div>
            <div class="client-info">
                <div class="client-name">${escHtml(c.name)}</div>
                <div class="client-sub">${escHtml(c.phone || '')} ${c.email ? '· ' + escHtml(c.email) : ''}</div>
                <div class="client-sub">${c.city ? '📍 ' + escHtml(c.city) : ''} ${c.segment ? '· ' + escHtml(c.segment) : ''}</div>
                ${c.tags?.length ? `<div class="client-tags">${c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
            </div>
            <div class="client-stats">
                <div class="client-stat">${c.invoices?.[0]?.count || 0} trips</div>
            </div>
        </div>
    `).join('');
}

function openAddClient() {
    editingClientId = null;
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('clientForm').reset();
    openModal('clientModal');
}

function openEditClient(clientId) {
    const c = allClients.find(x => x.id === clientId);
    if (!c) return;
    editingClientId = clientId;
    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    ['cName','cEmail','cPhone','cAltPhone','cDob','cAnniversary','cCity','cAddress','cGstin','cPan','cPassport','cPassportExpiry','cNationality','cNotes'].forEach(id => {
        const field = id.replace('c','').replace(/([A-Z])/g, '_$1').toLowerCase().slice(1);
        const el = document.getElementById(id);
        const map = {
            cName:'name', cEmail:'email', cPhone:'phone', cAltPhone:'alt_phone',
            cDob:'dob', cAnniversary:'anniversary', cCity:'city', cAddress:'address',
            cGstin:'gstin', cPan:'pan', cPassport:'passport_number',
            cPassportExpiry:'passport_expiry', cNationality:'nationality', cNotes:'notes'
        };
        if (el && map[id] !== undefined) el.value = c[map[id]] || '';
    });
    document.getElementById('cSegment').value = c.segment || 'leisure';
    openModal('clientModal');
}

async function saveClient() {
    const name = document.getElementById('cName')?.value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    const phone = document.getElementById('cPhone')?.value.trim() || null;
    const email = document.getElementById('cEmail')?.value.trim() || null;

    // Duplicate detection (skip for self when editing)
    if (phone || email) {
        let dupQuery = window.supabase.from('clients').select('id, name');
        if (phone && email) dupQuery = dupQuery.or(`phone.eq.${phone},email.eq.${email}`);
        else if (phone) dupQuery = dupQuery.eq('phone', phone);
        else dupQuery = dupQuery.eq('email', email);
        const { data: dups } = await dupQuery;
        const realDups = (dups || []).filter(d => d.id !== editingClientId);
        if (realDups.length) {
            if (!confirm(`A client with this phone/email already exists: "${realDups[0].name}". Save anyway?`)) return;
        }
    }

    const payload = {
        name,
        email,
        phone,
        alt_phone: document.getElementById('cAltPhone')?.value.trim() || null,
        dob: document.getElementById('cDob')?.value || null,
        anniversary: document.getElementById('cAnniversary')?.value || null,
        city: document.getElementById('cCity')?.value.trim() || null,
        address: document.getElementById('cAddress')?.value.trim() || null,
        gstin: document.getElementById('cGstin')?.value.trim() || null,
        pan: document.getElementById('cPan')?.value.trim().toUpperCase() || null,
        passport_number: document.getElementById('cPassport')?.value.trim().toUpperCase() || null,
        passport_expiry: document.getElementById('cPassportExpiry')?.value || null,
        nationality: document.getElementById('cNationality')?.value.trim() || null,
        segment: document.getElementById('cSegment')?.value || 'leisure',
        notes: document.getElementById('cNotes')?.value.trim() || null,
        created_by: await getCurrentUserId(),
    };
    let error;
    if (editingClientId) {
        ({ error } = await window.supabase.from('clients').update(payload).eq('id', editingClientId));
    } else {
        ({ error } = await window.supabase.from('clients').insert(payload));
    }
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast(editingClientId ? 'Client updated' : 'Client added');
    closeModal('clientModal');
    await loadClients();
}

async function openClientDrawer(clientId) {
    const c = allClients.find(x => x.id === clientId);
    if (!c) return;
    document.getElementById('drawerClientName').textContent = c.name;
    const body = document.getElementById('drawerBody');
    body.innerHTML = '<div style="color:var(--text-muted)">Loading...</div>';
    openDrawer('clientDrawer');

    // Load trips + invoices for this client
    const [{ data: invoices }, { data: visas }] = await Promise.all([
        window.supabase.from('invoices').select('invoice_number, total_amount, status, travel_date').eq('client_id', clientId).order('created_at', { ascending: false }),
        window.supabase.from('client_visas').select('*').eq('client_id', clientId),
    ]);

    body.innerHTML = `
        <div class="drawer-section">
            <h4>Contact</h4>
            <p>${c.phone || '—'} ${c.email ? '· ' + escHtml(c.email) : ''}</p>
            <p>${c.city ? '📍 ' + escHtml(c.city) : ''}</p>
        </div>
        <div class="drawer-section">
            <h4>Profile</h4>
            <p>DOB: ${formatDate(c.dob)} ${c.anniversary ? '· Anniversary: ' + formatDate(c.anniversary) : ''}</p>
            <p>PAN: ${escHtml(c.pan || '—')} · Passport: ${escHtml(c.passport_number || '—')}</p>
            <p>Segment: <strong>${escHtml(c.segment || '—')}</strong></p>
        </div>
        <div class="drawer-section">
            <h4>Trip History (${invoices?.length || 0})</h4>
            ${(invoices || []).map(i => `
                <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:4px 0;border-bottom:1px solid var(--border)">
                    <span>${escHtml(i.invoice_number)}</span>
                    <span>${formatDate(i.travel_date)}</span>
                    <span>${formatINR(i.total_amount)}</span>
                    <span>${invoiceBadge(i.status)}</span>
                </div>
            `).join('') || '<p style="color:var(--text-muted)">No trips yet</p>'}
        </div>
        ${visas?.length ? `
        <div class="drawer-section">
            <h4>Visas (${visas.length})</h4>
            ${visas.map(v => `<div style="font-size:0.85rem;padding:3px 0">${escHtml(v.country)} — ${escHtml(v.visa_type || '')} · Expiry: ${formatDate(v.expiry_date)}</div>`).join('')}
        </div>` : ''}
        ${c.notes ? `<div class="drawer-section"><h4>Notes</h4><p>${escHtml(c.notes)}</p></div>` : ''}
        <div class="drawer-section">
            <h4>Activity Timeline</h4>
            <div id="clientActivityTimeline"><p style="color:var(--text-muted);font-size:0.85rem">Loading...</p></div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
            <button class="btn-secondary" onclick="openEditClient('${clientId}');closeDrawer('clientDrawer')">Edit</button>
            ${typeof openCallDialog === 'function' && c.phone ? `<button class="btn-secondary" onclick="openCallDialog('${escHtml(c.phone)}',null,'${clientId}')">📞 Call</button>` : ''}
            ${typeof openEmailComposer === 'function' && c.email ? `<button class="btn-secondary" onclick="openEmailComposer({to:'${escHtml(c.email)}',clientId:'${clientId}'})">📧 Email</button>` : ''}
            <button class="btn-danger" onclick="deleteClient('${clientId}')">Delete</button>
        </div>
    `;

    // Load activity timeline
    if (typeof loadActivityTimeline === 'function') {
        loadActivityTimeline(document.getElementById('clientActivityTimeline'), { clientId });
    }
}

async function deleteClient(clientId) {
    if (!confirm('Delete this client? All associated data will remain but unlinked.')) return;
    const { error } = await window.supabase.from('clients').delete().eq('id', clientId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Client deleted');
    closeDrawer('clientDrawer');
    await loadClients();
}
