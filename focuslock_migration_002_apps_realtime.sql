-- =======================================================================
-- FocusLock — Schema Migration 002: Realtime App Limits & Device Apps
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =======================================================================

-- -----------------------------------------------------------------------
-- 1. EXTEND APP_LIMITS
--    Adds category, icon emoji, and enforcement strictness.
-- -----------------------------------------------------------------------
ALTER TABLE public.app_limits
  ADD COLUMN IF NOT EXISTS category     text NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS icon_emoji   text NOT NULL DEFAULT '📱',
  ADD COLUMN IF NOT EXISTS strictness   text NOT NULL DEFAULT 'standard'
    CHECK (strictness IN ('standard', 'strict', 'extreme'));

-- Index on category and user for fast queries
CREATE INDEX IF NOT EXISTS idx_app_limits_user_category
  ON public.app_limits(user_id, category);

-- -----------------------------------------------------------------------
-- 2. ENABLE REALTIME PUBLICATION
--    Allows instant cross-device and in-app synchronization
--    when limits, reset windows, or usage are modified.
-- -----------------------------------------------------------------------

-- Ensure replica identity is full so updates provide complete row state
ALTER TABLE public.app_limits REPLICA IDENTITY FULL;
ALTER TABLE public.reset_windows REPLICA IDENTITY FULL;
ALTER TABLE public.usage_snapshots REPLICA IDENTITY FULL;

-- Safely add tables to supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_limits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_limits;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'reset_windows'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reset_windows;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'usage_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.usage_snapshots;
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- 3. PERMISSIONS / RLS VERIFICATION
-- -----------------------------------------------------------------------
-- Make sure users can select, insert, update, delete their own app_limits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_limits' AND policyname = 'Users own their app limits'
  ) THEN
    CREATE POLICY "Users own their app limits"
      ON public.app_limits FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Make sure users can select, insert, update their reset_windows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reset_windows' AND policyname = 'Users own their reset windows'
  ) THEN
    CREATE POLICY "Users own their reset windows"
      ON public.reset_windows FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- 4. VERIFY MIGRATION
-- -----------------------------------------------------------------------
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'app_limits' 
  AND column_name IN ('category', 'icon_emoji', 'strictness');
