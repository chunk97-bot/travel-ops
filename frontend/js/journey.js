// ============================================================
// journey.js — Customer Journey Map (visual timeline per client)
// ============================================================

let selectedClientId = null;

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('journeyClientSearch');
    const dropdown = document.getElementById('journeyDropdown');
    let debounce;

    searchInput?.addEventListener('input', (e) => {
        clearTimeout(debounce);
        const q = e.target.value.trim();
        if (q.length < 2) { dropdown.style.display = 'none'; return; }
        debounce = setTimeout(() => searchClients(q), 300);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.journey-search')) dropdown.style.display = 'none';
    });

    // Check URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get('client')) {
        loadJourney(params.get('client'));
    }
});

async function searchClients(q) {
    const dropdown = document.getElementById('journeyDropdown');
    const like = `%${q}%`;
    const { data } = await window.supabase.from('clients')
        .select('id, name, phone, email')
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(8);

    if (!data?.length) { dropdown.style.display = 'none'; return; }
    dropdown.style.display = 'block';
    dropdown.innerHTML = data.map(c => `
        <div onclick="selectClient('${c.id}','${escHtml(c.name)}')">
            <strong>${escHtml(c.name)}</strong>
            <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px">${escHtml(c.phone || '')} ${c.email ? '· ' + escHtml(c.email) : ''}</span>
        </div>
    `).join('');
}

function selectClient(clientId, name) {
    selectedClientId = clientId;
    document.getElementById('journeyClientSearch').value = name;
    document.getElementById('journeyDropdown').style.display = 'none';
    loadJourney(clientId);
}

async function loadJourney(clientId) {
    selectedClientId = clientId;
    const content = document.getElementById('journeyContent');
    content.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px">Loading journey...</p>';

    // Fetch all events in parallel
    const [clientRes, leadsRes, quotesRes, bookingsRes, invoicesRes, paymentsRes, feedbackRes, cancellationsRes] = await Promise.all([
        window.supabase.from('clients').select('*').eq('id', clientId).single(),
        window.supabase.from('leads').select('*').eq('client_id', clientId).order('created_at'),
        window.supabase.from('quotations').select('*').eq('client_id', clientId).order('created_at'),
        window.supabase.from('bookings').select('*, booking_services(*)').eq('client_id', clientId).order('travel_date'),
        window.supabase.from('invoices').select('*').eq('client_id', clientId).order('created_at'),
        window.supabase.from('invoice_payments').select('*, invoices!inner(client_id)').eq('invoices.client_id', clientId).order('payment_date'),
        window.supabase.from('feedback').select('*').eq('client_id', clientId).order('created_at'),
        window.supabase.from('cancellations').select('*, bookings!inner(client_id)').eq('bookings.client_id', clientId).order('created_at'),
    ]);

    const client = clientRes.data;
    if (!client) { content.innerHTML = '<div class="empty-journey"><h3>Client not found</h3></div>'; return; }

    // Build timeline events
    const events = [];

    // Client created
    events.push({
        date: client.created_at,
        type: 'client',
        icon: '👤',
        color: '#6366f1',
        title: 'Client profile created',
        sub: `${client.name} — ${client.city || ''} ${client.segment ? '(' + client.segment + ')' : ''}`,
        tag: 'Onboarded',
        tagColor: '#6366f1',
    });

    // Leads (inquiries)
    (leadsRes.data || []).forEach(l => {
        events.push({
            date: l.created_at,
            type: 'lead',
            icon: '🎯',
            color: '#f59e0b',
            title: `Inquiry: ${l.destination || 'Unknown destination'}`,
            sub: `${l.pax_adults || 0} adults, ${l.pax_children || 0} children · Source: ${l.source || '—'} · Budget: ${l.budget_range || '—'}`,
            tag: l.stage,
            tagColor: l.stage === 'confirmed' ? '#10b981' : l.stage === 'lost' ? '#ef4444' : '#f59e0b',
        });
    });

    // Quotations
    (quotesRes.data || []).forEach(q => {
        events.push({
            date: q.created_at,
            type: 'quotation',
            icon: '📋',
            color: '#3b82f6',
            title: `Quotation: ${q.quote_number || ''}`,
            sub: `Amount: ${formatINR(q.total_amount)} · Version: ${q.version || 1}`,
            tag: q.status || 'draft',
            tagColor: q.status === 'accepted' ? '#10b981' : q.status === 'rejected' ? '#ef4444' : '#3b82f6',
        });
    });

    // Bookings
    (bookingsRes.data || []).forEach(b => {
        events.push({
            date: b.created_at,
            type: 'booking',
            icon: '🗓',
            color: '#10b981',
            title: `Booking: ${b.booking_ref} — ${b.destination}`,
            sub: `Travel: ${formatDate(b.travel_date)}${b.return_date ? ' → ' + formatDate(b.return_date) : ''} · ${b.pax_count} pax · ${(b.booking_services || []).length} services`,
            tag: b.status,
            tagColor: b.status === 'completed' ? '#10b981' : b.status === 'cancelled' ? '#ef4444' : '#3b82f6',
        });
    });

    // Invoices
    (invoicesRes.data || []).forEach(i => {
        events.push({
            date: i.created_at,
            type: 'invoice',
            icon: '🧾',
            color: '#8b5cf6',
            title: `Invoice: ${i.invoice_number}`,
            sub: `Amount: ${formatINR(i.total_amount)} · Due: ${formatDate(i.due_date)}`,
            tag: i.status,
            tagColor: i.status === 'paid' ? '#10b981' : i.status === 'overdue' ? '#ef4444' : '#f59e0b',
        });
    });

    // Payments
    (paymentsRes.data || []).forEach(p => {
        events.push({
            date: p.payment_date || p.created_at,
            type: 'payment',
            icon: '💰',
            color: '#10b981',
            title: `Payment received: ${formatINR(p.amount)}`,
            sub: `Mode: ${p.mode || '—'} ${p.reference ? '· Ref: ' + p.reference : ''}`,
            tag: 'Payment',
            tagColor: '#10b981',
        });
    });

    // Cancellations
    (cancellationsRes.data || []).forEach(c => {
        events.push({
            date: c.created_at,
            type: 'cancellation',
            icon: '❌',
            color: '#ef4444',
            title: 'Booking cancelled',
            sub: `Reason: ${c.reason || '—'} · Charge: ${formatINR(c.cancellation_charge)}`,
            tag: 'Cancelled',
            tagColor: '#ef4444',
        });
    });

    // Feedback
    (feedbackRes.data || []).forEach(f => {
        events.push({
            date: f.created_at,
            type: 'feedback',
            icon: '⭐',
            color: '#f59e0b',
            title: `Feedback: ${f.rating || '—'}/5`,
            sub: f.comment || 'No comment',
            tag: 'Feedback',
            tagColor: '#f59e0b',
        });
    });

    // Sort events by date
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate stats
    const totalBookings = bookingsRes.data?.length || 0;
    const totalSpend = (invoicesRes.data || []).reduce((s, i) => s + (i.total_amount || 0), 0);
    const totalPaid = (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0);
    const daysSinceFirst = Math.ceil((new Date() - new Date(client.created_at)) / 86400000);

    // Render
    let html = `
        <div class="journey-header">
            <h2>${escHtml(client.name)}</h2>
            <p>${escHtml(client.phone || '')} ${client.email ? '· ' + escHtml(client.email) : ''} ${client.city ? '· 📍 ' + escHtml(client.city) : ''}</p>
        </div>
        <div class="journey-stats">
            <div class="j-stat"><div class="val">${daysSinceFirst}d</div><div class="lbl">Customer Since</div></div>
            <div class="j-stat"><div class="val">${totalBookings}</div><div class="lbl">Bookings</div></div>
            <div class="j-stat"><div class="val">${formatINR(totalSpend)}</div><div class="lbl">Total Billed</div></div>
            <div class="j-stat"><div class="val">${formatINR(totalPaid)}</div><div class="lbl">Total Paid</div></div>
            <div class="j-stat"><div class="val">${events.length}</div><div class="lbl">Total Events</div></div>
        </div>
    `;

    if (!events.length) {
        html += '<div class="empty-journey"><p>No journey events yet for this client</p></div>';
    } else {
        html += '<div class="timeline">';
        events.forEach(ev => {
            html += `
            <div class="tl-item">
                <div class="tl-dot" style="border-color:${ev.color};color:${ev.color}">${ev.icon}</div>
                <div class="tl-content">
                    <div class="tl-date">${formatDate(ev.date)}</div>
                    <div class="tl-title">${escHtml(ev.title)}</div>
                    <div class="tl-sub">${escHtml(ev.sub)}</div>
                    <span class="tl-tag" style="background:${ev.tagColor}20;color:${ev.tagColor}">${escHtml(ev.tag)}</span>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    content.innerHTML = html;
}
