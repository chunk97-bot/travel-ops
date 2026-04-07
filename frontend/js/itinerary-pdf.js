// ============================================================
// itinerary-pdf.js — Customer-facing branded A4 PDF export
// Overwrites the basic downloadPdf() from itinerary.js
// Requires: jsPDF loaded via CDN
// ============================================================

function downloadBrandedPdf() {
    return _downloadBrandedPdfAsync().catch(err => showToast('PDF error: ' + err.message, 'error'));
}

async function _downloadBrandedPdfAsync() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('PDF library not loaded', 'error'); return; }

    const d = getItineraryData();
    const h = d.highlights;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const W = 210, H = 297, margin = 15;
    const cw = W - margin * 2;
    let y = margin;
    let pageNum = 1;

    // ── Colors
    const brandBlue = [59, 130, 246];
    const darkText = [15, 23, 42];
    const mutedText = [100, 116, 139];
    const lightBg = [241, 245, 249];
    const greenBg = [240, 253, 244];
    const greenBorder = [187, 247, 208];

    // ── Page break helper
    function checkPage(needed) {
        if (y + needed > H - 20) { addFooter(); doc.addPage(); pageNum++; y = margin; }
    }

    function addFooter() {
        doc.setDrawColor(...brandBlue);
        doc.setLineWidth(0.3);
        doc.line(margin, H - 12, W - margin, H - 12);
        doc.setTextColor(...mutedText);
        doc.setFontSize(7);
        doc.text('Travel Ops — Powered by Technology, Driven by Passion', margin, H - 7);
        doc.text(`Page ${pageNum}`, W - margin - 15, H - 7);
    }

    // ── Cover Page (if cover image URL provided)
    if (d.coverImage) {
        // Dark overlay
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, W, H, 'F');

        // Try to load cover image
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = d.coverImage;
            });
            // Draw image covering the page with slight transparency
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.globalAlpha = 0.5;
            ctx.drawImage(img, 0, 0);
            doc.addImage(canvas.toDataURL('image/jpeg'), 'JPEG', 0, 0, W, H);
        } catch {
            // Image failed — keep dark background
        }

        // Title overlay
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(32);
        doc.setFont('helvetica', 'bold');
        const titleLines = doc.splitTextToSize(d.title || 'Travel Itinerary', W - 40);
        doc.text(titleLines, W / 2, H / 2 - 20, { align: 'center' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`${d.destination || ''} · ${d.nights} Nights`, W / 2, H / 2 + 10, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`${d.adults} Adults${d.children ? ', ' + d.children + ' Children' : ''}`, W / 2, H / 2 + 20, { align: 'center' });

        // Brand footer on cover
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Travel Ops', W / 2, H - 30, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Your Trusted Travel Partner', W / 2, H - 22, { align: 'center' });

        addFooter();
        doc.addPage();
        pageNum++;
        y = margin;
    }

    // ── Header Band
    doc.setFillColor(...brandBlue);
    doc.rect(0, 0, W, 44, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Travel Ops', margin, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Your Trusted Travel Partner', margin, 26);
    doc.setFontSize(9);
    doc.text(`Ref: TRV-${Date.now().toString(36).toUpperCase()} | Generated: ${new Date().toLocaleDateString('en-IN')}`, margin, 34);
    y = 52;

    // ── Trip Title + Highlights
    doc.setTextColor(...darkText);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(d.title || 'Travel Itinerary', margin, y);
    y += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedText);
    doc.text(`${d.destination || 'Trip'} · ${d.nights} Nights · ${d.adults} Adults${d.children ? ', ' + d.children + ' Children' : ''}`, margin, y);
    y += 7;

    // Highlights bar
    const highlightParts = [];
    if (h.flights) highlightParts.push(`${h.flights} Flights`);
    if (h.hotels) highlightParts.push(`${h.hotels} Hotels`);
    if (h.activities) highlightParts.push(`${h.activities} Activities`);
    if (h.transfers) highlightParts.push(`${h.transfers} Transfers`);
    if (highlightParts.length) {
        doc.setTextColor(...brandBlue);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(highlightParts.join('  |  '), margin, y);
        y += 8;
    }
    y += 2;

    // ── Package Highlights Box
    doc.setFillColor(...lightBg);
    const inclusions = [];
    if (d.includeFlights) inclusions.push('Flights');
    inclusions.push(`${d.nights}N Hotel (${d.hotel || 'Standard'})`);
    if (d.includeTransfers) inclusions.push('Transfers');
    if (d.meals !== 'none') inclusions.push((d.meals || '').toUpperCase());
    if (d.includeVisa) inclusions.push('Visa');
    if (d.insuranceProvider) inclusions.push('Insurance');

    doc.roundedRect(margin, y, cw, 20, 3, 3, 'F');
    doc.setTextColor(...darkText);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Package Inclusions', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(inclusions.map(i => '✓ ' + i).join('   |   '), margin + 4, y + 14);
    y += 28;

    // ── Flight Details
    if (d.includeFlights && d.flightOutbound.number) {
        checkPage(30);
        doc.setTextColor(...brandBlue);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Flight Details', margin, y); y += 7;

        // Outbound
        doc.setFillColor(...lightBg);
        const flightCardH = 20 + (d.flightOutbound.baggage ? 4 : 0) + (d.flightOutbound.layover ? 4 : 0);
        doc.roundedRect(margin, y, cw / 2 - 3, flightCardH, 2, 2, 'F');
        doc.setTextColor(...darkText);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Outbound', margin + 3, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${d.flightOutbound.airline} ${d.flightOutbound.number}`, margin + 3, y + 11);
        doc.setTextColor(...mutedText);
        doc.text(`${d.flightOutbound.from} → ${d.flightOutbound.to}`, margin + 3, y + 16);
        let outY = 20;
        if (d.flightOutbound.baggage) {
            doc.setFontSize(7);
            doc.text(`Baggage: ${d.flightOutbound.baggage}`, margin + 3, y + outY);
            outY += 4;
        }
        if (d.flightOutbound.layover) {
            doc.setFontSize(7);
            doc.setTextColor(245, 158, 11);
            doc.text(`${d.flightOutbound.layover}`, margin + 3, y + outY);
            outY += 4;
        }

        // Return
        if (d.flightReturn.number) {
            const rx = margin + cw / 2 + 3;
            const retCardH = 20 + (d.flightReturn.baggage ? 4 : 0) + (d.flightReturn.layover ? 4 : 0);
            doc.setFillColor(...lightBg);
            doc.roundedRect(rx, y, cw / 2 - 3, retCardH, 2, 2, 'F');
            doc.setTextColor(...darkText);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('Return', rx + 3, y + 6);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(`${d.flightReturn.airline} ${d.flightReturn.number}`, rx + 3, y + 11);
            doc.setTextColor(...mutedText);
            doc.text(`${d.flightReturn.from} → ${d.flightReturn.to}`, rx + 3, y + 16);
            let retY = 20;
            if (d.flightReturn.baggage) {
                doc.setFontSize(7);
                doc.text(`Baggage: ${d.flightReturn.baggage}`, rx + 3, y + retY);
                retY += 4;
            }
            if (d.flightReturn.layover) {
                doc.setFontSize(7);
                doc.setTextColor(245, 158, 11);
                doc.text(`${d.flightReturn.layover}`, rx + 3, y + retY);
                retY += 4;
            }
        }
        y += Math.max(flightCardH, 20) + 6;
    }

    // ── Day-by-Day Itinerary
    checkPage(20);
    doc.setTextColor(...brandBlue);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Day-by-Day Itinerary', margin, y);
    y += 2;
    doc.setDrawColor(...brandBlue);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 60, y);
    y += 6;

    days.forEach(day => {
        checkPage(40);

        // Day header badge
        doc.setFillColor(59, 130, 246);
        doc.roundedRect(margin, y, 28, 7, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Day ${day.day_number}`, margin + 3, y + 5);
        doc.setTextColor(...darkText);
        doc.setFontSize(10);
        doc.text(day.title || 'Day Plan', margin + 32, y + 5);
        y += 11;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mutedText);

        // Hotel with details
        if (day.hotel_name) {
            checkPage(12);
            let hotelLine = `Hotel: ${day.hotel_name}`;
            if (day.hotel_location) hotelLine += `, ${day.hotel_location}`;
            if (day.hotel_star_rating) hotelLine += ` · ${'★'.repeat(parseInt(day.hotel_star_rating))}`;
            if (day.hotel_room_type) hotelLine += ` · ${day.hotel_room_type}`;
            if (day.hotel_room_size) hotelLine += ` (${day.hotel_room_size})`;
            if (day.hotel_rating_score) hotelLine += ` · ${day.hotel_rating_score}/5`;
            if (day.hotel_rating_count) hotelLine += ` (${Number(day.hotel_rating_count).toLocaleString()} reviews)`;
            doc.text(hotelLine, margin + 4, y, { maxWidth: cw - 8 });
            y += Math.ceil(doc.getTextWidth(hotelLine) / (cw - 8)) * 4 + 2;

            if ((day.hotel_amenities || []).length) {
                doc.setFontSize(7.5);
                doc.text(`Amenities: ${day.hotel_amenities.join(', ')}`, margin + 6, y);
                y += 4;
            }
        }

        // Transport with details
        if (day.transport) {
            checkPage(8);
            let transLine = `Transport: ${day.transport}`;
            if (day.transfer_vehicle) transLine += ` — ${day.transfer_vehicle}`;
            if (day.transfer_vehicle_name) transLine += ` (${day.transfer_vehicle_name})`;
            if (day.transfer_capacity) transLine += `, ${day.transfer_capacity} pax`;
            transLine += day.transfer_ac !== false ? ', AC' : ', Non-AC';
            doc.setFontSize(8.5);
            doc.text(transLine, margin + 4, y, { maxWidth: cw - 8 });
            y += 5;
        }

        // Meals
        if (day.meals) {
            checkPage(6);
            let mealLine = `Meals: ${day.meals}`;
            if (day.meal_details) mealLine += ` — ${day.meal_details}`;
            doc.text(mealLine, margin + 4, y, { maxWidth: cw - 8 });
            y += 5;
        }

        // Rich Activities
        if (day.activities?.length) {
            day.activities.forEach(a => {
                if (!a.name) return;
                checkPage(18);

                doc.setFillColor(240, 249, 255);
                doc.roundedRect(margin + 4, y, cw - 8, 4, 1, 1, 'F');
                doc.setTextColor(...darkText);
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.text(a.name, margin + 6, y + 3);

                // Time slot + duration
                let meta = [];
                if (a.time_slot && a.time_slot !== 'anytime') meta.push(a.time_slot);
                if (a.duration_hours) meta.push(`${a.duration_hours}h`);
                if (meta.length) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);
                    doc.setTextColor(...mutedText);
                    doc.text(meta.join(' · '), margin + 6 + doc.getTextWidth(a.name) + 4, y + 3);
                }
                y += 6;

                // Description
                if (a.description) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(71, 85, 105);
                    const descLines = doc.splitTextToSize(a.description, cw - 14);
                    checkPage(descLines.length * 3.5 + 2);
                    doc.text(descLines, margin + 6, y);
                    y += descLines.length * 3.5 + 1;
                }

                // Inclusions
                if ((a.inclusions || []).length) {
                    doc.setFontSize(7);
                    doc.setTextColor(21, 128, 61);
                    doc.text('✓ ' + a.inclusions.join(', '), margin + 6, y, { maxWidth: cw - 14 });
                    y += 4;
                }

                // Exclusions
                if ((a.exclusions || []).length) {
                    doc.setTextColor(185, 28, 28);
                    doc.text('✗ ' + a.exclusions.join(', '), margin + 6, y, { maxWidth: cw - 14 });
                    y += 4;
                }
                y += 2;
            });
        }

        // Notes
        if (day.notes) {
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.setFont('helvetica', 'italic');
            const lines = doc.splitTextToSize(day.notes, cw - 8);
            checkPage(lines.length * 3.5);
            doc.text(lines, margin + 4, y);
            y += lines.length * 3.5 + 2;
            doc.setFont('helvetica', 'normal');
        }
        y += 4;
    });

    // ── Insurance Section
    if (d.insuranceProvider) {
        checkPage(22);
        doc.setFillColor(...greenBg);
        doc.setDrawColor(...greenBorder);
        doc.roundedRect(margin, y, cw, 18, 3, 3, 'FD');
        doc.setTextColor(...darkText);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Travel Insurance — ${d.insuranceProvider}`, margin + 4, y + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...mutedText);
        let insText = d.insuranceCover ? `Cover: INR ${Number(d.insuranceCover).toLocaleString('en-IN')}` : '';
        if (d.insuranceBenefits) {
            try {
                const b = JSON.parse(d.insuranceBenefits);
                insText += '  |  ' + Object.entries(b).map(([k,v]) => `${k.replace(/_/g,' ')}: INR ${Number(v).toLocaleString('en-IN')}`).join('  |  ');
            } catch {}
        }
        if (insText) doc.text(insText, margin + 4, y + 13, { maxWidth: cw - 8 });
        y += 24;
    }

    // ── Cancellation Policy
    checkPage(16);
    const policyLabels = {
        non_refundable: 'Non-Refundable',
        standard_domestic: 'Standard Domestic',
        international_premium: 'International Premium',
        flexible: 'Flexible',
    };
    doc.setTextColor(...darkText);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Cancellation & Date Change', margin, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...mutedText);
    doc.text(`Policy: ${policyLabels[d.cancellationPolicy] || d.cancellationPolicy}  |  Date Change: ${d.dateChangeAllowed ? 'Allowed' : 'Not Allowed'}`, margin, y);
    y += 8;

    // ── Pricing Section
    checkPage(36);
    y += 4;
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, y, cw, 30, 3, 3, 'F');
    doc.setTextColor(...darkText);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Package Pricing', margin + 4, y + 9);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Per Person: ${d.perPax}`, margin + 4, y + 17);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandBlue);
    doc.text(`Total (${d.adults + d.children} Pax): ${d.total}`, margin + 4, y + 24);
    y += 36;

    // ── Valid Until
    doc.setTextColor(...mutedText);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Price valid until ${d.validUntil ? new Date(d.validUntil).toLocaleDateString('en-IN') : '7 days from generation'}. Inclusive of applicable GST.`, margin, y);
    y += 8;

    // ── Terms & Conditions
    checkPage(30);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, W - margin, y);
    y += 6;
    doc.setTextColor(...mutedText);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Terms & Conditions', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    const terms = [
        '• 50% advance payment required to confirm booking. Balance due 7 days before departure.',
        '• Cancellation charges apply as per company policy.',
        '• Hotel rooms are subject to availability at time of booking.',
        '• Prices may vary due to currency fluctuations, seasonal surcharges, or changes in government taxes.',
        '• Travel insurance is recommended but not included unless specified.',
    ];
    terms.forEach(t => {
        doc.text(t, margin, y, { maxWidth: cw });
        y += 4;
    });

    // ── Footer on last page
    addFooter();

    doc.save(`itinerary-${(d.destination || 'trip').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
    showToast('Branded PDF downloaded');
}
