// ============================================================
// vendors.js — Vendor master + pricing + ratings + management
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
    document.getElementById('vendorForm')?.addEventListener('submit', e => { e.preventDefault(); saveVendor(); });
    document.getElementById('closePricingModal')?.addEventListener('click', () => closeModal('pricingModal'));
    document.getElementById('cancelPricingBtn')?.addEventListener('click', () => closeModal('pricingModal'));
    document.getElementById('pricingModalOverlay')?.addEventListener('click', () => closeModal('pricingModal'));
    document.getElementById('addPricingRowBtn')?.addEventListener('click', addPricingRow);
    document.getElementById('searchVendors')?.addEventListener('input', filterVendors);
    document.getElementById('filterCategory')?.addEventListener('change', filterVendors);
    // Review modal
    document.getElementById('closeReviewModal')?.addEventListener('click', () => closeModal('reviewModal'));
    document.getElementById('saveReviewBtn')?.addEventListener('click', saveReview);
});

function renderStars(rating, interactive = false, targetId = '') {
    const n = Math.round(rating || 0);
    return [1,2,3,4,5].map(i =>
        `<span style="cursor:${interactive?'pointer':'default'};font-size:1.1rem;color:${i <= n ? '#ffd700' : '#555'}"
            ${interactive ? `onclick="setRatingStars('${targetId}',${i})"` : ''}><span style="color:#f59e0b">&#9733;</span></span>`
    ).join('');
}

function setRatingStars(targetId, val) {
    const el = document.getElementById(targetId);
    if (el) { el.dataset.rating = val; el.innerHTML = renderStars(val, true, targetId); }
}

async function loadVendors() {
    const { data } = await window.supabase
        .from('vendors')
        .select('*, vendor_pricing(count)')
        .order('name');
    allVendors = data || [];

    // Load vendor reviews for average ratings
    const { data: reviews } = await window.supabase.from('vendor_reviews').select('vendor_id, rating');
    const ratingMap = {};
    (reviews || []).forEach(rv => {
        if (!ratingMap[rv.vendor_id]) ratingMap[rv.vendor_id] = [];
        ratingMap[rv.vendor_id].push(rv.rating);
    });
    allVendors.forEach(v => {
        const arr = ratingMap[v.id] || [];
        v._avgRating = arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : (v.rating || 0);
        v._reviewCount = arr.length;
    });

    renderVendorGrid(allVendors);
}

function renderVendorGrid(vendors) {
    const grid = document.getElementById('vendorGrid');
    if (!vendors.length) { grid.innerHTML = '<div class="empty-state">No vendors yet. Add your first vendor.</div>'; return; }
    const now = new Date();
    grid.innerHTML = vendors.map(v => {
        const contractExpiry = v.contract_expiry ? new Date(v.contract_expiry) : null;
        const daysToExpiry = contractExpiry ? Math.ceil((contractExpiry - now) / 86400000) : null;
        const expiryWarning = daysToExpiry !== null && daysToExpiry <= 30;
        const reliability = v.payment_reliability || 'unknown';
        const reliabilityColors = { excellent: '#10b981', good: '#6366f1', average: '#f59e0b', poor: '#ef4444', unknown: '#666' };
        return `
        <div class="vendor-card" style="${v.preferred ? 'border:1px solid #ffd700;' : ''}">
            <div class="vendor-card-header">
                <div>
                    <div class="vendor-name">
                        ${escHtml(v.name)}
                        ${v.preferred ? '<span style="color:#ffd700;font-size:0.8rem;margin-left:4px" title="Preferred Vendor"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Preferred</span>' : ''}
                    </div>
                    <div class="vendor-cat">${escHtml(v.category || v.region || '')}</div>
                    <div style="margin-top:4px">${renderStars(v._avgRating)} <span style="font-size:0.75rem;color:var(--text-muted)">(${v._reviewCount})</span></div>
                </div>
                <div class="vendor-badge ${v.status === 'active' ? 'badge-active' : 'badge-inactive'}">
                    ${v.status || 'active'}
                </div>
            </div>
            <div class="vendor-info">
                ${v.phone || v.contact_phone ? `<div><i data-lucide="phone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(v.phone || v.contact_phone)}</div>` : ''}
                ${v.email || v.contact_email ? `<div><i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ ${escHtml(v.email || v.contact_email)}</div>` : ''}
                ${v.location ? `<div><i data-lucide="map-pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(v.location)}</div>` : ''}
                ${v.gst_number ? `<div><i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> GST: ${escHtml(v.gst_number)}</div>` : ''}
                ${contractExpiry ? `<div style="color:${expiryWarning ? '#ef4444' : 'var(--text-muted)'}"><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Contract: ${contractExpiry.toLocaleDateString()}${expiryWarning ? ' <i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ Expiring Soon!' : ''}</div>` : ''}
                <div style="margin-top:4px"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:0.72rem;background:${reliabilityColors[reliability]};color:#fff">Payment: ${reliability}</span></div>
            </div>
            <div class="vendor-card-actions">
                <button class="btn-secondary" onclick="openPricingModal('${v.id}')">
                    <i data-lucide="indian-rupee" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Pricing (${v.vendor_pricing?.[0]?.count || 0})
                </button>
                <button class="btn-secondary" onclick="openReviewModal('${v.id}')"><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Review</button>
                <button class="btn-secondary" onclick="openEditVendor('${v.id}')">Edit</button>
                <button class="btn-danger" onclick="deleteVendor('${v.id}')">Delete</button>
            </div>
        </div>
    `}).join('');
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
    const catEl = document.getElementById('vCategory');
    const regEl = document.getElementById('vRegion');
    if (catEl) catEl.value = v.category || '';
    if (regEl) regEl.value = v.region || '';
    document.getElementById('vContactName') && (document.getElementById('vContactName').value = v.contact_name || '');
    document.getElementById('vContactPhone') && (document.getElementById('vContactPhone').value = v.contact_phone || v.phone || '');
    document.getElementById('vContactEmail') && (document.getElementById('vContactEmail').value = v.contact_email || v.email || '');
    document.getElementById('vPhone') && (document.getElementById('vPhone').value = v.phone || '');
    document.getElementById('vEmail') && (document.getElementById('vEmail').value = v.email || '');
    document.getElementById('vLocation') && (document.getElementById('vLocation').value = v.location || '');
    document.getElementById('vGst') && (document.getElementById('vGst').value = v.gst_number || '');
    document.getElementById('vBank') && (document.getElementById('vBank').value = v.bank_details || '');
    document.getElementById('vCommission') && (document.getElementById('vCommission').value = v.commission || '');
    document.getElementById('vPaymentTerms') && (document.getElementById('vPaymentTerms').value = v.payment_terms || '');
    document.getElementById('vContractUntil') && (document.getElementById('vContractUntil').value = v.contract_expiry || '');
    document.getElementById('vPreferred') && (document.getElementById('vPreferred').checked = !!v.preferred);
    document.getElementById('vPaymentReliability') && (document.getElementById('vPaymentReliability').value = v.payment_reliability || 'unknown');
    document.getElementById('vNotes') && (document.getElementById('vNotes').value = v.notes || '');
    document.getElementById('vStatus') && (document.getElementById('vStatus').value = v.status || 'active');
    openModal('vendorModal');
}

async function saveVendor() {
    const name = document.getElementById('vName')?.value.trim();
    if (!name) { showToast('Vendor name is required', 'error'); return; }

    const payload = {
        name,
        region: document.getElementById('vRegion')?.value || null,
        category: document.getElementById('vCategory')?.value || null,
        contact_name: document.getElementById('vContactName')?.value?.trim() || null,
        contact_phone: document.getElementById('vContactPhone')?.value?.trim() || null,
        contact_email: document.getElementById('vContactEmail')?.value?.trim() || null,
        phone: document.getElementById('vPhone')?.value?.trim() || null,
        email: document.getElementById('vEmail')?.value?.trim() || null,
        location: document.getElementById('vLocation')?.value?.trim() || null,
        gst_number: document.getElementById('vGst')?.value?.trim() || null,
        bank_details: document.getElementById('vBank')?.value?.trim() || null,
        commission: parseFloat(document.getElementById('vCommission')?.value) || null,
        payment_terms: document.getElementById('vPaymentTerms')?.value?.trim() || null,
        contract_expiry: document.getElementById('vContractUntil')?.value || null,
        preferred: document.getElementById('vPreferred')?.checked || false,
        payment_reliability: document.getElementById('vPaymentReliability')?.value || 'unknown',
        notes: document.getElementById('vNotes')?.value?.trim() || null,
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
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem" onclick="deletePricingRow('${r.id}')">&times;</button>
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

// ── Review Modal ──────────────────────────────────────────

function openReviewModal(vendorId) {
    const v = allVendors.find(x => x.id === vendorId);
    if (!v) return;
    document.getElementById('reviewVendorId').value = vendorId;
    document.getElementById('reviewVendorName').textContent = v.name;
    const starsEl = document.getElementById('reviewStars');
    if (starsEl) { starsEl.dataset.rating = 0; starsEl.innerHTML = renderStars(0, true, 'reviewStars'); }
    document.getElementById('reviewComment')?.value && (document.getElementById('reviewComment').value = '');
    openModal('reviewModal');
}

async function saveReview() {
    const vendorId = document.getElementById('reviewVendorId')?.value;
    const rating = parseInt(document.getElementById('reviewStars')?.dataset.rating) || 0;
    const comment = document.getElementById('reviewComment')?.value?.trim() || null;
    if (!vendorId || !rating) { showToast('Select a star rating', 'error'); return; }
    const { error } = await window.supabase.from('vendor_reviews').insert({
        vendor_id: vendorId, rating, comment,
        reviewed_by: await getCurrentUserId(),
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    // Update vendor's average rating
    const { data: reviews } = await window.supabase.from('vendor_reviews').select('rating').eq('vendor_id', vendorId);
    const avg = reviews?.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : rating;
    await window.supabase.from('vendors').update({ rating: Math.round(avg * 10) / 10 }).eq('id', vendorId);
    showToast('Review submitted');
    closeModal('reviewModal');
    await loadVendors();
}
