import { Router } from 'express';
import { supabaseAdmin } from '../database';
import { requireAuth } from '../middleware/auth';

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

/**
 * POST /api/devices/register
 * Registers or updates a device for the authenticated user.
 */
devicesRouter.post('/register', async (req, res) => {
  const user = (req as any).user;
  const { deviceName, platform, pushToken } = req.body;

  if (!deviceName || !platform) {
    return res.status(400).json({ error: 'deviceName and platform are required.' });
  }

  if (!['ios', 'android'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be ios or android.' });
  }

  const { data, error } = await supabaseAdmin
    .from('devices')
    .insert({
      user_id: user.id,
      device_name: deviceName,
      platform,
      push_token: pushToken ?? null,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('[/devices/register] Supabase error:', error);
    return res.status(500).json({ error: 'Failed to register device.' });
  }

  res.status(201).json(data);
});

/**
 * GET /api/devices
 * Lists all devices for the authenticated user.
 */
devicesRouter.get('/', async (req, res) => {
  const user = (req as any).user;

  const { data, error } = await supabaseAdmin
    .from('devices')
    .select('*')
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch devices.' });
  }

  res.json(data);
});

/**
 * PATCH /api/devices/:deviceId/heartbeat
 * Updates last_seen_at and optionally the push token.
 */
devicesRouter.patch('/:deviceId/heartbeat', async (req, res) => {
  const user = (req as any).user;
  const { deviceId } = req.params;
  const { pushToken } = req.body;

  const updates: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
  };
  if (pushToken !== undefined) updates.push_token = pushToken;

  const { error } = await supabaseAdmin
    .from('devices')
    .update(updates)
    .eq('id', deviceId)
    .eq('user_id', user.id);

  if (error) {
    return res.status(500).json({ error: 'Heartbeat update failed.' });
  }

  res.json({ message: 'Device heartbeat recorded.' });
});
