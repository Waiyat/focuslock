import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Error feedback — HAPTIC ONLY (sounds removed by product spec).
 * A short error notification vibration for invalid credentials / input errors.
 */
export async function playErrorFeedback() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics not available on current device/emulator
  }
}

/**
 * No-op: haptics are error-only per product spec.
 * Kept exported so existing call-sites don't need to be updated.
 */
export async function playSelectionFeedback() {
  // Intentionally empty — haptics reserved for errors only
}

/**
 * No-op: haptics are error-only per product spec.
 * Kept exported so existing call-sites don't need to be updated.
 */
export async function playLightFeedback() {
  // Intentionally empty — haptics reserved for errors only
}

/**
 * Heavy impact — used for tactile keystroke-style feedback (e.g. the
 * FocusLock typewriter intro on Home). Falls back to a medium impact,
 * then to a short vibration, on devices without haptic hardware.
 */
export async function playHeavyFeedback() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    return;
  } catch {
    // fall through to softer fallbacks
  }
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return;
  } catch {
    // fall through
  }
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Haptics not available on current device/emulator
  }
}

/**
 * No-op: haptics are error-only per product spec.
 * Kept exported so existing call-sites don't need to be updated.
 */
export async function playSuccessFeedback() {
  // Intentionally empty — haptics reserved for errors only
}

/**
 * No-op: haptics and in-app audio are removed for notifications.
 * The OS manages both sound and haptic feedback for system notifications.
 * Kept exported for backwards-compat.
 */
export async function playNotificationFeedback() {
  // Intentionally empty — OS owns notification sound & vibration
}
