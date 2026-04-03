// ============================================================
// tcs.js — TCS Tracker (Section 206C(1G), Form 27EQ)
// ============================================================

let allChallans = [];
let invoiceTcs  = [];

document.addEventListener('DOMContentLoaded', async () => {
    populateYearFilter();
    document.getElementById('tcsYear')?.addEventListener('change', loadAll);
    document.getElementById('openAddTcs')?.addEventListener('click', openAddTcs);
    document.getElementById('closeTcsModal')?.addEventListener('click', () => closeModal('tcsModal'));
    document.getElementById('cancelTcsBtn')?.addEventListener('click', () => closeModal('tcsModal'));
    document.getElementById('tcsModalOverlay')?.addEventListener('click', () => closeModal('tcsModal'));
    document.getElementById('saveTcsBtn')?.addEventListener('click', saveChallan);
    await loadAll();
});

function getYear() { return parseInt(document.getElementById('tcsYear')?.value || new Date().getFullYear()); }

function populateYearFilter() {
    const sel = document.getElementById('tcsYear');
    const cur = new Date().getFullYear();
    for (let y = cur; y >= cur - 4; y--) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y + '–' + (y + 1).toString().slice(-2);
        if (y === cur) opt.selected = true;
        sel.appendChild(opt);
    }
}

async function loadAll() {
    await Promise.all([loadInvoiceTcs(), loadChallans()]);
    renderStats();
}

// TCS from invoices (source of truth for collected amount)
async function loadInvoiceTcs() {
    const year = getYear();
    const { data } = await window.supabase
        .from('invoices')
        .select('invoice_number, issue_date, total_amount, tcs_percent, tcs_amount, clients(name)')
        .gte('issue_date', `${year}-04-01`)
        .lt('issue_date', `${year + 1}-04-01`)
        .gt('tcs_amount', 0)
        .order('issue_date');
    invoiceTcs = data || [];
    renderInvoiceTcs();
}

function renderInvoiceTcs() {
    const tbody = document.getElementById('tcsInvoiceBody');
    if (!invoiceTcs.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No TCS collected yet.</td></tr>'; return; }
    tbody.innerHTML = invoiceTcs.map(inv => `
        <tr>
            <td class="fw-600">${escHtml(inv.invoice_number)}</td>
            <td>${escHtml(inv.clients?.name || '—')}</td>
            <td>${formatDate(inv.issue_date)}</td>
            <td>${formatINR(inv.total_amount)}</td>
            <td>${inv.tcs_percent}%</td>
            <td class="fw-600 text-warning">${formatINR(inv.tcs_amount)}</td>
        </tr>
    `).join('');
}

// Challans (deposits to govt)
async function loadChallans() {
    const year = getYear();
    const { data } = await window.supabase
        .from('tcs_entries')
        .select('*')
        .gte('deposit_date', `${year}-04-01`)
        .lt('deposit_date', `${year + 1}-04-01`)
        .order('deposit_date');
    allChallans = data || [];
    renderChallans();
}

function renderChallans() {
    const tbody = document.getElementById('tcsChallansBody');
    if (!allChallans.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No challans recorded yet.</td></tr>'; return; }
    tbody.innerHTML = allChallans.map(c => `
        <tr>
            <td>${escHtml(c.quarter)}</td>
            <td>${escHtml(c.period || '—')}</td>
            <td>${escHtml(c.challan_number || '—')}</td>
            <td>${escHtml(c.bsr_code || '—')}</td>
            <td class="fw-600">${formatINR(c.amount)}</td>
            <td>${formatDate(c.deposit_date)}</td>
            <td><span class="badge badge-success">Deposited</span></td>
            <td><button class="btn-danger-sm" onclick="deleteChallan('${c.id}')">Del</button></td>
        </tr>
    `).join('');
}

function renderStats() {
    const collected = invoiceTcs.reduce((s, i) => s + (parseFloat(i.tcs_amount) || 0), 0);
    const deposited = allChallans.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

    // Quarterly collected from invoices (Indian FY: Apr = month 3 in 0-based from April)
    const quarterCollected = [0, 0, 0, 0];
    invoiceTcs.forEach(inv => {
        const m = new Date(inv.issue_date).getMonth(); // 0=Jan
        // Q1 Apr-Jun (3,4,5), Q2 Jul-Sep (6,7,8), Q3 Oct-Dec (9,10,11), Q4 Jan-Mar (0,1,2)
        if (m >= 3 && m <= 5)       quarterCollected[0] += parseFloat(inv.tcs_amount) || 0;
        else if (m >= 6 && m <= 8)  quarterCollected[1] += parseFloat(inv.tcs_amount) || 0;
        else if (m >= 9 && m <= 11) quarterCollected[2] += parseFloat(inv.tcs_amount) || 0;
        else                         quarterCollected[3] += parseFloat(inv.tcs_amount) || 0;
    });

    setTxt('tcsQ1', formatINR(quarterCollected[0]));
    setTxt('tcsQ2', formatINR(quarterCollected[1]));
    setTxt('tcsQ3', formatINR(quarterCollected[2]));
    setTxt('tcsQ4', formatINR(quarterCollected[3]));
    setTxt('tcsCollected', formatINR(collected));
    setTxt('tcsDeposited', formatINR(deposited));
    setTxt('tcsPending', formatINR(Math.max(0, collected - deposited)));
}

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function openAddTcs() {
    document.getElementById('tcsForm')?.reset();
    openModal('tcsModal');
}

async function saveChallan() {
    const amount = parseFloat(document.getElementById('tcsAmount')?.value || 0);
    const date   = document.getElementById('tcsDepDate')?.value;
    if (!amount || !date) { showToast('Amount and date required', 'error'); return; }
    const payload = {
        quarter: document.getElementById('tcsQuarter')?.value,
        period: document.getElementById('tcsPeriod')?.value?.trim() || null,
        amount,
        deposit_date: date,
        challan_number: document.getElementById('tcsChallanNo')?.value?.trim() || null,
        bsr_code: document.getElementById('tcsBsr')?.value?.trim() || null,
        notes: document.getElementById('tcsNotes')?.value?.trim() || null,
        created_by: await getCurrentUserId(),
    };
    const { error } = await window.supabase.from('tcs_entries').insert(payload);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Challan saved');
    closeModal('tcsModal');
    await loadAll();
}

async function deleteChallan(id) {
    if (!confirm('Delete this challan record?')) return;
    await window.supabase.from('tcs_entries').delete().eq('id', id);
    showToast('Deleted');
    await loadAll();
}

// Export 27EQ CSV
async function exportTcs() {
    const year = getYear();
    const rows = [
        ['Form 27EQ — TCS Return', '', '', ''],
        ['Financial Year:', `${year}-${year+1}`, '', ''],
        ['', '', '', ''],
        ['COLLECTED FROM INVOICES', '', '', ''],
        ['Invoice No', 'Client', 'Date', 'TCS Amount'],
        ...invoiceTcs.map(i => [i.invoice_number, i.clients?.name || '', i.issue_date, i.tcs_amount]),
        ['', '', '', ''],
        ['CHALLANS DEPOSITED', '', '', ''],
        ['Quarter', 'Challan No', 'BSR Code', 'Amount Deposited', 'Date'],
        ...allChallans.map(c => [c.quarter, c.challan_number || '', c.bsr_code || '', c.amount, c.deposit_date]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `27EQ-${year}-${year+1}.csv`; a.click();
}
