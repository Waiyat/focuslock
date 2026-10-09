import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { usageBridge } from '../../lib/usage/usageBridge';
import { usageEngine } from '../../lib/usage/usageEngine';
import type { UsageAccessStatus } from '../../lib/usage/types';

/**
 * Minimal permission/status integration (§14 Android Usage Access):
 *
 * - "Usage Access required" + [Open Settings] until Android confirms access
 * - '"Display over other apps" required' until enforcement access is granted
 * - "Usage Access enabled" confirmation row when BOTH are confirmed
 * - honest note in Expo Go / builds without the native engine
 *
 * Never claims "enabled" unless Android reports it (re-checked on every
 * return to the foreground).
 */
export function UsageAccessBanner({
  onStatusChange,
  hideWhenReady,
}: {
  onStatusChange?: (status: UsageAccessStatus) => void;
  /** When true, renders nothing once Android confirms both permissions (the
   *  permanent "all good" strip becomes a discreet indicator elsewhere). */
  hideWhenReady?: boolean;
}) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<UsageAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await usageEngine.accessStatus();
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Deferred so the effect body itself performs no synchronous state work.
    const initialCheck = setTimeout(refresh, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh(); // returning from Settings → re-verify
    });
    return () => {
      clearTimeout(initialCheck);
      subscription.remove();
    };
  }, [refresh]);

  const openSettings = useCallback(async () => {
    setBusy(true);
    try {
      if (!status?.usageAccessGranted) {
        await usageBridge.openUsageAccessSettings();
      } else {
        await usageBridge.openOverlaySettings();
      }
      // Re-check shortly after returning (AppState also re-checks).
      setTimeout(refresh, 800);
    } catch (err) {
      console.warn('[FocusLock][Usage] Failed to open Settings:', err);
    } finally {
      setBusy(false);
    }
  }, [refresh, status]);

  if (Platform.OS !== 'android' || !status) return null;

  // Build without the native engine (Expo Go / iOS JS path) — say so plainly.
  if (!status.available) {
    return (
      <View style={[styles.card, styles.infoCard]}>
        <Text style={styles.title}>Development build required</Text>
        <Text style={styles.body}>
          Usage monitoring needs the native FocusLock build — Expo Go can&apos;t measure real app
          usage. Run `npx expo run:android` to enable limits.
        </Text>
      </View>
    );
  }

  // Everything confirmed by Android → optionally silent (discreet indicator
  // surfaces the state elsewhere) or slim green confirmation.
  if (status.usageAccessGranted && status.overlayGranted) {
    if (hideWhenReady) return null;
    return (
      <View style={[styles.card, styles.okCard]}>
        <Text style={styles.okText}>✓ Usage Access enabled · Enforcement ready</Text>
      </View>
    );
  }

  const needsUsageAccess = !status.usageAccessGranted;
  return (
    <View style={[styles.card, styles.warnCard]}>
      <Text style={styles.title}>
        {needsUsageAccess ? 'Usage Access required' : 'Display over other apps required'}
      </Text>
      <Text style={styles.body}>
        {needsUsageAccess
          ? 'FocusLock needs access to your app usage so it can measure the limits you configure.'
          : 'FocusLock needs to appear over restricted apps so it can take you to its lock screen when a limit is reached.'}
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openSettings}
        disabled={busy}
        style={styles.button}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Open Settings</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(C: {
  bgCard: string;
  border: string;
  warning: string;
  warningDim: string;
  accent: string;
  accentText: string;
  accentDim: string;
  textPrimary: string;
  textSecondary: string;
}) {
  return StyleSheet.create({
    card: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 14,
      gap: 6,
    },
    warnCard: {
      backgroundColor: C.warningDim,
      borderColor: 'rgba(251, 191, 36, 0.35)',
    },
    infoCard: {
      backgroundColor: C.bgCard,
      borderColor: C.border,
    },
    okCard: {
      backgroundColor: C.accentDim,
      borderColor: 'rgba(118, 247, 86, 0.3)',
      paddingVertical: 9,
      paddingHorizontal: 12,
      gap: 0,
    },
    title: {
      fontSize: 13,
      fontWeight: '800',
      color: C.textPrimary,
    },
    body: {
      fontSize: 12,
      lineHeight: 17,
      color: C.textSecondary,
    },
    okText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.accentText,
    },
    button: {
      marginTop: 6,
      alignSelf: 'flex-start',
      backgroundColor: C.warning,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 16,
      minWidth: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#111827',
    },
  });
}
