// ============================================================
// calendar-view.js — Dashboard calendar for follow-ups, bookings, tasks
// Renders a simple month-grid calendar pulling data from Supabase
// ============================================================

let calCurrentDate = new Date();
let calEvents = [];

async function initCalendar(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="cal-header">
            <button class="btn-secondary cal-nav" onclick="calPrev()">◀</button>
            <h3 id="calMonthYear"></h3>
            <button class="btn-secondary cal-nav" onclick="calNext()">▶</button>
            <button class="btn-secondary cal-nav" onclick="calToday()" style="margin-left:8px;font-size:0.8rem">Today</button>
        </div>
        <div class="cal-grid" id="calGrid">
            <div class="cal-dow">Sun</div><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div>
            <div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div>
        </div>
    `;
    await loadCalendarEvents();
    renderCalendar();
}

async function loadCalendarEvents() {
    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
    calEvents = [];

    // Follow-ups
    const { data: followups } = await window.supabase.from('follow_ups')
        .select('id, type, due_date, message, is_done, leads(name)')
        .gte('due_date', startDate).lte('due_date', endDate);
    (followups || []).forEach(f => calEvents.push({
        date: f.due_date, type: 'followup',
        icon: f.type === 'call' ? '<i data-lucide="phone" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : f.type === 'whatsapp' ? '<i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>',
        label: `${f.leads?.name || 'Follow-up'}${f.message ? ': ' + f.message.substring(0, 30) : ''}`,
        done: f.is_done, color: f.is_done ? 'var(--success)' : 'var(--warning)'
    }));

    // Bookings (travel dates)
    const { data: bookings } = await window.supabase.from('bookings')
        .select('id, lead_id, destination, travel_date, return_date, leads(name)')
        .gte('travel_date', startDate).lte('travel_date', endDate);
    (bookings || []).forEach(b => calEvents.push({
        date: b.travel_date, type: 'booking',
        icon: '<i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>',
        label: `${b.leads?.name || 'Booking'} → ${b.destination || ''}`,
        color: 'var(--primary)'
    }));

    // Tasks (from task board)
    const { data: tasks } = await window.supabase.from('tasks')
        .select('id, title, due_date, status')
        .gte('due_date', startDate).lte('due_date', endDate);
    (tasks || []).forEach(t => calEvents.push({
        date: t.due_date, type: 'task',
        icon: '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>',
        label: t.title,
        done: t.status === 'done', color: t.status === 'done' ? 'var(--text-muted)' : 'var(--danger)'
    }));
}

function renderCalendar() {
    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();

    document.getElementById('calMonthYear').textContent =
        calCurrentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const grid = document.getElementById('calGrid');
    // Remove old day cells (keep 7 DOW headers)
    while (grid.children.length > 7) grid.removeChild(grid.lastChild);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Empty cells before month start
    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-day cal-empty';
        grid.appendChild(blank);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayEvents = calEvents.filter(e => e.date === dateStr);
        const isToday = dateStr === todayStr;

        const cell = document.createElement('div');
        cell.className = `cal-day${isToday ? ' cal-today' : ''}${dayEvents.length ? ' cal-has-events' : ''}`;
        cell.innerHTML = `<span class="cal-num">${d}</span>
            ${dayEvents.slice(0, 3).map(e =>
                `<div class="cal-event" style="border-left:3px solid ${e.color};${e.done ? 'opacity:0.5;text-decoration:line-through;' : ''}" title="${escHtml(e.label)}">
                    <span>${e.icon}</span> <span>${escHtml(e.label.substring(0, 18))}</span>
                </div>`
            ).join('')}
            ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3} more</div>` : ''}`;
        grid.appendChild(cell);
    }
}

function calPrev() {
    calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
    loadCalendarEvents().then(renderCalendar);
}
function calNext() {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
    loadCalendarEvents().then(renderCalendar);
}
function calToday() {
    calCurrentDate = new Date();
    loadCalendarEvents().then(renderCalendar);
}
