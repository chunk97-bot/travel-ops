-- ============================================================
-- schema-patch-v5.sql — 15 Enhancement Features
-- Run AFTER schema-patch-v4.sql
-- ============================================================

-- ── 1. Call Log table (Feature #9) ──────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      UUID REFERENCES leads(id) ON DELETE CASCADE,
    client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
    staff_id     UUID REFERENCES auth.users(id),
    phone        TEXT NOT NULL,
    direction    TEXT CHECK (direction IN ('outbound','inbound')) DEFAULT 'outbound',
    duration_sec INT DEFAULT 0,
    outcome      TEXT CHECK (outcome IN ('answered','no_answer','busy','voicemail','callback')) DEFAULT 'answered',
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_logs_auth" ON call_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Email log table (Feature #1) ────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
    client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
    staff_id     UUID REFERENCES auth.users(id),
    direction    TEXT CHECK (direction IN ('sent','received')) DEFAULT 'sent',
    to_email     TEXT NOT NULL,
    from_email   TEXT,
    subject      TEXT,
    body         TEXT,
    template_id  UUID,
    status       TEXT CHECK (status IN ('sent','delivered','opened','bounced','failed')) DEFAULT 'sent',
    opened_at    TIMESTAMPTZ,
    metadata     JSONB,
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_logs_auth" ON email_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Lead scoring fields (Feature #3) ────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_breakdown JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- ── 4. Activity timeline unified view (Feature #4) ─────
-- We'll query across: lead_activities, call_logs, email_logs, follow_ups, invoices, bookings
-- No new table needed — use client_id to join

-- ── 5. Workflow automation rules (Feature #7) ──────────
CREATE TABLE IF NOT EXISTS workflow_rules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    is_active    BOOLEAN DEFAULT true,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('lead_stage_change','lead_created','booking_created','invoice_overdue','follow_up_missed','client_birthday')),
    conditions   JSONB DEFAULT '{}',
    actions      JSONB NOT NULL DEFAULT '[]',
    created_by   UUID REFERENCES auth.users(id),
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE workflow_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_rules_auth" ON workflow_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 6. Web lead captures (Feature #2) ──────────────────
CREATE TABLE IF NOT EXISTS lead_captures (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id      TEXT NOT NULL DEFAULT 'default',
    name         TEXT NOT NULL,
    phone        TEXT,
    email        TEXT,
    destination  TEXT,
    travel_date  DATE,
    pax          INT DEFAULT 2,
    budget       TEXT,
    message      TEXT,
    source_url   TEXT,
    utm_source   TEXT,
    utm_medium   TEXT,
    utm_campaign TEXT,
    is_processed BOOLEAN DEFAULT false,
    lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE lead_captures ENABLE ROW LEVEL SECURITY;
-- Public insert (no auth needed for web forms), auth read
CREATE POLICY "lead_captures_public_insert" ON lead_captures FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "lead_captures_auth_all" ON lead_captures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 7. Multi-currency (Feature #14) ────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,4) DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2);

ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,4) DEFAULT 1;

-- ── 8. Calendar events (Feature #5) ────────────────────
-- We'll generate calendar from existing data: follow_ups, bookings (travel_date), tasks
-- No new table needed

-- ── 9. Notifications enhancements (Feature #11) ────────
-- notifications table already exists from schema-patch-v4.sql
-- Add link column if not exists
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT;

-- ── 10. Audit log enhancements (Feature #12) ───────────
-- audit_log already exists, just ensure metadata column
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_values JSONB;

-- ── Indexes for performance ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_client ON call_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON email_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_client ON email_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_lead_captures_processed ON lead_captures(is_processed);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_last_activity ON leads(last_activity_at DESC NULLS LAST);
