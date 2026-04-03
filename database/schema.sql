-- ============================================================
-- TRAVEL OPS — Supabase Schema
-- Agency CRM + Itinerary Builder + Invoicing
-- ============================================================

-- STAFF / AUTH USERS (uses Supabase Auth)
-- auth.users is managed by Supabase — no need to create

-- ============================================================
-- VENDORS
-- ============================================================
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    region TEXT NOT NULL,                        -- Europe, Asia, Domestic, etc.
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    commission_percent NUMERIC(5,2) DEFAULT 15,
    payment_terms TEXT,                          -- e.g., '30 days credit', 'advance'
    contract_valid_until DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VENDOR PRICING (feeds itinerary builder)
-- ============================================================
CREATE TABLE vendor_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    destination TEXT NOT NULL,                   -- e.g., 'Paris', 'Thailand'
    nights INTEGER,
    category TEXT CHECK (category IN ('budget','mid','luxury')),
    hotel_name TEXT,
    hotel_per_night NUMERIC(10,2),               -- in INR
    transfer_cost NUMERIC(10,2),
    sightseeing_cost NUMERIC(10,2),              -- per pax per day
    meal_cp NUMERIC(10,2) DEFAULT 0,             -- Continental Plan per pax/day
    meal_map NUMERIC(10,2) DEFAULT 0,            -- MAP per pax/day
    meal_ap NUMERIC(10,2) DEFAULT 0,             -- All meals per pax/day
    visa_cost NUMERIC(10,2) DEFAULT 0,           -- per pax
    season TEXT,                                 -- 'peak', 'offseason', 'summer', 'winter'
    valid_from DATE,
    valid_until DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT CHECK (source IN ('instagram','whatsapp','website','referral','walk_in','phone','facebook','other')),
    destination TEXT,
    travel_date DATE,
    return_date DATE,
    pax_adults INTEGER DEFAULT 1,
    pax_children INTEGER DEFAULT 0,
    pax_infants INTEGER DEFAULT 0,
    budget_range TEXT,                           -- e.g., '1L-3L', '3L-6L', '6L+'
    trip_type TEXT CHECK (trip_type IN ('leisure','honeymoon','family','corporate','group','luxury','adventure')),
    stage TEXT CHECK (stage IN ('new','contacted','quoted','negotiating','confirmed','cancelled','lost')) DEFAULT 'new',
    lost_reason TEXT,
    lead_score INTEGER DEFAULT 0,                -- auto-calculated 0-100
    assigned_to UUID REFERENCES auth.users(id),
    referral_name TEXT,                          -- if source = referral
    notes TEXT,
    is_duplicate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead activity / communication log
CREATE TABLE lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES auth.users(id),
    type TEXT CHECK (type IN ('call','whatsapp','email','meeting','note','stage_change')),
    outcome TEXT,                                -- 'callback', 'quote_requested', 'booked', 'not_interested'
    notes TEXT,
    duration_mins INTEGER,                       -- for calls
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-up scheduler
CREATE TABLE follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES auth.users(id),
    due_date TIMESTAMPTZ NOT NULL,
    type TEXT CHECK (type IN ('call','whatsapp','email')),
    message TEXT,
    is_done BOOLEAN DEFAULT FALSE,
    is_auto BOOLEAN DEFAULT FALSE,               -- true = triggered by automation
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTS (converted leads)
-- ============================================================
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    passport_number TEXT,
    passport_expiry DATE,
    passport_country TEXT DEFAULT 'India',
    dob DATE,
    anniversary DATE,
    tag TEXT CHECK (tag IN ('hni','corporate','leisure','family','vip')) DEFAULT 'leisure',
    preferred_airline TEXT,
    preferred_hotel_category TEXT CHECK (preferred_hotel_category IN ('budget','mid','luxury')),
    preferred_room_type TEXT,
    total_trips INTEGER DEFAULT 0,
    total_spend NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family members linked to a client
CREATE TABLE client_family (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relation TEXT,                               -- spouse, child, parent
    dob DATE,
    passport_number TEXT,
    passport_expiry DATE
);

-- Visa history
CREATE TABLE client_visas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    country TEXT NOT NULL,
    visa_type TEXT,
    applied_date DATE,
    status TEXT CHECK (status IN ('applied','approved','rejected','expired')),
    expiry DATE,
    notes TEXT
);

-- ============================================================
-- ITINERARIES
-- ============================================================
CREATE TABLE itineraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id),
    client_id UUID REFERENCES clients(id),
    vendor_id UUID REFERENCES vendors(id),
    title TEXT NOT NULL,                         -- e.g., 'Europe 10N - Smith Family'
    destination TEXT NOT NULL,
    nights INTEGER NOT NULL,
    pax_adults INTEGER DEFAULT 1,
    pax_children INTEGER DEFAULT 0,
    hotel_category TEXT CHECK (hotel_category IN ('budget','mid','luxury')),
    include_visa BOOLEAN DEFAULT FALSE,
    include_flights BOOLEAN DEFAULT FALSE,
    include_transfers BOOLEAN DEFAULT TRUE,
    include_meals TEXT CHECK (include_meals IN ('none','cp','map','ap')) DEFAULT 'none',
    flight_cost_per_pax NUMERIC(10,2) DEFAULT 0,
    custom_margin_percent NUMERIC(5,2) DEFAULT 15,
    base_cost NUMERIC(12,2) DEFAULT 0,           -- auto-calculated
    margin_amount NUMERIC(12,2) DEFAULT 0,       -- auto-calculated
    gst_amount NUMERIC(12,2) DEFAULT 0,          -- 5% on tour packages
    total_price NUMERIC(12,2) DEFAULT 0,         -- final price quoted
    status TEXT CHECK (status IN ('draft','sent','accepted','rejected','expired')) DEFAULT 'draft',
    valid_until DATE,
    version INTEGER DEFAULT 1,
    parent_itinerary_id UUID REFERENCES itineraries(id), -- for versioning
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Day-by-day itinerary breakdown
CREATE TABLE itinerary_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    day_date DATE,
    title TEXT,                                  -- e.g., 'Paris - City Tour'
    hotel_name TEXT,
    hotel_location TEXT,
    transport TEXT,                              -- e.g., 'Private Transfer', 'Coach'
    meals TEXT,                                  -- 'Breakfast + Dinner'
    activities TEXT[],                           -- array of activity names
    notes TEXT
);

-- Line items per itinerary (for detailed costing)
CREATE TABLE itinerary_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id UUID REFERENCES itineraries(id) ON DELETE CASCADE,
    item_type TEXT CHECK (item_type IN ('hotel','transfer','sightseeing','visa','flight','meal','misc')),
    description TEXT NOT NULL,
    unit_cost NUMERIC(10,2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    per_pax BOOLEAN DEFAULT TRUE,
    total_cost NUMERIC(12,2) GENERATED ALWAYS AS (
        CASE WHEN per_pax THEN unit_cost * quantity ELSE unit_cost END
    ) STORED
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT UNIQUE NOT NULL,         -- e.g., 'INV-2026-0001'
    itinerary_id UUID REFERENCES itineraries(id),
    client_id UUID REFERENCES clients(id),
    invoice_date DATE DEFAULT CURRENT_DATE,
    travel_date DATE,
    pax_count INTEGER DEFAULT 1,
    base_amount NUMERIC(12,2) NOT NULL,
    gst_percent NUMERIC(4,2) DEFAULT 5,
    gst_amount NUMERIC(12,2),
    tcs_percent NUMERIC(4,2) DEFAULT 5,          -- TCS on foreign travel packages
    tcs_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    status TEXT CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled')) DEFAULT 'draft',
    due_date DATE,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment tracking per invoice
CREATE TABLE invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    mode TEXT CHECK (mode IN ('neft','upi','cash','cheque','card','online')),
    reference TEXT,                              -- UTR, cheque no., etc.
    notes TEXT,
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STAFF PROFILES
-- ============================================================
CREATE TABLE staff_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT CHECK (role IN ('admin','senior','executive','telecaller')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER itineraries_updated_at BEFORE UPDATE ON itineraries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Staff can read/write everything (auth.uid() must exist)
CREATE POLICY "staff_all" ON leads FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON clients FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON itineraries FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON invoices FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON vendors FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON vendor_pricing FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON follow_ups FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "staff_all" ON lead_activities FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- INVOICE NUMBER SEQUENCE
-- ============================================================
CREATE SEQUENCE invoice_seq START 1;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS TEXT AS $$
BEGIN
    RETURN 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
