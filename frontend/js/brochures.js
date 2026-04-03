// ============================================================
// brochures.js — White-label Brochure Builder
// ============================================================

let allBrochures = [];
let editingBrId = null;
let sectionCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    await loadClientOptions();
    await loadBrochures();

    document.getElementById('newBrochureBtn')?.addEventListener('click', openNewBrochure);
    document.getElementById('closeBrochureModal')?.addEventListener('click', () => closeModal('brochureModal'));
    document.getElementById('cancelBrochureBtn')?.addEventListener('click', () => closeModal('brochureModal'));
    document.getElementById('brochureModalOverlay')?.addEventListener('click', () => closeModal('brochureModal'));
    document.getElementById('brochureForm')?.addEventListener('submit', saveBrochure);
    document.getElementById('addSectionBtn')?.addEventListener('click', addSection);
    document.getElementById('searchBrochures')?.addEventListener('input', filterAndRender);
    document.getElementById('filterStyle')?.addEventListener('change', filterAndRender);
});

// ── Load Options ──────────────────────────────────────────
async function loadClientOptions() {
    const { data } = await window.supabase.from('clients').select('id, name').order('name');
    const opts = (data || []).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    document.getElementById('brClient').innerHTML = '<option value="">None</option>' + opts;
}

// ── Load Brochures ────────────────────────────────────────
async function loadBrochures() {
    const { data, error } = await window.supabase
        .from('brochures')
        .select('*, clients(name)')
        .order('created_at', { ascending: false });
    if (error) { showToast('Failed to load brochures', 'error'); return; }
    allBrochures = data || [];
    filterAndRender();
}

// ── Filter + Render ───────────────────────────────────────
function filterAndRender() {
    const search = document.getElementById('searchBrochures')?.value.toLowerCase() || '';
    const style = document.getElementById('filterStyle')?.value || '';

    let filtered = allBrochures.filter(b => {
        if (style && b.template_style !== style) return false;
        if (search) {
            const hay = [b.name, b.destination, b.clients?.name].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    renderStats(filtered);
    renderGrid(filtered);
}

// ── Stats ─────────────────────────────────────────────────
function renderStats(items) {
    const total = items.length;
    const shared = items.filter(b => b.is_public).length;
    const views = items.reduce((s, b) => s + (b.views_count || 0), 0);

    document.getElementById('brochureStats').innerHTML = `
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Brochures</div></div>
        <div class="stat-card"><div class="stat-value">${shared}</div><div class="stat-label">Shared</div></div>
        <div class="stat-card"><div class="stat-value">${views}</div><div class="stat-label">Total Views</div></div>
    `;
}

// ── Render Brochure Cards ─────────────────────────────────
function renderGrid(items) {
    const grid = document.getElementById('brochuresGrid');
    if (!items.length) {
        grid.innerHTML = '<p style="color:var(--text-muted);grid-column:span 3;text-align:center;padding:40px">No brochures yet. Click <strong>+ Create Brochure</strong> to get started.</p>';
        return;
    }

    const STYLE_COLORS = { classic: '#0078C8', modern: '#6366f1', luxury: '#d4a853', adventure: '#22c55e', minimal: '#71717a' };

    grid.innerHTML = items.map(b => {
        const color = b.primary_color || STYLE_COLORS[b.template_style] || '#0078C8';
        return `
        <div class="brochure-card" style="background:var(--bg-surface,rgba(255,255,255,0.05));border-radius:12px;overflow:hidden;border:1px solid var(--border,rgba(255,255,255,0.1))">
            <div style="height:120px;background:${b.cover_image_url ? `url('${escHtml(b.cover_image_url)}') center/cover` : `linear-gradient(135deg, ${color}, ${color}88)`};display:flex;align-items:flex-end;padding:12px">
                <span style="background:rgba(0,0,0,0.6);color:#fff;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600">${escHtml(b.template_style || 'classic')}</span>
            </div>
            <div style="padding:14px">
                <h3 style="margin:0 0 4px;font-size:1rem">${escHtml(b.name)}</h3>
                <p style="color:var(--text-muted);font-size:0.82rem;margin:0 0 8px">
                    ${b.destination ? `<i data-lucide="map-pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(b.destination)}` : ''}
                    ${b.clients?.name ? ` · <i data-lucide="user" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(b.clients.name)}` : ''}
                </p>
                ${b.total_price ? `<p style="font-weight:600;font-size:1.1rem;margin:0 0 8px">${b.currency || 'INR'} ${Number(b.total_price).toLocaleString()}</p>` : ''}
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn-primary" style="padding:4px 10px;font-size:0.75rem" onclick="editBrochure('${b.id}')">Edit</button>
                    <button class="btn-secondary" style="padding:4px 10px;font-size:0.75rem" onclick="previewSaved('${b.id}')">Preview</button>
                    <button class="btn-secondary" style="padding:4px 10px;font-size:0.75rem" onclick="shareBrochure('${b.id}')">Share</button>
                    <button class="btn-secondary" style="padding:4px 10px;font-size:0.75rem;color:#f44336" onclick="deleteBrochure('${b.id}')">Delete</button>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.72rem;color:var(--text-muted)">
                    <span>${formatDate(b.created_at)}</span>
                    <span><i data-lucide="eye" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${b.views_count || 0} views</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Open New Brochure ─────────────────────────────────────
function openNewBrochure() {
    editingBrId = null;
    document.getElementById('brochureModalTitle').textContent = 'Create Brochure';
    document.getElementById('brochureForm').reset();
    document.getElementById('brColor').value = '#0078C8';
    document.getElementById('brSections').innerHTML = '';
    sectionCount = 0;
    addSection(); // Start with one section
    document.getElementById('brochureModalOverlay').classList.remove('hidden');
}

// ── Edit Brochure ─────────────────────────────────────────
function editBrochure(id) {
    const b = allBrochures.find(x => x.id === id);
    if (!b) return;
    editingBrId = id;
    document.getElementById('brochureModalTitle').textContent = 'Edit Brochure';
    document.getElementById('brName').value = b.name || '';
    document.getElementById('brDestination').value = b.destination || '';
    document.getElementById('brClient').value = b.client_id || '';
    document.getElementById('brStyle').value = b.template_style || 'classic';
    document.getElementById('brLogo').value = b.agency_logo_url || '';
    document.getElementById('brCover').value = b.cover_image_url || '';
    document.getElementById('brColor').value = b.primary_color || '#0078C8';
    document.getElementById('brPrice').value = b.total_price || '';
    document.getElementById('brCurrency').value = b.currency || 'INR';
    document.getElementById('brInclusions').value = b.inclusions || '';
    document.getElementById('brExclusions').value = b.exclusions || '';
    document.getElementById('brTerms').value = b.terms || '';

    // Restore sections
    document.getElementById('brSections').innerHTML = '';
    sectionCount = 0;
    const sections = b.sections || [];
    if (sections.length) {
        sections.forEach(sec => addSection(sec));
    } else {
        addSection();
    }

    document.getElementById('brochureModalOverlay').classList.remove('hidden');
}

// ── Add Section ───────────────────────────────────────────
function addSection(data = {}) {
    sectionCount++;
    const idx = sectionCount;
    const div = document.createElement('div');
    div.className = 'br-section';
    div.id = `brSec_${idx}`;
    div.style.cssText = 'background:var(--bg-surface,rgba(255,255,255,0.05));border-radius:8px;padding:12px;margin-bottom:8px;border:1px solid var(--border,rgba(255,255,255,0.1))';
    div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:0.85rem">Section ${idx}</strong>
            <button type="button" class="btn-icon" style="font-size:0.85rem;color:#f44336" onclick="document.getElementById('brSec_${idx}').remove()">&times;</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="form-group">
                <label style="font-size:0.78rem">Title</label>
                <input type="text" class="form-input sec-title" value="${escHtml(data.title || '')}" placeholder="e.g. Day 1: Arrival">
            </div>
            <div class="form-group">
                <label style="font-size:0.78rem">Subtitle</label>
                <input type="text" class="form-input sec-subtitle" value="${escHtml(data.subtitle || '')}" placeholder="e.g. Airport → Hotel">
            </div>
        </div>
        <div class="form-group" style="margin-top:6px">
            <label style="font-size:0.78rem">Description</label>
            <textarea class="form-input sec-desc" rows="2" placeholder="Activities, highlights...">${escHtml(data.description || '')}</textarea>
        </div>
        <div class="form-group" style="margin-top:6px">
            <label style="font-size:0.78rem">Image URL</label>
            <input type="url" class="form-input sec-image" value="${escHtml(data.image || '')}" placeholder="https://...">
        </div>
    `;
    document.getElementById('brSections').appendChild(div);
}

// ── Gather Sections ───────────────────────────────────────
function gatherSections() {
    const sections = [];
    document.querySelectorAll('.br-section').forEach(el => {
        const title = el.querySelector('.sec-title')?.value.trim();
        if (!title) return;
        sections.push({
            title,
            subtitle: el.querySelector('.sec-subtitle')?.value.trim() || '',
            description: el.querySelector('.sec-desc')?.value.trim() || '',
            image: el.querySelector('.sec-image')?.value.trim() || ''
        });
    });
    return sections;
}

// ── Save Brochure ─────────────────────────────────────────
async function saveBrochure(e) {
    e.preventDefault();
    const userId = await getCurrentUserId();
    const payload = {
        name: document.getElementById('brName').value.trim(),
        destination: document.getElementById('brDestination').value.trim() || null,
        client_id: document.getElementById('brClient').value || null,
        template_style: document.getElementById('brStyle').value,
        agency_logo_url: document.getElementById('brLogo').value.trim() || null,
        cover_image_url: document.getElementById('brCover').value.trim() || null,
        primary_color: document.getElementById('brColor').value,
        total_price: parseFloat(document.getElementById('brPrice').value) || null,
        currency: document.getElementById('brCurrency').value,
        sections: gatherSections(),
        inclusions: document.getElementById('brInclusions').value.trim() || null,
        exclusions: document.getElementById('brExclusions').value.trim() || null,
        terms: document.getElementById('brTerms').value.trim() || null,
        created_by: userId
    };

    let error;
    if (editingBrId) {
        delete payload.created_by;
        payload.updated_at = new Date().toISOString();
        ({ error } = await window.supabase.from('brochures').update(payload).eq('id', editingBrId));
    } else {
        ({ error } = await window.supabase.from('brochures').insert(payload));
    }

    if (error) { showToast('Failed to save: ' + error.message, 'error'); return; }
    showToast(editingBrId ? 'Brochure updated' : 'Brochure created');
    closeModal('brochureModal');
    await loadBrochures();
}

// ── Preview Brochure (from modal form) ────────────────────
function previewBrochure() {
    const data = {
        name: document.getElementById('brName').value.trim(),
        destination: document.getElementById('brDestination').value.trim(),
        template_style: document.getElementById('brStyle').value,
        agency_logo_url: document.getElementById('brLogo').value.trim(),
        cover_image_url: document.getElementById('brCover').value.trim(),
        primary_color: document.getElementById('brColor').value,
        total_price: document.getElementById('brPrice').value,
        currency: document.getElementById('brCurrency').value,
        sections: gatherSections(),
        inclusions: document.getElementById('brInclusions').value.trim(),
        exclusions: document.getElementById('brExclusions').value.trim(),
        terms: document.getElementById('brTerms').value.trim()
    };
    _renderPreview(data);
}

// ── Preview Saved Brochure ────────────────────────────────
function previewSaved(id) {
    const b = allBrochures.find(x => x.id === id);
    if (!b) return;
    _renderPreview(b);
}

// ── Render Preview HTML ───────────────────────────────────
function _renderPreview(data) {
    const color = data.primary_color || '#0078C8';
    const style = data.template_style || 'classic';

    const FONTS = {
        classic: "'Georgia', serif",
        modern: "'Segoe UI', sans-serif",
        luxury: "'Playfair Display', Georgia, serif",
        adventure: "'Trebuchet MS', sans-serif",
        minimal: "'Helvetica Neue', Helvetica, sans-serif"
    };
    const font = FONTS[style] || FONTS.classic;

    const sectionsHtml = (data.sections || []).map((sec, i) => `
        <div style="margin-bottom:30px;page-break-inside:avoid">
            ${sec.image ? `<img src="${escHtml(sec.image)}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px" onerror="this.style.display='none'">` : ''}
            <h2 style="color:${color};font-size:1.3rem;margin:0 0 4px">${escHtml(sec.title)}</h2>
            ${sec.subtitle ? `<p style="color:#888;font-size:0.9rem;margin:0 0 8px">${escHtml(sec.subtitle)}</p>` : ''}
            ${sec.description ? `<p style="color:#333;line-height:1.6;font-size:0.95rem">${escHtml(sec.description)}</p>` : ''}
        </div>
    `).join('');

    const listify = (text) => {
        if (!text) return '';
        return text.split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom:4px">${escHtml(l.trim())}</li>`).join('');
    };

    const html = `
        <div id="brochurePrintArea" style="font-family:${font};color:#222">
            <!-- Cover -->
            <div style="text-align:center;margin-bottom:40px">
                ${data.agency_logo_url ? `<img src="${escHtml(data.agency_logo_url)}" style="max-height:60px;margin-bottom:16px" onerror="this.style.display='none'">` : ''}
                ${data.cover_image_url ? `<img src="${escHtml(data.cover_image_url)}" style="width:100%;max-height:300px;object-fit:cover;border-radius:12px;margin-bottom:20px" onerror="this.style.display='none'">` : `<div style="height:200px;background:linear-gradient(135deg,${color},${color}88);border-radius:12px;margin-bottom:20px"></div>`}
                <h1 style="color:${color};font-size:2rem;margin:0 0 8px">${escHtml(data.name || 'Untitled')}</h1>
                ${data.destination ? `<p style="font-size:1.1rem;color:#666"><i data-lucide="map-pin" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(data.destination)}</p>` : ''}
                ${data.total_price ? `<p style="font-size:1.4rem;font-weight:700;color:${color};margin-top:12px">${escHtml(data.currency || 'INR')} ${Number(data.total_price).toLocaleString()}</p>` : ''}
            </div>

            <!-- Sections -->
            ${sectionsHtml}

            <!-- Inclusions -->
            ${data.inclusions ? `
                <div style="margin-bottom:24px;page-break-inside:avoid">
                    <h3 style="color:${color}"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Inclusions</h3>
                    <ul style="color:#333;line-height:1.8">${listify(data.inclusions)}</ul>
                </div>
            ` : ''}

            <!-- Exclusions -->
            ${data.exclusions ? `
                <div style="margin-bottom:24px;page-break-inside:avoid">
                    <h3 style="color:#c62828"><i data-lucide="x-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Exclusions</h3>
                    <ul style="color:#333;line-height:1.8">${listify(data.exclusions)}</ul>
                </div>
            ` : ''}

            <!-- Terms -->
            ${data.terms ? `
                <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;page-break-inside:avoid">
                    <h4 style="color:#888;font-size:0.85rem">Terms & Conditions</h4>
                    <p style="color:#666;font-size:0.82rem;line-height:1.6">${escHtml(data.terms)}</p>
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('brochurePreviewContent').innerHTML = html;
    document.getElementById('previewOverlay').classList.remove('hidden');
}

// ── Download as PDF ───────────────────────────────────────
async function downloadBrochurePdf() {
    const el = document.getElementById('brochurePrintArea');
    if (!el) { showToast('No preview to export', 'error'); return; }

    showToast('Generating PDF...');
    try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const imgW = pdfW - 20;
        const imgH = (canvas.height / canvas.width) * imgW;

        let y = 10;
        const pageH = pdfH - 20;

        if (imgH <= pageH) {
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, y, imgW, imgH);
        } else {
            // Multi-page
            let srcY = 0;
            const sliceH = Math.floor(canvas.width * (pageH / imgW));
            while (srcY < canvas.height) {
                const slice = document.createElement('canvas');
                slice.width = canvas.width;
                slice.height = Math.min(sliceH, canvas.height - srcY);
                const ctx = slice.getContext('2d');
                ctx.drawImage(canvas, 0, srcY, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
                const sliceImgH = (slice.height / slice.width) * imgW;
                if (srcY > 0) pdf.addPage();
                pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, imgW, sliceImgH);
                srcY += sliceH;
            }
        }

        pdf.save(`brochure-${Date.now()}.pdf`);
        showToast('PDF downloaded');
    } catch (err) {
        showToast('PDF generation failed', 'error');
    }
}

// ── Share Brochure ────────────────────────────────────────
async function shareBrochure(id) {
    const b = allBrochures.find(x => x.id === id);
    if (!b) return;

    // Toggle public
    const newPublic = !b.is_public;
    await window.supabase.from('brochures').update({ is_public: newPublic }).eq('id', id);

    if (newPublic) {
        // Generate a share URL (in a real app this would be a hosted page)
        const shareUrl = `${window.location.origin}/brochures.html?view=${id}`;
        await window.supabase.from('brochures').update({ share_url: shareUrl }).eq('id', id);

        // Copy to clipboard
        try {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Share link copied to clipboard!');
        } catch {
            showToast(`Share URL: ${shareUrl}`);
        }
    } else {
        showToast('Brochure is now private');
    }
    await loadBrochures();
}

// ── Delete Brochure ───────────────────────────────────────
async function deleteBrochure(id) {
    if (!confirm('Delete this brochure?')) return;
    const { error } = await window.supabase.from('brochures').delete().eq('id', id);
    if (error) { showToast('Failed to delete', 'error'); return; }
    showToast('Brochure deleted');
    await loadBrochures();
}

// ── Handle ?view= param for shared brochures ─────────────
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get('view');
    if (viewId) {
        const { data } = await window.supabase.from('brochures').select('*').eq('id', viewId).single();
        if (data) {
            // Increment view count
            await window.supabase.from('brochures').update({ views_count: (data.views_count || 0) + 1 }).eq('id', viewId);
            _renderPreview(data);
        }
    }
});
