/**
 * FocusLock app-selection foundation — the canonical selectable-app model.
 *
 * Platform-specific identifiers stay behind the provider layer so a future
 * Family Controls (iOS) provider can swap in — returning opaque Screen Time
 * application tokens instead of bundle identifiers — without rewriting the
 * Set Limit UI.
 */

export type AppPlatform = 'android' | 'ios';

export interface SelectableApp {
  /** Stable id — Android packageName, iOS bundle id, or catalog/custom id */
  id: string;
  name: string;
  platform: AppPlatform;

  /** Android: real package name from PackageManager */
  packageName?: string;

  /** iOS: catalog bundle id today; later a Family Controls application token */
  bundleIdentifier?: string;

  /**
   * Icon URI when the platform provides the real installed icon
   * (Android returns `file://` URIs written by the native provider).
   * Catalog-driven sources leave this undefined and use bundled assets.
   */
  icon?: string;

  /**
   * Whether availability could be positively determined for this app.
   * Never faked — undefined means "unknown", not "installed".
   */
  available?: boolean;

  /** Display category — only present when the source genuinely has taxonomy */
  category?: string;

  // Display-only hints (curated catalog / custom entry fallbacks)
  badgeCode?: string;
  color?: string;

  /** URL scheme used for iOS availability probing (existing configured schemes only) */
  urlScheme?: string;
}

export interface GetAppsOptions {
  /** Bypass the session cache and re-run discovery */
  refresh?: boolean;
}

/**
 * Where the last `loadSelectableApps` result actually came from:
 * - `device`: real installed-app enumeration (Android PackageManager /
 *   iOS LaunchServices) — honest "Installed apps" copy in the UI.
 * - `catalog`: curated supported-app list with availability probing — the UI
 *   must label this "Supported apps", never "all installed apps".
 */
export type SelectableAppsSource = 'device' | 'catalog';

export interface SelectableAppsSnapshot {
  apps: SelectableApp[];
  source: SelectableAppsSource;
}

export interface AppProvider {
  /**
   * Returns the apps the user can choose from this platform, plus where they
   * came from. The UI never needs to know how discovery works.
   */
  loadSelectableApps(opts?: GetAppsOptions): Promise<SelectableAppsSnapshot>;
}
