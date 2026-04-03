// ============================================================
// email-worker.js — Cloudflare Worker for Resend email
// Deploy: npx wrangler deploy workers/email-worker.js --name travel-ops-email
// Secrets: RESEND_API_KEY
// ============================================================

const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
];

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const corsHeaders = {
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : 'null',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        let body;
        try { body = await request.json(); } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const { to, subject, html, from_name } = body;
        if (!to || !subject || !html) {
            return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, html' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const emailPayload = {
            from: `${from_name || 'Travel Ops'} <noreply@${env.SEND_DOMAIN || 'resend.dev'}>`,
            to: [to],
            subject,
            html,
        };

        try {
            const resp = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                },
                body: JSON.stringify(emailPayload),
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.message || 'Resend API error');
            return new Response(JSON.stringify({ success: true, id: result.id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: 'Email delivery failed', detail: err.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
