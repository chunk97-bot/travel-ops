// ============================================================
// email-integration.js — Send emails from CRM, track opens
// Uses email-worker.js (Cloudflare Worker with Resend API)
// ============================================================

const EMAIL_WORKER_URL = 'https://travel-ops-email.chunky199701.workers.dev';

// Open compose email dialog (called from lead/client drawer)
function openEmailComposer({ to, leadId, clientId, subject, prefillBody }) {
    let modal = document.getElementById('emailComposeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'emailComposeModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="closeModal('emailComposeModal')"></div>
            <div class="modal-box" style="max-width:600px">
                <div class="modal-header">
                    <h2>📧 Send Email</h2>
                    <button class="modal-close" onclick="closeModal('emailComposeModal')">✕</button>
                </div>
                <form id="emailComposeForm" onsubmit="sendEmail(event)">
                    <div class="form-grid" style="grid-template-columns:1fr">
                        <div class="form-group">
                            <label>To</label>
                            <input type="email" id="emailTo" required class="form-input" placeholder="client@example.com">
                        </div>
                        <div class="form-group">
                            <label>Subject</label>
                            <input type="text" id="emailSubject" required class="form-input" placeholder="Re: Your Travel Inquiry">
                        </div>
                        <div class="form-group">
                            <label>Body</label>
                            <textarea id="emailBody" rows="8" required class="form-input" placeholder="Type your message..." style="resize:vertical"></textarea>
                        </div>
                        <input type="hidden" id="emailLeadId">
                        <input type="hidden" id="emailClientId">
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeModal('emailComposeModal')">Cancel</button>
                        <button type="submit" class="btn-primary" id="emailSendBtn">📤 Send Email</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('emailTo').value = to || '';
    document.getElementById('emailSubject').value = subject || '';
    document.getElementById('emailBody').value = prefillBody || '';
    document.getElementById('emailLeadId').value = leadId || '';
    document.getElementById('emailClientId').value = clientId || '';
    openModal('emailComposeModal');
}

// Send the email via Worker
async function sendEmail(e) {
    e.preventDefault();
    const btn = document.getElementById('emailSendBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const to = document.getElementById('emailTo').value.trim();
    const subject = document.getElementById('emailSubject').value.trim();
    const body = document.getElementById('emailBody').value.trim();
    const leadId = document.getElementById('emailLeadId').value || null;
    const clientId = document.getElementById('emailClientId').value || null;

    // Build HTML body
    const htmlBody = `<div style="font-family:sans-serif;line-height:1.6;color:#333">
        ${body.replace(/\n/g, '<br>')}
        <hr style="border:none;border-top:1px solid #eee;margin-top:24px">
        <p style="font-size:0.85rem;color:#999">Sent from Travel Ops CRM</p>
    </div>`;

    try {
        const resp = await fetch(EMAIL_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, html: htmlBody, from_name: 'Travel Ops' }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Send failed');

        // Log to email_logs
        const userId = await getCurrentUserId();
        await window.supabase.from('email_logs').insert({
            lead_id: leadId,
            client_id: clientId,
            staff_id: userId,
            direction: 'sent',
            to_email: to,
            from_email: 'noreply@resend.dev',
            subject,
            body: body.substring(0, 2000),
            status: 'sent',
            metadata: { resend_id: result.id },
        });

        // Also log as lead activity if lead
        if (leadId) {
            await window.supabase.from('lead_activities').insert({
                lead_id: leadId,
                staff_id: userId,
                type: 'email',
                notes: `Sent: ${subject}`,
            });
        }
        await logAudit('email_sent', 'email_logs', null, { to, subject });

        showToast('Email sent successfully');
        closeModal('emailComposeModal');
    } catch (err) {
        showToast('Email failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📤 Send Email';
    }
}

// Load email history for a lead/client
async function loadEmailHistory(targetEl, { leadId, clientId }) {
    if (!targetEl) return;
    const query = window.supabase.from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
    if (leadId) query.eq('lead_id', leadId);
    else if (clientId) query.eq('client_id', clientId);

    const { data } = await query;
    if (!data?.length) {
        targetEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No emails yet</p>';
        return;
    }

    targetEl.innerHTML = data.map(e => `
        <div style="background:var(--bg-input);border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:0.85rem">
            <span>${e.direction === 'sent' ? '📤' : '📨'}</span>
            <strong style="margin-left:4px">${escHtml(e.subject || 'No subject')}</strong>
            <span style="color:var(--text-muted);margin-left:8px">${formatDate(e.created_at)}</span>
            <span style="background:${e.status==='sent'?'var(--success)':e.status==='opened'?'var(--primary)':'var(--danger)'};color:#fff;padding:1px 6px;border-radius:4px;font-size:0.75rem;margin-left:8px">${e.status}</span>
        </div>
    `).join('');
}
