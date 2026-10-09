import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  getDeviceSessionStatus,
  registerDeviceSession,
  setDeviceUuidProvider,
} from './api';

/**
 * SINGLE-DEVICE SESSIONS (latest login wins).
 *
 * Each install owns a stable random UUID (persisted in SecureStore). On
 * sign-in the app CLAIMS the account for this install — the backend retires
 * every other device. On app start / foreground the app verifies it is still
 * the holder and signs out locally when superseded (and the backend rejects
 * its API calls regardless via requireActiveDevice).
 */

const DEVICE_UUID_KEY = 'focuslock_device_uuid';
let cachedUuid: string | null = null;

/** RFC-4122-ish v4 identifier (adequate for a client-generated install id). */
function randomUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable per-install id — generated once, persisted across launches. */
export async function getDeviceUuid(): Promise<string | null> {
  if (cachedUuid) return cachedUuid;
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_UUID_KEY);
    if (stored) {
      cachedUuid = stored;
      return stored;
    }
    const uuid = randomUuidV4();
    await SecureStore.setItemAsync(DEVICE_UUID_KEY, uuid);
    cachedUuid = uuid;
    return uuid;
  } catch {
    // SecureStore unavailable → header omitted; enforcement routes will
    // demand it, auth routes continue to work.
    return null;
  }
}

/** Honest device descriptor for the devices list (no fabricated models). */
export function getDeviceName(): string {
  const model = (Platform.constants as any)?.Model;
  if (Platform.OS === 'android') {
    return model ? `Android (${model})` : 'Android device';
  }
  return 'iOS device';
}

// Enable x-device-uuid on every authenticated api.ts request.
setDeviceUuidProvider(getDeviceUuid);

/**
 * Claims the account for THIS install after a successful sign-in.
 * Fire-and-forget safe: failures never block sign-in (the next foreground
 * check retries the claim via sign-in again only if superseded).
 */
export async function claimDeviceSession(accessToken: string): Promise<boolean> {
  try {
    const deviceUuid = await getDeviceUuid();
    if (!deviceUuid) return false;
    const res = await registerDeviceSession(accessToken, {
      deviceUuid,
      deviceName: getDeviceName(),
      platform: Platform.OS === 'android' ? 'android' : 'ios',
    });
    return !res.error;
  } catch {
    return false;
  }
}

/**
 * Returns whether this install is still the account's active device.
 * `null` = could not determine (offline / backend down) — callers must NEVER
 * sign the user out on null.
 */
export async function checkDeviceSessionStillActive(
  accessToken: string
): Promise<boolean | null> {
  try {
    const deviceUuid = await getDeviceUuid();
    if (!deviceUuid) return null;
    const res = await getDeviceSessionStatus(accessToken, deviceUuid);
    if (res.error || !res.data) return null;
    return res.data.active === true;
  } catch {
    return null;
  }
}