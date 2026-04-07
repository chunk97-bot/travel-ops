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

    // URL param: load existing itinerary
    if (params.get('id')) {
        await loadItinerary(params.get('id'));
    }

    // Set default validUntil = 7 days from today
    const validUntil = document.getElementById('iValidUntil');
    if (validUntil && !validUntil.value) {
        const d = new Date(); d.setDate(d.getDate() + 7);
        validUntil.value = d.toISOString().split('T')[0];
    }

    // Start with 1 day if none loaded
    if (!days.length) addDay();
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
        document.getElementById('flightDetailsCard')?.style.setProperty('display', e.target.checked ? 'block' : 'none');
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
    const day = {
        id: `day-${Date.now()}`, day_number: dayNum, title: `Day ${dayNum}`,
        // Hotel
        hotel_name: '', hotel_location: '',
        hotel_star_rating: '', hotel_room_type: '', hotel_room_size: '',
        hotel_checkin: '', hotel_checkout: '',
        hotel_rating_score: '', hotel_rating_count: '',
        hotel_amenities: [], hotel_includes: [],
        // Transport
        transport: '',
        transfer_vehicle: '', transfer_vehicle_name: '',
        transfer_capacity: '', transfer_ac: true, transfer_facilities: [],
        // Meals
        meals: '', meal_details: '',
        // Activities (array of objects)
        activities: [],
        notes: '',
    };
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
                <button class="day-remove" onclick="removeDay('${day.id}')" title="Remove day">&times;</button>
            </div>
            <div class="day-card-body">

                <!-- Hotel Section -->
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

                <!-- Hotel Detail Row -->
                <div class="form-group-row full-width hotel-detail-row">
                    <div class="mini-field">
                        <label>Stars</label>
                        <select onchange="updateDay('${day.id}','hotel_star_rating',this.value)">
                            <option value="">—</option>
                            ${[2,3,4,5].map(s => `<option value="${s}" ${day.hotel_star_rating==s?'selected':''}>${s}★</option>`).join('')}
                        </select>
                    </div>
                    <div class="mini-field" style="flex:2">
                        <label>Room Type</label>
                        <input type="text" value="${escHtml(day.hotel_room_type)}" placeholder="e.g. Deluxe Double"
                            onchange="updateDay('${day.id}','hotel_room_type',this.value)">
                    </div>
                    <div class="mini-field">
                        <label>Size</label>
                        <input type="text" value="${escHtml(day.hotel_room_size)}" placeholder="322 sq.ft"
                            onchange="updateDay('${day.id}','hotel_room_size',this.value)">
                    </div>
                    <div class="mini-field">
                        <label>Check-in</label>
                        <input type="time" value="${escHtml(day.hotel_checkin)}"
                            onchange="updateDay('${day.id}','hotel_checkin',this.value)">
                    </div>
                    <div class="mini-field">
                        <label>Check-out</label>
                        <input type="time" value="${escHtml(day.hotel_checkout)}"
                            onchange="updateDay('${day.id}','hotel_checkout',this.value)">
                    </div>
                    <div class="mini-field">
                        <label>Rating</label>
                        <input type="number" step="0.1" min="0" max="5" value="${day.hotel_rating_score||''}" placeholder="4.2"
                            onchange="updateDay('${day.id}','hotel_rating_score',this.value)" style="width:56px">
                    </div>
                    <div class="mini-field">
                        <label>Reviews</label>
                        <input type="number" min="0" value="${day.hotel_rating_count||''}" placeholder="1234"
                            onchange="updateDay('${day.id}','hotel_rating_count',this.value)" style="width:68px">
                    </div>
                </div>

                <!-- Hotel Amenities Tags -->
                <div class="form-group full-width">
                    <label>Hotel Amenities</label>
                    <div class="tags-container" id="amenities-${day.id}">
                        ${(day.hotel_amenities||[]).map((a, i) => `<span class="activity-tag">${escHtml(a)}<button onclick="removeTag('${day.id}','hotel_amenities',${i})">&times;</button></span>`).join('')}
                    </div>
                    <div style="display:flex;gap:6px;margin-top:4px">
                        <input type="text" id="amenityInput-${day.id}" placeholder="Pool, Spa, Gym..." style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;padding:5px 8px;color:var(--text-primary);font-size:0.82rem"
                            onkeydown="if(event.key==='Enter'){event.preventDefault();addTag('${day.id}','hotel_amenities','amenityInput-${day.id}')}">
                        <button class="btn-secondary" style="padding:4px 8px;font-size:0.78rem" onclick="addTag('${day.id}','hotel_amenities','amenityInput-${day.id}')">+</button>
                    </div>
                </div>

                <!-- Transfer Section -->
                <div class="form-group">
                    <label>Transport</label>
                    <input type="text" value="${escHtml(day.transport)}" placeholder="e.g. Private Transfer, Coach..."
                        onchange="updateDay('${day.id}','transport',this.value)">
                </div>

                <!-- Transfer Detail Row -->
                <div class="form-group-row full-width transfer-detail-row">
                    <div class="mini-field">
                        <label>Vehicle Type</label>
                        <select onchange="updateDay('${day.id}','transfer_vehicle',this.value)">
                            <option value="">—</option>
                            ${['Sedan','MUV','SUV','Tempo','Coach','Speedboat','Ferry'].map(v => `<option value="${v}" ${day.transfer_vehicle===v?'selected':''}>${v}</option>`).join('')}
                        </select>
                    </div>
                    <div class="mini-field" style="flex:2">
                        <label>Vehicle Name</label>
                        <input type="text" value="${escHtml(day.transfer_vehicle_name)}" placeholder="Swift, Etios or Similar"
                            onchange="updateDay('${day.id}','transfer_vehicle_name',this.value)">
                    </div>
                    <div class="mini-field">
                        <label>Capacity</label>
                        <input type="number" value="${day.transfer_capacity||''}" placeholder="4" min="1"
                            onchange="updateDay('${day.id}','transfer_capacity',this.value)">
                    </div>
                    <div class="mini-field">
                        <label>AC</label>
                        <select onchange="updateDay('${day.id}','transfer_ac',this.value==='true')">
                            <option value="true" ${day.transfer_ac!==false?'selected':''}>AC</option>
                            <option value="false" ${day.transfer_ac===false?'selected':''}>Non-AC</option>
                        </select>
                    </div>
                </div>

                <!-- Meals -->
                <div class="form-group">
                    <label>Meals</label>
                    <input type="text" value="${escHtml(day.meals)}" placeholder="e.g. Breakfast + Dinner"
                        onchange="updateDay('${day.id}','meals',this.value)">
                </div>
                <div class="form-group">
                    <label>Meal Details</label>
                    <input type="text" value="${escHtml(day.meal_details)}" placeholder="e.g. Breakfast at Sea Hills Hotel, Port Blair"
                        onchange="updateDay('${day.id}','meal_details',this.value)">
                </div>

                <!-- Activities Section — Rich Cards -->
                <div class="form-group full-width day-activities-section">
                    <label>Activities <span class="activity-count">(${day.activities.length})</span></label>
                    <div id="activities-${day.id}" class="activities-list">
                        ${day.activities.map((a, ai) => renderActivityCard(day.id, a, ai)).join('')}
                    </div>
                    <button class="btn-add-activity" onclick="addActivity('${day.id}')">+ Add Activity</button>
                </div>

                <!-- Notes -->
                <div class="form-group full-width">
                    <label>Notes</label>
                    <textarea rows="2" placeholder="Special notes..." onchange="updateDay('${day.id}','notes',this.value)">${escHtml(day.notes)}</textarea>
                </div>
            </div>
        </div>
    `).join('');
}

function renderActivityCard(dayId, activity, index) {
    return `
        <div class="activity-card">
            <div class="activity-card-header">
                <span class="activity-index">#${index + 1}</span>
                <input type="text" class="activity-name-input" value="${escHtml(activity.name || '')}" placeholder="Activity name..."
                    onchange="updateActivity('${dayId}',${index},'name',this.value)">
                <select class="activity-slot-select" onchange="updateActivity('${dayId}',${index},'time_slot',this.value)">
                    <option value="anytime" ${(activity.time_slot||'anytime')==='anytime'?'selected':''}>Anytime</option>
                    <option value="morning" ${activity.time_slot==='morning'?'selected':''}>Morning</option>
                    <option value="afternoon" ${activity.time_slot==='afternoon'?'selected':''}>Afternoon</option>
                    <option value="evening" ${activity.time_slot==='evening'?'selected':''}>Evening</option>
                    <option value="full_day" ${activity.time_slot==='full_day'?'selected':''}>Full Day</option>
                </select>
                <button class="btn-remove-activity" onclick="removeActivity('${dayId}',${index})" title="Remove">&times;</button>
            </div>
            <div class="activity-card-body">
                <textarea class="activity-desc" rows="2" placeholder="Describe what the guest will experience..."
                    onchange="updateActivity('${dayId}',${index},'description',this.value)">${escHtml(activity.description || '')}</textarea>
                <div class="activity-inline-fields">
                    <div class="mini-field">
                        <label>Duration (hrs)</label>
                        <input type="number" step="0.5" min="0.5" max="24" value="${activity.duration_hours||''}" placeholder="2"
                            onchange="updateActivity('${dayId}',${index},'duration_hours',parseFloat(this.value)||null)">
                    </div>
                    <div class="mini-field" style="flex:2">
                        <label>Location</label>
                        <input type="text" value="${escHtml(activity.location || '')}" placeholder="e.g. Port Blair"
                            onchange="updateActivity('${dayId}',${index},'location',this.value)">
                    </div>
                </div>
                <div class="activity-tags-row">
                    <div class="activity-tag-group">
                        <label>Inclusions</label>
                        <div class="tags-container">
                            ${(activity.inclusions||[]).map((t,ti) => `<span class="activity-tag incl-tag">${escHtml(t)}<button onclick="removeActivityTag('${dayId}',${index},'inclusions',${ti})">&times;</button></span>`).join('')}
                        </div>
                        <div style="display:flex;gap:4px;margin-top:3px">
                            <input type="text" id="inclInput-${dayId}-${index}" placeholder="e.g. Entry ticket" style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;padding:4px 7px;color:var(--text-primary);font-size:0.78rem"
                                onkeydown="if(event.key==='Enter'){event.preventDefault();addActivityTag('${dayId}',${index},'inclusions','inclInput-${dayId}-${index}')}">
                            <button class="btn-secondary" style="padding:3px 6px;font-size:0.72rem" onclick="addActivityTag('${dayId}',${index},'inclusions','inclInput-${dayId}-${index}')">+</button>
                        </div>
                    </div>
                    <div class="activity-tag-group">
                        <label>Exclusions</label>
                        <div class="tags-container">
                            ${(activity.exclusions||[]).map((t,ti) => `<span class="activity-tag excl-tag">${escHtml(t)}<button onclick="removeActivityTag('${dayId}',${index},'exclusions',${ti})">&times;</button></span>`).join('')}
                        </div>
                        <div style="display:flex;gap:4px;margin-top:3px">
                            <input type="text" id="exclInput-${dayId}-${index}" placeholder="e.g. Guide charges" style="flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:5px;padding:4px 7px;color:var(--text-primary);font-size:0.78rem"
                                onkeydown="if(event.key==='Enter'){event.preventDefault();addActivityTag('${dayId}',${index},'exclusions','exclInput-${dayId}-${index}')}">
                            <button class="btn-secondary" style="padding:3px 6px;font-size:0.72rem" onclick="addActivityTag('${dayId}',${index},'exclusions','exclInput-${dayId}-${index}')">+</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateDay(dayId, field, value) {
    const day = days.find(d => d.id === dayId);
    if (day) day[field] = value;
}

function addActivity(dayId) {
    const day = days.find(d => d.id === dayId);
    if (!day) return;
    day.activities.push({
        name: '', description: '', duration_hours: null,
        time_slot: 'anytime', location: '',
        inclusions: [], exclusions: [],
    });
    renderDays();
    // Focus the new activity name input
    setTimeout(() => {
        const cards = document.querySelectorAll(`#activities-${dayId} .activity-card`);
        const last = cards[cards.length - 1];
        if (last) last.querySelector('.activity-name-input')?.focus();
    }, 50);
}

function removeActivity(dayId, idx) {
    const day = days.find(d => d.id === dayId);
    if (day) { day.activities.splice(idx, 1); renderDays(); }
}

function updateActivity(dayId, idx, field, value) {
    const day = days.find(d => d.id === dayId);
    if (day && day.activities[idx]) day.activities[idx][field] = value;
}

// ── Tag helpers (hotel amenities, activity inclusions/exclusions) ──
function addTag(dayId, field, inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) return;
    const day = days.find(d => d.id === dayId);
    if (!day) return;
    if (!day[field]) day[field] = [];
    day[field].push(input.value.trim());
    input.value = '';
    renderDays();
}

function removeTag(dayId, field, idx) {
    const day = days.find(d => d.id === dayId);
    if (day && day[field]) { day[field].splice(idx, 1); renderDays(); }
}

function addActivityTag(dayId, actIdx, field, inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) return;
    const day = days.find(d => d.id === dayId);
    if (!day || !day.activities[actIdx]) return;
    if (!day.activities[actIdx][field]) day.activities[actIdx][field] = [];
    day.activities[actIdx][field].push(input.value.trim());
    input.value = '';
    renderDays();
}

function removeActivityTag(dayId, actIdx, field, tagIdx) {
    const day = days.find(d => d.id === dayId);
    if (day && day.activities[actIdx] && day.activities[actIdx][field]) {
        day.activities[actIdx][field].splice(tagIdx, 1);
        renderDays();
    }
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

    const d = getItineraryData();
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
        // Flight details
        flight_outbound_number: d.flightOutbound.number || null,
        flight_outbound_from: d.flightOutbound.from || null,
        flight_outbound_to: d.flightOutbound.to || null,
        flight_outbound_depart: d.flightOutbound.depart || null,
        flight_outbound_arrive: d.flightOutbound.arrive || null,
        flight_outbound_airline: d.flightOutbound.airline || null,
        flight_outbound_baggage: d.flightOutbound.baggage || null,
        flight_outbound_layover: d.flightOutbound.layover || null,
        flight_return_number: d.flightReturn.number || null,
        flight_return_from: d.flightReturn.from || null,
        flight_return_to: d.flightReturn.to || null,
        flight_return_depart: d.flightReturn.depart || null,
        flight_return_arrive: d.flightReturn.arrive || null,
        flight_return_airline: d.flightReturn.airline || null,
        flight_return_baggage: d.flightReturn.baggage || null,
        flight_return_layover: d.flightReturn.layover || null,
        // Insurance
        insurance_provider: d.insuranceProvider || null,
        insurance_cover_amount: parseFloat(d.insuranceCover) || null,
        insurance_benefits: d.insuranceBenefits ? (() => { try { return JSON.parse(d.insuranceBenefits); } catch { return null; } })() : null,
        // Cancellation
        cancellation_policy: d.cancellationPolicy,
        date_change_allowed: d.dateChangeAllowed,
        // Highlights
        highlight_flights: d.highlights.flights,
        highlight_hotels: d.highlights.hotels,
        highlight_activities: d.highlights.activities,
        highlight_transfers: d.highlights.transfers,
        // Cover image
        cover_image_url: d.coverImage || null,
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

    // Save days + activities
    if (days.length) {
        // Delete old days (cascades to itinerary_activities via day_id FK)
        await window.supabase.from('itinerary_days').delete().eq('itinerary_id', itinId);
        await window.supabase.from('itinerary_activities').delete().eq('itinerary_id', itinId);

        const dayPayloads = days.map(d => ({
            itinerary_id: itinId,
            day_number: d.day_number,
            title: d.title,
            hotel_name: d.hotel_name,
            hotel_location: d.hotel_location,
            hotel_star_rating: parseInt(d.hotel_star_rating) || null,
            hotel_room_type: d.hotel_room_type || null,
            hotel_room_size: d.hotel_room_size || null,
            hotel_checkin: d.hotel_checkin || null,
            hotel_checkout: d.hotel_checkout || null,
            hotel_amenities: d.hotel_amenities?.length ? d.hotel_amenities : null,
            hotel_includes: d.hotel_includes?.length ? d.hotel_includes : null,
            hotel_rating_score: parseFloat(d.hotel_rating_score) || null,
            hotel_rating_count: parseInt(d.hotel_rating_count) || null,
            transport: d.transport,
            transfer_vehicle: d.transfer_vehicle || null,
            transfer_vehicle_name: d.transfer_vehicle_name || null,
            transfer_capacity: parseInt(d.transfer_capacity) || null,
            transfer_ac: d.transfer_ac ?? true,
            transfer_facilities: d.transfer_facilities?.length ? d.transfer_facilities : null,
            meals: d.meals,
            meal_details: d.meal_details || null,
            // Store activity names as TEXT[] for backward compat
            activities: d.activities.map(a => a.name).filter(Boolean),
            notes: d.notes,
        }));

        const { data: savedDays } = await window.supabase.from('itinerary_days').insert(dayPayloads).select('id, day_number');

        // Save rich activities to itinerary_activities table
        const activityPayloads = [];
        days.forEach(d => {
            const savedDay = savedDays?.find(sd => sd.day_number === d.day_number);
            d.activities.forEach((a, i) => {
                if (!a.name) return;
                activityPayloads.push({
                    itinerary_id: itinId,
                    day_id: savedDay?.id || null,
                    day_number: d.day_number,
                    sort_order: i,
                    name: a.name,
                    description: a.description || null,
                    duration_hours: a.duration_hours || null,
                    time_slot: a.time_slot || 'anytime',
                    location: a.location || null,
                    inclusions: a.inclusions?.length ? a.inclusions : null,
                    exclusions: a.exclusions?.length ? a.exclusions : null,
                });
            });
        });
        if (activityPayloads.length) {
            await window.supabase.from('itinerary_activities').insert(activityPayloads);
        }
    }

    showToast('Itinerary saved!');
}

// ── PDF Generation ────────────────────────────────────────
function getHighlights() {
    const includeFlights = document.getElementById('iIncludeFlights')?.checked;
    const hotels = new Set(days.map(d => d.hotel_name).filter(Boolean)).size;
    const activities = days.reduce((sum, d) => sum + (d.activities?.length || 0), 0);
    const transfers = days.filter(d => d.transport || d.transfer_vehicle).length;
    return {
        flights: includeFlights ? 2 : 0,  // outbound + return
        hotels,
        activities,
        transfers,
    };
}

function getItineraryData() {
    const adults = parseInt(document.getElementById('iPaxAdults')?.value) || 1;
    const children = parseInt(document.getElementById('iPaxChildren')?.value) || 0;
    const highlights = getHighlights();
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
        // Flight details
        flightOutbound: {
            number: document.getElementById('iFlightOutNum')?.value || '',
            airline: document.getElementById('iFlightOutAirline')?.value || '',
            from: document.getElementById('iFlightOutFrom')?.value || '',
            to: document.getElementById('iFlightOutTo')?.value || '',
            depart: document.getElementById('iFlightOutDepart')?.value || '',
            arrive: document.getElementById('iFlightOutArrive')?.value || '',
            baggage: document.getElementById('iFlightOutBaggage')?.value || '',
            layover: document.getElementById('iFlightOutLayover')?.value || '',
        },
        flightReturn: {
            number: document.getElementById('iFlightRetNum')?.value || '',
            airline: document.getElementById('iFlightRetAirline')?.value || '',
            from: document.getElementById('iFlightRetFrom')?.value || '',
            to: document.getElementById('iFlightRetTo')?.value || '',
            depart: document.getElementById('iFlightRetDepart')?.value || '',
            arrive: document.getElementById('iFlightRetArrive')?.value || '',
            baggage: document.getElementById('iFlightRetBaggage')?.value || '',
            layover: document.getElementById('iFlightRetLayover')?.value || '',
        },
        // Insurance
        insuranceProvider: document.getElementById('iInsuranceProvider')?.value || '',
        insuranceCover: document.getElementById('iInsuranceCover')?.value || '',
        insuranceBenefits: document.getElementById('iInsuranceBenefits')?.value || '',
        // Cancellation
        cancellationPolicy: document.getElementById('iCancellationPolicy')?.value || 'standard_domestic',
        dateChangeAllowed: document.getElementById('iDateChangeAllowed')?.checked ?? true,
        // Highlights
        highlights,
        // Cover image
        coverImage: document.getElementById('iCoverImage')?.value || '',
    };
}

function buildPdfPreview() {
    const d = getItineraryData();
    const h = d.highlights;

    // Highlights summary bar
    const highlightParts = [];
    if (h.flights) highlightParts.push(`${h.flights} Flights`);
    if (h.hotels) highlightParts.push(`${h.hotels} Hotels`);
    if (h.activities) highlightParts.push(`${h.activities} Activities`);
    if (h.transfers) highlightParts.push(`${h.transfers} Transfers`);

    const inclusions = [
        d.includeFlights ? '✓ International Flights' : null,
        `✓ ${d.nights} Nights Accommodation (${d.hotel || 'Standard'})`,
        d.includeTransfers ? '✓ Airport & Sightseeing Transfers' : null,
        d.meals !== 'none' ? `✓ Meals: ${(d.meals || '').toUpperCase()}` : null,
        d.includeVisa ? '✓ Visa Assistance' : null,
        d.insuranceProvider ? `✓ Travel Insurance — ${escHtml(d.insuranceProvider)}` : null,
    ].filter(Boolean);

    // Flight section
    const flightHtml = d.includeFlights && d.flightOutbound.number ? `
        <h2>Flight Details</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
            <div style="background:#f8fafc;padding:10px;border-radius:6px;border-left:3px solid #3b82f6">
                <strong>Outbound</strong><br>
                <span style="font-size:0.9rem">${escHtml(d.flightOutbound.airline)} ${escHtml(d.flightOutbound.number)}</span><br>
                <span style="font-size:0.85rem;color:#64748b">${escHtml(d.flightOutbound.from)} → ${escHtml(d.flightOutbound.to)}</span><br>
                ${d.flightOutbound.depart ? `<span style="font-size:0.82rem">${new Date(d.flightOutbound.depart).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'})}</span>` : ''}
                ${d.flightOutbound.baggage ? `<br><span style="font-size:0.78rem;color:#64748b">🧳 ${escHtml(d.flightOutbound.baggage)}</span>` : ''}
                ${d.flightOutbound.layover ? `<br><span style="font-size:0.78rem;color:#f59e0b">⏱ ${escHtml(d.flightOutbound.layover)}</span>` : ''}
            </div>
            ${d.flightReturn.number ? `
            <div style="background:#f8fafc;padding:10px;border-radius:6px;border-left:3px solid #3b82f6">
                <strong>Return</strong><br>
                <span style="font-size:0.9rem">${escHtml(d.flightReturn.airline)} ${escHtml(d.flightReturn.number)}</span><br>
                <span style="font-size:0.85rem;color:#64748b">${escHtml(d.flightReturn.from)} → ${escHtml(d.flightReturn.to)}</span><br>
                ${d.flightReturn.depart ? `<span style="font-size:0.82rem">${new Date(d.flightReturn.depart).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'})}</span>` : ''}
                ${d.flightReturn.baggage ? `<br><span style="font-size:0.78rem;color:#64748b">🧳 ${escHtml(d.flightReturn.baggage)}</span>` : ''}
                ${d.flightReturn.layover ? `<br><span style="font-size:0.78rem;color:#f59e0b">⏱ ${escHtml(d.flightReturn.layover)}</span>` : ''}
            </div>` : ''}
        </div>
    ` : '';

    // Cancellation policy labels
    const policyLabels = {
        non_refundable: 'Non-Refundable',
        standard_domestic: 'Standard Domestic',
        international_premium: 'International Premium',
        flexible: 'Flexible',
    };

    document.getElementById('pdfPreviewContent').innerHTML = `
        ${d.coverImage ? `<div style="text-align:center;margin-bottom:16px"><img src="${escHtml(d.coverImage)}" alt="${escHtml(d.destination)}" style="max-width:100%;max-height:300px;border-radius:10px;object-fit:cover" onerror="this.style.display='none'"></div>` : ''}
        <div class="pdf-header">
            <h1>✈ ${escHtml(d.title)}</h1>
            <p>${escHtml(d.destination)} · ${d.nights} Nights · ${d.adults} Adults${d.children ? ', ' + d.children + ' Children' : ''}</p>
            ${highlightParts.length ? `<p style="margin-top:6px;font-size:0.85rem;color:#3b82f6;font-weight:600">${highlightParts.join(' · ')}</p>` : ''}
        </div>

        <h2>Package Inclusions</h2>
        <ul class="pdf-inclusions">${inclusions.map(i => `<li>${i}</li>`).join('')}</ul>

        ${flightHtml}

        <h2>Day-by-Day Program</h2>
        ${days.map(day => `
            <div class="pdf-day">
                <div class="pdf-day-title">Day ${day.day_number}: ${escHtml(day.title)}</div>
                ${day.hotel_name ? `
                    <p><strong>🏨 Hotel:</strong> ${escHtml(day.hotel_name)}${day.hotel_location ? ', ' + escHtml(day.hotel_location) : ''}
                    ${day.hotel_star_rating ? ` · ${'★'.repeat(parseInt(day.hotel_star_rating))}` : ''}
                    ${day.hotel_room_type ? ` · ${escHtml(day.hotel_room_type)}` : ''}
                    ${day.hotel_room_size ? ` (${escHtml(day.hotel_room_size)})` : ''}
                    ${day.hotel_rating_score ? ` · <span style="color:#f59e0b;font-weight:600">${day.hotel_rating_score}/5</span>` : ''}
                    ${day.hotel_rating_count ? ` <span style="font-size:0.78rem;color:#94a3b8">(${Number(day.hotel_rating_count).toLocaleString()} reviews)</span>` : ''}</p>
                    ${(day.hotel_amenities||[]).length ? `<p style="font-size:0.82rem;color:#64748b">Amenities: ${day.hotel_amenities.map(a => escHtml(a)).join(', ')}</p>` : ''}
                ` : ''}
                ${day.transport ? `
                    <p><strong>🚗 Transport:</strong> ${escHtml(day.transport)}
                    ${day.transfer_vehicle ? ` — ${escHtml(day.transfer_vehicle)}` : ''}
                    ${day.transfer_vehicle_name ? ` (${escHtml(day.transfer_vehicle_name)})` : ''}
                    ${day.transfer_capacity ? `, ${day.transfer_capacity} pax` : ''}
                    ${day.transfer_ac !== false ? ', AC' : ', Non-AC'}</p>
                ` : ''}
                ${day.meals ? `<p><strong>🍽 Meals:</strong> ${escHtml(day.meals)}${day.meal_details ? ` — ${escHtml(day.meal_details)}` : ''}</p>` : ''}
                ${day.activities.length ? `
                    <div style="margin-top:6px">
                        <strong>📍 Activities:</strong>
                        ${day.activities.map(a => `
                            <div style="margin:6px 0 6px 12px;padding:6px 8px;background:#f0f9ff;border-radius:4px;border-left:2px solid #60a5fa">
                                <strong>${escHtml(a.name || '')}</strong>
                                ${a.time_slot && a.time_slot !== 'anytime' ? `<span style="font-size:0.78rem;background:#dbeafe;padding:1px 6px;border-radius:8px;margin-left:6px">${a.time_slot}</span>` : ''}
                                ${a.duration_hours ? `<span style="font-size:0.78rem;color:#64748b;margin-left:6px">${a.duration_hours}h</span>` : ''}
                                ${a.description ? `<p style="margin:3px 0 0;font-size:0.85rem;color:#475569">${escHtml(a.description)}</p>` : ''}
                                ${(a.inclusions||[]).length ? `<p style="font-size:0.78rem;color:#15803d;margin:2px 0 0">✓ ${a.inclusions.map(t => escHtml(t)).join(', ')}</p>` : ''}
                                ${(a.exclusions||[]).length ? `<p style="font-size:0.78rem;color:#b91c1c;margin:2px 0 0">✗ ${a.exclusions.map(t => escHtml(t)).join(', ')}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${day.notes ? `<p style="color:#64748b;font-size:0.85rem;font-style:italic;margin-top:4px">${escHtml(day.notes)}</p>` : ''}
            </div>
        `).join('')}

        ${d.insuranceProvider ? `
        <h2>Travel Insurance</h2>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:10px;font-size:0.88rem">
            <strong>${escHtml(d.insuranceProvider)}</strong>${d.insuranceCover ? ` — Cover: ₹${Number(d.insuranceCover).toLocaleString('en-IN')}` : ''}
            ${d.insuranceBenefits ? (() => {
                try {
                    const b = JSON.parse(d.insuranceBenefits);
                    return '<ul style="margin:4px 0 0;padding-left:16px;font-size:0.82rem">' +
                        Object.entries(b).map(([k,v]) => `<li>${k.replace(/_/g,' ')}: ₹${Number(v).toLocaleString('en-IN')}</li>`).join('') + '</ul>';
                } catch { return ''; }
            })() : ''}
        </div>
        ` : ''}

        <h2>Cancellation & Date Change</h2>
        <p style="font-size:0.88rem">Policy: <strong>${policyLabels[d.cancellationPolicy] || d.cancellationPolicy}</strong></p>
        <p style="font-size:0.88rem">Date Change: ${d.dateChangeAllowed ? '✓ Allowed (subject to availability)' : '✗ Not Allowed'}</p>

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
    const msg = `<i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> *${d.title}*\n\n<i data-lucide="map-pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${d.destination} · ${d.nights}N · ${d.adults + d.children} Pax\n\n<i data-lucide="indian-rupee" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Total Package: *${d.total}* (incl. GST)\n\nQuote valid until ${d.validUntil ? formatDate(d.validUntil) : '7 days'}.\n\nReply to confirm or ask for customization.`;
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

// ── Load existing itinerary ───────────────────────────────
async function loadItinerary(itinId) {
    const { data: itin, error } = await window.supabase
        .from('itineraries')
        .select('*')
        .eq('id', itinId)
        .single();
    if (error || !itin) { showToast('Itinerary not found', 'error'); return; }
    currentItineraryId = itinId;

    // Populate config fields
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

    setVal('iTitle', itin.title);
    setVal('iDestination', itin.destination);
    setVal('iVendor', itin.vendor_id);
    setVal('iNights', itin.nights);
    setVal('iPaxAdults', itin.pax_adults);
    setVal('iPaxChildren', itin.pax_children);
    setVal('iHotelCategory', itin.hotel_category);
    setChk('iIncludeFlights', itin.include_flights);
    setChk('iIncludeVisa', itin.include_visa);
    setChk('iIncludeTransfers', itin.include_transfers);
    setVal('iMeals', itin.include_meals);
    setVal('iFlightCost', itin.flight_cost_per_pax);
    setVal('iMargin', itin.custom_margin_percent);
    setVal('iValidUntil', itin.valid_until);

    // Show flight cost input if flights are included
    if (itin.include_flights) {
        document.getElementById('iFlightCost')?.classList.remove('hidden');
        document.getElementById('flightDetailsCard')?.style.setProperty('display', 'block');
    }

    // Flight details
    setVal('iFlightOutNum', itin.flight_outbound_number);
    setVal('iFlightOutAirline', itin.flight_outbound_airline);
    setVal('iFlightOutFrom', itin.flight_outbound_from);
    setVal('iFlightOutTo', itin.flight_outbound_to);
    if (itin.flight_outbound_depart) setVal('iFlightOutDepart', new Date(itin.flight_outbound_depart).toISOString().slice(0, 16));
    if (itin.flight_outbound_arrive) setVal('iFlightOutArrive', new Date(itin.flight_outbound_arrive).toISOString().slice(0, 16));
    setVal('iFlightRetNum', itin.flight_return_number);
    setVal('iFlightRetAirline', itin.flight_return_airline);
    setVal('iFlightRetFrom', itin.flight_return_from);
    setVal('iFlightRetTo', itin.flight_return_to);
    if (itin.flight_return_depart) setVal('iFlightRetDepart', new Date(itin.flight_return_depart).toISOString().slice(0, 16));
    if (itin.flight_return_arrive) setVal('iFlightRetArrive', new Date(itin.flight_return_arrive).toISOString().slice(0, 16));
    setVal('iFlightOutBaggage', itin.flight_outbound_baggage);
    setVal('iFlightOutLayover', itin.flight_outbound_layover);
    setVal('iFlightRetBaggage', itin.flight_return_baggage);
    setVal('iFlightRetLayover', itin.flight_return_layover);

    // Cover image
    setVal('iCoverImage', itin.cover_image_url);

    // Insurance
    setVal('iInsuranceProvider', itin.insurance_provider);
    setVal('iInsuranceCover', itin.insurance_cover_amount);
    if (itin.insurance_benefits) setVal('iInsuranceBenefits', JSON.stringify(itin.insurance_benefits));

    // Cancellation
    setVal('iCancellationPolicy', itin.cancellation_policy);
    setChk('iDateChangeAllowed', itin.date_change_allowed);

    // Load days
    const { data: dayRows } = await window.supabase
        .from('itinerary_days')
        .select('*')
        .eq('itinerary_id', itinId)
        .order('day_number');

    // Load rich activities
    const { data: actRows } = await window.supabase
        .from('itinerary_activities')
        .select('*')
        .eq('itinerary_id', itinId)
        .order('day_number')
        .order('sort_order');

    days = (dayRows || []).map(row => {
        const dayActivities = (actRows || [])
            .filter(a => a.day_number === row.day_number)
            .map(a => ({
                name: a.name || '',
                description: a.description || '',
                duration_hours: a.duration_hours || null,
                time_slot: a.time_slot || 'anytime',
                location: a.location || '',
                inclusions: a.inclusions || [],
                exclusions: a.exclusions || [],
            }));

        // Fallback: if no rich activities but TEXT[] activities exist, convert them
        const activities = dayActivities.length
            ? dayActivities
            : (row.activities || []).map(name => ({
                name, description: '', duration_hours: null,
                time_slot: 'anytime', location: '',
                inclusions: [], exclusions: [],
            }));

        return {
            id: `day-${row.id}`,
            day_number: row.day_number,
            title: row.title || `Day ${row.day_number}`,
            hotel_name: row.hotel_name || '',
            hotel_location: row.hotel_location || '',
            hotel_star_rating: row.hotel_star_rating || '',
            hotel_room_type: row.hotel_room_type || '',
            hotel_room_size: row.hotel_room_size || '',
            hotel_checkin: row.hotel_checkin || '',
            hotel_checkout: row.hotel_checkout || '',
            hotel_rating_score: row.hotel_rating_score || '',
            hotel_rating_count: row.hotel_rating_count || '',
            hotel_amenities: row.hotel_amenities || [],
            hotel_includes: row.hotel_includes || [],
            transport: row.transport || '',
            transfer_vehicle: row.transfer_vehicle || '',
            transfer_vehicle_name: row.transfer_vehicle_name || '',
            transfer_capacity: row.transfer_capacity || '',
            transfer_ac: row.transfer_ac ?? true,
            transfer_facilities: row.transfer_facilities || [],
            meals: row.meals || '',
            meal_details: row.meal_details || '',
            activities,
            notes: row.notes || '',
        };
    });

    renderDays();
    recalculate();
    showToast('Itinerary loaded');
}
