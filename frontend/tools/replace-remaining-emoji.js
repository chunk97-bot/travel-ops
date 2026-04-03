// replace-remaining-emoji.js — Clean up all remaining emoji across HTML + JS
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const jsDir = path.join(dir, 'js');

const icon = (name) => `<i data-lucide="${name}" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>`;

const MAP = {
  '\u{1F942}': icon('wine'),
  '\u{1F4E9}': icon('mail-open'),
  '\u{1F680}': icon('rocket'),
  '\u{1F4E8}': icon('mail-plus'),
  '\u{1F324}': icon('cloud-sun'),
  '\u{1F68C}': icon('bus'),
  '\u{1F37D}': icon('utensils'),
  '\u{1F552}': icon('clock-3'),
  '\u{1F53B}': icon('chevron-down'),
  '\u{1F4A4}': icon('moon'),
  '\u{1F4BE}': icon('save'),
  '\u{1F4C2}': icon('folder-open'),
  '\u{1F51C}': icon('arrow-right'),
  '\u{1F5BC}': icon('image'),
  '\u{1F4CD}': icon('map-pin'),
  '\u{1F5FA}': icon('map'),
  '\u{1F517}': icon('link'),
  '\u{1F5A8}': icon('printer'),
  '\u{1F4AC}': icon('message-circle'),
  '\u{1F4C5}': icon('calendar'),
  '\u{1F4E4}': icon('upload'),
  '\u{1F504}': icon('refresh-cw'),
  '\u{1F4C4}': icon('file'),
  '\u{1F9FE}': icon('file-text'),
  '\u{1F441}': icon('eye'),
  '\u{1F4CA}': icon('bar-chart-3'),
  '\u{1F4CB}': icon('clipboard-list'),
  '\u{1F4C8}': icon('trending-up'),
  '\u{1F4E5}': icon('download'),
  '\u{1F3C6}': icon('trophy'),
  '\u{1F4E6}': icon('package'),
  '\u{1F50D}': icon('search'),
  '\u{1F4E2}': icon('megaphone'),
  '\u{1F334}': icon('palm-tree'),
  '\u{1F91D}': icon('handshake'),
  '\u26A1': icon('zap'),
  '\u{1F534}': '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;vertical-align:middle"></span>',
  '\u{1F7E1}': '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b;vertical-align:middle"></span>',
  '\u{1F7E2}': '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;vertical-align:middle"></span>',
  '\u2715': '&times;',
  '\u2713': icon('check'),
  '\u2717': icon('x'),
  '\u26A0': icon('alert-triangle'),
  '\u2605': '<span style="color:#f59e0b">&#9733;</span>',
  '\u2606': '<span style="color:var(--text-muted)">&#9734;</span>',
  '\u2705': icon('check-circle'),
  '\u{1F4DE}': icon('phone'),
  '\u{1F4E7}': icon('mail'),
  '\u2708': icon('plane'),
};

let totalReplacements = 0;

// Process JS files
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'icons.js');
jsFiles.forEach(f => {
  const fp = path.join(jsDir, f);
  let content = fs.readFileSync(fp, 'utf8');
  let changed = false;
  for (const [emoji, replacement] of Object.entries(MAP)) {
    if (content.includes(emoji)) {
      content = content.split(emoji).join(replacement);
      changed = true;
      totalReplacements++;
    }
  }
  if (changed) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('JS updated: ' + f);
  }
});

// Process HTML files  
const htmlFiles = fs.readdirSync(dir).filter(f =>
  f.endsWith('.html') && !f.startsWith('batch') && f !== 'login.html' && f !== 'lead-capture.html' && f !== 'catalog-standalone.html'
);
htmlFiles.forEach(f => {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf8');
  let changed = false;
  for (const [emoji, replacement] of Object.entries(MAP)) {
    if (content.includes(emoji)) {
      content = content.split(emoji).join(replacement);
      changed = true;
      totalReplacements++;
    }
  }
  if (changed) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log('HTML updated: ' + f);
  }
});

console.log('\nTotal emoji types replaced: ' + totalReplacements);
