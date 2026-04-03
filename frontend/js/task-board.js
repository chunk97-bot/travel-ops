// ============================================================
// task-board.js — Daily task board (follow-ups, trips, invoices, docs)
// ============================================================

const today     = new Date(); today.setHours(0,0,0,0);
const todayStr  = today.toISOString().split('T')[0];
const in7days   = new Date(today.getTime() + 7  * 86400000).toISOString().split('T')[0];
const in14days  = new Date(today.getTime() + 14 * 86400000).toISOString().split('T')[0];
const in30days  = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

let currentUserId = null;
let userRole = null;

window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('todayLabel').textContent = today.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    currentUserId = await getCurrentUserId();
    userRole      = await getCurrentUserRole();

    // Show staff picker to admin
    if (userRole === 'admin') {
        const picker = document.getElementById('staffPicker');
        picker.style.display = 'block';
        await loadStaffPicker();
    }

    loadBoard();
});

async function loadStaffPicker() {
    const { data } = await window.supabase.from('staff_profiles').select('id, name').order('name');
    const sel = document.getElementById('staffPicker');
    (data || []).forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${escHtml(s.id)}">${escHtml(s.name)}</option>`));
}

async function loadBoard() {
    const viewMode = document.getElementById('staffViewFilter').value;
    const pickerVal = document.getElementById('staffPicker').value;

    // Determine assignment filter
    let assignFilter = null;
    if (viewMode === 'mine') assignFilter = currentUserId;
    else if (pickerVal) assignFilter = pickerVal;

    await Promise.all([
        loadFollowUps(assignFilter),
        loadUpcomingTrips(),
        loadPendingInvoices(),
        loadExpiringDocs()
    ]);
}

// ── Follow-ups board ──────────────────────────────────────────
async function loadFollowUps(assignedTo) {
    let query = window.supabase
        .from('follow_ups')
        .select(`id, due_date, type, notes, leads(id, name), assigned_to, staff_profiles!follow_ups_assigned_to_fkey(name)`)
        .eq('status', 'pending')
        .lte('due_date', in7days)
        .order('due_date');

    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    const { data } = await query;
    const items = data || [];

    const overdue  = items.filter(f => f.due_date < todayStr);
    const todayArr = items.filter(f => f.due_date === todayStr);
    const upcoming = items.filter(f => f.due_date > todayStr && f.due_date <= in7days);

    document.getElementById('countOverdue').textContent  = overdue.length;
    document.getElementById('countToday').textContent    = todayArr.length;
    document.getElementById('countUpcoming').textContent = upcoming.length;

    renderFollowUpCol('colOverdue',  overdue,  'overdue');
    renderFollowUpCol('colToday',    todayArr, 'today');
    renderFollowUpCol('colUpcoming', upcoming, '');
}

function renderFollowUpCol(elId, items, cssClass) {
    const el = document.getElementById(elId);
    if (items.length === 0) {
        el.innerHTML = `<div class="empty-col">No items here ✓</div>`;
        return;
    }
    el.innerHTML = items.map(f => {
        const staffName = f.staff_profiles?.name || '—';
        const dueLabel  = f.due_date === todayStr ? 'Today' : formatDate(f.due_date);
        return `<div class="task-card ${escHtml(cssClass)}" onclick="window.location.href='leads.html?id=${escHtml(f.leads?.id)}'">
            <div class="tclient">${escHtml(f.leads?.name || 'Unknown Lead')}</div>
            <div class="ttype">${escHtml(capitalise(f.type || 'follow-up'))}</div>
            ${f.notes ? `<div class="ttype" style="margin-top:4px;">"${escHtml(f.notes.substring(0,70))}"</div>` : ''}
            <div class="tdue">📅 ${escHtml(dueLabel)}</div>
            <span class="tstaff">👤 ${escHtml(staffName)}</span>
        </div>`;
    }).join('');
}

// ── Upcoming trips ────────────────────────────────────────────
async function loadUpcomingTrips() {
    const { data } = await window.supabase
        .from('bookings')
        .select('id, destination, travel_date, status, clients(name), leads(name)')
        .gte('travel_date', todayStr)
        .lte('travel_date', in14days)
        .in('status', ['confirmed', 'pending'])
        .order('travel_date');

    const tbody = document.getElementById('tripsBody');
    const rows = data || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">No trips in next 14 days</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(b => {
        const clientName = b.clients?.name || b.leads?.name || '—';
        const daysAway   = Math.ceil((new Date(b.travel_date) - today) / 86400000);
        const daysColor  = daysAway <= 3 ? '#f87171' : daysAway <= 7 ? '#fbbf24' : '#34d399';
        return `<tr>
            <td>${escHtml(clientName)}</td>
            <td>${escHtml(b.destination || '—')}</td>
            <td>${formatDate(b.travel_date)}</td>
            <td><span class="days-badge" style="background:${daysColor}22;color:${daysColor};">${daysAway === 0 ? 'TODAY' : daysAway + ' days'}</span></td>
            <td>${escHtml(b.status)}</td>
            <td><a href="bookings.html" style="color:var(--primary);font-size:0.8rem;">View →</a></td>
        </tr>`;
    }).join('');
}

// ── Pending invoices ──────────────────────────────────────────
async function loadPendingInvoices() {
    const { data } = await window.supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, due_date, clients(name), leads(name)')
        .in('status', ['draft', 'sent', 'partial'])
        .not('due_date', 'is', null)
        .order('due_date');

    const tbody = document.getElementById('invoiceBody');
    const rows = data || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">All invoices collected ✓</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(inv => {
        const clientName = inv.clients?.name || inv.leads?.name || '—';
        const daysOver   = Math.ceil((today - new Date(inv.due_date)) / 86400000);
        const isOverdue  = daysOver > 0;
        return `<tr style="${isOverdue ? 'color:#f87171;' : ''}">
            <td>${escHtml(inv.invoice_number || '—')}</td>
            <td>${escHtml(clientName)}</td>
            <td style="font-weight:600;">${formatINR(inv.total_amount)}</td>
            <td>${formatDate(inv.due_date)}</td>
            <td>${isOverdue ? `<span style="color:#f87171;font-weight:600;">${daysOver} days overdue</span>` : '<span style="color:#34d399">On time</span>'}</td>
        </tr>`;
    }).join('');
}

// ── Expiring docs ─────────────────────────────────────────────
async function loadExpiringDocs() {
    const { data } = await window.supabase
        .from('documents')
        .select('id, document_type, expiry_date, clients(name)')
        .not('expiry_date', 'is', null)
        .gte('expiry_date', todayStr)
        .lte('expiry_date', in30days)
        .order('expiry_date');

    const tbody = document.getElementById('docsBody');
    const rows = data || [];
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">No documents expiring soon ✓</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(doc => {
        const daysLeft = Math.ceil((new Date(doc.expiry_date) - today) / 86400000);
        const col = daysLeft <= 7 ? '#f87171' : daysLeft <= 14 ? '#fbbf24' : '#60a5fa';
        return `<tr>
            <td>${escHtml(doc.clients?.name || '—')}</td>
            <td>${escHtml(capitalise(doc.document_type || ''))}</td>
            <td>${formatDate(doc.expiry_date)}</td>
            <td><span class="days-badge" style="background:${col}22;color:${col};">${daysLeft} days</span></td>
        </tr>`;
    }).join('');
}

function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
