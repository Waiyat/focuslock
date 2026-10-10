import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Safe AsyncStorage wrapper.
 *
 * On Android, Expo Go does NOT ship the native binary that backs
 * `@react-native-async-storage/async-storage`. In that environment every
 * get/set call rejects with:
 *
 *   AsyncStorageError: Native module is null, cannot access legacy storage
 *
 * The call sites already treat these as non-blocking, but left unguarded they
 * (a) spam the console with the same warning over and over, and (b) silently
 * drop all persisted flags, so onboarding/terms state never survives.
 *
 * This module fixes both by probing AsyncStorage exactly once and, when the
 * native module is unavailable, transparently falling back to an in-memory
 * store. Writes are always mirrored to memory, so a session stays consistent
 * even if the native module disappears mid-session.
 *
 *   - Real builds (`npx expo run:android` / EAS): native AsyncStorage, unchanged.
 *   - Expo Go: in-memory fallback + a single, clear warning. State works for
 *     the session but does not persist across reloads — run a development
 *     build for real persistence.
 *
 * Every exported function resolves and never rejects, so call sites do not
 * need their own try/catch.
 */

const memory = new Map<string, string>();

// null = not yet probed, true = native works, false = use the memory fallback.
let nativeAvailable: boolean | null = null;
let warned = false;

const PROBE_KEY = '@focuslock_safestorage_probe';

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[safeStorage] AsyncStorage native module is unavailable in this build ' +
      '(this is expected in Expo Go). Using an in-memory store for this ' +
      'session — saved flags will NOT persist across reloads. Run a ' +
      'development build (`npx expo run:android`) for real persistence.'
  );
}

function markNativeUnavailable(): void {
  nativeAvailable = false;
  warnOnce();
}

/** Probes the native module once; caches the result for the session. */
async function ensureProbed(): Promise<boolean> {
  if (nativeAvailable !== null) return nativeAvailable;
  let available: boolean;
  try {
    await AsyncStorage.getItem(PROBE_KEY);
    available = true;
  } catch {
    available = false;
    warnOnce();
  }
  nativeAvailable = available;
  return available;
}

export async function safeGetItem(key: string): Promise<string | null> {
  if (await ensureProbed()) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      markNativeUnavailable();
    }
  }
  return memory.has(key) ? (memory.get(key) as string) : null;
}

export async function safeSetItem(key: string, value: string): Promise<void> {
  // Mirror to memory first so the fallback always sees the latest value.
  memory.set(key, value);
  if (await ensureProbed()) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      markNativeUnavailable();
    }
  }
}

export async function safeRemoveItem(key: string): Promise<void> {
  memory.delete(key);
  if (await ensureProbed()) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      markNativeUnavailable();
    }
  }
}

/** True when native AsyncStorage is in use (i.e. not the in-memory fallback). */
export function isNativeStorageAvailable(): boolean {
  return nativeAvailable === true;
}
