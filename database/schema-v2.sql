-- ============================================================
-- schema-v2.sql — Travel Ops additional tables
-- Run in Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- ── BOOKINGS / CONFIRMATIONS ───────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id),
    client_id UUID REFERENCES clients(id),
    booking_type TEXT NOT NULL CHECK (booking_type IN ('hotel','flight','train','bus','activity','visa','transfer','other')),
    vendor_id UUID REFERENCES vendors(id),
    destination TEXT,
    service_name TEXT NOT NULL,
    check_in DATE,
    check_out DATE,
    travel_date DATE,
    pnr_number TEXT,
    confirmation_number TEXT,
    voucher_number TEXT,
    pax_count INT DEFAULT 1,
    cost_price NUMERIC(12,2) DEFAULT 0,  -- what we pay vendor
    sell_price NUMERIC(12,2) DEFAULT 0,  -- what we charge client
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('provisional','confirmed','cancelled','completed')),
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── VENDOR PAYMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id),
    itinerary_id UUID REFERENCES itineraries(id),
    amount NUMERIC(12,2) NOT NULL,
    tds_percent NUMERIC(5,2) DEFAULT 0,       -- TDS deduction %
    tds_amount NUMERIC(12,2) DEFAULT 0,
    net_paid NUMERIC(12,2),                    -- amount - tds
    payment_date DATE NOT NULL,
    due_date DATE,
    payment_mode TEXT CHECK (payment_mode IN ('neft','rtgs','upi','cash','cheque','card','online')),
    reference_number TEXT,
    status TEXT DEFAULT 'paid' CHECK (status IN ('pending','partial','paid')),
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── EXPENSES (office / staff) ──────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('rent','salary','marketing','travel','utilities','software','office','entertainment','miscellaneous')),
    sub_category TEXT,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    paid_by TEXT,                              -- staff name or "company"
    payment_mode TEXT,
    receipt_url TEXT,
    is_reimbursed BOOLEAN DEFAULT false,
    gst_eligible BOOLEAN DEFAULT false,
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── STAFF / COMMISSION ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID REFERENCES staff_profiles(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'sales' CHECK (role IN ('admin','sales','operations','accounts','manager')),
    monthly_target NUMERIC(12,2) DEFAULT 0,
    commission_percent NUMERIC(5,2) DEFAULT 5,  -- % of booking margin
    joining_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id),
    itinerary_id UUID REFERENCES itineraries(id),
    base_amount NUMERIC(12,2),                 -- sale value
    commission_percent NUMERIC(5,2),
    commission_amount NUMERIC(12,2),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
    paid_date DATE,
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── MESSAGE TEMPLATES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('whatsapp','email','sms')),
    category TEXT CHECK (category IN ('booking_confirmation','payment_reminder','itinerary','welcome','follow_up','cancellation','custom')),
    subject TEXT,                              -- email only
    body TEXT NOT NULL,
    variables TEXT[],                          -- e.g. ['{{client_name}}','{{destination}}']
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── RECEIPTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number TEXT UNIQUE NOT NULL,
    invoice_id UUID REFERENCES invoices(id),
    client_id UUID REFERENCES clients(id),
    lead_id UUID REFERENCES leads(id),
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_mode TEXT CHECK (payment_mode IN ('cash','upi','neft','rtgs','cheque','card','online')),
    reference_number TEXT,
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS receipt_seq START 1;
CREATE OR REPLACE FUNCTION next_receipt_number()
RETURNS TEXT AS $$
DECLARE seq_val INT;
BEGIN
    seq_val := nextval('receipt_seq');
    RETURN 'RCT-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(seq_val::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ── CANCELLATIONS / REFUNDS ────────────────────────────────
CREATE TABLE IF NOT EXISTS cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id),
    itinerary_id UUID REFERENCES itineraries(id),
    client_id UUID REFERENCES clients(id),
    lead_id UUID REFERENCES leads(id),
    cancellation_date DATE NOT NULL,
    reason TEXT,
    total_paid NUMERIC(12,2) DEFAULT 0,
    cancellation_charges NUMERIC(12,2) DEFAULT 0,
    refund_amount NUMERIC(12,2) DEFAULT 0,
    refund_status TEXT DEFAULT 'pending' CHECK (refund_status IN ('pending','processing','refunded','no_refund')),
    refund_date DATE,
    refund_mode TEXT,
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── TCS TRACKING ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tcs_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id),
    client_id UUID REFERENCES clients(id),
    client_pan TEXT,
    financial_year TEXT NOT NULL,              -- e.g. '2025-26'
    quarter TEXT NOT NULL CHECK (quarter IN ('Q1','Q2','Q3','Q4')),
    tcs_amount NUMERIC(12,2) NOT NULL,
    deposit_status TEXT DEFAULT 'pending' CHECK (deposit_status IN ('pending','deposited','filed')),
    challan_number TEXT,
    deposit_date DATE,
    notes TEXT,
    created_by UUID REFERENCES staff_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── DOCUMENT VAULT ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    lead_id UUID REFERENCES leads(id),
    booking_id UUID REFERENCES bookings(id),
    itinerary_id UUID REFERENCES itineraries(id),
    doc_type TEXT NOT NULL CHECK (doc_type IN ('passport','visa','ticket','voucher','insurance','id_proof','invoice','receipt','other')),
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INT,
    uploaded_by UUID REFERENCES staff_profiles(id),
    notes TEXT,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── TRIGGERS for updated_at ────────────────────────────────
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON message_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcs_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['bookings','vendor_payments','expenses','staff','commissions',
        'message_templates','receipts','cancellations','tcs_entries','documents']
    LOOP
        EXECUTE format('CREATE POLICY "auth_all_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
END $$;
