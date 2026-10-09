import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { supabase } from '../../lib/supabase';
import { requestNotificationPermissions } from '../../lib/notifications';
import { playSelectionFeedback, playSuccessFeedback, playErrorFeedback } from '../../lib/feedback';

interface NotifPrefs {
  notify_on_limit_reached: boolean;
  notify_window_opening: boolean;
  notify_window_closing: boolean;
}

function ToggleRow({
  label,
  subtitle,
  value,
  onChange,
  saving,
  isFirst,
  isLast,
  sh,
  isDark,
}: {
  sh: any;
  isDark: boolean;
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  saving?: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <View style={[sh.row, isFirst && sh.rowFirst, isLast && sh.rowLast, !isLast && sh.rowDivider]}>
      <View style={sh.rowBody}>
        <Text style={sh.rowLabel}>{label}</Text>
        {subtitle ? <Text style={sh.rowSub}>{subtitle}</Text> : null}
      </View>
      {saving ? (
        <ActivityIndicator size="small" color="#007aff" style={{ marginRight: 4 }} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.16)' : '#e5e5ea', true: '#34c759' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#e5e5ea"
        />
      )}
    </View>
  );
}

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createNotifStyles(colors, isDark);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [prefs, setPrefs] = useState<NotifPrefs>({
    notify_on_limit_reached: true,
    notify_window_opening: true,
    notify_window_closing: true,
  });

  // Load prefs from Supabase on mount
  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('notify_on_limit_reached, notify_window_opening, notify_window_closing')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data && !error) {
        setPrefs({
          notify_on_limit_reached: data.notify_on_limit_reached ?? true,
          notify_window_opening: data.notify_window_opening ?? true,
          notify_window_closing: data.notify_window_closing ?? true,
        });
      }
    } catch (err) {
      console.warn('[NotifPrefs load]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  // Save a single field to Supabase immediately on toggle
  const saveField = async (field: keyof NotifPrefs, value: boolean) => {
    setSavingField(field);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('notification_preferences')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (error) {
        playErrorFeedback();
        // Revert optimistic update
        setPrefs((prev) => ({ ...prev, [field]: !value }));
        setStatusMsg({ text: 'Failed to save. Try again.', ok: false });
      } else {
        playSuccessFeedback();
        setStatusMsg({ text: 'Saved.', ok: true });
        setTimeout(() => setStatusMsg(null), 1800);
      }
    } catch {
      playErrorFeedback();
      setPrefs((prev) => ({ ...prev, [field]: !value }));
    } finally {
      setSavingField(null);
    }
  };

  const handleToggle = (field: keyof NotifPrefs) => (value: boolean) => {
    playSelectionFeedback();
    // Optimistic update
    setPrefs((prev) => ({ ...prev, [field]: value }));
    saveField(field, value);
  };

  if (loading) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Notifications" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#007aff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Notifications" onBack={() => router.back()} />
      <ScrollView
        style={sh.scroll}
        contentContainerStyle={sh.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        {statusMsg && (
          <View style={[styles.statusBanner, statusMsg.ok ? styles.statusOk : styles.statusErr]}>
            <Text style={[styles.statusText, statusMsg.ok ? styles.statusTextOk : styles.statusTextErr]}>
              {statusMsg.text}
            </Text>
          </View>
        )}

        <Text style={sh.sectionLabel}>ENFORCEMENT ALERTS</Text>
        <View style={sh.card}>
          <ToggleRow sh={sh} isDark={isDark}
            label="App Lock Alerts"
            subtitle="When an app reaches its daily limit"
            value={prefs.notify_on_limit_reached}
            onChange={handleToggle('notify_on_limit_reached')}
            saving={savingField === 'notify_on_limit_reached'}
            isFirst
            isLast={false}
          />
          <ToggleRow sh={sh} isDark={isDark}
            label="Reset Window Opening"
            subtitle="20-minute window before daily reset"
            value={prefs.notify_window_opening}
            onChange={handleToggle('notify_window_opening')}
            saving={savingField === 'notify_window_opening'}
            isFirst={false}
            isLast={false}
          />
          <ToggleRow sh={sh} isDark={isDark}
            label="Reset Completed"
            subtitle="When your daily limits have reset"
            value={prefs.notify_window_closing}
            onChange={handleToggle('notify_window_closing')}
            saving={savingField === 'notify_window_closing'}
            isFirst={false}
            isLast
          />
        </View>

        <Text style={sh.sectionLabel}>SYSTEM PERMISSIONS</Text>
        <TouchableOpacity
          style={sh.primaryBtn}
          onPress={requestNotificationPermissions}
          activeOpacity={0.8}
        >
          <Text style={sh.primaryBtnText}>Check System Permissions</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Notification permission is managed by your device OS. Tap above to open the system prompt or check current status.
        </Text>

        <View style={[sh.card, { padding: 16, marginTop: 8 }]}>
          <Text style={styles.infoTitle}>How FocusLock uses notifications</Text>
          <Text style={styles.infoBody}>
            Notifications are used to remind you 20 minutes before your daily reset so you can set tomorrow's limits, and to alert you when an app's allowance runs out. No marketing or tracking notifications are ever sent.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createNotifStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
  statusBanner: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  statusOk: { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#f0fdf4', borderWidth: 1, borderColor: isDark ? 'rgba(16,185,129,0.3)' : '#bbf7d0' },
  statusErr: { backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : '#fef2f2', borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#fecaca' },
  statusText: { fontSize: 14, fontWeight: '600' },
  statusTextOk: { color: isDark ? '#6EE7B7' : '#047857' },
  statusTextErr: { color: isDark ? '#FCA5A5' : '#DC2626' },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 20,
  },
  infoTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  infoBody: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  });
}
