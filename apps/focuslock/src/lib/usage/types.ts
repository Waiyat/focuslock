/**
 * Shared types for the real Android usage/limit engine.
 *
 * Mirrors the native models (modules/usage-monitor). The limit config is
 * derived from the EXISTING `app_limits` model — no duplicate limit source.
 */

/** Single configurable warning threshold source (not hard-coded elsewhere). */
export const DEFAULT_WARNING_THRESHOLD_MS = 10 * 60 * 1000;

/** A configured limit mirrored down to the native engine. */
export interface UsageLimitConfig {
  /** Stable identity: Android package name (from app_limits.app_bundle_id). */
  packageName: string;
  appName: string;
  dailyLimitMs: number;
  warningThresholdMs?: number;
  enabled: boolean;
}

/** One foreground session reconstructed from real Android usage events. */
export interface UsageSession {
  id: string;
  packageName: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  source: 'android_usage_events';
  dayKey: string;
}

/** Authoritative persisted lock state. */
export interface LockState {
  packageName: string;
  appName: string;
  locked: boolean;
  lockedAt: number;
  /** Next local calendar day start. */
  resetAt: number;
  reachedAt: number;
  dailyLimitMs: number;
  usedMs: number;
}

/** One-shot lock-trigger record (survives process death). */
export interface LockTrigger {
  packageName: string;
  appName: string;
  dailyLimitMs: number;
  usedMs: number;
  reachedAt: number;
}

export interface ForegroundApp {
  packageName: string;
  timestamp: number;
  eventType: string;
}

export interface TodayStats {
  usageMs: number;
  sessionCountToday: number;
  firstOpenedAtToday: number;
  lastOpenedAt: number;
  lastSessionEndedAt: number;
  dayStartMs: number;
}

export interface UsageEventRow {
  eventType: string;
  eventTypeCode: number;
  packageName: string;
  timestamp: number;
}

/** Combined special-access + engine status for the setup UI. */
export interface UsageAccessStatus {
  available: boolean;
  usageAccessGranted: boolean;
  overlayGranted: boolean;
  canEnforce: boolean;
  monitoringEnabled: boolean;
}

export type NativeUsageEventName =
  | 'onUsageUpdated'
  | 'onLimitWarning'
  | 'onLimitReached'
  | 'onLockTriggered';

export interface NativeUsageEvent {
  type: NativeUsageEventName;
  payload: Record<string, any>;
}
