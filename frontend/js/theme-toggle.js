// ============================================================
// theme-toggle.js — Dark/Light Theme Toggle (v2 — CSS-based)
// ============================================================

const THEME_KEY = 'travelops_theme';

function initThemeToggle() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
    injectThemeToggle();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);

    // Update toggle button icon
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
        const iconEl = btn.querySelector('[data-lucide]');
        if (iconEl) {
            iconEl.setAttribute('data-lucide', next === 'dark' ? 'moon' : 'sun');
            if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [btn] });
        } else {
            btn.textContent = next === 'dark' ? '<i data-lucide="moon" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="sun" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>';
        }
    }

    // Persist to DB (non-blocking)
    (async () => {
        try {
            const userId = await getCurrentUserId();
            if (userId) {
                await window.supabase.from('staff_profiles').update({ theme: next }).eq('id', userId);
            }
        } catch (_) {}
    })();
}

function injectThemeToggle() {
    const topBarRight = document.querySelector('.top-bar-right');
    if (!topBarRight || document.getElementById('themeToggleBtn')) return;

    const current = localStorage.getItem(THEME_KEY) || 'dark';
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'btn-icon';
    btn.title = 'Toggle Dark/Light Mode';
    btn.style.cssText = 'border:1px solid var(--border);border-radius:8px;padding:7px 9px;display:inline-flex;align-items:center;justify-content:center;';

    // Use Lucide icon if available, fallback to emoji
    if (typeof lucide !== 'undefined') {
        btn.innerHTML = `<i data-lucide="${current === 'dark' ? 'moon' : 'sun'}" style="width:16px;height:16px"></i>`;
        btn.addEventListener('click', toggleTheme);
        topBarRight.insertBefore(btn, topBarRight.firstChild);
        lucide.createIcons({ nodes: [btn] });
    } else {
        btn.textContent = current === 'dark' ? '<i data-lucide="moon" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="sun" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>';
        btn.addEventListener('click', toggleTheme);
        topBarRight.insertBefore(btn, topBarRight.firstChild);
    }
}

// Auto-init on page load
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    // Load saved theme from DB
    (async () => {
        try {
            const userId = await getCurrentUserId();
            if (!userId) return;
            const { data } = await window.supabase.from('staff_profiles').select('theme').eq('id', userId).single();
            if (data?.theme && data.theme !== (localStorage.getItem(THEME_KEY) || 'dark')) {
                applyTheme(data.theme);
                const btn = document.getElementById('themeToggleBtn');
                if (btn) {
                    const iconEl = btn.querySelector('[data-lucide]');
                    if (iconEl) {
                        iconEl.setAttribute('data-lucide', data.theme === 'dark' ? 'moon' : 'sun');
                        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [btn] });
                    } else {
                        btn.textContent = data.theme === 'dark' ? '<i data-lucide="moon" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="sun" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>';
                    }
                }
            }
        } catch (_) { /* theme column may not exist */ }
    })();
});
