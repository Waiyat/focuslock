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
 * Body: { deviceUuid, deviceName, platform: 'ios' | 'android' | 'web' }
 */
devicesRouter.post('/session', async (req, res) => {
  const user = (req as any).user;
  const { deviceUuid, deviceName, platform } = req.body ?? {};

  if (!deviceUuid || typeof deviceUuid !== 'string' || deviceUuid.trim().length < 8) {
    return res.status(400).json({ error: 'deviceUuid (min 8 chars) is required.' });
  }
  if (!platform || !['ios', 'android', 'web'].includes(platform)) {
    return res.status(400).json({ error: "platform must be 'ios', 'android' or 'web'." });
  }

  const uuid = deviceUuid.trim();
  const name = typeof deviceName === 'string' && deviceName.trim() !== ''
    ? deviceName.trim().slice(0, 120)
    : 'Unknown device';
  const nowIso = new Date().toISOString();

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

  // Fallback (pre-migration or RPC rejection): two-step claim — retire
  // others (INCLUDING legacy rows whose device_uuid IS NULL — plain .neq
  // never matches NULL in SQL), resolve the row by uuid OR platform, then
  // upsert. `devices` also has UNIQUE (user_id, platform) from migration
  // 003, so a platform-only legacy row must be updated, never duplicated.
  if (rpcError) {
    console.warn('[/devices/session] RPC unavailable, using fallback claim:', rpcError.message);
  }

  // 1) Retire every other install: different uuid OR missing uuid.
  const { error: retireError } = await supabaseAdmin
    .from('devices')
    .update({ is_active: false, updated_at: nowIso })
    .eq('user_id', user.id)
    .or(`device_uuid.neq.${uuid},device_uuid.is.null`);

  if (retireError) {
    console.error('[/devices/session] retire failed:', retireError);
    return res.status(500).json({ error: 'Failed to claim device session.' });
  }

  // 2) Find the row to own: exact uuid match first, then a legacy row for
  //    this platform with no install identity, which we adopt by writing
  //    our uuid onto it (UNIQUE (user_id, platform) forbids a second row).
  const { data: byUuid, error: byUuidError } = await supabaseAdmin
    .from('devices')
    .select('id')
    .eq('user_id', user.id)
    .eq('device_uuid', uuid)
    .maybeSingle();

  if (byUuidError) {
    console.error('[/devices/session] lookup by uuid failed:', byUuidError);
    return res.status(500).json({ error: 'Failed to claim device session.' });
  }

  const { data: legacy, error: legacyError } = await supabaseAdmin
    .from('devices')
    .select('id')
    .eq('user_id', user.id)
    .eq('platform', platform)
    .is('device_uuid', null)
    .limit(1)
    .maybeSingle();

  if (legacyError) {
    console.error('[/devices/session] legacy lookup failed:', legacyError);
    return res.status(500).json({ error: 'Failed to claim device session.' });
  }

  const targetId: string | null = byUuid?.id ?? legacy?.id ?? null;

  let resolvedId = targetId;
  if (!resolvedId) {
    // UNIQUE (user_id, platform): adopt any existing row for this platform
    // (e.g., another install on the same platform) instead of failing.
    const { data: platformRow, error: platformRowError } = await supabaseAdmin
      .from('devices')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .limit(1)
      .maybeSingle();
    if (platformRowError) {
      console.error('[/devices/session] platform lookup failed:', platformRowError);
      return res.status(500).json({ error: 'Failed to claim device session.' });
    }
    resolvedId = platformRow?.id ?? null;
  }

  const { data: device, error: upsertError } = resolvedId
    ? await supabaseAdmin
        .from('devices')
        .update({
          device_uuid: uuid,
          device_name: name,
          platform,
          is_active: true,
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', resolvedId)
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
 *
 * Precise tri-state so the client never signs itself out by accident:
 *   - "active"       → this install holds the session.
 *   - "superseded"   → this install HAD a row and was retired by a newer
 *                      login on another device → client must sign out.
 *   - "unregistered" → this install has NO row (its claim never landed).
 *                      NOT a supersession — the client should re-claim.
 *
 * Requires headers: Authorization (Bearer) + x-device-uuid.
 */
devicesRouter.get('/session/status', async (req, res) => {
  const user = (req as any).user;
  const deviceUuid = req.headers['x-device-uuid'];

  if (!deviceUuid || typeof deviceUuid !== 'string') {
    return res.status(400).json({ error: 'x-device-uuid header is required.' });
  }

  const uuid = deviceUuid.trim();

  const { data: exactRow, error: exactError } = await supabaseAdmin
    .from('devices')
    .select('id, device_name, is_active, last_seen_at')
    .eq('user_id', user.id)
    .eq('device_uuid', uuid)
    .maybeSingle();

  if (exactError) {
    console.error('[/devices/session/status] exact lookup failed:', exactError);
    return res.status(500).json({ error: 'Failed to check device session.' });
  }

  if (exactRow?.is_active) {
    return res.json({ status: 'active', active: true, deviceName: exactRow.device_name ?? null });
  }

  if (exactRow && !exactRow.is_active) {
    // We had a row and were retired → name whoever replaced us (for copy).
    const { data: holder } = await supabaseAdmin
      .from('devices')
      .select('device_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('device_uuid', 'is', null)
      .neq('device_uuid', uuid)
      .maybeSingle();
    return res.json({
      status: 'superseded',
      active: false,
      deviceName: holder?.device_name ?? null,
    });
  }

  // No row for this install — its claim never landed. A legacy NULL-uuid
  // row carries no install identity and does NOT count as registration.
  // Report whether someone else currently holds the session so the client
  // can decide between "re-claim" (I just logged in; latest wins) and
  // "sign out" (stale install, someone else is active).
  const { data: holder, error: holderError } = await supabaseAdmin
    .from('devices')
    .select('device_name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .not('device_uuid', 'is', null)
    .neq('device_uuid', uuid)
    .maybeSingle();

  if (holderError) {
    console.error('[/devices/session/status] holder lookup failed:', holderError);
    return res.status(500).json({ error: 'Failed to check device session.' });
  }

  return res.json({
    status: 'unregistered',
    active: false,
    deviceName: holder?.device_name ?? null,
    anotherDeviceActive: !!holder,
  });
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
