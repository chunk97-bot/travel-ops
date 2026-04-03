// ============================================================
// client-tags.js — Client Segmentation & Tag Management
// ============================================================

const PRESET_TAGS = ['VIP', 'Repeat', 'Referral', 'Corporate', 'Honeymoon', 'Family', 'Solo', 'Group', 'Budget', 'Luxury', 'Adventure', 'Senior', 'Student', 'NRI'];

function renderTagEditor(containerId, clientId, existingTags = []) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const tags = Array.isArray(existingTags) ? [...existingTags] : [];

    el.innerHTML = `
        <div class="tag-editor">
            <div id="tagList_${clientId}" class="client-tags" style="margin-bottom:8px">
                ${tags.map(t => `<span class="tag">${escHtml(t)} <button onclick="removeClientTag('${clientId}','${escHtml(t)}',this)" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:0.75rem;padding:0 2px">✕</button></span>`).join('')}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <select id="tagSelect_${clientId}" class="form-control" style="width:auto;min-width:120px;padding:4px 8px;font-size:0.82rem">
                    <option value="">+ Add Tag</option>
                    ${PRESET_TAGS.filter(t => !tags.includes(t)).map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('')}
                    <option value="_custom">Custom...</option>
                </select>
                <input type="text" id="customTag_${clientId}" class="form-control" style="width:120px;padding:4px 8px;font-size:0.82rem;display:none" placeholder="Custom tag">
                <button class="btn-primary-sm" onclick="addClientTag('${clientId}')">Add</button>
            </div>
        </div>
    `;

    document.getElementById(`tagSelect_${clientId}`)?.addEventListener('change', (e) => {
        const custom = document.getElementById(`customTag_${clientId}`);
        if (custom) custom.style.display = e.target.value === '_custom' ? 'block' : 'none';
    });
}

async function addClientTag(clientId) {
    const select = document.getElementById(`tagSelect_${clientId}`);
    const customInput = document.getElementById(`customTag_${clientId}`);
    let tag = select?.value;
    if (tag === '_custom') tag = customInput?.value.trim();
    if (!tag || tag === '_custom') { showToast('Select or enter a tag', 'error'); return; }

    // Fetch current tags
    const { data: client } = await window.supabase.from('clients').select('tags').eq('id', clientId).single();
    const currentTags = Array.isArray(client?.tags) ? client.tags : [];
    if (currentTags.includes(tag)) { showToast('Tag already exists', 'error'); return; }

    const newTags = [...currentTags, tag];
    const { error } = await window.supabase.from('clients').update({ tags: newTags }).eq('id', clientId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Tag added');

    // Refresh tag list
    renderTagEditor(`tagEditor_${clientId}`, clientId, newTags);
}

async function removeClientTag(clientId, tag, btnEl) {
    const { data: client } = await window.supabase.from('clients').select('tags').eq('id', clientId).single();
    const currentTags = Array.isArray(client?.tags) ? client.tags : [];
    const newTags = currentTags.filter(t => t !== tag);

    const { error } = await window.supabase.from('clients').update({ tags: newTags }).eq('id', clientId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Tag removed');
    renderTagEditor(`tagEditor_${clientId}`, clientId, newTags);
}

// Bulk tag operations
async function bulkAddTag(clientIds, tag) {
    for (const id of clientIds) {
        const { data } = await window.supabase.from('clients').select('tags').eq('id', id).single();
        const tags = Array.isArray(data?.tags) ? data.tags : [];
        if (!tags.includes(tag)) {
            await window.supabase.from('clients').update({ tags: [...tags, tag] }).eq('id', id);
        }
    }
    showToast(`Tag "${tag}" added to ${clientIds.length} clients`);
}
