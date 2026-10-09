import { requireNativeModule } from 'expo-modules-core';

/**
 * Native app discovery (Android PackageManager / iOS LaunchServices).
 * JS access goes through `src/lib/appProvider/*`, which resolves this
 * module lazily so platforms or builds without it degrade gracefully
 * (explicitly labeled catalog fallback on iOS — never silent mock data).
 */
export default requireNativeModule('FocusLockAppDiscovery');
