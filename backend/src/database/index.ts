import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
let supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// Repair key if the JWT header part was accidentally truncated during copy-paste
if (supabaseServiceKey && supabaseServiceKey.split('.').length === 2 && supabaseServiceKey.startsWith('eyJpc3M')) {
  supabaseServiceKey = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${supabaseServiceKey}`;
}

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

/**
 * Service-role Supabase client for the backend.
 * This bypasses Row Level Security — use ONLY server-side, never expose to clients.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
