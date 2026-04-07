// ============================================================
// booking-pnl.js — Aggregated Profit/Loss per Booking
// Provides P&L summary in booking drawer + P&L report tab
// ============================================================

// ── Render P&L section in booking drawer ──────────────────
async function renderBookingPnl(booking, containerEl) {
    const services = booking.booking_services || [];
    const vendorCost = services.reduce((s, svc) => s + (svc.cost_price || 0), 0);
    const sellTotal = services.reduce((s, svc) => s + (svc.sell_price || 0), 0);

    // Fetch invoiced amount
    const conditions = [];
    if (booking.client_id) conditions.push(`client_id.eq.${booking.client_id}`);
    if (booking.itinerary_id) conditions.push(`itinerary_id.eq.${booking.itinerary_id}`);

    let invoiceTotal = 0, collectedTotal = 0;
    if (conditions.length) {
        const { data: invoices } = await window.supabase.from('invoices')
            .select('total_amount, invoice_payments(amount)')
            .or(conditions.join(','));
        if (invoices) {
            invoiceTotal = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
            collectedTotal = invoices.reduce((s, i) => s + (i.invoice_payments || []).reduce((ps, p) => ps + (p.amount || 0), 0), 0);
        }
    }

    // Fetch linked expenses
    const { data: expenses } = await window.supabase.from('expenses')
        .select('amount, description, category')
        .ilike('description', `%${booking.booking_ref}%`);
    const otherExpenses = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);

    // Calculate P&L
    const totalCost = vendorCost + otherExpenses;
    const revenue = invoiceTotal || sellTotal;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';
    const isProfit = profit >= 0;

    containerEl.innerHTML = `
        <div class="drawer-section">
            <h4><i data-lucide="trending-up" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Profit & Loss</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.85rem">
                <div style="padding:10px;background:var(--bg-input);border-radius:8px">
                    <div style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em">Revenue</div>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--success)">${formatINR(revenue)}</div>
                    ${invoiceTotal ? `<div style="font-size:0.72rem;color:var(--text-muted)">Invoiced: ${formatINR(invoiceTotal)}</div>` : ''}
                </div>
                <div style="padding:10px;background:var(--bg-input);border-radius:8px">
                    <div style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em">Total Cost</div>
                    <div style="font-size:1.1rem;font-weight:700">${formatINR(totalCost)}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted)">Vendor: ${formatINR(vendorCost)}${otherExpenses ? ' + Exp: ' + formatINR(otherExpenses) : ''}</div>
                </div>
            </div>
            <!-- Profit bar -->
            <div style="margin-top:12px;padding:12px;background:${isProfit ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'};border:1px solid ${isProfit ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'};border-radius:8px;text-align:center">
                <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">${isProfit ? 'Net Profit' : 'Net Loss'}</div>
                <div style="font-size:1.4rem;font-weight:800;color:${isProfit ? 'var(--success)' : 'var(--danger)'}">${formatINR(Math.abs(profit))}</div>
                <div style="font-size:0.82rem;color:var(--text-muted)">${margin}% margin</div>
            </div>
            <!-- Collected status -->
            <div style="margin-top:8px;font-size:0.82rem;display:flex;justify-content:space-between">
                <span>Collected: <strong style="color:var(--success)">${formatINR(collectedTotal)}</strong></span>
                <span>Outstanding: <strong style="color:${invoiceTotal - collectedTotal > 0 ? 'var(--danger)' : 'var(--success)'}">${formatINR(Math.max(0, invoiceTotal - collectedTotal))}</strong></span>
            </div>

            <!-- Service cost breakdown -->
            ${services.length ? `
            <div style="margin-top:12px">
                <div style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Cost Breakdown by Service</div>
                ${services.map(s => {
                    const svcProfit = (s.sell_price || 0) - (s.cost_price || 0);
                    return `
                    <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem;border-bottom:1px solid var(--border)">
                        <span>${escHtml(s.service_type)} — ${escHtml(s.description || '')}</span>
                        <span>
                            <span style="color:var(--text-muted)">${formatINR(s.cost_price)} →</span>
                            <strong>${formatINR(s.sell_price)}</strong>
                            <span style="color:${svcProfit >= 0 ? 'var(--success)' : 'var(--danger)'}"> (${svcProfit >= 0 ? '+' : ''}${formatINR(svcProfit)})</span>
                        </span>
                    </div>`;
                }).join('')}
            </div>` : ''}

            ${expenses?.length ? `
            <div style="margin-top:10px">
                <div style="font-size:0.78rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;margin-bottom:6px">Other Expenses</div>
                ${expenses.map(e => `
                    <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.82rem">
                        <span>${escHtml(e.description)}</span>
                        <span>${formatINR(e.amount)}</span>
                    </div>
                `).join('')}
            </div>` : ''}
        </div>
    `;
}

// ── P&L Summary Report (for reports page) ─────────────────
async function loadPnlReport(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted)">Loading P&L report...</p>';

    const { data: bookings } = await window.supabase.from('bookings')
        .select('id, booking_ref, destination, travel_date, status, client_id, itinerary_id, pax_count, booking_services(cost_price, sell_price)')
        .in('status', ['confirmed', 'on_trip', 'completed'])
        .order('travel_date', { ascending: false })
        .limit(50);

    if (!bookings?.length) { container.innerHTML = '<p style="color:var(--text-muted)">No bookings found</p>'; return; }

    let totalRev = 0, totalCost = 0;
    const rows = bookings.map(b => {
        const cost = (b.booking_services || []).reduce((s, sv) => s + (sv.cost_price || 0), 0);
        const sell = (b.booking_services || []).reduce((s, sv) => s + (sv.sell_price || 0), 0);
        const profit = sell - cost;
        const pct = sell > 0 ? ((profit / sell) * 100).toFixed(1) : '0.0';
        totalRev += sell;
        totalCost += cost;
        return `
            <tr>
                <td><strong>${escHtml(b.booking_ref)}</strong></td>
                <td>${escHtml(b.destination)}</td>
                <td>${formatDate(b.travel_date)}</td>
                <td>${b.pax_count}</td>
                <td>${formatINR(cost)}</td>
                <td>${formatINR(sell)}</td>
                <td style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${formatINR(profit)}</strong></td>
                <td>${pct}%</td>
            </tr>
        `;
    });

    const totalProfit = totalRev - totalCost;
    const avgMargin = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : '0.0';

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
            <div class="stat-card"><div class="stat-value" style="color:var(--success)">${formatINR(totalRev)}</div><div class="stat-label">Total Revenue</div></div>
            <div class="stat-card"><div class="stat-value">${formatINR(totalCost)}</div><div class="stat-label">Total Vendor Cost</div></div>
            <div class="stat-card"><div class="stat-value" style="color:${totalProfit>=0?'var(--success)':'var(--danger)'}">${formatINR(totalProfit)}</div><div class="stat-label">Net Profit</div></div>
            <div class="stat-card"><div class="stat-value">${avgMargin}%</div><div class="stat-label">Avg Margin</div></div>
        </div>
        <div class="table-container">
            <table class="data-table" style="margin:0;width:100%">
                <thead><tr><th>Ref</th><th>Destination</th><th>Travel</th><th>Pax</th><th>Cost</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    `;
}
