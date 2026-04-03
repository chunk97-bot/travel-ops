// ============================================================
// documents.js — Document Vault
// ============================================================

let allDocs = [];

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadClientOptions(), loadBookingOptions()]);
    await loadDocuments();

    document.getElementById('uploadDocBtn')?.addEventListener('click', openUploadModal);
    document.getElementById('closeDocModal')?.addEventListener('click', () => closeModal('docModal'));
    document.getElementById('cancelDocBtn')?.addEventListener('click', () => closeModal('docModal'));
    document.getElementById('docModalOverlay')?.addEventListener('click', () => closeModal('docModal'));
    document.getElementById('saveDocBtn')?.addEventListener('click', saveDocument);
    ['searchDocs','filterDocType','filterDocClient','filterExpiry'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFilters);
        document.getElementById(id)?.addEventListener('change', applyFilters);
    });
});

async function loadDocuments() {
    const { data } = await window.supabase
        .from('documents')
        .select('*, clients(name), bookings(booking_ref)')
        .order('created_at', { ascending: false });
    allDocs = data || [];
    updateStats();
    renderTable(allDocs);
}

async function loadClientOptions() {
    const { data } = await window.supabase.from('clients').select('id, name').order('name');
    ['dClientId','filterDocClient'].forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel || selId === 'filterDocClient' && sel.options.length > 1) return;
        (data || []).forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id; opt.textContent = c.name;
            sel.appendChild(opt);
        });
    });
}

async function loadBookingOptions() {
    const { data } = await window.supabase.from('bookings').select('id, booking_ref, destination').order('travel_date', { ascending: false });
    const sel = document.getElementById('dBookingId');
    if (!sel) return;
    (data || []).forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id; opt.textContent = `${b.booking_ref} — ${b.destination}`;
        sel.appendChild(opt);
    });
}

function updateStats() {
    const today = new Date();
    const in30  = new Date(); in30.setDate(today.getDate() + 30);
    const expired  = allDocs.filter(d => d.expiry_date && new Date(d.expiry_date) < today).length;
    const expiring = allDocs.filter(d => d.expiry_date && new Date(d.expiry_date) >= today && new Date(d.expiry_date) <= in30).length;
    document.getElementById('docStatTotal').innerHTML    = `<strong>${allDocs.length}</strong> Documents`;
    document.getElementById('docStatExpiring').innerHTML = `<strong style="color:var(--warning)">${expiring}</strong> Expiring in 30 days`;
    document.getElementById('docStatExpired').innerHTML  = `<strong style="color:var(--danger)">${expired}</strong> Expired`;
}

function applyFilters() {
    const q       = document.getElementById('searchDocs')?.value.toLowerCase() || '';
    const type    = document.getElementById('filterDocType')?.value || '';
    const client  = document.getElementById('filterDocClient')?.value || '';
    const expiry  = document.getElementById('filterExpiry')?.value || '';
    const today   = new Date();
    const filtered = allDocs.filter(d => {
        if (type && d.doc_type !== type) return false;
        if (client && d.client_id !== client) return false;
        if (expiry === 'expired' && !(d.expiry_date && new Date(d.expiry_date) < today)) return false;
        if (expiry === '30') {
            const in30 = new Date(); in30.setDate(today.getDate() + 30);
            if (!(d.expiry_date && new Date(d.expiry_date) >= today && new Date(d.expiry_date) <= in30)) return false;
        }
        if (expiry === '90') {
            const in90 = new Date(); in90.setDate(today.getDate() + 90);
            if (!(d.expiry_date && new Date(d.expiry_date) >= today && new Date(d.expiry_date) <= in90)) return false;
        }
        if (q) {
            const hay = [d.file_name, d.clients?.name, d.doc_type, d.notes].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderTable(filtered);
}

function renderTable(docs) {
    const tbody = document.getElementById('docsTable');
    if (!docs.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No documents found</td></tr>'; return; }
    const today = new Date();
    tbody.innerHTML = docs.map(d => {
        const expiry = d.expiry_date ? new Date(d.expiry_date) : null;
        const isExpired  = expiry && expiry < today;
        const isExpiring = expiry && !isExpired && expiry <= new Date(today.getTime() + 30 * 86400000);
        const expiryDisplay = expiry
            ? `<span style="color:${isExpired ? 'var(--danger)' : isExpiring ? 'var(--warning)' : 'inherit'}">${isExpired ? '⚠ ' : isExpiring ? '⏰ ' : ''}${formatDate(d.expiry_date)}</span>`
            : '—';
        return `
        <tr>
            <td>${escHtml(d.clients?.name || '—')}</td>
            <td><span class="badge badge-info">${escHtml(d.doc_type)}</span></td>
            <td>${d.file_url
                ? `<a href="${escHtml(d.file_url)}" target="_blank" rel="noopener" style="color:var(--primary)">${escHtml(d.file_name)}</a>`
                : escHtml(d.file_name)}</td>
            <td>${escHtml(d.bookings?.booking_ref || '—')}</td>
            <td>${expiryDisplay}</td>
            <td>${escHtml(d.notes || '—')}</td>
            <td>
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem" onclick="deleteDocument('${d.id}')">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function openUploadModal() {
    document.getElementById('docForm')?.reset();
    openModal('docModal');
}

async function saveDocument() {
    const clientId = document.getElementById('dClientId')?.value;
    const docType  = document.getElementById('dDocType')?.value;
    const fileName = document.getElementById('dFileName')?.value.trim();
    if (!clientId || !docType || !fileName) { showToast('Client, type and file name are required', 'error'); return; }

    const { error } = await window.supabase.from('documents').insert({
        client_id:   clientId,
        booking_id:  document.getElementById('dBookingId')?.value || null,
        doc_type:    docType,
        file_name:   fileName,
        file_url:    document.getElementById('dFileUrl')?.value.trim() || null,
        expiry_date: document.getElementById('dExpiry')?.value || null,
        notes:       document.getElementById('dNotes')?.value.trim() || null,
        uploaded_by: await getCurrentUserId(),
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Document saved');
    closeModal('docModal');
    await loadDocuments();
}

async function deleteDocument(docId) {
    if (!confirm('Delete this document record?')) return;
    const { error } = await window.supabase.from('documents').delete().eq('id', docId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Deleted');
    await loadDocuments();
}
