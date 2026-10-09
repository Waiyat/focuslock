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
}

const NATIVE_EVENT_NAMES: NativeUsageEventName[] = [
  'onUsageUpdated',
  'onLimitWarning',
  'onLimitReached',
  'onLockTriggered',
];

class UsageEngine {
  /** False on iOS/web and in Expo Go (native module absent) — never faked. */
  readonly available: boolean;

  private configuredSignature = '';
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
    const signature = active
      .map((l) => `${l.app_bundle_id}:${l.daily_limit_seconds}`)
      .join('|');
    if (signature === this.configuredSignature) return;

    const configs: UsageLimitConfig[] = active.map((l) => ({
      packageName: l.app_bundle_id,
      appName: l.app_display_name || l.app_bundle_id,
      dailyLimitMs: Math.max(0, Math.round((l.daily_limit_seconds || 0) * 1000)),
      warningThresholdMs: DEFAULT_WARNING_THRESHOLD_MS,
      enabled: true,
    }));

    try {
      const count = await usageBridge.setLimits(configs);
      this.configuredSignature = signature;
      this.log('Usage', `Limits synced to native engine (${count} package(s))`);
    } catch (err) {
      console.warn('[FocusLock][Usage] Failed to sync limits to native engine:', err);
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
