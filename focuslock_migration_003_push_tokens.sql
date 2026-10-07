-- =======================================================================
-- FocusLock — Schema Migration 003: Push Tokens & Usage Realtime
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =======================================================================

-- -----------------------------------------------------------------------
-- 1. ENSURE DEVICES TABLE IS COMPLETE
--    The devices table stores Expo push tokens per user+platform.
--    Adds unique constraint on (user_id, platform) for upsert support.
-- -----------------------------------------------------------------------

-- Add unique constraint if not already present (allows registerPushToken upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'devices_user_id_platform_key'
  ) THEN
    ALTER TABLE public.devices
      ADD CONSTRAINT devices_user_id_platform_key UNIQUE (user_id, platform);
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- 2. ENABLE REALTIME FOR DEVICES TABLE
--    So push token updates propagate instantly to backend workers.
-- -----------------------------------------------------------------------
ALTER TABLE public.devices REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- 3. PERFORMANCE INDEX ON used_seconds
--    Allows fast querying of locked/near-limit apps per user.
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_limits_used_seconds
  ON public.app_limits(user_id, used_seconds);

-- -----------------------------------------------------------------------
-- 4. ENSURE notification_preferences IS IN REALTIME PUBLICATION
-- -----------------------------------------------------------------------
ALTER TABLE public.notification_preferences REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notification_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- 5. VERIFY MIGRATION
-- -----------------------------------------------------------------------
SELECT
  c.conname AS constraint_name,
  t.tablename,
  t.pubname
FROM pg_constraint c
  CROSS JOIN pg_publication_tables t
WHERE c.conname = 'devices_user_id_platform_key'
  AND t.tablename IN ('devices', 'app_limits', 'notification_preferences')
  AND t.pubname = 'supabase_realtime';
