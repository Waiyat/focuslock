import { Router } from 'express';
import { supabaseAdmin } from '../database';
import { requireAuth } from '../middleware/auth';

export const usersRouter = Router();

// All user routes require a valid JWT
usersRouter.use(requireAuth);

/**
 * GET /api/users/profile
 * Returns the authenticated user's profile from the profiles table.
 */
usersRouter.get('/profile', async (req, res) => {
  const user = (req as any).user;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, username, display_name, avatar_url, accepted_terms_at, created_at')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[/profile] Supabase error:', error);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }

  res.json(data);
});

/**
 * POST /api/users/onboarding-complete
 * Marks onboarding and terms acceptance as complete in both profiles table
 * and auth.users metadata with service-role privileges.
 */
usersRouter.post('/onboarding-complete', async (req, res) => {
  const user = (req as any).user;
  const timestamp = new Date().toISOString();

  try {
    // 1. Update profiles table
    await supabaseAdmin
      .from('profiles')
      .update({ accepted_terms_at: timestamp })
      .eq('id', user.id);

    // 2. Update auth.users metadata
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        onboarding_completed: true,
        accepted_terms_at: timestamp,
      },
    });

    console.log(`[/onboarding-complete] ✅ User ${user.id} marked as onboarded.`);
    return res.json({ success: true, accepted_terms_at: timestamp });
  } catch (err: any) {
    console.error('[/onboarding-complete] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to record onboarding completion.' });
  }
});

/**
 * GET /api/users/onboarding-status
 * Checks if the authenticated user has completed onboarding.
 */
usersRouter.get('/onboarding-status', async (req, res) => {
  const user = (req as any).user;

  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('accepted_terms_at')
      .eq('id', user.id)
      .maybeSingle();

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.id);

    const onboarded =
      Boolean(profile?.accepted_terms_at) ||
      Boolean(authUser?.user?.user_metadata?.onboarding_completed) ||
      Boolean(authUser?.user?.user_metadata?.accepted_terms_at);

    return res.json({
      onboarded,
      accepted_terms_at: profile?.accepted_terms_at || authUser?.user?.user_metadata?.accepted_terms_at || null,
    });
  } catch (err: any) {
    console.error('[/onboarding-status] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to check onboarding status.' });
  }
});

/**
 * PATCH /api/users/profile
 * Updates display name or avatar URL for the authenticated user.
 */
usersRouter.patch('/profile', async (req, res) => {
  const user = (req as any).user;
  const { displayName, avatarUrl } = req.body;

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) updates.display_name = displayName;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[PATCH /profile] Supabase error:', error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }

  res.json(data);
});

/**
 * POST /api/users/avatar
 * Uploads an avatar image using service-role privileges (bypasses storage RLS)
 * and updates profiles.avatar_url.
 */
usersRouter.post('/avatar', async (req, res) => {
  const user = (req as any).user;
  const { imageBase64, mimeType = 'image/jpeg', fileExt = 'jpg' } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64 data in request body.' });
  }

  try {
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    const safeExt = ['png', 'webp', 'gif'].includes(String(fileExt).toLowerCase()) ? String(fileExt).toLowerCase() : 'jpg';
    const safeMime = mimeType || (safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg');
    const filePath = `${user.id}/avatar_${Date.now()}.${safeExt}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: safeMime,
        upsert: true,
      });

    if (uploadError) {
      console.error('[POST /avatar] Upload error:', uploadError);
      return res.status(500).json({ error: uploadError.message || 'Storage upload failed.' });
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = publicData.publicUrl;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (profileError) {
      console.warn('[POST /avatar] Profile update warning:', profileError);
    }

    return res.json({ avatarUrl: publicUrl });
  } catch (err: any) {
    console.error('[POST /avatar] Exception:', err);
    return res.status(500).json({ error: err.message || 'Failed to process avatar upload.' });
  }
});

/**
 * DELETE /api/users/account
 * Permanently deletes the authenticated user's account and ALL associated data.
 *
 * Deletion order (explicit, before the irreversible auth deletion):
 *  1. app_limits
 *  2. usage_snapshots
 *  3. devices
 *  4. reset_windows
 *  5. notification_preferences
 *  6. profiles
 *  7. auth.users  — root deletion; all CASCADE FK constraints fire here anyway
 */
usersRouter.delete('/account', async (req, res) => {
  const user = (req as any).user;
  const userId = user.id as string;

  console.log('[DELETE /account] Permanently deleting user ' + userId);

  try {
    const tables = [
      'app_limits',
      'usage_snapshots',
      'devices',
      'reset_windows',
      'notification_preferences',
    ] as const;

    // Delete related rows - continue even if a table row does not exist
    for (const table of tables) {
      try {
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .eq('user_id', userId);
        if (error) {
          console.warn(`[DELETE /account] Warning on ${table}:`, error.message);
        }
      } catch (err) {
        console.warn(`[DELETE /account] Error on ${table}:`, err);
      }
    }

    // Delete profile row
    try {
      const { error: profileErr } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId);
      if (profileErr) {
        console.warn('[DELETE /account] Warning on profiles:', profileErr.message);
      }
    } catch (err) {
      console.warn('[DELETE /account] Error on profiles:', err);
    }

    // Crucial step: Delete the user from Supabase auth.users (irreversible)
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authErr) {
      console.error('[DELETE /account] Failed to delete auth user:', authErr);
      return res.status(500).json({ error: authErr.message || 'Failed to delete user from Supabase Auth.' });
    }

    console.log('[DELETE /account] User ' + userId + ' permanently deleted from auth.users.');
    return res.status(200).json({ message: 'Account permanently deleted.' });

  } catch (err: any) {
    console.error('[DELETE /account] Unexpected error:', err);
    return res.status(500).json({ error: err?.message || 'Server error during deletion.' });
  }
});
