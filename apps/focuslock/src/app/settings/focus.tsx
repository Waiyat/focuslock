import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { supabase } from '../../lib/supabase';
import { playSelectionFeedback, playSuccessFeedback, playErrorFeedback } from '../../lib/feedback';

/**
 * Focus preferences are stored in Supabase auth user metadata.
 * Key: focuslock_focus → { strictness: string, breakReminders: bool, breakInterval: number }
 */
const PREFS_KEY = 'focuslock_focus';

type Strictness = 'standard' | 'strict' | 'max';
type BreakInterval = 20 | 30 | 45 | 60;

interface FocusPrefs {
  strictness: Strictness;
  breakReminders: boolean;
  breakInterval: BreakInterval;
}

const DEFAULTS: FocusPrefs = { strictness: 'standard', breakReminders: true, breakInterval: 30 };

const STRICTNESS_OPTIONS: { value: Strictness; label: string; sub: string }[] = [
  { value: 'standard', label: 'Standard', sub: '2-minute grace period past limit' },
  { value: 'strict',   label: 'Strict',   sub: 'Lock immediately at limit' },
  { value: 'max',      label: 'Maximum',  sub: 'Lock + 1-hour cooldown period' },
];

const BREAK_INTERVALS: BreakInterval[] = [20, 30, 45, 60];

function OptionRow({
  label, sub, selected, onPress, sh, styles,
}: { label: string; sub?: string; selected: boolean; onPress: () => void; sh: any; styles: any }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[sh.row, selected && styles.selectedRow]}>
      <View style={sh.rowBody}>
        <Text style={[sh.rowLabel, selected && styles.selectedLabel]}>{label}</Text>
        {sub ? <Text style={sh.rowSub}>{sub}</Text> : null}
      </View>
      {selected && <Text style={styles.checkmark}>✓</Text>}
    </TouchableOpacity>
  );
}

export default function FocusPreferencesScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createFocusStyles(colors, isDark);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<FocusPrefs>(DEFAULTS);
  const [pendingPrefs, setPendingPrefs] = useState<FocusPrefs>(DEFAULTS);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const stored = user.user_metadata?.[PREFS_KEY];
      if (stored) {
        const loaded = { ...DEFAULTS, ...stored };
        setPrefs(loaded);
        setPendingPrefs(loaded);
      }
    } catch (err) {
      console.warn('[FocusPrefs load]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const updatePending = (patch: Partial<FocusPrefs>) => {
    playSelectionFeedback();
    setPendingPrefs((prev) => {
      const next = { ...prev, ...patch };
      setDirty(JSON.stringify(next) !== JSON.stringify(prefs));
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { [PREFS_KEY]: pendingPrefs },
      });
      if (error) {
        playErrorFeedback();
        setStatusMsg({ text: 'Failed to save. Try again.', ok: false });
      } else {
        playSuccessFeedback();
        setPrefs(pendingPrefs);
        setDirty(false);
        setStatusMsg({ text: 'Preferences saved.', ok: true });
        setTimeout(() => setStatusMsg(null), 2000);
      }
    } catch {
      playErrorFeedback();
      setStatusMsg({ text: 'Save failed.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Focus Preferences" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#007aff" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Focus Preferences" onBack={() => router.back()} />
      <ScrollView style={sh.scroll} contentContainerStyle={sh.content} showsVerticalScrollIndicator={false}>
        {statusMsg && (
          <View style={[styles.statusBanner, statusMsg.ok ? styles.statusOk : styles.statusErr]}>
            <Text style={styles.statusText}>{statusMsg.ok ? '✓ ' : '✕ '}{statusMsg.text}</Text>
          </View>
        )}

        <Text style={sh.sectionLabel}>STRICTNESS LEVEL</Text>
        <View style={sh.card}>
          {STRICTNESS_OPTIONS.map((opt, i) => (
            <React.Fragment key={opt.value}>
              <OptionRow sh={sh} styles={styles}
                label={opt.label}
                sub={opt.sub}
                selected={pendingPrefs.strictness === opt.value}
                onPress={() => updatePending({ strictness: opt.value })}
              />
              {i < STRICTNESS_OPTIONS.length - 1 && <View style={sh.divider} />}
            </React.Fragment>
          ))}
        </View>

        <Text style={sh.sectionLabel}>BREAK REMINDERS</Text>
        <View style={sh.card}>
          <View style={[sh.row, sh.rowFirst, pendingPrefs.breakReminders ? sh.rowDivider : sh.rowLast]}>
            <View style={sh.rowBody}>
              <Text style={sh.rowLabel}>Break Reminders</Text>
              <Text style={sh.rowSub}>Nudge you to step away from the screen</Text>
            </View>
            <Switch
              value={pendingPrefs.breakReminders}
              onValueChange={(v) => updatePending({ breakReminders: v })}
              trackColor={{ false: '#e5e5ea', true: '#34c759' }}
              thumbColor="#ffffff"
              ios_backgroundColor="#e5e5ea"
            />
          </View>

          {pendingPrefs.breakReminders && BREAK_INTERVALS.map((mins, i, arr) => (
            <React.Fragment key={mins}>
              <OptionRow sh={sh} styles={styles}
                label={`Every ${mins} minutes`}
                selected={pendingPrefs.breakInterval === mins}
                onPress={() => updatePending({ breakInterval: mins })}
              />
              {i < arr.length - 1 && <View style={sh.divider} />}
            </React.Fragment>
          ))}
        </View>

        <TouchableOpacity
          style={[sh.primaryBtn, (!dirty || saving) && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!dirty || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={sh.primaryBtnText}>Save Preferences</Text>
          )}
        </TouchableOpacity>

        {!dirty && !saving && (
          <Text style={styles.upToDate}>Preferences are up to date.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createFocusStyles(colors: any, isDark: boolean) {
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
  selectedRow: { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#f5f9ff' },
  selectedLabel: { color: colors.accent, fontWeight: '600' },
  checkmark: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  btnDisabled: { opacity: 0.45 },
  upToDate: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  });
}
