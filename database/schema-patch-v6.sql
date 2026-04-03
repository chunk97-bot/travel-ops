-- ============================================================
-- schema-patch-v6.sql — 9 Enhancement Features
-- Run AFTER schema-patch-v5.sql
-- ============================================================

-- ── 1. Client Tags (Feature: Client Segmentation & Tags) ──
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ── 2. Group Bookings ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_bookings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name   TEXT NOT NULL,
    lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
    client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
    destination  TEXT,
    travel_date  DATE,
    return_date  DATE,
    total_pax    INT DEFAULT 1,
    status       TEXT CHECK (status IN ('planning','confirmed','travelling','completed','cancelled')) DEFAULT 'planning',
    notes        TEXT,
    created_by   UUID REFERENCES auth.users(id),
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE group_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_bookings_auth" ON group_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS group_members (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_booking_id UUID REFERENCES group_bookings(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    phone            TEXT,
    email            TEXT,
    passport_number  TEXT,
    passport_expiry  DATE,
    room_type        TEXT CHECK (room_type IN ('single','double','triple','quad','child_with_parent')) DEFAULT 'double',
    meal_pref        TEXT CHECK (meal_pref IN ('veg','non_veg','jain','vegan','none')) DEFAULT 'non_veg',
    special_needs    TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members_auth" ON group_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. Post-Trip Feedback Collection ────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
    booking_id   UUID,
    invoice_id   UUID REFERENCES invoices(id) ON DELETE SET NULL,
    rating       INT CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    experience   TEXT CHECK (experience IN ('excellent','good','average','poor','terrible')),
    would_refer  BOOLEAN DEFAULT true,
    comments     TEXT,
    destination  TEXT,
    staff_rating INT CHECK (staff_rating >= 1 AND staff_rating <= 5),
    is_public    BOOLEAN DEFAULT false,
    created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_auth" ON feedback FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. Birthday/Anniversary Greetings Log ──────────────────
CREATE TABLE IF NOT EXISTS greeting_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
    type         TEXT CHECK (type IN ('birthday','anniversary')) NOT NULL,
    year         INT NOT NULL,
    sent_via     TEXT CHECK (sent_via IN ('whatsapp','email','sms','manual')) DEFAULT 'whatsapp',
    sent_by      UUID REFERENCES auth.users(id),
    created_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(client_id, type, year)
);
ALTER TABLE greeting_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "greeting_log_auth" ON greeting_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. Theme Preference (Feature: Dark/Light Toggle) ───────
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_group_bookings_status ON group_bookings(status);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_booking_id);
CREATE INDEX IF NOT EXISTS idx_feedback_client ON feedback(client_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback(rating);
CREATE INDEX IF NOT EXISTS idx_greeting_log_client ON greeting_log(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_tags ON clients USING GIN(tags);
