// ============================================================
// theme-toggle.js — Dark/Light Theme Toggle
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

    if (theme === 'light') {
        document.documentElement.style.setProperty('--bg-dark', '#f1f5f9');
        document.documentElement.style.setProperty('--bg-card', '#ffffff');
        document.documentElement.style.setProperty('--bg-hover', '#e2e8f0');
        document.documentElement.style.setProperty('--bg-input', '#f8fafc');
        document.documentElement.style.setProperty('--text-primary', '#0f172a');
        document.documentElement.style.setProperty('--text-muted', '#64748b');
        document.documentElement.style.setProperty('--border', 'rgba(0,0,0,0.1)');
        document.documentElement.style.setProperty('--shadow', '0 4px 16px rgba(0,0,0,0.08)');
    } else {
        document.documentElement.style.setProperty('--bg-dark', '#0f1117');
        document.documentElement.style.setProperty('--bg-card', '#1a1d27');
        document.documentElement.style.setProperty('--bg-hover', '#22263a');
        document.documentElement.style.setProperty('--bg-input', '#12151f');
        document.documentElement.style.setProperty('--text-primary', '#f1f5f9');
        document.documentElement.style.setProperty('--text-muted', '#94a3b8');
        document.documentElement.style.setProperty('--border', 'rgba(255,255,255,0.08)');
        document.documentElement.style.setProperty('--shadow', '0 4px 16px rgba(0,0,0,0.3)');
    }
}

function toggleTheme() {
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);

    // Update toggle button icon
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';

    // Persist to DB (non-blocking)
    (async () => {
        const userId = await getCurrentUserId();
        if (userId) {
            await window.supabase.from('staff_profiles').update({ theme: next }).eq('id', userId);
        }
    })();
}

function injectThemeToggle() {
    const topBarRight = document.querySelector('.top-bar-right');
    if (!topBarRight || document.getElementById('themeToggleBtn')) return;

    const current = localStorage.getItem(THEME_KEY) || 'dark';
    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.title = 'Toggle Dark/Light Mode';
    btn.textContent = current === 'dark' ? '🌙' : '☀️';
    btn.style.cssText = 'background:transparent;border:1px solid var(--border);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:1rem;color:var(--text-primary);transition:background 0.2s;';
    btn.addEventListener('click', toggleTheme);
    btn.addEventListener('mouseover', () => btn.style.background = 'var(--bg-hover)');
    btn.addEventListener('mouseout', () => btn.style.background = 'transparent');
    topBarRight.insertBefore(btn, topBarRight.firstChild);
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
                if (btn) btn.textContent = data.theme === 'dark' ? '🌙' : '☀️';
            }
        } catch (_) { /* theme column may not exist */ }
    })();
});
