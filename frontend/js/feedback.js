// ============================================================
// feedback.js — Post-Trip Feedback Collection
// ============================================================

async function openFeedbackForm(clientId, invoiceId, destination) {
    const html = `
        <div class="modal" id="feedbackModal">
            <div class="modal-overlay" onclick="closeModal('feedbackModal')"></div>
            <div class="modal-box">
                <div class="modal-header"><h2>⭐ Collect Feedback</h2><button class="modal-close" onclick="closeModal('feedbackModal')">✕</button></div>
                <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:14px">${destination ? 'Trip to ' + escHtml(destination) : 'Post-trip experience'}</p>

                <div class="form-grid">
                    <div class="form-group">
                        <label>Overall Rating *</label>
                        <div id="ratingStars" style="display:flex;gap:6px;font-size:1.8rem;cursor:pointer">
                            ${[1,2,3,4,5].map(i => `<span data-star="${i}" onclick="setRating(${i})" style="color:var(--text-muted)">☆</span>`).join('')}
                        </div>
                        <input type="hidden" id="fbRating" value="0">
                    </div>
                    <div class="form-group">
                        <label>Experience</label>
                        <select id="fbExperience" class="form-control">
                            <option value="excellent">Excellent</option>
                            <option value="good">Good</option>
                            <option value="average">Average</option>
                            <option value="poor">Poor</option>
                            <option value="terrible">Terrible</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Staff Rating</label>
                        <select id="fbStaffRating" class="form-control">
                            <option value="5">5 — Excellent</option>
                            <option value="4">4 — Very Good</option>
                            <option value="3">3 — Good</option>
                            <option value="2">2 — Fair</option>
                            <option value="1">1 — Poor</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Would Recommend?</label>
                        <select id="fbRefer" class="form-control">
                            <option value="true">Yes, definitely</option>
                            <option value="false">No</option>
                        </select>
                    </div>
                    <div class="form-group full-width">
                        <label>Comments / Suggestions</label>
                        <textarea id="fbComments" class="form-control" rows="3" placeholder="What did you enjoy? What could be better?"></textarea>
                    </div>
                </div>
                <div class="form-actions">
                    <button class="btn-secondary" onclick="closeModal('feedbackModal')">Cancel</button>
                    <button class="btn-primary" onclick="submitFeedback('${clientId}','${invoiceId || ''}','${escHtml(destination || '')}')">Submit Feedback</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('feedbackModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
}

function setRating(n) {
    document.getElementById('fbRating').value = n;
    document.querySelectorAll('#ratingStars span').forEach(s => {
        s.textContent = parseInt(s.dataset.star) <= n ? '★' : '☆';
        s.style.color = parseInt(s.dataset.star) <= n ? '#f59e0b' : 'var(--text-muted)';
    });
}

async function submitFeedback(clientId, invoiceId, destination) {
    const rating = parseInt(document.getElementById('fbRating')?.value);
    if (!rating || rating < 1) { showToast('Please select a rating', 'error'); return; }

    const { error } = await window.supabase.from('feedback').insert({
        client_id: clientId || null,
        invoice_id: invoiceId || null,
        rating,
        experience: document.getElementById('fbExperience')?.value || null,
        staff_rating: parseInt(document.getElementById('fbStaffRating')?.value) || null,
        would_refer: document.getElementById('fbRefer')?.value === 'true',
        comments: document.getElementById('fbComments')?.value.trim() || null,
        destination: destination || null,
    });

    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Feedback collected — thank you! ⭐');
    closeModal('feedbackModal');
}

// Load feedback summary for a client
async function loadFeedbackSummary(containerId, clientId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const { data } = await window.supabase.from('feedback')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

    if (!data?.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No feedback collected yet</p>'; return; }

    const avgRating = (data.reduce((s, f) => s + f.rating, 0) / data.length).toFixed(1);
    const wouldRefer = data.filter(f => f.would_refer).length;

    el.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:10px">
            <div><span style="font-size:1.5rem;color:#f59e0b">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</span> <strong>${avgRating}/5</strong></div>
            <div style="color:var(--text-muted);font-size:0.85rem">${data.length} reviews · ${wouldRefer} would refer</div>
        </div>
        ${data.slice(0, 3).map(f => `
            <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                <div style="color:#f59e0b">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</div>
                ${f.destination ? `<span style="color:var(--text-muted)">${escHtml(f.destination)}</span> · ` : ''}
                <span style="color:var(--text-muted)">${formatDate(f.created_at)}</span>
                ${f.comments ? `<p style="margin-top:3px">${escHtml(f.comments)}</p>` : ''}
            </div>
        `).join('')}
    `;
}

// Dashboard: Load all recent feedback
async function loadFeedbackWidget(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const { data } = await window.supabase.from('feedback')
        .select('*, clients(name)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (!data?.length) { el.innerHTML = '<p class="empty-state">No feedback yet</p>'; return; }

    const avg = (data.reduce((s, f) => s + f.rating, 0) / data.length).toFixed(1);
    el.innerHTML = `
        <div style="margin-bottom:10px;font-size:0.9rem">Average: <strong style="color:#f59e0b">${avg}/5 ⭐</strong> from last ${data.length} reviews</div>
        ${data.map(f => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                <span><strong>${escHtml(f.clients?.name || '—')}</strong> ${f.destination ? '· ' + escHtml(f.destination) : ''}</span>
                <span style="color:#f59e0b">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</span>
            </div>
        `).join('')}
    `;
}
