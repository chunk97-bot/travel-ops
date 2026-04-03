// ============================================================
// auth.js — Auth guard + session + sidebar user
// ============================================================

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
        // Populate sidebar user info
        const userEl = document.getElementById('sidebarUser');
        if (userEl) {
            const { data: profile } = await window.supabase
                .from('staff_profiles')
                .select('name, role')
                .eq('id', session.user.id)
                .single();

            userEl.innerHTML = profile
                ? `<strong>${escHtml(profile.name)}</strong><br><span>${escHtml(profile.role)}</span>`
                : `<span>${escHtml(session.user.email)}</span>`;
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
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
    }
})();

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
