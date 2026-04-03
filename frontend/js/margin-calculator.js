// ============================================================
// margin-calculator.js — Per-booking margin calculation
// Auto-injects margin column into bookings table and
// provides a margin analysis panel
// ============================================================

(function initMarginCalculator() {
    document.addEventListener('DOMContentLoaded', async () => {
        await new Promise(r => setTimeout(r, 600)); // Wait for bookings to load
        _injectMarginUI();
        _recalcAllMargins();
    });
})();

function _injectMarginUI() {
    const topBarRight = document.querySelector('.top-bar-right');
    if (topBarRight && !document.getElementById('marginAnalysisBtn')) {
        const btn = document.createElement('button');
        btn.id = 'marginAnalysisBtn';
        btn.className = 'btn-secondary';
        btn.style.cssText = 'margin-right:8px;font-size:0.85rem';
        btn.textContent = '💰 Margin Analysis';
        btn.addEventListener('click', openMarginPanel);
        topBarRight.insertBefore(btn, topBarRight.firstChild);
    }

    // Inject margin drawer panel
    if (!document.getElementById('marginPanel')) {
        const panel = document.createElement('div');
        panel.id = 'marginPanel';
        panel.className = 'hidden';
        panel.style.cssText = `
            position:fixed;right:0;top:0;width:480px;height:100vh;z-index:1000;
            background:var(--surface,#1e293b);border-left:1px solid var(--border);
            box-shadow:-4px 0 24px rgba(0,0,0,0.3);overflow-y:auto;transition:transform 0.3s;
        `;
        panel.innerHTML = `
            <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <h3 style="margin:0;font-size:1rem">💰 Margin Analysis</h3>
                <button onclick="closeMarginPanel()" style="background:transparent;border:none;color:var(--text-primary);font-size:1.2rem;cursor:pointer">✕</button>
            </div>
            <div style="padding:16px">
                <div id="marginSummary" style="margin-bottom:20px"></div>
                <h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">Per-Booking Breakdown</h4>
                <div id="marginBreakdown"></div>
            </div>
        `;
        document.body.appendChild(panel);
    }
}

function openMarginPanel() {
    const panel = document.getElementById('marginPanel');
    if (panel) panel.classList.remove('hidden');
    loadMarginAnalysis();
}

function closeMarginPanel() {
    const panel = document.getElementById('marginPanel');
    if (panel) panel.classList.add('hidden');
}

async function _recalcAllMargins() {
    if (typeof allBookings === 'undefined' || !allBookings.length) return;

    for (const b of allBookings) {
        const vendorCost = (b.booking_services || []).reduce((s, svc) => s + (svc.cost_price || 0), 0);
        const clientPrice = b.client_price || 0;
        const margin = clientPrice - vendorCost;
        const marginPct = clientPrice > 0 ? ((margin / clientPrice) * 100) : 0;

        // Only update if changed
        if (b.vendor_cost_total !== vendorCost || b.margin_amount !== margin) {
            await window.supabase.from('bookings').update({
                vendor_cost_total: vendorCost,
                margin_amount: margin,
                margin_percent: Math.round(marginPct * 100) / 100,
            }).eq('id', b.id);
        }
    }
}

async function loadMarginAnalysis() {
    const { data: bookings } = await window.supabase
        .from('bookings')
        .select('*, clients(name), booking_services(cost_price)')
        .in('status', ['confirmed', 'completed', 'on_trip'])
        .order('travel_date', { ascending: false });

    if (!bookings?.length) {
        document.getElementById('marginBreakdown').innerHTML = '<p style="color:var(--text-muted)">No confirmed bookings</p>';
        return;
    }

    // Fetch invoices for revenue
    const bookingIds = bookings.map(b => b.id);
    const { data: invoices } = await window.supabase.from('invoices')
        .select('client_id, total_amount')
        .in('status', ['paid', 'partial', 'sent', 'draft']);

    const revenueByClient = {};
    (invoices || []).forEach(i => {
        if (!revenueByClient[i.client_id]) revenueByClient[i.client_id] = 0;
        revenueByClient[i.client_id] += i.total_amount || 0;
    });

    let totalRevenue = 0, totalCost = 0;
    const rows = bookings.map(b => {
        const vendorCost = (b.booking_services || []).reduce((s, svc) => s + (svc.cost_price || 0), 0);
        const revenue = b.client_price || revenueByClient[b.client_id] || 0;
        const margin = revenue - vendorCost;
        const marginPct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '0';
        totalRevenue += revenue;
        totalCost += vendorCost;

        const color = margin >= 0 ? '#10b981' : '#ef4444';
        return `
        <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;font-size:0.85rem">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <strong>${escHtml(b.booking_ref)}</strong>
                <span style="color:${color};font-weight:700">${marginPct}% margin</span>
            </div>
            <div style="color:var(--text-muted)">${escHtml(b.clients?.name || '—')} · ${escHtml(b.destination || '')}</div>
            <div style="display:flex;gap:16px;margin-top:6px">
                <span>Revenue: <strong>${formatINR(revenue)}</strong></span>
                <span>Cost: <strong>${formatINR(vendorCost)}</strong></span>
                <span>Margin: <strong style="color:${color}">${formatINR(margin)}</strong></span>
            </div>
        </div>`;
    });

    const totalMargin = totalRevenue - totalCost;
    const avgMarginPct = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : '0';

    document.getElementById('marginSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
            <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px">
                <div style="font-size:1.1rem;font-weight:700">${formatINR(totalRevenue)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">Total Revenue</div>
            </div>
            <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px">
                <div style="font-size:1.1rem;font-weight:700">${formatINR(totalCost)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">Total Cost</div>
            </div>
            <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px">
                <div style="font-size:1.1rem;font-weight:700;color:${totalMargin >= 0 ? '#10b981' : '#ef4444'}">${formatINR(totalMargin)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">Net Margin</div>
            </div>
            <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px">
                <div style="font-size:1.1rem;font-weight:700;color:${totalMargin >= 0 ? '#10b981' : '#ef4444'}">${avgMarginPct}%</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">Avg Margin %</div>
            </div>
        </div>
    `;

    document.getElementById('marginBreakdown').innerHTML = rows.join('');
}
