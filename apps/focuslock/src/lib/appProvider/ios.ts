import { Linking, Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import { SUPPORTED_IOS_APPS } from './iosCatalog';
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
  bundleIdentifier: string;
  icon?: string | null;
  platform: 'ios';
}

// Session cache — discovery + availability probing run once per picker
// session. Holds the full snapshot so the UI knows whether it is looking at
// real installed apps (`device`) or the curated fallback (`catalog`).
let cache: SelectableAppsSnapshot | null = null;
let inflight: Promise<SelectableAppsSnapshot> | null = null;

/**
 * Resolved lazily so merely importing this module on web (or a JS-only
 * update running on an older binary) never throws — the native module is
 * optional here because the curated catalog remains as an honest fallback.
 */
function getNativeModule(): { getInstalledApps(): Promise<NativeInstalledApp[]> } | null {
  try {
    return requireNativeModule('FocusLockAppDiscovery');
  } catch {
    return null;
  }
}

/** Catalog rows keyed by bundle id — display-only enrichment for device rows. */
const CATALOG_BY_BUNDLE_ID = new Map(
  SUPPORTED_IOS_APPS.map((app) => [app.bundleIdentifier, app])
);

/**
 * Real installed-app enumeration through the native LaunchServices module.
 * Returns null (never fake data) when the module is missing or discovery
 * fails — the caller then falls back to the *explicitly labeled* catalog.
 */
async function discoverInstalledApps(): Promise<SelectableApp[] | null> {
  const native = getNativeModule();
  if (!native) {
    console.warn(
      '[appProvider] FocusLockAppDiscovery not linked (Expo Go or older binary) — using the supported-app catalog fallback.'
    );
    return null;
  }

  try {
    const rows = await native.getInstalledApps();
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn(
        '[appProvider] native iOS discovery returned no rows — using the catalog fallback.'
      );
      return null;
    }

    return rows.map((row) => {
      const bundleIdentifier = row.bundleIdentifier || row.id;
      // Display-only enrichment: known apps inherit their curated category /
      // badge / color so filter chips and monogram fallbacks still work.
      // Icons are ALWAYS the real on-device icon (never catalog art).
      const catalogEntry = CATALOG_BY_BUNDLE_ID.get(bundleIdentifier);
      return {
        id: bundleIdentifier,
        name: row.name,
        platform: 'ios' as const,
        bundleIdentifier,
        icon: row.icon ?? undefined,
        category: catalogEntry?.category,
        badgeCode: catalogEntry?.badgeCode,
        color: catalogEntry?.color,
      };
    });
  } catch (err) {
    console.warn(
      '[appProvider] native iOS discovery failed — using the supported-app catalog fallback.',
      err
    );
    return null;
  }
}

/** Curated supported-app catalog with URL-scheme availability probing. */
async function loadCatalogApps(): Promise<SelectableApp[]> {
  const apps: SelectableApp[] = SUPPORTED_IOS_APPS.map((app) => ({ ...app }));

  if (Platform.OS !== 'web') {
    await Promise.all(
      apps.map(async (app) => {
        if (!app.urlScheme) return;
        try {
          const canOpen = await Linking.canOpenURL(app.urlScheme);
          if (canOpen) app.available = true;
        } catch {
          // Unknown — leave `available` undefined (honest "unknown")
        }
      })
    );
  }

  return apps;
}

export const IOSAppProvider: AppProvider = {
  async loadSelectableApps(opts?: GetAppsOptions): Promise<SelectableAppsSnapshot> {
    if (opts?.refresh) {
      // A refresh must bypass BOTH the cache and any previous probe so
      // installs/uninstalls and availability results are re-evaluated.
      cache = null;
      inflight = null;
    }
    if (cache) return cache;
    if (inflight) return inflight;

    const run = (async (): Promise<SelectableAppsSnapshot> => {
      // 1. Real device enumeration — every installed app, names + icons.
      const deviceApps = await discoverInstalledApps();
      if (deviceApps) {
        const snapshot: SelectableAppsSnapshot = { apps: deviceApps, source: 'device' };
        cache = snapshot;
        return snapshot;
      }

      // 2. Honest fallback — curated supported-app catalog. The UI must
      //    label this "Supported apps", never claim it is everything installed.
      const apps = await loadCatalogApps();
      const snapshot: SelectableAppsSnapshot = { apps, source: 'catalog' };
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
