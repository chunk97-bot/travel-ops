// ============================================================
// bookings.js — Booking confirmations, PNRs, vouchers
// ============================================================

let allBookings = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadBookings();
    document.getElementById('addBookingBtn')?.addEventListener('click', openAddBooking);
    document.getElementById('closeBookingModal')?.addEventListener('click', () => closeModal('bookingModal'));
    document.getElementById('cancelBookingBtn')?.addEventListener('click', () => closeModal('bookingModal'));
    document.getElementById('bookingModalOverlay')?.addEventListener('click', () => closeModal('bookingModal'));
    document.getElementById('saveBookingBtn')?.addEventListener('click', saveBooking);
    document.getElementById('searchBookings')?.addEventListener('input', applyFilters);
    document.getElementById('filterBStatus')?.addEventListener('change', applyFilters);
    document.getElementById('addServiceBtn')?.addEventListener('click', addServiceRow);
    document.getElementById('drawerOverlay')?.addEventListener('click', closeDrawer);
});

async function loadBookings() {
    const { data } = await window.supabase
        .from('bookings')
        .select('*, clients(name, phone), leads(name), booking_services(*)')
        .order('travel_date', { ascending: true });
    allBookings = data || [];
    renderStats();
    renderTable(allBookings);
}

function renderStats() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('bStatConfirmed').innerHTML = `<strong>${allBookings.filter(b => b.status === 'confirmed').length}</strong> Confirmed`;
    document.getElementById('bStatUpcoming').innerHTML = `<strong>${allBookings.filter(b => b.status === 'confirmed' && b.travel_date >= today).length}</strong> Upcoming`;
    document.getElementById('bStatOnTrip').innerHTML   = `<strong>${allBookings.filter(b => b.status === 'on_trip').length}</strong> On Trip`;
    document.getElementById('bStatDone').innerHTML     = `<strong>${allBookings.filter(b => b.status === 'completed').length}</strong> Completed`;
}

function applyFilters() {
    const q      = document.getElementById('searchBookings')?.value.toLowerCase() || '';
    const status = document.getElementById('filterBStatus')?.value || '';
    const filtered = allBookings.filter(b => {
        if (status && b.status !== status) return false;
        if (q) {
            const hay = [b.booking_ref, b.destination, b.clients?.name, b.leads?.name].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderTable(filtered);
}

function renderTable(bookings) {
    const tbody = document.getElementById('bookingsTable');
    if (!bookings.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No bookings found</td></tr>'; return; }
    tbody.innerHTML = bookings.map(b => `
        <tr>
            <td><strong>${escHtml(b.booking_ref)}</strong></td>
            <td>${escHtml(b.clients?.name || b.leads?.name || '—')}</td>
            <td>${escHtml(b.destination)}</td>
            <td>${formatDate(b.travel_date)} → ${formatDate(b.return_date)}</td>
            <td>${b.pax_count}</td>
            <td>${(b.booking_services || []).length} services</td>
            <td><span class="badge badge-${b.status}">${b.status.replace('_',' ')}</span></td>
            <td>
                <button class="btn-secondary" style="padding:3px 8px;font-size:0.78rem" onclick="openBookingDrawer('${b.id}')">View</button>
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="deleteBooking('${b.id}')">&times;</button>
            </td>
        </tr>
    `).join('');
}

let serviceRows = 0;
function addServiceRow() {
    serviceRows++;
    const container = document.getElementById('servicesList');
    const row = document.createElement('div');
    row.className = 'service-row';
    row.id = `svc-${serviceRows}`;
    row.innerHTML = `
        <div class="service-row-fields">
            <select class="form-control svc-type" name="type">
                <option value="hotel">Hotel</option>
                <option value="flight">Flight</option>
                <option value="transfer">Transfer</option>
                <option value="activity">Activity</option>
                <option value="visa">Visa</option>
                <option value="other">Other</option>
            </select>
            <input type="text" class="form-control svc-desc" placeholder="Description / Hotel name" style="flex:2">
            <input type="text" class="form-control svc-pnr" placeholder="PNR / Conf. No">
            <input type="date" class="form-control svc-checkin" title="Check-in / Departure">
            <input type="date" class="form-control svc-checkout" title="Check-out / Return">
            <input type="number" class="form-control svc-cost" placeholder="Cost ₹">
            <button class="btn-danger" style="padding:4px 8px" onclick="document.getElementById('svc-${serviceRows}').remove()">&times;</button>
        </div>
    `;
    container.appendChild(row);
}

function openAddBooking() {
    document.getElementById('bookingForm').reset();
    document.getElementById('servicesList').innerHTML = '';
    serviceRows = 0;
    addServiceRow(); // start with one row
    openModal('bookingModal');
}

async function saveBooking() {
    const destination = document.getElementById('bDestination')?.value.trim();
    if (!destination) { showToast('Destination is required', 'error'); return; }
    const userId = await getCurrentUserId();
    const { data: refData } = await window.supabase.rpc('next_booking_ref');
    const bookingPayload = {
        booking_ref: refData || `BKG-${Date.now()}`,
        destination,
        client_id: document.getElementById('bClientId')?.value || null,
        lead_id: document.getElementById('bLeadId')?.value || null,
        itinerary_id: document.getElementById('bItineraryId')?.value || null,
        travel_date: document.getElementById('bTravelDate')?.value || null,
        return_date: document.getElementById('bReturnDate')?.value || null,
        pax_count: parseInt(document.getElementById('bPax')?.value) || 1,
        status: document.getElementById('bStatus')?.value || 'confirmed',
        notes: document.getElementById('bNotes')?.value.trim() || null,
        created_by: userId,
    };
    const { data: booking, error } = await window.supabase.from('bookings').insert(bookingPayload).select().single();
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    // Save service rows
    const rows = document.querySelectorAll('.service-row');
    const services = [];
    rows.forEach(row => {
        const desc = row.querySelector('.svc-desc')?.value.trim();
        if (!desc) return;
        services.push({
            booking_id: booking.id,
            service_type: row.querySelector('.svc-type')?.value || 'other',
            description: desc,
            pnr: row.querySelector('.svc-pnr')?.value.trim() || null,
            check_in: row.querySelector('.svc-checkin')?.value || null,
            check_out: row.querySelector('.svc-checkout')?.value || null,
            cost_price: parseFloat(row.querySelector('.svc-cost')?.value) || 0,
        });
    });
    if (services.length) await window.supabase.from('booking_services').insert(services);

    showToast('Booking created: ' + booking.booking_ref);
    closeModal('bookingModal');

    // ── WhatsApp Trip Updates (Enhancement #1) ────────
    const clientPhone = document.getElementById('bClientPhone')?.value?.trim();
    if (clientPhone) {
        sendWhatsAppUpdate(clientPhone, `<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Booking confirmed!\n\nRef: ${booking.booking_ref}\nDestination: ${destination}\nTravel: ${bookingPayload.travel_date}\nPax: ${bookingPayload.pax_count}\n\nYour trip is being prepared. We'll share your itinerary & documents soon!`);
    }

    await loadBookings();
}

async function openBookingDrawer(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;
    document.getElementById('drawerBookingRef').textContent = b.booking_ref;

    // ── P&L per Trip (Enhancement #12) ────────────────
    const serviceCost = (b.booking_services || []).reduce((s, svc) => s + (svc.cost_price || 0), 0);
    const { data: invoiceData } = await window.supabase.from('invoices').select('total_amount').eq('itinerary_id', b.itinerary_id).or(`client_id.eq.${b.client_id}`);
    const revenue = invoiceData?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0;
    const { data: tripExpenses } = await window.supabase.from('expenses').select('amount').ilike('description', `%${b.booking_ref}%`);
    const extraExpenses = tripExpenses?.reduce((s, e) => s + (e.amount || 0), 0) || 0;
    const totalCost = serviceCost + extraExpenses;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0';

    const body = document.getElementById('bDrawerBody');
    body.innerHTML = `
        ${renderTripTimeline(b)}
        <div class="drawer-section">
            <h4>Trip Details</h4>
            <p><strong>Destination:</strong> ${escHtml(b.destination)}</p>
            <p><strong>Client:</strong> ${escHtml(b.clients?.name || b.leads?.name || '—')}</p>
            <p><strong>Travel:</strong> ${formatDate(b.travel_date)} → ${formatDate(b.return_date)}</p>
            <p><strong>Pax:</strong> ${b.pax_count} · <strong>Status:</strong> ${b.status}</p>
        </div>
        <div class="drawer-section">
            <h4>Services (${(b.booking_services || []).length})</h4>
            ${(b.booking_services || []).map(s => `
                <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                    <strong>${s.service_type}</strong> — ${escHtml(s.description || '')}
                    ${s.pnr ? `<br>PNR/Ref: <code>${escHtml(s.pnr)}</code>` : ''}
                    ${s.check_in ? `<br>${formatDate(s.check_in)} → ${formatDate(s.check_out)}` : ''}
                    ${s.cost_price ? `<br>Cost: ${formatINR(s.cost_price)}` : ''}
                    <span class="badge badge-${s.status}" style="margin-left:6px">${s.status}</span>
                </div>
            `).join('') || '<p style="color:var(--text-muted)">No services added</p>'}
        </div>
        ${b.notes ? `<div class="drawer-section"><h4>Notes</h4><p>${escHtml(b.notes)}</p></div>` : ''}
        <div class="drawer-section">
            <h4><i data-lucide="indian-rupee" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Trip P&L</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem">
                <div>Revenue: <strong style="color:var(--success)">${formatINR(revenue)}</strong></div>
                <div>Service Cost: <strong>${formatINR(serviceCost)}</strong></div>
                <div>Other Expenses: <strong>${formatINR(extraExpenses)}</strong></div>
                <div>Profit: <strong style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatINR(profit)} (${margin}%)</strong></div>
            </div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
            <select id="bStatusChange" class="form-control" style="flex:1">
                ${['tentative','confirmed','on_trip','completed','cancelled'].map(s => `<option value="${s}" ${b.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
            </select>
            <button class="btn-primary" onclick="updateStatus('${b.id}')">Update Status</button>
        </div>
    `;
    openDrawer();
}

async function updateStatus(bookingId) {
    const status = document.getElementById('bStatusChange')?.value;
    const { error } = await window.supabase.from('bookings').update({ status }).eq('id', bookingId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    // ── WhatsApp Trip Updates (Enhancement #1) ────────
    const b = allBookings.find(x => x.id === bookingId);
    const phone = b?.clients?.phone;
    if (phone) {
        const msgs = {
            confirmed: `<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Booking ${b.booking_ref} is confirmed! We're preparing your ${escHtml(b.destination)} trip.`,
            on_trip: `<i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ Have an amazing trip to ${escHtml(b.destination)}! Safe travels. Ref: ${b.booking_ref}`,
            completed: `<i data-lucide="home" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Welcome back from ${escHtml(b.destination)}! Hope you had a great trip. Share your feedback anytime!`,
        };
        if (msgs[status]) sendWhatsAppUpdate(phone, msgs[status]);
    }

    showToast('Status updated');
    closeDrawer();
    await loadBookings();
}

async function deleteBooking(bookingId) {
    if (!confirm('Delete this booking?')) return;
    const { error } = await window.supabase.from('bookings').delete().eq('id', bookingId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Deleted');
    await loadBookings();
}

// ============================================================
// Enhancement #1 — WhatsApp Trip Updates
// ============================================================
const WHATSAPP_WORKER = ''; // Set to your deployed worker URL
async function sendWhatsAppUpdate(phone, message) {
    if (!WHATSAPP_WORKER) {
        // Fallback: open WhatsApp web directly
        const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '');
        const fullPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
        window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank');
        return;
    }
    try {
        await fetch(WHATSAPP_WORKER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: phone, message }),
        });
    } catch { /* silent fail — non-blocking */ }
}

// ============================================================
// Enhancement #2 — Real-Time Trip Status Timeline
// ============================================================
function renderTripTimeline(booking) {
    const stages = [
        { key: 'tentative', icon: '<i data-lucide="file-edit" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: 'Enquiry Received' },
        { key: 'confirmed', icon: '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: 'Booking Confirmed' },
        { key: 'on_trip',   icon: '<i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️', label: 'On Trip' },
        { key: 'completed', icon: '<i data-lucide="home" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>', label: 'Trip Completed' },
    ];
    const currentIdx = stages.findIndex(s => s.key === booking.status);
    const isCancelled = booking.status === 'cancelled';

    return `
        <div style="display:flex;align-items:center;gap:0;padding:12px 0;overflow-x:auto">
            ${stages.map((s, i) => {
                const done = i <= currentIdx && !isCancelled;
                const active = i === currentIdx && !isCancelled;
                return `
                    <div style="display:flex;flex-direction:column;align-items:center;min-width:80px;position:relative">
                        <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                            font-size:1rem;${done ? 'background:var(--primary);' : 'background:var(--bg-input);border:2px solid var(--border);'}
                            ${active ? 'box-shadow:0 0 0 3px rgba(59,130,246,0.3);' : ''}">
                            ${done ? s.icon : ''}
                        </div>
                        <div style="font-size:0.72rem;margin-top:4px;color:${done ? 'var(--text-primary)' : 'var(--text-muted)'};font-weight:${active ? '700' : '400'};text-align:center">${s.label}</div>
                    </div>
                    ${i < stages.length - 1 ? `<div style="flex:1;height:2px;background:${i < currentIdx && !isCancelled ? 'var(--primary)' : 'var(--border)'};min-width:20px;margin-top:-16px"></div>` : ''}
                `;
            }).join('')}
            ${isCancelled ? '<div style="margin-left:12px"><span class="badge badge-cancelled"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Cancelled</span></div>' : ''}
        </div>
    `;
}
