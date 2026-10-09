import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { ThemeColors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { playErrorFeedback } from '../../lib/feedback';

const PREFS_KEY = 'focuslock_privacy';

interface PrivacyPrefs {
  analytics: boolean;
  crashReports: boolean;
  localOnly: boolean;
}

const DEFAULTS: PrivacyPrefs = { analytics: false, crashReports: true, localOnly: true };

const TOGGLES: { key: keyof PrivacyPrefs; label: string; sub: string }[] = [
  { key: 'analytics', label: 'Usage Analytics', sub: 'Share anonymous usage statistics to help improve FocusLock' },
  { key: 'crashReports', label: 'Crash Reports', sub: 'Automatically send diagnostic logs when something goes wrong' },
  { key: 'localOnly', label: 'Local Storage Only', sub: 'Keep all limit data on this device with no cloud sync' },
];

function ToggleRow({ label, subtitle, value, onChange, saving, sh, isDark, colors }: {
  sh: any; isDark: boolean; colors: any;
  label: string; subtitle?: string; value: boolean;
  onChange: (v: boolean) => void; saving?: boolean;
}) {
  return (
    <View style={sh.row}>
      <View style={sh.rowBody}>
        <Text style={sh.rowLabel}>{label}</Text>
        {subtitle ? <Text style={sh.rowSub}>{subtitle}</Text> : null}
      </View>
      {saving ? (
        <ActivityIndicator size="small" color={colors.accentText} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.16)' : '#E5E5EA', true: colors.accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={isDark ? 'rgba(255,255,255,0.16)' : '#E5E5EA'}
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
  const [prefs, setPrefs] = useState<PrivacyPrefs>(DEFAULTS);

  const loadPrefs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.[PREFS_KEY]) {
        setPrefs({ ...DEFAULTS, ...user.user_metadata[PREFS_KEY] });
      }
    } catch (err) {
      console.warn('[PrivacyPrefs]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const handleToggle = (field: keyof PrivacyPrefs) => (value: boolean) => {
    const previous = prefs[field];
    setPrefs((p) => ({ ...p, [field]: value }));
    setSavingField(field);
    (async () => {
      try {
        const { error } = await supabase.auth.updateUser({
          data: { [PREFS_KEY]: { ...prefs, [field]: value } },
        });
        if (error) {
          playErrorFeedback();
          setPrefs((p) => ({ ...p, [field]: previous }));
        }
      } catch {
        playErrorFeedback();
        setPrefs((p) => ({ ...p, [field]: previous }));
      } finally {
        setSavingField(null);
      }
    })();
  };

  if (loading) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Privacy & Security" onBack={() => router.back()} />
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accentText} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Privacy & Security" onBack={() => router.back()} />
      <ScrollView style={sh.scroll} contentContainerStyle={sh.content} showsVerticalScrollIndicator={false}>
        <View style={styles.wrap}>
          <Text style={sh.sectionLabel}>Data Collection</Text>
          <View style={sh.card}>
            {TOGGLES.map((t, i) => (
              <View key={t.key} style={i < TOGGLES.length - 1 ? undefined : undefined}>
                {i > 0 && <View style={sh.rowDivider} />}
                <ToggleRow
                  sh={sh} isDark={isDark} colors={colors}
                  label={t.label} subtitle={t.sub}
                  value={prefs[t.key]} onChange={handleToggle(t.key)} saving={savingField === t.key}
                />
              </View>
            ))}
          </View>

          <Text style={sh.sectionLabel}>Your Data</Text>
          <View style={sh.card}>
            <View style={styles.infoWrap}>
              <Text style={styles.infoTitle}>What We Store</Text>
              <Text style={styles.infoBody}>
                FocusLock stores your account email, username, configured app limits, and daily usage counters. We never access your browsing history, messages, photos, or any personal content on your device.
              </Text>
              <Text style={[styles.infoBody, { marginTop: 10 }]}>
                Usage counters reset every day and are never sold or shared with advertisers.
              </Text>
            </View>
          </View>

          <Text style={sh.sectionLabel}>Legal</Text>
          <View style={sh.card}>
            <TouchableOpacity style={sh.row} onPress={() => router.push('/settings/privacy-policy')} activeOpacity={0.6}>
              <View style={sh.rowBody}>
                <Text style={[sh.rowLabel, { color: colors.accentText }]}>Privacy Policy</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Your preferences are saved to your account and apply across your devices.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createPrivacyStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',
    },
    loader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoWrap: {
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    infoTitle: {
      color: C.textPrimary,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 8,
    },
    infoBody: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    chevron: {
      color: C.textMuted,
      fontSize: 22,
      fontWeight: '300',
      lineHeight: 24,
    },
    footer: {
      color: C.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      marginHorizontal: 32,
      marginTop: 4,
    },
  });
}
