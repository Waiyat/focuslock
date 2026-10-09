import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme, Appearance, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { darkColors, lightColors, ThemeColors } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'focuslock_theme_mode';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  isNight: boolean;
  colors: ThemeColors;
  systemScheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'system',
  isDark: true,
  isNight: true,
  colors: darkColors,
  systemScheme: 'dark',
  setThemeMode: async () => {},
});

/**
 * Determines whether it is currently night time based on local device clock.
 * Night: 19:00 (7 PM) through 05:59 (6 AM).
 * Day:   06:00 (6 AM) through 18:59 (7 PM).
 */
export function checkIsNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6;
}

// Storage helpers
async function readStoredMode(): Promise<ThemeMode | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (val === 'light' || val === 'dark' || val === 'system') return val;
      }
      return null;
    }
    const val = await SecureStore.getItemAsync(THEME_STORAGE_KEY).catch(() => null);
    if (val === 'light' || val === 'dark' || val === 'system') return val;
  } catch (e) {
    console.warn('[ThemeContext] Failed reading stored theme:', e);
  }
  return null;
}

async function writeStoredMode(mode: ThemeMode): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
      return;
    }
    await SecureStore.setItemAsync(THEME_STORAGE_KEY, mode);
  } catch (e) {
    console.warn('[ThemeContext] Failed saving stored theme:', e);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemSchemeHook = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    // Default to dark — FocusLock is a dark-first app.
    // If the OS explicitly reports light, we'll follow that after mount.
    systemSchemeHook === 'light' ? 'light' : 'dark'
  );
  const [isNight, setIsNight] = useState<boolean>(checkIsNightTime());
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync OS color scheme changes
  useEffect(() => {
    if (systemSchemeHook) {
      setSystemScheme(systemSchemeHook === 'light' ? 'light' : 'dark');
    }
  }, [systemSchemeHook]);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => subscription.remove();
  }, []);

  // Periodic day/night check (checks every 30 seconds so transitions are automatic)
  useEffect(() => {
    const checkTimer = setInterval(() => {
      setIsNight(checkIsNightTime());
    }, 30000);
    return () => clearInterval(checkTimer);
  }, []);

  // Load initial saved theme mode
  useEffect(() => {
    readStoredMode().then((saved) => {
      if (saved) {
        setThemeModeState(saved);
      }
      setIsLoaded(true);
    });
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await writeStoredMode(mode);
  }, []);

  // Under 'system' mode: night time is dark mode, day time is light mode (or follows OS dark mode)
  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      // Notice when night -> dark mode, notice when day -> light mode (unless OS explicitly dark)
      return isNight || systemScheme === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, isNight, systemScheme]);

  const colors = useMemo(() => {
    return isDark ? darkColors : lightColors;
  }, [isDark]);

  const contextValue = useMemo<ThemeContextType>(() => ({
    themeMode,
    isDark,
    isNight,
    colors,
    systemScheme,
    setThemeMode,
  }), [themeMode, isDark, isNight, colors, systemScheme, setThemeMode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
