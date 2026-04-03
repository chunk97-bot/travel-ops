-- ============================================================
-- schema-patch-v4.sql — Run AFTER schema-patch-v3.sql
-- Adds: RBAC, staff_roles, notifications, audit_log,
--       quotes, client_tags, campaigns, vendor_ledger view,
--       client server-side pagination support
-- ============================================================

-- ── Staff Roles (RBAC) ────────────────────────────────────────
-- Roles: admin | sales | accounts | operations
ALTER TABLE staff_profiles
    ADD COLUMN IF NOT EXISTS role          TEXT DEFAULT 'sales'
        CHECK (role IN ('admin','sales','accounts','operations')),
    ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS last_login    TIMESTAMPTZ;

-- ── Login Audit Log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action      TEXT NOT NULL,  -- 'login','logout','view','create','update','delete'
    table_name  TEXT,
    record_id   UUID,
    metadata    JSONB,
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_read" ON audit_log
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_insert" ON audit_log
    FOR INSERT TO authenticated WITH CHECK (true);

-- ── In-App Notifications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN (
                    'follow_up_due','booking_departing','payment_overdue',
                    'birthday','anniversary','lead_assigned','general')),
    title       TEXT NOT NULL,
    body        TEXT,
    link        TEXT,     -- e.g. 'leads.html?id=...'
    is_read     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON notifications
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Client Tags ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    tag         TEXT NOT NULL,
    created_by  UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (client_id, tag)
);
ALTER TABLE client_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_tags_auth" ON client_tags
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Quotations ────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS quote_seq;
CREATE OR REPLACE FUNCTION next_quote_number() RETURNS TEXT AS $$
  SELECT 'QT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('quote_seq')::TEXT, 4, '0');
$$ LANGUAGE SQL;

CREATE TABLE IF NOT EXISTS quotations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number    TEXT UNIQUE NOT NULL DEFAULT next_quote_number(),
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    destination     TEXT,
    nights          INT DEFAULT 2,
    pax_count       INT DEFAULT 2,
    travel_date     DATE,
    valid_until     DATE,
    base_amount     NUMERIC(12,2) DEFAULT 0,
    discount        NUMERIC(12,2) DEFAULT 0,
    gst_percent     NUMERIC(5,2) DEFAULT 5,
    gst_amount      NUMERIC(12,2) DEFAULT 0,
    total_amount    NUMERIC(12,2) DEFAULT 0,
    inclusions      TEXT,
    exclusions      TEXT,
    notes           TEXT,
    itinerary       JSONB,   -- day-wise snapshot
    status          TEXT DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
    converted_to_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotations_auth" ON quotations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── WhatsApp Campaigns ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    channel         TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email','sms')),
    template_id     UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    audience        TEXT NOT NULL CHECK (audience IN (
                        'all_clients','segment_hni','segment_corporate','segment_leisure',
                        'balance_due','upcoming_trip','custom')),
    custom_filter   JSONB,  -- for custom audience
    message_body    TEXT NOT NULL,
    status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','running','completed','failed')),
    total_count     INT DEFAULT 0,
    sent_count      INT DEFAULT 0,
    failed_count    INT DEFAULT 0,
    scheduled_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
    phone       TEXT,
    status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    error       TEXT,
    sent_at     TIMESTAMPTZ
);
ALTER TABLE campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_auth"           ON campaigns           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "campaign_recipients_auth" ON campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Vendor Ledger View ────────────────────────────────────────
CREATE OR REPLACE VIEW vendor_ledger AS
SELECT
    v.id            AS vendor_id,
    v.name          AS vendor_name,
    v.category,
    COUNT(vp.id)    AS payment_count,
    COALESCE(SUM(vp.amount), 0)       AS total_billed,
    COALESCE(SUM(CASE WHEN vp.status = 'paid' THEN vp.amount ELSE 0 END), 0)  AS total_paid,
    COALESCE(SUM(CASE WHEN vp.status != 'paid' THEN vp.net_payable ELSE 0 END), 0) AS balance_due,
    COALESCE(SUM(vp.tds_amount), 0)   AS total_tds
FROM vendors v
LEFT JOIN vendor_payments vp ON vp.vendor_id = v.id
GROUP BY v.id, v.name, v.category;

-- ── Add assigned_to index on leads (for staff-wise filtering) ──
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_stage_idx        ON leads(stage);
CREATE INDEX IF NOT EXISTS clients_phone_idx      ON clients(phone);
CREATE INDEX IF NOT EXISTS clients_email_idx      ON clients(email);
CREATE INDEX IF NOT EXISTS clients_dob_idx        ON clients(dob);
CREATE INDEX IF NOT EXISTS clients_anniversary_idx ON clients(anniversary);

-- ── Function: generate notifications for today ─────────────────
-- Call this daily via a scheduled job or on dashboard load
CREATE OR REPLACE FUNCTION generate_daily_notifications()
RETURNS void AS $$
DECLARE
    today_mmdd TEXT := TO_CHAR(CURRENT_DATE, 'MM-DD');
    follow_rec RECORD;
    bday_rec   RECORD;
    ann_rec    RECORD;
    trip_rec   RECORD;
    pay_rec    RECORD;
BEGIN
    -- Follow-ups due today
    FOR follow_rec IN
        SELECT f.assigned_to, l.name AS lead_name, f.id
        FROM follow_ups f
        JOIN leads l ON l.id = f.lead_id
        WHERE f.status = 'pending' AND f.due_date = CURRENT_DATE
    LOOP
        INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (follow_rec.assigned_to, 'follow_up_due',
                'Follow-up due: ' || follow_rec.lead_name,
                'You have a follow-up scheduled for today.',
                'followups.html')
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Birthdays today
    FOR bday_rec IN
        SELECT c.id, c.name, c.dob
        FROM clients c
        WHERE TO_CHAR(c.dob, 'MM-DD') = today_mmdd AND c.dob IS NOT NULL
    LOOP
        INSERT INTO notifications (user_id, type, title, body, link)
        SELECT s.user_id, 'birthday',
               '🎂 Birthday: ' || bday_rec.name,
               'Wish them for a warm HNI touchpoint.',
               'clients.html'
        FROM staff_profiles s WHERE s.role IN ('admin','sales')
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Anniversaries today
    FOR ann_rec IN
        SELECT c.id, c.name
        FROM clients c
        WHERE TO_CHAR(c.anniversary, 'MM-DD') = today_mmdd AND c.anniversary IS NOT NULL
    LOOP
        INSERT INTO notifications (user_id, type, title, body, link)
        SELECT s.user_id, 'anniversary',
               '💍 Anniversary: ' || ann_rec.name,
               'Great opportunity to offer a getaway package.',
               'clients.html'
        FROM staff_profiles s WHERE s.role IN ('admin','sales')
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Trips departing in 3 days
    FOR trip_rec IN
        SELECT b.id, b.destination, b.travel_date,
               COALESCE(c.name, l.name) AS client_name, b.created_by
        FROM bookings b
        LEFT JOIN clients c ON c.id = b.client_id
        LEFT JOIN leads l ON l.id = b.lead_id
        WHERE b.travel_date = CURRENT_DATE + 3 AND b.status = 'confirmed'
    LOOP
        INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (trip_rec.created_by, 'booking_departing',
                '✈ Trip in 3 days: ' || trip_rec.client_name,
                trip_rec.destination || ' departs ' || TO_CHAR(trip_rec.travel_date, 'DD Mon YYYY'),
                'bookings.html')
        ON CONFLICT DO NOTHING;
    END LOOP;

END;
$$ LANGUAGE plpgsql;
