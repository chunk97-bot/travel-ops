// ============================================================
// cancellations.js — Booking Cancellation & Refund Tracking
// ============================================================

let allCancellations = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadCancellations();
    document.getElementById('addCancBtn')?.addEventListener('click', openAddCancellation);
    document.getElementById('closeCancModal')?.addEventListener('click', () => closeModal('cancModal'));
    document.getElementById('cancelCancBtn')?.addEventListener('click', () => closeModal('cancModal'));
    document.getElementById('cancModalOverlay')?.addEventListener('click', () => closeModal('cancModal'));
    document.getElementById('saveCancBtn')?.addEventListener('click', saveCancellation);
    document.getElementById('cancSearch')?.addEventListener('input', filterCancellations);
    document.getElementById('filterCancStatus')?.addEventListener('change', filterCancellations);
    // Live fee calculation
    document.getElementById('cancGrossAmount')?.addEventListener('input', calcRefund);
    document.getElementById('cancCharge')?.addEventListener('input', calcRefund);
});

async function loadCancellations() {
    const { data } = await window.supabase
        .from('cancellations')
        .select(`
            *,
            bookings(booking_ref, client_id, clients(name))
        `)
        .order('created_at', { ascending: false });
    allCancellations = data || [];
    renderStats();
    renderCancellations(allCancellations);
    await populateCancBookings();
}

function renderStats() {
    const totalRefund = allCancellations.reduce((s, c) => s + (parseFloat(c.refund_amount) || 0), 0);
    const pending = allCancellations.filter(c => c.refund_status === 'pending').length;
    const completed = allCancellations.filter(c => c.refund_status === 'completed').length;
    setTxt('statTotalRefunds', formatINR(totalRefund));
    setTxt('statPending', pending);
    setTxt('statCompleted', completed);
}

function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function filterCancellations() {
    const q   = document.getElementById('cancSearch')?.value.toLowerCase() || '';
    const st  = document.getElementById('filterCancStatus')?.value || '';
    const filtered = allCancellations.filter(c => {
        if (st && c.refund_status !== st) return false;
        if (q) {
            const name = c.bookings?.clients?.name?.toLowerCase() || '';
            const ref  = c.bookings?.booking_ref?.toLowerCase() || '';
            if (!name.includes(q) && !ref.includes(q)) return false;
        }
        return true;
    });
    renderCancellations(filtered);
}

function renderCancellations(list) {
    const tbody = document.getElementById('cancTableBody');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No cancellations found.</td></tr>'; return; }
    tbody.innerHTML = list.map(c => {
        const badge = {
            pending: 'badge-warning',
            processing: 'badge-info',
            completed: 'badge-success',
            waived: 'badge-purple',
        }[c.refund_status] || '';
        return `
        <tr>
            <td>${escHtml(c.bookings?.booking_ref || '—')}</td>
            <td>${escHtml(c.bookings?.clients?.name || '—')}</td>
            <td>${formatINR(c.gross_amount)}</td>
            <td>${formatINR(c.cancellation_charge)}</td>
            <td class="fw-600 text-success">${formatINR(c.refund_amount)}</td>
            <td><span class="badge ${badge}">${c.refund_status}</span></td>
            <td>${c.cancelled_on ? formatDate(c.cancelled_on) : '—'}</td>
            <td>
                ${c.refund_status !== 'completed' && c.refund_status !== 'waived'
                    ? `<button class="btn-primary-sm" onclick="openRefundModal('${c.id}')">Refund</button>`
                    : ''}
                <button class="btn-danger-sm" onclick="deleteCancellation('${c.id}')">Del</button>
            </td>
        </tr>`;
    }).join('');
}

async function populateCancBookings() {
    const { data } = await window.supabase
        .from('bookings')
        .select('id, booking_ref, client_id, total_cost, clients(name)')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
    const sel = document.getElementById('cancBookingId');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Booking —</option>' +
        (data || []).map(b =>
            `<option value="${b.id}" data-amount="${b.total_cost||0}" data-client="${b.clients?.name||''}">${escHtml(b.booking_ref)} — ${escHtml(b.clients?.name||'')} (${formatINR(b.total_cost)})</option>`
        ).join('');
    sel.onchange = function() {
        const opt = sel.options[sel.selectedIndex];
        document.getElementById('cancGrossAmount').value = opt.dataset.amount || '';
        calcRefund();
    };
}

function calcRefund() {
    const gross  = parseFloat(document.getElementById('cancGrossAmount')?.value || 0);
    const charge = parseFloat(document.getElementById('cancCharge')?.value || 0);
    const refund = Math.max(0, gross - charge);
    setTxt('cancRefundPreview', formatINR(refund));
    const el = document.getElementById('cancRefundAmount');
    if (el) el.value = refund.toFixed(2);
}

function openAddCancellation() {
    document.getElementById('cancForm')?.reset();
    setTxt('cancRefundPreview', '—');
    openModal('cancModal');
}

async function saveCancellation() {
    const bookingId = document.getElementById('cancBookingId')?.value;
    const gross     = parseFloat(document.getElementById('cancGrossAmount')?.value || 0);
    const charge    = parseFloat(document.getElementById('cancCharge')?.value || 0);
    if (!bookingId) { showToast('Select a booking', 'error'); return; }

    const payload = {
        booking_id: bookingId,
        gross_amount: gross,
        cancellation_charge: charge,
        refund_amount: Math.max(0, gross - charge),
        cancelled_on: document.getElementById('cancCancelledOn')?.value || null,
        reason: document.getElementById('cancReason')?.value?.trim() || null,
        refund_status: 'pending',
        created_by: await getCurrentUserId(),
    };
    const { error } = await window.supabase.from('cancellations').insert(payload);
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    // Mark booking cancelled
    await window.supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    showToast('Cancellation recorded');
    closeModal('cancModal');
    await loadCancellations();
}

async function deleteCancellation(id) {
    if (!confirm('Delete this cancellation record?')) return;
    await window.supabase.from('cancellations').delete().eq('id', id);
    showToast('Deleted');
    await loadCancellations();
}

// ── Refund Modal ──────────────────────────────────────────
function openRefundModal(id) {
    const c = allCancellations.find(x => x.id === id);
    if (!c) return;
    document.getElementById('refundCancId').value = id;
    document.getElementById('refundAmountDisplay').textContent = formatINR(c.refund_amount);
    document.getElementById('refundMode').value = '';
    document.getElementById('refundRef').value = '';
    openModal('refundModal');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('closeRefundModal')?.addEventListener('click', () => closeModal('refundModal'));
    document.getElementById('cancelRefundBtn')?.addEventListener('click', () => closeModal('refundModal'));
    document.getElementById('confirmRefundBtn')?.addEventListener('click', processRefund);
});

async function processRefund() {
    const id   = document.getElementById('refundCancId')?.value;
    const mode = document.getElementById('refundMode')?.value?.trim();
    const ref  = document.getElementById('refundRef')?.value?.trim();
    if (!mode) { showToast('Select refund mode', 'error'); return; }
    const { error } = await window.supabase.from('cancellations').update({
        refund_status: 'completed',
        refund_mode: mode,
        refund_reference: ref || null,
        refunded_on: new Date().toISOString().slice(0, 10),
    }).eq('id', id);
    if (error) { showToast('Update failed: ' + error.message, 'error'); return; }
    showToast('Refund marked as completed');
    closeModal('refundModal');
    await loadCancellations();
}
