# Travel Ops — Internal CRM & Operations Tool

Internal travel agency management system — built by the WhereTo team for own agency operations (Bangalore).

## Modules

| Module | File | Status |
|--------|------|--------|
| Dashboard | frontend/index.html | ✅ |
| Lead Pipeline | frontend/leads.html | ✅ |
| Itinerary Builder | frontend/itinerary.html | ✅ |
| Invoices (GST) | frontend/invoices.html | ✅ |
| Vendor Master | frontend/vendors.html | ✅ |
| Follow-up Scheduler | frontend/followups.html | ✅ |
| Staff Login | frontend/login.html | ✅ |

## Stack

- **Frontend**: Vanilla JS + HTML + CSS (dark theme)
- **Database + Auth**: Supabase (PostgreSQL + RLS)
- **PDF**: jsPDF (CDN)
- **WhatsApp**: MSG91 API via Cloudflare Worker
- **Email**: Resend API via Cloudflare Worker
- **Hosting**: Vercel (frontend) + Supabase (backend)

## Setup

### 1. Supabase
1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor → run contents of `database/schema.sql`
3. Copy your Project URL and `anon` key

### 2. Configure keys
Edit `frontend/js/supabase-config.js`:
```js
const SUPABASE_URL = 'https://xxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

### 3. Create first staff user
In Supabase → Authentication → Add user with email + password.

### 4. Run locally
Open `frontend/login.html` in browser (or use VS Code Live Server).

### 5. Deploy workers (optional — needed for WhatsApp + Email)
```bash
npx wrangler deploy workers/whatsapp-worker.js --name travel-ops-whatsapp
npx wrangler secret put MSG91_AUTH_KEY

npx wrangler deploy workers/email-worker.js --name travel-ops-email
npx wrangler secret put RESEND_API_KEY
```

## Monthly Cost (target ₹1,500–3,000)

| Service | Free Tier | Paid |
|---------|-----------|------|
| Supabase | 500MB DB, 50K rows | $25/mo if exceeded |
| Cloudflare Workers | 100K req/day | $5/mo |
| Resend (email) | 3,000/mo free | $20/mo for 50K |
| MSG91 (WhatsApp) | Pay-per-msg ~₹0.5 | — |
| Vercel | Free for static | — |

## Database Tables

- `staff_profiles` — login users
- `leads` — lead pipeline (new → booked)
- `lead_activities` — call/email/note log per lead
- `follow_ups` — scheduled follow-up tasks
- `clients` — converted customers with full profile
- `client_family`, `client_visas` — client sub-records
- `vendors` — hotels, airlines, transport, guides
- `vendor_pricing` — destination-specific rate cards
- `itineraries`, `itinerary_days`, `itinerary_items` — trip builder
- `invoices`, `invoice_payments` — GST billing + receipts
