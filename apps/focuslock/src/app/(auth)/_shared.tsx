import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../lib/ThemeContext';
import { R, S } from '../../lib/theme';
import { playErrorFeedback } from '../../lib/feedback';

/**
 * Shared, theme-aware design tokens for every (auth) screen.
 * Centralizes the "more than good" glass look so login, register and
 * forgot-password stay visually identical and on-brand in light + dark.
 */
export function useAuthStyles() {
  const { isDark, colors } = useTheme();
  return useMemo(() => {
    const glassShadow = Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: isDark ? 0.5 : 0.12,
        shadowRadius: 40,
      },
      android: { elevation: 10 },
      default: {},
    });

    const accentGlow = Platform.select({
      ios: {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
      default: {},
    });

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: colors.bg },
      orbGreen: {
        position: 'absolute', top: -90, left: -50,
        width: 300, height: 300, borderRadius: 150,
        backgroundColor: colors.orbGreen,
      },
      orbTeal: {
        position: 'absolute', bottom: -110, right: -60,
        width: 320, height: 320, borderRadius: 160,
        backgroundColor: colors.orbTeal,
      },
      safeArea: { flex: 1 },
      keyboardView: { flex: 1 },
      scrollContent: {
        flexGrow: 1, paddingHorizontal: S.xl, paddingVertical: S.md, justifyContent: 'center',
      },

      topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: S.xl, paddingHorizontal: S.xs,
      },
      backButton: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1,
        borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 8,
      },
      backButtonText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
      brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
      brandTag: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },

      card: {
        backgroundColor: colors.bgCardSolid, borderColor: colors.border, borderWidth: 1.5,
        borderRadius: R.xxl, paddingHorizontal: S.xxl, paddingVertical: 28,
        ...glassShadow,
      },
      cardAccentEdge: {
        position: 'absolute', top: 0, left: 28, right: 28, height: 2,
        borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
        backgroundColor: colors.accent, opacity: 0.5,
      },
      headerBlock: { marginBottom: S.xxl },
      title: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.6 },
      subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 21 },

      googleButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.bgInput, borderColor: colors.borderLight, borderWidth: 1.5,
        borderRadius: R.md, paddingVertical: 14, paddingHorizontal: S.lg,
        marginBottom: S.xl, gap: 10,
      },
      googleButtonDisabled: { opacity: 0.6 },
      googleLogo: { width: 20, height: 20 },
      googleButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },

      dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: S.xl },
      dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
      dividerText: {
        color: colors.textMuted, fontSize: 11, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: S.md,
      },

      formFields: { gap: S.lg, marginBottom: S.xxl },
      inputIcon: { width: 18, height: 18 },
      eyeButton: { padding: 4, justifyContent: 'center', alignItems: 'center' },
      eyeIcon: { width: 20, height: 20, tintColor: colors.textSecondary },

      primaryButton: {
        backgroundColor: colors.accent, borderRadius: R.md, paddingVertical: S.lg,
        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
        ...accentGlow,
      },
      primaryButtonDisabled: { opacity: 0.5 },
      primaryButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

      footerRow: {
        flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        marginTop: S.xl, gap: 6,
      },
      footerText: { color: colors.textSecondary, fontSize: 13 },
      footerLink: { color: colors.accentText, fontSize: 13, fontWeight: '700' },

      infoCard: {
        flexDirection: 'row', gap: S.md, backgroundColor: colors.accentDim,
        borderColor: colors.border, borderWidth: 1, borderRadius: R.md,
        padding: S.md, marginTop: S.lg,
      },
      infoCardText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 18 },
    });
  }, [colors, isDark]);
}

/** Compact horizontal shake used to flag an invalid input (red border via `error`). */
export function shakeInput(anim: Animated.Value) {
  playErrorFeedback();
  anim.setValue(0);
  Animated.sequence([
    Animated.timing(anim, { toValue: 12, duration: 40, useNativeDriver: true }),
    Animated.timing(anim, { toValue: -12, duration: 40, useNativeDriver: true }),
    Animated.timing(anim, { toValue: 8, duration: 40, useNativeDriver: true }),
    Animated.timing(anim, { toValue: -8, duration: 40, useNativeDriver: true }),
    Animated.timing(anim, { toValue: 4, duration: 40, useNativeDriver: true }),
    Animated.timing(anim, { toValue: 0, duration: 40, useNativeDriver: true }),
  ]).start();
}

/** Back button + brand tag row. */
export function BrandTopBar({ onBack }: { onBack: () => void }) {
  const styles = useAuthStyles();
  return (
    <View style={styles.topBar}>
      <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
      <View style={styles.brandRow}>
        <View style={styles.brandDot} />
        <Text style={styles.brandTag}>FOCUSLOCK</Text>
      </View>
    </View>
  );
}

interface GoogleAuthButtonProps {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}

/** Themed "Continue with Google" button with a spinner state. */
export function GoogleAuthButton({
  onPress,
  disabled,
  loading,
  label = 'Continue with Google',
}: GoogleAuthButtonProps) {
  const styles = useAuthStyles();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.googleButton, (disabled || loading) && styles.googleButtonDisabled]}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Image
            source={require('../../../assets/google-logo.webp')}
            style={styles.googleLogo}
            contentFit="contain"
          />
          <Text style={styles.googleButtonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** "or continue with email" divider. */
export function OrDivider({ text }: { text: string }) {
  const styles = useAuthStyles();
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{text}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}
