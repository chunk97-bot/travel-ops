// ============================================================
// duplicate-detect.js — Enhanced Duplicate Lead Detection
// Runs on new lead creation and provides merge UI
// ============================================================

async function checkDuplicateLead(phone, email, name) {
    const results = [];

    if (phone) {
        const cleaned = phone.replace(/\D/g, '').slice(-10);
        const { data } = await window.supabase.from('leads').select('id, name, phone, email, stage, destination, created_at')
            .or(`phone.ilike.%${cleaned}%`).limit(5);
        if (data?.length) results.push(...data.map(d => ({ ...d, matchType: 'phone' })));
    }

    if (email) {
        const { data } = await window.supabase.from('leads').select('id, name, phone, email, stage, destination, created_at')
            .eq('email', email).limit(5);
        if (data?.length) {
            data.forEach(d => {
                if (!results.find(r => r.id === d.id)) results.push({ ...d, matchType: 'email' });
            });
        }
    }

    // Also check clients table
    if (phone) {
        const cleaned = phone.replace(/\D/g, '').slice(-10);
        const { data } = await window.supabase.from('clients').select('id, name, phone, email')
            .or(`phone.ilike.%${cleaned}%`).limit(3);
        if (data?.length) results.push(...data.map(d => ({ ...d, matchType: 'phone (client)', isClient: true })));
    }
    if (email) {
        const { data } = await window.supabase.from('clients').select('id, name, phone, email')
            .eq('email', email).limit(3);
        if (data?.length) {
            data.forEach(d => {
                if (!results.find(r => r.id === d.id)) results.push({ ...d, matchType: 'email (client)', isClient: true });
            });
        }
    }

    return results;
}

function showDuplicateWarning(duplicates, onProceed) {
    const html = `
        <div class="modal" id="dupWarningModal" style="z-index:300">
            <div class="modal-overlay" onclick="closeModal('dupWarningModal')"></div>
            <div class="modal-box">
                <div class="modal-header">
                    <h2><i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>️ Possible Duplicates Found</h2>
                    <button class="modal-close" onclick="closeModal('dupWarningModal')">&times;</button>
                </div>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:14px">
                    We found ${duplicates.length} existing record${duplicates.length > 1 ? 's' : ''} that may be the same person:
                </p>
                <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto">
                    ${duplicates.map(d => `
                        <div style="background:var(--bg-input);border-radius:8px;padding:10px 14px;border-left:3px solid ${d.isClient ? 'var(--success)' : 'var(--warning)'}">
                            <div style="display:flex;justify-content:space-between">
                                <strong>${escHtml(d.name)}</strong>
                                <span class="badge ${d.isClient ? 'badge-success' : 'badge-' + (d.stage || 'info')}">${d.isClient ? 'Client' : escHtml(d.stage || '')}</span>
                            </div>
                            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:3px">
                                ${escHtml(d.phone || '')} ${d.email ? '· ' + escHtml(d.email) : ''}
                                ${d.destination ? ' · <i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ' + escHtml(d.destination) : ''}
                            </div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
                                Match: <strong>${escHtml(d.matchType)}</strong>
                                ${d.created_at ? ' · Added: ' + formatDate(d.created_at) : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="form-actions">
                    <button class="btn-secondary" onclick="closeModal('dupWarningModal')">Cancel — Don't Add</button>
                    <button class="btn-primary" id="dupProceedBtn">Add Anyway</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('dupWarningModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('dupProceedBtn').addEventListener('click', () => {
        closeModal('dupWarningModal');
        if (typeof onProceed === 'function') onProceed();
    });
}
