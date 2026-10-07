import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { supabase } from '../../lib/supabase';
import { playSelectionFeedback, playSuccessFeedback, playErrorFeedback } from '../../lib/feedback';

/**
 * Privacy prefs are stored in auth user metadata (client-accessible, no schema change needed).
 * Key: focuslock_privacy  →  { analytics: bool, crashReports: bool, localOnly: bool }
 */
const PREFS_KEY = 'focuslock_privacy';

interface PrivacyPrefs {
  analytics: boolean;
  crashReports: boolean;
  localOnly: boolean;
}

const DEFAULTS: PrivacyPrefs = { analytics: false, crashReports: true, localOnly: true };

function ToggleRow({
  label, subtitle, value, onChange, saving, isFirst, isLast, sh, isDark,
}: {
  sh: any;
  isDark: boolean;
  label: string; subtitle?: string; value: boolean;
  onChange: (v: boolean) => void; saving?: boolean; isFirst: boolean; isLast: boolean;
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

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createPrivacyStyles(colors, isDark);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [prefs, setPrefs] = useState<PrivacyPrefs>(DEFAULTS);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const stored = user.user_metadata?.[PREFS_KEY];
      if (stored) {
        setPrefs({ ...DEFAULTS, ...stored });
      }
    } catch (err) {
      console.warn('[PrivacyPrefs load]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const saveField = async (field: keyof PrivacyPrefs, value: boolean) => {
    setSavingField(field);
    try {
      const newPrefs = { ...prefs, [field]: value };
      const { error } = await supabase.auth.updateUser({
        data: { [PREFS_KEY]: newPrefs },
      });
      if (error) {
        playErrorFeedback();
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

  const handleToggle = (field: keyof PrivacyPrefs) => (value: boolean) => {
    playSelectionFeedback();
    setPrefs((prev) => ({ ...prev, [field]: value }));
    saveField(field, value);
  };

  if (loading) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Privacy" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#007aff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Privacy & Security" onBack={() => router.back()} />
      <ScrollView style={sh.scroll} contentContainerStyle={sh.content} showsVerticalScrollIndicator={false}>
        {statusMsg && (
          <View style={[styles.statusBanner, statusMsg.ok ? styles.statusOk : styles.statusErr]}>
            <Text style={styles.statusText}>{statusMsg.ok ? '✓ ' : '✕ '}{statusMsg.text}</Text>
          </View>
        )}

        <Text style={sh.sectionLabel}>DATA COLLECTION</Text>
        <View style={sh.card}>
          <ToggleRow sh={sh} isDark={isDark}
            label="Usage Analytics"
            subtitle="Help improve FocusLock with anonymous usage stats"
            value={prefs.analytics}
            onChange={handleToggle('analytics')}
            saving={savingField === 'analytics'}
            isFirst
            isLast={false}
          />
          <ToggleRow sh={sh} isDark={isDark}
            label="Crash Reports"
            subtitle="Automatically send diagnostic logs to WaiyatLabs"
            value={prefs.crashReports}
            onChange={handleToggle('crashReports')}
            saving={savingField === 'crashReports'}
            isFirst={false}
            isLast={false}
          />
          <ToggleRow sh={sh} isDark={isDark}
            label="Local Storage Only"
            subtitle="Keep all limit data on-device — no cloud sync"
            value={prefs.localOnly}
            onChange={handleToggle('localOnly')}
            saving={savingField === 'localOnly'}
            isFirst={false}
            isLast
          />
        </View>

        <Text style={sh.sectionLabel}>YOUR DATA INTEGRITY</Text>
        <View style={[sh.card, { padding: 18 }]}>
          <Text style={styles.infoTitle}>What We Store</Text>
          <Text style={styles.infoBody}>
            FocusLock stores your username, account email, app limits, and daily usage counters. No browsing history, text messages, or personal content is ever accessed.{'\n\n'}
            Usage counters reset daily and are never shared or monetized with third parties.
          </Text>
        </View>

        <View style={sh.card}>
          <TouchableOpacity
            style={[sh.row, sh.rowFirst, sh.rowLast, { justifyContent: 'space-between' }]}
            onPress={() => router.push('/settings/privacy-policy')}
            activeOpacity={0.6}
          >
            <Text style={[sh.rowLabel, { color: '#007aff', fontWeight: '600' }]}>Read Full Privacy Policy</Text>
            <Text style={{ color: '#8e8e93', fontSize: 20, fontWeight: '400' }}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createPrivacyStyles(colors: any, isDark: boolean) {
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
  statusText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  infoTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 8, letterSpacing: -0.2 },
  infoBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  });
}
