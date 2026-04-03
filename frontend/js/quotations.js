// ============================================================
// quotations.js — Quotation module
// ============================================================

let quotesData = [];
let editingQuoteId = null;
let currentPage = 1;
const PAGE_SIZE = 20;

// ── Init ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadQuotes(), loadLeadsDropdown(), loadClientsDropdown(), loadStaffFilter()]);
    document.getElementById('quoteSearch').addEventListener('input', () => { currentPage = 1; renderTable(); });
    document.getElementById('quoteStatusFilter').addEventListener('change', () => { currentPage = 1; renderTable(); });
    document.getElementById('quoteStaffFilter').addEventListener('change', () => { currentPage = 1; renderTable(); });
    document.getElementById('qGstPct').addEventListener('change', recalcTotals);
    addItemRow(); // Start with one empty row
});

async function loadQuotes() {
    const { data, error } = await window.supabase
        .from('quotations')
        .select(`id, quote_number, destination, travel_date, valid_until, pax_count, total_amount, status, created_by,
                 leads(name), clients(name)`)
        .order('created_at', { ascending: false });
    quotesData = data || [];
    renderTable();
}

async function loadLeadsDropdown() {
    const { data } = await window.supabase.from('leads').select('id, name').order('name');
    const sel = document.getElementById('qLeadId');
    sel.innerHTML = '<option value="">Select lead…</option>';
    (data || []).forEach(l => sel.insertAdjacentHTML('beforeend', `<option value="${escHtml(l.id)}">${escHtml(l.name)}</option>`));
}

async function loadClientsDropdown() {
    const { data } = await window.supabase.from('clients').select('id, name').order('name');
    const sel = document.getElementById('qClientId');
    sel.innerHTML = '<option value="">Select client…</option>';
    (data || []).forEach(c => sel.insertAdjacentHTML('beforeend', `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`));
}

async function loadStaffFilter() {
    const sel = document.getElementById('quoteStaffFilter');
    const { data } = await window.supabase.from('staff_profiles').select('id, name').order('name');
    (data || []).forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${escHtml(s.id)}">${escHtml(s.name)}</option>`));
}

function renderTable() {
    const q = document.getElementById('quoteSearch').value.toLowerCase();
    const statusF = document.getElementById('quoteStatusFilter').value;
    const staffF = document.getElementById('quoteStaffFilter').value;

    let filtered = quotesData.filter(r => {
        const name = (r.leads?.name || r.clients?.name || '').toLowerCase();
        const matchQ = !q || r.quote_number?.toLowerCase().includes(q) || name.includes(q) || (r.destination || '').toLowerCase().includes(q);
        const matchS = !statusF || r.status === statusF;
        const matchStaff = !staffF || r.created_by === staffF;
        return matchQ && matchS && matchStaff;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const slice = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const tbody = document.getElementById('quotesTableBody');
    if (slice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">No quotations found</td></tr>';
    } else {
        tbody.innerHTML = slice.map(r => {
            const clientName = escHtml(r.leads?.name || r.clients?.name || '—');
            const isExpired = r.valid_until && new Date(r.valid_until) < new Date() && r.status === 'sent';
            const displayStatus = isExpired ? 'expired' : r.status;
            return `<tr>
                <td><strong>${escHtml(r.quote_number)}</strong></td>
                <td>${clientName}</td>
                <td>${escHtml(r.destination || '—')}</td>
                <td>${formatDate(r.travel_date)}</td>
                <td>${r.pax_count}</td>
                <td>${formatINR(r.total_amount)}</td>
                <td style="color:${isExpired?'#f87171':'inherit'}">${formatDate(r.valid_until)}</td>
                <td><span class="badge badge-${escHtml(displayStatus)}">${escHtml(displayStatus)}</span></td>
                <td class="quote-actions">
                    <button onclick="openEditQuote('${escHtml(r.id)}')">Edit</button>
                    <button onclick="downloadPdfById('${escHtml(r.id)}')">PDF</button>
                    ${r.status === 'accepted' ? `<button onclick="convertToInvoiceById('${escHtml(r.id)}')">→ Invoice</button>` : ''}
                </td>
            </tr>`;
        }).join('');
    }

    renderPagination(filtered.length, totalPages);
}

function renderPagination(total, totalPages) {
    const pEl = document.getElementById('quotesPagination');
    if (totalPages <= 1) { pEl.innerHTML = ''; return; }
    let btns = '';
    for (let i = 1; i <= totalPages; i++) {
        btns += `<button onclick="gotoPage(${i})" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:${i===currentPage?'var(--primary)':'transparent'};color:${i===currentPage?'#000':'var(--text)'};cursor:pointer;">${i}</button>`;
    }
    pEl.innerHTML = `<span style="color:var(--text-muted);font-size:0.82rem;">${total} quotes</span> ${btns}`;
}

function gotoPage(p) { currentPage = p; renderTable(); }

// ── Quote Drawer ─────────────────────────────────────────────
function openNewQuote() {
    editingQuoteId = null;
    document.getElementById('drawerTitle').textContent = 'New Quotation';
    document.getElementById('qLeadId').value = '';
    document.getElementById('qClientId').value = '';
    document.getElementById('qDestination').value = '';
    document.getElementById('qNights').value = 2;
    document.getElementById('qTravelDate').value = '';
    document.getElementById('qValidUntil').value = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    document.getElementById('qPaxCount').value = 2;
    document.getElementById('qGstPct').value = '5';
    document.getElementById('qDiscount').value = 0;
    document.getElementById('qInclusions').value = '';
    document.getElementById('qExclusions').value = '';
    document.getElementById('qNotes').value = '';
    document.getElementById('qStatus').value = 'draft';
    document.getElementById('convertInvoiceBtn').style.display = 'none';
    document.getElementById('quoteItemsBody').innerHTML = '';
    addItemRow();
    recalcTotals();
    openDrawer('quoteDrawer');
    document.getElementById('drawerOverlay').style.display = 'block';
}

async function openEditQuote(id) {
    const { data: q } = await window.supabase.from('quotations').select('*').eq('id', id).single();
    if (!q) return;
    editingQuoteId = id;
    document.getElementById('drawerTitle').textContent = `Edit ${q.quote_number}`;
    document.getElementById('qLeadId').value = q.lead_id || '';
    document.getElementById('qClientId').value = q.client_id || '';
    document.getElementById('qDestination').value = q.destination || '';
    document.getElementById('qNights').value = q.nights || 2;
    document.getElementById('qTravelDate').value = q.travel_date || '';
    document.getElementById('qValidUntil').value = q.valid_until || '';
    document.getElementById('qPaxCount').value = q.pax_count || 2;
    document.getElementById('qGstPct').value = String(q.gst_percent || 5);
    document.getElementById('qDiscount').value = q.discount || 0;
    document.getElementById('qInclusions').value = q.inclusions || '';
    document.getElementById('qExclusions').value = q.exclusions || '';
    document.getElementById('qNotes').value = q.notes || '';
    document.getElementById('qStatus').value = q.status || 'draft';
    document.getElementById('convertInvoiceBtn').style.display = q.status === 'accepted' ? 'inline-block' : 'none';

    // Load line items from itinerary JSONB field
    const items = q.itinerary || [];
    document.getElementById('quoteItemsBody').innerHTML = '';
    if (items.length > 0) {
        items.forEach(item => addItemRow(item.description, item.qty, item.rate));
    } else {
        addItemRow();
    }
    recalcTotals();
    openDrawer('quoteDrawer');
    document.getElementById('drawerOverlay').style.display = 'block';
}

function closeQuoteDrawer() {
    closeDrawer('quoteDrawer');
    document.getElementById('drawerOverlay').style.display = 'none';
}

// ── Line Item Helpers ─────────────────────────────────────────
function addItemRow(desc = '', qty = 1, rate = 0) {
    const tbody = document.getElementById('quoteItemsBody');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" value="${escHtml(String(desc))}" placeholder="e.g. Hotel accommodation" oninput="recalcTotals()"></td>
        <td><input type="number" value="${qty}" min="1" style="width:60px;" oninput="recalcTotals()"></td>
        <td><input type="number" value="${rate}" min="0" oninput="recalcTotals()"></td>
        <td class="row-amount">₹${Number(qty) * Number(rate)}</td>
        <td><button onclick="this.closest('tr').remove();recalcTotals();" style="background:transparent;border:none;color:#ef4444;cursor:pointer;">✕</button></td>`;
    tbody.appendChild(tr);
    recalcTotals();
}

function recalcTotals() {
    const rows = document.querySelectorAll('#quoteItemsBody tr');
    let subtotal = 0;
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const qty = parseFloat(inputs[1]?.value || 0);
        const rate = parseFloat(inputs[2]?.value || 0);
        const amt = qty * rate;
        row.querySelector('.row-amount').textContent = '₹' + amt.toLocaleString('en-IN');
        subtotal += amt;
    });
    const discount = parseFloat(document.getElementById('qDiscount').value || 0);
    const gstPct = parseFloat(document.getElementById('qGstPct').value || 0);
    const taxable = subtotal - discount;
    const gst = Math.round(taxable * gstPct / 100);
    const total = taxable + gst;
    document.getElementById('qSubtotal').textContent = formatINR(subtotal);
    document.getElementById('qGst').textContent = formatINR(gst);
    document.getElementById('qGstLabel').textContent = gstPct;
    document.getElementById('qTotal').textContent = formatINR(total);
}

function getItemsFromTable() {
    const rows = document.querySelectorAll('#quoteItemsBody tr');
    return Array.from(rows).map(row => {
        const inputs = row.querySelectorAll('input');
        return {
            description: inputs[0]?.value || '',
            qty: parseFloat(inputs[1]?.value || 1),
            rate: parseFloat(inputs[2]?.value || 0),
            amount: parseFloat(inputs[1]?.value || 1) * parseFloat(inputs[2]?.value || 0)
        };
    }).filter(i => i.description);
}

// ── Save Quote ────────────────────────────────────────────────
async function saveQuote() {
    const subtotal = quotesData; // placeholder — parse from DOM
    const rows = document.querySelectorAll('#quoteItemsBody tr');
    let base = 0;
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        base += parseFloat(inputs[1]?.value || 0) * parseFloat(inputs[2]?.value || 0);
    });
    const discount = parseFloat(document.getElementById('qDiscount').value || 0);
    const gstPct = parseFloat(document.getElementById('qGstPct').value || 0);
    const taxable = base - discount;
    const gstAmt = Math.round(taxable * gstPct / 100);
    const total = taxable + gstAmt;
    const userId = await getCurrentUserId();

    const payload = {
        lead_id: document.getElementById('qLeadId').value || null,
        client_id: document.getElementById('qClientId').value || null,
        destination: document.getElementById('qDestination').value,
        nights: parseInt(document.getElementById('qNights').value) || 2,
        travel_date: document.getElementById('qTravelDate').value || null,
        valid_until: document.getElementById('qValidUntil').value || null,
        pax_count: parseInt(document.getElementById('qPaxCount').value) || 2,
        gst_percent: gstPct,
        gst_amount: gstAmt,
        base_amount: base,
        discount,
        total_amount: total,
        inclusions: document.getElementById('qInclusions').value,
        exclusions: document.getElementById('qExclusions').value,
        notes: document.getElementById('qNotes').value,
        status: document.getElementById('qStatus').value,
        itinerary: getItemsFromTable(),
        created_by: userId,
        updated_at: new Date().toISOString()
    };

    let error;
    if (editingQuoteId) {
        ({ error } = await window.supabase.from('quotations').update(payload).eq('id', editingQuoteId));
    } else {
        ({ error } = await window.supabase.from('quotations').insert(payload));
    }

    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast(editingQuoteId ? 'Quote updated' : 'Quote created');
    closeQuoteDrawer();
    loadQuotes();
    logAudit(editingQuoteId ? 'update' : 'create', 'quotations', editingQuoteId, { destination: payload.destination });
}

// ── PDF Generation ────────────────────────────────────────────
async function downloadQuotePdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const settings = await loadSettings();
    const y = { val: 20 };
    const line = () => { doc.line(15, y.val, 195, y.val); y.val += 6; };
    const text = (t, x, size=11, bold=false) => {
        doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.text(String(t), x, y.val); y.val += 6;
    };

    // Header
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, 210, 28, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text(settings.agency_name || 'Travel Agency', 15, 18);
    doc.setFontSize(10); doc.setFont('helvetica','normal');
    doc.text('QUOTATION', 185, 18, { align:'right' });
    doc.setTextColor(0,0,0); y.val = 36;

    const qNum = document.getElementById('drawerTitle').textContent.includes('QT-')
        ? document.getElementById('drawerTitle').textContent.replace('Edit ', '') : 'New Quote';
    text(`Quote: ${qNum}  |  Date: ${new Date().toLocaleDateString('en-IN')}`, 15, 10);
    text(`Destination: ${document.getElementById('qDestination').value}  |  Travel: ${document.getElementById('qTravelDate').value || 'TBD'}`, 15, 10);
    text(`Valid Until: ${document.getElementById('qValidUntil').value || 'TBD'}  |  Pax: ${document.getElementById('qPaxCount').value}`, 15, 10);
    y.val += 4; line();

    text('Items', 15, 12, true); y.val += 2;
    doc.setFontSize(9);
    doc.text('Description', 15, y.val); doc.text('Qty', 110, y.val); doc.text('Rate', 140, y.val); doc.text('Amount', 170, y.val);
    y.val += 5; line();

    getItemsFromTable().forEach(item => {
        doc.setFontSize(10);
        doc.text(String(item.description).substring(0,55), 15, y.val);
        doc.text(String(item.qty), 110, y.val);
        doc.text(`₹${item.rate.toLocaleString('en-IN')}`, 135, y.val);
        doc.text(`₹${item.amount.toLocaleString('en-IN')}`, 165, y.val);
        y.val += 7;
    });
    y.val += 4; line();

    const discount = parseFloat(document.getElementById('qDiscount').value || 0);
    const gstPct = parseFloat(document.getElementById('qGstPct').value || 0);
    const subtotalEl = document.getElementById('qSubtotal').textContent;
    const gstEl = document.getElementById('qGst').textContent;
    const totalEl = document.getElementById('qTotal').textContent;
    doc.setFontSize(10);
    doc.text('Subtotal:', 140, y.val); doc.text(subtotalEl, 170, y.val); y.val += 6;
    if (discount > 0) { doc.text('Discount:', 140, y.val); doc.text(`-₹${discount.toLocaleString('en-IN')}`, 170, y.val); y.val += 6; }
    doc.text(`GST (${gstPct}%):`, 140, y.val); doc.text(gstEl, 170, y.val); y.val += 6;
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('TOTAL:', 140, y.val); doc.text(totalEl, 170, y.val); y.val += 10;

    if (document.getElementById('qInclusions').value) {
        doc.setFont('helvetica','bold'); doc.setFontSize(11);
        doc.text('Inclusions', 15, y.val); y.val += 6;
        doc.setFont('helvetica','normal'); doc.setFontSize(9);
        doc.text(document.getElementById('qInclusions').value, 15, y.val, { maxWidth: 180 }); y.val += 20;
    }
    if (document.getElementById('qNotes').value) {
        doc.setFont('helvetica','bold'); doc.setFontSize(11);
        doc.text('Terms & Notes', 15, y.val); y.val += 6;
        doc.setFont('helvetica','normal'); doc.setFontSize(9);
        doc.text(document.getElementById('qNotes').value, 15, y.val, { maxWidth: 180 });
    }

    doc.save(`Quote-${Date.now()}.pdf`);
}

async function downloadPdfById(id) {
    await openEditQuote(id);
    setTimeout(downloadQuotePdf, 400);
}

// ── Convert to Invoice ────────────────────────────────────────
async function convertToInvoice() {
    if (!editingQuoteId) return;
    const conf = confirm('Convert this quote to an invoice? This action cannot be undone.');
    if (!conf) return;
    const { data: q } = await window.supabase.from('quotations').select('*').eq('id', editingQuoteId).single();
    if (!q) return;

    const { data: inv, error } = await window.supabase.from('invoices').insert({
        client_id: q.client_id,
        lead_id: q.lead_id,
        destination: q.destination,
        travel_date: q.travel_date,
        pax_count: q.pax_count,
        base_amount: q.base_amount,
        discount: q.discount,
        gst_percent: q.gst_percent,
        gst_amount: q.gst_amount,
        total_amount: q.total_amount,
        notes: q.notes,
        status: 'draft',
        created_by: q.created_by
    }).select('id').single();

    if (error) { showToast('Conversion failed: ' + error.message, 'error'); return; }

    await window.supabase.from('quotations').update({
        status: 'accepted',
        converted_to_invoice_id: inv.id
    }).eq('id', editingQuoteId);

    showToast('Invoice created from quote!');
    closeQuoteDrawer();
    loadQuotes();
    logAudit('update', 'quotations', editingQuoteId, { converted: true });
}

async function convertToInvoiceById(id) {
    editingQuoteId = id;
    await convertToInvoice();
}

async function loadSettings() {
    const { data } = await window.supabase.from('agency_settings').select('*').limit(1).single();
    return data || {};
}
