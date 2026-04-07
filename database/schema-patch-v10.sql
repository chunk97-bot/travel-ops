-- ============================================================
-- schema-patch-v10.sql — Itinerary Enhancement + Voucher System
-- Run in Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ITINERARY_DAYS — Add rich activity/hotel/transfer fields
-- ─────────────────────────────────────────────────────────────

-- Hotel room details
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_star_rating INTEGER;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_room_type TEXT;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_room_size TEXT;         -- e.g. '322 sq.ft'
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_checkin TIME;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_checkout TIME;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_rating_score NUMERIC(2,1);  -- e.g. 4.2
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_rating_count INTEGER;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_amenities TEXT[];       -- ['Pool','Spa','Gym']
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS hotel_includes TEXT[];        -- ['Breakfast','Early Check-In']

-- Transfer details
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS transfer_vehicle TEXT;        -- 'Sedan', 'MUV', 'Coach'
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS transfer_vehicle_name TEXT;   -- 'Swift, Etios or Similar'
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS transfer_capacity INTEGER;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS transfer_ac BOOLEAN DEFAULT TRUE;
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS transfer_facilities TEXT[];   -- ['AC','2 Luggage Bags','First Aid']

-- Meal detail per day
ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS meal_details TEXT;            -- 'Breakfast at Sea Hills Hotel, Port Blair'

-- ─────────────────────────────────────────────────────────────
-- 2. ITINERARY_ACTIVITIES — Granular activity data (new table)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itinerary_activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    itinerary_id    UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
    day_id          UUID REFERENCES itinerary_days(id) ON DELETE CASCADE,
    day_number      INTEGER NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    name            TEXT NOT NULL,                -- 'Visit to Cellular Jail'
    description     TEXT,                         -- Full description paragraph
    duration_hours  NUMERIC(4,1),                 -- 2.0
    time_slot       TEXT CHECK (time_slot IN ('morning','afternoon','evening','anytime','full_day')),
    location        TEXT,                         -- 'Port Blair'
    inclusions      TEXT[],                       -- ['Entry Ticket to Cellular Jail']
    exclusions      TEXT[],                       -- ['Hotel Transfers','Guide Charges']
    created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE itinerary_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all" ON itinerary_activities FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- 3. ITINERARIES — Add flight, insurance, cancellation fields
-- ─────────────────────────────────────────────────────────────

-- Flight details
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_number TEXT;     -- '6E-6305'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_from TEXT;       -- 'HYD'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_to TEXT;         -- 'IXZ'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_depart TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_arrive TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_airline TEXT;    -- 'IndiGo'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_number TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_from TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_to TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_depart TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_arrive TIMESTAMPTZ;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_airline TEXT;

-- Baggage & layover
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_baggage TEXT;    -- '15kg check-in + 7kg cabin'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_outbound_layover TEXT;    -- 'Via Chennai, 2h layover'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_baggage TEXT;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS flight_return_layover TEXT;

-- Cover image
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS cover_image_url TEXT;            -- URL for PDF cover page

-- Insurance
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS insurance_provider TEXT;         -- 'Reliance'
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS insurance_cover_amount NUMERIC(12,2);  -- 500000
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS insurance_benefits JSONB;        -- {trip_delay: 1500, cancellation: 10000, baggage: 8500}

-- Cancellation policy
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS cancellation_policy TEXT CHECK (
    cancellation_policy IN ('non_refundable','standard_domestic','international_premium','flexible')
) DEFAULT 'standard_domestic';
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS date_change_allowed BOOLEAN DEFAULT TRUE;

-- Package highlight counters (auto-calculated, stored for PDF)
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS highlight_flights INTEGER DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS highlight_hotels INTEGER DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS highlight_activities INTEGER DEFAULT 0;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS highlight_transfers INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- 4. VOUCHERS — Full voucher tracking table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vouchers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_ref     TEXT UNIQUE NOT NULL,           -- VCH-2026-0001
    booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    service_id      UUID REFERENCES booking_services(id) ON DELETE SET NULL,
    voucher_type    TEXT NOT NULL CHECK (voucher_type IN ('hotel','flight','transfer','activity','visa','insurance','other')),
    guest_name      TEXT NOT NULL,
    guest_phone     TEXT,
    guest_email     TEXT,
    pax_count       INTEGER DEFAULT 1,
    -- Service-specific data (JSONB for flexibility)
    service_data    JSONB NOT NULL DEFAULT '{}',
    /*  service_data examples:
        Hotel:    { hotel_name, room_type, check_in, check_out, meals, conf_no, star_rating, address }
        Flight:   { airline, flight_no, from_city, from_code, to_city, to_code, depart, arrive, pnr, class }
        Transfer: { vehicle, vehicle_name, from, to, date, time, capacity, ac, facilities }
        Activity: { name, description, date, time_slot, duration, location, inclusions, exclusions }
    */
    inclusions      TEXT[],
    exclusions      TEXT[],
    special_notes   TEXT,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active','used','cancelled','expired')),
    generated_by    UUID REFERENCES auth.users(id),
    generated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS voucher_seq;
CREATE OR REPLACE FUNCTION next_voucher_ref() RETURNS TEXT AS $$
  SELECT 'VCH-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('voucher_seq')::TEXT, 4, '0');
$$ LANGUAGE SQL;

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_all" ON vouchers FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- 5. BOOKING_SERVICES — Add richer fields
-- ─────────────────────────────────────────────────────────────

ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS sell_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS supplier_conf TEXT;         -- Supplier confirmation number
ALTER TABLE booking_services ADD COLUMN IF NOT EXISTS service_data JSONB DEFAULT '{}';  -- Flexible structured data
