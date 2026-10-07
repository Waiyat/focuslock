import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
// expo-haptics removed — error-only haptic policy
import { SubHeader, useSharedStyles } from './_shared';
import { supabase } from '../../lib/supabase';
import { submitFeedback } from '../../lib/api';

const CATEGORIES = [
  { id: 'bug', label: 'Bug Report', sub: 'Something is broken or not working as expected', color: '#ff3b30' },
  { id: 'feature', label: 'Feature Request', sub: 'An idea or tool you would love to see', color: '#007aff' },
  { id: 'ux', label: 'Usability & Design', sub: 'Layout, typography, colors, or ease of use', color: '#af52de' },
  { id: 'general', label: 'General Feedback', sub: 'Any other comments, compliments, or thoughts', color: '#ff9500' },
] as const;

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'];

export default function FeedbackScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createFeedbackStyles(colors, isDark);
  const [selectedCat, setSelectedCat] = useState<string>('general');
  const [rating, setRating] = useState<number>(5);
  const [message, setMessage] = useState<string>('');
  const [replyEmail, setReplyEmail] = useState<string>('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setReplyEmail(data.user.email);
      }
    });
  }, []);

  const handleSelectRating = (stars: number) => {
    // no haptic — error-only policy
    setRating(stars);
  };

  const handleSelectCategory = (catId: string) => {
    // no haptic — error-only policy
    setSelectedCat(catId);
  };

  const handleSubmit = async () => {
    if (message.trim().length < 8) {
      // no haptic — error-only policy only fires for auth errors
      Alert.alert('More Details Needed', 'Please provide at least 8 characters describing your feedback.');
      return;
    }

    setSubmitting(true);
    // no haptic on submit — error-only policy

    const { error } = await submitFeedback({
      category: selectedCat,
      rating,
      message: message.trim(),
      replyEmail: replyEmail.trim() || undefined,
      platform: Platform.OS,
      includeDiagnostics,
    });

    setSubmitting(false);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    setSubmitted(true);
    // no haptic on success — error-only policy
  };

  if (submitted) {
    return (
      <SafeAreaView style={sh.safe} edges={['top']}>
        <SubHeader title="Feedback Received" onBack={() => router.back()} />
        <View style={styles.successContainer}>
          <View style={styles.successIconBadge}>
            <Text style={styles.successCheck}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Thank You!</Text>
          <Text style={styles.successBody}>
            Your feedback has been sent directly to the FocusLock engineering and design team. We review every note to build a better digital wellbeing companion.
          </Text>
          <TouchableOpacity
            style={[sh.primaryBtn, { width: '100%', marginTop: 20 }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={sh.primaryBtnText}>Return to Settings</Text>
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
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Banner Card */}
          <View style={styles.heroCard}>
            <Text style={styles.heroBadge}>COMMUNITY DRIVEN</Text>
            <Text style={styles.heroTitle}>Help Us Improve FocusLock</Text>
            <Text style={styles.heroSub}>
              Have an idea, found a glitch, or want to suggest layout improvements? We read every submission.
            </Text>
          </View>

          {/* Feedback Category */}
          <Text style={sh.sectionLabel}>FEEDBACK CATEGORY</Text>
          <View style={sh.card}>
            {CATEGORIES.map((cat, idx) => {
              const isSelected = selectedCat === cat.id;
              const isFirst = idx === 0;
              const isLast = idx === CATEGORIES.length - 1;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    sh.row,
                    isFirst && sh.rowFirst,
                    isLast && sh.rowLast,
                    !isLast && sh.rowDivider,
                  ]}
                  onPress={() => handleSelectCategory(cat.id)}
                  activeOpacity={0.65}
                >
                  <View style={[styles.catColorIndicator, { backgroundColor: cat.color }]} />
                  <View style={sh.rowBody}>
                    <Text style={sh.rowLabel}>{cat.label}</Text>
                    <Text style={sh.rowSub}>{cat.sub}</Text>
                  </View>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Experience Rating */}
          <Text style={sh.sectionLabel}>OVERALL EXPERIENCE</Text>
          <View style={[sh.card, styles.ratingCard]}>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleSelectRating(star)}
                  style={styles.starTouchable}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.starIcon, rating >= star && styles.starActive]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>
          </View>

          {/* Detailed Message */}
          <Text style={sh.sectionLabel}>YOUR THOUGHTS & DETAILS</Text>
          <View style={[sh.card, { padding: 14 }]}>
            <TextInput
              style={styles.textarea}
              value={message}
              onChangeText={setMessage}
              placeholder="Tell us what happened, what you expected, or how FocusLock can be better..."
              placeholderTextColor="#8e8e93"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              selectionColor="#007aff"
              maxLength={1000}
            />
            <View style={styles.charCountRow}>
              <Text style={styles.charCountText}>{message.length} / 1000 characters</Text>
            </View>
          </View>

          {/* Reply Email */}
          <Text style={sh.sectionLabel}>REPLY EMAIL</Text>
          <View style={[sh.card, { paddingVertical: 4, paddingHorizontal: 16 }]}>
            <TextInput
              style={styles.emailInput}
              value={replyEmail}
              onChangeText={setReplyEmail}
              placeholder="Your email (optional for reply)"
              placeholderTextColor="#8e8e93"
              keyboardType="email-address"
              autoCapitalize="none"
              selectionColor="#007aff"
            />
          </View>

          {/* Diagnostics Switch */}
          <Text style={sh.sectionLabel}>DIAGNOSTIC TELEMETRY</Text>
          <View style={sh.card}>
            <View style={[sh.row, sh.rowFirst, sh.rowLast]}>
              <View style={sh.rowBody}>
                <Text style={sh.rowLabel}>Include Device Info</Text>
                <Text style={sh.rowSub}>
                  {Platform.OS === 'ios' ? 'iOS' : 'Android'} · FocusLock v1.0.0 (Build 1)
                </Text>
              </View>
              <Switch
                value={includeDiagnostics}
                onValueChange={setIncludeDiagnostics}
                trackColor={{ false: '#e5e5ea', true: '#34c759' }}
                thumbColor="#ffffff"
                ios_backgroundColor="#e5e5ea"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[sh.primaryBtn, submitting && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={sh.primaryBtnText}>Submit Feedback</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createFeedbackStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 48,
  },
  heroCard: {
    backgroundColor: isDark ? colors.bgCardSolid : '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBadge: {
    color: '#007aff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  heroSub: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  catColorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  checkmark: {
    color: '#007aff',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  ratingCard: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  starTouchable: {
    padding: 4,
  },
  starIcon: {
    fontSize: 32,
    color: '#d1d1d6',
  },
  starActive: {
    color: '#ff9500',
  },
  ratingLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  textarea: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    paddingTop: 0,
    paddingBottom: 4,
  },
  charCountRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 8,
    alignItems: 'flex-end',
  },
  charCountText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  emailInput: {
    color: colors.textPrimary,
    fontSize: 16,
    paddingVertical: 12,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  successIconBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#34c759',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#34c759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  successCheck: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '700',
  },
  successTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  successBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  });
}
