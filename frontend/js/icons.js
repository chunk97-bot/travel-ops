// ============================================================
// icons.js — Replace all emoji icons with Lucide SVGs
// Runs on DOMContentLoaded, replaces sidebar + stat + button emoji
// Requires: <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
// ============================================================

(function () {
    'use strict';

    // Emoji → Lucide icon name mapping
    const ICON_MAP = {
        // Sidebar navigation
        '📊': 'layout-dashboard',
        '🎯': 'target',
        '👥': 'users',
        '🗺': 'map',
        '📦': 'package',
        '🤝': 'handshake',
        '🧾': 'file-text',
        '🔔': 'bell',
        '📋': 'clipboard-list',
        '🗓': 'calendar-check',
        '❌': 'x-circle',
        '💸': 'wallet',
        '💼': 'briefcase',
        '📒': 'book-open',
        '🏛': 'landmark',
        '👤': 'user',
        '✉': 'mail',
        '📢': 'megaphone',
        '✅': 'square-check',
        '📁': 'folder',
        '📈': 'bar-chart-3',
        '⚙': 'settings',
        '✈': 'plane',
        // Stat cards + dashboard
        '💰': 'indian-rupee',
        '📊': 'layout-dashboard',
        '🔔': 'bell',
        '✅': 'square-check',
        '🧾': 'file-text',
        '📅': 'calendar',
        '🎂': 'cake',
        '⭐': 'star',
        // Action buttons
        '📥': 'download',
        '☰': 'list',
        '⊞': 'layout-grid',
        // Logo
        '✈️': 'plane',
        // Other
        '📄': 'file',
        '🔍': 'search',
        '➕': 'plus',
        '✏': 'pencil',
        '🗑': 'trash-2',
        '📞': 'phone',
        '📧': 'mail',
        '💬': 'message-circle',
        '🖨': 'printer',
        '📎': 'paperclip',
        '🔗': 'link',
        '↑': 'trending-up',
        '↓': 'trending-down',
        '⏱': 'timer',
        '⚡': 'zap',
        '🖼': 'image',
        '📍': 'map-pin',
        '👁': 'eye',
        '🔴': 'circle',
        '🟡': 'circle',
        '🟢': 'circle',
        '🏷': 'tag',
        '⬇': 'chevron-down',
        '⬆': 'chevron-up',
        '◀': 'chevron-left',
        '▶': 'chevron-right',
    };

    function replaceEmojiInElement(el) {
        const text = el.textContent.trim();
        const iconName = ICON_MAP[text];
        if (iconName) {
            el.innerHTML = '';
            const i = document.createElement('i');
            i.setAttribute('data-lucide', iconName);
            i.style.cssText = 'width:18px;height:18px;flex-shrink:0;';
            el.appendChild(i);
        }
    }

    function replaceNavIcons() {
        document.querySelectorAll('.nav-links li a > span').forEach(replaceEmojiInElement);
    }

    function replaceStatIcons() {
        document.querySelectorAll('.stat-icon').forEach(replaceEmojiInElement);
    }

    function replaceLogoIcon() {
        document.querySelectorAll('.logo-icon').forEach(el => {
            el.innerHTML = '';
            const i = document.createElement('i');
            i.setAttribute('data-lucide', 'plane');
            i.style.cssText = 'width:22px;height:22px;';
            el.appendChild(i);
        });
    }

    function replaceMenuToggle() {
        const menuBtn = document.getElementById('menuToggle');
        if (menuBtn && menuBtn.textContent.trim() === '☰') {
            menuBtn.innerHTML = '<i data-lucide="menu" style="width:18px;height:18px"></i>';
        }
    }

    function initIcons() {
        replaceNavIcons();
        replaceStatIcons();
        replaceLogoIcon();
        replaceMenuToggle();

        // Create Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initIcons);
    } else {
        initIcons();
    }

    // Expose for dynamic content re-render
    window._refreshIcons = function () {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // Auto-convert new data-lucide elements via MutationObserver
    if (typeof MutationObserver !== 'undefined' && typeof lucide !== 'undefined') {
        let _iconTimer = null;
        const obs = new MutationObserver(function () {
            // Debounce: batch rapid DOM changes into one createIcons call
            if (_iconTimer) clearTimeout(_iconTimer);
            _iconTimer = setTimeout(function () {
                const pending = document.querySelectorAll('i[data-lucide]:not([class*="lucide-"])');
                if (pending.length) lucide.createIcons();
            }, 50);
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }
})();
