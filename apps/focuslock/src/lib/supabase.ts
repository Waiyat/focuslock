import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const CHUNK_SIZE = 1800; // Safe chunk size below Android 2048-byte limit

/**
 * Universal Storage Adapter:
 * - Web: uses window.localStorage
 * - iOS / Android: uses Expo SecureStore with automatic chunking for arbitrary payload sizes
 */
const StorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      }

      // Check if stored as chunks
      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`).catch(() => null);
      if (chunkCountStr) {
        const count = parseInt(chunkCountStr, 10);
        const parts: string[] = [];
        for (let i = 0; i < count; i++) {
          const part = await SecureStore.getItemAsync(`${key}_${i}`).catch(() => null);
          if (part) parts.push(part);
        }
        return parts.join('');
      }

      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn('[StorageAdapter] getItem error:', e);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        return;
      }

      // If value is small enough, store directly
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        // Clean up any stale chunk keys if previously chunked
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
        return;
      }

      // Large payload (e.g. Supabase session JWT with user metadata)
      const count = Math.ceil(value.length / CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}_chunks`, String(count));
      for (let i = 0; i < count; i++) {
        const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_${i}`, chunk);
      }
    } catch (e) {
      console.warn('[StorageAdapter] setItem error:', e);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
        return;
      }

      const chunkCountStr = await SecureStore.getItemAsync(`${key}_chunks`).catch(() => null);
      if (chunkCountStr) {
        const count = parseInt(chunkCountStr, 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch (e) {
      console.warn('[StorageAdapter] removeItem error:', e);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: StorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type { Session, User } from '@supabase/supabase-js';
