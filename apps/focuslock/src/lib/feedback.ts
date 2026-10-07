import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

let nativeErrorPlayer: any = null;
let nativeNotificationPlayer: any = null;

function getNativeErrorPlayer() {
  if (Platform.OS !== 'web' && !nativeErrorPlayer) {
    try {
      const { createAudioPlayer } = require('expo-audio');
      if (createAudioPlayer) {
        nativeErrorPlayer = createAudioPlayer(require('../../assets/error-beep.wav'));
      }
    } catch {
      // expo-audio not loaded
    }
  }
  return nativeErrorPlayer;
}

function getNativeNotificationPlayer() {
  if (Platform.OS !== 'web' && !nativeNotificationPlayer) {
    try {
      const { createAudioPlayer } = require('expo-audio');
      if (createAudioPlayer) {
        nativeNotificationPlayer = createAudioPlayer(require('../../assets/notification-chime.wav'));
      }
    } catch {
      // expo-audio not loaded
    }
  }
  return nativeNotificationPlayer;
}

/**
 * Plays an error sound and triggers haptic vibration for invalid credentials or input errors.
 * Plays error tone on iOS/Android (via expo-audio) and Web (via Web Audio API).
 */
export async function playErrorFeedback() {
  try {
    // 1. Native Haptic Feedback (iOS / Android)
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Haptics not available on current device/emulator
      }
    }

    // 2. Native Audio playback (iOS / Android)
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const player = getNativeErrorPlayer();
        if (player) {
          player.seekTo(0);
          player.play();
        }
      } catch {
        // Audio playback fallback
      }
    }

    // 3. Audio playback (Web Audio API synthesis on web)
    if (Platform.OS === 'web') {
      try {
        const AudioContextClass =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sawtooth';
          // Double buzz / descending error tone
          osc.frequency.setValueAtTime(180, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);

          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {
        // AudioContext restricted before first user interaction
      }
    }
  } catch {
    // Suppress any context errors gracefully
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
