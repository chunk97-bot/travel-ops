-- ============================================================
-- schema-patch-v2.sql — Run in Supabase SQL Editor
-- New tables: vendor_payments, bookings, documents,
--             expenses, staff_commissions, message_templates,
--             receipts, cancellations, tcs_tracker, agency_settings
-- ============================================================

-- ── Agency Settings (single row) ───────────────────────────
CREATE TABLE IF NOT EXISTS agency_settings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name  TEXT NOT NULL DEFAULT 'My Travel Agency',
    gstin         TEXT,
    pan           TEXT,
    address       TEXT,
    city          TEXT DEFAULT 'Bangalore',
    state         TEXT DEFAULT 'Karnataka',
    state_code    TEXT DEFAULT '29',
    phone         TEXT,
    email         TEXT,
    website       TEXT,
    bank_name     TEXT,
    bank_account  TEXT,
    bank_ifsc     TEXT,
    bank_branch   TEXT,
    logo_url      TEXT,
    updated_at    TIMESTAMPTZ DEFAULT now()
);
-- Only one row ever
INSERT INTO agency_settings (company_name) VALUES ('My Travel Agency')
ON CONFLICT DO NOTHING;

-- ── Bookings / Confirmations ────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref     TEXT UNIQUE NOT NULL,  -- e.g. BKG-2026-0001
    itinerary_id    UUID REFERENCES itineraries(id) ON DELETE SET NULL,
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    destination     TEXT NOT NULL,
    travel_date     DATE,
    return_date     DATE,
    pax_count       INT DEFAULT 1,
    status          TEXT DEFAULT 'confirmed'
                    CHECK (status IN ('tentative','confirmed','on_trip','completed','cancelled')),
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS booking_seq;
CREATE OR REPLACE FUNCTION next_booking_ref() RETURNS TEXT AS $$
  SELECT 'BKG-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('booking_seq')::TEXT, 4, '0');
$$ LANGUAGE SQL;

-- ── Booking Service Items (hotel/flight/transfer per booking) ──
CREATE TABLE IF NOT EXISTS booking_services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    service_type    TEXT NOT NULL CHECK (service_type IN ('hotel','flight','transfer','activity','visa','other')),
    vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
    description     TEXT,
    check_in        DATE,
    check_out       DATE,
    pnr             TEXT,         -- flight PNR or hotel confirmation
    voucher_ref     TEXT,
    cost_price      NUMERIC(12,2) DEFAULT 0,
    sell_price      NUMERIC(12,2) DEFAULT 0,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Vendor Payments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    booking_service_id UUID REFERENCES booking_services(id) ON DELETE SET NULL,
    amount          NUMERIC(12,2) NOT NULL,
    tds_percent     NUMERIC(5,2) DEFAULT 0,
    tds_amount      NUMERIC(12,2) DEFAULT 0,
    net_payable     NUMERIC(12,2) DEFAULT 0,
    payment_date    DATE,
    due_date        DATE,
    mode            TEXT CHECK (mode IN ('neft','rtgs','upi','cash','cheque','other')),
    reference       TEXT,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','partial','paid')),
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Documents / File Vault ──────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    doc_type        TEXT NOT NULL CHECK (doc_type IN (
                        'passport','visa','ticket','voucher','insurance',
                        'id_proof','invoice','other')),
    file_name       TEXT NOT NULL,
    file_url        TEXT,          -- Supabase Storage URL
    expiry_date     DATE,
    notes           TEXT,
    uploaded_by     UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Expenses (office / operational) ─────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        TEXT NOT NULL CHECK (category IN (
                        'salaries','rent','utilities','marketing','travel',
                        'office_supplies','software','commissions','misc')),
    description     TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    gst_amount      NUMERIC(12,2) DEFAULT 0,
    expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_to         TEXT,
    mode            TEXT CHECK (mode IN ('cash','upi','neft','card','cheque','other')),
    reference       TEXT,
    receipt_url     TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Staff Profiles & Commissions ────────────────────────────
-- staff_profiles already exists — add commission fields
ALTER TABLE staff_profiles
    ADD COLUMN IF NOT EXISTS commission_percent   NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monthly_target       NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS joining_date         DATE;

CREATE TABLE IF NOT EXISTS staff_commissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID NOT NULL REFERENCES auth.users(id),
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    amount          NUMERIC(12,2) NOT NULL,
    percent         NUMERIC(5,2),
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
    paid_date       DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Message Templates ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    channel         TEXT NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
    category        TEXT CHECK (category IN (
                        'booking_confirmation','payment_reminder','itinerary_share',
                        'follow_up','welcome','general')),
    subject         TEXT,          -- for email
    body            TEXT NOT NULL, -- use {{name}}, {{amount}}, {{destination}} placeholders
    is_active       BOOLEAN DEFAULT true,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed default templates
INSERT INTO message_templates (name, channel, category, body) VALUES
('Booking Confirmation (WhatsApp)', 'whatsapp', 'booking_confirmation',
 'Dear {{name}}, your booking for {{destination}} ({{travel_date}}) is confirmed! Booking Ref: {{booking_ref}}. Please keep this for your records. — {{agency_name}}'),
('Payment Reminder (WhatsApp)', 'whatsapp', 'payment_reminder',
 'Dear {{name}}, this is a friendly reminder that ₹{{balance}} is due towards your {{destination}} trip. Please make the payment at your earliest. — {{agency_name}}'),
('Itinerary Share (WhatsApp)', 'whatsapp', 'itinerary_share',
 'Dear {{name}}, your {{nights}}-night itinerary for {{destination}} is ready! We''ll send the detailed plan shortly. Reach us for any changes. — {{agency_name}}')
ON CONFLICT DO NOTHING;

-- ── Receipts (client payment acknowledgements) ───────────────
CREATE TABLE IF NOT EXISTS receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number  TEXT UNIQUE NOT NULL,
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    amount          NUMERIC(12,2) NOT NULL,
    payment_mode    TEXT CHECK (payment_mode IN ('cash','upi','neft','card','cheque','other')),
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    reference       TEXT,
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS receipt_seq;
CREATE OR REPLACE FUNCTION next_receipt_number() RETURNS TEXT AS $$
  SELECT 'RCP-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('receipt_seq')::TEXT, 4, '0');
$$ LANGUAGE SQL;

-- ── Cancellations / Refunds ──────────────────────────────────
CREATE TABLE IF NOT EXISTS cancellations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    reason          TEXT,
    cancellation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    cancellation_charges NUMERIC(12,2) DEFAULT 0,
    refund_amount   NUMERIC(12,2) DEFAULT 0,
    refund_status   TEXT DEFAULT 'pending' CHECK (refund_status IN ('pending','processing','completed','nil')),
    refund_date     DATE,
    refund_mode     TEXT CHECK (refund_mode IN ('cash','upi','neft','card','cheque','other')),
    refund_reference TEXT,
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── TCS Tracker ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tcs_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_pan      TEXT,
    quarter         TEXT NOT NULL,  -- e.g. 'Q1-FY2027'
    tcs_amount      NUMERIC(12,2) NOT NULL,
    deposited       BOOLEAN DEFAULT false,
    deposit_date    DATE,
    challan_ref     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── RLS Policies for new tables ──────────────────────────────
ALTER TABLE bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_commissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcs_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_settings      ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access (internal tool)
DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT unnest(ARRAY[
    'bookings','booking_services','vendor_payments','documents',
    'expenses','staff_commissions','message_templates','receipts',
    'cancellations','tcs_entries','agency_settings'
]) LOOP
    EXECUTE format('CREATE POLICY "auth_all_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
END LOOP; END $$;

-- ── Triggers ─────────────────────────────────────────────────
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
