import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PRODUCTION_BACKEND_URL = 'https://focuslockapi.vercel.app';

/**
 * Dynamically resolves the backend base URL.
 * In standalone/APK builds, ALWAYS points to the production Vercel backend.
 * In local Expo development (__DEV__), allows Metro packager override.
 */
export function getBackendBaseUrl(): string {
  // 1. Explicit env variable is top priority
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Only during local development with active Metro packager, allow host IP
  if (__DEV__) {
    try {
      const hostUri =
        Constants.expoConfig?.hostUri ||
        (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
      const hostIp = hostUri ? hostUri.split(':')[0] : null;

      if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
        return `http://${hostIp}:4000`;
      }
    } catch {
      // ignore
    }
  }

  // 3. Guaranteed production URL for all APK and release builds
  return PRODUCTION_BACKEND_URL;
}

export type ApiResponse<T> = {
  data?: T;
  error?: string;
};

/**
 * Thrown when the deadline elapses. IMPORTANT: the request may still have
 * reached the server (e.g. an email was already sent) even though we timed
 * out — callers must use copy that reflects this.
 */
export class TimeoutError extends Error {
  constructor() {
    super('Request timed out. Please try again in a moment.');
    this.name = 'TimeoutError';
  }
}

const SEND_TIMEOUT_MESSAGE =
  'Request timed out — your code may still arrive in your inbox. ' +
  'Check there before requesting another one.';

// ---------------------------------------------------------------------------
// SINGLE-DEVICE SESSIONS — stable install id sent on every authenticated
// request (x-device-uuid). The provider is registered by src/lib/deviceSession
// so api.ts stays free of storage imports (no cycles).
// ---------------------------------------------------------------------------

let deviceUuidProvider: (() => Promise<string | null>) | null = null;

/** Registered once by deviceSession.ts — enables the x-device-uuid header. */
export function setDeviceUuidProvider(fn: () => Promise<string | null>) {
  deviceUuidProvider = fn;
}

async function deviceHeaders(): Promise<Record<string, string>> {
  try {
    const id = deviceUuidProvider ? await deviceUuidProvider() : null;
    return id ? { 'x-device-uuid': id } : {};
  } catch {
    return {};
  }
}

function connectionError(err: any, timeoutMessage?: string): string {
  if (err instanceof TimeoutError && timeoutMessage) return timeoutMessage;
  return err?.message || 'Cannot connect to server. Please check your connection.';
}

/** Safe fetch wrapper with timeout supported across all Hermes & JS runtimes */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new TimeoutError()), timeoutMs)
  );
  return Promise.race([fetch(url, options), timeoutPromise]);
}

async function handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
  try {
    const json = await res.json();
    if (!res.ok) {
      return { error: json.error || `Request failed with status ${res.status}` };
    }
    return { data: json };
  } catch {
    return { error: 'Network error. Please ensure the backend server is running.' };
  }
}

// -----------------------------------------------------------------------
// REGISTRATION OTP
// -----------------------------------------------------------------------

export interface RegisterRequestPayload {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export async function requestRegisterOtp(
  payload: RegisterRequestPayload
): Promise<ApiResponse<{ message: string; email: string; cooldownSeconds: number }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/auth/register-request`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      // Email delivery on a cold serverless backend can exceed the default
      // 8s — a premature "connection error" here caused users to re-submit
      // and receive duplicate codes.
      25000
    );
    return handleResponse<{ message: string; email: string; cooldownSeconds: number }>(res);
  } catch (err: any) {
    return { error: connectionError(err, SEND_TIMEOUT_MESSAGE) };
  }
}

export async function verifyRegisterOtp(
  email: string,
  code: string
): Promise<ApiResponse<{ message: string; userId: string; email: string; username: string }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/auth/register-verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      },
      20000
    );
    return handleResponse<{ message: string; userId: string; email: string; username: string }>(res);
  } catch (err: any) {
    return { error: connectionError(err, 'Verification timed out. Please try again.') };
  }
}

export async function resendRegisterOtp(
  email: string
): Promise<ApiResponse<{ message: string; cooldownSeconds: number; remainingSeconds?: number }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/auth/register-resend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
      25000
    );
    return handleResponse<{ message: string; cooldownSeconds: number; remainingSeconds?: number }>(res);
  } catch (err: any) {
    return { error: connectionError(err, SEND_TIMEOUT_MESSAGE) };
  }
}

// -----------------------------------------------------------------------
// FORGOT PASSWORD OTP
// -----------------------------------------------------------------------

export async function requestPasswordResetOtp(
  email: string
): Promise<ApiResponse<{ message: string; email: string; cooldownSeconds: number }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/auth/forgot-password-request`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) },
      25000
    );
    return handleResponse<{ message: string; email: string; cooldownSeconds: number }>(res);
  } catch (err: any) {
    return { error: connectionError(err, SEND_TIMEOUT_MESSAGE) };
  }
}

export async function verifyPasswordResetOtp(
  email: string,
  code: string
): Promise<ApiResponse<{ message: string; resetToken: string }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/auth/forgot-password-verify`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) },
      20000
    );
    return handleResponse<{ message: string; resetToken: string }>(res);
  } catch (err: any) {
    return { error: connectionError(err, 'Verification timed out. Please try again.') };
  }
}

export async function resendPasswordResetOtp(
  email: string
): Promise<ApiResponse<{ message: string; cooldownSeconds: number; remainingSeconds?: number }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/auth/forgot-password-resend`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) },
      25000
    );
    return handleResponse<{ message: string; cooldownSeconds: number; remainingSeconds?: number }>(res);
  } catch (err: any) {
    return { error: connectionError(err, SEND_TIMEOUT_MESSAGE) };
  }
}

export async function resetPasswordSubmit(payload: {
  email: string;
  resetToken?: string;
  code?: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ApiResponse<{ message: string }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(`${baseUrl}/api/auth/forgot-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Cannot connect to server. Please check your connection.' };
  }
}

// -----------------------------------------------------------------------
// FEEDBACK
// -----------------------------------------------------------------------

export interface SubmitFeedbackPayload {
  category: string;
  rating: number;
  message: string;
  replyEmail?: string;
  platform?: string;
  includeDiagnostics: boolean;
}

export async function submitFeedback(
  payload: SubmitFeedbackPayload
): Promise<ApiResponse<{ ok: boolean }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ ok: boolean }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Cannot connect to server. Please check your connection.' };
  }
}

// -----------------------------------------------------------------------
// ACCOUNT DELETION
// -----------------------------------------------------------------------

/**
 * Permanently deletes the authenticated user's account and all associated
 * data (app_limits, devices, usage_snapshots, reset_windows,
 * notification_preferences, profiles, auth.users).
 *
 * @param accessToken - The current Supabase session access token.
 */
export async function deleteAccount(accessToken: string): Promise<ApiResponse<{ message: string }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/users/account`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(await deviceHeaders()),
        },
      },
      10000
    );
    return handleResponse<{ message: string }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Cannot connect to server. Please check your connection.' };
  }
}

// ---------------------------------------------------------------------------
// SINGLE-DEVICE SESSIONS (latest login wins)
// ---------------------------------------------------------------------------

export type DeviceSessionPayload = {
  deviceUuid: string;
  deviceName: string;
  platform: 'ios' | 'android';
};

/**
 * Claims the account for THIS install — the backend retires every other
 * registered device (latest login wins).
 */
export async function registerDeviceSession(
  accessToken: string,
  payload: DeviceSessionPayload
): Promise<ApiResponse<{ active: boolean }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/devices/session`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
      10000
    );
    return handleResponse<{ active: boolean }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Cannot connect to server. Please check your connection.' };
  }
}

/** Returns whether THIS install is still the account's active device. */
export async function getDeviceSessionStatus(
  accessToken: string,
  deviceUuid: string
): Promise<ApiResponse<{ active: boolean }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/devices/session/status`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-device-uuid': deviceUuid,
        },
      },
      8000
    );
    return handleResponse<{ active: boolean }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Cannot connect to server. Please check your connection.' };
  }
}

// -----------------------------------------------------------------------
// ONBOARDING STATUS & SYNC
// -----------------------------------------------------------------------

export async function syncOnboardingCompleteToBackend(accessToken: string): Promise<ApiResponse<{ success: boolean; accepted_terms_at: string }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/users/onboarding-complete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(await deviceHeaders()),
        },
      },
      8000
    );
    return handleResponse<{ success: boolean; accepted_terms_at: string }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Failed to sync onboarding to backend.' };
  }
}

export async function fetchOnboardingStatusFromBackend(accessToken: string): Promise<ApiResponse<{ onboarded: boolean; accepted_terms_at: string | null }>> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetchWithTimeout(
      `${baseUrl}/api/users/onboarding-status`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(await deviceHeaders()),
        },
      },
      8000
    );
    return handleResponse<{ onboarded: boolean; accepted_terms_at: string | null }>(res);
  } catch (err: any) {
    return { error: err?.message || 'Failed to fetch onboarding status.' };
  }
}
