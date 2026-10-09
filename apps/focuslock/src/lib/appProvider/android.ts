import { requireNativeModule } from 'expo-modules-core';
import type {
  AppProvider,
  GetAppsOptions,
  SelectableApp,
  SelectableAppsSnapshot,
} from './types';

/** Raw row returned by the native FocusLockAppDiscovery module. */
interface NativeInstalledApp {
  id: string;
  name: string;
  packageName: string;
  icon?: string | null;
  platform: 'android';
}

// Session cache — Android discovery is relatively expensive; load once per
// picker session and only re-query when the UI explicitly refreshes.
// Module-level so results survive picker re-opens within the session.
let cache: SelectableAppsSnapshot | null = null;
let inflight: Promise<SelectableAppsSnapshot> | null = null;

/**
 * Resolved lazily so merely importing this module on iOS/web never touches
 * the native side (the module only exists on Android). Throws an actionable
 * message when this build doesn't contain the native module — e.g. Expo Go,
 * which cannot ship custom native code and therefore cannot list apps.
 */
function getNativeModule() {
  try {
    return requireNativeModule('FocusLockAppDiscovery');
  } catch {
    throw new Error(
      "App discovery isn't available in this build. Expo Go can't list installed apps — run `npx expo run:android` (or an EAS development build) to get the real app list."
    );
  }
}

export const AndroidAppProvider: AppProvider = {
  async loadSelectableApps(opts?: GetAppsOptions): Promise<SelectableAppsSnapshot> {
    if (opts?.refresh) {
      // A refresh must bypass BOTH the cache and any in-flight/previous
      // discovery — otherwise the picker can never reflect installs/uninstalls.
      cache = null;
      inflight = null;
    }
    if (cache) return cache;
    if (inflight) return inflight;

    const run = (async (): Promise<SelectableAppsSnapshot> => {
      const rows: NativeInstalledApp[] = await getNativeModule().getInstalledApps();
      const apps: SelectableApp[] = rows.map((row) => ({
        id: row.packageName,
        name: row.name,
        platform: 'android',
        packageName: row.packageName,
        icon: row.icon ?? undefined,
      }));
      const snapshot: SelectableAppsSnapshot = { apps, source: 'device' };
      cache = snapshot;
      return snapshot;
    })();

    inflight = run;
    try {
      return await run;
    } catch (err) {
      // Failed discovery must never silently fall back to fake data —
      // clear the in-flight promise so the UI's "Try again" can retry.
      inflight = null;
      throw err;
    }
  },
};
