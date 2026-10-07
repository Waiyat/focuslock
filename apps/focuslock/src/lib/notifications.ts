import { Platform } from 'react-native';
import type * as NotificationsType from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
// Note: playNotificationFeedback intentionally removed — OS handles notification sounds.

export interface InAppNotificationPayload {
  id: string;
  title: string;
  body: string;
  type?: 'locked' | 'warning' | 'info';
  timestamp: string;
  data?: Record<string, any>;
}

type NotificationListener = (notification: InAppNotificationPayload) => void;
const listeners = new Set<NotificationListener>();

let isInitialized = false;
let _Notifications: typeof NotificationsType | null = null;

/**
 * Checks if running inside Expo Go on Android where remote push was removed in SDK 53+.
 */
function isExpoGoAndroid(): boolean {
  return (
    Platform.OS === 'android' &&
    (isRunningInExpoGo() ||
      Constants.appOwnership === 'expo' ||
      (Constants as any).executionEnvironment === 'storeClient')
  );
}

/**
 * Lazily load expo-notifications only when supported and safe to avoid
 * Expo Go Android SDK 53+ module-init crash (DevicePushTokenAutoRegistration).
 */
function getNotifications(): typeof NotificationsType | null {
  if (isExpoGoAndroid()) {
    return null;
  }
  if (!_Notifications) {
    try {
      _Notifications = require('expo-notifications');
    } catch (e) {
      console.warn('[Notifications] Failed to load expo-notifications:', e);
      return null;
    }
  }
  return _Notifications;
}

/**
 * Configure notifications handler and create Android notification channel.
 */
export async function initNotifications() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const notif = getNotifications();
    if (!notif) {
      console.info('[Notifications] Running in Expo Go on Android — remote push APIs safely bypassed.');
      return;
    }

    notif.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false, // OS manages notification sounds; we don't duplicate them in-app
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: notif.AndroidNotificationPriority.HIGH,
      }),
    });

    if (Platform.OS === 'android') {
      await notif.setNotificationChannelAsync('focuslock-enforcement', {
        name: 'FocusLock Enforcement Alerts',
        importance: notif.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#84cc16',
        lockscreenVisibility: notif.AndroidNotificationVisibility.PUBLIC,
        // No custom sound — the OS default channel sound is used
      }).catch(() => {});
    }

    await requestNotificationPermissions().catch(() => false);
  } catch (err) {
    console.warn('[Notifications] Setup notice:', err);
  }
}

/**
 * Query current notification permission status safely across platforms.
 */
export async function getNotificationPermissionStatus(): Promise<string> {
  try {
    const notif = getNotifications();
    if (!notif) {
      return 'granted';
    }
    const { status } = await notif.getPermissionsAsync();
    return status;
  } catch (err) {
    console.warn('[Notifications] Permission check notice:', err);
    return 'granted';
  }
}

/**
 * Request notification permissions from device OS.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const notif = getNotifications();
    if (!notif) {
      return true; // Bypass in Expo Go Android to avoid SDK 53 remote push error
    }

    const { status: existingStatus } = await notif.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await notif.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowProvisional: true,
        },
      });
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.warn('[Notifications] Permission check notice:', err);
    return false;
  }
}

/**
 * Register this device's Expo push token in the `devices` table.
 * Called once after login. In Expo Go on Android, push tokens are bypassed.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  try {
    const notif = getNotifications();
    if (!notif) {
      console.info('[Push] Expo Go on Android detected — push token skipped (use development build for remote push).');
      return null;
    }

    // Push tokens only work on real physical devices
    if (!Device.isDevice) {
      console.info('[Push] Running on simulator — push token skipped');
      return null;
    }

    const granted = await requestNotificationPermissions();
    if (!granted) {
      console.info('[Push] Permission not granted');
      return null;
    }

    // Get Expo push token safely
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 'focuslock-app';
    const tokenData = await notif.getExpoPushTokenAsync({ projectId }).catch(() => null);
    const token = tokenData?.data;

    if (!token) return null;

    // Upsert into `devices` table
    const deviceName = Device.deviceName ?? `${Platform.OS} device`;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    const { error } = await supabase
      .from('devices')
      .upsert(
        {
          user_id: userId,
          device_name: deviceName,
          platform,
          push_token: token,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,platform',
          ignoreDuplicates: false,
        }
      );

    if (error) {
      console.warn('[Push] Failed to save token:', error.message);
    } else {
      console.info('[Push] Token registered:', token.slice(0, 30) + '...');
    }

    return token;
  } catch (err: any) {
    console.warn('[Push] Token registration skipped:', err?.message);
    return null;
  }
}

/**
 * Subscribe a component to in-app alerts.
 */
export function subscribeInAppNotifications(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Dispatches BOTH an in-app banner AND a local system push notification.
 */
export async function dispatchNotification({
  title,
  body,
  type = 'info',
  data,
}: {
  title: string;
  body: string;
  type?: 'locked' | 'warning' | 'info';
  data?: Record<string, any>;
}): Promise<InAppNotificationPayload> {
  const payload: InAppNotificationPayload = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
    type,
    timestamp: 'NOW',
    data,
  };

  // Broadcast to in-app banner listeners (no haptic/sound — OS handles those)
  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (err) {
      console.warn('[InAppNotification Error]:', err);
    }
  });

  // 3. Schedule local push notification (if supported)
  try {
    const notif = getNotifications();
    if (notif) {
      await notif.scheduleNotificationAsync({
        content: {
          title,
          body,
          // No custom sound — system default sound is managed by the OS
          badge: 1,
          color: '#09090b',
          data: { ...data, type },
        },
        trigger: null, // deliver immediately
      });
    }
  } catch (err) {
    console.warn('[System Notification Dispatch Note]:', err);
  }

  return payload;
}

/**
 * App limit exhausted & locked
 */
export function notifyAppLocked(
  appName: string,
  limitFormatted: string,
  resetTime: string = '08:00 AM'
) {
  return dispatchNotification({
    title: `${appName} Locked`,
    body: `Daily allowance (${limitFormatted}) depleted. FocusLock active until ${resetTime}.`,
    type: 'locked',
    data: { appName, action: 'locked' },
  });
}

/**
 * App approaching daily limit
 */
export function notifyAppWarning(appName: string, remainingFormatted: string) {
  return dispatchNotification({
    title: `${appName} Approaching Limit`,
    body: `Only ${remainingFormatted} remaining. Wrap up before lockout.`,
    type: 'warning',
    data: { appName, action: 'warning' },
  });
}

/**
 * Scheduled daily reset completed
 */
export function notifyDailyReset(resetTime: string = '08:00 AM') {
  return dispatchNotification({
    title: 'Daily Reset Complete',
    body: `All counters refreshed. Enforcement active until tomorrow at ${resetTime}.`,
    type: 'info',
    data: { action: 'daily_reset' },
  });
}
