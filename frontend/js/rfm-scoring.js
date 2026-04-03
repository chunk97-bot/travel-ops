// ============================================================
// rfm-scoring.js — RFM Customer Scoring for clients
// Calculates Recency, Frequency, Monetary scores & segments
// ============================================================

const RFM_SEGMENTS = {
    'Champions':      { min: 9, color: '#00c853', icon: '<i data-lucide="trophy" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' },
    'Loyal':          { min: 7, color: '#2196f3', icon: '<i data-lucide="diamond" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' },
    'Potential':      { min: 5, color: '#ffc107', icon: '<i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' },
    'New':            { min: 4, color: '#9c27b0', icon: '<i data-lucide="badge-plus" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' },
    'At Risk':        { min: 3, color: '#ff9800', icon: '<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️' },
    'Needs Attention': { min: 2, color: '#f44336', icon: '<i data-lucide="chevron-down" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' },
    'Lost':           { min: 0, color: '#757575', icon: '<i data-lucide="moon" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' }
};

document.addEventListener('DOMContentLoaded', () => {
    _injectRfmUI();
});

// ── Calculate RFM for all clients ─────────────────────────
async function calculateAllRfm() {
    showToast('Calculating RFM scores...');

    // Fetch all clients
    const { data: clients, error: clientErr } = await window.supabase
        .from('clients')
        .select('id, created_at');
    if (clientErr) { showToast('Failed to load clients', 'error'); return; }

    // Fetch all bookings with amounts
    const { data: bookings } = await window.supabase
        .from('bookings')
        .select('client_id, created_at, total_price');

    // Fetch all invoice payments
    const { data: payments } = await window.supabase
        .from('invoice_payments')
        .select('invoice_id, amount, paid_at, invoices(client_id)');

    // Build per-client metrics
    const now = new Date();
    const clientMetrics = {};

    (clients || []).forEach(c => {
        clientMetrics[c.id] = { recencyDays: 9999, frequency: 0, monetary: 0 };
    });

    // Process bookings
    (bookings || []).forEach(b => {
        if (!b.client_id || !clientMetrics[b.client_id]) return;
        const m = clientMetrics[b.client_id];
        m.frequency++;
        m.monetary += parseFloat(b.total_price || 0);
        const daysSince = Math.floor((now - new Date(b.created_at)) / 86400000);
        if (daysSince < m.recencyDays) m.recencyDays = daysSince;
    });

    // Process payments as monetary supplement
    (payments || []).forEach(p => {
        const cid = p.invoices?.client_id;
        if (!cid || !clientMetrics[cid]) return;
        const daysSince = Math.floor((now - new Date(p.paid_at)) / 86400000);
        if (daysSince < clientMetrics[cid].recencyDays) clientMetrics[cid].recencyDays = daysSince;
    });

    // Compute quintiles (1-5 scale for R, F, M)
    const ids = Object.keys(clientMetrics);
    const recencies = ids.map(id => clientMetrics[id].recencyDays).sort((a, b) => a - b);
    const frequencies = ids.map(id => clientMetrics[id].frequency).sort((a, b) => a - b);
    const monetaries = ids.map(id => clientMetrics[id].monetary).sort((a, b) => a - b);

    function quintile(arr, val, inverted = false) {
        if (arr.length < 5) return val > 0 ? 3 : 1;
        const q1 = arr[Math.floor(arr.length * 0.2)];
        const q2 = arr[Math.floor(arr.length * 0.4)];
        const q3 = arr[Math.floor(arr.length * 0.6)];
        const q4 = arr[Math.floor(arr.length * 0.8)];
        let score;
        if (val <= q1) score = 1;
        else if (val <= q2) score = 2;
        else if (val <= q3) score = 3;
        else if (val <= q4) score = 4;
        else score = 5;
        return inverted ? (6 - score) : score; // Recency: lower days = better = higher score
    }

    // Batch update clients
    let updated = 0;
    for (const id of ids) {
        const m = clientMetrics[id];
        const rScore = quintile(recencies, m.recencyDays, true); // Inverted: fewer days = higher R
        const fScore = quintile(frequencies, m.frequency);
        const mScore = quintile(monetaries, m.monetary);
        const totalScore = rScore + fScore + mScore; // 3-15 range
        const segment = getSegmentName(totalScore);

        const { error } = await window.supabase.from('clients').update({
            rfm_recency: rScore,
            rfm_frequency: fScore,
            rfm_monetary: mScore,
            rfm_score: totalScore,
            rfm_segment: segment,
            last_booking_date: m.recencyDays < 9999 ? new Date(now - m.recencyDays * 86400000).toISOString().split('T')[0] : null,
            total_bookings: m.frequency,
            total_spend: m.monetary
        }).eq('id', id);

        if (!error) updated++;
    }

    showToast(`RFM updated for ${updated} clients`);
    // Refresh client list
    if (typeof loadClients === 'function') await loadClients();
    if (document.getElementById('rfmPanel') && !document.getElementById('rfmPanel').classList.contains('hidden')) {
        await renderRfmDashboard();
    }
}

// ── Determine segment from total score ────────────────────
function getSegmentName(score) {
    if (score >= 12) return 'Champions';
    if (score >= 9)  return 'Loyal';
    if (score >= 7)  return 'Potential';
    if (score >= 5)  return 'New';
    if (score >= 4)  return 'At Risk';
    if (score >= 3)  return 'Needs Attention';
    return 'Lost';
}

// ── RFM Badge HTML ────────────────────────────────────────
function rfmBadge(client) {
    if (!client.rfm_segment) return '';
    const seg = RFM_SEGMENTS[client.rfm_segment] || RFM_SEGMENTS['Lost'];
    return `<span class="rfm-badge" style="background:${seg.color}22;color:${seg.color};font-size:0.7rem;padding:2px 6px;border-radius:8px;font-weight:600;white-space:nowrap" title="RFM: R${client.rfm_recency} F${client.rfm_frequency} M${client.rfm_monetary} = ${client.rfm_score}">${seg.icon} ${escHtml(client.rfm_segment)}</span>`;
}

// ── Hook into client card rendering ───────────────────────
function _hookRfmIntoClients() {
    const origRender = window.renderClientGrid;
    if (typeof origRender !== 'function') return;

    window.renderClientGrid = function(clients) {
        const grid = document.getElementById('clientGrid');
        if (!clients.length) { grid.innerHTML = '<div class="empty-state">No clients yet.</div>'; return; }
        grid.innerHTML = clients.map(c => `
            <div class="client-card" onclick="openClientDrawer('${c.id}')">
                <div class="client-avatar">${escHtml(c.name.charAt(0).toUpperCase())}</div>
                <div class="client-info">
                    <div class="client-name">${escHtml(c.name)} ${rfmBadge(c)}</div>
                    <div class="client-sub">${escHtml(c.phone || '')} ${c.email ? '· ' + escHtml(c.email) : ''}</div>
                    <div class="client-sub">${c.city ? '<i data-lucide="map-pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ' + escHtml(c.city) : ''} ${c.segment ? '· ' + escHtml(c.segment) : ''}</div>
                    ${c.rfm_score ? `<div class="client-sub" style="font-size:0.72rem;color:var(--text-muted)">R:${c.rfm_recency} F:${c.rfm_frequency} M:${c.rfm_monetary} · ₹${(c.total_spend || 0).toLocaleString()}</div>` : ''}
                    ${c.tags?.length ? `<div class="client-tags">${c.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
                </div>
                <div class="client-stats">
                    <div class="client-stat">${c.invoices?.[0]?.count || 0} trips</div>
                </div>
            </div>
        `).join('');
    };
}

// ── Inject RFM UI ─────────────────────────────────────────
function _injectRfmUI() {
    // Button in header
    const header = document.querySelector('.page-header .header-actions, .page-header');
    if (header) {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary';
        btn.innerHTML = '<i data-lucide="layout-dashboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> RFM Scoring';
        btn.style.cssText = 'margin-left:8px';
        btn.addEventListener('click', toggleRfmPanel);
        header.appendChild(btn);

        const calcBtn = document.createElement('button');
        calcBtn.className = 'btn-primary';
        calcBtn.innerHTML = '<i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Recalculate RFM';
        calcBtn.style.cssText = 'margin-left:4px';
        calcBtn.addEventListener('click', calculateAllRfm);
        header.appendChild(calcBtn);
    }

    // Slide-out panel
    const panel = document.createElement('div');
    panel.id = 'rfmPanel';
    panel.className = 'rfm-panel hidden';
    panel.innerHTML = `
        <div class="rfm-panel-header">
            <h3><i data-lucide="layout-dashboard" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> RFM Segmentation</h3>
            <button class="btn-icon" onclick="toggleRfmPanel()">&times;</button>
        </div>
        <div class="rfm-panel-body" id="rfmPanelBody"></div>
    `;
    document.body.appendChild(panel);

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        .rfm-panel { position:fixed;top:0;right:0;width:440px;max-width:95vw;height:100vh;background:var(--bg-card,#1a1a2e);
            border-left:1px solid var(--border,rgba(255,255,255,0.1));z-index:1050;overflow-y:auto;
            transition:transform 0.3s ease;box-shadow:-4px 0 20px rgba(0,0,0,0.3); }
        .rfm-panel.hidden { transform:translateX(100%); }
        .rfm-panel-header { display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid var(--border,rgba(255,255,255,0.1)); }
        .rfm-panel-header h3 { margin:0;font-size:1.1rem; }
        .rfm-panel-body { padding:16px; }

        .rfm-seg-card { display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-surface,rgba(255,255,255,0.05));border-radius:8px;margin-bottom:8px; }
        .rfm-seg-icon { font-size:1.5rem;width:36px;text-align:center; }
        .rfm-seg-info { flex:1; }
        .rfm-seg-name { font-weight:600;font-size:0.95rem; }
        .rfm-seg-count { font-size:2rem;font-weight:700;text-align:right;min-width:50px; }
    `;
    document.head.appendChild(style);

    // Hook rendering after a small delay to let clients.js load
    setTimeout(() => _hookRfmIntoClients(), 100);
}

// ── Toggle RFM Panel ──────────────────────────────────────
async function toggleRfmPanel() {
    const panel = document.getElementById('rfmPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
        await renderRfmDashboard();
    }
}

// ── Render RFM Dashboard ──────────────────────────────────
async function renderRfmDashboard() {
    const body = document.getElementById('rfmPanelBody');
    body.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

    const { data: clients } = await window.supabase
        .from('clients')
        .select('rfm_segment, rfm_score, total_spend, total_bookings')
        .not('rfm_segment', 'is', null);

    if (!clients || !clients.length) {
        body.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No RFM data yet. Click <strong><i data-lucide="zap" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Recalculate RFM</strong> to compute scores for all clients.</p>';
        return;
    }

    // Segment counts
    const segCounts = {};
    let totalSpend = 0;
    let totalBookings = 0;
    clients.forEach(c => {
        const seg = c.rfm_segment || 'Lost';
        segCounts[seg] = (segCounts[seg] || 0) + 1;
        totalSpend += parseFloat(c.total_spend || 0);
        totalBookings += (c.total_bookings || 0);
    });

    body.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
            <div class="stat-card"><div class="stat-value">${clients.length}</div><div class="stat-label">Scored Clients</div></div>
            <div class="stat-card"><div class="stat-value">₹${(totalSpend / 100000).toFixed(1)}L</div><div class="stat-label">Total Spend</div></div>
            <div class="stat-card"><div class="stat-value">${totalBookings}</div><div class="stat-label">Total Bookings</div></div>
        </div>
        <h4 style="margin:0 0 12px;font-size:0.95rem">Segments</h4>
        ${Object.entries(RFM_SEGMENTS).map(([name, seg]) => `
            <div class="rfm-seg-card" style="border-left:3px solid ${seg.color}">
                <div class="rfm-seg-icon">${seg.icon}</div>
                <div class="rfm-seg-info">
                    <div class="rfm-seg-name">${escHtml(name)}</div>
                </div>
                <div class="rfm-seg-count" style="color:${seg.color}">${segCounts[name] || 0}</div>
            </div>
        `).join('')}
    `;
}
