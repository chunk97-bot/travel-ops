// ============================================================
// auth.js — Auth guard + session + RBAC + notifications
// ============================================================

// ── Role cache (sessionStorage to avoid repeated DB calls) ────
const _ROLE_KEY = 'travelops_role';
const _NAME_KEY = 'travelops_name';

async function getCurrentUserRole() {
    const cached = sessionStorage.getItem(_ROLE_KEY);
    if (cached) return cached;
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return null;
    const { data: profile } = await window.supabase
        .from('staff_profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
    const role = profile?.role || 'sales';
    sessionStorage.setItem(_ROLE_KEY, role);
    return role;
}

function hasRole(...roles) {
    const userRole = sessionStorage.getItem(_ROLE_KEY);
    return roles.includes(userRole);
}

// Redirect away if caller's role is not in the allowed list
async function requireRole(...allowedRoles) {
    const role = await getCurrentUserRole();
    if (!allowedRoles.includes(role)) {
        showToast('Access denied — insufficient permissions', 'error');
        setTimeout(() => { window.location.href = 'index.html'; }, 1200);
        return false;
    }
    return true;
}

// ── Audit log helper ─────────────────────────────────────────
async function logAudit(action, tableName = null, recordId = null, metadata = null) {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return;
    await window.supabase.from('audit_log').insert({
        user_id: session.user.id,
        action,
        table_name: tableName,
        record_id: recordId,
        metadata
    });
}

(async function initAuth() {
    const { data: { session } } = await window.supabase.auth.getSession();
    const currentPage = window.location.pathname.split('/').pop();

    if (!session && currentPage !== 'login.html') {
        window.location.href = 'login.html';
        return;
    }

    if (session && currentPage === 'login.html') {
        window.location.href = 'index.html';
        return;
    }

    if (session) {
        // Fetch profile once and cache
        const { data: profile } = await window.supabase
            .from('staff_profiles')
            .select('name, role, is_active')
            .eq('id', session.user.id)
            .single();

        if (profile) {
            sessionStorage.setItem(_ROLE_KEY, profile.role || 'sales');
            sessionStorage.setItem(_NAME_KEY, profile.name || '');
        }

        // Populate sidebar user info + role badge
        const userEl = document.getElementById('sidebarUser');
        if (userEl) {
            const role = profile?.role || 'sales';
            const roleColors = { admin: '#ef4444', sales: '#3b82f6', accounts: '#10b981', operations: '#f59e0b' };
            userEl.innerHTML = profile
                ? `<strong>${escHtml(profile.name)}</strong>
                   <br><span style="font-size:0.7rem;background:${roleColors[role]||'#6b7280'};color:#fff;padding:1px 6px;border-radius:4px;text-transform:uppercase;">${escHtml(role)}</span>`
                : `<span>${escHtml(session.user.email)}</span>`;
        }

        // Inject notification bell into top-bar-right
        _injectNotificationBell(session.user.id);

        // Inject new nav items into sidebar (if sidebar exists)
        _injectNewNavItems();

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                sessionStorage.removeItem(_ROLE_KEY);
                sessionStorage.removeItem(_NAME_KEY);
                logAudit('logout');
                await window.supabase.auth.signOut();
                window.location.href = 'login.html';
            });
        }

        // Mobile menu toggle
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        }

        // Date display
        const dateEl = document.getElementById('dateDisplay');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        }

        // Log this page visit (no await — non-blocking)
        logAudit('view', null, null, { page: currentPage });
    }
})();

// ── Inject notification bell ─────────────────────────────────
function _injectNotificationBell(userId) {
    const topBarRight = document.querySelector('.top-bar-right');
    if (!topBarRight || document.getElementById('notifBell')) return;

    const bellWrapper = document.createElement('div');
    bellWrapper.id = 'notifBellWrapper';
    bellWrapper.style.cssText = 'position:relative;display:inline-block;margin-right:12px;';
    bellWrapper.innerHTML = `
        <button id="notifBell" title="Notifications" style="
            background:transparent;border:1px solid var(--border);border-radius:8px;
            padding:6px 10px;cursor:pointer;color:var(--text);font-size:1rem;position:relative;">
            🔔 <span id="notifCount" style="
                position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;
                border-radius:50%;font-size:0.65rem;font-weight:700;
                min-width:16px;height:16px;line-height:16px;text-align:center;
                display:none;padding:0 3px;"></span>
        </button>
        <div id="notifDropdown" style="
            display:none;position:absolute;right:0;top:44px;width:320px;
            background:var(--surface,#1e293b);border:1px solid var(--border);
            border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.4);
            z-index:1000;overflow:hidden;">
            <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                <strong style="font-size:0.9rem;">Notifications</strong>
                <button id="markAllReadBtn" style="background:transparent;border:none;color:var(--primary);font-size:0.75rem;cursor:pointer;">Mark all read</button>
            </div>
            <div id="notifList" style="max-height:360px;overflow-y:auto;padding:8px 0;"></div>
        </div>`;
    topBarRight.insertBefore(bellWrapper, topBarRight.firstChild);

    // Load count
    _loadNotifCount(userId);

    // Toggle dropdown
    document.getElementById('notifBell').addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('notifDropdown');
        if (dd.style.display === 'none') {
            dd.style.display = 'block';
            _loadNotifList(userId);
        } else {
            dd.style.display = 'none';
        }
    });
    document.addEventListener('click', () => {
        const dd = document.getElementById('notifDropdown');
        if (dd) dd.style.display = 'none';
    });
    document.getElementById('markAllReadBtn')?.addEventListener('click', async () => {
        await window.supabase.from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);
        _loadNotifCount(userId);
        document.getElementById('notifList').innerHTML = '<p style="padding:16px;color:var(--text-muted);font-size:0.85rem;">All caught up! ✅</p>';
    });
}

async function _loadNotifCount(userId) {
    const { count } = await window.supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('is_read', false);
    const badge = document.getElementById('notifCount');
    if (!badge) return;
    if (count > 0) { badge.style.display = 'inline-block'; badge.textContent = count > 99 ? '99+' : count; }
    else badge.style.display = 'none';
}

async function _loadNotifList(userId) {
    const listEl = document.getElementById('notifList');
    if (!listEl) return;
    listEl.innerHTML = '<p style="padding:16px;font-size:0.85rem;color:var(--text-muted);">Loading...</p>';
    const { data } = await window.supabase.from('notifications')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (!data || data.length === 0) {
        listEl.innerHTML = '<p style="padding:16px;color:var(--text-muted);font-size:0.85rem;">No notifications</p>';
        return;
    }
    listEl.innerHTML = data.map(n => `
        <div onclick="window.location.href='${escHtml(n.link||'#')}'" style="
            padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);
            background:${n.is_read ? 'transparent' : 'rgba(99,102,241,0.06)'};
            transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='${n.is_read ? 'transparent' : 'rgba(99,102,241,0.06)'}'">
            <div style="font-size:0.85rem;font-weight:${n.is_read ? '400' : '600'};">${escHtml(n.title)}</div>
            ${n.body ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${escHtml(n.body)}</div>` : ''}
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">${formatDate(n.created_at)}</div>
        </div>`).join('');
    // Mark loaded ones as read
    await window.supabase.from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId).eq('is_read', false);
    _loadNotifCount(userId);
}

// ── Inject new nav items into existing pages ─────────────────
function _injectNewNavItems() {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    const currentPage = window.location.pathname.split('/').pop();
    const newItems = [
        { href: 'quotations.html', icon: '📋', label: 'Quotations' },
        { href: 'bookings.html',   icon: '🗓',  label: 'Bookings' },
        { href: 'cancellations.html', icon: '❌', label: 'Cancellations' },
        { href: 'expenses.html',   icon: '💸',  label: 'Expenses' },
        { href: 'receipts.html',   icon: '🧾',  label: 'Receipts' },
        { href: 'vendor-payments.html', icon: '💼', label: 'Vendor Payments' },
        { href: 'vendor-ledger.html', icon: '📒', label: 'Vendor Ledger' },
        { href: 'tcs-tracker.html', icon: '🏛',  label: 'TCS Tracker' },
        { href: 'staff.html',      icon: '👤',  label: 'Staff' },
        { href: 'templates.html',  icon: '✉',   label: 'Templates' },
        { href: 'campaigns.html',  icon: '📢',  label: 'Campaigns' },
        { href: 'task-board.html', icon: '✅',  label: 'Task Board' },
        { href: 'documents.html',  icon: '📁',  label: 'Documents' },
        { href: 'reports.html',    icon: '📈',  label: 'Reports' },
        { href: 'settings.html',   icon: '⚙',   label: 'Settings' },
    ];
    const existingHrefs = Array.from(navLinks.querySelectorAll('a')).map(a => a.getAttribute('href'));
    newItems.forEach(item => {
        if (!existingHrefs.includes(item.href)) {
            const li = document.createElement('li');
            li.className = currentPage === item.href ? 'active' : '';
            li.innerHTML = `<a href="${escHtml(item.href)}"><span>${item.icon}</span> ${escHtml(item.label)}</a>`;
            navLinks.appendChild(li);
        }
    });
}

// XSS helper
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Format currency in INR
function formatINR(amount) {
    if (!amount && amount !== 0) return '—';
    return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Format date DD-MMM-YYYY
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Badge HTML for lead stages
function stageBadge(stage) {
    const labels = { new:'New', contacted:'Contacted', quoted:'Quoted', negotiating:'Negotiating', confirmed:'Confirmed', lost:'Lost', cancelled:'Cancelled' };
    return `<span class="badge badge-${escHtml(stage)}">${escHtml(labels[stage] || stage)}</span>`;
}

// Badge HTML for invoice status
function invoiceBadge(status) {
    return `<span class="badge badge-${escHtml(status)}">${escHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
}

// Get current logged-in user id
async function getCurrentUserId() {
    const { data: { session } } = await window.supabase.auth.getSession();
    return session?.user?.id || null;
}

// Get all staff for dropdowns
async function loadStaffOptions(selectEl, includeAll = true) {
    const { data } = await window.supabase.from('staff_profiles').select('id, name').eq('is_active', true).order('name');
    if (!data) return;
    if (includeAll) selectEl.innerHTML = '<option value="">All Staff</option>';
    else selectEl.innerHTML = '<option value="">Assign to...</option>';
    data.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        selectEl.appendChild(opt);
    });
}

// Close modal helpers
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function openDrawer(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeDrawer(id) { document.getElementById(id)?.classList.add('hidden'); }

// Show toast notification
function showToast(message, type = 'success') {
    const existing = document.getElementById('toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
        color: #fff; padding: 12px 20px; border-radius: 8px;
        font-size: 0.9rem; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        animation: slideIn 0.2s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
