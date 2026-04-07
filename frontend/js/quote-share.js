// ============================================================
// quote-share.js — Customer-Facing Quotation Link
// Generates shareable links for itineraries, tracks views,
// handles client accept/reject/request changes
// ============================================================

// ── Generate a shareable link for an itinerary ────────────
async function generateShareLink(itineraryId) {
    const userId = await getCurrentUserId();
    const token = _generateToken();

    // Get client info from itinerary context
    const clientName = document.getElementById('iClientName')?.value || '';
    const clientEmail = document.getElementById('iClientEmail')?.value || '';
    const clientPhone = document.getElementById('iClientPhone')?.value || '';

    // Expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data, error } = await window.supabase.from('itinerary_share_links').insert({
        itinerary_id: itineraryId,
        share_token: token,
        client_name: clientName || null,
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        expires_at: expiresAt.toISOString(),
        client_response: 'pending',
        created_by: userId,
    }).select().single();

    if (error) { showToast('Failed to create link: ' + error.message, 'error'); return null; }

    const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
    const shareUrl = `${baseUrl}quote-view.html?token=${token}`;

    return { shareUrl, token, data };
}

// ── Copy share link + show modal ──────────────────────────
async function shareItinerary() {
    if (!currentItineraryId) {
        showToast('Save the itinerary first', 'error');
        return;
    }

    const result = await generateShareLink(currentItineraryId);
    if (!result) return;

    _showShareModal(result.shareUrl, result.data);
}

function _showShareModal(shareUrl, linkData) {
    let modal = document.getElementById('shareModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shareModal';
        modal.className = 'modal hidden';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('shareModal')"></div>
        <div class="modal-box" style="max-width:520px">
            <div class="modal-header">
                <h2><i data-lucide="share-2" style="width:18px;height:18px;display:inline-block;vertical-align:middle"></i> Share Quotation</h2>
                <button class="modal-close" onclick="closeModal('shareModal')">&times;</button>
            </div>
            <div style="margin-bottom:14px">
                <label style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px;display:block">Share Link</label>
                <div style="display:flex;gap:8px">
                    <input type="text" id="shareUrlField" class="form-control" value="${escHtml(shareUrl)}" readonly style="flex:1">
                    <button class="btn-primary" onclick="_copyShareLink()" style="white-space:nowrap">Copy Link</button>
                </div>
                <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px">Link expires in 7 days. Client can view, accept, reject, or request changes.</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn-whatsapp" onclick="_sendShareWhatsApp('${escHtml(shareUrl)}')" style="flex:1">
                    <i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> WhatsApp
                </button>
                <button class="btn-secondary" onclick="_sendShareEmail('${escHtml(shareUrl)}')" style="flex:1">
                    <i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Email
                </button>
            </div>
            ${currentItineraryId ? `
            <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
                <h4 style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px">Active Links</h4>
                <div id="activeLinksList"></div>
            </div>` : ''}
        </div>
    `;

    openModal('shareModal');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (currentItineraryId) _loadActiveLinks(currentItineraryId);
}

function _copyShareLink() {
    const field = document.getElementById('shareUrlField');
    if (field) {
        navigator.clipboard.writeText(field.value);
        showToast('Link copied to clipboard!');
    }
}

function _sendShareWhatsApp(url) {
    const itin = typeof getItineraryData === 'function' ? getItineraryData() : {};
    const msg = `Hi! Here's your travel quotation for ${itin.destination || 'your trip'}.\n\nView & respond here: ${url}\n\nLet us know if you'd like any changes!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function _sendShareEmail(url) {
    const itin = typeof getItineraryData === 'function' ? getItineraryData() : {};
    const subject = encodeURIComponent(`Your Travel Quotation — ${itin.destination || 'Trip'}`);
    const body = encodeURIComponent(`Hi,\n\nPlease find your travel quotation below:\n${url}\n\nYou can accept, request changes, or reject directly from the link.\n\nBest regards`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
}

async function _loadActiveLinks(itineraryId) {
    const container = document.getElementById('activeLinksList');
    if (!container) return;

    const { data: links } = await window.supabase
        .from('itinerary_share_links')
        .select('*')
        .eq('itinerary_id', itineraryId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (!links?.length) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem">No active links</p>';
        return;
    }

    container.innerHTML = links.map(l => {
        const responseBadge = {
            pending: '<span class="badge badge-draft">Pending</span>',
            accepted: '<span class="badge badge-confirmed">Accepted</span>',
            rejected: '<span class="badge badge-cancelled">Rejected</span>',
            changes_requested: '<span class="badge badge-quoted">Changes Requested</span>',
        }[l.client_response] || '';

        return `
            <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:0.82rem;display:flex;justify-content:space-between;align-items:center">
                <div>
                    ${escHtml(l.client_name || 'Anonymous')} · ${l.view_count} views ${responseBadge}
                    ${l.client_message ? `<br><em style="color:var(--text-muted);font-size:0.78rem">"${escHtml(l.client_message)}"</em>` : ''}
                </div>
                <button class="btn-danger" style="padding:2px 8px;font-size:0.72rem" onclick="_deactivateLink('${l.id}')">Revoke</button>
            </div>
        `;
    }).join('');
}

async function _deactivateLink(linkId) {
    await window.supabase.from('itinerary_share_links').update({ is_active: false }).eq('id', linkId);
    showToast('Link revoked');
    if (currentItineraryId) _loadActiveLinks(currentItineraryId);
}

// ── Token generator (URL-safe) ────────────────────────────
function _generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const values = new Uint8Array(24);
    crypto.getRandomValues(values);
    for (let i = 0; i < 24; i++) token += chars[values[i] % chars.length];
    return token;
}
