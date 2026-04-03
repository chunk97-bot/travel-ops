// ============================================================
// receipts.js — Client Payment Acknowledgement Receipts
// ============================================================

let allReceipts = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadReceipts();
    document.getElementById('addReceiptBtn')?.addEventListener('click', openAddReceipt);
    document.getElementById('closeRcpModal')?.addEventListener('click', () => closeModal('rcpModal'));
    document.getElementById('cancelRcpBtn')?.addEventListener('click', () => closeModal('rcpModal'));
    document.getElementById('rcpModalOverlay')?.addEventListener('click', () => closeModal('rcpModal'));
    document.getElementById('saveRcpBtn')?.addEventListener('click', saveReceipt);
    document.getElementById('rcpSearch')?.addEventListener('input', filterReceipts);
});

async function loadReceipts() {
    const { data } = await window.supabase
        .from('receipts')
        .select(`
            *,
            clients(name, phone, email),
            invoices(invoice_number, total_amount)
        `)
        .order('created_at', { ascending: false });
    allReceipts = data || [];
    renderStats();
    renderReceipts(allReceipts);
    await populateReceiptClients();
}

function renderStats() {
    const total  = allReceipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const thisMonth = allReceipts.filter(r => {
        const d = new Date(r.payment_date || r.created_at);
        const n = new Date();
        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    }).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    setTxt('statTotalReceived', formatINR(total));
    setTxt('statThisMonth', formatINR(thisMonth));
    setTxt('statCount', allReceipts.length);
}

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function filterReceipts() {
    const q = document.getElementById('rcpSearch')?.value.toLowerCase() || '';
    const filtered = q ? allReceipts.filter(r =>
        (r.receipt_number||'').toLowerCase().includes(q) ||
        (r.clients?.name||'').toLowerCase().includes(q)
    ) : allReceipts;
    renderReceipts(filtered);
}

function renderReceipts(receipts) {
    const tbody = document.getElementById('rcpTableBody');
    if (!receipts.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No receipts yet.</td></tr>'; return; }
    tbody.innerHTML = receipts.map(r => `
        <tr>
            <td class="fw-600">${escHtml(r.receipt_number || '—')}</td>
            <td>${escHtml(r.clients?.name || '—')}</td>
            <td>${formatINR(r.amount)}</td>
            <td>${escHtml(r.payment_mode || '—')}</td>
            <td>${r.payment_date ? formatDate(r.payment_date) : '—'}</td>
            <td>${escHtml(r.invoices?.invoice_number || '—')}</td>
            <td>
                <button class="btn-primary-sm" onclick="downloadReceiptPdf('${r.id}')">PDF</button>
                <button class="btn-danger-sm" onclick="deleteReceipt('${r.id}')">Del</button>
            </td>
        </tr>
    `).join('');
}

async function populateReceiptClients() {
    const { data } = await window.supabase.from('clients').select('id, name').order('name');
    const sel = document.getElementById('rcpClientId');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Client —</option>' +
        (data || []).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    sel.onchange = () => loadClientInvoices(sel.value);
}

async function loadClientInvoices(clientId) {
    const sel = document.getElementById('rcpInvoiceId');
    if (!sel) return;
    if (!clientId) { sel.innerHTML = '<option value="">— Select (optional) —</option>'; return; }
    const { data } = await window.supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, status')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
    sel.innerHTML = '<option value="">— Select Invoice (optional) —</option>' +
        (data || []).map(i => `<option value="${i.id}">${escHtml(i.invoice_number)} — ${formatINR(i.total_amount)}</option>`).join('');
}

function openAddReceipt() {
    document.getElementById('rcpForm')?.reset();
    document.getElementById('rcpId').value = '';
    openModal('rcpModal');
}

async function saveReceipt() {
    const clientId  = document.getElementById('rcpClientId')?.value;
    const amount    = parseFloat(document.getElementById('rcpAmount')?.value || 0);
    const mode      = document.getElementById('rcpPaymentMode')?.value?.trim();
    if (!clientId || !amount) { showToast('Client and amount required', 'error'); return; }

    // Auto-generate receipt number via RPC
    const { data: rcpNum, error: rpcErr } = await window.supabase.rpc('next_receipt_number');
    if (rpcErr) { showToast('Receipt number error: ' + rpcErr.message, 'error'); return; }

    const payload = {
        receipt_number: rcpNum,
        client_id: clientId,
        invoice_id: document.getElementById('rcpInvoiceId')?.value || null,
        amount,
        payment_mode: mode || null,
        payment_date: document.getElementById('rcpPaymentDate')?.value || null,
        notes: document.getElementById('rcpNotes')?.value?.trim() || null,
        created_by: await getCurrentUserId(),
    };
    const { error } = await window.supabase.from('receipts').insert(payload);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Receipt saved: ' + rcpNum);
    closeModal('rcpModal');
    await loadReceipts();
}

async function deleteReceipt(id) {
    if (!confirm('Delete this receipt?')) return;
    await window.supabase.from('receipts').delete().eq('id', id);
    showToast('Deleted');
    await loadReceipts();
}

function downloadReceiptPdf(id) {
    const r = allReceipts.find(x => x.id === id);
    if (!r) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Payment Receipt', 105, 20, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`Receipt No: ${r.receipt_number || '—'}`, 20, 40);
    doc.text(`Date: ${r.payment_date ? formatDate(r.payment_date) : formatDate(r.created_at)}`, 20, 50);
    doc.text(`Client: ${r.clients?.name || '—'}`, 20, 60);
    doc.text(`Amount Received: ${formatINR(r.amount)}`, 20, 70);
    doc.text(`Payment Mode: ${r.payment_mode || '—'}`, 20, 80);
    if (r.invoices?.invoice_number) doc.text(`Against Invoice: ${r.invoices.invoice_number}`, 20, 90);
    if (r.notes) {
        doc.text('Notes:', 20, 105);
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(r.notes, 165);
        doc.text(lines, 20, 115);
    }
    doc.setFontSize(10);
    doc.text('This is an acknowledgement of payment received.', 105, 270, { align: 'center' });
    doc.save(`Receipt-${r.receipt_number || id}.pdf`);
}
