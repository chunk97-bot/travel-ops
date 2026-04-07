// ============================================================
// approval-workflow.js — Approval Workflow for Quotes & Invoices
// Provides threshold checks, approval request creation, 
// approval dashboard, and status badge rendering
// ============================================================

// ── Check if approval is needed ───────────────────────────
async function checkApprovalRequired(type, context) {
    // type: 'quote' | 'discount' | 'refund'
    // context: { amount, discountPercent, ... }

    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { data: settings } = await window.supabase.from('agency_settings')
        .select('approval_required, approval_threshold_quote, approval_threshold_discount, approval_threshold_refund')
        .eq('user_id', userId)
        .single();

    if (!settings || !settings.approval_required) return false;

    const tQuote = parseFloat(settings.approval_threshold_quote) || 200000;
    const tDiscount = parseFloat(settings.approval_threshold_discount) || 10;
    const tRefund = parseFloat(settings.approval_threshold_refund) || 50000;

    if (type === 'quote' && context.amount > tQuote) return true;
    if (type === 'discount' && context.discountPercent > tDiscount) return true;
    if (type === 'refund' && context.amount > tRefund) return true;

    return false;
}

// ── Submit an approval request ────────────────────────────
async function submitApprovalRequest(entityType, entityId, amount, reason) {
    const userId = await getCurrentUserId();
    if (!userId) { showToast('Login required', 'error'); return null; }

    const { data, error } = await window.supabase.from('approval_requests').insert({
        entity_type: entityType,   // 'itinerary' | 'invoice' | 'refund'
        entity_id: entityId,
        requested_by: userId,
        request_type: entityType === 'itinerary' ? 'quote_above_threshold' :
                      entityType === 'refund' ? 'refund' : 'discount',
        amount: amount,
        reason: reason || null,
        status: 'pending'
    }).select().single();

    if (error) { showToast('Approval request failed', 'error'); return null; }

    // Update entity status
    if (entityType === 'itinerary') {
        await window.supabase.from('itineraries').update({ approval_status: 'pending' }).eq('id', entityId);
    }

    showToast('Approval request submitted', 'success');
    return data;
}

// ── Approve / Reject a request ────────────────────────────
async function handleApproval(requestId, action) {
    // action: 'approved' | 'rejected'
    const userId = await getCurrentUserId();
    if (!userId) return;

    const { data, error } = await window.supabase.from('approval_requests')
        .update({ status: action, approved_by: userId, approved_at: new Date().toISOString() })
        .eq('id', requestId)
        .select('entity_type, entity_id')
        .single();

    if (error) { showToast('Action failed', 'error'); return; }

    // Update entity
    if (data.entity_type === 'itinerary') {
        await window.supabase.from('itineraries')
            .update({ approval_status: action, approved_by: userId, approved_at: new Date().toISOString() })
            .eq('id', data.entity_id);
    }

    showToast(`Request ${action}`, 'success');
    if (typeof loadApprovalQueue === 'function') loadApprovalQueue();
}

// ── Render approval status badge ──────────────────────────
function renderApprovalBadge(status) {
    const map = {
        pending: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: '⏳ Pending Approval' },
        approved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: '✅ Approved' },
        rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: '❌ Rejected' },
    };
    const s = map[status] || { color: 'var(--text-muted)', bg: 'transparent', label: status || '' };
    if (!status) return '';
    return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.78rem;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

// ── Approval queue dashboard (admin view) ────────────────
async function loadApprovalQueue(containerId) {
    const container = document.getElementById(containerId || 'approvalQueue');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted)">Loading approvals...</p>';

    const { data: requests } = await window.supabase.from('approval_requests')
        .select('*, profiles:requested_by(full_name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);

    if (!requests?.length) {
        container.innerHTML = '<p style="color:var(--text-muted)">No pending approvals</p>';
        return;
    }

    container.innerHTML = requests.map(r => `
        <div style="padding:14px;background:var(--bg-input);border-radius:10px;margin-bottom:10px;border-left:3px solid #f59e0b">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
                <div>
                    <div style="font-weight:600;font-size:0.92rem">${escHtml(r.request_type?.replace(/_/g, ' ')?.toUpperCase())}</div>
                    <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px">
                        ${r.entity_type} • Amount: <strong>${formatINR(r.amount)}</strong>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
                        By: ${escHtml(r.profiles?.full_name || 'Staff')} • ${formatDate(r.created_at)}
                    </div>
                    ${r.reason ? `<div style="font-size:0.82rem;margin-top:4px">${escHtml(r.reason)}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px">
                    <button class="btn btn-success btn-sm" onclick="handleApproval('${r.id}','approved')">Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="handleApproval('${r.id}','rejected')">Reject</button>
                </div>
            </div>
        </div>
    `).join('');
}

// ── Pre-send check for itinerary ──────────────────────────
async function checkItineraryApproval(itineraryId, totalAmount) {
    const needsApproval = await checkApprovalRequired('quote', { amount: totalAmount });
    if (!needsApproval) return true; // No approval needed, proceed

    // Check if already approved
    const { data: existing } = await window.supabase.from('approval_requests')
        .select('status')
        .eq('entity_type', 'itinerary')
        .eq('entity_id', itineraryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (existing?.status === 'approved') return true;
    if (existing?.status === 'pending') {
        showToast('This quote is pending approval', 'warning');
        return false;
    }

    // Submit new approval request
    const reason = `Quote total: ${formatINR(totalAmount)} exceeds threshold`;
    await submitApprovalRequest('itinerary', itineraryId, totalAmount, reason);
    return false;
}
