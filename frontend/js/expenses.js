// ============================================================
// expenses.js — Office & operational expense tracker
// ============================================================

let allExpenses = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadExpenses();
    document.getElementById('addExpenseBtn')?.addEventListener('click', openAddExpense);
    document.getElementById('closeExpenseModal')?.addEventListener('click', () => closeModal('expenseModal'));
    document.getElementById('cancelExpenseBtn')?.addEventListener('click', () => closeModal('expenseModal'));
    document.getElementById('expenseModalOverlay')?.addEventListener('click', () => closeModal('expenseModal'));
    document.getElementById('saveExpenseBtn')?.addEventListener('click', saveExpense);
    ['searchExpenses','filterExpCat','filterExpMonth'].forEach(id =>
        document.getElementById(id)?.addEventListener('input', applyFilters)
    );
    // Default date
    const el = document.getElementById('expDate');
    if (el) el.value = new Date().toISOString().split('T')[0];
});

async function loadExpenses() {
    const { data } = await window.supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });
    allExpenses = data || [];
    renderStats();
    renderTable(allExpenses);
}

function renderStats() {
    const now = new Date();
    const mth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const thisMonth = allExpenses.filter(e => e.expense_date?.startsWith(mth));
    const total = thisMonth.reduce((s, e) => s + (e.amount || 0), 0);
    const byCategory = {};
    allExpenses.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + (e.amount || 0); });
    const top = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('expThisMonth').innerHTML = `<strong>${formatINR(total)}</strong> This Month`;
    document.getElementById('expTopCat').innerHTML = top ? `<strong>${top[0]}</strong> top category` : 'No data';
    document.getElementById('expTotal').innerHTML = `<strong>${formatINR(allExpenses.reduce((s,e)=>s+(e.amount||0),0))}</strong> All time`;
}

function applyFilters() {
    const q   = document.getElementById('searchExpenses')?.value.toLowerCase() || '';
    const cat = document.getElementById('filterExpCat')?.value || '';
    const mth = document.getElementById('filterExpMonth')?.value || '';
    const filtered = allExpenses.filter(e => {
        if (cat && e.category !== cat) return false;
        if (mth && !e.expense_date?.startsWith(mth)) return false;
        if (q && ![e.description, e.paid_to, e.reference].join(' ').toLowerCase().includes(q)) return false;
        return true;
    });
    renderTable(filtered);
}

function renderTable(expenses) {
    const tbody = document.getElementById('expTable');
    if (!expenses.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No expenses</td></tr>'; return; }
    tbody.innerHTML = expenses.map(e => `
        <tr>
            <td>${formatDate(e.expense_date)}</td>
            <td>${escHtml(e.category)}</td>
            <td>${escHtml(e.description)}</td>
            <td>${escHtml(e.paid_to || '—')}</td>
            <td>${escHtml(e.mode || '—')}</td>
            <td><strong>${formatINR(e.amount)}</strong></td>
            <td><button class="btn-danger" style="padding:3px 8px;font-size:0.78rem" onclick="deleteExpense('${e.id}')">✕</button></td>
        </tr>
    `).join('');
}

function openAddExpense() {
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    openModal('expenseModal');
}

async function saveExpense() {
    const description = document.getElementById('expDesc')?.value.trim();
    const amount = parseFloat(document.getElementById('expAmount')?.value) || 0;
    const category = document.getElementById('expCategory')?.value;
    if (!description || !amount || !category) { showToast('Category, description and amount required', 'error'); return; }
    const { error } = await window.supabase.from('expenses').insert({
        category,
        description,
        amount,
        expense_date: document.getElementById('expDate')?.value || new Date().toISOString().split('T')[0],
        paid_to: document.getElementById('expPaidTo')?.value.trim() || null,
        mode: document.getElementById('expMode')?.value || null,
        reference: document.getElementById('expRef')?.value.trim() || null,
        created_by: await getCurrentUserId(),
    });
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Expense added');
    closeModal('expenseModal');
    await loadExpenses();
}

async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    const { error } = await window.supabase.from('expenses').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Deleted');
    await loadExpenses();
}
