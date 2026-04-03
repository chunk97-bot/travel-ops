// ============================================================
// lead-scoring.js — Auto-rank leads by engagement + budget
// Loaded on leads.html to compute and display scores
// ============================================================

// Scoring weights
const SCORE_WEIGHTS = {
    budget: { 'Under 50K': 5, '50K-1L': 15, '1L-3L': 25, '3L-5L': 35, '5L-10L': 45, '10L+': 50 },
    source: { referral: 20, google: 10, facebook: 8, instagram: 8, website: 12, whatsapp: 6, walk_in: 15, justdial: 10, other: 5 },
    stageBonus: { new: 0, contacted: 5, quoted: 15, negotiating: 25, confirmed: 0, lost: 0 },
    paxMultiplier: { 1: 0, 2: 5, 3: 8, 4: 10 }, // 4+ = 10
};

function calculateLeadScore(lead, activityCount) {
    let score = 0;
    const breakdown = {};

    // Budget score (0-50)
    const budgetScore = SCORE_WEIGHTS.budget[lead.budget_range] || 10;
    score += budgetScore;
    breakdown.budget = budgetScore;

    // Source quality (0-20)
    const sourceScore = SCORE_WEIGHTS.source[lead.source] || 5;
    score += sourceScore;
    breakdown.source = sourceScore;

    // Stage progression (0-25)
    const stageScore = SCORE_WEIGHTS.stageBonus[lead.stage] || 0;
    score += stageScore;
    breakdown.stage = stageScore;

    // Activity engagement (0-15) — 3 points per activity, max 15
    const actScore = Math.min((activityCount || 0) * 3, 15);
    score += actScore;
    breakdown.activity = actScore;

    // Pax count bonus (0-10)
    const totalPax = (lead.pax_adults || 0) + (lead.pax_children || 0);
    const paxScore = totalPax >= 4 ? 10 : (SCORE_WEIGHTS.paxMultiplier[totalPax] || 0);
    score += paxScore;
    breakdown.pax = paxScore;

    // Recency bonus — lead within 3 days gets 10, within 7 gets 5
    const daysSinceCreated = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000);
    const recencyScore = daysSinceCreated <= 3 ? 10 : daysSinceCreated <= 7 ? 5 : 0;
    score += recencyScore;
    breakdown.recency = recencyScore;

    // Travel date urgency — within 30 days gets 10, within 60 gets 5
    if (lead.travel_date) {
        const daysUntilTravel = Math.floor((new Date(lead.travel_date).getTime() - Date.now()) / 86400000);
        const urgencyScore = daysUntilTravel >= 0 && daysUntilTravel <= 30 ? 10 : daysUntilTravel <= 60 ? 5 : 0;
        score += urgencyScore;
        breakdown.urgency = urgencyScore;
    }

    return { score: Math.min(score, 100), breakdown };
}

// Batch score all leads and update DB
async function scoreAllLeads() {
    const { data: leads } = await window.supabase.from('leads')
        .select('id, budget_range, source, stage, pax_adults, pax_children, travel_date, created_at')
        .not('stage', 'in', '(confirmed,lost,cancelled)');
    if (!leads?.length) return;

    // Get activity counts per lead
    const { data: activities } = await window.supabase.from('lead_activities')
        .select('lead_id');
    const actCounts = {};
    (activities || []).forEach(a => { actCounts[a.lead_id] = (actCounts[a.lead_id] || 0) + 1; });

    const updates = leads.map(lead => {
        const { score, breakdown } = calculateLeadScore(lead, actCounts[lead.id] || 0);
        return { id: lead.id, lead_score: score, score_breakdown: breakdown };
    });

    // Batch update in groups of 50
    for (let i = 0; i < updates.length; i += 50) {
        const batch = updates.slice(i, i + 50);
        await Promise.all(batch.map(u =>
            window.supabase.from('leads').update({ lead_score: u.lead_score, score_breakdown: u.score_breakdown }).eq('id', u.id)
        ));
    }
    return updates.length;
}

// Score badge color based on score value
function scoreBadge(score) {
    const s = score || 0;
    const color = s >= 70 ? '#10b981' : s >= 40 ? '#f59e0b' : '#6b7280';
    const label = s >= 70 ? 'Hot' : s >= 40 ? 'Warm' : 'Cold';
    return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:700">${s} ${label}</span>`;
}
