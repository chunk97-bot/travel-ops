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

// ============================================================
// FEATURE #10 — Global Search (across all modules)
// ============================================================
(function initGlobalSearch() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'globalSearchWrap';
    wrapper.style.cssText = 'position:relative;margin:0 16px;flex:1;max-width:360px;';
    wrapper.innerHTML = `
        <input type="text" id="globalSearchInput" placeholder="Search leads, clients, invoices..."
            autocomplete="off"
            style="width:100%;padding:7px 12px 7px 32px;border-radius:8px;border:1px solid var(--border);
            background:var(--bg-input);color:var(--text-primary);font-size:0.85rem;">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:0.9rem;pointer-events:none">🔍</span>
        <div id="globalSearchResults" style="display:none;position:absolute;top:40px;left:0;right:0;
            background:var(--surface,#1e293b);border:1px solid var(--border);border-radius:10px;
            box-shadow:0 8px 30px rgba(0,0,0,0.4);z-index:1001;max-height:400px;overflow-y:auto;"></div>`;
    const title = topBar.querySelector('.page-title');
    if (title) title.after(wrapper); else topBar.prepend(wrapper);

    let _searchTimeout;
    document.getElementById('globalSearchInput').addEventListener('input', (e) => {
        clearTimeout(_searchTimeout);
        const q = e.target.value.trim();
        if (q.length < 2) { document.getElementById('globalSearchResults').style.display = 'none'; return; }
        _searchTimeout = setTimeout(() => _runGlobalSearch(q), 300);
    });
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) document.getElementById('globalSearchResults').style.display = 'none';
    });
    // Keyboard shortcut: Ctrl+K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('globalSearchInput').focus(); }
    });
})();

async function _runGlobalSearch(query) {
    const results = document.getElementById('globalSearchResults');
    results.style.display = 'block';
    results.innerHTML = '<p style="padding:12px;color:var(--text-muted);font-size:0.85rem">Searching...</p>';

    const like = `%${query}%`;
    const [leads, clients, invoices, bookings, vendors, quotations] = await Promise.all([
        window.supabase.from('leads').select('id, name, phone, destination, stage').or(`name.ilike.${like},phone.ilike.${like},destination.ilike.${like}`).limit(5),
        window.supabase.from('clients').select('id, name, phone, email').or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(5),
        window.supabase.from('invoices').select('id, invoice_number, clients(name), total_amount').or(`invoice_number.ilike.${like}`).limit(5),
        window.supabase.from('bookings').select('id, booking_ref, destination, clients(name), status').or(`booking_ref.ilike.${like},destination.ilike.${like}`).limit(5),
        window.supabase.from('vendors').select('id, name, category, city').or(`name.ilike.${like},category.ilike.${like},city.ilike.${like}`).limit(5),
        window.supabase.from('quotations').select('id, quote_number, clients(name), total_amount, status').or(`quote_number.ilike.${like}`).limit(4),
    ]);

    let html = '';
    if (leads.data?.length) {
        html += '<div style="padding:6px 12px;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Leads</div>';
        html += leads.data.map(l => `
            <a href="leads.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--border)"
               onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:1.1rem">🎯</span>
                <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">${escHtml(l.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(l.destination||'')} · ${escHtml(l.stage)}</div></div>
            </a>`).join('');
    }
    if (clients.data?.length) {
        html += '<div style="padding:6px 12px;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Clients</div>';
        html += clients.data.map(c => `
            <a href="clients.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--border)"
               onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:1.1rem">👥</span>
                <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">${escHtml(c.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(c.phone||'')} ${c.email ? '· '+escHtml(c.email) : ''}</div></div>
            </a>`).join('');
    }
    if (invoices.data?.length) {
        html += '<div style="padding:6px 12px;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Invoices</div>';
        html += invoices.data.map(i => `
            <a href="invoices.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--border)"
               onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:1.1rem">🧾</span>
                <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">${escHtml(i.invoice_number)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(i.clients?.name||'')} · ${formatINR(i.total_amount)}</div></div>
            </a>`).join('');
    }
    if (bookings.data?.length) {
        html += '<div style="padding:6px 12px;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Bookings</div>';
        html += bookings.data.map(b => `
            <a href="bookings.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--border)"
               onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:1.1rem">🗓</span>
                <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">${escHtml(b.booking_ref)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(b.clients?.name||'')} · ${escHtml(b.destination||'')} · ${escHtml(b.status)}</div></div>
            </a>`).join('');
    }
    if (vendors.data?.length) {
        html += '<div style="padding:6px 12px;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Vendors</div>';
        html += vendors.data.map(v => `
            <a href="vendors.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--border)"
               onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:1.1rem">🤝</span>
                <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">${escHtml(v.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(v.category||'')} ${v.city ? '· '+escHtml(v.city) : ''}</div></div>
            </a>`).join('');
    }
    if (quotations.data?.length) {
        html += '<div style="padding:6px 12px;font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;font-weight:700">Quotations</div>';
        html += quotations.data.map(q => `
            <a href="quotations.html" style="display:flex;align-items:center;gap:8px;padding:8px 12px;text-decoration:none;color:var(--text-primary);border-bottom:1px solid var(--border)"
               onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <span style="font-size:1.1rem">📋</span>
                <div style="flex:1"><div style="font-weight:600;font-size:0.85rem">${escHtml(q.quote_number)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${escHtml(q.clients?.name||'')} · ${formatINR(q.total_amount)}</div></div>
            </a>`).join('');
    }
    if (!html) html = '<p style="padding:16px;color:var(--text-muted);font-size:0.85rem;text-align:center">No results found</p>';
    html += '<div style="padding:8px 12px;text-align:center;font-size:0.72rem;color:var(--text-muted)">Ctrl+K to search</div>';
    results.innerHTML = html;
}
let CURRENCY_RATES = {
    INR: 1, USD: 85.5, EUR: 92.3, GBP: 108.2, AED: 23.3,
    SGD: 63.5, THB: 2.45, MYR: 18.9, AUD: 55.2, JPY: 0.57,
    SAR: 22.8, CHF: 96.5, CAD: 62.1, NZD: 50.8, LKR: 0.28,
    IDR: 0.0054, PHP: 1.5, VND: 0.0035, KRW: 0.0625, ZAR: 4.65
};
let CURRENCY_SYMBOLS = {
    INR:'₹', USD:'$', EUR:'€', GBP:'£', AED:'د.إ', SGD:'S$', THB:'฿',
    MYR:'RM', AUD:'A$', JPY:'¥', SAR:'ر.س', CHF:'CHF', CAD:'C$',
    NZD:'NZ$', LKR:'Rs', IDR:'Rp', PHP:'₱', VND:'₫', KRW:'₩', ZAR:'R'
};

// Load rates from DB on startup (falls back to hardcoded)
(async function loadCurrencyRates() {
    try {
        const { data } = await window.supabase.from('currency_rates').select('currency, rate_to_inr, symbol');
        if (data && data.length) {
            data.forEach(r => {
                CURRENCY_RATES[r.currency] = parseFloat(r.rate_to_inr);
                if (r.symbol) CURRENCY_SYMBOLS[r.currency] = r.symbol;
            });
        }
    } catch (_) { /* fallback to hardcoded rates */ }
})();

function formatCurrency(amount, currency) {
    if (!amount && amount !== 0) return '—';
    if (!currency || currency === 'INR') return formatINR(amount);
    const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';
    return sym + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function convertToINR(amount, fromCurrency) {
    if (!fromCurrency || fromCurrency === 'INR') return amount;
    return amount * (CURRENCY_RATES[fromCurrency] || 1);
}
function convertFromINR(amountINR, toCurrency) {
    if (!toCurrency || toCurrency === 'INR') return amountINR;
    return amountINR / (CURRENCY_RATES[toCurrency] || 1);
}
function getExchangeRate(currency) {
    return CURRENCY_RATES[currency] || 1;
}
function getCurrencyOptions() {
    return Object.keys(CURRENCY_RATES).sort();
}
function buildCurrencySelect(selectEl, selected = 'INR') {
    if (!selectEl) return;
    selectEl.innerHTML = getCurrencyOptions().map(c =>
        `<option value="${c}" ${c === selected ? 'selected' : ''}>${c} (${CURRENCY_SYMBOLS[c] || c})</option>`
    ).join('');
}

// ============================================================
// Approval Workflows
// ============================================================
const APPROVAL_THRESHOLDS = {
    expense: 50000,           // Expenses above ₹50,000
    vendor_payment: 200000,   // Vendor payments above ₹2,00,000
    invoice: 500000,          // Invoices above ₹5,00,000
    quotation_discount: 15,   // Quotation discount above 15%
    refund: 100000,           // Refunds above ₹1,00,000
    commission: 25000,        // Commission above ₹25,000
};

async function needsApproval(type, amount) {
    const threshold = APPROVAL_THRESHOLDS[type];
    if (!threshold) return false;
    const role = await getCurrentUserRole();
    // Admins and managers bypass approval
    if (role === 'admin' || role === 'manager' || role === 'owner') return false;
    return amount > threshold;
}

async function requestApproval(type, recordId, amount, notes = '') {
    const userId = await getCurrentUserId();
    const { data, error } = await window.supabase.from('approval_requests').insert({
        type,
        record_id: recordId,
        requested_by: userId,
        amount,
        notes: notes || null,
        status: 'pending',
    }).select('id').single();
    if (error) { showToast('Approval request failed: ' + error.message, 'error'); return null; }
    showToast(`Approval requested (₹${amount?.toLocaleString('en-IN')}). Awaiting manager approval.`, 'info');
    return data?.id;
}

async function loadPendingApprovals() {
    const role = await getCurrentUserRole();
    if (role !== 'admin' && role !== 'manager' && role !== 'owner') return [];
    const { data } = await window.supabase
        .from('approval_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    return data || [];
}

async function approveRequest(approvalId) {
    const userId = await getCurrentUserId();
    const { error } = await window.supabase.from('approval_requests').update({
        status: 'approved', reviewed_by: userId, reviewed_at: new Date().toISOString(),
    }).eq('id', approvalId);
    if (error) { showToast('Approval failed: ' + error.message, 'error'); return false; }
    showToast('Approved!');
    return true;
}

async function rejectRequest(approvalId, reviewNotes = '') {
    const userId = await getCurrentUserId();
    const { error } = await window.supabase.from('approval_requests').update({
        status: 'rejected', reviewed_by: userId, reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes || null,
    }).eq('id', approvalId);
    if (error) { showToast('Rejection failed: ' + error.message, 'error'); return false; }
    showToast('Request rejected');
    return true;
}

// Show approval panel in notification bell area (for managers/admins)
async function renderApprovalBadge() {
    const pending = await loadPendingApprovals();
    if (!pending.length) return;
    const badge = document.getElementById('approvalBadge');
    if (badge) {
        badge.textContent = pending.length;
        badge.style.display = 'inline-flex';
        badge.title = `${pending.length} pending approval(s)`;
    }
}
