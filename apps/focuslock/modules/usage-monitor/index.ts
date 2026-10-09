import { requireNativeModule } from 'expo-modules-core';

/**
 * Native Android usage-monitoring engine (UsageStatsManager-backed).
 * JS access goes through `src/lib/usage/usageBridge.ts`, which resolves this
 * module lazily so iOS/web/Expo Go degrade gracefully with clear messaging.
 */
export default requireNativeModule('FocusLockUsage');
