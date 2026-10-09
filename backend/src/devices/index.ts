import { Router } from 'express';
import { supabaseAdmin } from '../database';
import { requireAuth, requireActiveDevice } from '../middleware/auth';

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

/**
 * POST /api/devices/session
 * Claims the SINGLE-DEVICE session for the signed-in user — latest login
 * wins: every other registered device is retired (is_active = false) and
 * this install becomes the active holder.
 *
 * Body: { deviceUuid, deviceName, platform: 'ios' | 'android' }
 */
devicesRouter.post('/session', async (req, res) => {
  const user = (req as any).user;
  const { deviceUuid, deviceName, platform } = req.body ?? {};

  if (!deviceUuid || typeof deviceUuid !== 'string' || deviceUuid.trim().length < 8) {
    return res.status(400).json({ error: 'deviceUuid (min 8 chars) is required.' });
  }
  if (!platform || !['ios', 'android'].includes(platform)) {
    return res.status(400).json({ error: "platform must be 'ios' or 'android'." });
  }

  const uuid = deviceUuid.trim();
  const name = typeof deviceName === 'string' && deviceName.trim() !== ''
    ? deviceName.trim().slice(0, 120)
    : 'Unknown device';

  // Preferred path: atomic RPC (migration focuslock_migration_single_device_session).
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('claim_device_session', {
    p_user_id: user.id,
    p_device_uuid: uuid,
    p_device_name: name,
    p_platform: platform,
  });

  if (!rpcError && rpcData) {
    return res.json({ device: rpcData, active: true });
  }

  // Fallback (pre-migration): two-step claim — retire others, upsert self.
  if (rpcError) {
    console.warn('[/devices/session] RPC unavailable, using fallback claim:', rpcError.message);
  }
  const nowIso = new Date().toISOString();

  const { error: retireError } = await supabaseAdmin
    .from('devices')
    .update({ is_active: false, updated_at: nowIso })
    .eq('user_id', user.id)
    .neq('device_uuid', uuid);

  if (retireError) {
    console.error('[/devices/session] retire failed:', retireError);
    return res.status(500).json({ error: 'Failed to claim device session.' });
  }

  const { data: existing } = await supabaseAdmin
    .from('devices')
    .select('id')
    .eq('user_id', user.id)
    .eq('device_uuid', uuid)
    .maybeSingle();

  const { data: device, error: upsertError } = existing
    ? await supabaseAdmin
        .from('devices')
        .update({
          device_name: name,
          platform,
          is_active: true,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
        .select()
        .single()
    : await supabaseAdmin
        .from('devices')
        .insert({
          user_id: user.id,
          device_uuid: uuid,
          device_name: name,
          platform,
          is_active: true,
          last_seen_at: nowIso,
        })
        .select()
        .single();

  if (upsertError) {
    console.error('[/devices/session] upsert failed:', upsertError);
    return res.status(500).json({ error: 'Failed to claim device session.' });
  }

  res.json({ device, active: true });
});

/**
 * GET /api/devices/session/status
 * Tells the caller whether THIS install is still the active session holder.
 * Requires headers: Authorization (Bearer) + x-device-uuid.
 */
devicesRouter.get('/session/status', async (req, res) => {
  const user = (req as any).user;
  const deviceUuid = req.headers['x-device-uuid'];

  if (!deviceUuid || typeof deviceUuid !== 'string') {
    return res.status(400).json({ error: 'x-device-uuid header is required.' });
  }

  const { data: device, error } = await supabaseAdmin
    .from('devices')
    .select('id, device_name, last_seen_at')
    .eq('user_id', user.id)
    .eq('device_uuid', deviceUuid.trim())
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[/devices/session/status] Supabase error:', error);
    return res.status(500).json({ error: 'Failed to check device session.' });
  }

  res.json({ active: !!device });
});

/**
 * POST /api/devices/register
 * Registers or updates a device for the authenticated user.
 * Enforced: only the ACTIVE session holder may register devices.
 */
devicesRouter.post('/register', requireActiveDevice, async (req, res) => {
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
devicesRouter.get('/', requireActiveDevice, async (req, res) => {
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
devicesRouter.patch('/:deviceId/heartbeat', requireActiveDevice, async (req, res) => {
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
