import { Platform } from 'react-native';
import type * as NotificationsType from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

let isInitialized = false;
let _Notifications: typeof NotificationsType | null = null;

// =======================================================================
// 1. SAFE LAZY LOADING FOR EXPO NOTIFICATIONS
// =======================================================================

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
 * Lazily loads expo-notifications only when supported and safe.
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

// =======================================================================
// 2. NATIVE NOTIFICATION INITIALIZATION & CHANNELS
// =======================================================================

export const NOTIFICATION_CHANNELS = {
  ENFORCEMENT: 'focuslock-enforcement',
  REMINDERS: 'focuslock-reminders',
} as const;

/**
 * Configures the native OS notification presentation handler and registers
 * Android notification channels.
 *
 * NOTE: The OS owns the notification banners, lock screen display, notification
 * center shade, and audio/vibration behavior.
 */
export async function initNotifications(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  try {
    const notif = getNotifications();
    if (!notif) {
      console.info('[Notifications] Running in Expo Go on Android — native push APIs safely bypassed.');
      return;
    }

    // Configure foreground presentation: let the OS show the native banner and play sound!
    notif.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: notif.AndroidNotificationPriority.HIGH,
      }),
    });

    // Configure Android channels
    if (Platform.OS === 'android') {
      // 1. High-priority enforcement channel (limit warnings and app lockouts)
      await notif.setNotificationChannelAsync(NOTIFICATION_CHANNELS.ENFORCEMENT, {
        name: 'Enforcement & Limit Alerts',
        description: 'Instant alerts when daily limits are approaching or exhausted.',
        importance: notif.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#84cc16',
        lockscreenVisibility: notif.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      }).catch((err) => console.warn('[Notifications] Failed to set enforcement channel:', err));

      // 2. Default-priority reminders channel (daily reset and window opening)
      await notif.setNotificationChannelAsync(NOTIFICATION_CHANNELS.REMINDERS, {
        name: 'Daily Resets & Window Reminders',
        description: 'Updates regarding daily reset windows and limit resets.',
        importance: notif.AndroidImportance.DEFAULT,
        lockscreenVisibility: notif.AndroidNotificationVisibility.PUBLIC,
      }).catch((err) => console.warn('[Notifications] Failed to set reminders channel:', err));
    }
  } catch (err) {
    console.warn('[Notifications] Setup error:', err);
  }
}

// =======================================================================
// 3. SYSTEM PERMISSIONS & TOKEN REGISTRATION
// =======================================================================

/**
 * Query current notification permission status safely across platforms.
 */
export async function getNotificationPermissionStatus(): Promise<string> {
  try {
    const notif = getNotifications();
    if (!notif) return 'granted';

    const { status } = await notif.getPermissionsAsync();
    return status;
  } catch (err) {
    console.warn('[Notifications] Permission check error:', err);
    return 'granted';
  }
}

/**
 * Request notification permissions from device OS.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const notif = getNotifications();
    if (!notif) return true;

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
    console.warn('[Notifications] Permission request error:', err);
    return false;
  }
}

/**
 * Register this device's Expo push token in the Supabase `devices` table.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  try {
    const notif = getNotifications();
    if (!notif) {
      console.info('[Push] Expo Go on Android detected — push token skipped.');
      return null;
    }

    if (!Device.isDevice) {
      console.info('[Push] Running on simulator/web — push token skipped.');
      return null;
    }

    const granted = await requestNotificationPermissions();
    if (!granted) {
      console.info('[Push] Permission not granted.');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? 'focuslock-app';
    const tokenData = await notif.getExpoPushTokenAsync({ projectId }).catch(() => null);
    const token = tokenData?.data;

    if (!token) return null;

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

// =======================================================================
// 4. NATIVE OS NOTIFICATION DISPATCH API
// =======================================================================

export interface SendNativeNotificationOptions {
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, any>;
  badge?: number;
}

/**
 * Triggers a native system notification through the operating system.
 */
export async function sendNativeNotification({
  title,
  body,
  channelId = NOTIFICATION_CHANNELS.ENFORCEMENT,
  data,
  badge,
}: SendNativeNotificationOptions): Promise<string | null> {
  try {
    const notif = getNotifications();
    if (!notif) {
      console.info(`[Native Notification Simulated]: "${title}" - "${body}"`);
      return null;
    }

    const notificationId = await notif.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true, // Native OS sound
        badge: badge ?? undefined,
        color: '#09090b',
        data: data ?? {},
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // deliver immediately
    });

    return notificationId;
  } catch (err) {
    console.warn('[Notifications] Failed to schedule notification:', err);
    return null;
  }
}

// =======================================================================
// 5. HIGH-LEVEL PRODUCTION NOTIFICATION TRIGGERS
// =======================================================================

export interface LimitWarningParams {
  appName: string;
  remainingMinutes?: number;
  remainingFormatted?: string;
}

/**
 * Triggers a native notification warning the user that an app is approaching its limit.
 *
 * Example:
 * ```ts
 * notifyLimitWarning({ appName: 'Instagram', remainingMinutes: 10 });
 * ```
 */
export async function notifyLimitWarning(
  paramsOrAppName: LimitWarningParams | string,
  legacyRemainingFormatted?: string
): Promise<string | null> {
  let appName = '';
  let timeStr = '';

  if (typeof paramsOrAppName === 'object') {
    appName = paramsOrAppName.appName;
    if (paramsOrAppName.remainingFormatted) {
      timeStr = paramsOrAppName.remainingFormatted;
    } else if (paramsOrAppName.remainingMinutes !== undefined) {
      timeStr = `${paramsOrAppName.remainingMinutes}m`;
    } else {
      timeStr = 'a few minutes';
    }
  } else {
    appName = paramsOrAppName;
    timeStr = legacyRemainingFormatted || '5m';
  }

  return sendNativeNotification({
    title: `${appName} Approaching Limit`,
    body: `Only ${timeStr} remaining today. Wrap up before FocusLock locks the app.`,
    channelId: NOTIFICATION_CHANNELS.ENFORCEMENT,
    data: { appName, type: 'warning' },
  });
}

/** Alias for backwards compatibility */
export const notifyAppWarning = notifyLimitWarning;

export interface AppLockedParams {
  appName: string;
  limitFormatted?: string;
  resetTime?: string;
}

/**
 * Triggers a native notification informing the user that an app has been locked out.
 */
export async function notifyAppLocked(
  paramsOrAppName: AppLockedParams | string,
  legacyLimitFormatted?: string,
  legacyResetTime: string = '08:00 AM'
): Promise<string | null> {
  let appName = '';
  let limitStr = 'Limit reached';
  let resetStr = '08:00 AM';

  if (typeof paramsOrAppName === 'object') {
    appName = paramsOrAppName.appName;
    limitStr = paramsOrAppName.limitFormatted || limitStr;
    resetStr = paramsOrAppName.resetTime || resetStr;
  } else {
    appName = paramsOrAppName;
    limitStr = legacyLimitFormatted || limitStr;
    resetStr = legacyResetTime;
  }

  return sendNativeNotification({
    title: `${appName} Locked`,
    body: `Daily allowance (${limitStr}) depleted. FocusLock active until ${resetStr}.`,
    channelId: NOTIFICATION_CHANNELS.ENFORCEMENT,
    data: { appName, type: 'locked', resetTime: resetStr },
  });
}

export interface DailyResetParams {
  resetTime?: string;
}

/**
 * Triggers a native notification informing the user that daily allowances have been refreshed.
 */
export async function notifyDailyReset(
  paramsOrResetTime?: DailyResetParams | string
): Promise<string | null> {
  const resetStr =
    typeof paramsOrResetTime === 'object'
      ? paramsOrResetTime.resetTime || '08:00 AM'
      : paramsOrResetTime || '08:00 AM';

  return sendNativeNotification({
    title: 'Daily Reset Complete',
    body: `All app counters refreshed. FocusLock enforcement active until tomorrow at ${resetStr}.`,
    channelId: NOTIFICATION_CHANNELS.REMINDERS,
    data: { type: 'daily_reset', resetTime: resetStr },
  });
}

export interface WindowOpeningParams {
  windowMinutes?: number;
  resetTime?: string;
}

/**
 * Triggers a native notification reminding the user that the daily adjustment window is open.
 */
export async function notifyWindowOpening(
  params?: WindowOpeningParams
): Promise<string | null> {
  const minutes = params?.windowMinutes ?? 20;
  const resetStr = params?.resetTime ?? '08:00 AM';

  return sendNativeNotification({
    title: 'Reset Window Active',
    body: `You have ${minutes} minutes to adjust tomorrow's app limits before reset at ${resetStr}.`,
    channelId: NOTIFICATION_CHANNELS.REMINDERS,
    data: { type: 'window_opening', resetTime: resetStr },
  });
}

/**
 * Backward compatibility wrapper for code that called dispatchNotification.
 */
export async function dispatchNotification({
  title,
  body,
  data,
}: {
  title: string;
  body: string;
  type?: string;
  data?: Record<string, any>;
}): Promise<void> {
  await sendNativeNotification({
    title,
    body,
    data,
  });
}

/**
 * Cancels all scheduled local notifications.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    const notif = getNotifications();
    if (notif) {
      await notif.cancelAllScheduledNotificationsAsync();
    }
  } catch (err) {
    console.warn('[Notifications] Failed to cancel notifications:', err);
  }
}
