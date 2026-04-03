// ============================================================
// staff.js — Staff profiles + commission tracker (with tiers)
// ============================================================

let allStaff = [];
let allCommissions = [];
let commissionTiers = [];

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadStaff(), loadCommissions(), loadCommissionTiers()]);
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
    // Auto-calc commission when base or % changes
    document.getElementById('cBase')?.addEventListener('input', autoCalcCommission);
    document.getElementById('cPct')?.addEventListener('input', autoCalcCommission);
});

async function loadCommissionTiers() {
    const { data } = await window.supabase.from('commission_tiers').select('*').order('min_revenue');
    commissionTiers = data || [];
}

function getTierForRevenue(revenue) {
    let tier = commissionTiers[0] || { tier_name: 'Default', commission_percent: 5 };
    for (const t of commissionTiers) {
        if (revenue >= (t.min_revenue || 0)) tier = t;
    }
    return tier;
}

function autoCalcCommission() {
    const base = parseFloat(document.getElementById('cBase')?.value) || 0;
    const pct = parseFloat(document.getElementById('cPct')?.value) || 0;
    const calc = Math.round(base * pct / 100);
    const el = document.getElementById('cCalc');
    if (el) el.textContent = formatINR(calc);
}

async function loadStaff() {
    const { data } = await window.supabase
        .from('staff_profiles')
        .select('*')
        .order('full_name');
    allStaff = data || [];

    // Fetch revenue per staff for tier assignment
    const year = new Date().getFullYear();
    const { data: invoices } = await window.supabase
        .from('invoices').select('created_by, total_amount')
        .gte('created_at', `${year}-01-01`).lt('created_at', `${year + 1}-01-01`)
        .in('status', ['paid', 'partial']);

    const revenueByStaff = {};
    (invoices || []).forEach(i => {
        revenueByStaff[i.created_by] = (revenueByStaff[i.created_by] || 0) + (parseFloat(i.total_amount) || 0);
    });

    allStaff.forEach(s => {
        s._revenue = revenueByStaff[s.id] || 0;
        s._tier = getTierForRevenue(s._revenue);
    });

    renderStaffGrid(allStaff);
    const sel = document.getElementById('cStaffId');
    if (sel) sel.innerHTML = '<option value="">— Select Staff —</option>' + allStaff.map(s => `<option value="${s.id}">${escHtml(s.full_name)}</option>`).join('');
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
    const el1 = document.getElementById('commPending');
    const el2 = document.getElementById('commPaid');
    if (el1) el1.innerHTML = `<strong>${formatINR(pending)}</strong> Pending`;
    if (el2) el2.innerHTML = `<strong>${formatINR(paid)}</strong> Paid`;
}

function renderStaffGrid(staff) {
    const grid = document.getElementById('staffGrid');
    if (!staff.length) { grid.innerHTML = '<div class="empty-state">No staff profiles yet.</div>'; return; }
    grid.innerHTML = staff.map(s => {
        const tier = s._tier || {};
        const target = s.monthly_target || 0;
        const monthRevenue = s._revenue / Math.max(1, new Date().getMonth() + 1); // avg monthly
        const progress = target > 0 ? Math.min(100, (monthRevenue / target) * 100).toFixed(0) : 0;
        const tierColor = { Bronze: '#cd7f32', Silver: '#c0c0c0', Gold: '#ffd700', Platinum: '#e5e4e2' }[tier.tier_name] || '#6366f1';
        return `
        <div class="staff-card">
            <div class="staff-avatar">${escHtml((s.full_name || 'U').charAt(0).toUpperCase())}</div>
            <div class="staff-name">${escHtml(s.full_name || '—')}</div>
            <div class="staff-role">${escHtml(s.role || '—')}</div>
            <div style="margin:6px 0">
                <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:${tierColor};color:#000">
                    ${escHtml(tier.tier_name || 'Default')} — ${tier.commission_percent || s.commission_percent || 5}%
                </span>
            </div>
            <div class="staff-meta">YTD Revenue: ${formatINR(s._revenue)}</div>
            ${target > 0 ? `
                <div style="margin-top:6px">
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:3px">Monthly Target: ${formatINR(target)}</div>
                    <div style="background:var(--bg-input);border-radius:4px;height:8px;overflow:hidden">
                        <div style="height:100%;width:${progress}%;background:${progress >= 100 ? 'var(--success)' : progress >= 70 ? 'var(--warning)' : 'var(--danger)'};border-radius:4px;transition:width 0.3s"></div>
                    </div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">${progress}% achieved</div>
                </div>
            ` : ''}
        </div>
    `}).join('');
}

function renderCommissions(comms) {
    const tbody = document.getElementById('commTable');
    if (!comms.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No commissions yet</td></tr>'; return; }
    tbody.innerHTML = comms.map(c => {
        const staff = allStaff.find(s => s.id === c.staff_id);
        return `<tr>
            <td>${escHtml(staff?.full_name || '—')}</td>
            <td>${escHtml(c.bookings?.booking_ref || c.invoices?.invoice_number || '—')}</td>
            <td>${c.base_amount ? formatINR(c.base_amount) : '—'}</td>
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
    document.getElementById('staffForm')?.reset();
    openModal('staffModal');
}

async function saveStaff() {
    const name = document.getElementById('sName')?.value.trim();
    if (!name) { showToast('Name required', 'error'); return; }
    const { error } = await window.supabase.from('staff_profiles').upsert({
        full_name: name,
        role: document.getElementById('sRole')?.value || 'sales',
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
    const staffId = document.getElementById('cStaffId')?.value;
    const baseAmount = parseFloat(document.getElementById('cBase')?.value) || 0;
    const pct = parseFloat(document.getElementById('cPct')?.value) || 0;
    const amount = Math.round(baseAmount * pct / 100);
    if (!staffId || !amount) { showToast('Staff and amount required', 'error'); return; }

    // Check approval threshold
    if (typeof needsApproval === 'function' && await needsApproval('commission', amount)) {
        const { data: record } = await window.supabase.from('staff_commissions').insert({
            staff_id: staffId, booking_id: document.getElementById('cBookingId')?.value || null,
            amount, base_amount: baseAmount, percent: pct,
            tier_name: allStaff.find(s => s.id === staffId)?._tier?.tier_name || null,
            notes: document.getElementById('commNotes')?.value?.trim() || null,
            status: 'pending',
        }).select('id').single();
        if (record) await requestApproval('commission', record.id, amount);
        closeModal('commModal');
        await loadCommissions();
        return;
    }

    const { error } = await window.supabase.from('staff_commissions').insert({
        staff_id: staffId, booking_id: document.getElementById('cBookingId')?.value || null,
        amount, base_amount: baseAmount, percent: pct,
        tier_name: allStaff.find(s => s.id === staffId)?._tier?.tier_name || null,
        notes: document.getElementById('commNotes')?.value?.trim() || null,
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
