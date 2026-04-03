// ============================================================
// call-log.js — Click-to-call + call logging
// Can be used from lead drawer or client drawer
// ============================================================

async function openCallDialog(phone, leadId, clientId) {
    if (!phone) { showToast('No phone number', 'error'); return; }

    // Create modal if not exists
    if (!document.getElementById('callLogModal')) {
        const modal = document.createElement('div');
        modal.id = 'callLogModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-overlay" id="callLogOverlay"></div>
            <div class="modal-content" style="max-width:420px">
                <div class="modal-header">
                    <h3 id="callLogTitle"><i data-lucide="phone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Log Call</h3>
                    <button class="modal-close" id="closeCallLog">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="font-size:1.1rem;font-weight:600;margin-bottom:12px" id="callPhone"></p>
                    <div class="form-group">
                        <label>Direction</label>
                        <select id="callDirection" class="form-control">
                            <option value="outbound"><i data-lucide="upload" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Outbound (I called them)</option>
                            <option value="inbound"><i data-lucide="download" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Inbound (They called me)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Duration</label>
                        <div style="display:flex;gap:8px;align-items:center">
                            <input type="number" id="callMinutes" min="0" max="120" value="5" style="width:60px" class="form-control"> min
                            <input type="number" id="callSeconds" min="0" max="59" value="0" style="width:60px" class="form-control"> sec
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Outcome</label>
                        <select id="callOutcome" class="form-control">
                            <option value="answered"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Answered</option>
                            <option value="no_answer"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> No Answer</option>
                            <option value="busy"><span class="dot dot-danger"></span> Busy</option>
                            <option value="voicemail"><i data-lucide="mail-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Voicemail</option>
                            <option value="callback"><i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Callback Requested</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea id="callNotes" rows="3" class="form-control" placeholder="Call summary..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="cancelCallLog">Cancel</button>
                    <button class="btn-primary" id="saveCallLog">Save Call Log</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('closeCallLog').addEventListener('click', () => closeModal('callLogModal'));
        document.getElementById('callLogOverlay').addEventListener('click', () => closeModal('callLogModal'));
        document.getElementById('cancelCallLog').addEventListener('click', () => closeModal('callLogModal'));
    }

    // Set data
    document.getElementById('callPhone').textContent = phone;
    document.getElementById('callDirection').value = 'outbound';
    document.getElementById('callMinutes').value = 5;
    document.getElementById('callSeconds').value = 0;
    document.getElementById('callOutcome').value = 'answered';
    document.getElementById('callNotes').value = '';

    // Bind save
    const saveBtn = document.getElementById('saveCallLog');
    const newSave = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSave, saveBtn);
    newSave.addEventListener('click', async () => {
        const userId = await getCurrentUserId();
        const duration = (parseInt(document.getElementById('callMinutes').value) || 0) * 60
                       + (parseInt(document.getElementById('callSeconds').value) || 0);
        const { error } = await window.supabase.from('call_logs').insert({
            lead_id: leadId || null,
            client_id: clientId || null,
            staff_id: userId,
            phone,
            direction: document.getElementById('callDirection').value,
            duration_sec: duration,
            outcome: document.getElementById('callOutcome').value,
            notes: document.getElementById('callNotes').value.trim() || null,
        });
        if (error) { showToast('Failed to save call log', 'error'); return; }

        // Also log as lead activity if lead_id exists
        if (leadId) {
            await window.supabase.from('lead_activities').insert({
                lead_id: leadId,
                staff_id: userId,
                type: 'call',
                notes: `${document.getElementById('callOutcome').value} · ${document.getElementById('callMinutes').value}m ${document.getElementById('callSeconds').value}s${document.getElementById('callNotes').value ? ' — ' + document.getElementById('callNotes').value.trim() : ''}`,
            });
        }

        showToast('Call logged');
        closeModal('callLogModal');

        // Trigger audit
        if (typeof logAudit === 'function') logAudit('call_logged', 'call_logs', leadId || clientId);
    });

    // Open phone dialer + modal
    window.open(`tel:${phone}`, '_self');
    openModal('callLogModal');
}
