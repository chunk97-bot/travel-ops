-- ============================================================
-- schema-patch-v7.sql — Multi-Currency, P&L, Approvals,
--   Commission Tiers, Vendor Rating, Quote Versioning,
--   Cancellation Policies, Receipt Enhancements, Aging
-- ============================================================

-- ── 1. MULTI-CURRENCY ────────────────────────────────────────

-- Live currency rates table (updated via API or manual entry)
CREATE TABLE IF NOT EXISTS currency_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency TEXT NOT NULL UNIQUE,
    rate_to_inr NUMERIC(14,4) NOT NULL DEFAULT 1,
    symbol TEXT DEFAULT '',
    name TEXT DEFAULT '',
    last_updated TIMESTAMPTZ DEFAULT now()
);

-- Seed default rates
INSERT INTO currency_rates (currency, rate_to_inr, symbol, name) VALUES
    ('INR', 1, '₹', 'Indian Rupee'),
    ('USD', 85.5, '$', 'US Dollar'),
    ('EUR', 92.3, '€', 'Euro'),
    ('GBP', 108.2, '£', 'British Pound'),
    ('AED', 23.3, 'د.إ', 'UAE Dirham'),
    ('SGD', 63.5, 'S$', 'Singapore Dollar'),
    ('THB', 2.45, '฿', 'Thai Baht'),
    ('MYR', 18.9, 'RM', 'Malaysian Ringgit'),
    ('AUD', 55.2, 'A$', 'Australian Dollar'),
    ('JPY', 0.57, '¥', 'Japanese Yen'),
    ('SAR', 22.8, 'ر.س', 'Saudi Riyal'),
    ('CHF', 96.5, 'CHF', 'Swiss Franc'),
    ('CAD', 62.1, 'C$', 'Canadian Dollar'),
    ('NZD', 50.8, 'NZ$', 'New Zealand Dollar'),
    ('LKR', 0.28, 'Rs', 'Sri Lankan Rupee'),
    ('IDR', 0.0054, 'Rp', 'Indonesian Rupiah'),
    ('PHP', 1.5, '₱', 'Philippine Peso'),
    ('VND', 0.0035, '₫', 'Vietnamese Dong'),
    ('KRW', 0.0625, '₩', 'South Korean Won'),
    ('ZAR', 4.65, 'R', 'South African Rand')
ON CONFLICT (currency) DO NOTHING;

-- Add currency columns to vendor_payments (if not exists)
DO $$ BEGIN
    ALTER TABLE vendor_payments ADD COLUMN currency TEXT DEFAULT 'INR';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendor_payments ADD COLUMN exchange_rate NUMERIC(12,4) DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendor_payments ADD COLUMN original_amount NUMERIC(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendor_payments ADD COLUMN amount_inr NUMERIC(12,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add currency columns to quotations (if not exists)
DO $$ BEGIN
    ALTER TABLE quotations ADD COLUMN currency TEXT DEFAULT 'INR';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE quotations ADD COLUMN exchange_rate NUMERIC(12,4) DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 2. APPROVAL WORKFLOWS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type TEXT NOT NULL CHECK (request_type IN (
        'expense', 'invoice', 'vendor_payment', 'quotation_discount', 'refund', 'commission'
    )),
    record_id UUID NOT NULL,
    record_table TEXT NOT NULL,
    requested_by UUID REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ DEFAULT now(),
    amount NUMERIC(12,2),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT
);

-- RLS for approval_requests
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view approvals" ON approval_requests
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert approvals" ON approval_requests
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update approvals" ON approval_requests
    FOR UPDATE TO authenticated USING (true);

-- ── 3. COMMISSION TIERS ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name TEXT NOT NULL,
    min_revenue NUMERIC(12,2) DEFAULT 0,
    max_revenue NUMERIC(12,2),
    commission_percent NUMERIC(5,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default commission tiers
INSERT INTO commission_tiers (tier_name, min_revenue, max_revenue, commission_percent) VALUES
    ('Bronze', 0, 500000, 3),
    ('Silver', 500001, 1500000, 5),
    ('Gold', 1500001, 3000000, 7),
    ('Platinum', 3000001, NULL, 10)
ON CONFLICT DO NOTHING;

-- Add target tracking columns to staff_commissions
DO $$ BEGIN
    ALTER TABLE staff_commissions ADD COLUMN tier_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE staff_commissions ADD COLUMN period TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Monthly staff targets tracking
CREATE TABLE IF NOT EXISTS staff_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES auth.users(id),
    month TEXT NOT NULL,
    target_amount NUMERIC(12,2) DEFAULT 0,
    achieved_amount NUMERIC(12,2) DEFAULT 0,
    commission_earned NUMERIC(12,2) DEFAULT 0,
    tier_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, month)
);

-- ── 4. VENDOR RATING & MANAGEMENT ───────────────────────────

DO $$ BEGIN
    ALTER TABLE vendors ADD COLUMN rating NUMERIC(3,1) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendors ADD COLUMN total_bookings INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendors ADD COLUMN total_revenue NUMERIC(14,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendors ADD COLUMN preferred BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendors ADD COLUMN contract_expiry DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE vendors ADD COLUMN payment_reliability TEXT DEFAULT 'good' CHECK (payment_reliability IN ('excellent','good','average','poor'));
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Vendor reviews/ratings from staff
CREATE TABLE IF NOT EXISTS vendor_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    booking_id UUID,
    reviewer_id UUID REFERENCES auth.users(id),
    rating INT CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 5. QUOTATION VERSIONING ─────────────────────────────────

DO $$ BEGIN
    ALTER TABLE quotations ADD COLUMN version INT DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE quotations ADD COLUMN parent_quote_id UUID;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE quotations ADD COLUMN change_notes TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Quote version history (snapshot of each version)
CREATE TABLE IF NOT EXISTS quote_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
    version INT NOT NULL,
    snapshot JSONB NOT NULL,
    change_notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. CANCELLATION POLICY TEMPLATES ────────────────────────

CREATE TABLE IF NOT EXISTS cancellation_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    rules JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- rules JSONB format: [
--   { "daysBeforeTravel": 30, "chargePercent": 10, "label": "30+ days" },
--   { "daysBeforeTravel": 15, "chargePercent": 25, "label": "15-30 days" },
--   { "daysBeforeTravel": 7,  "chargePercent": 50, "label": "7-15 days" },
--   { "daysBeforeTravel": 0,  "chargePercent": 100, "label": "<7 days" }
-- ]

-- Add policy reference to cancellations
DO $$ BEGIN
    ALTER TABLE cancellations ADD COLUMN policy_id UUID REFERENCES cancellation_policies(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE cancellations ADD COLUMN policy_rule_applied TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Seed default cancellation policies
INSERT INTO cancellation_policies (name, description, is_default, rules) VALUES
(
    'Standard Domestic',
    'Standard cancellation policy for domestic travel packages',
    true,
    '[
        {"daysBeforeTravel": 30, "chargePercent": 10, "label": "30+ days before travel"},
        {"daysBeforeTravel": 15, "chargePercent": 25, "label": "15-30 days before travel"},
        {"daysBeforeTravel": 7,  "chargePercent": 50, "label": "7-15 days before travel"},
        {"daysBeforeTravel": 3,  "chargePercent": 75, "label": "3-7 days before travel"},
        {"daysBeforeTravel": 0,  "chargePercent": 100, "label": "Less than 3 days / No-show"}
    ]'::jsonb
),
(
    'International Premium',
    'Policy for international packages with higher cancellation charges',
    false,
    '[
        {"daysBeforeTravel": 45, "chargePercent": 15, "label": "45+ days before travel"},
        {"daysBeforeTravel": 30, "chargePercent": 35, "label": "30-45 days before travel"},
        {"daysBeforeTravel": 15, "chargePercent": 50, "label": "15-30 days before travel"},
        {"daysBeforeTravel": 7,  "chargePercent": 75, "label": "7-15 days before travel"},
        {"daysBeforeTravel": 0,  "chargePercent": 100, "label": "Less than 7 days / No-show"}
    ]'::jsonb
),
(
    'Flexible',
    'Lenient policy for premium/VIP clients',
    false,
    '[
        {"daysBeforeTravel": 15, "chargePercent": 0, "label": "15+ days — Full refund"},
        {"daysBeforeTravel": 7,  "chargePercent": 15, "label": "7-15 days before travel"},
        {"daysBeforeTravel": 3,  "chargePercent": 30, "label": "3-7 days before travel"},
        {"daysBeforeTravel": 0,  "chargePercent": 50, "label": "Less than 3 days"}
    ]'::jsonb
)
ON CONFLICT DO NOTHING;

-- ── 7. BANK RECONCILIATION ──────────────────────────────────

CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date DATE NOT NULL,
    description TEXT,
    reference TEXT,
    debit NUMERIC(12,2) DEFAULT 0,
    credit NUMERIC(12,2) DEFAULT 0,
    balance NUMERIC(14,2),
    matched_type TEXT CHECK (matched_type IN ('invoice_payment', 'vendor_payment', 'expense', 'receipt', 'unmatched')),
    matched_id UUID,
    is_reconciled BOOLEAN DEFAULT false,
    imported_at TIMESTAMPTZ DEFAULT now(),
    notes TEXT
);

-- RLS
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage bank_transactions" ON bank_transactions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 8. RLS for new tables ────────────────────────────────────

ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read currency_rates" ON currency_rates
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage currency_rates" ON currency_rates
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE commission_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage commission_tiers" ON commission_tiers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE staff_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage staff_targets" ON staff_targets
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE vendor_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage vendor_reviews" ON vendor_reviews
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage quote_versions" ON quote_versions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE cancellation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage cancellation_policies" ON cancellation_policies
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Done!
