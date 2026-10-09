import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

/**
 * Express middleware that:
 * 1. Reads the Bearer JWT from Authorization header
 * 2. Validates it against Supabase (uses the anon client + token)
 * 3. Attaches the verified user to req.user
 * 4. Rejects any tampered, expired or missing tokens — cannot be bypassed
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.substring(7);

  // Create a scoped client using the user's own JWT — Supabase validates signature + expiry
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }

  // Attach user to request for downstream handlers
  (req as any).user = user;
  next();
}

/**
 * Express middleware enforcing SINGLE-DEVICE sessions.
 *
 * Requires `requireAuth` to have run first. Reads the install's stable id
 * from the `x-device-uuid` header and verifies it is the user's ACTIVE
 * device (latest login wins — see claim_device_session). A superseded
 * device receives 409 DEVICE_SUPERSEDED and must sign in again.
 */
export async function requireActiveDevice(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const deviceUuid = req.headers['x-device-uuid'];

  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!deviceUuid || typeof deviceUuid !== 'string' || deviceUuid.trim() === '') {
    return res.status(403).json({
      error: 'Device session required. Missing x-device-uuid header.',
      code: 'DEVICE_REQUIRED',
    });
  }

  // User-scoped client — RLS lets a user read only their own devices.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.authorization! } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: device, error } = await supabase
    .from('devices')
    .select('id')
    .eq('user_id', user.id)
    .eq('device_uuid', deviceUuid.trim())
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[requireActiveDevice] Supabase error:', error);
    return res.status(500).json({ error: 'Could not verify device session.' });
  }
  if (!device) {
    return res.status(409).json({
      error: 'Signed in on another device. Sign in again to continue.',
      code: 'DEVICE_SUPERSEDED',
    });
  }

  (req as any).deviceUuid = deviceUuid.trim();
  next();
}
