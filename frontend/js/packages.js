// ============================================================
// packages.js — Package catalog internal page logic
// ============================================================

let selectedPackageId = null;

document.addEventListener('DOMContentLoaded', async () => {
    buildRegionTabs();
    buildDepartureCityFilter();
    renderPackages(PACKAGE_CATALOG.packages);
    await loadLeadOptions();
    updateStats(PACKAGE_CATALOG.packages);

    document.getElementById('searchPkgs')?.addEventListener('input', applyFilters);
    document.getElementById('filterRegion')?.addEventListener('change', applyFilters);
    document.getElementById('filterDep')?.addEventListener('change', applyFilters);
    document.getElementById('filterTag')?.addEventListener('change', applyFilters);
    document.getElementById('closeTemplateModal')?.addEventListener('click', () => closeModal('templateModal'));
    document.getElementById('templateModalOverlay')?.addEventListener('click', () => closeModal('templateModal'));
    document.getElementById('openBuilderBtn')?.addEventListener('click', openInBuilder);

    // Set travel date default to 30 days from now
    const d = new Date(); d.setDate(d.getDate() + 30);
    const el = document.getElementById('templateDate');
    if (el) el.value = d.toISOString().split('T')[0];
});

function buildRegionTabs() {
    const tabs = document.getElementById('regionTabs');
    PACKAGE_CATALOG.regions.forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'region-tab';
        btn.dataset.region = r;
        btn.textContent = r;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.region-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('filterRegion').value = r;
            applyFilters();
        });
        tabs.appendChild(btn);
    });
    // Wire "All" tab
    tabs.querySelector('[data-region=""]')?.addEventListener('click', () => {
        document.querySelectorAll('.region-tab').forEach(b => b.classList.remove('active'));
        tabs.querySelector('[data-region=""]').classList.add('active');
        document.getElementById('filterRegion').value = '';
        applyFilters();
    });
}

function buildDepartureCityFilter() {
    const sel = document.getElementById('filterDep');
    PACKAGE_CATALOG.allDepartureCities.forEach(city => {
        const opt = document.createElement('option');
        opt.value = city;
        opt.textContent = city;
        sel.appendChild(opt);
    });
}

function applyFilters() {
    const search = document.getElementById('searchPkgs')?.value.toLowerCase() || '';
    const region = document.getElementById('filterRegion')?.value || '';
    const dep    = document.getElementById('filterDep')?.value || '';
    const tag    = document.getElementById('filterTag')?.value || '';

    // Sync region tab active state
    document.querySelectorAll('.region-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.region === region);
    });

    const filtered = PACKAGE_CATALOG.packages.filter(p => {
        if (region && p.region !== region) return false;
        if (dep && !p.departureCities.some(c => c.toLowerCase().includes(dep.toLowerCase()))) return false;
        if (tag && !p.tags.includes(tag)) return false;
        if (search) {
            const hay = [p.name, p.destination, p.region, ...p.tags, ...p.departureCities, ...p.highlights].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });

    renderPackages(filtered);
    updateStats(filtered);
}

function renderPackages(packages) {
    const grid = document.getElementById('pkgGrid');
    const empty = document.getElementById('pkgEmpty');
    if (!packages.length) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    grid.innerHTML = packages.map(p => `
        <div class="pkg-card">
            <div class="pkg-card-top">
                <div class="pkg-region-badge">${p.region}</div>
                <div class="pkg-nights-badge">${p.nights}N/${p.days}D</div>
            </div>
            <div class="pkg-dest">${escHtml(p.destination)}</div>
            <div class="pkg-name">${escHtml(p.name)}</div>
            <div class="pkg-dep"><i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Ex: ${p.departureCities.map(c => escHtml(c)).join(' / ')}</div>
            <ul class="pkg-highlights">
                ${p.highlights.map(h => `<li>${escHtml(h)}</li>`).join('')}
            </ul>
            <div class="pkg-tag-row">
                ${p.tags.map(t => `<span class="pkg-tag">${t}</span>`).join('')}
            </div>
            <div class="pkg-season"><i data-lucide="cloud-sun" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> ${escHtml(p.bestSeason)}</div>
            <div class="pkg-card-actions">
                <button class="btn-primary pkg-use-btn" onclick="openTemplateModal('${p.id}')">Use Template</button>
                <button class="btn-secondary" onclick="openCatalogForPackage('${p.id}')">Preview</button>
            </div>
        </div>
    `).join('');
}

function updateStats(packages) {
    document.getElementById('statTotal').innerHTML = `<strong>${packages.length}</strong> Packages`;
    const regions = new Set(packages.map(p => p.region));
    document.getElementById('statRegions').innerHTML = `<strong>${regions.size}</strong> Regions`;
}

async function loadLeadOptions() {
    const { data } = await window.supabase.from('leads').select('id, name').order('name');
    const sel = document.getElementById('templateLeadId');
    if (!data) return;
    data.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        sel.appendChild(opt);
    });
}

function openTemplateModal(packageId) {
    selectedPackageId = packageId;
    const pkg = PACKAGE_CATALOG.packages.find(p => p.id === packageId);
    document.getElementById('templateModalTitle').textContent = `Use Template — ${pkg.name}`;
    openModal('templateModal');
}

function openInBuilder() {
    const pkg = PACKAGE_CATALOG.packages.find(p => p.id === selectedPackageId);
    if (!pkg) return;
    const leadId = document.getElementById('templateLeadId')?.value || '';
    const pax = document.getElementById('templatePax')?.value || 2;
    const date = document.getElementById('templateDate')?.value || '';
    const params = new URLSearchParams({
        dest: pkg.destination,
        nights: pkg.nights,
        pax,
        date,
        pkgId: pkg.id,
        ...(leadId && { leadId }),
    });
    window.location.href = `itinerary.html?${params.toString()}`;
}

function openCatalogForPackage(packageId) {
    const pkg = PACKAGE_CATALOG.packages.find(p => p.id === packageId);
    if (pkg) window.open(`catalog.html#${pkg.region.replace(/\s+/g, '-')}`, '_blank');
}
