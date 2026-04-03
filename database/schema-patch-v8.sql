-- ============================================================
-- schema-patch-v8.sql — Advanced CRM Features:
--   Proforma Invoices, Payment Reminders, Supplier Inventory,
--   RFM Customer Scoring, Internal @Mentions, Brochures,
--   Pipeline SLA Timers, Margin Calculator columns,
--   Document Vault file upload
-- ============================================================

-- ── 1. PROFORMA INVOICES ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS proforma_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proforma_number TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES clients(id),
    booking_id UUID,
    lead_id UUID,
    itinerary_id UUID,
    base_amount NUMERIC(12,2) DEFAULT 0,
    gst_percent NUMERIC(5,2) DEFAULT 5,
    gst_amount NUMERIC(12,2) DEFAULT 0,
    tcs_percent NUMERIC(5,2) DEFAULT 0,
    tcs_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    exchange_rate NUMERIC(12,4) DEFAULT 1,
    validity_days INT DEFAULT 15,
    valid_until DATE,
    travel_date DATE,
    return_date DATE,
    pax_count INT DEFAULT 1,
    destination TEXT,
    notes TEXT,
    terms TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
    converted_invoice_id UUID,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Proforma line items
CREATE TABLE IF NOT EXISTS proforma_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proforma_id UUID REFERENCES proforma_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'service',
    quantity INT DEFAULT 1,
    unit_price NUMERIC(12,2) DEFAULT 0,
    amount NUMERIC(12,2) DEFAULT 0,
    sort_order INT DEFAULT 0
);

ALTER TABLE proforma_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users view proforma" ON proforma_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert proforma" ON proforma_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update proforma" ON proforma_invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users delete proforma" ON proforma_invoices FOR DELETE TO authenticated USING (true);

ALTER TABLE proforma_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage proforma items" ON proforma_items FOR ALL TO authenticated USING (true);

-- Add proforma reference to invoices
DO $$ BEGIN
    ALTER TABLE invoices ADD COLUMN proforma_id UUID REFERENCES proforma_invoices(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Auto-increment proforma number function
CREATE OR REPLACE FUNCTION next_proforma_number()
RETURNS TEXT AS $$
DECLARE
    yr TEXT := EXTRACT(YEAR FROM now())::TEXT;
    seq INT;
BEGIN
    SELECT COUNT(*) + 1 INTO seq FROM proforma_invoices
    WHERE proforma_number LIKE 'PI-' || yr || '-%';
    RETURN 'PI-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;


-- ── 2. PAYMENT REMINDERS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    proforma_id UUID REFERENCES proforma_invoices(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id),
    reminder_type TEXT DEFAULT 'email' CHECK (reminder_type IN ('email','whatsapp','both')),
    channel TEXT DEFAULT 'auto',
    amount_due NUMERIC(12,2),
    due_date DATE,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    reminder_count INT DEFAULT 1,
    escalation_level INT DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
    message_template TEXT,
    response_notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage reminders" ON payment_reminders FOR ALL TO authenticated USING (true);


-- ── 3. SUPPLIER INVENTORY / ALLOTMENTS ───────────────────────

CREATE TABLE IF NOT EXISTS supplier_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    inventory_name TEXT NOT NULL,
    destination TEXT,
    inventory_type TEXT DEFAULT 'room' CHECK (inventory_type IN ('room','seat','transfer','activity','package')),
    total_allotment INT DEFAULT 0,
    available INT DEFAULT 0,
    rate_per_unit NUMERIC(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    season TEXT DEFAULT 'regular',
    valid_from DATE,
    valid_until DATE,
    release_days INT DEFAULT 7,
    blocked_dates JSONB DEFAULT '[]',
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_allotments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID REFERENCES supplier_inventory(id) ON DELETE CASCADE,
    booking_id UUID,
    client_name TEXT,
    quantity INT DEFAULT 1,
    check_in DATE,
    check_out DATE,
    status TEXT DEFAULT 'held' CHECK (status IN ('held','confirmed','released','cancelled')),
    held_until TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE supplier_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage inventory" ON supplier_inventory FOR ALL TO authenticated USING (true);

ALTER TABLE supplier_allotments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage allotments" ON supplier_allotments FOR ALL TO authenticated USING (true);


-- ── 4. RFM CUSTOMER SCORING ─────────────────────────────────

DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN rfm_recency INT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN rfm_frequency INT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN rfm_monetary NUMERIC(14,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN rfm_score TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN rfm_segment TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN last_booking_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN total_bookings INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE clients ADD COLUMN total_spend NUMERIC(14,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- ── 5. INTERNAL @MENTIONS / COMMENTS ─────────────────────────

CREATE TABLE IF NOT EXISTS internal_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('lead','booking','invoice','quotation','client','task','vendor','proforma')),
    entity_id UUID NOT NULL,
    comment_text TEXT NOT NULL,
    mentions JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    parent_id UUID REFERENCES internal_comments(id),
    is_edited BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_entity ON internal_comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_mentions ON internal_comments USING GIN (mentions);

ALTER TABLE internal_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage comments" ON internal_comments FOR ALL TO authenticated USING (true);


-- ── 6. BROCHURES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brochures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    client_id UUID REFERENCES clients(id),
    itinerary_id UUID,
    destination TEXT,
    template_style TEXT DEFAULT 'classic' CHECK (template_style IN ('classic','modern','luxury','adventure','minimal')),
    cover_image_url TEXT,
    agency_logo_url TEXT,
    primary_color TEXT DEFAULT '#0078C8',
    sections JSONB DEFAULT '[]',
    inclusions TEXT,
    exclusions TEXT,
    terms TEXT,
    total_price NUMERIC(12,2),
    currency TEXT DEFAULT 'INR',
    share_url TEXT,
    is_public BOOLEAN DEFAULT false,
    views_count INT DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brochures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage brochures" ON brochures FOR ALL TO authenticated USING (true);


-- ── 7. PIPELINE SLA TIMERS ──────────────────────────────────

CREATE TABLE IF NOT EXISTS sla_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage TEXT NOT NULL UNIQUE,
    max_hours INT NOT NULL DEFAULT 24,
    warning_hours INT DEFAULT 12,
    escalation_to TEXT DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default SLA rules
INSERT INTO sla_config (stage, max_hours, warning_hours, escalation_to) VALUES
    ('new', 2, 1, 'admin'),
    ('contacted', 24, 12, 'admin'),
    ('quoted', 48, 24, 'admin'),
    ('negotiating', 72, 48, 'admin'),
    ('confirmed', 24, 12, 'operations')
ON CONFLICT (stage) DO NOTHING;

CREATE TABLE IF NOT EXISTS lead_sla_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    entered_at TIMESTAMPTZ DEFAULT now(),
    responded_at TIMESTAMPTZ,
    breached BOOLEAN DEFAULT false,
    breach_notified BOOLEAN DEFAULT false,
    assigned_to UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_lead ON lead_sla_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_sla_breached ON lead_sla_events(breached) WHERE breached = true;

ALTER TABLE sla_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users view sla config" ON sla_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manages sla config" ON sla_config FOR ALL TO authenticated USING (true);

ALTER TABLE lead_sla_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage sla events" ON lead_sla_events FOR ALL TO authenticated USING (true);


-- ── 8. MARGIN CALCULATOR COLUMNS ─────────────────────────────

DO $$ BEGIN
    ALTER TABLE bookings ADD COLUMN vendor_cost_total NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE bookings ADD COLUMN client_price NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE bookings ADD COLUMN margin_amount NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE bookings ADD COLUMN margin_percent NUMERIC(5,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- ── 9. DOCUMENT VAULT — FILE UPLOAD COLUMN ───────────────────

DO $$ BEGIN
    ALTER TABLE documents ADD COLUMN file_path TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE documents ADD COLUMN file_size INT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE documents ADD COLUMN mime_type TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- ── 10. BULK OPERATIONS AUDIT LOG ────────────────────────────

-- Uses existing audit_log table (from auth.js logAudit). No new table needed.
-- Bulk ops are tracked as action='bulk_update'/'bulk_delete' with metadata containing IDs.


-- ============================================================
-- END schema-patch-v8.sql
-- ============================================================
