// ============================================================
// audit-trail.js — UI page for viewing audit_log entries
// ============================================================

let auditPage = 1;
const AUDIT_PAGE_SIZE = 30;

async function loadAuditTrail(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
            <input type="text" id="auditSearch" class="form-input" placeholder="Search action or table..." style="max-width:200px">
            <select id="auditFilterUser" class="form-input" style="max-width:180px">
                <option value="">All Users</option>
            </select>
            <input type="date" id="auditDateFrom" class="form-input" style="max-width:150px" title="From date">
            <input type="date" id="auditDateTo" class="form-input" style="max-width:150px" title="To date">
            <button class="btn-secondary" onclick="filterAuditTrail()" style="font-size:0.85rem;padding:6px 14px"><i data-lucide="search" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Filter</button>
        </div>
        <table class="data-table" id="auditTable">
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Table</th>
                    <th>Record</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody id="auditTableBody">
                <tr><td colspan="6" class="loading">Loading audit trail...</td></tr>
            </tbody>
        </table>
        <div class="pagination" id="auditPagination"></div>
    `;

    // Populate staff filter
    await loadStaffOptions(document.getElementById('auditFilterUser'));

    // Bind filter events
    ['auditSearch', 'auditFilterUser', 'auditDateFrom', 'auditDateTo'].forEach(id =>
        document.getElementById(id)?.addEventListener('change', filterAuditTrail)
    );
    document.getElementById('auditSearch')?.addEventListener('input', filterAuditTrail);

    await filterAuditTrail();
}

async function filterAuditTrail() {
    const search = document.getElementById('auditSearch')?.value.toLowerCase() || '';
    const userId = document.getElementById('auditFilterUser')?.value || '';
    const dateFrom = document.getElementById('auditDateFrom')?.value || '';
    const dateTo = document.getElementById('auditDateTo')?.value || '';

    let query = window.supabase.from('audit_log')
        .select('*, staff_profiles:user_id(name)')
        .order('created_at', { ascending: false })
        .range((auditPage - 1) * AUDIT_PAGE_SIZE, auditPage * AUDIT_PAGE_SIZE - 1);

    if (userId) query = query.eq('user_id', userId);
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    const { data, error } = await query;
    if (error) { showToast('Failed to load audit log', 'error'); return; }

    const tbody = document.getElementById('auditTableBody');
    let filtered = data || [];
    if (search) {
        filtered = filtered.filter(r =>
            (r.action || '').toLowerCase().includes(search) ||
            (r.table_name || '').toLowerCase().includes(search)
        );
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No audit records found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const changes = _formatChanges(r.old_values, r.new_values);
        return `<tr>
            <td style="white-space:nowrap">${formatDate(r.created_at)} ${new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${escHtml(r.staff_profiles?.name || 'System')}</td>
            <td><span class="badge badge-${_auditActionColor(r.action)}">${escHtml(r.action)}</span></td>
            <td>${escHtml(r.table_name || '—')}</td>
            <td style="font-size:0.78rem;color:var(--text-muted)">${escHtml((r.record_id || '').substring(0, 8)) || '—'}</td>
            <td>${changes || '<span style="color:var(--text-muted)">—</span>'}</td>
        </tr>`;
    }).join('');
}

function _auditActionColor(action) {
    if (!action) return '';
    if (action.includes('create') || action.includes('add') || action.includes('insert')) return 'confirmed';
    if (action.includes('update') || action.includes('edit')) return 'quoted';
    if (action.includes('delete') || action.includes('remove')) return 'cancelled';
    return '';
}

function _formatChanges(oldVals, newVals) {
    if (!oldVals && !newVals) return '';
    const parts = [];
    if (newVals && typeof newVals === 'object') {
        Object.keys(newVals).forEach(k => {
            const oldV = oldVals && oldVals[k] !== undefined ? oldVals[k] : '—';
            const newV = newVals[k];
            if (oldV !== newV) {
                parts.push(`<span style="font-size:0.78rem"><strong>${escHtml(k)}</strong>: ${escHtml(String(oldV))} → ${escHtml(String(newV))}</span>`);
            }
        });
    }
    return parts.join('<br>') || '';
}

function auditGoPage(p) { auditPage = p; filterAuditTrail(); }
