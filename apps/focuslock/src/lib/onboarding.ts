import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { syncOnboardingCompleteToBackend, fetchOnboardingStatusFromBackend } from './api';

const ONBOARDING_KEY = 'onboarding_completed';
const TERMS_ACCEPTED_KEY = 'terms_accepted_at';

function getUserOnboardingKey(userId?: string): string {
  return userId ? `${ONBOARDING_KEY}_${userId}` : ONBOARDING_KEY;
}

/**
 * Determines whether the user has completed onboarding.
 *
 * Accepts an optional `userCandidate` (e.g. directly returned by signInWithPassword
 * or onAuthStateChange) to avoid redundant network calls and race conditions.
 *
 * Checks in priority order:
 *  1. User candidate metadata (instant from login payload)
 *  2. User-scoped local AsyncStorage flag (instant local check)
 *  3. Active Supabase session / getUser() metadata
 *  4. Supabase `profiles.accepted_terms_at` database column
 *  5. Backend service-role `/api/users/onboarding-status` endpoint
 *  6. Global local AsyncStorage fallback
 */
export async function isOnboardingComplete(userCandidate?: any): Promise<boolean> {
  try {
    // 1. Direct candidate check (instant from signInWithPassword response)
    if (userCandidate) {
      const candidateMetaComplete =
        Boolean(userCandidate.user_metadata?.onboarding_completed) ||
        Boolean(userCandidate.user_metadata?.accepted_terms_at);

      if (candidateMetaComplete) {
        await AsyncStorage.setItem(getUserOnboardingKey(userCandidate.id), 'true').catch(() => {});
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
        return true;
      }

      // Check user-scoped local flag
      if (userCandidate.id) {
        const userFlag = await AsyncStorage.getItem(getUserOnboardingKey(userCandidate.id)).catch(() => null);
        if (userFlag === 'true') {
          return true;
        }
      }
    }

    // 2. Resolve current user from session or getUser()
    let activeUser = userCandidate;
    let accessToken: string | undefined;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session) {
        accessToken = sessionData.session.access_token;
        if (!activeUser) {
          activeUser = sessionData.session.user;
        }
      }
    } catch {
      // ignore
    }

    if (!activeUser) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          activeUser = userData.user;
        }
      } catch {
        // ignore
      }
    }

    // 3. Check active user metadata & user-scoped storage
    if (activeUser) {
      if (activeUser.id) {
        const userFlag = await AsyncStorage.getItem(getUserOnboardingKey(activeUser.id)).catch(() => null);
        if (userFlag === 'true') {
          return true;
        }
      }

      const metadataComplete =
        Boolean(activeUser.user_metadata?.onboarding_completed) ||
        Boolean(activeUser.user_metadata?.accepted_terms_at);

      if (metadataComplete) {
        if (activeUser.id) {
          await AsyncStorage.setItem(getUserOnboardingKey(activeUser.id), 'true').catch(() => {});
        }
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
        return true;
      }

      // 4. Query profiles database table directly
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('accepted_terms_at')
          .eq('id', activeUser.id)
          .maybeSingle();

        if (profile?.accepted_terms_at) {
          if (activeUser.id) {
            await AsyncStorage.setItem(getUserOnboardingKey(activeUser.id), 'true').catch(() => {});
          }
          await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});

          // Backfill user_metadata in background so future checks are instant
          supabase.auth.updateUser({
            data: {
              onboarding_completed: true,
              accepted_terms_at: profile.accepted_terms_at,
            },
          }).catch(() => {});

          return true;
        }
      } catch (err) {
        console.warn('[onboarding] profiles query check error:', err);
      }
    }

    // 5. Backend API check with service-role permissions
    if (accessToken) {
      try {
        const backendRes = await fetchOnboardingStatusFromBackend(accessToken);
        if (backendRes.data?.onboarded) {
          if (activeUser?.id) {
            await AsyncStorage.setItem(getUserOnboardingKey(activeUser.id), 'true').catch(() => {});
          }
          await AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
          return true;
        }
      } catch {
        // backend unavailable, continue to fallbacks
      }
    }

    // 6. Fast local fallback if no user was resolvable
    const localFlag = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
    if (localFlag === 'true') {
      return true;
    }

    return false;
  } catch (err) {
    console.warn('[onboarding] isOnboardingComplete caught error:', err);
    const localFlag = await AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null);
    return localFlag === 'true';
  }
}

/**
 * Marks onboarding as complete across all local, Supabase, and backend stores.
 * Guaranteed never to crash so the user is never stranded.
 */
export async function markOnboardingComplete(): Promise<void> {
  const timestamp = new Date().toISOString();

  // 1. Resolve current user & access token
  let activeUser: any = null;
  let accessToken: string | undefined;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      activeUser = sessionData.session.user;
      accessToken = sessionData.session.access_token;
    }
  } catch {
    // ignore
  }

  if (!activeUser) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      activeUser = userData?.user;
    } catch {
      // ignore
    }
  }

  // 2. Persist local AsyncStorage flags (both global and user-scoped)
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    await AsyncStorage.setItem(TERMS_ACCEPTED_KEY, timestamp);
    if (activeUser?.id) {
      await AsyncStorage.setItem(getUserOnboardingKey(activeUser.id), 'true');
    }
  } catch (e) {
    console.warn('[onboarding] Failed to save local onboarding flag:', e);
  }

  // 3. Persist in Supabase Auth user_metadata
  if (activeUser) {
    try {
      await supabase.auth.updateUser({
        data: {
          onboarding_completed: true,
          accepted_terms_at: timestamp,
        },
      });
    } catch (e) {
      console.warn('[onboarding] Supabase updateUser warning:', e);
    }

    // 4. Update profiles table directly
    try {
      await supabase
        .from('profiles')
        .update({ accepted_terms_at: timestamp } as any)
        .eq('id', activeUser.id);
    } catch (e) {
      console.warn('[onboarding] profiles table update warning:', e);
    }
  }

  // 5. Sync to backend via service-role endpoint
  if (accessToken) {
    syncOnboardingCompleteToBackend(accessToken).catch(() => {});
  }
}

/**
 * Clears the local onboarding flag (for sign-out or testing).
 */
export async function clearOnboardingFlag(userId?: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    await AsyncStorage.removeItem(TERMS_ACCEPTED_KEY);
    if (userId) {
      await AsyncStorage.removeItem(getUserOnboardingKey(userId));
    }
  } catch (e) {
    console.warn('[onboarding] Failed to clear onboarding flag:', e);
  }
}
