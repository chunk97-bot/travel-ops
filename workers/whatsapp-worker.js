// ============================================================
// whatsapp-worker.js — Cloudflare Worker for MSG91 WhatsApp
// Deploy: npx wrangler deploy workers/whatsapp-worker.js --name travel-ops-whatsapp
// Secrets: MSG91_AUTH_KEY, ALLOWED_ORIGIN
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

        const { to, message, template_id } = body;
        if (!to || !message) {
            return new Response(JSON.stringify({ error: 'Missing required fields: to, message' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Sanitize phone number — ensure 91 country code
        const phone = to.replace(/\D/g, '').replace(/^0/, '').replace(/^91/, '');
        const fullPhone = `91${phone}`;

        // MSG91 WhatsApp API
        const msg91Payload = {
            "integrated_number": env.MSG91_INTEGRATED_NUMBER || "91XXXXXXXXXX",
            "content_type": "template",
            "payload": {
                "to": fullPhone,
                "type": "text",
                "header": { "type": "text", "text": "WhereTo Travel" },
                "body": { "type": "text", "text": message },
            }
        };

        try {
            const resp = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'authkey': env.MSG91_AUTH_KEY,
                },
                body: JSON.stringify(msg91Payload),
            });
            const result = await resp.json();
            return new Response(JSON.stringify({ success: true, result }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: 'WhatsApp delivery failed', detail: err.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
