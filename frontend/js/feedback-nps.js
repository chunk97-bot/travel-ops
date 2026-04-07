// ============================================================
// feedback-nps.js — Customer Feedback & NPS System
// Generates feedback links, displays NPS dashboard,
// manages ratings and reviews for completed trips.
// ============================================================

// ── Generate a feedback link for a completed booking ─────
async function generateFeedbackLink(bookingId) {
    const { data: booking } = await window.supabase.from('bookings')
        .select('id, booking_ref, client_id, destination')
        .eq('id', bookingId)
        .single();
    if (!booking) { showToast('Booking not found', 'error'); return null; }

    // Generate token
    const token = crypto.getRandomValues(new Uint8Array(16))
        .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');

    const { data, error } = await window.supabase.from('customer_feedback').insert({
        booking_id: bookingId,
        client_id: booking.client_id,
        token: token,
        status: 'pending',
    }).select().single();

    if (error) { showToast('Failed to create feedback link', 'error'); return null; }

    const feedbackUrl = `${window.location.origin}/frontend/feedback.html?token=${token}`;
    return { url: feedbackUrl, token, feedbackId: data.id };
}

// ── Send feedback link via WhatsApp ──────────────────────
async function sendFeedbackLink(bookingId) {
    const result = await generateFeedbackLink(bookingId);
    if (!result) return;

    const { data: booking } = await window.supabase.from('bookings')
        .select('booking_ref, destination, clients(name, phone)')
        .eq('id', bookingId)
        .single();

    const clientName = booking?.clients?.name || 'Traveler';
    const phone = booking?.clients?.phone;
    const message = `Hi ${clientName}! We hope you had an amazing trip to ${booking?.destination} 🌍\n\nWe'd love your feedback — it takes just 1 minute:\n${result.url}\n\nThank you! — Your Travel Team`;

    if (phone) {
        await sendWhatsAppUpdate(phone, message);
        showToast('Feedback link sent via WhatsApp', 'success');
    } else {
        // Copy to clipboard as fallback
        await navigator.clipboard.writeText(result.url);
        showToast('Feedback link copied to clipboard', 'info');
    }
}

// ── Render feedback status in booking drawer ─────────────
async function renderFeedbackStatus(bookingId, containerEl) {
    const { data: feedback } = await window.supabase.from('customer_feedback')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!feedback) {
        containerEl.innerHTML = `
            <div class="drawer-section">
                <h4><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Feedback</h4>
                <button class="btn btn-sm" onclick="sendFeedbackLink('${bookingId}')">
                    Send Feedback Request
                </button>
            </div>`;
        return;
    }

    if (feedback.status === 'pending') {
        containerEl.innerHTML = `
            <div class="drawer-section">
                <h4><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Feedback</h4>
                <div style="padding:10px;background:rgba(245,158,11,0.08);border-radius:8px;border-left:3px solid #f59e0b;font-size:0.82rem">
                    ⏳ Feedback request sent — awaiting response
                </div>
            </div>`;
        return;
    }

    // Show submitted feedback
    const npsColor = feedback.nps_score >= 9 ? '#10b981' : feedback.nps_score >= 7 ? '#f59e0b' : '#ef4444';
    const npsLabel = feedback.nps_score >= 9 ? 'Promoter' : feedback.nps_score >= 7 ? 'Passive' : 'Detractor';

    containerEl.innerHTML = `
        <div class="drawer-section">
            <h4><i data-lucide="star" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Customer Feedback</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;margin-bottom:10px">
                <div style="padding:8px;background:var(--bg-input);border-radius:8px">
                    <div style="font-size:1.3rem;font-weight:800;color:${npsColor}">${feedback.nps_score}/10</div>
                    <div style="font-size:0.72rem;color:${npsColor}">${npsLabel}</div>
                </div>
                <div style="padding:8px;background:var(--bg-input);border-radius:8px">
                    <div style="font-size:1.3rem;font-weight:800">${feedback.overall_rating || '-'}/5</div>
                    <div style="font-size:0.72rem;color:var(--text-muted)">Overall</div>
                </div>
                <div style="padding:8px;background:var(--bg-input);border-radius:8px">
                    <div style="font-size:1.3rem;font-weight:800">${feedback.value_rating || '-'}/5</div>
                    <div style="font-size:0.72rem;color:var(--text-muted)">Value</div>
                </div>
            </div>
            ${feedback.categories ? `
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
                ${Object.entries(feedback.categories).map(([k, v]) =>
                    `<span style="font-size:0.75rem;padding:2px 8px;border-radius:10px;background:var(--bg-input);color:var(--text-muted)">${escHtml(k)}: ${v}/5</span>`
                ).join('')}
            </div>` : ''}
            ${feedback.comment ? `
            <div style="padding:10px;background:var(--bg-input);border-radius:8px;font-size:0.85rem;border-left:3px solid ${npsColor}">
                "${escHtml(feedback.comment)}"
            </div>` : ''}
        </div>
    `;
}

// ── NPS Dashboard / Report ───────────────────────────────
async function loadNpsDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted)">Loading NPS data...</p>';

    const { data: feedbacks } = await window.supabase.from('customer_feedback')
        .select('nps_score, overall_rating, value_rating, status, created_at, bookings(destination, booking_ref), clients(name)')
        .eq('status', 'submitted')
        .order('created_at', { ascending: false })
        .limit(100);

    if (!feedbacks?.length) {
        container.innerHTML = '<p style="color:var(--text-muted)">No feedback received yet</p>';
        return;
    }

    // Calculate NPS
    const promoters = feedbacks.filter(f => f.nps_score >= 9).length;
    const passives = feedbacks.filter(f => f.nps_score >= 7 && f.nps_score < 9).length;
    const detractors = feedbacks.filter(f => f.nps_score < 7).length;
    const nps = Math.round(((promoters - detractors) / feedbacks.length) * 100);
    const avgRating = (feedbacks.reduce((s, f) => s + (f.overall_rating || 0), 0) / feedbacks.length).toFixed(1);

    const npsColor = nps >= 50 ? '#10b981' : nps >= 0 ? '#f59e0b' : '#ef4444';

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
            <div class="stat-card">
                <div class="stat-value" style="color:${npsColor}">${nps > 0 ? '+' : ''}${nps}</div>
                <div class="stat-label">NPS Score</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgRating}</div>
                <div class="stat-label">Avg Rating</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${feedbacks.length}</div>
                <div class="stat-label">Responses</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#10b981">${promoters}</div>
                <div class="stat-label">Promoters</div>
            </div>
        </div>
        <!-- NPS distribution bar -->
        <div style="margin-bottom:16px">
            <div style="display:flex;border-radius:8px;overflow:hidden;height:28px;font-size:0.72rem;font-weight:600">
                <div style="width:${(promoters/feedbacks.length*100).toFixed(0)}%;background:#10b981;display:flex;align-items:center;justify-content:center;color:#fff;min-width:${promoters?'30px':'0'}">${promoters ? promoters + ' P' : ''}</div>
                <div style="width:${(passives/feedbacks.length*100).toFixed(0)}%;background:#f59e0b;display:flex;align-items:center;justify-content:center;color:#fff;min-width:${passives?'30px':'0'}">${passives ? passives + ' N' : ''}</div>
                <div style="width:${(detractors/feedbacks.length*100).toFixed(0)}%;background:#ef4444;display:flex;align-items:center;justify-content:center;color:#fff;min-width:${detractors?'30px':'0'}">${detractors ? detractors + ' D' : ''}</div>
            </div>
        </div>
        <!-- Recent feedback -->
        <h4 style="margin-bottom:8px">Recent Feedback</h4>
        <div style="display:flex;flex-direction:column;gap:8px">
            ${feedbacks.slice(0, 10).map(f => {
                const color = f.nps_score >= 9 ? '#10b981' : f.nps_score >= 7 ? '#f59e0b' : '#ef4444';
                return `
                <div style="padding:10px;background:var(--bg-input);border-radius:8px;border-left:3px solid ${color};font-size:0.82rem">
                    <div style="display:flex;justify-content:space-between">
                        <strong>${escHtml(f.clients?.name || 'Anonymous')}</strong>
                        <span style="color:${color};font-weight:700">${f.nps_score}/10</span>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(f.bookings?.destination || '')} • ${formatDate(f.created_at)}</div>
                </div>`;
            }).join('')}
        </div>
    `;
}
