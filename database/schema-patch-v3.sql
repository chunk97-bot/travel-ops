-- ============================================================
-- schema-patch-v3.sql — Run AFTER schema-patch-v2.sql
-- Fixes: agency_settings columns, RLS policies for all new tables
-- ============================================================

-- ── Fix agency_settings to match settings.js ─────────────────
-- Drop and recreate with correct column names
DROP TABLE IF EXISTS agency_settings CASCADE;
CREATE TABLE agency_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    agency_name                 TEXT NOT NULL DEFAULT 'My Travel Agency',
    tagline                     TEXT,
    phone                       TEXT,
    email                       TEXT,
    address                     TEXT,
    website                     TEXT,
    logo_url                    TEXT,
    -- Tax
    gstin                       TEXT,
    pan_number                  TEXT,
    tan_number                  TEXT,
    iata_number                 TEXT,
    state                       TEXT DEFAULT 'Karnataka',
    default_gst_percent         NUMERIC(5,2) DEFAULT 5,
    default_tcs_percent         NUMERIC(5,2) DEFAULT 5,
    financial_year_start_month  INT DEFAULT 4,  -- April
    -- Bank
    bank_name                   TEXT,
    bank_account_number         TEXT,
    bank_ifsc                   TEXT,
    bank_account_type           TEXT DEFAULT 'current',
    upi_id                      TEXT,
    -- Invoice config
    invoice_prefix              TEXT DEFAULT 'INV',
    invoice_footer              TEXT,
    payment_terms_days          INT DEFAULT 7,
    currency                    TEXT DEFAULT 'INR',
    updated_at                  TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_settings_user_idx ON agency_settings(user_id);
ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_settings_auth" ON agency_settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — bookings ───────────────────────────────────
CREATE POLICY IF NOT EXISTS "bookings_auth" ON bookings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "booking_services_auth" ON booking_services
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — vendor_payments ───────────────────────────
CREATE POLICY IF NOT EXISTS "vendor_payments_auth" ON vendor_payments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — documents ─────────────────────────────────
CREATE POLICY IF NOT EXISTS "documents_auth" ON documents
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — expenses ──────────────────────────────────
CREATE POLICY IF NOT EXISTS "expenses_auth" ON expenses
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — staff_commissions ─────────────────────────
CREATE POLICY IF NOT EXISTS "staff_commissions_auth" ON staff_commissions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — message_templates ─────────────────────────
CREATE POLICY IF NOT EXISTS "message_templates_auth" ON message_templates
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — receipts ───────────────────────────────────
CREATE POLICY IF NOT EXISTS "receipts_auth" ON receipts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — cancellations ─────────────────────────────
CREATE POLICY IF NOT EXISTS "cancellations_auth" ON cancellations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RLS Policies — tcs_entries ───────────────────────────────
CREATE POLICY IF NOT EXISTS "tcs_entries_auth" ON tcs_entries
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
