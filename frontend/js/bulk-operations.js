// ============================================================
// bulk-operations.js — Multi-select + bulk actions component
// Inject into any page with a data-table to enable bulk ops
// ============================================================

(function initBulkOps() {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(_setupBulkOps, 700);
    });
})();

let _bulkSelected = new Set();
let _bulkModule = '';
let _bulkTableBody = null;

function _setupBulkOps() {
    // Detect which module we're on
    const page = window.location.pathname.split('/').pop();
    const config = {
        'leads.html':    { module: 'leads', tbody: 'leadsTable', idCol: 'id', actions: ['assign','stage','delete'] },
        'invoices.html':  { module: 'invoices', tbody: 'invoicesTable', idCol: 'id', actions: ['status','reminder','delete'] },
        'clients.html':   { module: 'clients', tbody: 'clientGrid', idCol: 'id', actions: ['tag','segment','export'] },
        'bookings.html':  { module: 'bookings', tbody: 'bookingsTable', idCol: 'id', actions: ['status','delete'] },
    };

    const cfg = config[page];
    if (!cfg) return;

    _bulkModule = cfg.module;
    _bulkTableBody = document.getElementById(cfg.tbody);
    if (!_bulkTableBody) return;

    _injectBulkBar(cfg);
    _addCheckboxes(cfg);
}

function _injectBulkBar(cfg) {
    if (document.getElementById('bulkBar')) return;
    const bar = document.createElement('div');
    bar.id = 'bulkBar';
    bar.style.cssText = `
        display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:var(--surface,#1e293b);border:1px solid var(--primary,#6366f1);
        border-radius:12px;padding:10px 20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.4);
        display:none;align-items:center;gap:12px;font-size:0.85rem;min-width:400px;
    `;

    let actions = '';
    if (cfg.actions.includes('assign')) {
        actions += `<select id="bulkAssign" class="form-control" style="max-width:150px;font-size:0.8rem"><option value="">Assign to...</option></select>
            <button class="btn-primary" style="padding:4px 12px;font-size:0.8rem" onclick="bulkAssign()">Assign</button>`;
    }
    if (cfg.actions.includes('stage')) {
        actions += `<select id="bulkStage" class="form-control" style="max-width:120px;font-size:0.8rem">
            <option value="">Stage...</option><option value="new">New</option><option value="contacted">Contacted</option>
            <option value="quoted">Quoted</option><option value="negotiating">Negotiating</option>
            <option value="confirmed">Confirmed</option><option value="lost">Lost</option></select>
            <button class="btn-secondary" style="padding:4px 12px;font-size:0.8rem" onclick="bulkStage()">Update</button>`;
    }
    if (cfg.actions.includes('status')) {
        actions += `<select id="bulkStatus" class="form-control" style="max-width:120px;font-size:0.8rem">
            <option value="">Status...</option><option value="draft">Draft</option><option value="sent">Sent</option>
            <option value="paid">Paid</option><option value="cancelled">Cancelled</option></select>
            <button class="btn-secondary" style="padding:4px 12px;font-size:0.8rem" onclick="bulkUpdateStatus()">Update</button>`;
    }
    if (cfg.actions.includes('reminder')) {
        actions += `<button class="btn-secondary" style="padding:4px 12px;font-size:0.8rem" onclick="bulkSendReminders()"><i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Send Reminders</button>`;
    }
    if (cfg.actions.includes('tag')) {
        actions += `<input type="text" id="bulkTag" class="form-control" style="max-width:120px;font-size:0.8rem" placeholder="Tag...">
            <button class="btn-secondary" style="padding:4px 12px;font-size:0.8rem" onclick="bulkAddTag()">Add Tag</button>`;
    }
    if (cfg.actions.includes('export')) {
        actions += `<button class="btn-secondary" style="padding:4px 12px;font-size:0.8rem" onclick="bulkExport()"><i data-lucide="download" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Export</button>`;
    }
    if (cfg.actions.includes('delete')) {
        actions += `<button class="btn-danger" style="padding:4px 12px;font-size:0.8rem" onclick="bulkDelete()"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Delete</button>`;
    }

    bar.innerHTML = `
        <span id="bulkCount" style="font-weight:700;min-width:80px">0 selected</span>
        ${actions}
        <button style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;margin-left:auto" onclick="clearBulkSelection()">&times;</button>
    `;
    document.body.appendChild(bar);

    // Load staff options for assign
    if (cfg.actions.includes('assign')) {
        loadStaffOptions(document.getElementById('bulkAssign'), false);
    }
}

function _addCheckboxes(cfg) {
    // Add "select all" checkbox to table header
    const thead = _bulkTableBody?.closest('table')?.querySelector('thead tr');
    if (thead && !thead.querySelector('.bulk-check-all')) {
        const th = document.createElement('th');
        th.style.width = '36px';
        th.innerHTML = `<input type="checkbox" class="bulk-check-all" onchange="toggleAllBulk(this.checked)" title="Select all">`;
        thead.insertBefore(th, thead.firstChild);
    }

    // Observe table changes to add checkboxes to new rows
    const observer = new MutationObserver(() => _injectRowCheckboxes());
    observer.observe(_bulkTableBody, { childList: true });
    _injectRowCheckboxes();
}

function _injectRowCheckboxes() {
    if (!_bulkTableBody) return;
    const rows = _bulkTableBody.querySelectorAll('tr');
    rows.forEach(row => {
        if (row.querySelector('.bulk-check') || row.querySelector('.empty-state')) return;
        // Find the row's ID from onclick or data attribute
        const onclick = row.innerHTML;
        const idMatch = onclick.match(/(?:openBookingDrawer|viewLead|editLead|openPaymentModal|openClientDrawer)\('([^']+)'\)/);
        const rowId = idMatch ? idMatch[1] : null;
        if (!rowId) return;

        const td = document.createElement('td');
        td.style.width = '36px';
        td.innerHTML = `<input type="checkbox" class="bulk-check" data-id="${rowId}" onchange="toggleBulkItem('${rowId}', this.checked)">`;
        row.insertBefore(td, row.firstChild);
    });
}

function toggleAllBulk(checked) {
    _bulkSelected.clear();
    document.querySelectorAll('.bulk-check').forEach(cb => {
        cb.checked = checked;
        if (checked) _bulkSelected.add(cb.dataset.id);
    });
    _updateBulkBar();
}

function toggleBulkItem(id, checked) {
    if (checked) _bulkSelected.add(id);
    else _bulkSelected.delete(id);
    _updateBulkBar();
}

function clearBulkSelection() {
    _bulkSelected.clear();
    document.querySelectorAll('.bulk-check, .bulk-check-all').forEach(cb => cb.checked = false);
    _updateBulkBar();
}

function _updateBulkBar() {
    const bar = document.getElementById('bulkBar');
    const count = document.getElementById('bulkCount');
    if (!bar) return;
    if (_bulkSelected.size > 0) {
        bar.style.display = 'flex';
        count.textContent = `${_bulkSelected.size} selected`;
    } else {
        bar.style.display = 'none';
    }
}

// ── Bulk actions ─────────────────────────────────────────
async function bulkAssign() {
    const staffId = document.getElementById('bulkAssign')?.value;
    if (!staffId) { showToast('Select a staff member', 'error'); return; }
    const ids = Array.from(_bulkSelected);
    const { error } = await window.supabase.from(_bulkModule).update({ assigned_to: staffId }).in('id', ids);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAudit('bulk_update', _bulkModule, null, { action: 'assign', ids, staffId });
    showToast(`${ids.length} ${_bulkModule} assigned`);
    clearBulkSelection();
    location.reload();
}

async function bulkStage() {
    const stage = document.getElementById('bulkStage')?.value;
    if (!stage) { showToast('Select a stage', 'error'); return; }
    const ids = Array.from(_bulkSelected);
    const { error } = await window.supabase.from('leads').update({ stage }).in('id', ids);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAudit('bulk_update', 'leads', null, { action: 'stage', ids, stage });
    showToast(`${ids.length} leads updated to ${stage}`);
    clearBulkSelection();
    location.reload();
}

async function bulkUpdateStatus() {
    const status = document.getElementById('bulkStatus')?.value;
    if (!status) { showToast('Select a status', 'error'); return; }
    const ids = Array.from(_bulkSelected);
    const { error } = await window.supabase.from(_bulkModule).update({ status }).in('id', ids);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAudit('bulk_update', _bulkModule, null, { action: 'status', ids, status });
    showToast(`${ids.length} records updated`);
    clearBulkSelection();
    location.reload();
}

async function bulkSendReminders() {
    const ids = Array.from(_bulkSelected);
    let sent = 0;
    for (const id of ids) {
        if (typeof sendReminder === 'function') {
            await sendReminder(id, 'email');
            sent++;
        }
    }
    showToast(`${sent} reminders sent`);
    clearBulkSelection();
}

async function bulkAddTag() {
    const tag = document.getElementById('bulkTag')?.value.trim();
    if (!tag) { showToast('Enter a tag', 'error'); return; }
    const ids = Array.from(_bulkSelected);
    for (const id of ids) {
        const { data: client } = await window.supabase.from('clients').select('tags').eq('id', id).single();
        const tags = client?.tags || [];
        if (!tags.includes(tag)) {
            tags.push(tag);
            await window.supabase.from('clients').update({ tags }).eq('id', id);
        }
    }
    await logAudit('bulk_update', 'clients', null, { action: 'tag', ids, tag });
    showToast(`Tag "${tag}" added to ${ids.length} clients`);
    clearBulkSelection();
    location.reload();
}

async function bulkExport() {
    const ids = Array.from(_bulkSelected);
    const { data } = await window.supabase.from(_bulkModule).select('*').in('id', ids);
    if (!data?.length) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${_bulkModule}_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${data.length} records exported`);
}

async function bulkDelete() {
    const ids = Array.from(_bulkSelected);
    if (!confirm(`Delete ${ids.length} ${_bulkModule}? This cannot be undone.`)) return;
    const { error } = await window.supabase.from(_bulkModule).delete().in('id', ids);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAudit('bulk_delete', _bulkModule, null, { ids });
    showToast(`${ids.length} records deleted`);
    clearBulkSelection();
    location.reload();
}
