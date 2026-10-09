import { Router } from 'express';
import { supabaseAdmin } from '../database';
import { requireAuth, requireActiveDevice } from '../middleware/auth';

export const screenTimeRouter = Router();

screenTimeRouter.use(requireAuth);
// Single-device session enforcement — superseded devices get 409.
screenTimeRouter.use(requireActiveDevice);

/**
 * GET /api/screen-time/config
 * Returns all active app limits for the authenticated user.
 */
screenTimeRouter.get('/config', async (req, res) => {
  const user = (req as any).user;

  const { data: limits, error: limitsError } = await supabaseAdmin
    .from('app_limits')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (limitsError) {
    return res.status(500).json({ error: 'Failed to fetch screen time configuration.' });
  }

  const { data: window, error: windowError } = await supabaseAdmin
    .from('reset_windows')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (windowError && windowError.code !== 'PGRST116') {
    return res.status(500).json({ error: 'Failed to fetch reset window.' });
  }

  res.json({
    limits: limits ?? [],
    resetWindow: window ?? null,
  });
});

/**
 * POST /api/screen-time/config
 * Upserts an app limit during the allowed reset window.
 */
screenTimeRouter.post('/config', async (req, res) => {
  const user = (req as any).user;
  const { appBundleId, appDisplayName, dailyLimitSeconds } = req.body;

  if (!appBundleId || dailyLimitSeconds === undefined) {
    return res.status(400).json({ error: 'appBundleId and dailyLimitSeconds are required.' });
  }

  if (typeof dailyLimitSeconds !== 'number' || dailyLimitSeconds < 0) {
    return res.status(400).json({ error: 'dailyLimitSeconds must be a non-negative number.' });
  }

  const { data, error } = await supabaseAdmin
    .from('app_limits')
    .upsert({
      user_id: user.id,
      app_bundle_id: appBundleId,
      app_display_name: appDisplayName,
      daily_limit_seconds: dailyLimitSeconds,
      is_active: true,
    }, { onConflict: 'user_id,app_bundle_id' })
    .select()
    .single();

  if (error) {
    console.error('[POST /config] Supabase error:', error);
    return res.status(500).json({ error: 'Failed to save app limit.' });
  }

  res.status(201).json(data);
});

/**
 * DELETE /api/screen-time/config/:appBundleId
 * Soft-deletes (deactivates) an app limit.
 */
screenTimeRouter.delete('/config/:appBundleId', async (req, res) => {
  const user = (req as any).user;
  const { appBundleId } = req.params;

  const { error } = await supabaseAdmin
    .from('app_limits')
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('app_bundle_id', decodeURIComponent(appBundleId));

  if (error) {
    return res.status(500).json({ error: 'Failed to remove app limit.' });
  }

  res.json({ message: 'App limit deactivated.' });
});

/**
 * POST /api/screen-time/reset-window
 * Updates the reset window configuration.
 */
screenTimeRouter.post('/reset-window', async (req, res) => {
  const user = (req as any).user;
  const { resetTime, timezone, windowMinutes } = req.body;

  const { data, error } = await supabaseAdmin
    .from('reset_windows')
    .upsert({
      user_id: user.id,
      reset_time: resetTime ?? '08:00:00',
      timezone: timezone ?? 'UTC',
      window_minutes: windowMinutes ?? 30,
      is_active: true,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to update reset window.' });
  }

  res.json(data);
});
