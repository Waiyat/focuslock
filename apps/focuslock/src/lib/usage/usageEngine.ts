import { Platform } from 'react-native';
import { usageBridge } from './usageBridge';
import {
  DEFAULT_WARNING_THRESHOLD_MS,
  LockTrigger,
  NativeUsageEventName,
  UsageAccessStatus,
  UsageLimitConfig,
} from './types';

/**
 * JS-side singleton around the native usage engine.
 *
 * Responsibilities (monitoring itself runs NATIVE — never JS timers):
 * - mirror the existing app_limits rows into the native engine
 * - fan out native events (warning / reached / lock-triggered / usage-updated)
 * - expose real usage reads for the dashboard
 * - expose the true special-access status for the setup UI
 *
 * All logs are structured `[FocusLock][<Area>] …` and dev-only.
 */

export interface UsageEngineEvent {
  type: NativeUsageEventName;
  payload: Record<string, any>;
}

type EventCallback = (event: UsageEngineEvent) => void;

interface ConfigurableLimit {
  app_bundle_id: string;
  app_display_name?: string | null;
  daily_limit_seconds: number;
  is_active?: boolean;
  /** ISO timestamp of the app_limits row (fresh-allowance start point). */
  created_at?: string | null;
}

const NATIVE_EVENT_NAMES: NativeUsageEventName[] = [
  'onUsageUpdated',
  'onLimitWarning',
  'onLimitReached',
  'onLockTriggered',
];

/** Epoch ms of an ISO `created_at` — 0 when absent/unparseable (whole-day count). */
function allowanceStartMs(createdAt?: string | null): number {
  if (!createdAt) return 0;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? t : 0;
}

class UsageEngine {
  /** False on iOS/web and in Expo Go (native module absent) — never faked. */
  readonly available: boolean;

  private configuredSignature = '';
  /** Last payload pushed to native — reused to restart monitoring after a permission grant. */
  private lastSyncedConfigs: UsageLimitConfig[] | null = null;
  private nativeSubscriptions: { remove(): void }[] = [];
  private subscribers = new Set<EventCallback>();

  constructor() {
    this.available = Platform.OS === 'android' && usageBridge.isUsageEngineAvailable();
  }

  private log(area: string, message: string): void {
    if (__DEV__) console.log(`[FocusLock][${area}] ${message}`);
  }

  private ensureNativeListeners(): void {
    if (!this.available || this.nativeSubscriptions.length > 0) return;
    for (const name of NATIVE_EVENT_NAMES) {
      const sub = usageBridge.addListener(name, (payload: Record<string, any>) => {
        const body = payload ?? {};
        this.log(name.replace(/^on/, ''), JSON.stringify(body));
        for (const cb of Array.from(this.subscribers)) {
          try {
            cb({ type: name, payload: body });
          } catch (err) {
            console.warn('[FocusLock] usage event subscriber threw:', err);
          }
        }
      });
      if (sub) this.nativeSubscriptions.push(sub);
    }
  }

  /** Subscribe to native engine events. Returns an unsubscribe function. */
  subscribe(callback: EventCallback): () => void {
    this.ensureNativeListeners();
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Mirrors the existing `app_limits` rows into the native engine.
   * Idempotent by configuration signature (safe to call on every state change).
   */
  async configure(limits: ConfigurableLimit[]): Promise<void> {
    if (!this.available) return;
    const active = limits.filter((l) => l.is_active !== false && !!l.app_bundle_id);
    const configs: UsageLimitConfig[] = active.map((l) => ({
      packageName: l.app_bundle_id,
      appName: l.app_display_name || l.app_bundle_id,
      dailyLimitMs: Math.max(0, Math.round((l.daily_limit_seconds || 0) * 1000)),
      warningThresholdMs: DEFAULT_WARNING_THRESHOLD_MS,
      enabled: true,
      // Fresh allowance: usage recorded before the row was created never counts.
      startsAtMs: allowanceStartMs(l.created_at),
    }));
    // Signature includes startsAtMs so a newly created allowance always
    // re-syncs even when the limit seconds themselves are unchanged.
    const signature = configs
      .map((l) => `${l.packageName}:${l.dailyLimitMs}:${l.startsAtMs ?? 0}`)
      .join('|');
    if (signature === this.configuredSignature) return;

    try {
      const count = await usageBridge.setLimits(configs);
      this.configuredSignature = signature;
      this.lastSyncedConfigs = configs;
      this.log('Usage', `Limits synced to native engine (${count} package(s))`);
    } catch (err) {
      console.warn('[FocusLock][Usage] Failed to sync limits to native engine:', err);
    }
  }

  /**
   * Re-pushes the last synced limits to the native engine.
   *
   * `setLimits` is the only bridge call that starts MonitorService, and the
   * bridge skips starting it while Usage Access is missing — so after the
   * user grants the permission (fresh install / reinstall heal), monitoring
   * must be nudged even though the limits themselves never changed.
   */
  async resyncForMonitoring(): Promise<void> {
    if (!this.available || !this.lastSyncedConfigs || this.lastSyncedConfigs.length === 0) return;
    try {
      const count = await usageBridge.setLimits(this.lastSyncedConfigs);
      this.log('Usage', `Limits re-synced after permission grant (${count} package(s))`);
    } catch (err) {
      console.warn('[FocusLock][Usage] Re-sync after permission grant failed:', err);
    }
  }

  /** Real today-usage (ms) per package. Empty object when unavailable. */
  async getTodayUsageMap(packageNames: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    if (!this.available || packageNames.length === 0) return out;
    await Promise.all(
      packageNames.map(async (packageName) => {
        try {
          out[packageName] = await usageBridge.getTodayUsage(packageName);
        } catch {
          this.log('Usage', `getTodayUsage failed for ${packageName}`);
        }
      })
    );
    return out;
  }

  /** True special-access status — only Android confirms "granted". */
  async accessStatus(): Promise<UsageAccessStatus> {
    if (!this.available) {
      return {
        available: false,
        usageAccessGranted: false,
        overlayGranted: false,
        canEnforce: false,
        monitoringEnabled: false,
      };
    }
    try {
      const [usageAccessGranted, overlayGranted, canEnforce, status] = await Promise.all([
        usageBridge.isUsageAccessGranted(),
        usageBridge.isOverlayGranted(),
        usageBridge.canEnforce(),
        usageBridge.getEngineStatus(),
      ]);
      return {
        available: true,
        usageAccessGranted,
        overlayGranted,
        canEnforce,
        monitoringEnabled: status.monitoringEnabled === true,
      };
    } catch (err) {
      console.warn('[FocusLock][Usage] accessStatus failed:', err);
      return {
        available: true,
        usageAccessGranted: false,
        overlayGranted: false,
        canEnforce: false,
        monitoringEnabled: false,
      };
    }
  }

  /** Consumes the one-shot "lock screen triggered" record (survives process death). */
  async consumeLockTrigger(): Promise<LockTrigger | null> {
    if (!this.available) return null;
    try {
      return await usageBridge.consumeLockTrigger();
    } catch {
      return null;
    }
  }
}

export const usageEngine = new UsageEngine();
