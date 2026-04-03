// ============================================================
// vendors.js — Vendor master + pricing catalogue
// ============================================================

let allVendors = [];
let editingVendorId = null;
let pricingVendorId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadVendors();

    document.getElementById('addVendorBtn')?.addEventListener('click', openAddVendor);
    document.getElementById('closeVendorModal')?.addEventListener('click', () => closeModal('vendorModal'));
    document.getElementById('cancelVendorBtn')?.addEventListener('click', () => closeModal('vendorModal'));
    document.getElementById('vendorModalOverlay')?.addEventListener('click', () => closeModal('vendorModal'));
    document.getElementById('saveVendorBtn')?.addEventListener('click', saveVendor);
    document.getElementById('closePricingModal')?.addEventListener('click', () => closeModal('pricingModal'));
    document.getElementById('cancelPricingBtn')?.addEventListener('click', () => closeModal('pricingModal'));
    document.getElementById('pricingModalOverlay')?.addEventListener('click', () => closeModal('pricingModal'));
    document.getElementById('addPricingRowBtn')?.addEventListener('click', addPricingRow);
    document.getElementById('searchVendors')?.addEventListener('input', filterVendors);
    document.getElementById('filterCategory')?.addEventListener('change', filterVendors);
});

async function loadVendors() {
    const { data } = await window.supabase
        .from('vendors')
        .select('*, vendor_pricing(count)')
        .order('name');
    allVendors = data || [];
    renderVendorGrid(allVendors);
}

function renderVendorGrid(vendors) {
    const grid = document.getElementById('vendorGrid');
    if (!vendors.length) { grid.innerHTML = '<div class="empty-state">No vendors yet. Add your first vendor.</div>'; return; }
    grid.innerHTML = vendors.map(v => `
        <div class="vendor-card">
            <div class="vendor-card-header">
                <div>
                    <div class="vendor-name">${escHtml(v.name)}</div>
                    <div class="vendor-cat">${escHtml(v.category)}</div>
                </div>
                <div class="vendor-badge ${v.status === 'active' ? 'badge-active' : 'badge-inactive'}">
                    ${v.status}
                </div>
            </div>
            <div class="vendor-info">
                ${v.phone ? `<div>📞 ${escHtml(v.phone)}</div>` : ''}
                ${v.email ? `<div>✉️ ${escHtml(v.email)}</div>` : ''}
                ${v.location ? `<div>📍 ${escHtml(v.location)}</div>` : ''}
                ${v.gst_number ? `<div>🧾 GST: ${escHtml(v.gst_number)}</div>` : ''}
            </div>
            <div class="vendor-card-actions">
                <button class="btn-secondary" onclick="openPricingModal('${v.id}')">
                    💰 Pricing (${v.vendor_pricing?.[0]?.count || 0})
                </button>
                <button class="btn-secondary" onclick="openEditVendor('${v.id}')">Edit</button>
                <button class="btn-danger" onclick="deleteVendor('${v.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function filterVendors() {
    const search = document.getElementById('searchVendors')?.value.toLowerCase() || '';
    const cat = document.getElementById('filterCategory')?.value || '';
    const filtered = allVendors.filter(v => {
        if (cat && v.category !== cat) return false;
        if (search) {
            const hay = [v.name, v.location, v.category].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });
    renderVendorGrid(filtered);
}

function openAddVendor() {
    editingVendorId = null;
    document.getElementById('vendorModalTitle').textContent = 'Add Vendor';
    document.getElementById('vendorForm').reset();
    openModal('vendorModal');
}

function openEditVendor(vendorId) {
    const v = allVendors.find(v => v.id === vendorId);
    if (!v) return;
    editingVendorId = vendorId;
    document.getElementById('vendorModalTitle').textContent = 'Edit Vendor';
    document.getElementById('vName').value = v.name || '';
    document.getElementById('vCategory').value = v.category || '';
    document.getElementById('vPhone').value = v.phone || '';
    document.getElementById('vEmail').value = v.email || '';
    document.getElementById('vLocation').value = v.location || '';
    document.getElementById('vGst').value = v.gst_number || '';
    document.getElementById('vBank').value = v.bank_details || '';
    document.getElementById('vNotes').value = v.notes || '';
    document.getElementById('vStatus').value = v.status || 'active';
    openModal('vendorModal');
}

async function saveVendor() {
    const name = document.getElementById('vName')?.value.trim();
    const category = document.getElementById('vCategory')?.value;
    if (!name || !category) { showToast('Name and category are required', 'error'); return; }

    const payload = {
        name, category,
        phone: document.getElementById('vPhone')?.value.trim() || null,
        email: document.getElementById('vEmail')?.value.trim() || null,
        location: document.getElementById('vLocation')?.value.trim() || null,
        gst_number: document.getElementById('vGst')?.value.trim() || null,
        bank_details: document.getElementById('vBank')?.value.trim() || null,
        notes: document.getElementById('vNotes')?.value.trim() || null,
        status: document.getElementById('vStatus')?.value || 'active',
        created_by: await getCurrentUserId(),
    };

    let error;
    if (editingVendorId) {
        ({ error } = await window.supabase.from('vendors').update(payload).eq('id', editingVendorId));
    } else {
        ({ error } = await window.supabase.from('vendors').insert(payload));
    }

    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast(editingVendorId ? 'Vendor updated' : 'Vendor added');
    closeModal('vendorModal');
    await loadVendors();
}

async function deleteVendor(vendorId) {
    if (!confirm('Delete this vendor? This will also remove all their pricing.')) return;
    const { error } = await window.supabase.from('vendors').delete().eq('id', vendorId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Vendor deleted');
    await loadVendors();
}

// ── Pricing Modal ──────────────────────────────────────────

async function openPricingModal(vendorId) {
    pricingVendorId = vendorId;
    const v = allVendors.find(v => v.id === vendorId);
    document.getElementById('pricingVendorName').textContent = v?.name || '';
    document.getElementById('pricingTableBody').innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    openModal('pricingModal');
    await loadVendorPricing(vendorId);
}

async function loadVendorPricing(vendorId) {
    const { data } = await window.supabase
        .from('vendor_pricing')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('destination');
    renderPricingTable(data || []);
}

function renderPricingTable(rows) {
    const tbody = document.getElementById('pricingTableBody');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No pricing rows yet</td></tr>'; return; }
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${escHtml(r.destination)}</td>
            <td>${escHtml(r.category)}</td>
            <td>${escHtml(r.sub_category || '—')}</td>
            <td>${formatINR(r.rate)}</td>
            <td>${escHtml(r.per_unit || 'per pax')}</td>
            <td>
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem" onclick="deletePricingRow('${r.id}')">✕</button>
            </td>
        </tr>
    `).join('');
}

function addPricingRow() {
    const destination = document.getElementById('newDest')?.value.trim();
    const category = document.getElementById('newCat')?.value;
    const subCat = document.getElementById('newSubCat')?.value.trim();
    const rate = parseFloat(document.getElementById('newRate')?.value) || 0;
    const perUnit = document.getElementById('newPerUnit')?.value.trim() || 'per pax';

    if (!destination || !category || !rate) { showToast('Fill destination, category and rate', 'error'); return; }
    savePricingRow({ destination, category, sub_category: subCat || null, rate, per_unit: perUnit });
}

async function savePricingRow(row) {
    const { error } = await window.supabase.from('vendor_pricing').insert({
        ...row,
        vendor_id: pricingVendorId,
        created_by: await getCurrentUserId(),
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    // Clear inputs
    ['newDest','newCat','newSubCat','newRate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    await loadVendorPricing(pricingVendorId);
    await loadVendors(); // refresh count
}

async function deletePricingRow(rowId) {
    const { error } = await window.supabase.from('vendor_pricing').delete().eq('id', rowId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await loadVendorPricing(pricingVendorId);
}
