import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import {
  registerDeviceSession,
  getDeviceSessionStatus,
  setDeviceUuidProvider,
  type DeviceSessionStatus,
} from './api';

const STORAGE_KEYS = {
  deviceUuid: 'fl_device_uuid',
  pendingClaim: 'fl_pending_claim',
} as const;

export type SessionStatus = 'active' | 'superseded' | 'unregistered';

export interface StatusResult {
  /** True when this install holds the single device session. */
  active: boolean;
  /** Tri-state for this install's row: active / superseded / unregistered. */
  status: SessionStatus;
  /** Name of the device that superseded us, when status is 'superseded'. */
  deviceName: string | null;
  /** Only set when status === 'unregistered': whether some other install
   * currently holds the session. Drives the re-claim vs sign-out decision. */
  anotherDeviceActive: boolean;
}

const isWeb = Platform.OS === 'web';

/** RFC-4122-ish v4 identifier (adequate for a client-generated install id). */
function randomUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Web is NOT supported by expo-secure-store (no-op), so installs get a
 * stable install UUID from localStorage. The backend cannot tell web
 * apart from other browsers, so every login on the same browser will
 * supersede the previous web session — the client handles that with
 * sign-out only on 'superseded', self-healing on 'unregistered'.
 */
async function getInstallUuid(): Promise<string | null> {
  if (!isWeb) return null;
  try {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(STORAGE_KEYS.deviceUuid);
    if (stored) return stored;
    const uuid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEYS.deviceUuid, uuid);
    return uuid;
  } catch {
    return null;
  }
}

/** Persisted so the dashboard knows a login claim was just attempted. */
export async function hasPendingClaim(): Promise<boolean> {
  if (!isWeb) return false;
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEYS.pendingClaim) === '1';
  } catch {
    return false;
  }
}

/** Set/clear the pending-claim flag (cleared on successful claim). */
export async function setPendingClaim(enabled: boolean): Promise<void> {
  if (!isWeb) return;
  try {
    if (typeof window === 'undefined') return;
    if (enabled) {
      window.localStorage.setItem(STORAGE_KEYS.pendingClaim, '1');
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.pendingClaim);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Stable per-install identifier for this (user, platform).
 * Mobile: persistent, scoped to this device (expo-secure-store is
 * device+OS-account bound). Web: per-browser install UUID.
 */
export async function getDeviceUuid(): Promise<string | null> {
  if (isWeb) return getInstallUuid();
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEYS.deviceUuid);
    if (stored) return stored;
    const uuid = randomUuidV4();
    await SecureStore.setItemAsync(STORAGE_KEYS.deviceUuid, uuid);
    return uuid;
  } catch {
    return null;
  }
}

// Enable x-device-uuid on every authenticated api.ts request.
setDeviceUuidProvider(getDeviceUuid);

/** Honest device descriptor for the devices list (no fabricated models). */
export function getDeviceName(): string {
  if (isWeb) return 'Web browser';
  const model = Device.modelName ?? (Platform.constants as any)?.Model;
  if (Platform.OS === 'android') {
    return model ? `Android (${model})` : 'Android device';
  }
  return model ? `iOS (${model})` : 'iOS device';
}

/** Platform value the backend accepts. Web reports as 'web', never 'ios'. */
export function getDevicePlatform(): 'ios' | 'android' | 'web' {
  if (isWeb) return 'web';
  return Platform.OS === 'android' ? 'android' : 'ios';
}

/**
 * Claim the account for THIS install after a successful sign-in.
 * Latest login always wins: the backend retires every other registered
 * device. Sets a pending-claim flag (cleared on success) so the dashboard
 * can distinguish "claim failed (re-claim)" from "no row because this
 * install predates the migration (self-heal)".
 */
export async function claimDeviceSession(
  accessToken: string,
  deviceName: string,
  platform: 'ios' | 'android' | 'web',
): Promise<boolean> {
  try {
    const deviceUuid = await getDeviceUuid();
    if (!deviceUuid) return false;
    const res = await registerDeviceSession(accessToken, {
      deviceUuid,
      deviceName,
      platform,
    });
    if (res.error) {
      console.warn('[claimDeviceSession] claim error:', res.error);
      setPendingClaim(true);
      return false;
    }
    await setPendingClaim(false);
    return true;
  } catch (err) {
    console.warn('[claimDeviceSession] request failed; will retry:', err);
    setPendingClaim(true);
    return false;
  }
}

/**
 * Returns the precise session status for the current install.
 * `null` never means "signed out" — network errors return active=true so
 * the app never signs itself out by accident.
 */
export async function getSessionStatus(
  accessToken: string,
): Promise<StatusResult> {
  const deviceUuid = await getDeviceUuid();
  if (!deviceUuid) {
    return { active: true, status: 'active', deviceName: null, anotherDeviceActive: false };
  }
  try {
    const res = await getDeviceSessionStatus(accessToken, deviceUuid);
    if (res.error) {
      console.warn('[getSessionStatus] status error:', res.error);
      return { active: true, status: 'active', deviceName: null, anotherDeviceActive: false };
    }
    const data = res.data ?? ({} as DeviceSessionStatus);
    const status: SessionStatus = data.status ?? 'active';
    return {
      active: data.active ?? status === 'active',
      status,
      deviceName: data.deviceName ?? null,
      anotherDeviceActive: data.anotherDeviceActive ?? false,
    };
  } catch (err) {
    // Network/parse error: keep the session — do NOT sign out.
    console.warn('[getSessionStatus] request failed, assuming active:', err);
    return { active: true, status: 'active', deviceName: null, anotherDeviceActive: false };
  }
}

/** Whether this install is still the active session holder. */
export async function checkDeviceSessionStillActive(
  accessToken: string,
): Promise<boolean> {
  const status = await getSessionStatus(accessToken);
  return status.active;
}
