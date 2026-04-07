// ============================================================
// settings.js — Agency Profile, Tax & Bank Details
// ============================================================

const FIELDS = [
    'stAgencyName','stTagline','stPhone','stEmail','stAddress','stWebsite','stLogoUrl',
    'stGstin','stPan','stTan','stIata','stDefaultGst','stDefaultTcs','stFyMonth','stState',
    'stBankName','stAccNo','stIfsc','stAccType','stUpi',
    'stInvPrefix','stInvFooter','stPayTerms','stCurrency',
    'stApprovalRequired','stApprovalThresholdQuote','stApprovalThresholdDiscount','stApprovalThresholdRefund',
];

const DB_KEYS = {
    stAgencyName: 'agency_name', stTagline: 'tagline', stPhone: 'phone', stEmail: 'email',
    stAddress: 'address', stWebsite: 'website', stLogoUrl: 'logo_url',
    stGstin: 'gstin', stPan: 'pan_number', stTan: 'tan_number', stIata: 'iata_number',
    stDefaultGst: 'default_gst_percent', stDefaultTcs: 'default_tcs_percent',   
    stFyMonth: 'financial_year_start_month', stState: 'state',
    stBankName: 'bank_name', stAccNo: 'bank_account_number', stIfsc: 'bank_ifsc',
    stAccType: 'bank_account_type', stUpi: 'upi_id',
    stInvPrefix: 'invoice_prefix', stInvFooter: 'invoice_footer',
    stPayTerms: 'payment_terms_days', stCurrency: 'currency',
    stApprovalRequired: 'approval_required',
    stApprovalThresholdQuote: 'approval_threshold_quote',
    stApprovalThresholdDiscount: 'approval_threshold_discount',
    stApprovalThresholdRefund: 'approval_threshold_refund',
    // Init workflow rules panel
    if (typeof loadWorkflowRules === 'function') loadWorkflowRules();
    // Init audit trail panel
    if (typeof loadAuditTrail === 'function') loadAuditTrail('auditTrailContainer');
});

async function loadSettings() {
    const userId = await getCurrentUserId();
    const { data } = await window.supabase
        .from('agency_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (!data) return;
    // Populate lead capture embed URL with agency website
    const captureUrlEl = document.getElementById('captureUrl');
    if (captureUrlEl && data.website) {
        captureUrlEl.textContent = data.website.replace(/\/$/, '') + '/lead-capture.html';
    }
    FIELDS.forEach(id => {
        const key = DB_KEYS[id];
        const el  = document.getElementById(id);
        if (el && key && data[key] !== null && data[key] !== undefined) {
            if (el.type === 'checkbox') el.checked = data[key] === 'true' || data[key] === true;
            else el.value = data[key];
        }
    });
}

async function saveSettings() {
    const userId = await getCurrentUserId();
    const payload = { user_id: userId };
    FIELDS.forEach(id => {
        const key = DB_KEYS[id];
        const el  = document.getElementById(id);
        if (el && key) {
            if (el.type === 'checkbox') payload[key] = el.checked ? 'true' : 'false';
            else payload[key] = el.value.trim() || null;
        }
        .upsert(payload, { onConflict: 'user_id' });

    if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
    showToast('Settings saved!');
}
