// ============================================================
// inventory.js — Supplier Inventory & Allotment Management
// ============================================================

let allInventory = [];
let allVendorsMap = {};
let editingInvId = null;
let bookingInvId = null;
let currentPage = 1;
const PAGE_SIZE = 20;

document.addEventListener('DOMContentLoaded', async () => {
    await loadVendorOptions();
    await loadInventory();

    document.getElementById('addInventoryBtn')?.addEventListener('click', openAddInventory);
    document.getElementById('closeInventoryModal')?.addEventListener('click', () => closeModal('inventoryModal'));
    document.getElementById('cancelInventoryBtn')?.addEventListener('click', () => closeModal('inventoryModal'));
    document.getElementById('inventoryModalOverlay')?.addEventListener('click', () => closeModal('inventoryModal'));
    document.getElementById('inventoryForm')?.addEventListener('submit', saveInventory);

    document.getElementById('closeAllotmentModal')?.addEventListener('click', () => closeModal('allotmentModal'));
    document.getElementById('cancelAllotmentBtn')?.addEventListener('click', () => closeModal('allotmentModal'));
    document.getElementById('allotmentModalOverlay')?.addEventListener('click', () => closeModal('allotmentModal'));
    document.getElementById('allotmentForm')?.addEventListener('submit', bookAllotment);

    document.getElementById('closeAllotmentDrawer')?.addEventListener('click', () => closeDrawer('allotmentDrawer'));
    document.getElementById('allotmentDrawerOverlay')?.addEventListener('click', () => closeDrawer('allotmentDrawer'));

    ['searchInventory','filterVendor','filterType','filterSeason'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', filterAndRender);
        document.getElementById(id)?.addEventListener('change', filterAndRender);
    });
});

// ── Load vendor options ───────────────────────────────────
async function loadVendorOptions() {
    const { data } = await window.supabase.from('vendors').select('id, name').eq('is_active', true).order('name');
    const vendors = data || [];
    allVendorsMap = {};
    vendors.forEach(v => allVendorsMap[v.id] = v.name);

    const opts = vendors.map(v => `<option value="${v.id}">${escHtml(v.name)}</option>`).join('');
    document.getElementById('invVendor').innerHTML = '<option value="">Select vendor</option>' + opts;
    document.getElementById('filterVendor').innerHTML = '<option value="">All Vendors</option>' + opts;
}

// ── Load inventory ────────────────────────────────────────
async function loadInventory() {
    const { data, error } = await window.supabase
        .from('supplier_inventory')
        .select('*, vendors(name)')
        .order('created_at', { ascending: false });
    if (error) { showToast('Failed to load inventory', 'error'); return; }
    allInventory = data || [];
    filterAndRender();
}

// ── Filter + Render ───────────────────────────────────────
function filterAndRender() {
    const search = document.getElementById('searchInventory')?.value.toLowerCase() || '';
    const vendor = document.getElementById('filterVendor')?.value || '';
    const type = document.getElementById('filterType')?.value || '';
    const season = document.getElementById('filterSeason')?.value || '';

    let filtered = allInventory.filter(inv => {
        if (vendor && inv.vendor_id !== vendor) return false;
        if (type && inv.inventory_type !== type) return false;
        if (season && inv.season !== season) return false;
        if (search) {
            const hay = [inv.inventory_name, inv.destination, inv.vendors?.name].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    renderStats(filtered);
    renderTable(filtered);
}

// ── Stats ─────────────────────────────────────────────────
function renderStats(items) {
    const total = items.length;
    const totalUnits = items.reduce((s, i) => s + (i.total_allotment || 0), 0);
    const available = items.reduce((s, i) => s + (i.available || 0), 0);
    const lowStock = items.filter(i => i.available > 0 && i.available <= Math.ceil(i.total_allotment * 0.2)).length;
    const expired = items.filter(i => i.valid_until && new Date(i.valid_until) < new Date()).length;

    document.getElementById('inventoryStats').innerHTML = `
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Items</div></div>
        <div class="stat-card"><div class="stat-value">${totalUnits}</div><div class="stat-label">Total Units</div></div>
        <div class="stat-card"><div class="stat-value">${available}</div><div class="stat-label">Available</div></div>
        <div class="stat-card" style="${lowStock ? 'border-left:3px solid #ffc107' : ''}"><div class="stat-value">${lowStock}</div><div class="stat-label">Low Stock</div></div>
        <div class="stat-card" style="${expired ? 'border-left:3px solid #f44336' : ''}"><div class="stat-value">${expired}</div><div class="stat-label">Expired</div></div>
    `;
}

// ── Table render ──────────────────────────────────────────
function renderTable(items) {
    const tbody = document.getElementById('inventoryTable');
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = items.slice(start, start + PAGE_SIZE);

    if (!page.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No inventory items found</td></tr>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }

    tbody.innerHTML = page.map(inv => {
        const pctUsed = inv.total_allotment > 0 ? Math.round(((inv.total_allotment - inv.available) / inv.total_allotment) * 100) : 0;
        const isExpired = inv.valid_until && new Date(inv.valid_until) < new Date();
        const isLow = inv.available > 0 && inv.available <= Math.ceil(inv.total_allotment * 0.2);

        return `<tr>
            <td><strong>${escHtml(inv.inventory_name)}</strong></td>
            <td>${escHtml(inv.vendors?.name || '—')}</td>
            <td><span class="badge">${escHtml(inv.inventory_type || 'room')}</span></td>
            <td>${escHtml(inv.destination || '—')}</td>
            <td>${inv.total_allotment || 0}</td>
            <td>
                <span style="color:${inv.available === 0 ? '#f44336' : isLow ? '#ffc107' : '#00c853'};font-weight:600">
                    ${inv.available || 0}
                </span>
                <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:4px;margin-top:3px">
                    <div style="background:${pctUsed >= 80 ? '#f44336' : pctUsed >= 50 ? '#ffc107' : '#00c853'};height:100%;width:${pctUsed}%;border-radius:4px"></div>
                </div>
            </td>
            <td>${typeof formatCurrency === 'function' ? formatCurrency(inv.rate_per_unit, inv.currency) : `${inv.currency} ${inv.rate_per_unit}`}</td>
            <td>${escHtml(inv.season || 'regular')}</td>
            <td style="font-size:0.78rem">${inv.valid_from ? formatDate(inv.valid_from) : '—'}<br>${inv.valid_until ? formatDate(inv.valid_until) : '—'}</td>
            <td>${isExpired ? '<span class="badge" style="background:rgba(244,67,54,0.15);color:#f44336">Expired</span>'
                : inv.is_active ? '<span class="badge" style="background:rgba(0,200,83,0.15);color:#00c853">Active</span>'
                : '<span class="badge" style="background:rgba(255,255,255,0.1)">Inactive</span>'}</td>
            <td style="white-space:nowrap">
                <button class="btn-secondary" style="padding:4px 8px;font-size:0.75rem" onclick="openBookAllotment('${inv.id}')">Book</button>
                <button class="btn-secondary" style="padding:4px 8px;font-size:0.75rem" onclick="viewAllotments('${inv.id}')">View</button>
                <button class="btn-primary" style="padding:4px 8px;font-size:0.75rem" onclick="editInventory('${inv.id}')">Edit</button>
            </td>
        </tr>`;
    }).join('');

    renderPagination(items.length);
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

// ── Add Inventory ─────────────────────────────────────────
function openAddInventory() {
    editingInvId = null;
    document.getElementById('inventoryModalTitle').textContent = 'Add Inventory';
    document.getElementById('inventoryForm').reset();
    document.getElementById('inventoryModalOverlay').classList.remove('hidden');
}

// ── Edit Inventory ────────────────────────────────────────
function editInventory(id) {
    const inv = allInventory.find(i => i.id === id);
    if (!inv) return;
    editingInvId = id;
    document.getElementById('inventoryModalTitle').textContent = 'Edit Inventory';
    document.getElementById('invVendor').value = inv.vendor_id || '';
    document.getElementById('invName').value = inv.inventory_name || '';
    document.getElementById('invDestination').value = inv.destination || '';
    document.getElementById('invType').value = inv.inventory_type || 'room';
    document.getElementById('invTotal').value = inv.total_allotment || 0;
    document.getElementById('invAvailable').value = inv.available || 0;
    document.getElementById('invRate').value = inv.rate_per_unit || 0;
    document.getElementById('invCurrency').value = inv.currency || 'INR';
    document.getElementById('invSeason').value = inv.season || 'regular';
    document.getElementById('invReleaseDays').value = inv.release_days || 7;
    document.getElementById('invValidFrom').value = inv.valid_from || '';
    document.getElementById('invValidUntil').value = inv.valid_until || '';
    document.getElementById('invNotes').value = inv.notes || '';
    document.getElementById('inventoryModalOverlay').classList.remove('hidden');
}

// ── Save Inventory ────────────────────────────────────────
async function saveInventory(e) {
    e.preventDefault();
    const userId = await getCurrentUserId();
    const payload = {
        vendor_id: document.getElementById('invVendor').value || null,
        inventory_name: document.getElementById('invName').value.trim(),
        destination: document.getElementById('invDestination').value.trim() || null,
        inventory_type: document.getElementById('invType').value,
        total_allotment: parseInt(document.getElementById('invTotal').value) || 0,
        available: parseInt(document.getElementById('invAvailable').value) || 0,
        rate_per_unit: parseFloat(document.getElementById('invRate').value) || 0,
        currency: document.getElementById('invCurrency').value,
        season: document.getElementById('invSeason').value,
        release_days: parseInt(document.getElementById('invReleaseDays').value) || 7,
        valid_from: document.getElementById('invValidFrom').value || null,
        valid_until: document.getElementById('invValidUntil').value || null,
        notes: document.getElementById('invNotes').value.trim() || null,
        is_active: true,
        created_by: userId
    };

    let error;
    if (editingInvId) {
        delete payload.created_by;
        payload.updated_at = new Date().toISOString();
        ({ error } = await window.supabase.from('supplier_inventory').update(payload).eq('id', editingInvId));
    } else {
        ({ error } = await window.supabase.from('supplier_inventory').insert(payload));
    }

    if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
    showToast(editingInvId ? 'Inventory updated' : 'Inventory added');
    closeModal('inventoryModal');
    await loadInventory();
}

// ── Book Allotment ────────────────────────────────────────
function openBookAllotment(invId) {
    bookingInvId = invId;
    const inv = allInventory.find(i => i.id === invId);
    document.getElementById('allotmentModalTitle').textContent = `Book — ${escHtml(inv?.inventory_name || '')}`;
    document.getElementById('allotmentForm').reset();
    document.getElementById('allotmentModalOverlay').classList.remove('hidden');
}

async function bookAllotment(e) {
    e.preventDefault();
    const qty = parseInt(document.getElementById('alQuantity').value) || 1;
    const inv = allInventory.find(i => i.id === bookingInvId);
    if (!inv || inv.available < qty) {
        showToast('Not enough availability', 'error');
        return;
    }

    const userId = await getCurrentUserId();
    const { error } = await window.supabase.from('supplier_allotments').insert({
        inventory_id: bookingInvId,
        client_name: document.getElementById('alClientName').value.trim(),
        quantity: qty,
        check_in: document.getElementById('alCheckIn').value || null,
        check_out: document.getElementById('alCheckOut').value || null,
        held_until: document.getElementById('alHeldUntil').value || null,
        notes: document.getElementById('alNotes').value.trim() || null,
        status: 'held',
        created_by: userId
    });

    if (error) { showToast('Booking failed: ' + error.message, 'error'); return; }

    // Decrease available count
    await window.supabase.from('supplier_inventory')
        .update({ available: inv.available - qty, updated_at: new Date().toISOString() })
        .eq('id', bookingInvId);

    showToast(`Allotment booked: ${qty} unit(s)`);
    closeModal('allotmentModal');
    await loadInventory();
}

// ── View Allotments Drawer ────────────────────────────────
async function viewAllotments(invId) {
    const inv = allInventory.find(i => i.id === invId);
    const { data, error } = await window.supabase
        .from('supplier_allotments')
        .select('*')
        .eq('inventory_id', invId)
        .order('created_at', { ascending: false });

    if (error) { showToast('Failed to load allotments', 'error'); return; }
    const allots = data || [];

    const body = document.getElementById('allotmentDrawerBody');
    body.innerHTML = `
        <div style="margin-bottom:16px">
            <h4 style="margin:0 0 4px">${escHtml(inv?.inventory_name || '')}</h4>
            <p style="margin:0;color:var(--text-muted);font-size:0.85rem">${escHtml(inv?.vendors?.name || '')} · ${escHtml(inv?.destination || '')}</p>
        </div>
        ${allots.length ? allots.map(a => `
            <div style="background:var(--bg-surface,rgba(255,255,255,0.05));padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid ${
                a.status === 'confirmed' ? '#00c853' : a.status === 'held' ? '#ffc107' : a.status === 'released' ? '#2196f3' : '#f44336'
            }">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <strong>${escHtml(a.client_name)}</strong>
                    <span class="badge" style="font-size:0.72rem">${escHtml(a.status)}</span>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
                    Qty: ${a.quantity} · ${a.check_in ? `${formatDate(a.check_in)} → ${formatDate(a.check_out)}` : 'No dates'}
                    ${a.held_until ? `<br>Hold until: ${new Date(a.held_until).toLocaleString()}` : ''}
                </div>
                ${a.status === 'held' ? `
                    <div style="margin-top:8px;display:flex;gap:6px">
                        <button class="btn-primary" style="padding:3px 8px;font-size:0.72rem" onclick="confirmAllotment('${a.id}','${invId}')">Confirm</button>
                        <button class="btn-secondary" style="padding:3px 8px;font-size:0.72rem" onclick="releaseAllotment('${a.id}','${invId}',${a.quantity})">Release</button>
                    </div>
                ` : ''}
            </div>
        `).join('') : '<p style="color:var(--text-muted);font-size:0.85rem">No allotments yet</p>'}
    `;

    document.getElementById('allotmentDrawer').classList.remove('hidden');
    document.getElementById('allotmentDrawerOverlay').classList.remove('hidden');
}

// ── Confirm / Release Allotment ───────────────────────────
async function confirmAllotment(allotId, invId) {
    const { error } = await window.supabase.from('supplier_allotments')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', allotId);
    if (error) { showToast('Failed to confirm', 'error'); return; }
    showToast('Allotment confirmed');
    await loadInventory();
    await viewAllotments(invId);
}

async function releaseAllotment(allotId, invId, qty) {
    const { error } = await window.supabase.from('supplier_allotments')
        .update({ status: 'released', released_at: new Date().toISOString() })
        .eq('id', allotId);
    if (error) { showToast('Failed to release', 'error'); return; }

    // Restore available count
    const inv = allInventory.find(i => i.id === invId);
    if (inv) {
        await window.supabase.from('supplier_inventory')
            .update({ available: inv.available + qty, updated_at: new Date().toISOString() })
            .eq('id', invId);
    }

    showToast('Allotment released');
    await loadInventory();
    await viewAllotments(invId);
}

// ── Delete Inventory ──────────────────────────────────────
async function deleteInventory(id) {
    if (!confirm('Delete this inventory item? All allotments will be removed.')) return;
    const { error } = await window.supabase.from('supplier_inventory').delete().eq('id', id);
    if (error) { showToast('Failed to delete', 'error'); return; }
    showToast('Inventory deleted');
    await loadInventory();
}
