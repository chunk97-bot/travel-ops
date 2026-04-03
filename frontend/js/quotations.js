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
                    <button onclick="viewVersionHistory('${escHtml(r.id)}')" title="Version History">🕒</button>
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

// ── Save Quote (with versioning) ──────────────────────────────
async function saveQuote() {
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

    // If editing, snapshot current version before saving changes
    if (editingQuoteId) {
        const { data: current } = await window.supabase.from('quotations').select('*').eq('id', editingQuoteId).single();
        if (current) {
            const changeNotes = prompt('Brief note about this change (optional):') || '';
            const versionNumber = (current.version || 1);
            await window.supabase.from('quote_versions').insert({
                quote_id: editingQuoteId,
                version_number: versionNumber,
                snapshot: current,
                change_notes: changeNotes || null,
                created_by: userId,
            });
        }
    }

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
        payload.version = (quotesData.find(q => q.id === editingQuoteId)?.version || 1) + 1;
        ({ error } = await window.supabase.from('quotations').update(payload).eq('id', editingQuoteId));
    } else {
        payload.version = 1;
        ({ error } = await window.supabase.from('quotations').insert(payload));
    }

    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast(editingQuoteId ? 'Quote updated (v' + (payload.version) + ')' : 'Quote created');
    closeQuoteDrawer();
    loadQuotes();
    logAudit(editingQuoteId ? 'update' : 'create', 'quotations', editingQuoteId, { destination: payload.destination });
}

// ── Version History ──────────────────────────────────────────
async function viewVersionHistory(quoteId) {
    const { data: versions } = await window.supabase
        .from('quote_versions')
        .select('*')
        .eq('quote_id', quoteId)
        .order('version_number', { ascending: false });

    if (!versions?.length) { showToast('No previous versions found', 'info'); return; }

    const body = document.getElementById('ledgerDrawerBody') || document.createElement('div');
    // Use the ledger drawer if available, or create a simple alert
    const html = `
        <h4 style="margin-bottom:12px">Version History (${versions.length} versions)</h4>
        <div style="max-height:400px;overflow-y:auto">
        ${versions.map(v => {
            const s = v.snapshot || {};
            return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                    <strong>v${v.version_number}</strong>
                    <span style="color:var(--text-muted);font-size:0.8rem">${formatDate(v.created_at)}</span>
                </div>
                <div style="font-size:0.85rem;color:var(--text-muted)">
                    Total: ${formatINR(s.total_amount)} | Pax: ${s.pax_count || '—'} | Items: ${(s.itinerary||[]).length}
                </div>
                ${v.change_notes ? `<div style="font-size:0.82rem;margin-top:4px;color:var(--primary)">📝 ${escHtml(v.change_notes)}</div>` : ''}
                <button class="btn-secondary" style="padding:3px 8px;font-size:0.78rem;margin-top:6px" onclick="restoreVersion('${quoteId}','${v.id}')">Restore this version</button>
            </div>`;
        }).join('')}
        </div>
    `;

    // Show in a simple overlay
    let overlay = document.getElementById('versionOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'versionOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div style="background:var(--bg-card,#1e293b);border-radius:12px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;color:var(--text,#fff)">
        ${html}
        <button class="btn-secondary" style="margin-top:12px;width:100%" onclick="document.getElementById('versionOverlay').remove()">Close</button>
    </div>`;
}

async function restoreVersion(quoteId, versionId) {
    if (!confirm('Restore this version? Current changes will be saved as a new version first.')) return;
    const { data: version } = await window.supabase.from('quote_versions').select('snapshot').eq('id', versionId).single();
    if (!version?.snapshot) { showToast('Version data not found', 'error'); return; }
    const s = version.snapshot;
    // Save current as version first
    const userId = await getCurrentUserId();
    const { data: current } = await window.supabase.from('quotations').select('*').eq('id', quoteId).single();
    if (current) {
        await window.supabase.from('quote_versions').insert({
            quote_id: quoteId, version_number: current.version || 1, snapshot: current,
            change_notes: 'Auto-saved before restore', created_by: userId,
        });
    }
    // Restore
    const { error } = await window.supabase.from('quotations').update({
        destination: s.destination, nights: s.nights, travel_date: s.travel_date, valid_until: s.valid_until,
        pax_count: s.pax_count, gst_percent: s.gst_percent, gst_amount: s.gst_amount,
        base_amount: s.base_amount, discount: s.discount, total_amount: s.total_amount,
        inclusions: s.inclusions, exclusions: s.exclusions, notes: s.notes, itinerary: s.itinerary,
        version: (current?.version || 1) + 1, updated_at: new Date().toISOString(),
    }).eq('id', quoteId);
    if (error) { showToast('Restore failed', 'error'); return; }
    document.getElementById('versionOverlay')?.remove();
    showToast('Version restored!');
    await loadQuotes();
}

// ── PDF Generation (Professional Design) ──────────────────────
async function downloadQuotePdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const settings = await loadSettings();
    const agencyName = settings.agency_name || 'Travel Agency';
    const agencyPhone = settings.phone || '';
    const agencyEmail = settings.email || '';
    const agencyAddr = settings.address || '';
    let y = 0;

    // ── Cover Page ──────────────────────────────────────────
    // Dark header band
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, 210, 55, 'F');

    // Agency name
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text(agencyName, 15, 25);

    // "QUOTATION" badge
    doc.setFillColor(99, 102, 241); doc.roundedRect(145, 10, 50, 14, 3, 3, 'F');
    doc.setFontSize(11); doc.setTextColor(255, 255, 255);
    doc.text('QUOTATION', 170, 19, { align: 'center' });

    // Agency contact under header
    doc.setFontSize(8); doc.setTextColor(200, 200, 200);
    if (agencyPhone) doc.text(agencyPhone, 15, 35);
    if (agencyEmail) doc.text(agencyEmail, 15, 41);
    if (agencyAddr) doc.text(agencyAddr, 15, 47);

    y = 65;
    doc.setTextColor(30, 41, 59);

    // Quote metadata row
    const qNum = document.getElementById('drawerTitle').textContent.includes('QT-')
        ? document.getElementById('drawerTitle').textContent.replace('Edit ', '') : 'New Quote';
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.setFillColor(241, 245, 249); doc.roundedRect(14, y - 6, 182, 28, 3, 3, 'F');
    doc.text(`Quote No: ${qNum}`, 18, y);
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 110, y);
    y += 8;
    doc.text(`Destination: ${document.getElementById('qDestination').value || 'TBD'}`, 18, y);
    doc.text(`Travel Date: ${document.getElementById('qTravelDate').value || 'TBD'}`, 110, y);
    y += 8;
    doc.text(`No. of Pax: ${document.getElementById('qPaxCount').value}`, 18, y);
    doc.text(`Valid Until: ${document.getElementById('qValidUntil').value || 'TBD'}`, 110, y);
    y += 14;

    // ── Line Items Table ──────────────────────────────────────
    // Table header
    doc.setFillColor(99, 102, 241); doc.rect(14, y, 182, 9, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('#', 18, y + 6); doc.text('Description', 26, y + 6); doc.text('Qty', 120, y + 6);
    doc.text('Rate', 140, y + 6); doc.text('Amount', 170, y + 6);
    y += 12;

    const items = getItemsFromTable();
    doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    items.forEach((item, idx) => {
        if (y > 260) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(14, y - 4, 182, 8, 'F'); }
        doc.text(String(idx + 1), 18, y);
        doc.text(String(item.description).substring(0, 50), 26, y);
        doc.text(String(item.qty), 122, y);
        doc.text('₹' + item.rate.toLocaleString('en-IN'), 137, y);
        doc.text('₹' + item.amount.toLocaleString('en-IN'), 167, y);
        y += 8;
    });
    y += 4;

    // ── Totals Box ──────────────────────────────────────────
    doc.setDrawColor(200); doc.line(14, y, 196, y); y += 6;
    const discount = parseFloat(document.getElementById('qDiscount').value || 0);
    const gstPct = parseFloat(document.getElementById('qGstPct').value || 0);
    const subtotalText = document.getElementById('qSubtotal').textContent;
    const gstText = document.getElementById('qGst').textContent;
    const totalText = document.getElementById('qTotal').textContent;

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', 140, y); doc.text(subtotalText, 190, y, { align: 'right' }); y += 7;
    if (discount > 0) { doc.text('Discount:', 140, y); doc.text('-₹' + discount.toLocaleString('en-IN'), 190, y, { align: 'right' }); y += 7; }
    doc.text(`GST (${gstPct}%):`, 140, y); doc.text(gstText, 190, y, { align: 'right' }); y += 8;

    // Grand total highlight
    doc.setFillColor(99, 102, 241); doc.roundedRect(130, y - 5, 66, 12, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 134, y + 3); doc.text(totalText, 192, y + 3, { align: 'right' });
    y += 16; doc.setTextColor(30, 41, 59);

    // ── Inclusions / Exclusions ──────────────────────────────
    const inclusions = document.getElementById('qInclusions').value;
    const exclusions = document.getElementById('qExclusions').value;
    if (inclusions || exclusions) {
        if (y > 230) { doc.addPage(); y = 20; }
        if (inclusions) {
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 185, 129);
            doc.text('✓ Inclusions', 15, y); y += 6;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
            const iLines = doc.splitTextToSize(inclusions, 175);
            doc.text(iLines, 18, y); y += iLines.length * 4.5 + 6;
        }
        if (exclusions) {
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(239, 68, 68);
            doc.text('✗ Exclusions', 15, y); y += 6;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
            const eLines = doc.splitTextToSize(exclusions, 175);
            doc.text(eLines, 18, y); y += eLines.length * 4.5 + 6;
        }
    }

    // ── Terms & Notes ──────────────────────────────────────
    const notes = document.getElementById('qNotes').value;
    if (notes) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(100);
        doc.text('Terms & Conditions', 15, y); y += 6;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
        const nLines = doc.splitTextToSize(notes, 175);
        doc.text(nLines, 18, y); y += nLines.length * 4 + 6;
    }

    // ── Footer ──────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFillColor(241, 245, 249); doc.rect(0, 282, 210, 15, 'F');
        doc.setFontSize(7); doc.setTextColor(150);
        doc.text(`${agencyName} — Thank you for choosing us!`, 105, 289, { align: 'center' });
        doc.text(`Page ${p} of ${pageCount}`, 195, 289, { align: 'right' });
    }

    doc.save(`Quote-${qNum.replace(/\s/g, '-')}-${Date.now()}.pdf`);
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
