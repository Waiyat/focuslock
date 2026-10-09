import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import { AndroidAppProvider } from './android';
import { IOSAppProvider } from './ios';
import type {
  AppProvider,
  GetAppsOptions,
  SelectableApp,
  SelectableAppsSnapshot,
} from './types';

export * from './types';

/**
 * Platform-independent entry point for app selection.
 *
 * The UI ONLY ever calls this — it never knows how apps are discovered.
 * Both platforms enumerate the real installed applications through their
 * native providers (Android PackageManager / iOS LaunchServices); iOS keeps
 * an explicitly labeled curated-catalog fallback for builds where the native
 * module is unavailable.
 */
const provider: AppProvider =
  Platform.OS === 'android' ? AndroidAppProvider : IOSAppProvider;

/** Returns the selectable apps plus their origin (`device` or `catalog`). */
export function loadSelectableApps(opts?: GetAppsOptions): Promise<SelectableAppsSnapshot> {
  return provider.loadSelectableApps(opts);
}

/** Convenience wrapper when the caller only needs the app list. */
export async function getSelectableApps(opts?: GetAppsOptions): Promise<SelectableApp[]> {
  const snapshot = await provider.loadSelectableApps(opts);
  return snapshot.apps;
}

/**
 * Real display labels for SPECIFIC packages — resolves ANY installed
 * package (including system apps the selectable list intentionally omits).
 * Read-only; never returns the full installed-app list. Android only —
 * other platforms return an empty map and callers fall back honestly.
 */
export async function getAppDisplayNames(packages: string[]): Promise<Map<string, string>> {
  if (Platform.OS !== 'android' || packages.length === 0) return new Map();
  try {
    const native = requireNativeModule<{
      getAppLabels(pkgs: string[]): Promise<Record<string, string>>;
    }>('FocusLockAppDiscovery');
    const rows = await native.getAppLabels(packages);
    return new Map(Object.entries(rows ?? {}));
  } catch {
    return new Map();
  }
}
