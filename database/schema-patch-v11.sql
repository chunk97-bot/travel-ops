-- ============================================================
-- schema-patch-v11.sql — 8 Feature Enhancement Patch
-- Run in Supabase SQL Editor after schema-patch-v10.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ADVANCE / PARTIAL PAYMENT MILESTONES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_payment_milestones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    milestone_type  TEXT NOT NULL CHECK (milestone_type IN ('advance','balance','final_settlement','refund')),
    label           TEXT NOT NULL,                       -- 'Advance 50%', 'Balance Due', 'Final Settlement'
    amount          NUMERIC(12,2) NOT NULL,
    due_date        DATE NOT NULL,
    paid_amount     NUMERIC(12,2) DEFAULT 0,
    paid_date       DATE,
    payment_mode    TEXT CHECK (payment_mode IN ('neft','upi','cash','cheque','card','bank_transfer')),
    payment_ref     TEXT,                                -- Transaction ID / UTR
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','overdue','waived')),
    reminder_sent   BOOLEAN DEFAULT FALSE,
    notes           TEXT,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE booking_payment_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_milestones" ON booking_payment_milestones FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Add payment summary columns to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_package_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_percent NUMERIC(5,2) DEFAULT 50;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','advance_received','partially_paid','fully_paid','refunded'));

-- ─────────────────────────────────────────────────────────────
-- 2. CUSTOMER-FACING QUOTATION SHARING
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_share_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id    UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    share_token     TEXT UNIQUE NOT NULL,                 -- Short random token for URL
    client_name     TEXT,
    client_email    TEXT,
    client_phone    TEXT,
    expires_at      TIMESTAMPTZ,
    view_count      INTEGER DEFAULT 0,
    last_viewed_at  TIMESTAMPTZ,
    client_response TEXT CHECK (client_response IN ('pending','accepted','rejected','changes_requested')),
    client_message  TEXT,                                 -- Client's feedback/change request
    responded_at    TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE itinerary_share_links ENABLE ROW LEVEL SECURITY;
-- Staff can manage links
CREATE POLICY "staff_all_share" ON itinerary_share_links FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
-- Public can read active links by token (for the share page)
CREATE POLICY "public_read_share" ON itinerary_share_links FOR SELECT TO anon USING (is_active = TRUE);

-- Allow anonymous users to update response
CREATE POLICY "public_respond_share" ON itinerary_share_links FOR UPDATE TO anon
    USING (is_active = TRUE)
    WITH CHECK (is_active = TRUE);

-- Allow anonymous read on itineraries via share token
CREATE POLICY "public_read_itinerary_via_share" ON itineraries FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM itinerary_share_links WHERE itinerary_id = itineraries.id AND is_active = TRUE)
);
CREATE POLICY "public_read_days_via_share" ON itinerary_days FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM itinerary_share_links sl WHERE sl.itinerary_id = itinerary_days.itinerary_id AND sl.is_active = TRUE)
);
CREATE POLICY "public_read_activities_via_share" ON itinerary_activities FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM itinerary_share_links sl WHERE sl.itinerary_id = itinerary_activities.itinerary_id AND sl.is_active = TRUE)
);

-- ─────────────────────────────────────────────────────────────
-- 3. PROFIT/LOSS PER BOOKING (Aggregated view)
-- ─────────────────────────────────────────────────────────────

-- Add profit tracking columns to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_vendor_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_sell_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS other_expenses NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS profit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(5,2) DEFAULT 0;

-- Create a view for booking P&L
CREATE OR REPLACE VIEW booking_pnl AS
SELECT
    b.id AS booking_id,
    b.booking_ref,
    b.destination,
    b.travel_date,
    COALESCE(cl.name, l.name) AS client_name,
    b.pax_count,
    b.status,
    COALESCE(SUM(bs.cost_price), 0) AS total_vendor_cost,
    COALESCE(SUM(bs.sell_price), 0) AS total_sell_price,
    COALESCE(inv.total_invoiced, 0) AS total_invoiced,
    COALESCE(inv.total_collected, 0) AS total_collected,
    COALESCE(exp.total_expenses, 0) AS other_expenses,
    COALESCE(inv.total_invoiced, 0) - COALESCE(SUM(bs.cost_price), 0) - COALESCE(exp.total_expenses, 0) AS net_profit,
    CASE WHEN COALESCE(inv.total_invoiced, 0) > 0
        THEN ROUND(((COALESCE(inv.total_invoiced, 0) - COALESCE(SUM(bs.cost_price), 0) - COALESCE(exp.total_expenses, 0)) * 100.0 / inv.total_invoiced), 1)
        ELSE 0 END AS profit_percent
FROM bookings b
LEFT JOIN clients cl ON b.client_id = cl.id
LEFT JOIN leads l ON b.lead_id = l.id
LEFT JOIN booking_services bs ON bs.booking_id = b.id
LEFT JOIN LATERAL (
    SELECT
        SUM(i.total_amount) AS total_invoiced,
        COALESCE(SUM(ip_agg.paid), 0) AS total_collected
    FROM invoices i
    LEFT JOIN LATERAL (
        SELECT SUM(ip.amount) AS paid FROM invoice_payments ip WHERE ip.invoice_id = i.id
    ) ip_agg ON TRUE
    WHERE i.client_id = b.client_id OR i.itinerary_id = b.itinerary_id
) inv ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(e.amount) AS total_expenses
    FROM expenses e
    WHERE e.description ILIKE '%' || b.booking_ref || '%'
) exp ON TRUE
GROUP BY b.id, b.booking_ref, b.destination, b.travel_date, cl.name, l.name, b.pax_count, b.status,
         inv.total_invoiced, inv.total_collected, exp.total_expenses;

-- ─────────────────────────────────────────────────────────────
-- 4. MULTI-CURRENCY SUPPORT
-- ─────────────────────────────────────────────────────────────

-- Itinerary currency fields
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,4) DEFAULT 1;  -- Rate to INR

-- Invoice currency fields
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12,4) DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_amount_inr NUMERIC(12,2);  -- For GST/TCS calc (always in INR)

-- Exchange rates cache
CREATE TABLE IF NOT EXISTS exchange_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_code   TEXT NOT NULL UNIQUE,
    rate_to_inr     NUMERIC(12,6) NOT NULL,
    fetched_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_rates" ON exchange_rates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- 5. APPROVAL WORKFLOW
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS approval_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL CHECK (entity_type IN ('itinerary','invoice','refund','discount','expense')),
    entity_id       UUID NOT NULL,
    requested_by    UUID NOT NULL REFERENCES auth.users(id),
    request_type    TEXT,                                    -- 'quote_above_threshold', 'refund', 'discount'
    amount          NUMERIC(12,2),                           -- Amount that triggered approval
    reason          TEXT,                                    -- Why approval is needed
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','auto_approved')),
    approved_by     UUID REFERENCES auth.users(id),
    approved_at     TIMESTAMPTZ,
    approver_notes  TEXT,                                    -- Approver's comment
    created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_approvals" ON approval_requests FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Approval thresholds in agency settings
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS approval_threshold_quote NUMERIC(12,2) DEFAULT 200000;  -- ₹2L
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS approval_threshold_discount NUMERIC(5,2) DEFAULT 10;     -- 10%
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS approval_threshold_refund NUMERIC(12,2) DEFAULT 50000;   -- ₹50K
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS approval_required BOOLEAN DEFAULT TRUE;

-- Add approval status to itineraries
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','approved','rejected'));
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- 6. (Mobile Responsive is CSS-only — no DB changes needed)
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 7. AUTOMATED PRE-TRAVEL REMINDERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pre_travel_reminders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    reminder_type   TEXT NOT NULL,                           -- 'document_check','payment_reminder','pre_travel_checklist','final_reminder','bon_voyage'
    send_date       DATE NOT NULL,
    message         TEXT NOT NULL,
    sent_at         TIMESTAMPTZ,
    status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','failed','cancelled')),
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pre_travel_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_ptr" ON pre_travel_reminders FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- 8. CUSTOMER FEEDBACK / NPS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    token           TEXT UNIQUE NOT NULL,                    -- For public feedback form URL
    nps_score       INTEGER CHECK (nps_score >= 0 AND nps_score <= 10),
    overall_rating  INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
    value_rating    INTEGER CHECK (value_rating >= 1 AND value_rating <= 5),
    categories      JSONB,                                   -- {hotel:4, transport:5, activities:3, ...}
    comment         TEXT,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
    submitted_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all_feedback" ON customer_feedback FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
-- Anonymous users can read feedback by token
CREATE POLICY "public_read_feedback" ON customer_feedback FOR SELECT TO anon
    USING (token IS NOT NULL);
-- Anonymous users can submit feedback (update pending → submitted)
CREATE POLICY "public_submit_feedback" ON customer_feedback FOR UPDATE TO anon
    USING (token IS NOT NULL AND status = 'pending')
    WITH CHECK (token IS NOT NULL);

-- Add NPS fields to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nps_score INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_feedback_date TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0;
