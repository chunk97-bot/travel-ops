// ============================================================
// payment-milestones.js — Advance/Partial Payment Tracking
// Shows payment milestones in booking drawer, manages payment
// collection workflow: advance → balance → final settlement
// ============================================================

// ── Render payment milestones in booking drawer ────────────
async function renderPaymentMilestones(bookingId, containerEl) {
    const { data: milestones } = await window.supabase
        .from('booking_payment_milestones')
        .select('*')
        .eq('booking_id', bookingId)
        .order('due_date');

    if (!milestones) { containerEl.innerHTML = '<p style="color:var(--text-muted)">Error loading milestones</p>'; return; }

    const totalDue = milestones.reduce((s, m) => s + (m.amount || 0), 0);
    const totalPaid = milestones.reduce((s, m) => s + (m.paid_amount || 0), 0);
    const balance = totalDue - totalPaid;
    const paidPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
    const today = new Date().toISOString().split('T')[0];

    containerEl.innerHTML = `
        <div class="drawer-section">
            <h4><i data-lucide="wallet" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Payment Milestones</h4>
            <!-- Progress bar -->
            <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px">
                    <span>Collected: <strong style="color:var(--success)">${formatINR(totalPaid)}</strong></span>
                    <span>Balance: <strong style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">${formatINR(balance)}</strong></span>
                </div>
                <div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${paidPct}%;background:${paidPct >= 100 ? 'var(--success)' : 'var(--primary)'};border-radius:4px;transition:width 0.3s"></div>
                </div>
                <div style="text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:2px">${paidPct}% collected of ${formatINR(totalDue)}</div>
            </div>
            <!-- Milestone rows -->
            ${milestones.length ? milestones.map(m => {
                const isOverdue = m.status !== 'paid' && m.status !== 'waived' && m.due_date < today;
                const statusColor = m.status === 'paid' ? 'var(--success)' : isOverdue ? 'var(--danger)' : m.status === 'partial' ? 'var(--warning)' : 'var(--text-muted)';
                const statusIcon = m.status === 'paid' ? '✓' : isOverdue ? '!' : m.status === 'partial' ? '◐' : '○';
                return `
                <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <span style="color:${statusColor};font-weight:700;margin-right:6px">${statusIcon}</span>
                            <strong>${escHtml(m.label)}</strong>
                            ${isOverdue ? '<span class="badge badge-overdue" style="margin-left:6px">OVERDUE</span>' : ''}
                        </div>
                        <strong>${formatINR(m.amount)}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-muted);margin-top:3px">
                        <span>Due: ${formatDate(m.due_date)}</span>
                        <span>Paid: ${formatINR(m.paid_amount || 0)}${m.paid_date ? ' on ' + formatDate(m.paid_date) : ''}</span>
                    </div>
                    ${m.payment_ref ? `<div style="font-size:0.75rem;color:var(--text-muted)">Ref: ${escHtml(m.payment_ref)} · ${escHtml(m.payment_mode || '')}</div>` : ''}
                    ${m.status !== 'paid' && m.status !== 'waived' ? `
                        <div style="display:flex;gap:6px;margin-top:6px">
                            <button class="btn-success" style="padding:3px 10px;font-size:0.78rem" onclick="openMilestonePayment('${m.id}', ${m.amount - (m.paid_amount || 0)})">Record Payment</button>
                            <button class="btn-secondary" style="padding:3px 10px;font-size:0.78rem" onclick="sendMilestoneReminder('${bookingId}','${m.id}')">Send Reminder</button>
                        </div>
                    ` : ''}
                </div>`;
            }).join('') : '<p style="color:var(--text-muted);font-size:0.85rem">No milestones created</p>'}
            <button class="btn-primary" style="margin-top:10px;font-size:0.82rem;padding:6px 14px;width:100%" onclick="openAddMilestone('${bookingId}')">+ Add Payment Milestone</button>
        </div>
    `;
}

// ── Auto-create default milestones for a new booking ──────
async function createDefaultMilestones(bookingId, totalAmount, travelDate, advancePct = 50) {
    const advanceAmt = Math.round(totalAmount * (advancePct / 100));
    const balanceAmt = totalAmount - advanceAmt;
    const today = new Date().toISOString().split('T')[0];
    const userId = await getCurrentUserId();

    // Balance due 7 days before travel
    const balanceDueDate = new Date(travelDate);
    balanceDueDate.setDate(balanceDueDate.getDate() - 7);
    const balDue = balanceDueDate.toISOString().split('T')[0];

    const milestones = [
        {
            booking_id: bookingId,
            milestone_type: 'advance',
            label: `Advance ${advancePct}%`,
            amount: advanceAmt,
            due_date: today,
            status: 'pending',
            created_by: userId,
        },
        {
            booking_id: bookingId,
            milestone_type: 'balance',
            label: `Balance Due (${100 - advancePct}%)`,
            amount: balanceAmt,
            due_date: balDue > today ? balDue : today,
            status: 'pending',
            created_by: userId,
        },
    ];

    await window.supabase.from('booking_payment_milestones').insert(milestones);
}

// ── Open modal to record milestone payment ────────────────
function openMilestonePayment(milestoneId, balance) {
    const modal = document.getElementById('milestonePayModal');
    if (!modal) _injectMilestonePayModal();

    document.getElementById('mpMilestoneId').value = milestoneId;
    document.getElementById('mpAmount').value = balance;
    document.getElementById('mpDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('mpRef').value = '';
    document.getElementById('mpMode').value = 'upi';
    openModal('milestonePayModal');
}

async function saveMilestonePayment() {
    const milestoneId = document.getElementById('mpMilestoneId').value;
    const amount = parseFloat(document.getElementById('mpAmount').value) || 0;
    const payDate = document.getElementById('mpDate').value;
    const mode = document.getElementById('mpMode').value;
    const ref = document.getElementById('mpRef').value.trim();

    if (!amount) { showToast('Enter payment amount', 'error'); return; }

    // Get current milestone
    const { data: ms } = await window.supabase
        .from('booking_payment_milestones')
        .select('*')
        .eq('id', milestoneId)
        .single();

    if (!ms) { showToast('Milestone not found', 'error'); return; }

    const newPaid = (ms.paid_amount || 0) + amount;
    const newStatus = newPaid >= ms.amount ? 'paid' : 'partial';

    await window.supabase.from('booking_payment_milestones').update({
        paid_amount: newPaid,
        paid_date: payDate,
        payment_mode: mode,
        payment_ref: ref || null,
        status: newStatus,
        updated_at: new Date().toISOString(),
    }).eq('id', milestoneId);

    // Update booking total_paid
    const { data: allMs } = await window.supabase
        .from('booking_payment_milestones')
        .select('paid_amount')
        .eq('booking_id', ms.booking_id);

    const totalPaid = (allMs || []).reduce((s, m) => s + (m.paid_amount || 0), 0);
    const { data: booking } = await window.supabase
        .from('bookings')
        .select('total_package_amount')
        .eq('id', ms.booking_id)
        .single();

    const pkgAmt = booking?.total_package_amount || 0;
    let paymentStatus = 'unpaid';
    if (totalPaid >= pkgAmt && pkgAmt > 0) paymentStatus = 'fully_paid';
    else if (totalPaid > 0) paymentStatus = 'advance_received';

    await window.supabase.from('bookings').update({
        total_paid: totalPaid,
        payment_status: paymentStatus,
    }).eq('id', ms.booking_id);

    showToast(`Payment of ${formatINR(amount)} recorded`);
    closeModal('milestonePayModal');

    // Refresh drawer if open
    if (typeof openBookingDrawer === 'function') openBookingDrawer(ms.booking_id);
}

// ── Add new milestone ─────────────────────────────────────
function openAddMilestone(bookingId) {
    const modal = document.getElementById('addMilestoneModal');
    if (!modal) _injectAddMilestoneModal();

    document.getElementById('amBookingId').value = bookingId;
    document.getElementById('amLabel').value = '';
    document.getElementById('amAmount').value = '';
    document.getElementById('amDueDate').value = '';
    document.getElementById('amType').value = 'balance';
    openModal('addMilestoneModal');
}

async function saveNewMilestone() {
    const bookingId = document.getElementById('amBookingId').value;
    const userId = await getCurrentUserId();

    const payload = {
        booking_id: bookingId,
        milestone_type: document.getElementById('amType').value,
        label: document.getElementById('amLabel').value.trim() || 'Payment',
        amount: parseFloat(document.getElementById('amAmount').value) || 0,
        due_date: document.getElementById('amDueDate').value,
        status: 'pending',
        created_by: userId,
    };

    if (!payload.amount || !payload.due_date) { showToast('Amount and due date required', 'error'); return; }

    const { error } = await window.supabase.from('booking_payment_milestones').insert(payload);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    showToast('Milestone added');
    closeModal('addMilestoneModal');
    if (typeof openBookingDrawer === 'function') openBookingDrawer(bookingId);
}

// ── Send reminder for a specific milestone ────────────────
async function sendMilestoneReminder(bookingId, milestoneId) {
    const b = (typeof allBookings !== 'undefined' ? allBookings : []).find(x => x.id === bookingId);
    const { data: ms } = await window.supabase
        .from('booking_payment_milestones')
        .select('*')
        .eq('id', milestoneId)
        .single();

    if (!b || !ms) { showToast('Not found', 'error'); return; }

    const phone = b.clients?.phone;
    const balance = (ms.amount || 0) - (ms.paid_amount || 0);
    const msg = `Payment Reminder\n\nBooking: ${b.booking_ref}\nMilestone: ${ms.label}\nAmount Due: ${formatINR(balance)}\nDue Date: ${formatDate(ms.due_date)}\n\nPlease arrange payment at the earliest. Thank you!`;

    if (phone && typeof sendWhatsAppUpdate === 'function') {
        sendWhatsAppUpdate(phone, msg);
        await window.supabase.from('booking_payment_milestones').update({ reminder_sent: true }).eq('id', milestoneId);
        showToast('Reminder sent via WhatsApp');
    } else {
        showToast('No phone number on file', 'error');
    }
}

// ── Inject modals (called once) ───────────────────────────
function _injectMilestonePayModal() {
    if (document.getElementById('milestonePayModal')) return;
    const div = document.createElement('div');
    div.id = 'milestonePayModal';
    div.className = 'modal hidden';
    div.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('milestonePayModal')"></div>
        <div class="modal-box" style="max-width:440px">
            <div class="modal-header"><h2>Record Payment</h2><button class="modal-close" onclick="closeModal('milestonePayModal')">&times;</button></div>
            <input type="hidden" id="mpMilestoneId">
            <div class="form-grid" style="gap:12px">
                <div class="form-group"><label>Amount (₹)</label><input type="number" id="mpAmount" class="form-control"></div>
                <div class="form-group"><label>Payment Date</label><input type="date" id="mpDate" class="form-control"></div>
                <div class="form-group"><label>Mode</label>
                    <select id="mpMode" class="form-control">
                        <option value="upi">UPI</option><option value="neft">NEFT/RTGS</option>
                        <option value="card">Card</option><option value="cash">Cash</option>
                        <option value="cheque">Cheque</option><option value="bank_transfer">Bank Transfer</option>
                    </select>
                </div>
                <div class="form-group"><label>Reference / UTR</label><input type="text" id="mpRef" class="form-control" placeholder="Transaction ID"></div>
            </div>
            <div class="form-actions"><button class="btn-secondary" onclick="closeModal('milestonePayModal')">Cancel</button><button class="btn-primary" onclick="saveMilestonePayment()">Save Payment</button></div>
        </div>
    `;
    document.body.appendChild(div);
}

function _injectAddMilestoneModal() {
    if (document.getElementById('addMilestoneModal')) return;
    const div = document.createElement('div');
    div.id = 'addMilestoneModal';
    div.className = 'modal hidden';
    div.innerHTML = `
        <div class="modal-overlay" onclick="closeModal('addMilestoneModal')"></div>
        <div class="modal-box" style="max-width:440px">
            <div class="modal-header"><h2>Add Payment Milestone</h2><button class="modal-close" onclick="closeModal('addMilestoneModal')">&times;</button></div>
            <input type="hidden" id="amBookingId">
            <div class="form-grid" style="gap:12px">
                <div class="form-group"><label>Label</label><input type="text" id="amLabel" class="form-control" placeholder="e.g. Balance Due"></div>
                <div class="form-group"><label>Type</label>
                    <select id="amType" class="form-control">
                        <option value="advance">Advance</option><option value="balance">Balance</option>
                        <option value="final_settlement">Final Settlement</option><option value="refund">Refund</option>
                    </select>
                </div>
                <div class="form-group"><label>Amount (₹)</label><input type="number" id="amAmount" class="form-control"></div>
                <div class="form-group"><label>Due Date</label><input type="date" id="amDueDate" class="form-control"></div>
            </div>
            <div class="form-actions"><button class="btn-secondary" onclick="closeModal('addMilestoneModal')">Cancel</button><button class="btn-primary" onclick="saveNewMilestone()">Add Milestone</button></div>
        </div>
    `;
    document.body.appendChild(div);
}
