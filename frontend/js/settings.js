// ============================================================
// settings.js — Agency Profile, Tax & Bank Details
// ============================================================

const FIELDS = [
    'stAgencyName','stTagline','stPhone','stEmail','stAddress','stWebsite','stLogoUrl',
    'stGstin','stPan','stTan','stIata','stDefaultGst','stDefaultTcs','stFyMonth','stState',
    'stBankName','stAccNo','stIfsc','stAccType','stUpi',
    'stInvPrefix','stInvFooter','stPayTerms','stCurrency',
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
};

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
});

async function loadSettings() {
    const userId = await getCurrentUserId();
    const { data } = await window.supabase
        .from('agency_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (!data) return;
    FIELDS.forEach(id => {
        const key = DB_KEYS[id];
        const el  = document.getElementById(id);
        if (el && key && data[key] !== null && data[key] !== undefined) {
            el.value = data[key];
        }
    });
}

async function saveSettings() {
    const userId = await getCurrentUserId();
    const payload = { user_id: userId };
    FIELDS.forEach(id => {
        const key = DB_KEYS[id];
        const el  = document.getElementById(id);
        if (el && key) payload[key] = el.value.trim() || null;
    });

    const { error } = await window.supabase
        .from('agency_settings')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
    showToast('Settings saved!');
}
