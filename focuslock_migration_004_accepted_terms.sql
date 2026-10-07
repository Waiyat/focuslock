-- =======================================================================
-- FocusLock — Schema Migration 004: Add accepted_terms_at to profiles
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =======================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;

-- Verification
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'accepted_terms_at';
