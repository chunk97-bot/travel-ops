// ============================================================
// staff.js — Staff profiles + commission tracker
// ============================================================

let allStaff = [];
let allCommissions = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadStaff();
    await loadCommissions();
    document.getElementById('addStaffBtn')?.addEventListener('click', openAddStaff);
    document.getElementById('closeStaffModal')?.addEventListener('click', () => closeModal('staffModal'));
    document.getElementById('cancelStaffBtn')?.addEventListener('click', () => closeModal('staffModal'));
    document.getElementById('staffModalOverlay')?.addEventListener('click', () => closeModal('staffModal'));
    document.getElementById('saveStaffBtn')?.addEventListener('click', saveStaff);
    document.getElementById('addCommissionBtn')?.addEventListener('click', openAddCommission);
    document.getElementById('closeCommModal')?.addEventListener('click', () => closeModal('commModal'));
    document.getElementById('cancelCommBtn')?.addEventListener('click', () => closeModal('commModal'));
    document.getElementById('commModalOverlay')?.addEventListener('click', () => closeModal('commModal'));
    document.getElementById('saveCommBtn')?.addEventListener('click', saveCommission);
});

async function loadStaff() {
    const { data } = await window.supabase
        .from('staff_profiles')
        .select('*, auth.users(email)')
        .order('full_name');
    allStaff = data || [];
    renderStaffGrid(allStaff);
    // Populate staff dropdowns
    const sel = document.getElementById('commStaffId');
    if (sel) sel.innerHTML = '<option value="">— Select Staff —</option>' + allStaff.map(s => `<option value="${s.user_id}">${escHtml(s.full_name)}</option>`).join('');
}

async function loadCommissions() {
    const { data } = await window.supabase
        .from('staff_commissions')
        .select('*, bookings(booking_ref, destination), invoices(invoice_number)')
        .order('created_at', { ascending: false });
    allCommissions = data || [];
    renderCommissions(allCommissions);
    renderCommStats();
}

function renderCommStats() {
    const pending = allCommissions.filter(c => c.status === 'pending').reduce((s, c) => s + (c.amount || 0), 0);
    const paid = allCommissions.filter(c => c.status === 'paid').reduce((s, c) => s + (c.amount || 0), 0);
    document.getElementById('commPending').innerHTML = `<strong>${formatINR(pending)}</strong> Pending`;
    document.getElementById('commPaid').innerHTML = `<strong>${formatINR(paid)}</strong> Paid`;
}

function renderStaffGrid(staff) {
    const grid = document.getElementById('staffGrid');
    if (!staff.length) { grid.innerHTML = '<div class="empty-state">No staff profiles yet.</div>'; return; }
    grid.innerHTML = staff.map(s => `
        <div class="staff-card">
            <div class="staff-avatar">${escHtml((s.full_name || 'U').charAt(0).toUpperCase())}</div>
            <div class="staff-name">${escHtml(s.full_name || '—')}</div>
            <div class="staff-role">${escHtml(s.role || '—')}</div>
            <div class="staff-meta">${s.commission_percent > 0 ? `Commission: ${s.commission_percent}%` : ''}</div>
            <div class="staff-meta">${s.monthly_target > 0 ? `Target: ${formatINR(s.monthly_target)}/mo` : ''}</div>
        </div>
    `).join('');
}

function renderCommissions(comms) {
    const tbody = document.getElementById('commTable');
    if (!comms.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No commissions yet</td></tr>'; return; }
    tbody.innerHTML = comms.map(c => {
        const staff = allStaff.find(s => s.user_id === c.staff_id);
        return `<tr>
            <td>${escHtml(staff?.full_name || '—')}</td>
            <td>${escHtml(c.bookings?.booking_ref || c.invoices?.invoice_number || '—')}</td>
            <td>${c.percent ? c.percent + '%' : '—'}</td>
            <td><strong>${formatINR(c.amount)}</strong></td>
            <td><span class="badge badge-${c.status}">${c.status}</span></td>
            <td>
                ${c.status === 'pending' ? `<button class="btn-success" style="padding:3px 8px;font-size:0.78rem" onclick="approveComm('${c.id}')">Approve</button>` : ''}
                ${c.status === 'approved' ? `<button class="btn-primary" style="padding:3px 8px;font-size:0.78rem" onclick="markCommPaid('${c.id}')">Mark Paid</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function openAddStaff() {
    document.getElementById('staffForm').reset();
    openModal('staffModal');
}

async function saveStaff() {
    const name = document.getElementById('sName')?.value.trim();
    if (!name) { showToast('Name required', 'error'); return; }
    // Update staff_profiles for current user or use email lookup
    const { error } = await window.supabase.from('staff_profiles').upsert({
        full_name: name,
        role: document.getElementById('sRole')?.value || 'agent',
        phone: document.getElementById('sPhone')?.value.trim() || null,
        commission_percent: parseFloat(document.getElementById('sCommPct')?.value) || 0,
        monthly_target: parseFloat(document.getElementById('sTarget')?.value) || 0,
        joining_date: document.getElementById('sJoining')?.value || null,
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Staff profile saved');
    closeModal('staffModal');
    await loadStaff();
}

function openAddCommission() { openModal('commModal'); }

async function saveCommission() {
    const staffId = document.getElementById('commStaffId')?.value;
    const amount = parseFloat(document.getElementById('commAmount')?.value) || 0;
    if (!staffId || !amount) { showToast('Staff and amount required', 'error'); return; }
    const { error } = await window.supabase.from('staff_commissions').insert({
        staff_id: staffId,
        booking_id: document.getElementById('commBookingId')?.value || null,
        amount,
        percent: parseFloat(document.getElementById('commPct')?.value) || null,
        notes: document.getElementById('commNotes')?.value.trim() || null,
        status: 'pending',
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Commission entry added');
    closeModal('commModal');
    await loadCommissions();
}

async function approveComm(id) {
    await window.supabase.from('staff_commissions').update({ status: 'approved' }).eq('id', id);
    await loadCommissions();
}
async function markCommPaid(id) {
    await window.supabase.from('staff_commissions').update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    showToast('Marked as paid');
    await loadCommissions();
}
