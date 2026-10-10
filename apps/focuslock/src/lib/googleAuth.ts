import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { isOnboardingComplete } from './onboarding';

// Required so the OAuth redirect returns to the app cleanly on web.
WebBrowser.maybeCompleteAuthSession();

/**
 * Native Google Sign-In (Google Identity Services for Android) lives in a
 * TurboModule that only exists in builds which ship it (`npx expo run:android`
 * / EAS builds). In Expo Go the module is absent, and a static import throws
 * `TurboModuleRegistry.getEnforcing(...): 'RNGoogleSignin' could not be found`
 * AT IMPORT TIME — crashing every route that imports this file (login and
 * register then fail with "missing the required default export").
 *
 * The package is therefore loaded lazily inside a try/catch:
 *  - Real builds: native sign-in behaves exactly as before.
 *  - Expo Go / builds without the module: Android falls back to the same
 *    browser flow iOS and web already use (both auth screens accept either
 *    response shape). Nothing is ever faked — see `nativePromptAsync`.
 */
type GoogleSigninPackage = typeof import('@react-native-google-signin/google-signin');

let googleSigninPackage: GoogleSigninPackage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  googleSigninPackage = require('@react-native-google-signin/google-signin') as GoogleSigninPackage;
} catch (err) {
  console.warn(
    '[googleAuth] Native Google Sign-In module unavailable in this build — ' +
      'using the browser flow instead.',
    err
  );
}

const GoogleSignin = googleSigninPackage?.GoogleSignin ?? null;
const statusCodes = googleSigninPackage?.statusCodes ?? {
  SIGN_IN_CANCELLED: -5,
  SIGN_IN_REQUIRED: -4,
};

/** True when this build contains the native Google Sign-In module (Android builds). */
export function isNativeGoogleSignInAvailable(): boolean {
  return Platform.OS === 'android' && GoogleSignin !== null;
}


/**
 * Google OAuth client IDs — supplied via Expo public env vars so no secrets
 * are hard-coded. Add these to apps/focuslock/.env (placeholders are already
 * present). Create them in Google Cloud Console → APIs & Services → Credentials:
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID      (OAuth client → Web application)
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID      (OAuth client → iOS)
 *   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID  (OAuth client → Android)
 */
export const googleClientIds = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

// Android signs in through Google Identity Services for Android (native),
// not the browser: no OAuth redirect is involved, so none of Google's
// redirect-URI policies apply. Google's documented ID-token pattern
// (requestIdToken) mints the token with aud = the Web client ID, which is
// exactly what Supabase's signInWithIdToken below verifies — so the rest of
// this file (Supabase auth, registration, onboarding, provisioning) is
// untouched. iOS and web keep the expo-auth-session browser flow as before
// and never touch the native SDK.
if (Platform.OS === 'android' && GoogleSignin) {
  const webClientId = googleClientIds.web;
  if (webClientId) {
    GoogleSignin.configure({ webClientId });
  }
}

/** True when at least one Google client id is configured. */
export function isGoogleConfigured(): boolean {
  return Boolean(googleClientIds.web || googleClientIds.ios || googleClientIds.android);
}

/**
 * Builds the Google sign-in prompt. Used by both login and register
 * screens — one "Continue with Google" covers sign-in AND sign-up.
 *
 * Android uses native Google Identity Services: `promptAsync` signs in via
 * Play Services, reads the ID token, and resolves the same response contract
 * as the browser flow (`type` + ID token at `authentication.idToken`), which
 * the screens already forward to `completeGoogleSignIn` unchanged.
 * iOS and web keep the expo-auth-session browser flow exactly as before.
 */
export function useGoogleAuthRequest(): [any, any, () => Promise<any>] {
  const [webRequest, webResponse, webPromptAsync] =
    Google.useIdTokenAuthRequest({
      clientId: googleClientIds.web,
      webClientId: googleClientIds.web,
      iosClientId: googleClientIds.ios,
      androidClientId: googleClientIds.android,
    });

  const [nativeResponse, setNativeResponse] = useState<any>(null);
  const nativePromptAsync = useCallback(async () => {
    if (!GoogleSignin) {
      // Unreachable in the normal flow (the caller falls back to the browser
      // prompt when the native module is missing) — but never fake a result.
      const error = new Error(
        'Google Sign-In needs a native build. Run `npx expo run:android` — Expo Go cannot load RNGoogleSignin.'
      );
      const result = { type: 'error', error };
      setNativeResponse(result);
      return result;
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      const result = { type: 'success', authentication: { idToken } };
      setNativeResponse(result);
      return result;
    } catch (err: any) {
      const cancelled = err?.code === statusCodes.SIGN_IN_CANCELLED;
      const result = { type: cancelled ? 'cancel' : 'error', error: err };
      setNativeResponse(result);
      return result;
    }
  }, []);

  // Android signs in natively ONLY when this build ships the native module
  // (real dev/prod builds — unchanged behavior). In Expo Go the module is
  // absent, so fall back to the same browser flow iOS and web use; both auth
  // screens already accept either response shape (`params.id_token` or
  // `authentication.idToken`). Hook order stays stable across all paths.
  if (isNativeGoogleSignInAvailable()) {
    return [webRequest, nativeResponse, nativePromptAsync];
  }
  return [webRequest, webResponse, webPromptAsync];
}

/**
 * Derives a clean, spec-compliant username (/^[a-zA-Z0-9_.]{3,30}$/) from the
 * Google profile — trimmed to the allowed characters, with a stable fallback
 * when the display name yields too few characters.
 */
export function deriveUsernameFromGoogle(user: any): string {
  const raw =
    user?.user_metadata?.user_name ||
    user?.user_metadata?.name ||
    (user?.email ? String(user.email).split('@')[0] : '') ||
    'user';
  let base = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 24);
  if (base.length < 3) {
    const tail = String(user?.id || '')
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 6)
      .toLowerCase();
    base = `user${tail}`.slice(0, 24);
  }
  return base;
}

export interface GoogleSignInResult {
  user: any;
  isNewUser: boolean;
}

/**
 * Completes a Google sign-in from a Google ID token.
 *
 * SECURITY: Supabase verifies the Google-issued ID token signature server-side
 * before creating a session, and Google only issues ID tokens for accounts
 * whose email is already verified — so the email is inherently verified.
 *
 * NEW accounts (never onboarded) are provisioned with a username trimmed from
 * the Google profile and must finish onboarding; EXISTING accounts return
 * straight to the dashboard.
 */
export async function completeGoogleSignIn(idToken: string): Promise<GoogleSignInResult> {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;

  const user = data?.user ?? data?.session?.user;
  if (!user) throw new Error('Google sign-in did not return a user.');

  const onboarded = await isOnboardingComplete(user);

  if (!onboarded) {
    // New Google account → provision a clean, trimmed username from Google data.
    const username = deriveUsernameFromGoogle(user);
    try {
      await supabase
        .from('profiles')
        .update({
          username,
          display_name:
            user.user_metadata?.full_name || user.user_metadata?.name || username,
          avatar_url: user.user_metadata?.avatar_url ?? undefined,
        })
        .eq('id', user.id);
    } catch {
      // Unique-username collision → keep the trigger's email-prefix username.
    }
  }

  return { user, isNewUser: !onboarded };
}
