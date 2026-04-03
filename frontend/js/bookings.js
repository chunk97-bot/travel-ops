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
                <button class="btn-danger" style="padding:3px 8px;font-size:0.78rem;margin-left:4px" onclick="deleteBooking('${b.id}')">✕</button>
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
            <button class="btn-danger" style="padding:4px 8px" onclick="document.getElementById('svc-${serviceRows}').remove()">✕</button>
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
    await loadBookings();
}

async function openBookingDrawer(bookingId) {
    const b = allBookings.find(x => x.id === bookingId);
    if (!b) return;
    document.getElementById('drawerBookingRef').textContent = b.booking_ref;
    const body = document.getElementById('bDrawerBody');
    body.innerHTML = `
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
