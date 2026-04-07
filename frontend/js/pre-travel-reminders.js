// ============================================================
// pre-travel-reminders.js — Automated Pre-Travel Reminders
// Auto-schedules reminders on booking confirmation.
// Checks & sends on dashboard load.
// ============================================================

const REMINDER_TEMPLATES = [
    {
        days_before: 30,
        type: 'document_check',
        title: 'Document Check',
        message: (b) => `Hi ${b.client_name}! Your trip to ${b.destination} is in 30 days. Please ensure your passport, visa, and travel insurance are ready. If you need help, reply to this message.`
    },
    {
        days_before: 14,
        type: 'payment_reminder',
        title: 'Balance Payment Reminder',
        message: (b) => `Reminder: Your trip to ${b.destination} is in 2 weeks! Please ensure your final payment is complete. Ref: ${b.booking_ref}`
    },
    {
        days_before: 7,
        type: 'pre_travel_checklist',
        title: 'Pre-Travel Checklist',
        message: (b) => `7 days to go! ✈️ ${b.destination} trip checklist:\n✅ Passport & visa\n✅ Travel insurance\n✅ Hotel vouchers\n✅ Flight tickets\n✅ Currency exchange\n✅ Packing done?\nRef: ${b.booking_ref}`
    },
    {
        days_before: 3,
        type: 'final_reminder',
        title: 'Final Reminder',
        message: (b) => `Just 3 days until your ${b.destination} trip! 🎉\nDon't forget to:\n• Download offline maps\n• Confirm hotel check-in time\n• Set auto-reply on email\n• Share itinerary with family\nHave an amazing trip! — ${b.agency_name || 'Your Travel Team'}`
    },
    {
        days_before: 1,
        type: 'bon_voyage',
        title: 'Bon Voyage!',
        message: (b) => `Tomorrow's the big day! ✈️ Wishing you a wonderful trip to ${b.destination}. Safe travels! Ref: ${b.booking_ref}`
    },
];

// ── Auto-create reminders for a confirmed booking ────────
async function createPreTravelReminders(bookingId) {
    const { data: booking } = await window.supabase.from('bookings')
        .select('id, booking_ref, destination, travel_date, client_id, clients(name, phone, email)')
        .eq('id', bookingId)
        .single();

    if (!booking?.travel_date || !booking.client_id) return;

    const travelDate = new Date(booking.travel_date);
    const now = new Date();
    const userId = await getCurrentUserId();

    // Check if reminders already exist for this booking
    const { data: existing } = await window.supabase.from('pre_travel_reminders')
        .select('id')
        .eq('booking_id', bookingId)
        .limit(1);

    if (existing?.length) return; // Already created

    const reminders = REMINDER_TEMPLATES
        .map(t => {
            const sendDate = new Date(travelDate);
            sendDate.setDate(sendDate.getDate() - t.days_before);
            if (sendDate <= now) return null; // Skip past dates
            return {
                booking_id: bookingId,
                client_id: booking.client_id,
                reminder_type: t.type,
                send_date: sendDate.toISOString().split('T')[0],
                message: t.message({
                    client_name: booking.clients?.name || 'Traveler',
                    destination: booking.destination,
                    booking_ref: booking.booking_ref,
                }),
                status: 'scheduled',
                created_by: userId,
            };
        })
        .filter(Boolean);

    if (!reminders.length) return;

    const { error } = await window.supabase.from('pre_travel_reminders').insert(reminders);
    if (error) console.error('Failed to create reminders:', error.message);
}

// ── Check & send due reminders (call on dashboard load) ──
async function checkAndSendReminders() {
    const today = new Date().toISOString().split('T')[0];

    const { data: dueReminders } = await window.supabase.from('pre_travel_reminders')
        .select('*, clients(name, phone, email), bookings(booking_ref, destination)')
        .eq('status', 'scheduled')
        .lte('send_date', today)
        .limit(20);

    if (!dueReminders?.length) return;

    for (const r of dueReminders) {
        const phone = r.clients?.phone;
        if (phone) {
            // Send via WhatsApp
            await sendWhatsAppUpdate(phone, r.message);
        }
        // Mark as sent
        await window.supabase.from('pre_travel_reminders')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', r.id);
    }

    if (dueReminders.length) {
        showToast(`${dueReminders.length} reminder(s) sent`, 'success');
    }
}

// ── Render reminders in booking drawer ────────────────────
async function renderBookingReminders(bookingId, containerEl) {
    const { data: reminders } = await window.supabase.from('pre_travel_reminders')
        .select('*')
        .eq('booking_id', bookingId)
        .order('send_date', { ascending: true });

    if (!reminders?.length) {
        containerEl.innerHTML = `
            <div class="drawer-section">
                <h4><i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Pre-Travel Reminders</h4>
                <p style="font-size:0.82rem;color:var(--text-muted)">No reminders scheduled</p>
                <button class="btn btn-sm" onclick="createPreTravelReminders('${bookingId}').then(()=>location.reload())">
                    Schedule Reminders
                </button>
            </div>`;
        return;
    }

    const statusIcon = { scheduled: '🕐', sent: '✅', failed: '❌', cancelled: '⊘' };
    const statusColor = { scheduled: '#f59e0b', sent: '#10b981', failed: '#ef4444', cancelled: '#6b7280' };

    containerEl.innerHTML = `
        <div class="drawer-section">
            <h4><i data-lucide="bell" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Pre-Travel Reminders</h4>
            <div style="display:flex;flex-direction:column;gap:6px">
                ${reminders.map(r => `
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-input);border-radius:8px;font-size:0.82rem;border-left:3px solid ${statusColor[r.status] || '#6b7280'}">
                        <span>${statusIcon[r.status] || '?'}</span>
                        <div style="flex:1">
                            <div style="font-weight:600">${escHtml(r.reminder_type?.replace(/_/g, ' '))}</div>
                            <div style="color:var(--text-muted);font-size:0.75rem">${formatDate(r.send_date)}${r.sent_at ? ' — Sent ' + formatDate(r.sent_at) : ''}</div>
                        </div>
                        ${r.status === 'scheduled' ? `
                            <button class="btn btn-sm btn-danger" style="min-height:28px;min-width:28px;padding:2px 8px;font-size:0.72rem" onclick="cancelReminder('${r.id}')">Cancel</button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ── Cancel a scheduled reminder ─────────────────────────
async function cancelReminder(reminderId) {
    await window.supabase.from('pre_travel_reminders')
        .update({ status: 'cancelled' })
        .eq('id', reminderId);
    showToast('Reminder cancelled', 'info');
}
