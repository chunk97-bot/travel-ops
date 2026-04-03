// ============================================================
// supabase-config.js — Supabase client initialization
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your values
// ============================================================

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// ── Worker URLs (update after deploying Cloudflare Workers) ──
const WORKER_URLS = {
    whatsapp: '', // e.g. 'https://travel-ops-whatsapp.YOUR_SUBDOMAIN.workers.dev'
    email: '',    // e.g. 'https://travel-ops-email.YOUR_SUBDOMAIN.workers.dev'
};

// Load Supabase from CDN (add to HTML head if not already):
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const { createClient } = supabase;
window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
