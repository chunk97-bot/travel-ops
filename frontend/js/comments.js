// ============================================================
// comments.js — Internal @Mentions / Comments Component
// Reusable: attach to any entity (lead, booking, invoice, etc.)
// ============================================================

let _commentsStaff = [];

// ── Render Comments Section (call from any drawer) ────────
async function renderComments(entityType, entityId, container) {
    if (!container) return;

    // Load staff for @mentions
    if (!_commentsStaff.length) {
        const { data } = await window.supabase.from('staff_profiles').select('id, name, role').eq('is_active', true);
        _commentsStaff = data || [];
    }

    // Load comments
    const { data: comments, error } = await window.supabase
        .from('internal_comments')
        .select('*, staff_profiles(name, role)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('parent_id', null)
        .order('created_at', { ascending: true });

    if (error) { container.innerHTML = '<p style="color:#f44336;font-size:0.85rem">Failed to load comments</p>'; return; }

    const allComments = comments || [];

    // Load replies for all comments
    const commentIds = allComments.map(c => c.id);
    let repliesMap = {};
    if (commentIds.length) {
        const { data: replies } = await window.supabase
            .from('internal_comments')
            .select('*, staff_profiles(name, role)')
            .in('parent_id', commentIds)
            .order('created_at', { ascending: true });
        (replies || []).forEach(r => {
            if (!repliesMap[r.parent_id]) repliesMap[r.parent_id] = [];
            repliesMap[r.parent_id].push(r);
        });
    }

    container.innerHTML = `
        <div class="comments-section">
            <h4 style="margin:0 0 12px;font-size:0.9rem"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Comments & Notes</h4>
            <div class="comments-list" id="commentsList_${entityId}">
                ${allComments.length ? allComments.map(c => _renderComment(c, repliesMap[c.id] || [], entityType, entityId)).join('') : '<p style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">No comments yet</p>'}
            </div>
            <div class="comment-input-wrap" style="margin-top:12px">
                <div style="position:relative">
                    <textarea id="commentInput_${entityId}" class="comment-input" rows="2" placeholder="Write a comment... use @ to mention" style="width:100%;background:var(--bg-input,#1a1a2e);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;padding:8px 10px;color:var(--text-primary,#fff);font-size:0.85rem;resize:vertical"></textarea>
                    <div class="mention-dropdown hidden" id="mentionDrop_${entityId}" style="position:absolute;bottom:100%;left:0;width:220px;max-height:160px;overflow-y:auto;background:var(--bg-card,#1e293b);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:100"></div>
                </div>
                <div style="display:flex;justify-content:flex-end;margin-top:6px">
                    <button class="btn-primary" style="padding:5px 14px;font-size:0.82rem" onclick="postComment('${escHtml(entityType)}','${entityId}')">Post</button>
                </div>
            </div>
        </div>
    `;

    // Setup @mention autocomplete
    _setupMentionAutocomplete(entityId);
}

// ── Render a single comment ───────────────────────────────
function _renderComment(comment, replies, entityType, entityId) {
    const name = comment.staff_profiles?.name || 'Unknown';
    const role = comment.staff_profiles?.role || '';
    const time = _timeAgo(new Date(comment.created_at));
    const text = _formatMentions(comment.comment_text);

    return `
        <div class="comment-item" style="background:var(--bg-surface,rgba(255,255,255,0.05));border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--primary,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:600;color:#fff">${escHtml(name.charAt(0).toUpperCase())}</div>
                <div>
                    <span style="font-weight:600;font-size:0.85rem">${escHtml(name)}</span>
                    ${role ? `<span style="font-size:0.7rem;color:var(--text-muted);margin-left:4px">${escHtml(role)}</span>` : ''}
                </div>
                <span style="margin-left:auto;font-size:0.72rem;color:var(--text-muted)">${time}</span>
            </div>
            <div style="font-size:0.85rem;line-height:1.5;padding-left:36px">${text}</div>
            <div style="padding-left:36px;margin-top:4px">
                <button class="btn-text" style="font-size:0.72rem;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0" onclick="startReply('${entityId}','${comment.id}','${escHtml(name)}')">Reply</button>
            </div>
            ${replies.length ? `<div style="padding-left:36px;margin-top:8px;border-left:2px solid var(--border,rgba(255,255,255,0.1))">
                ${replies.map(r => {
                    const rName = r.staff_profiles?.name || 'Unknown';
                    return `<div style="padding:6px 0 6px 12px;font-size:0.82rem">
                        <span style="font-weight:600">${escHtml(rName)}</span>
                        <span style="color:var(--text-muted);margin-left:6px;font-size:0.7rem">${_timeAgo(new Date(r.created_at))}</span>
                        <div style="margin-top:2px">${_formatMentions(r.comment_text)}</div>
                    </div>`;
                }).join('')}
            </div>` : ''}
        </div>
    `;
}

// ── Format @mentions in text ──────────────────────────────
function _formatMentions(text) {
    if (!text) return '';
    // Escape first, then highlight mentions
    let safe = escHtml(text);
    safe = safe.replace(/@(\w+(?:\s\w+)?)/g, '<span style="background:rgba(59,130,246,0.2);color:#60a5fa;padding:0 3px;border-radius:3px;font-weight:500">@$1</span>');
    return safe;
}

// ── Time ago formatter ────────────────────────────────────
function _timeAgo(date) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
    return date.toLocaleDateString();
}

// ── Setup @mention autocomplete ───────────────────────────
function _setupMentionAutocomplete(entityId) {
    const input = document.getElementById(`commentInput_${entityId}`);
    const dropdown = document.getElementById(`mentionDrop_${entityId}`);
    if (!input || !dropdown) return;

    let mentionStart = -1;

    input.addEventListener('input', () => {
        const val = input.value;
        const cursor = input.selectionStart;
        // Find @ before cursor
        const before = val.substring(0, cursor);
        const atIdx = before.lastIndexOf('@');

        if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === ' ' || before[atIdx - 1] === '\n')) {
            const query = before.substring(atIdx + 1).toLowerCase();
            mentionStart = atIdx;
            const matches = _commentsStaff.filter(s => s.name.toLowerCase().includes(query)).slice(0, 6);

            if (matches.length) {
                dropdown.innerHTML = matches.map(s => `
                    <div class="mention-option" style="padding:8px 12px;cursor:pointer;font-size:0.85rem;transition:background 0.15s"
                        onmouseenter="this.style.background='rgba(255,255,255,0.1)'"
                        onmouseleave="this.style.background='transparent'"
                        onclick="_insertMention('${entityId}',${mentionStart},'${escHtml(s.name)}','${s.id}')">
                        <span style="font-weight:600">${escHtml(s.name)}</span>
                        <span style="color:var(--text-muted);margin-left:6px;font-size:0.72rem">${escHtml(s.role || '')}</span>
                    </div>
                `).join('');
                dropdown.classList.remove('hidden');
                return;
            }
        }
        dropdown.classList.add('hidden');
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dropdown.classList.add('hidden');
    });
}

// ── Insert mention into input ─────────────────────────────
function _insertMention(entityId, atIdx, name, userId) {
    const input = document.getElementById(`commentInput_${entityId}`);
    const dropdown = document.getElementById(`mentionDrop_${entityId}`);
    if (!input) return;

    const before = input.value.substring(0, atIdx);
    const after = input.value.substring(input.selectionStart);
    input.value = before + '@' + name + ' ' + after;
    dropdown.classList.add('hidden');
    input.focus();

    // Store mention metadata
    if (!input._mentions) input._mentions = [];
    input._mentions.push({ name, userId });
}

// ── Start reply to a comment ──────────────────────────────
let _replyToId = null;
function startReply(entityId, commentId, authorName) {
    _replyToId = commentId;
    const input = document.getElementById(`commentInput_${entityId}`);
    if (input) {
        input.value = `@${authorName} `;
        input.focus();
        input.placeholder = `Replying to ${authorName}...`;
    }
}

// ── Post a comment ────────────────────────────────────────
async function postComment(entityType, entityId) {
    const input = document.getElementById(`commentInput_${entityId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) { showToast('Comment cannot be empty', 'error'); return; }

    const userId = await getCurrentUserId();
    const mentions = (input._mentions || []).map(m => m.userId);

    const { error } = await window.supabase.from('internal_comments').insert({
        entity_type: entityType,
        entity_id: entityId,
        comment_text: text,
        mentions: mentions,
        parent_id: _replyToId || null,
        created_by: userId
    });

    if (error) { showToast('Failed to post: ' + error.message, 'error'); return; }

    // Create notifications for mentioned users
    for (const mentionedId of mentions) {
        if (mentionedId !== userId) {
            await window.supabase.from('notifications').insert({
                user_id: mentionedId,
                type: 'general',
                title: 'You were mentioned in a comment',
                body: text.substring(0, 120),
                link: `${entityType}s.html`,
                is_read: false
            });
        }
    }

    // Reset
    input.value = '';
    input.placeholder = 'Write a comment... use @ to mention';
    input._mentions = [];
    _replyToId = null;

    // Refresh comments
    const container = input.closest('.comments-section')?.parentElement;
    if (container) await renderComments(entityType, entityId, container);

    showToast('Comment posted');
}

// ── Auto-inject comment sections into drawers ─────────────
document.addEventListener('DOMContentLoaded', () => {
    _hookCommentsIntoDrawers();
});

function _hookCommentsIntoDrawers() {
    // Hook into lead drawer
    const origLeadDrawer = window.openLeadDrawer;
    if (typeof origLeadDrawer === 'function') {
        window.openLeadDrawer = async function(leadId) {
            await origLeadDrawer.call(this, leadId);
            // Append comments after drawer renders
            const body = document.getElementById('drawerBody');
            if (body) {
                const div = document.createElement('div');
                div.id = `commentsWrap_${leadId}`;
                div.style.marginTop = '20px';
                body.appendChild(div);
                await renderComments('lead', leadId, div);
            }
        };
    }

    // Hook into booking drawer
    const origBookingDrawer = window.openBookingDrawer;
    if (typeof origBookingDrawer === 'function') {
        window.openBookingDrawer = async function(bookingId) {
            await origBookingDrawer.call(this, bookingId);
            const body = document.getElementById('bDrawerBody');
            if (body) {
                const div = document.createElement('div');
                div.id = `commentsWrap_${bookingId}`;
                div.style.marginTop = '20px';
                body.appendChild(div);
                await renderComments('booking', bookingId, div);
            }
        };
    }
}
