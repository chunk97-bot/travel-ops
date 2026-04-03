// ============================================================
// clients.js — Client 360° profile management
// ============================================================

let allClients = [];
let editingClientId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadClients();
    document.getElementById('addClientBtn')?.addEventListener('click', openAddClient);
    document.getElementById('searchClients')?.addEventListener('input', filterClients);
    document.getElementById('closeClientModal')?.addEventListener('click', () => closeModal('clientModal'));
    document.getElementById('cancelClientBtn')?.addEventListener('click', () => closeModal('clientModal'));
    document.getElementById('clientModalOverlay')?.addEventListener('click', () => closeModal('clientModal'));
    document.getElementById('saveClientBtn')?.addEventListener('click', saveClient);
    document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
});

async function loadClients() {
    const { data } = await window.supabase
        .from('clients')
        .select('*, client_visas(count), invoices(count)')
        .order('name');
    allClients = data || [];
    renderClientGrid(allClients);
    document.getElementById('clientCount').textContent = allClients.length;
}

function filterClients() {
    const q = document.getElementById('searchClients')?.value.toLowerCase() || '';
    const seg = document.getElementById('filterSegment')?.value || '';
    const filtered = allClients.filter(c => {
        if (seg && c.segment !== seg) return false;
        if (q) {
            const hay = [c.name, c.email, c.phone, c.city].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderClientGrid(filtered);
}

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
    const payload = {
        name,
        email: document.getElementById('cEmail')?.value.trim() || null,
        phone: document.getElementById('cPhone')?.value.trim() || null,
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
    openDrawer();

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
        <div style="margin-top:1rem;display:flex;gap:0.5rem">
            <button class="btn-secondary" onclick="openEditClient('${clientId}');closeDrawer()">Edit</button>
            <button class="btn-danger" onclick="deleteClient('${clientId}')">Delete</button>
        </div>
    `;
}

async function deleteClient(clientId) {
    if (!confirm('Delete this client? All associated data will remain but unlinked.')) return;
    const { error } = await window.supabase.from('clients').delete().eq('id', clientId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Client deleted');
    closeDrawer();
    await loadClients();
}
