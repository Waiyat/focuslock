import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { ThemeColors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { submitFeedback } from '../../lib/api';
import { playErrorFeedback } from '../../lib/feedback';

const APP_VERSION = '1.1.5';

interface Category {
  id: string;
  label: string;
  sub: string;
  color: string;
}

const CATEGORIES: Category[] = [
  { id: 'bug', label: 'Bug Report', sub: 'Something is broken or not working as expected', color: '#FF3B30' },
  { id: 'feature', label: 'Feature Request', sub: 'A capability or idea you would like to see', color: '#007AFF' },
  { id: 'design', label: 'Design & Usability', sub: 'Layout, readability, or ease of use', color: '#AF52DE' },
  { id: 'general', label: 'General', sub: 'Anything else you would like to share', color: '#FF9500' },
];

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

export default function FeedbackScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = useMemo(() => createFeedbackStyles(colors, isDark), [colors, isDark]);

  const [category, setCategory] = useState<string>('general');
  const [rating, setRating] = useState<number>(5);
  const [message, setMessage] = useState<string>('');
  const [replyEmail, setReplyEmail] = useState<string>('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setReplyEmail(data.user.email);
    });
  }, []);

  const handleSubmit = async () => {
    if (message.trim().length < 8) {
      playErrorFeedback();
      setError('Please add a few more details (at least 8 characters).');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error: submitError } = await submitFeedback({
      category,
      rating,
      message: message.trim(),
      replyEmail: replyEmail.trim() || undefined,
      platform: Platform.OS,
      includeDiagnostics,
    });
    setSubmitting(false);
    if (submitError) {
      playErrorFeedback();
      setError(submitError);
      return;
    }
    setDone(true);
  };

  const canSubmit = message.trim().length >= 8 && !submitting;

  if (done) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Send Feedback" onBack={() => router.back()} />
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <View style={styles.checkShort} />
            <View style={styles.checkLong} />
          </View>
          <Text style={styles.successTitle}>Thank you</Text>
          <Text style={styles.successBody}>
            Your feedback has been received. It goes directly to the FocusLock team and helps shape
            the next update.
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            style={styles.primaryBtn}
          >
            <Text style={styles.primaryBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Send Feedback" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={sh.scroll}
          contentContainerStyle={sh.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.wrap}>
            {/* Intro */}
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>Share your feedback</Text>
              <Text style={styles.introBody}>
                Tell us what is working and what is not. Every report is reviewed by the FocusLock
                team and directly shapes the next update.
              </Text>
            </View>

            {/* Category */}
            <Text style={sh.sectionLabel}>Category</Text>
            <View style={sh.card}>
              {CATEGORIES.map((c, i) => {
                const active = category === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.7}
                    onPress={() => setCategory(c.id)}
                    style={[styles.catRow, i < CATEGORIES.length - 1 && styles.rowDivider]}
                  >
                    <View style={[styles.catDot, { backgroundColor: c.color }]} />
                    <View style={styles.catBody}>
                      <Text style={styles.catLabel}>{c.label}</Text>
                      <Text style={styles.catSub}>{c.sub}</Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Rating */}
            <Text style={sh.sectionLabel}>Overall experience</Text>
            <View style={sh.card}>
              <View style={styles.ratingWrap}>
                {RATING_LABELS.map((label, i) => {
                  const value = i + 1;
                  const active = rating === value;
                  return (
                    <TouchableOpacity
                      key={label}
                      activeOpacity={0.7}
                      onPress={() => setRating(value)}
                      style={[styles.ratingSeg, active && styles.ratingSegActive]}
                    >
                      <Text style={[styles.ratingSegText, active && styles.ratingSegTextActive]}>
                        {value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.ratingLabelWrap}>
                <Text style={styles.ratingLabel}>{RATING_LABELS[rating - 1]}</Text>
              </View>
            </View>

            {/* Message */}
            <Text style={sh.sectionLabel}>Details</Text>
            <View style={styles.inputCard}>
              <TextInput
                style={styles.textArea}
                placeholder="Tell us what happened, what you expected, and any steps to reproduce the issue."
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                value={message}
                onChangeText={setMessage}
              />
              <View style={styles.counterRow}>
                <Text style={styles.counterText}>{message.trim().length} characters</Text>
              </View>
            </View>

            {/* Reply email */}
            <Text style={sh.sectionLabel}>Contact</Text>
            <View style={styles.inputCard}>
              <TextInput
                style={styles.input}
                placeholder="Email for a reply (optional)"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={replyEmail}
                onChangeText={setReplyEmail}
              />
            </View>

            {/* Diagnostics toggle */}
            <Text style={sh.sectionLabel}>Privacy</Text>
            <View style={sh.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleBody}>
                  <Text style={styles.toggleLabel}>Include device diagnostics</Text>
                  <Text style={styles.toggleSub}>
                    Shares your app version and platform to help us reproduce the issue. No personal
                    data or usage statistics are ever sent.
                  </Text>
                </View>
                <Switch
                  value={includeDiagnostics}
                  onValueChange={setIncludeDiagnostics}
                  trackColor={{
                    false: isDark ? 'rgba(255,255,255,0.16)' : '#D1D5DB',
                    true: colors.success,
                  }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={isDark ? 'rgba(255,255,255,0.16)' : '#D1D5DB'}
                />
              </View>
            </View>

            {error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={[styles.primaryBtn, styles.submitBtn, !canSubmit && styles.primaryBtnDisabled]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={[styles.primaryBtnText, !canSubmit && styles.primaryBtnTextDisabled]}>
                  Send Feedback
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.footer}>{`FocusLock v${APP_VERSION}`}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createFeedbackStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',
    },

    // ─── Intro (matches terms/privacy) ───────────────────────────────────────
    introCard: {
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      marginHorizontal: 16,
      marginBottom: 24,
    },
    introTitle: {
      color: C.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
      marginBottom: 6,
    },
    introBody: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },

    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },

    // ─── Category rows ───────────────────────────────────────────────────────
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    catDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 14,
    },
    catBody: {
      flex: 1,
      marginRight: 12,
    },
    catLabel: {
      color: C.textPrimary,
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: -0.3,
    },
    catSub: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: C.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: {
      borderColor: C.accent,
      backgroundColor: C.accent,
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.onAccent,
    },

    // ─── Rating ──────────────────────────────────────────────────────────────
    ratingWrap: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    ratingSeg: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: C.bgInput,
      borderWidth: 1,
      borderColor: C.border,
    },
    ratingSegActive: {
      backgroundColor: C.accent,
      borderColor: C.accent,
    },
    ratingSegText: {
      color: C.textSecondary,
      fontSize: 15,
      fontWeight: '700',
    },
    ratingSegTextActive: {
      color: C.onAccent,
    },
    ratingLabelWrap: {
      alignItems: 'center',
      paddingTop: 12,
      paddingBottom: 16,
    },
    ratingLabel: {
      color: C.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },

    // ─── Inputs ──────────────────────────────────────────────────────────────
    inputCard: {
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      marginHorizontal: 16,
      marginBottom: 24,
      overflow: 'hidden',
    },
    textArea: {
      minHeight: 120,
      padding: 14,
      color: C.textPrimary,
      fontSize: 15,
      lineHeight: 22,
    },
    counterRow: {
      alignItems: 'flex-end',
      paddingHorizontal: 14,
      paddingBottom: 10,
    },
    counterText: {
      color: C.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    input: {
      paddingVertical: 13,
      paddingHorizontal: 14,
      color: C.textPrimary,
      fontSize: 15,
    },

    // ─── Diagnostics toggle ──────────────────────────────────────────────────
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    toggleBody: {
      flex: 1,
      marginRight: 12,
    },
    toggleLabel: {
      color: C.textPrimary,
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: -0.3,
    },
    toggleSub: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },

    // ─── Error ───────────────────────────────────────────────────────────────
    errorWrap: {
      backgroundColor: C.dangerDim,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(248,113,113,0.35)' : 'rgba(220,38,38,0.35)',
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    errorText: {
      color: isDark ? '#FCA5A5' : '#B91C1C',
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },

    // ─── Buttons ─────────────────────────────────────────────────────────────
    primaryBtn: {
      backgroundColor: C.accent,
      borderRadius: 14,
      paddingVertical: 15,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    submitBtn: {
      marginHorizontal: 16,
      marginBottom: 16,
    },
    primaryBtnDisabled: {
      opacity: 0.45,
    },
    primaryBtnText: {
      color: C.onAccent,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    primaryBtnTextDisabled: {},

    footer: {
      color: C.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      marginHorizontal: 32,
      marginTop: 4,
    },

    // ─── Success screen ──────────────────────────────────────────────────────
    successWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingBottom: 48,
    },
    successIcon: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: C.successDim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },
    checkShort: {
      position: 'absolute',
      width: 3,
      height: 16,
      borderRadius: 2,
      backgroundColor: C.success,
      left: 27,
      top: 33,
      transform: [{ rotate: '45deg' }],
    },
    checkLong: {
      position: 'absolute',
      width: 3,
      height: 30,
      borderRadius: 2,
      backgroundColor: C.success,
      left: 39,
      top: 22,
      transform: [{ rotate: '-45deg' }],
    },
    successTitle: {
      color: C.textPrimary,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
      marginBottom: 8,
      textAlign: 'center',
    },
    successBody: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: 28,
    },
  });
}
