// replace-html-emoji.js — Replace emoji in HTML files
const fs = require('fs');
const path = require('path');

const frontDir = path.join(__dirname, '..');
const i = '<i data-lucide="';
const s = '" style="width:18px;height:18px"></i>';

// Sidebar nav icon replacements (wrapped in <span>)
const navMap = {
    '<span>📊</span>': `<span>${i}layout-dashboard${s}</span>`,
    '<span>🎯</span>': `<span>${i}target${s}</span>`,
    '<span>👥</span>': `<span>${i}users${s}</span>`,
    '<span>🗺</span>': `<span>${i}map${s}</span>`,
    '<span>📦</span>': `<span>${i}package${s}</span>`,
    '<span>🤝</span>': `<span>${i}handshake${s}</span>`,
    '<span>🧾</span>': `<span>${i}file-text${s}</span>`,
    '<span>🔔</span>': `<span>${i}bell${s}</span>`,
    '<span>📋</span>': `<span>${i}clipboard-list${s}</span>`,
    '<span>🗓</span>': `<span>${i}calendar-check${s}</span>`,
    '<span>❌</span>': `<span>${i}x-circle${s}</span>`,
    '<span>💸</span>': `<span>${i}wallet${s}</span>`,
    '<span>💼</span>': `<span>${i}briefcase${s}</span>`,
    '<span>📒</span>': `<span>${i}book-open${s}</span>`,
    '<span>🏛</span>': `<span>${i}landmark${s}</span>`,
    '<span>👤</span>': `<span>${i}user${s}</span>`,
    '<span>✉</span>': `<span>${i}mail${s}</span>`,
    '<span>📢</span>': `<span>${i}megaphone${s}</span>`,
    '<span>✅</span>': `<span>${i}square-check${s}</span>`,
    '<span>📁</span>': `<span>${i}folder${s}</span>`,
    '<span>📈</span>': `<span>${i}bar-chart-3${s}</span>`,
    '<span>⚙</span>': `<span>${i}settings${s}</span>`,
};

// Logo icon
const logoMap = {
    '<span class="logo-icon">✈</span>': `<span class="logo-icon">${i}plane" style="width:22px;height:22px"></i></span>`,
};

// Stat card icons
const statMap = {
    '<div class="stat-icon">🎯</div>': `<div class="stat-icon">${i}target${s}</div>`,
    '<div class="stat-icon">🔔</div>': `<div class="stat-icon">${i}bell-ring${s}</div>`,
    '<div class="stat-icon">✅</div>': `<div class="stat-icon">${i}check-circle${s}</div>`,
    '<div class="stat-icon">💰</div>': `<div class="stat-icon">${i}indian-rupee${s}</div>`,
    '<div class="stat-icon">🧾</div>': `<div class="stat-icon">${i}file-text${s}</div>`,
    '<div class="stat-icon">📊</div>': `<div class="stat-icon">${i}trending-up${s}</div>`,
};

// Section headers with emoji
const sectionMap = {
    '🔔 Follow-up Reminders': 'Follow-up Reminders',
    '🎂 Birthdays & Anniversaries This Week': 'Birthdays & Anniversaries This Week',
    '💰 Pipeline Value': 'Pipeline Value',
    '⭐ Recent Feedback': 'Recent Feedback',
    '📅 Calendar': 'Calendar',
};

// Menu toggle
const menuMap = {
    '>☰</button>': `><i data-lucide="menu" style="width:18px;height:18px"></i></button>`,
};

// My Leads button
const buttonMap = {
    '👤 My Leads': 'My Leads',
    '📥 Import CSV': 'Import CSV',
    '🎯 Rescore All': 'Rescore All',
    '☰ Table': 'Table',
    '⊞ Kanban': 'Kanban',
};

const allMaps = [navMap, logoMap, statMap, sectionMap, menuMap, buttonMap];

let totalFiles = 0;
const files = fs.readdirSync(frontDir)
    .filter(f => f.endsWith('.html') && !f.startsWith('batch') && f !== 'login.html' && f !== 'lead-capture.html' && f !== 'catalog-standalone.html');

for (const file of files) {
    const filePath = path.join(frontDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    for (const map of allMaps) {
        for (const [find, replace] of Object.entries(map)) {
            if (content.includes(find)) {
                content = content.split(find).join(replace);
            }
        }
    }
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        totalFiles++;
        console.log(`Updated: ${file}`);
    }
}

console.log(`\nTotal HTML files updated: ${totalFiles}`);
