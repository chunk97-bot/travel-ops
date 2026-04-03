// ============================================================
// data-import.js — CSV/Excel upload for bulk leads + clients
// ============================================================

function openImportDialog(targetTable) {
    if (!document.getElementById('importModal')) {
        const modal = document.createElement('div');
        modal.id = 'importModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-overlay" id="importOverlay"></div>
            <div class="modal-content" style="max-width:560px">
                <div class="modal-header">
                    <h3 id="importTitle"><i data-lucide="upload" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Import Data</h3>
                    <button class="modal-close" id="closeImport">&times;</button>
                </div>
                <div class="modal-body">
                    <div id="importStep1">
                        <p style="margin-bottom:12px;font-size:0.9rem">Upload a CSV file. First row must be column headers.</p>
                        <div style="border:2px dashed var(--border);border-radius:12px;padding:32px;text-align:center;cursor:pointer" id="importDropZone">
                            <p style="font-size:1.5rem;margin-bottom:8px"><i data-lucide="folder" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></p>
                            <p style="color:var(--text-muted);font-size:0.85rem">Drop CSV file here or click to browse</p>
                            <input type="file" id="importFileInput" accept=".csv,.txt" style="display:none">
                        </div>
                        <div style="margin-top:12px">
                            <button class="btn-secondary" style="font-size:0.8rem" id="downloadTemplateBtn"><i data-lucide="download" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Download Template</button>
                        </div>
                    </div>
                    <div id="importStep2" class="hidden">
                        <p style="margin-bottom:8px;font-size:0.85rem">Preview (<span id="importRowCount">0</span> rows):</p>
                        <div id="importPreview" style="max-height:250px;overflow:auto;border:1px solid var(--border);border-radius:8px;font-size:0.78rem"></div>
                        <div style="margin-top:12px;display:flex;gap:8px">
                            <label style="font-size:0.85rem;display:flex;align-items:center;gap:4px">
                                <input type="checkbox" id="importSkipDupes" checked> Skip duplicates (phone)
                            </label>
                        </div>
                    </div>
                    <div id="importStep3" class="hidden">
                        <div style="text-align:center;padding:24px">
                            <p style="font-size:1.5rem;margin-bottom:8px"><i data-lucide="hourglass" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></p>
                            <p id="importProgress">Importing...</p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="cancelImport">Cancel</button>
                    <button class="btn-primary hidden" id="startImportBtn">Import <span id="importCountBtn"></span> rows</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        document.getElementById('closeImport').addEventListener('click', () => closeModal('importModal'));
        document.getElementById('importOverlay').addEventListener('click', () => closeModal('importModal'));
        document.getElementById('cancelImport').addEventListener('click', () => closeModal('importModal'));

        const dropZone = document.getElementById('importDropZone');
        const fileInput = document.getElementById('importFileInput');
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--border)'; if (e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]); });
        fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImportFile(e.target.files[0]); });
    }

    document.getElementById('importTitle').textContent = `<i data-lucide="upload" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Import ${targetTable === 'leads' ? 'Leads' : 'Clients'}`;
    document.getElementById('importStep1').classList.remove('hidden');
    document.getElementById('importStep2').classList.add('hidden');
    document.getElementById('importStep3').classList.add('hidden');
    document.getElementById('startImportBtn').classList.add('hidden');

    // Set target
    document.getElementById('importModal').dataset.target = targetTable;

    // Template download
    const tmplBtn = document.getElementById('downloadTemplateBtn');
    const newTmpl = tmplBtn.cloneNode(true);
    tmplBtn.parentNode.replaceChild(newTmpl, tmplBtn);
    newTmpl.addEventListener('click', () => downloadImportTemplate(targetTable));

    openModal('importModal');
}

let _importRows = [];
let _importHeaders = [];

function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { showToast('File must have headers + at least 1 row', 'error'); return; }

        _importHeaders = parseCSVLine(lines[0]);
        _importRows = lines.slice(1).map(line => {
            const vals = parseCSVLine(line);
            const row = {};
            _importHeaders.forEach((h, i) => { row[h.trim().toLowerCase().replace(/\s+/g, '_')] = vals[i]?.trim() || ''; });
            return row;
        }).filter(r => Object.values(r).some(v => v)); // skip fully empty rows

        // Show preview
        document.getElementById('importStep1').classList.add('hidden');
        document.getElementById('importStep2').classList.remove('hidden');
        document.getElementById('startImportBtn').classList.remove('hidden');
        document.getElementById('importRowCount').textContent = _importRows.length;
        document.getElementById('importCountBtn').textContent = _importRows.length;

        const preview = document.getElementById('importPreview');
        const previewRows = _importRows.slice(0, 10);
        preview.innerHTML = `<table class="data-table" style="font-size:0.75rem">
            <thead><tr>${_importHeaders.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${previewRows.map(r => `<tr>${_importHeaders.map(h => `<td>${escHtml(r[h.trim().toLowerCase().replace(/\s+/g, '_')] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>${_importRows.length > 10 ? `<p style="padding:8px;color:var(--text-muted);font-size:0.8rem;text-align:center">... and ${_importRows.length - 10} more rows</p>` : ''}`;

        // Bind import button
        const importBtn = document.getElementById('startImportBtn');
        const newBtn = importBtn.cloneNode(true);
        importBtn.parentNode.replaceChild(newBtn, importBtn);
        newBtn.addEventListener('click', () => executeImport());
    };
    reader.readAsText(file);
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += ch; }
    }
    result.push(current);
    return result;
}

async function executeImport() {
    const target = document.getElementById('importModal').dataset.target;
    const skipDupes = document.getElementById('importSkipDupes').checked;

    document.getElementById('importStep2').classList.add('hidden');
    document.getElementById('startImportBtn').classList.add('hidden');
    document.getElementById('importStep3').classList.remove('hidden');

    let imported = 0;
    let skipped = 0;
    const progressEl = document.getElementById('importProgress');
    const userId = await getCurrentUserId();

    for (let i = 0; i < _importRows.length; i++) {
        progressEl.textContent = `Importing ${i + 1} of ${_importRows.length}...`;
        const row = _importRows[i];

        if (target === 'leads') {
            const phone = row.phone || row.mobile || '';
            if (skipDupes && phone) {
                const { count } = await window.supabase.from('leads').select('id', { count: 'exact', head: true }).eq('phone', phone);
                if (count > 0) { skipped++; continue; }
            }
            const { error } = await window.supabase.from('leads').insert({
                name: row.name || row.full_name || 'Unknown',
                phone,
                email: row.email || null,
                destination: row.destination || null,
                source: row.source || 'import',
                budget_range: row.budget || row.budget_range || null,
                travel_date: row.travel_date || row.departure || null,
                pax_adults: parseInt(row.pax || row.adults || row.pax_adults) || 2,
                pax_children: parseInt(row.children || row.pax_children) || 0,
                notes: row.notes || row.remarks || null,
                stage: row.stage || 'new',
                assigned_to: userId,
            });
            if (!error) imported++;
        } else if (target === 'clients') {
            const phone = row.phone || row.mobile || '';
            if (skipDupes && phone) {
                const { count } = await window.supabase.from('clients').select('id', { count: 'exact', head: true }).eq('phone', phone);
                if (count > 0) { skipped++; continue; }
            }
            const { error } = await window.supabase.from('clients').insert({
                name: row.name || row.full_name || 'Unknown',
                phone,
                email: row.email || null,
                city: row.city || null,
                dob: row.dob || row.date_of_birth || null,
                anniversary: row.anniversary || null,
                segment: row.segment || 'regular',
                passport_number: row.passport || row.passport_number || null,
                notes: row.notes || null,
            });
            if (!error) imported++;
        }
    }

    progressEl.innerHTML = `<span style="font-size:1.5rem"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></span><br>Imported <strong>${imported}</strong> rows${skipped ? `, skipped <strong>${skipped}</strong> duplicates` : ''}`;
    showToast(`Imported ${imported} ${target}`);

    if (typeof logAudit === 'function') logAudit('data_import', target, null, { imported, skipped });
}

function downloadImportTemplate(target) {
    let headers;
    if (target === 'leads') {
        headers = 'Name,Phone,Email,Destination,Travel Date,Adults,Children,Budget,Source,Notes';
    } else {
        headers = 'Name,Phone,Email,City,Date of Birth,Anniversary,Segment,Passport Number,Notes';
    }
    const blob = new Blob(['\uFEFF' + headers + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${target}-import-template.csv`; a.click();
    URL.revokeObjectURL(url);
}
