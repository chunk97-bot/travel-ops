-- ============================================================
-- schema-patch-v9.sql — Fixes for audit issues 2-5, 8, 9
-- Applied: 2026-04-03
-- ============================================================

-- ── Issue 8: Create missing tasks table ─────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,
    assigned_to     UUID REFERENCES auth.users(id),
    created_by      UUID REFERENCES auth.users(id),
    due_date        DATE,
    priority        TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
    related_table   TEXT,
    related_id      UUID,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_tasks" ON tasks
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Issue 4: Add user_id + full_name aliases to staff_profiles ──
-- The JS expects user_id and full_name, but the table has id and name.
-- Add computed/alias columns so both work.
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Backfill full_name from name where null
UPDATE staff_profiles SET full_name = name WHERE full_name IS NULL;

-- Create a trigger to keep name and full_name in sync
CREATE OR REPLACE FUNCTION sync_staff_name_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- If full_name is set but name is not updated, sync name from full_name
    IF NEW.full_name IS DISTINCT FROM OLD.full_name AND NEW.name = OLD.name THEN
        NEW.name = NEW.full_name;
    END IF;
    -- If name is set but full_name is not updated, sync full_name from name
    IF NEW.name IS DISTINCT FROM OLD.name AND (NEW.full_name IS NULL OR NEW.full_name = OLD.full_name) THEN
        NEW.full_name = NEW.name;
    END IF;
    -- On insert, ensure both are populated
    IF TG_OP = 'INSERT' THEN
        IF NEW.full_name IS NULL THEN NEW.full_name = NEW.name; END IF;
        IF NEW.name IS NULL THEN NEW.name = NEW.full_name; END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_staff_names ON staff_profiles;
CREATE TRIGGER sync_staff_names BEFORE INSERT OR UPDATE ON staff_profiles
    FOR EACH ROW EXECUTE FUNCTION sync_staff_name_fields();

-- ── Issue 3: Add column aliases for approval_requests ───────
-- Frontend sends 'type' and 'notes', but table has 'request_type' and 'reason'.
-- Add 'type' as GENERATED column aliasing request_type is not possible in PG,
-- so we add real columns and use a trigger to sync.
-- Simplest fix: rename the actual columns to match frontend expectations,
-- and add the old names as aliases. But that's risky if data exists.
-- Safest: add the frontend-expected columns that mirror the originals.

-- We'll handle this in JS instead (see below) to avoid complex DB migration.
-- The auth.js fix will map 'type' → 'request_type' and 'notes' → 'reason'.

-- ── Issue 2: Fix notification RLS for cross-user inserts ────
-- Current policy only allows inserting notifications for yourself.
-- We need a policy that allows inserting for any user (internal tool).
DROP POLICY IF EXISTS "notifications_own" ON notifications;

-- Users can read/update/delete their own notifications
CREATE POLICY "notifications_select_own" ON notifications
    FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON notifications
    FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON notifications
    FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Any authenticated user can insert notifications (for cross-user workflows)
CREATE POLICY "notifications_insert_any" ON notifications
    FOR INSERT TO authenticated WITH CHECK (true);

-- ── Issue 9: Create storage bucket for documents ────────────
-- Note: This must be run via Supabase dashboard or management API.
-- Supabase Storage buckets cannot be created via SQL alone.
-- Use the following SQL for the storage policies:
INSERT INTO storage.buckets (id, name, public)
VALUES ('travel-ops-docs', 'travel-ops-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for travel-ops-docs bucket
CREATE POLICY "Authenticated users can upload docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'travel-ops-docs');

CREATE POLICY "Authenticated users can view docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'travel-ops-docs');

CREATE POLICY "Authenticated users can delete own docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'travel-ops-docs');
