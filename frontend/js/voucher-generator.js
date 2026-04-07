// ============================================================
// voucher-generator.js — Voucher PDF generation for bookings
// Type-specific templates: Hotel, Flight, Transfer, Activity
// Requires: jsPDF loaded via CDN
// ============================================================

// ── Generate voucher from a booking service ───────────────
async function generateVoucher(booking, service) {
    const userId = await getCurrentUserId();

    // Get next voucher ref from DB
    const { data: refData, error: refErr } = await window.supabase.rpc('next_voucher_ref');
    if (refErr) { showToast('Failed to generate voucher ref', 'error'); return null; }
    const voucherRef = refData;

    // Build service_data based on type
    const serviceData = buildServiceData(service, booking);

    // Insert voucher record
    const voucherPayload = {
        voucher_ref: voucherRef,
        booking_id: booking.id,
        service_id: service.id,
        voucher_type: service.service_type || 'other',
        guest_name: booking.clients?.name || booking.leads?.name || 'Guest',
        guest_phone: booking.clients?.phone || '',
        guest_email: booking.clients?.email || '',
        pax_count: booking.pax_count || 1,
        service_data: serviceData,
        inclusions: serviceData.inclusions || [],
        exclusions: serviceData.exclusions || [],
        special_notes: service.notes || null,
        status: 'active',
        generated_by: userId,
    };

    const { data: voucher, error } = await window.supabase
        .from('vouchers')
        .insert(voucherPayload)
        .select()
        .single();

    if (error) { showToast('Voucher save failed: ' + error.message, 'error'); return null; }

    // Generate PDF
    downloadVoucherPdf(voucher);
    showToast(`Voucher ${voucherRef} generated`);
    return voucher;
}

// ── Build service_data JSONB based on type ────────────────
function buildServiceData(service, booking) {
    const base = {
        description: service.description || '',
        conf_no: service.pnr || service.supplier_conf || '',
        check_in: service.check_in || '',
        check_out: service.check_out || '',
    };

    // Merge any existing service_data from the service row
    const extra = service.service_data || {};

    switch (service.service_type) {
        case 'hotel':
            return {
                ...base,
                hotel_name: extra.hotel_name || service.description || '',
                room_type: extra.room_type || '',
                star_rating: extra.star_rating || '',
                meals: extra.meals || '',
                address: extra.address || '',
                inclusions: extra.inclusions || ['Accommodation', 'Complimentary Wi-Fi'],
                exclusions: extra.exclusions || ['Early check-in', 'Minibar charges'],
            };
        case 'flight':
            return {
                ...base,
                airline: extra.airline || '',
                flight_no: extra.flight_no || service.pnr || '',
                from_city: extra.from_city || '',
                from_code: extra.from_code || '',
                to_city: extra.to_city || '',
                to_code: extra.to_code || '',
                depart: extra.depart || service.check_in || '',
                arrive: extra.arrive || service.check_out || '',
                pnr: service.pnr || '',
                class: extra.class || 'Economy',
                inclusions: extra.inclusions || ['Cabin baggage', 'Web check-in'],
                exclusions: extra.exclusions || ['Meals on board', 'Seat selection'],
            };
        case 'transfer':
            return {
                ...base,
                vehicle: extra.vehicle || '',
                vehicle_name: extra.vehicle_name || '',
                from: extra.from || '',
                to: extra.to || '',
                date: extra.date || service.check_in || '',
                time: extra.time || '',
                capacity: extra.capacity || '',
                ac: extra.ac ?? true,
                facilities: extra.facilities || ['AC', 'Luggage space'],
                inclusions: extra.inclusions || ['Airport pickup', 'Meet & greet'],
                exclusions: extra.exclusions || ['Tolls', 'Parking fees'],
            };
        case 'activity':
            return {
                ...base,
                name: extra.name || service.description || '',
                date: extra.date || service.check_in || '',
                time_slot: extra.time_slot || '',
                duration: extra.duration || '',
                location: extra.location || '',
                inclusions: extra.inclusions || ['Entry ticket'],
                exclusions: extra.exclusions || ['Guide charges', 'Camera fee'],
            };
        default:
            return { ...base, ...extra, inclusions: extra.inclusions || [], exclusions: extra.exclusions || [] };
    }
}

// ── Download voucher PDF ──────────────────────────────────
function downloadVoucherPdf(voucher) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('PDF library not loaded', 'error'); return; }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const W = 210, H = 297, margin = 15;
    const cw = W - margin * 2;

    // Colors
    const brandBlue = [59, 130, 246];
    const darkText = [15, 23, 42];
    const mutedText = [100, 116, 139];
    const lightBg = [241, 245, 249];

    // Header
    let y = margin;
    doc.setFillColor(...brandBlue);
    doc.rect(0, 0, W, 38, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Travel Ops', margin, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Service Voucher', margin, 24);
    doc.setFontSize(9);
    doc.text(`${voucher.voucher_ref}  |  ${new Date(voucher.generated_at).toLocaleDateString('en-IN')}`, margin, 32);

    // Status badge on right
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(W - margin - 25, 22, 25, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('ACTIVE', W - margin - 22, 27);

    y = 46;

    // Guest Info Bar
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, y, cw, 18, 3, 3, 'F');
    doc.setTextColor(...darkText);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Guest Details', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...mutedText);
    const guestLine = [
        voucher.guest_name,
        voucher.guest_phone ? `Tel: ${voucher.guest_phone}` : null,
        `Pax: ${voucher.pax_count}`,
    ].filter(Boolean).join('  |  ');
    doc.text(guestLine, margin + 4, y + 13);
    y += 24;

    // Type-specific content
    const sd = voucher.service_data || {};
    const typeLabel = (voucher.voucher_type || 'other').charAt(0).toUpperCase() + (voucher.voucher_type || 'other').slice(1);

    doc.setTextColor(...brandBlue);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${typeLabel} Voucher`, margin, y);
    y += 3;
    doc.setDrawColor(...brandBlue);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 50, y);
    y += 8;

    switch (voucher.voucher_type) {
        case 'hotel':
            y = renderHotelVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg);
            break;
        case 'flight':
            y = renderFlightVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg);
            break;
        case 'transfer':
            y = renderTransferVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg);
            break;
        case 'activity':
            y = renderActivityVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg);
            break;
        default:
            y = renderGenericVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg);
    }

    // Inclusions / Exclusions
    y += 6;
    if ((voucher.inclusions || []).length) {
        doc.setTextColor(21, 128, 61);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Inclusions', margin, y); y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        voucher.inclusions.forEach(i => { doc.text(`✓ ${i}`, margin + 4, y); y += 4; });
        y += 2;
    }
    if ((voucher.exclusions || []).length) {
        doc.setTextColor(185, 28, 28);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Exclusions', margin, y); y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        voucher.exclusions.forEach(e => { doc.text(`✗ ${e}`, margin + 4, y); y += 4; });
        y += 2;
    }

    // Special notes
    if (voucher.special_notes) {
        y += 4;
        doc.setTextColor(...mutedText);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(`Note: ${voucher.special_notes}`, margin, y, { maxWidth: cw });
        y += 8;
        doc.setFont('helvetica', 'normal');
    }

    // Footer
    doc.setDrawColor(...brandBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, H - 18, W - margin, H - 18);
    doc.setTextColor(...mutedText);
    doc.setFontSize(7);
    doc.text('This is a system-generated voucher. Please present this at the service provider.', margin, H - 12);
    doc.text('Travel Ops — Powered by Technology, Driven by Passion', margin, H - 7);
    doc.text(voucher.voucher_ref, W - margin - 30, H - 7);

    doc.save(`voucher-${voucher.voucher_ref}.pdf`);
}

// ============================================================
// TYPE-SPECIFIC RENDERERS
// ============================================================

function renderHotelVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg) {
    const fields = [
        ['Hotel', sd.hotel_name],
        ['Room Type', sd.room_type],
        ['Star Rating', sd.star_rating ? '★'.repeat(parseInt(sd.star_rating)) : null],
        ['Check-in', sd.check_in ? formatDate(sd.check_in) : null],
        ['Check-out', sd.check_out ? formatDate(sd.check_out) : null],
        ['Meals', sd.meals],
        ['Confirmation', sd.conf_no],
        ['Address', sd.address],
    ];
    return renderFieldTable(doc, fields, y, margin, cw, darkText, mutedText, lightBg);
}

function renderFlightVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg) {
    const fields = [
        ['Airline', sd.airline],
        ['Flight No.', sd.flight_no],
        ['Route', sd.from_code && sd.to_code ? `${sd.from_city || sd.from_code} (${sd.from_code}) → ${sd.to_city || sd.to_code} (${sd.to_code})` : null],
        ['Departure', sd.depart ? new Date(sd.depart).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null],
        ['Arrival', sd.arrive ? new Date(sd.arrive).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null],
        ['PNR', sd.pnr],
        ['Class', sd.class],
    ];
    return renderFieldTable(doc, fields, y, margin, cw, darkText, mutedText, lightBg);
}

function renderTransferVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg) {
    const fields = [
        ['From', sd.from],
        ['To', sd.to],
        ['Date', sd.date ? formatDate(sd.date) : null],
        ['Time', sd.time],
        ['Vehicle', sd.vehicle ? `${sd.vehicle}${sd.vehicle_name ? ' (' + sd.vehicle_name + ')' : ''}` : null],
        ['Capacity', sd.capacity ? `${sd.capacity} pax` : null],
        ['AC', sd.ac !== false ? 'Yes' : 'No'],
        ['Confirmation', sd.conf_no],
    ];
    let newY = renderFieldTable(doc, fields, y, margin, cw, darkText, mutedText, lightBg);

    if ((sd.facilities || []).length) {
        doc.setTextColor(...mutedText);
        doc.setFontSize(8);
        doc.text(`Facilities: ${sd.facilities.join(', ')}`, margin + 4, newY);
        newY += 5;
    }
    return newY;
}

function renderActivityVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg) {
    const fields = [
        ['Activity', sd.name],
        ['Date', sd.date ? formatDate(sd.date) : null],
        ['Time Slot', sd.time_slot],
        ['Duration', sd.duration ? `${sd.duration} hours` : null],
        ['Location', sd.location],
        ['Confirmation', sd.conf_no],
    ];
    return renderFieldTable(doc, fields, y, margin, cw, darkText, mutedText, lightBg);
}

function renderGenericVoucher(doc, sd, voucher, y, margin, cw, darkText, mutedText, lightBg) {
    const fields = [
        ['Description', sd.description],
        ['Date', sd.check_in ? formatDate(sd.check_in) : null],
        ['End Date', sd.check_out ? formatDate(sd.check_out) : null],
        ['Confirmation', sd.conf_no],
    ];
    return renderFieldTable(doc, fields, y, margin, cw, darkText, mutedText, lightBg);
}

// ── Shared field table renderer ───────────────────────────
function renderFieldTable(doc, fields, y, margin, cw, darkText, mutedText, lightBg) {
    const validFields = fields.filter(([, val]) => val);
    if (!validFields.length) return y;

    const rowH = 8;
    const tableH = validFields.length * rowH + 4;

    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, y, cw, tableH, 3, 3, 'F');

    let fy = y + 6;
    validFields.forEach(([label, value], i) => {
        // Zebra stripe
        if (i % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin + 1, fy - 4, cw - 2, rowH, 'F');
        }

        doc.setTextColor(...mutedText);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(label, margin + 6, fy);

        doc.setTextColor(...darkText);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text(String(value), margin + 50, fy);

        fy += rowH;
    });

    return fy + 4;
}

// ── Batch generate vouchers for all services ──────────────
async function generateAllVouchers(booking) {
    const services = booking.booking_services || [];
    if (!services.length) { showToast('No services to generate vouchers for', 'error'); return; }

    let count = 0;
    for (const svc of services) {
        const result = await generateVoucher(booking, svc);
        if (result) count++;
    }
    showToast(`${count} voucher(s) generated`);
}
