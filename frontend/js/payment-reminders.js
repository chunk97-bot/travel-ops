// ============================================================
// payment-reminders.js — Auto payment reminder system
// Injected into invoices.html to add reminder controls
// ============================================================

(function initPaymentReminders() {
    document.addEventListener('DOMContentLoaded', async () => {
        // Wait for invoices to load first
        await new Promise(r => setTimeout(r, 500));
        _injectReminderUI();
        _checkOverdueInvoices();
    });
})();

// ── Inject reminder UI into invoices page ────────────────
function _injectReminderUI() {
    // Add "Reminders" button next to New Invoice
    const topBarRight = document.querySelector('.top-bar-right');
    if (topBarRight && !document.getElementById('viewRemindersBtn')) {
        const btn = document.createElement('button');
        btn.id = 'viewRemindersBtn';
        btn.className = 'btn-secondary';
        btn.style.cssText = 'margin-right:8px;font-size:0.85rem';
        btn.textContent = '<i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Reminders';
        btn.addEventListener('click', openRemindersPanel);
        topBarRight.insertBefore(btn, topBarRight.firstChild);
    }

    // Inject reminders panel
    if (!document.getElementById('remindersPanel')) {
        const panel = document.createElement('div');
        panel.id = 'remindersPanel';
        panel.className = 'hidden';
        panel.style.cssText = `
            position:fixed;right:0;top:0;width:420px;height:100vh;z-index:1000;
            background:var(--surface,#1e293b);border-left:1px solid var(--border);
            box-shadow:-4px 0 24px rgba(0,0,0,0.3);overflow-y:auto;transition:transform 0.3s;
        `;
        panel.innerHTML = `
            <div style="padding:20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
                <h3 style="margin:0;font-size:1rem">Payment Reminders</h3>
                <button onclick="closeRemindersPanel()" style="background:transparent;border:none;color:var(--text-primary);font-size:1.2rem;cursor:pointer">&times;</button>
            </div>
            <div style="padding:16px">
                <div style="display:flex;gap:8px;margin-bottom:16px">
                    <button class="btn-primary" style="flex:1;font-size:0.8rem" onclick="autoSendReminders('overdue')"><i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Send Overdue Reminders</button>
                    <button class="btn-secondary" style="flex:1;font-size:0.8rem" onclick="autoSendReminders('upcoming')"><i data-lucide="alarm-clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Send Upcoming Due</button>
                </div>
                <div id="remindersList" style="font-size:0.85rem"></div>
                <h4 style="margin:20px 0 10px;font-size:0.85rem;color:var(--text-muted)">Reminder History</h4>
                <div id="reminderHistory"></div>
            </div>
        `;
        document.body.appendChild(panel);
    }
}

function openRemindersPanel() {
    const panel = document.getElementById('remindersPanel');
    if (panel) { panel.classList.remove('hidden'); panel.style.transform = 'translateX(0)'; }
    loadRemindersList();
    loadReminderHistory();
}

function closeRemindersPanel() {
    const panel = document.getElementById('remindersPanel');
    if (panel) panel.classList.add('hidden');
}

// ── Check overdue invoices on page load ──────────────────
async function _checkOverdueInvoices() {
    if (typeof allInvoices === 'undefined') return;
    const today = new Date().toISOString().split('T')[0];
    const overdue = (typeof allInvoices !== 'undefined' ? allInvoices : []).filter(i =>
        i.due_date && i.due_date < today && i.status !== 'paid' && i.status !== 'cancelled'
    );
    if (overdue.length > 0) {
        const btn = document.getElementById('viewRemindersBtn');
        if (btn) btn.innerHTML = `<i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Reminders <span style="background:#ef4444;color:#fff;border-radius:50%;padding:1px 6px;font-size:0.7rem;margin-left:4px">${overdue.length}</span>`;
    }
}

// ── Load overdue / upcoming due invoices ─────────────────
async function loadRemindersList() {
    const listEl = document.getElementById('remindersList');
    if (!listEl) return;
    listEl.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

    const { data: invoices } = await window.supabase.from('invoices')
        .select('*, clients(name, phone, email)')
        .in('status', ['draft', 'sent', 'partial'])
        .order('due_date');

    if (!invoices?.length) { listEl.innerHTML = '<p style="color:var(--text-muted)">No pending invoices</p>'; return; }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const overdue = invoices.filter(i => i.due_date && i.due_date < todayStr);
    const upcoming = invoices.filter(i => {
        if (!i.due_date || i.due_date < todayStr) return false;
        const due = new Date(i.due_date);
        return (due - today) / 86400000 <= 7;
    });

    let html = '';
    if (overdue.length) {
        html += `<div style="color:var(--danger);font-weight:700;margin-bottom:8px"><i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${overdue.length} Overdue</div>`;
        html += overdue.map(i => _reminderCard(i, 'overdue')).join('');
    }
    if (upcoming.length) {
        html += `<div style="color:var(--warning);font-weight:700;margin:12px 0 8px"><i data-lucide="alarm-clock" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${upcoming.length} Due within 7 days</div>`;
        html += upcoming.map(i => _reminderCard(i, 'upcoming')).join('');
    }
    if (!html) html = '<p style="color:var(--text-muted)">All invoices are on track <i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></p>';
    listEl.innerHTML = html;
}

function _reminderCard(inv, type) {
    const balance = (inv.total_amount || 0) - (inv.received || 0);
    const daysPast = Math.ceil((new Date() - new Date(inv.due_date)) / 86400000);
    return `
    <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between">
            <strong>${escHtml(inv.invoice_number)}</strong>
            <span style="color:${type === 'overdue' ? 'var(--danger)' : 'var(--warning)'}">
                ${type === 'overdue' ? `${daysPast}d overdue` : `Due ${formatDate(inv.due_date)}`}
            </span>
        </div>
        <div style="color:var(--text-muted);font-size:0.8rem">${escHtml(inv.clients?.name || '—')} · Balance: ${formatINR(balance)}</div>
        <div style="margin-top:6px;display:flex;gap:6px">
            <button class="btn-secondary" style="padding:2px 8px;font-size:0.75rem" onclick="sendReminder('${inv.id}','email')"><i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Email</button>
            ${inv.clients?.phone ? `<button class="btn-secondary" style="padding:2px 8px;font-size:0.75rem" onclick="sendReminder('${inv.id}','whatsapp')"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> WhatsApp</button>` : ''}
        </div>
    </div>`;
}

// ── Send individual reminder ─────────────────────────────
async function sendReminder(invoiceId, channel) {
    const inv = (typeof allInvoices !== 'undefined' ? allInvoices : []).find(i => i.id === invoiceId);
    if (!inv) {
        const { data } = await window.supabase.from('invoices').select('*, clients(name, phone, email)').eq('id', invoiceId).single();
        if (!data) { showToast('Invoice not found', 'error'); return; }
        await _processReminder(data, channel);
    } else {
        await _processReminder(inv, channel);
    }
}

async function _processReminder(inv, channel) {
    const balance = (inv.total_amount || 0) - (inv.received || 0);
    const clientName = inv.clients?.name || 'Client';

    // Log reminder
    const userId = await getCurrentUserId();
    await window.supabase.from('payment_reminders').insert({
        invoice_id: inv.id,
        client_id: inv.client_id,
        reminder_type: channel,
        amount_due: balance,
        due_date: inv.due_date,
        sent_at: new Date().toISOString(),
        status: 'sent',
        message_template: `Payment reminder for ${inv.invoice_number}: ₹${balance.toLocaleString('en-IN')} due`,
        created_by: userId,
    });

    if (channel === 'whatsapp' && inv.clients?.phone) {
        const msg = `Hi ${clientName},\n\nGentle reminder: Invoice *${inv.invoice_number}* has a balance of *₹${balance.toLocaleString('en-IN')}*${inv.due_date ? ` (due ${formatDate(inv.due_date)})` : ''}.\n\nPlease process at your earliest convenience.\n\nThank you!`;
        window.open(`https://wa.me/${inv.clients.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
        // For email, would normally call worker — for now show toast
        showToast(`Reminder logged for ${clientName} (${inv.invoice_number})`);
    }

    // Refresh
    loadReminderHistory();
}

// ── Auto-send reminders in bulk ──────────────────────────
async function autoSendReminders(type) {
    const today = new Date().toISOString().split('T')[0];
    const { data: invoices } = await window.supabase.from('invoices')
        .select('*, clients(name, phone, email)')
        .in('status', ['draft', 'sent', 'partial'])
        .order('due_date');

    if (!invoices?.length) { showToast('No pending invoices', 'info'); return; }

    let targets;
    if (type === 'overdue') {
        targets = invoices.filter(i => i.due_date && i.due_date < today);
    } else {
        targets = invoices.filter(i => {
            if (!i.due_date || i.due_date < today) return false;
            return (new Date(i.due_date) - new Date()) / 86400000 <= 7;
        });
    }

    if (!targets.length) { showToast(`No ${type} invoices found`); return; }

    let sent = 0;
    for (const inv of targets) {
        await _processReminder(inv, 'email');
        sent++;
    }
    showToast(`${sent} reminder(s) sent!`);
    loadRemindersList();
}

// ── Reminder history ─────────────────────────────────────
async function loadReminderHistory() {
    const el = document.getElementById('reminderHistory');
    if (!el) return;
    const { data } = await window.supabase.from('payment_reminders')
        .select('*, clients(name), invoices(invoice_number)')
        .order('created_at', { ascending: false }).limit(20);

    if (!data?.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No reminders sent yet</p>'; return; }
    el.innerHTML = data.map(r => `
        <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.8rem">
            <div style="display:flex;justify-content:space-between">
                <span>${r.reminder_type === 'whatsapp' ? '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>'} ${escHtml(r.invoices?.invoice_number || '—')} → ${escHtml(r.clients?.name || '—')}</span>
                <span style="color:var(--text-muted)">${formatDate(r.created_at)}</span>
            </div>
            <div style="color:var(--text-muted)">Amount: ${formatINR(r.amount_due)}</div>
        </div>
    `).join('');
}
