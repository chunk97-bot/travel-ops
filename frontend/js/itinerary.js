// ============================================================
// itinerary.js — Full itinerary builder with pricing + PDF
// ============================================================

let days = [];
let currentItineraryId = null;
let vendorPricing = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadVendors();
    setupCalculator();
    setupDayBuilder();
    setupActions();

    // URL param: pre-fill lead
    const params = new URLSearchParams(window.location.search);
    if (params.get('lead')) await prefillFromLead(params.get('lead'));

    // Set default validUntil = 7 days from today
    const validUntil = document.getElementById('iValidUntil');
    if (validUntil) {
        const d = new Date(); d.setDate(d.getDate() + 7);
        validUntil.value = d.toISOString().split('T')[0];
    }

    // Start with 1 day
    addDay();
});

// ── Load vendors into dropdown ────────────────────────────
async function loadVendors() {
    const { data } = await window.supabase.from('vendors').select('id, name, region').eq('is_active', true).order('name');
    const sel = document.getElementById('iVendor');
    if (!sel || !data) return;
    sel.innerHTML = '<option value="">None</option>' + data.map(v =>
        `<option value="${v.id}">${escHtml(v.name)} (${escHtml(v.region)})</option>`
    ).join('');

    sel.addEventListener('change', async () => {
        if (!sel.value) { vendorPricing = []; return; }
        const { data: pricing } = await window.supabase
            .from('vendor_pricing')
            .select('*')
            .eq('vendor_id', sel.value);
        vendorPricing = pricing || [];
        autoFillFromVendor();
    });
}

// ── Auto-fill days from vendor pricing ───────────────────
function autoFillFromVendor() {
    const dest = document.getElementById('iDestination').value.trim().toLowerCase();
    const nights = parseInt(document.getElementById('iNights').value) || 7;
    const cat = document.getElementById('iHotelCategory').value;

    const match = vendorPricing.find(p =>
        p.destination?.toLowerCase().includes(dest) &&
        p.category === cat
    );

    if (match) {
        showToast(`Auto-filled pricing from vendor for ${match.destination}`);
    }
    recalculate();
}

// ── Cost calculation ──────────────────────────────────────
function setupCalculator() {
    ['iNights','iPaxAdults','iPaxChildren','iHotelCategory','iMeals','iMargin','iIncludeFlights','iIncludeVisa','iIncludeTransfers','iFlightCost'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', recalculate);
        document.getElementById(id)?.addEventListener('input', recalculate);
    });
    document.getElementById('recalcBtn')?.addEventListener('click', recalculate);
    document.getElementById('iIncludeFlights')?.addEventListener('change', (e) => {
        document.getElementById('iFlightCost')?.classList.toggle('hidden', !e.target.checked);
    });
}

function recalculate() {
    const nights = parseInt(document.getElementById('iNights')?.value) || 0;
    const adults = parseInt(document.getElementById('iPaxAdults')?.value) || 1;
    const children = parseInt(document.getElementById('iPaxChildren')?.value) || 0;
    const totalPax = adults + children;
    const cat = document.getElementById('iHotelCategory')?.value || 'mid';
    const meals = document.getElementById('iMeals')?.value || 'none';
    const includeFlights = document.getElementById('iIncludeFlights')?.checked || false;
    const includeVisa = document.getElementById('iIncludeVisa')?.checked || false;
    const includeTransfers = document.getElementById('iIncludeTransfers')?.checked || false;
    const flightCost = parseFloat(document.getElementById('iFlightCost')?.value) || 0;
    const margin = parseFloat(document.getElementById('iMargin')?.value) || 15;

    // Get pricing from matched vendor if available
    const dest = document.getElementById('iDestination')?.value.trim().toLowerCase();
    const match = vendorPricing.find(p =>
        p.destination?.toLowerCase().includes(dest) && p.category === cat
    );

    const hotelPerNight = match?.hotel_per_night || (cat === 'budget' ? 4000 : cat === 'mid' ? 8000 : 15000);
    const transferCost = includeTransfers ? (match?.transfer_cost || 2500) : 0;
    const sightseeingPerDay = match?.sightseeing_cost || 1500;
    const visaPerPax = includeVisa ? (match?.visa_cost || 7500) : 0;
    const mealCosts = { none: 0, cp: match?.meal_cp || 600, map: match?.meal_map || 1200, ap: match?.meal_ap || 2000 };
    const mealPerPaxPerDay = mealCosts[meals] || 0;

    // Per pax calculation
    const baseCostPerPax =
        (hotelPerNight * nights / totalPax) +
        (sightseeingPerDay * nights) +
        (mealPerPaxPerDay * nights) +
        visaPerPax +
        (includeFlights ? flightCost : 0) +
        (transferCost / totalPax);

    const marginAmount = baseCostPerPax * (margin / 100);
    const priceAfterMargin = baseCostPerPax + marginAmount;
    const gstAmount = priceAfterMargin * 0.05;
    const totalPerPax = priceAfterMargin + gstAmount;
    const grandTotal = totalPerPax * totalPax;

    document.getElementById('cbBase').textContent = formatINR(baseCostPerPax);
    document.getElementById('cbMargin').textContent = formatINR(marginAmount);
    document.getElementById('cbGst').textContent = formatINR(gstAmount);
    document.getElementById('cbPerPax').textContent = formatINR(totalPerPax);
    document.getElementById('cbTotal').textContent = formatINR(grandTotal);
}

// ── Day Builder ───────────────────────────────────────────
function setupDayBuilder() {
    document.getElementById('addDayBtn')?.addEventListener('click', addDay);
    document.getElementById('autoFillBtn')?.addEventListener('click', autoFillFromVendor);
}

function addDay() {
    const dayNum = days.length + 1;
    const day = { id: `day-${Date.now()}`, day_number: dayNum, title: `Day ${dayNum}`, hotel_name: '', hotel_location: '', transport: '', meals: '', activities: [], notes: '' };
    days.push(day);
    renderDays();
}

function removeDay(dayId) {
    days = days.filter(d => d.id !== dayId);
    days.forEach((d, i) => d.day_number = i + 1);
    renderDays();
}

function renderDays() {
    const container = document.getElementById('daysList');
    if (!container) return;
    container.innerHTML = days.map(day => `
        <div class="day-card" id="dc-${day.id}">
            <div class="day-card-header">
                <span class="day-number">Day ${day.day_number}</span>
                <input type="text" class="day-title-input" value="${escHtml(day.title)}"
                    onchange="updateDay('${day.id}','title',this.value)" placeholder="Day title...">
                <button class="day-remove" onclick="removeDay('${day.id}')" title="Remove day">✕</button>
            </div>
            <div class="day-card-body">
                <div class="form-group">
                    <label>Hotel</label>
                    <input type="text" value="${escHtml(day.hotel_name)}" placeholder="Hotel name..."
                        onchange="updateDay('${day.id}','hotel_name',this.value)">
                </div>
                <div class="form-group">
                    <label>Location</label>
                    <input type="text" value="${escHtml(day.hotel_location)}" placeholder="City / area..."
                        onchange="updateDay('${day.id}','hotel_location',this.value)">
                </div>
                <div class="form-group">
                    <label>Transport</label>
                    <input type="text" value="${escHtml(day.transport)}" placeholder="e.g. Private Transfer, Coach..."
                        onchange="updateDay('${day.id}','transport',this.value)">
                </div>
                <div class="form-group">
                    <label>Meals</label>
                    <input type="text" value="${escHtml(day.meals)}" placeholder="e.g. Breakfast + Dinner"
                        onchange="updateDay('${day.id}','meals',this.value)">
                </div>
                <div class="form-group full-width day-add-activity">
                    <label>Activities</label>
                    <div id="activities-${day.id}" style="margin-bottom:6px">
                        ${day.activities.map((a, ai) => `
                            <span class="activity-tag">${escHtml(a)}<button onclick="removeActivity('${day.id}',${ai})">✕</button></span>
                        `).join('')}
                    </div>
                    <div style="display:flex;gap:6px">
                        <input type="text" id="actInput-${day.id}" placeholder="Add activity..." style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);font-size:0.85rem"
                            onkeydown="if(event.key==='Enter'){event.preventDefault();addActivity('${day.id}')}">
                        <button class="btn-secondary" style="padding:5px 10px;font-size:0.82rem" onclick="addActivity('${day.id}')">Add</button>
                    </div>
                </div>
                <div class="form-group full-width">
                    <label>Notes</label>
                    <textarea rows="2" placeholder="Special notes..." onchange="updateDay('${day.id}','notes',this.value)">${escHtml(day.notes)}</textarea>
                </div>
            </div>
        </div>
    `).join('');
}

function updateDay(dayId, field, value) {
    const day = days.find(d => d.id === dayId);
    if (day) day[field] = value;
}

function addActivity(dayId) {
    const input = document.getElementById(`actInput-${dayId}`);
    if (!input || !input.value.trim()) return;
    const day = days.find(d => d.id === dayId);
    if (day) { day.activities.push(input.value.trim()); input.value = ''; renderDays(); }
}

function removeActivity(dayId, idx) {
    const day = days.find(d => d.id === dayId);
    if (day) { day.activities.splice(idx, 1); renderDays(); }
}

// ── Actions: Save, PDF, WhatsApp ─────────────────────────
function setupActions() {
    document.getElementById('saveItineraryBtn')?.addEventListener('click', saveItinerary);
    document.getElementById('previewPdfBtn')?.addEventListener('click', () => { buildPdfPreview(); openModal('pdfPreviewModal'); });
    document.getElementById('closePdfModal')?.addEventListener('click', () => closeModal('pdfPreviewModal'));
    document.getElementById('pdfModalOverlay')?.addEventListener('click', () => closeModal('pdfPreviewModal'));
    const pdfHandler = typeof downloadBrandedPdf === 'function' ? downloadBrandedPdf : downloadPdf;
    document.getElementById('generatePdfBtn')?.addEventListener('click', pdfHandler);
    document.getElementById('downloadPdfBtn')?.addEventListener('click', pdfHandler);
    document.getElementById('sendWhatsappBtn')?.addEventListener('click', sendWhatsapp);
    document.getElementById('recalcBtn')?.addEventListener('click', recalculate);
}

// ── Save Itinerary ────────────────────────────────────────
async function saveItinerary() {
    const userId = await getCurrentUserId();
    const adults = parseInt(document.getElementById('iPaxAdults')?.value) || 1;
    const children = parseInt(document.getElementById('iPaxChildren')?.value) || 0;
    const totalPax = adults + children;

    const base = parseFloat(document.getElementById('cbBase')?.textContent?.replace(/[^0-9.]/g,'')) || 0;
    const margin = parseFloat(document.getElementById('cbMargin')?.textContent?.replace(/[^0-9.]/g,'')) || 0;
    const gst = parseFloat(document.getElementById('cbGst')?.textContent?.replace(/[^0-9.]/g,'')) || 0;
    const total = parseFloat(document.getElementById('cbTotal')?.textContent?.replace(/[^0-9.]/g,'')) || 0;

    const payload = {
        title: document.getElementById('iTitle')?.value.trim() || 'Untitled Itinerary',
        destination: document.getElementById('iDestination')?.value.trim(),
        vendor_id: document.getElementById('iVendor')?.value || null,
        nights: parseInt(document.getElementById('iNights')?.value) || 0,
        pax_adults: adults,
        pax_children: children,
        hotel_category: document.getElementById('iHotelCategory')?.value,
        include_visa: document.getElementById('iIncludeVisa')?.checked || false,
        include_flights: document.getElementById('iIncludeFlights')?.checked || false,
        include_transfers: document.getElementById('iIncludeTransfers')?.checked || false,
        include_meals: document.getElementById('iMeals')?.value,
        flight_cost_per_pax: parseFloat(document.getElementById('iFlightCost')?.value) || 0,
        custom_margin_percent: parseFloat(document.getElementById('iMargin')?.value) || 15,
        base_cost: base * totalPax,
        margin_amount: margin * totalPax,
        gst_amount: gst * totalPax,
        total_price: total,
        valid_until: document.getElementById('iValidUntil')?.value || null,
        status: 'draft',
        created_by: userId,
    };

    let itinId = currentItineraryId;
    if (itinId) {
        await window.supabase.from('itineraries').update(payload).eq('id', itinId);
    } else {
        const { data, error } = await window.supabase.from('itineraries').insert(payload).select().single();
        if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
        itinId = data.id;
        currentItineraryId = itinId;
    }

    // Save days
    if (days.length) {
        await window.supabase.from('itinerary_days').delete().eq('itinerary_id', itinId);
        await window.supabase.from('itinerary_days').insert(
            days.map(d => ({
                itinerary_id: itinId,
                day_number: d.day_number,
                title: d.title,
                hotel_name: d.hotel_name,
                hotel_location: d.hotel_location,
                transport: d.transport,
                meals: d.meals,
                activities: d.activities,
                notes: d.notes,
            }))
        );
    }

    showToast('Itinerary saved!');
}

// ── PDF Generation ────────────────────────────────────────
function getItineraryData() {
    const adults = parseInt(document.getElementById('iPaxAdults')?.value) || 1;
    const children = parseInt(document.getElementById('iPaxChildren')?.value) || 0;
    return {
        title: document.getElementById('iTitle')?.value || 'Travel Itinerary',
        destination: document.getElementById('iDestination')?.value || '',
        nights: document.getElementById('iNights')?.value || 0,
        adults, children,
        hotel: document.getElementById('iHotelCategory')?.value,
        perPax: document.getElementById('cbPerPax')?.textContent || '—',
        total: document.getElementById('cbTotal')?.textContent || '—',
        validUntil: document.getElementById('iValidUntil')?.value || '',
        meals: document.getElementById('iMeals')?.value,
        includeFlights: document.getElementById('iIncludeFlights')?.checked,
        includeVisa: document.getElementById('iIncludeVisa')?.checked,
        includeTransfers: document.getElementById('iIncludeTransfers')?.checked,
    };
}

function buildPdfPreview() {
    const d = getItineraryData();
    const inclusions = [
        d.includeFlights ? '✔ International Flights' : null,
        '✔ ' + d.nights + ' Nights Accommodation (' + d.hotel + ')',
        d.includeTransfers ? '✔ Airport & Sightseeing Transfers' : null,
        d.meals !== 'none' ? `✔ Meals: ${d.meals.toUpperCase()}` : null,
        d.includeVisa ? '✔ Visa Assistance' : null,
    ].filter(Boolean);

    document.getElementById('pdfPreviewContent').innerHTML = `
        <div class="pdf-header">
            <h1>✈ ${escHtml(d.title)}</h1>
            <p>${escHtml(d.destination)} · ${d.nights} Nights · ${d.adults} Adults${d.children ? ', ' + d.children + ' Children' : ''}</p>
        </div>

        <h2>Package Inclusions</h2>
        <ul class="pdf-inclusions">${inclusions.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>

        <h2>Day-by-Day Program</h2>
        ${days.map(day => `
            <div class="pdf-day">
                <div class="pdf-day-title">Day ${day.day_number}: ${escHtml(day.title)}</div>
                ${day.hotel_name ? `<p>🏨 <strong>Hotel:</strong> ${escHtml(day.hotel_name)}${day.hotel_location ? ', ' + escHtml(day.hotel_location) : ''}</p>` : ''}
                ${day.transport ? `<p>🚌 <strong>Transport:</strong> ${escHtml(day.transport)}</p>` : ''}
                ${day.meals ? `<p>🍽 <strong>Meals:</strong> ${escHtml(day.meals)}</p>` : ''}
                ${day.activities.length ? `<p>📍 <strong>Activities:</strong> ${day.activities.map(a => escHtml(a)).join(' · ')}</p>` : ''}
                ${day.notes ? `<p style="color:#64748b;font-size:0.9rem;font-style:italic">${escHtml(day.notes)}</p>` : ''}
            </div>
        `).join('')}

        <div class="pdf-pricing">
            <strong>Package Pricing</strong>
            <p>Per Person: <strong>${escHtml(d.perPax)}</strong></p>
            <p class="pdf-total">Total (${d.adults + d.children} Pax): ${escHtml(d.total)}</p>
            <p style="font-size:0.8rem;color:#64748b;margin-top:6px">Price valid until ${d.validUntil ? formatDate(d.validUntil) : '7 days'}. Inclusive of GST.</p>
        </div>

        <div class="pdf-footer">
            <p>Terms: 50% advance to confirm booking. Balance due 7 days before departure.</p>
            <p>Cancellation policy applies. Prices subject to change due to availability and forex rates.</p>
        </div>
    `;
}

function downloadPdf() {
    buildPdfPreview();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const content = document.getElementById('pdfPreviewContent');
    doc.html(content, {
        callback: (d) => d.save(`itinerary-${Date.now()}.pdf`),
        x: 10, y: 10,
        width: 190,
        windowWidth: 700,
    });
}

// ── WhatsApp Send ─────────────────────────────────────────
function sendWhatsapp() {
    const d = getItineraryData();
    const msg = `✈ *${d.title}*\n\n📍 ${d.destination} · ${d.nights}N · ${d.adults + d.children} Pax\n\n💰 Total Package: *${d.total}* (incl. GST)\n\nQuote valid until ${d.validUntil ? formatDate(d.validUntil) : '7 days'}.\n\nReply to confirm or ask for customization.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

// ── Pre-fill from lead ────────────────────────────────────
async function prefillFromLead(leadId) {
    const { data } = await window.supabase.from('leads').select('*').eq('id', leadId).single();
    if (!data) return;
    document.getElementById('iDestination').value = data.destination || '';
    document.getElementById('iPaxAdults').value = data.pax_adults || 2;
    document.getElementById('iPaxChildren').value = data.pax_children || 0;
    document.getElementById('iTitle').value = `${data.destination || 'Trip'} - ${data.name}`;
    if (data.trip_type === 'luxury') document.getElementById('iHotelCategory').value = 'luxury';
    recalculate();
}
