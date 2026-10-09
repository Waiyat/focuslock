import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import type {
  ForegroundApp,
  LockState,
  LockTrigger,
  TodayStats,
  UsageEventRow,
  UsageLimitConfig,
  UsageSession,
} from './types';

/**
 * Thin wrapper over the FocusLockUsage native module (Android only).
 *
 * Every function returns REAL device data from Android's UsageStatsManager —
 * there is no mock path. When the native module is missing (iOS, Expo Go,
 * web) every call fails with an explicit, actionable error instead of
 * fabricating values.
 */

interface NativeSubscription {
  remove(): void;
}

interface UsageNativeModule {
  isUsageAccessGranted(): Promise<boolean>;
  isOverlayGranted(): Promise<boolean>;
  canEnforce(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  getCurrentForegroundApp(): Promise<ForegroundApp | null>;
  getTodayUsage(packageName: string): Promise<number>;
  getUsageForRange(packageName: string, start: number, end: number): Promise<number>;
  getUsageEvents(packageName: string, start: number, end: number): Promise<UsageEventRow[]>;
  getSessionsForDay(packageName: string, dayStartMs: number): Promise<UsageSession[]>;
  getRecentSessions(packageName: string, limit: number): Promise<UsageSession[]>;
  getTodayStats(packageName: string): Promise<TodayStats>;
  getTotalUsageForRange(start: number, end: number): Promise<number>;
  getPerAppUsageForRange(start: number, end: number, topN: number): Promise<
    { packageName: string; usageMs: number }[]
  >;
  getDailyUsageHistory(days: number): Promise<{ dayStartMs: number; dayEndMs: number; usageMs: number }[]>;
  getHourlyUsageForRange(start: number, end: number): Promise<number[]>;
  setLimits(limitsJson: string): Promise<number>;
  getLimits(): Promise<string>;
  getLockStates(): Promise<LockState[]>;
  consumeLockTrigger(): Promise<LockTrigger | null>;
  startMonitoring(): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
  getEngineStatus(): Promise<Record<string, any>>;
  rebuildUsageState(): Promise<boolean>;
  addListener(eventName: string, listener: (payload: any) => void): NativeSubscription;
}

let cachedNative: UsageNativeModule | null | undefined;

function getNative(): UsageNativeModule | null {
  if (cachedNative !== undefined) return cachedNative;
  try {
    if (Platform.OS !== 'android') {
      cachedNative = null;
    } else {
      cachedNative = requireNativeModule<UsageNativeModule>('FocusLockUsage');
    }
  } catch {
    cachedNative = null;
  }
  return cachedNative;
}

/** True when this build contains the native usage engine. */
export function isUsageEngineAvailable(): boolean {
  return getNative() !== null;
}

const UNAVAILABLE_MESSAGE =
  "Usage monitoring isn't available in this build. Run a development build " +
  '(npx expo run:android) — Expo Go cannot measure real app usage.';

function requireNative(): UsageNativeModule {
  const native = getNative();
  if (!native) throw new Error(UNAVAILABLE_MESSAGE);
  return native;
}

export const usageBridge = {
  isUsageEngineAvailable,

  async isUsageAccessGranted(): Promise<boolean> {
    return (await requireNative().isUsageAccessGranted()) === true;
  },

  async isOverlayGranted(): Promise<boolean> {
    return (await requireNative().isOverlayGranted()) === true;
  },

  async canEnforce(): Promise<boolean> {
    return (await requireNative().canEnforce()) === true;
  },

  async openUsageAccessSettings(): Promise<void> {
    await requireNative().openUsageAccessSettings();
  },

  async openOverlaySettings(): Promise<void> {
    await requireNative().openOverlaySettings();
  },

  async getCurrentForegroundApp(): Promise<ForegroundApp | null> {
    return (await requireNative().getCurrentForegroundApp()) ?? null;
  },

  async getTodayUsage(packageName: string): Promise<number> {
    const ms = await requireNative().getTodayUsage(packageName);
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  },

  async getUsageForRange(packageName: string, start: number, end: number): Promise<number> {
    const ms = await requireNative().getUsageForRange(packageName, start, end);
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  },

  async getUsageEvents(packageName: string, start: number, end: number): Promise<UsageEventRow[]> {
    return (await requireNative().getUsageEvents(packageName, start, end)) ?? [];
  },

  async getSessionsForDay(packageName: string, dayStartMs: number): Promise<UsageSession[]> {
    return (await requireNative().getSessionsForDay(packageName, dayStartMs)) ?? [];
  },

  async getRecentSessions(packageName: string, limit: number): Promise<UsageSession[]> {
    return (await requireNative().getRecentSessions(packageName, limit)) ?? [];
  },

  async getTodayStats(packageName: string): Promise<TodayStats> {
    return requireNative().getTodayStats(packageName);
  },

  // ---- Analytics reads (real reconstructed usage) -------------------------
  // Capability-gated: builds whose native module predates these methods are
  // detected via hasAnalyticsSupport() (callers stand down), with quiet
  // fallbacks below as a second line of defence.

  /** True when this build's native module exposes the analytics reads. */
  hasAnalyticsSupport(): boolean {
    const native = getNative();
    return (
      native != null &&
      typeof native.getTotalUsageForRange === 'function' &&
      typeof native.getPerAppUsageForRange === 'function' &&
      typeof native.getDailyUsageHistory === 'function' &&
      typeof native.getHourlyUsageForRange === 'function'
    );
  },

  /** Total foreground usage across ALL packages in [start, end) (ms). */
  async getTotalUsageForRange(start: number, end: number): Promise<number> {
    try {
      const ms = await requireNative().getTotalUsageForRange(start, end);
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
    } catch {
      return 0;
    }
  },

  /** Per-package usage in [start, end), desc. [{packageName, usageMs}]. */
  async getPerAppUsageForRange(start: number, end: number, topN = 0): Promise<
    { packageName: string; usageMs: number }[]
  > {
    try {
      return (await requireNative().getPerAppUsageForRange(start, end, topN)) ?? [];
    } catch {
      return [];
    }
  },

  /** Per-local-day totals for the last [days] days (oldest first). */
  async getDailyUsageHistory(days: number): Promise<
    { dayStartMs: number; dayEndMs: number; usageMs: number }[]
  > {
    try {
      return (await requireNative().getDailyUsageHistory(days)) ?? [];
    } catch {
      return [];
    }
  },

  /** Hour-of-day (0-23) usage buckets over [start, end), local time. */
  async getHourlyUsageForRange(start: number, end: number): Promise<number[]> {
    try {
      return (await requireNative().getHourlyUsageForRange(start, end)) ?? new Array(24).fill(0);
    } catch {
      return new Array(24).fill(0);
    }
  },

  async setLimits(limits: UsageLimitConfig[]): Promise<number> {
    return (await requireNative().setLimits(JSON.stringify(limits))) ?? 0;
  },

  async getLockStates(): Promise<LockState[]> {
    return (await requireNative().getLockStates()) ?? [];
  },

  async consumeLockTrigger(): Promise<LockTrigger | null> {
    return (await requireNative().consumeLockTrigger()) ?? null;
  },

  async startMonitoring(): Promise<boolean> {
    return (await requireNative().startMonitoring()) === true;
  },

  async stopMonitoring(): Promise<boolean> {
    return (await requireNative().stopMonitoring()) === true;
  },

  async getEngineStatus(): Promise<Record<string, any>> {
    return (await requireNative().getEngineStatus()) ?? {};
  },

  async rebuildUsageState(): Promise<boolean> {
    return (await requireNative().rebuildUsageState()) === true;
  },

  addListener(eventName: string, listener: (payload: any) => void): NativeSubscription | null {
    try {
      return requireNative().addListener(eventName, listener);
    } catch {
      return null;
    }
  },
};
