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
    const pw = doc.internal.pageSize.getWidth();
    const date = r.payment_date ? formatDate(r.payment_date) : formatDate(r.created_at);

    // ── Dark header band ──
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pw, 40, 'F');

    // Agency name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('Travel Ops', 20, 18);

    // RECEIPT badge
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(pw - 70, 8, 55, 14, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('RECEIPT', pw - 42.5, 17, { align: 'center' });

    // Sub-info in header
    doc.setFontSize(8);
    doc.setTextColor(180, 190, 210);
    doc.text('Your Trusted Travel Partner', 20, 28);
    doc.text('Bangalore, India', 20, 34);

    // Receipt number + date
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(`Receipt No: ${r.receipt_number || '—'}`, pw - 15, 28, { align: 'right' });
    doc.text(`Date: ${date}`, pw - 15, 34, { align: 'right' });

    // ── Light gray info box ──
    let y = 52;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(15, y - 5, pw - 30, 48, 4, 4, 'F');

    doc.setFontSize(9);
    doc.setTextColor(100, 110, 130);
    doc.setFont('helvetica', 'normal');

    // Left column
    doc.text('Client Name', 22, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(r.clients?.name || '—', 22, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 110, 130);
    if (r.clients?.phone) { doc.text(`Phone: ${r.clients.phone}`, 22, y + 20); }
    if (r.clients?.email) { doc.text(`Email: ${r.clients.email}`, 22, y + 27); }

    // Right column
    const rx = pw / 2 + 10;
    doc.text('Payment Mode', rx, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text((r.payment_mode || '—').toUpperCase(), rx, y + 12);

    if (r.invoices?.invoice_number) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 110, 130);
        doc.text('Against Invoice', rx, y + 20);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(r.invoices.invoice_number, rx, y + 27);
    }

    // ── Amount box (green highlight) ──
    y = 110;
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(15, y, pw - 30, 28, 4, 4, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.text('Amount Received', 22, y + 10);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(formatINR(r.amount), 22, y + 22);

    // Amount in words
    y += 36;
    doc.setFontSize(9);
    doc.setTextColor(100, 110, 130);
    doc.setFont('helvetica', 'normal');
    doc.text(`Amount in words: ${numberToWords(r.amount)} Rupees Only`, 20, y);

    // Reference
    if (r.reference || r.notes) {
        y += 12;
        if (r.reference) { doc.text(`Reference / UTR: ${r.reference}`, 20, y); y += 8; }
        if (r.notes) {
            doc.text('Notes:', 20, y);
            const lines = doc.splitTextToSize(r.notes, pw - 40);
            doc.text(lines, 20, y + 6);
            y += 6 + lines.length * 5;
        }
    }

    // ── Signature line ──
    y = Math.max(y + 20, 200);
    doc.setDrawColor(200);
    doc.line(pw - 80, y, pw - 20, y);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Authorized Signatory', pw - 50, y + 8, { align: 'center' });

    // ── Footer ──
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text('This is a computer-generated receipt and does not require a physical signature.', pw / 2, 275, { align: 'center' });
    doc.text('Thank you for your payment!', pw / 2, 281, { align: 'center' });

    doc.save(`Receipt-${r.receipt_number || id}.pdf`);
}

function numberToWords(n) {
    if (!n || n === 0) return 'Zero';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
        'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const num = Math.abs(Math.round(n));
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' ' + ones[num%10] : '');
    if (num < 1000) return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' and ' + numberToWords(num%100) : '');
    if (num < 100000) return numberToWords(Math.floor(num/1000)) + ' Thousand' + (num%1000 ? ' ' + numberToWords(num%1000) : '');
    if (num < 10000000) return numberToWords(Math.floor(num/100000)) + ' Lakh' + (num%100000 ? ' ' + numberToWords(num%100000) : '');
    return numberToWords(Math.floor(num/10000000)) + ' Crore' + (num%10000000 ? ' ' + numberToWords(num%10000000) : '');
}
