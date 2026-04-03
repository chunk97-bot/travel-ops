// ============================================================
// itinerary-pdf.js — Customer-facing branded A4 PDF export
// Overwrites the basic downloadPdf() from itinerary.js
// Requires: jsPDF loaded via CDN
// ============================================================

function downloadBrandedPdf() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { showToast('PDF library not loaded', 'error'); return; }

    const d = getItineraryData();
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const W = 210, H = 297, margin = 15;
    const cw = W - margin * 2;
    let y = margin;

    // ── Colors
    const brandBlue = [59, 130, 246];
    const darkText = [15, 23, 42];
    const mutedText = [100, 116, 139];
    const lightBg = [241, 245, 249];

    // ── Header Band
    doc.setFillColor(...brandBlue);
    doc.rect(0, 0, W, 44, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('<i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Travel Ops', margin, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Your Trusted Travel Partner', margin, 26);
    doc.setFontSize(9);
    doc.text(`Ref: TRV-${Date.now().toString(36).toUpperCase()} | Generated: ${new Date().toLocaleDateString('en-IN')}`, margin, 34);
    y = 52;

    // ── Trip Title
    doc.setTextColor(...darkText);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(d.title || 'Travel Itinerary', margin, y);
    y += 10;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedText);
    doc.text(`${d.destination || 'Trip'} · ${d.nights} Nights · ${d.adults} Adults${d.children ? ', ' + d.children + ' Children' : ''}`, margin, y);
    y += 12;

    // ── Package Highlights Box
    doc.setFillColor(...lightBg);
    doc.roundedRect(margin, y, cw, 24, 3, 3, 'F');
    doc.setTextColor(...darkText);
    doc.setFontSize(10);
    const inclusions = [];
    if (d.includeFlights) inclusions.push('<i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Flights');
    inclusions.push(`<i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${d.nights}N Hotel (${d.hotel || 'Standard'})`);
    if (d.includeTransfers) inclusions.push('<i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Transfers');
    if (d.meals !== 'none') inclusions.push(`<i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${(d.meals || '').toUpperCase()}`);
    if (d.includeVisa) inclusions.push('<i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Visa');

    doc.setFont('helvetica', 'bold');
    doc.text('Package Inclusions', margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(inclusions.join('   |   '), margin + 4, y + 15);
    y += 32;

    // ── Day-by-Day Itinerary
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
        // Page break check
        if (y > H - 50) { doc.addPage(); y = margin; }

        // Day header
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

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mutedText);

        if (day.hotel_name) {
            doc.text(`<i data-lucide="building" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Hotel: ${day.hotel_name}${day.hotel_location ? ', ' + day.hotel_location : ''}`, margin + 4, y);
            y += 5;
        }
        if (day.transport) {
            doc.text(`<i data-lucide="bus" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Transport: ${day.transport}`, margin + 4, y);
            y += 5;
        }
        if (day.meals) {
            doc.text(`<i data-lucide="utensils" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Meals: ${day.meals}`, margin + 4, y);
            y += 5;
        }
        if (day.activities?.length) {
            doc.text(`<i data-lucide="map-pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Activities: ${day.activities.join(', ')}`, margin + 4, y, { maxWidth: cw - 8 });
            y += Math.ceil(doc.getTextWidth(day.activities.join(', ')) / (cw - 8)) * 5 + 2;
        }
        if (day.notes) {
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            const lines = doc.splitTextToSize(day.notes, cw - 8);
            doc.text(lines, margin + 4, y);
            y += lines.length * 4 + 2;
        }
        y += 4;
    });

    // ── Pricing Section
    if (y > H - 60) { doc.addPage(); y = margin; }
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
    if (y > H - 40) { doc.addPage(); y = margin; }
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

    // ── Footer
    const footerY = H - 12;
    doc.setDrawColor(...brandBlue);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 4, W - margin, footerY - 4);
    doc.setTextColor(...mutedText);
    doc.setFontSize(7);
    doc.text('Travel Ops — Powered by Technology, Driven by Passion', margin, footerY);
    doc.text(`Page 1 of ${doc.getNumberOfPages()}`, W - margin - 20, footerY);

    doc.save(`itinerary-${(d.destination || 'trip').replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
    showToast('Branded PDF downloaded');
}
