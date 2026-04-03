// ============================================================
// proforma.js — Proforma Invoice management
// ============================================================

let allProformas = [];
let editingPIId = null;
let piItemCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    await loadProformas();
    await loadClientOptions(document.getElementById('piClientId'), false);
    if (typeof buildCurrencySelect === 'function') buildCurrencySelect(document.getElementById('piCurrency'));

    document.getElementById('newProformaBtn')?.addEventListener('click', openNewPI);
    document.getElementById('closePIModal')?.addEventListener('click', () => closeModal('piModal'));
    document.getElementById('cancelPIBtn')?.addEventListener('click', () => closeModal('piModal'));
    document.getElementById('piModalOverlay')?.addEventListener('click', () => closeModal('piModal'));
    document.getElementById('savePIBtn')?.addEventListener('click', () => saveProforma('draft'));
    document.getElementById('saveSendPIBtn')?.addEventListener('click', () => saveProforma('sent'));
    document.getElementById('addPIItemBtn')?.addEventListener('click', addLineItem);
    document.getElementById('searchPI')?.addEventListener('input', applyFilters);
    document.getElementById('filterPIStatus')?.addEventListener('change', applyFilters);

    ['piGstPercent', 'piDiscountPercent'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', recalcTotal);
    });
});

// ── Load ──────────────────────────────────────────────────
async function loadProformas() {
    const { data } = await window.supabase
        .from('proforma_invoices')
        .select('*, clients(name, phone, email)')
        .order('created_at', { ascending: false });
    allProformas = data || [];

    // Auto-expire past-due proformas
    const today = new Date().toISOString().split('T')[0];
    allProformas.forEach(p => {
        if (p.valid_until && p.valid_until < today && (p.status === 'draft' || p.status === 'sent')) {
            p.status = 'expired';
            window.supabase.from('proforma_invoices').update({ status: 'expired' }).eq('id', p.id);
        }
    });

    renderStats();
    renderTable(allProformas);
}

function renderStats() {
    document.getElementById('piStatTotal').textContent = allProformas.length;
    document.getElementById('piStatSent').textContent = allProformas.filter(p => p.status === 'sent' || p.status === 'draft').length;
    document.getElementById('piStatAccepted').textContent = allProformas.filter(p => p.status === 'accepted').length;
    document.getElementById('piStatConverted').textContent = allProformas.filter(p => p.status === 'converted').length;
    const pipeline = allProformas.filter(p => ['draft','sent','accepted'].includes(p.status)).reduce((s, p) => s + (p.total_amount || 0), 0);
    document.getElementById('piStatValue').textContent = formatINR(pipeline);
}

// ── Filters ──────────────────────────────────────────────
function applyFilters() {
    const q = document.getElementById('searchPI')?.value.toLowerCase() || '';
    const status = document.getElementById('filterPIStatus')?.value || '';
    const filtered = allProformas.filter(p => {
        if (status && p.status !== status) return false;
        if (q) {
            const hay = [p.proforma_number, p.clients?.name, p.destination].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderTable(filtered);
}

// ── Render table ─────────────────────────────────────────
function renderTable(items) {
    const tbody = document.getElementById('proformaTable');
    if (!items.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No proforma invoices found</td></tr>'; return; }
    const today = new Date().toISOString().split('T')[0];
    tbody.innerHTML = items.map(p => {
        const isExpiringSoon = p.valid_until && p.valid_until >= today && new Date(p.valid_until) <= new Date(Date.now() + 3 * 86400000);
        return `
        <tr>
            <td><strong>${escHtml(p.proforma_number)}</strong></td>
            <td>${escHtml(p.clients?.name || '—')}</td>
            <td>${escHtml(p.destination || '—')}</td>
            <td>${formatINR(p.total_amount)}</td>
            <td>${p.valid_until ? `<span style="color:${isExpiringSoon ? 'var(--warning)' : 'inherit'}">${isExpiringSoon ? '<i data-lucide="alarm-clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ' : ''}${formatDate(p.valid_until)}</span>` : '—'}</td>
            <td>${piBadge(p.status)}</td>
            <td>${formatDate(p.created_at)}</td>
            <td style="white-space:nowrap">
                <button class="btn-secondary" style="padding:3px 8px;font-size:0.78rem" onclick="downloadProformaPdf('${p.id}')">PDF</button>
                ${p.status === 'accepted' ? `<button class="btn-primary" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="convertToInvoice('${p.id}')">→ Invoice</button>` : ''}
                ${['draft','sent'].includes(p.status) ? `<button class="btn-secondary" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="editProforma('${p.id}')">Edit</button>` : ''}
                ${p.status === 'draft' ? `<button class="btn-danger" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="deleteProforma('${p.id}')">&times;</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function piBadge(status) {
    const colors = { draft:'gray', sent:'#f59e0b', accepted:'#10b981', rejected:'#ef4444', expired:'#6b7280', converted:'#6366f1' };
    return `<span class="badge" style="background:${colors[status] || '#6b7280'}20;color:${colors[status] || '#6b7280'};border:1px solid ${colors[status] || '#6b7280'}40">${escHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
}

// ── New / Edit ───────────────────────────────────────────
function openNewPI() {
    editingPIId = null;
    piItemCount = 0;
    document.getElementById('piModalTitle').textContent = 'New Proforma Invoice';
    document.getElementById('piForm')?.reset();
    document.getElementById('piItemsList').innerHTML = '';
    document.getElementById('piGstPercent').value = 5;
    document.getElementById('piDiscountPercent').value = 0;
    document.getElementById('piValidDays').value = 15;
    recalcTotal();
    addLineItem();
    openModal('piModal');
}

async function editProforma(id) {
    const p = allProformas.find(x => x.id === id);
    if (!p) return;
    editingPIId = id;
    document.getElementById('piModalTitle').textContent = 'Edit Proforma';
    document.getElementById('piClientId').value = p.client_id || '';
    document.getElementById('piDestination').value = p.destination || '';
    document.getElementById('piTravelDate').value = p.travel_date || '';
    document.getElementById('piReturnDate').value = p.return_date || '';
    document.getElementById('piPax').value = p.pax_count || 1;
    document.getElementById('piGstPercent').value = p.gst_percent || 5;
    document.getElementById('piDiscountPercent').value = p.discount_percent || 0;
    document.getElementById('piValidDays').value = p.validity_days || 15;
    document.getElementById('piNotes').value = p.notes || '';
    if (p.currency) document.getElementById('piCurrency').value = p.currency;

    // Load line items
    piItemCount = 0;
    document.getElementById('piItemsList').innerHTML = '';
    const { data: items } = await window.supabase.from('proforma_items')
        .select('*').eq('proforma_id', id).order('sort_order');
    (items || []).forEach(item => {
        addLineItem(item.description, item.quantity, item.unit_price);
    });
    if (!items?.length) addLineItem();
    recalcTotal();
    openModal('piModal');
}

// ── Line items ───────────────────────────────────────────
function addLineItem(desc = '', qty = 1, price = 0) {
    piItemCount++;
    const container = document.getElementById('piItemsList');
    const row = document.createElement('div');
    row.className = 'form-row';
    row.style.cssText = 'align-items:center;margin-bottom:6px;gap:8px';
    row.id = `piItem-${piItemCount}`;
    row.innerHTML = `
        <input type="text" class="form-control pi-desc" placeholder="Service description" value="${escHtml(desc)}" style="flex:3">
        <input type="number" class="form-control pi-qty" placeholder="Qty" value="${qty}" min="1" style="flex:0.5;min-width:60px" oninput="recalcTotal()">
        <input type="number" class="form-control pi-price" placeholder="Rate" value="${price}" min="0" style="flex:1" oninput="recalcTotal()">
        <span class="pi-line-total" style="flex:0.8;text-align:right;font-weight:600;min-width:80px">${formatINR(qty * price)}</span>
        <button type="button" class="btn-danger" style="padding:4px 8px;font-size:0.8rem" onclick="this.parentElement.remove();recalcTotal()">&times;</button>
    `;
    container.appendChild(row);
}

function recalcTotal() {
    let subtotal = 0;
    document.querySelectorAll('#piItemsList .form-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.pi-qty')?.value) || 0;
        const price = parseFloat(row.querySelector('.pi-price')?.value) || 0;
        const lineTotal = qty * price;
        subtotal += lineTotal;
        const span = row.querySelector('.pi-line-total');
        if (span) span.textContent = formatINR(lineTotal);
    });
    const gstPct = parseFloat(document.getElementById('piGstPercent')?.value) || 0;
    const discPct = parseFloat(document.getElementById('piDiscountPercent')?.value) || 0;
    const discount = subtotal * (discPct / 100);
    const afterDisc = subtotal - discount;
    const gst = afterDisc * (gstPct / 100);
    const total = afterDisc + gst;
    document.getElementById('piSubtotal').textContent = formatINR(subtotal);
    document.getElementById('piTotal').textContent = formatINR(total);
}

// ── Save ─────────────────────────────────────────────────
async function saveProforma(status = 'draft') {
    const clientId = document.getElementById('piClientId')?.value;
    if (!clientId) { showToast('Select a client', 'error'); return; }

    // Collect line items
    const items = [];
    let subtotal = 0;
    document.querySelectorAll('#piItemsList .form-row').forEach((row, i) => {
        const desc = row.querySelector('.pi-desc')?.value.trim();
        const qty = parseFloat(row.querySelector('.pi-qty')?.value) || 1;
        const price = parseFloat(row.querySelector('.pi-price')?.value) || 0;
        if (desc) {
            items.push({ description: desc, quantity: qty, unit_price: price, amount: qty * price, sort_order: i });
            subtotal += qty * price;
        }
    });
    if (!items.length) { showToast('Add at least one line item', 'error'); return; }

    const gstPct = parseFloat(document.getElementById('piGstPercent')?.value) || 0;
    const discPct = parseFloat(document.getElementById('piDiscountPercent')?.value) || 0;
    const discount = subtotal * (discPct / 100);
    const afterDisc = subtotal - discount;
    const gst = afterDisc * (gstPct / 100);
    const total = afterDisc + gst;
    const validDays = parseInt(document.getElementById('piValidDays')?.value) || 15;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const payload = {
        client_id: clientId,
        destination: document.getElementById('piDestination')?.value.trim() || null,
        travel_date: document.getElementById('piTravelDate')?.value || null,
        return_date: document.getElementById('piReturnDate')?.value || null,
        pax_count: parseInt(document.getElementById('piPax')?.value) || 1,
        base_amount: subtotal,
        gst_percent: gstPct,
        gst_amount: gst,
        discount_percent: discPct,
        discount_amount: discount,
        total_amount: total,
        currency: document.getElementById('piCurrency')?.value || 'INR',
        validity_days: validDays,
        valid_until: validUntil.toISOString().split('T')[0],
        notes: document.getElementById('piNotes')?.value.trim() || null,
        status,
    };

    let piId;
    if (editingPIId) {
        payload.updated_at = new Date().toISOString();
        const { error } = await window.supabase.from('proforma_invoices').update(payload).eq('id', editingPIId);
        if (error) { showToast('Failed: ' + error.message, 'error'); return; }
        piId = editingPIId;
        // Remove old items
        await window.supabase.from('proforma_items').delete().eq('proforma_id', piId);
    } else {
        // Generate proforma number
        const { data: numData } = await window.supabase.rpc('next_proforma_number');
        payload.proforma_number = numData || `PI-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        payload.created_by = await getCurrentUserId();
        const { data, error } = await window.supabase.from('proforma_invoices').insert(payload).select('id').single();
        if (error) { showToast('Failed: ' + error.message, 'error'); return; }
        piId = data.id;
    }

    // Insert line items
    if (piId && items.length) {
        const rows = items.map(it => ({ ...it, proforma_id: piId }));
        await window.supabase.from('proforma_items').insert(rows);
    }

    showToast(editingPIId ? 'Proforma updated' : `Proforma created: ${payload.proforma_number}`);
    closeModal('piModal');
    await loadProformas();
}

// ── Convert to Tax Invoice ───────────────────────────────
async function convertToInvoice(piId) {
    if (!confirm('Convert this proforma to a tax invoice?')) return;
    const p = allProformas.find(x => x.id === piId);
    if (!p) return;

    const { data: numData } = await window.supabase.rpc('next_invoice_number');
    const userId = await getCurrentUserId();
    const { data: inv, error } = await window.supabase.from('invoices').insert({
        invoice_number: numData || `INV-${Date.now()}`,
        client_id: p.client_id,
        itinerary_id: p.itinerary_id || null,
        travel_date: p.travel_date,
        pax_count: p.pax_count,
        base_amount: p.base_amount,
        gst_percent: p.gst_percent,
        gst_amount: p.gst_amount,
        tcs_percent: 0,
        tcs_amount: 0,
        total_amount: p.total_amount,
        status: 'draft',
        due_date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        notes: `Converted from ${p.proforma_number}`,
        proforma_id: piId,
        created_by: userId,
    }).select('id, invoice_number').single();

    if (error) { showToast('Conversion failed: ' + error.message, 'error'); return; }

    await window.supabase.from('proforma_invoices').update({
        status: 'converted', converted_invoice_id: inv.id, updated_at: new Date().toISOString()
    }).eq('id', piId);

    showToast(`Converted to ${inv.invoice_number}! Go to Invoices to view.`);
    await loadProformas();
}

// ── PDF download ─────────────────────────────────────────
async function downloadProformaPdf(piId) {
    const p = allProformas.find(x => x.id === piId);
    if (!p) return;

    // Fetch line items
    const { data: items } = await window.supabase.from('proforma_items')
        .select('*').eq('proforma_id', piId).order('sort_order');

    // Fetch agency settings
    let agency = {};
    try {
        const { data } = await window.supabase.from('agency_settings').select('*').limit(1).single();
        if (data) agency = data;
    } catch (_) {}

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = 210, lm = 15, rm = 195;
    let y = 15;

    // Header
    doc.setFillColor(0, 120, 200);
    doc.rect(0, 0, pw, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(agency.agency_name || 'Travel Agency', lm, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const parts = [agency.phone, agency.email, agency.website].filter(Boolean);
    if (parts.length) doc.text(parts.join('  |  '), lm, 22);
    if (agency.address) doc.text(agency.address, lm, 28);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFORMA INVOICE', rm, 14, { align: 'right' });

    y = 40;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`${p.proforma_number}`, lm, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${formatDate(p.created_at)}`, rm, y, { align: 'right' });
    y += 6;
    doc.text(`Valid Until: ${p.valid_until ? formatDate(p.valid_until) : 'N/A'}`, rm, y, { align: 'right' });

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', lm, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
    doc.text(p.clients?.name || '—', lm, y);
    if (p.clients?.email) { y += 5; doc.text(p.clients.email, lm, y); }
    if (p.clients?.phone) { y += 5; doc.text(p.clients.phone, lm, y); }
    if (p.destination) { y += 5; doc.text(`Destination: ${p.destination}`, lm, y); }
    if (p.travel_date) { y += 5; doc.text(`Travel: ${formatDate(p.travel_date)}${p.return_date ? ' → ' + formatDate(p.return_date) : ''}  |  Pax: ${p.pax_count}`, lm, y); }

    // Table header
    y += 12;
    doc.setFillColor(240, 240, 240);
    doc.rect(lm, y - 4, rm - lm, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('#', lm + 2, y);
    doc.text('Description', lm + 12, y);
    doc.text('Qty', 130, y, { align: 'center' });
    doc.text('Rate', 155, y, { align: 'right' });
    doc.text('Amount', rm, y, { align: 'right' });

    y += 6;
    doc.setFont('helvetica', 'normal');
    (items || []).forEach((item, i) => {
        doc.text(`${i + 1}`, lm + 2, y);
        doc.text(item.description || '', lm + 12, y);
        doc.text(`${item.quantity}`, 130, y, { align: 'center' });
        doc.text(formatINR(item.unit_price), 155, y, { align: 'right' });
        doc.text(formatINR(item.amount), rm, y, { align: 'right' });
        y += 6;
    });

    // Totals
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(130, y, rm, y);
    y += 6;
    doc.text('Subtotal:', 150, y);
    doc.text(formatINR(p.base_amount), rm, y, { align: 'right' });
    if (p.discount_amount) {
        y += 5;
        doc.text(`Discount (${p.discount_percent}%):`, 150, y);
        doc.text(`-${formatINR(p.discount_amount)}`, rm, y, { align: 'right' });
    }
    y += 5;
    doc.text(`GST (${p.gst_percent}%):`, 150, y);
    doc.text(formatINR(p.gst_amount), rm, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', 150, y);
    doc.text(formatINR(p.total_amount), rm, y, { align: 'right' });

    // Notes
    if (p.notes) {
        y += 12;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Terms & Notes:', lm, y);
        y += 5;
        doc.setTextColor(100, 100, 100);
        const lines = doc.splitTextToSize(p.notes, rm - lm);
        doc.text(lines, lm, y);
    }

    // Footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.text('This is a proforma invoice and is not a demand for payment.', pw / 2, 285, { align: 'center' });

    doc.save(`${p.proforma_number}.pdf`);
}

// ── Delete ───────────────────────────────────────────────
async function deleteProforma(id) {
    if (!confirm('Delete this proforma invoice?')) return;
    await window.supabase.from('proforma_items').delete().eq('proforma_id', id);
    const { error } = await window.supabase.from('proforma_invoices').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Proforma deleted');
    await loadProformas();
}
