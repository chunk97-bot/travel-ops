// ============================================================
// birthday-greet.js — Birthday/Anniversary Auto-Greet System
// ============================================================

async function initBirthdayGreet(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const in7 = new Date(today);
    in7.setDate(today.getDate() + 7);
    const in7MD = `${String(in7.getMonth() + 1).padStart(2, '0')}-${String(in7.getDate()).padStart(2, '0')}`;

    const [{ data: bClients }, { data: greetLog }] = await Promise.all([
        window.supabase.from('clients').select('id, name, phone, email, dob, anniversary'),
        window.supabase.from('greeting_log').select('client_id, type, year').eq('year', today.getFullYear()),
    ]);

    const sent = new Set((greetLog || []).map(g => `${g.client_id}_${g.type}`));

    const events = [];
    (bClients || []).forEach(c => {
        if (c.dob) {
            const md = c.dob.slice(5);
            if (md >= todayMD && md <= in7MD) {
                events.push({ ...c, eventType: 'birthday', eventDate: c.dob, alreadySent: sent.has(`${c.id}_birthday`) });
            }
        }
        if (c.anniversary) {
            const md = c.anniversary.slice(5);
            if (md >= todayMD && md <= in7MD) {
                events.push({ ...c, eventType: 'anniversary', eventDate: c.anniversary, alreadySent: sent.has(`${c.id}_anniversary`) });
            }
        }
    });

    events.sort((a, b) => a.eventDate.slice(5).localeCompare(b.eventDate.slice(5)));

    if (!events.length) {
        el.innerHTML = '<p class="empty-state">No birthdays or anniversaries this week <i data-lucide="party-popper" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i></p>';
        return;
    }

    el.innerHTML = `
        <div style="margin-bottom:10px;font-size:0.85rem;color:var(--text-muted)">${events.length} event${events.length > 1 ? 's' : ''} this week</div>
        ${events.map(e => {
            const icon = e.eventType === 'birthday' ? '<i data-lucide="cake" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>' : '<i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>';
            const label = e.eventType === 'birthday' ? 'Birthday' : 'Anniversary';
            const isToday = e.eventDate.slice(5) === todayMD;
            const years = e.eventType === 'anniversary'
                ? ` (${today.getFullYear() - parseInt(e.eventDate.slice(0, 4))} years)`
                : ` (turns ${today.getFullYear() - parseInt(e.eventDate.slice(0, 4))})`;

            return `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
                    <span style="font-size:1.4rem">${icon}</span>
                    <div style="flex:1">
                        <div style="font-weight:600">${escHtml(e.name)} ${isToday ? '<span class="badge badge-confirmed">TODAY</span>' : ''}</div>
                        <div style="font-size:0.82rem;color:var(--text-muted)">${label}${years} · ${formatDate(e.eventDate)}</div>
                    </div>
                    ${e.alreadySent
                        ? '<span style="color:var(--success);font-size:0.82rem"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Sent</span>'
                        : `<div style="display:flex;gap:4px">
                            ${e.phone ? `<button class="btn-whatsapp" style="padding:4px 10px;font-size:0.78rem" onclick="sendGreeting('${e.id}','${e.eventType}','whatsapp','${escHtml(e.phone)}','${escHtml(e.name)}')"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> WhatsApp</button>` : ''}
                            ${e.email ? `<button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem" onclick="sendGreeting('${e.id}','${e.eventType}','email','${escHtml(e.email)}','${escHtml(e.name)}')"><i data-lucide="mail" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Email</button>` : ''}
                            <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem" onclick="sendGreeting('${e.id}','${e.eventType}','manual','','${escHtml(e.name)}')"><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Mark Sent</button>
                        </div>`
                    }
                </div>
            `;
        }).join('')}
    `;
}

async function sendGreeting(clientId, type, via, contact, name) {
    const year = new Date().getFullYear();
    const label = type === 'birthday' ? 'Birthday' : 'Anniversary';

    // Open WhatsApp or log as manual
    if (via === 'whatsapp' && contact) {
        const msg = type === 'birthday'
            ? `Happy Birthday, ${name}! <i data-lucide="cake" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i><i data-lucide="party-popper" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Wishing you a wonderful year ahead. — from your friends at Travel Ops <i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>`
            : `Happy Anniversary, ${name}! <i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i><i data-lucide="wine" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i> Wishing you many more beautiful journeys together. — Travel Ops <i data-lucide="plane" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>`;
        window.open(`https://wa.me/91${contact.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else if (via === 'email' && contact && typeof openEmailComposer === 'function') {
        openEmailComposer({
            to: contact,
            subject: `Happy ${label}, ${name}! <i data-lucide="party-popper" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>`,
            body: type === 'birthday'
                ? `Dear ${name},\n\nWishing you a very Happy Birthday! <i data-lucide="cake" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>\nMay this year bring you wonderful travels and beautiful memories.\n\nWarm regards,\nTravel Ops Team`
                : `Dear ${name},\n\nWishing you a very Happy Anniversary! <i data-lucide="heart" style="width:14px;height:14px;display:inline-block;vertical-align:middle"></i>\nMay your journey together continue to be filled with wonderful adventures.\n\nWarm regards,\nTravel Ops Team`,
        });
    }

    // Log greeting
    const { error } = await window.supabase.from('greeting_log').insert({
        client_id: clientId,
        type,
        year,
        sent_via: via,
        sent_by: await getCurrentUserId(),
    });

    if (error && !error.message.includes('duplicate')) {
        showToast('Failed to log greeting', 'error');
        return;
    }
    showToast(`${label} greeting sent to ${name}`);
    await initBirthdayGreet('birthdayGreetWidget');
}
