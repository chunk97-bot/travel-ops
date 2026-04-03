// ============================================================
// group-booking.js — Group Booking Management
// Handles group trips: member lists, room allocation, rooming
// ============================================================

let allGroupBookings = [];
let editingGroupId = null;

async function initGroupBookings() {
    await loadGroupBookings();
}

async function loadGroupBookings() {
    const { data } = await window.supabase
        .from('group_bookings')
        .select('*, group_members(count)')
        .order('created_at', { ascending: false });
    allGroupBookings = data || [];
    renderGroupBookings();
}

function renderGroupBookings() {
    const grid = document.getElementById('groupBookingGrid');
    if (!grid) return;
    if (!allGroupBookings.length) { grid.innerHTML = '<p class="empty-state">No group bookings yet</p>'; return; }

    grid.innerHTML = allGroupBookings.map(g => {
        const statusColors = { planning: '#94a3b8', confirmed: '#10b981', travelling: '#3b82f6', completed: '#6366f1', cancelled: '#ef4444' };
        return `
            <div class="client-card" onclick="openGroupDetail('${g.id}')">
                <div class="client-avatar" style="background:${statusColors[g.status] || 'var(--bg-hover)'}15;color:${statusColors[g.status] || 'var(--text-muted)'}">👥</div>
                <div class="client-info">
                    <div class="client-name">${escHtml(g.group_name)}</div>
                    <div class="client-sub">✈ ${escHtml(g.destination || 'TBD')} · ${formatDate(g.travel_date)}</div>
                    <div class="client-sub">${g.total_pax} pax · ${g.group_members?.[0]?.count || 0} members added</div>
                </div>
                <span class="badge badge-${g.status}">${escHtml(g.status)}</span>
            </div>
        `;
    }).join('');
}

function openAddGroupBooking() {
    editingGroupId = null;
    const html = `
        <div class="modal" id="groupModal">
            <div class="modal-overlay" onclick="closeModal('groupModal')"></div>
            <div class="modal-box">
                <div class="modal-header"><h2>New Group Booking</h2><button class="modal-close" onclick="closeModal('groupModal')">✕</button></div>
                <div class="form-grid">
                    <div class="form-group"><label>Group Name *</label><input type="text" id="gName" class="form-control" placeholder="e.g., Sharma Family Trip"></div>
                    <div class="form-group"><label>Destination</label><input type="text" id="gDestination" class="form-control" placeholder="e.g., Bali, Thailand"></div>
                    <div class="form-group"><label>Travel Date</label><input type="date" id="gTravelDate" class="form-control"></div>
                    <div class="form-group"><label>Return Date</label><input type="date" id="gReturnDate" class="form-control"></div>
                    <div class="form-group"><label>Total Pax</label><input type="number" id="gPax" class="form-control" value="10" min="2"></div>
                    <div class="form-group"><label>Status</label>
                        <select id="gStatus" class="form-control">
                            <option value="planning">Planning</option><option value="confirmed">Confirmed</option>
                            <option value="travelling">Travelling</option><option value="completed">Completed</option>
                        </select>
                    </div>
                    <div class="form-group full-width"><label>Notes</label><textarea id="gNotes" class="form-control" rows="2"></textarea></div>
                </div>
                <div class="form-actions"><button class="btn-secondary" onclick="closeModal('groupModal')">Cancel</button><button class="btn-primary" onclick="saveGroupBooking()">Save</button></div>
            </div>
        </div>
    `;
    document.getElementById('groupModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
}

async function saveGroupBooking() {
    const name = document.getElementById('gName')?.value.trim();
    if (!name) { showToast('Group name required', 'error'); return; }

    const payload = {
        group_name: name,
        destination: document.getElementById('gDestination')?.value.trim() || null,
        travel_date: document.getElementById('gTravelDate')?.value || null,
        return_date: document.getElementById('gReturnDate')?.value || null,
        total_pax: parseInt(document.getElementById('gPax')?.value) || 10,
        status: document.getElementById('gStatus')?.value || 'planning',
        notes: document.getElementById('gNotes')?.value.trim() || null,
        created_by: await getCurrentUserId(),
    };

    let error;
    if (editingGroupId) {
        ({ error } = await window.supabase.from('group_bookings').update(payload).eq('id', editingGroupId));
    } else {
        ({ error } = await window.supabase.from('group_bookings').insert(payload));
    }
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast(editingGroupId ? 'Group updated' : 'Group created');
    closeModal('groupModal');
    await loadGroupBookings();
}

async function openGroupDetail(groupId) {
    const group = allGroupBookings.find(g => g.id === groupId);
    if (!group) return;

    const { data: members } = await window.supabase
        .from('group_members')
        .select('*')
        .eq('group_booking_id', groupId)
        .order('name');

    const html = `
        <div class="modal" id="groupDetailModal">
            <div class="modal-overlay" onclick="closeModal('groupDetailModal')"></div>
            <div class="modal-box modal-large">
                <div class="modal-header">
                    <h2>👥 ${escHtml(group.group_name)}</h2>
                    <button class="modal-close" onclick="closeModal('groupDetailModal')">✕</button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                    <div><span style="color:var(--text-muted);font-size:0.82rem">Destination:</span> ${escHtml(group.destination || '—')}</div>
                    <div><span style="color:var(--text-muted);font-size:0.82rem">Travel:</span> ${formatDate(group.travel_date)} → ${formatDate(group.return_date)}</div>
                    <div><span style="color:var(--text-muted);font-size:0.82rem">Pax:</span> ${group.total_pax}</div>
                    <div><span style="color:var(--text-muted);font-size:0.82rem">Status:</span> <span class="badge badge-${group.status}">${escHtml(group.status)}</span></div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                    <h3 style="font-size:0.95rem">Members (${(members || []).length}/${group.total_pax})</h3>
                    <button class="btn-primary-sm" onclick="addGroupMember('${groupId}')">+ Add Member</button>
                </div>

                <table class="data-table" style="margin:0;width:100%">
                    <thead><tr><th>Name</th><th>Phone</th><th>Room</th><th>Meal</th><th>Passport</th><th>Actions</th></tr></thead>
                    <tbody id="groupMembersBody">
                        ${(members || []).map(m => `
                            <tr>
                                <td><strong>${escHtml(m.name)}</strong></td>
                                <td>${escHtml(m.phone || '—')}</td>
                                <td>${escHtml(m.room_type || '—')}</td>
                                <td>${escHtml(m.meal_pref || '—')}</td>
                                <td>${m.passport_number ? escHtml(m.passport_number) : '<span style="color:var(--danger)">Missing</span>'}</td>
                                <td><button class="btn-danger-sm" onclick="deleteGroupMember('${m.id}','${groupId}')">✕</button></td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" class="empty-state">No members added yet</td></tr>'}
                    </tbody>
                </table>

                <div style="margin-top:14px;display:flex;gap:8px">
                    <button class="btn-secondary" onclick="exportRoomingList('${groupId}')">📥 Export Rooming List</button>
                    <button class="btn-danger" style="margin-left:auto" onclick="deleteGroupBooking('${groupId}')">Delete Group</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('groupDetailModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
}

function addGroupMember(groupId) {
    const html = `
        <div class="modal" id="memberModal" style="z-index:300">
            <div class="modal-overlay" onclick="closeModal('memberModal')"></div>
            <div class="modal-box">
                <div class="modal-header"><h2>Add Member</h2><button class="modal-close" onclick="closeModal('memberModal')">✕</button></div>
                <div class="form-grid">
                    <div class="form-group"><label>Name *</label><input type="text" id="mName" class="form-control"></div>
                    <div class="form-group"><label>Phone</label><input type="tel" id="mPhone" class="form-control"></div>
                    <div class="form-group"><label>Email</label><input type="email" id="mEmail" class="form-control"></div>
                    <div class="form-group"><label>Room Type</label>
                        <select id="mRoom" class="form-control">
                            <option value="double">Double</option><option value="single">Single</option>
                            <option value="triple">Triple</option><option value="quad">Quad</option>
                            <option value="child_with_parent">Child (with parent)</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Meal Preference</label>
                        <select id="mMeal" class="form-control">
                            <option value="non_veg">Non-Veg</option><option value="veg">Veg</option>
                            <option value="jain">Jain</option><option value="vegan">Vegan</option>
                        </select>
                    </div>
                    <div class="form-group"><label>Passport Number</label><input type="text" id="mPassport" class="form-control"></div>
                    <div class="form-group"><label>Passport Expiry</label><input type="date" id="mPassportExpiry" class="form-control"></div>
                    <div class="form-group"><label>Special Needs</label><input type="text" id="mSpecial" class="form-control" placeholder="Wheelchair, dietary, etc."></div>
                </div>
                <div class="form-actions"><button class="btn-secondary" onclick="closeModal('memberModal')">Cancel</button><button class="btn-primary" onclick="saveMember('${groupId}')">Add</button></div>
            </div>
        </div>
    `;
    document.getElementById('memberModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', html);
}

async function saveMember(groupId) {
    const name = document.getElementById('mName')?.value.trim();
    if (!name) { showToast('Name required', 'error'); return; }

    const { error } = await window.supabase.from('group_members').insert({
        group_booking_id: groupId,
        name,
        phone: document.getElementById('mPhone')?.value.trim() || null,
        email: document.getElementById('mEmail')?.value.trim() || null,
        room_type: document.getElementById('mRoom')?.value || 'double',
        meal_pref: document.getElementById('mMeal')?.value || 'non_veg',
        passport_number: document.getElementById('mPassport')?.value.trim().toUpperCase() || null,
        passport_expiry: document.getElementById('mPassportExpiry')?.value || null,
        special_needs: document.getElementById('mSpecial')?.value.trim() || null,
    });

    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Member added');
    closeModal('memberModal');
    openGroupDetail(groupId);
}

async function deleteGroupMember(memberId, groupId) {
    if (!confirm('Remove this member?')) return;
    await window.supabase.from('group_members').delete().eq('id', memberId);
    showToast('Member removed');
    openGroupDetail(groupId);
}

async function deleteGroupBooking(groupId) {
    if (!confirm('Delete this entire group booking and all its members?')) return;
    await window.supabase.from('group_bookings').delete().eq('id', groupId);
    showToast('Group deleted');
    closeModal('groupDetailModal');
    await loadGroupBookings();
}

async function exportRoomingList(groupId) {
    const group = allGroupBookings.find(g => g.id === groupId);
    const { data: members } = await window.supabase.from('group_members').select('*').eq('group_booking_id', groupId).order('name');
    if (!members?.length) { showToast('No members to export', 'error'); return; }

    const header = ['#', 'Name', 'Phone', 'Room Type', 'Meal Pref', 'Passport', 'Passport Expiry', 'Special Needs'];
    const rows = members.map((m, i) => [
        i + 1, m.name, m.phone || '', m.room_type, m.meal_pref, m.passport_number || '', m.passport_expiry || '', m.special_needs || ''
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rooming-list-${(group?.group_name || 'group').replace(/\s+/g, '-')}.csv`;
    a.click();
    showToast('Rooming list exported');
}
