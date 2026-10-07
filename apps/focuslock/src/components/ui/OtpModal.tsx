import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
// expo-haptics removed — error-only haptic policy
import { playErrorFeedback } from '../../lib/feedback';

interface OtpModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  email: string;
  onVerify: (code: string) => Promise<boolean | void>;
  onResend: () => Promise<boolean | void>;
  onClose: () => void;
  initialCooldown?: number;
}

const NUM_DIGITS = 6;

export function OtpModal({
  visible,
  title = 'Verify Your Email',
  subtitle,
  email,
  onVerify,
  onResend,
  onClose,
  initialCooldown = 120,
}: OtpModalProps) {
  const [digits, setDigits] = useState<string[]>(Array(NUM_DIGITS).fill(''));
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);

  // One ref per digit box + one hidden full-code input for autofill
  const boxRefs = useRef<Array<TextInput | null>>(Array(NUM_DIGITS).fill(null));
  const autofillRef = useRef<TextInput>(null);
  const cardAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(1)).current;

  // ── Reset on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setDigits(Array(NUM_DIGITS).fill(''));
    setErrorMessage('');
    setFocusedIndex(0);
    setCooldown(initialCooldown);

    // Entrance animation
    cardAnim.setValue(60);
    Animated.spring(cardAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start(() => {
      // Focus the first box after entrance
      setTimeout(() => {
        boxRefs.current[0]?.focus();
      }, 80);
    });
  }, [visible, initialCooldown]);

  // ── Countdown timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, cooldown]);

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // ── Shake animation ────────────────────────────────────────────────────
  const triggerShake = useCallback(() => {
    playErrorFeedback();
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 14, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -14, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // ── Fill digits from a full 6-char string (autofill / paste) ──────────
  const applyCode = useCallback((raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, NUM_DIGITS);
    if (!cleaned) return;
    const next = Array(NUM_DIGITS).fill('');
    for (let i = 0; i < cleaned.length; i++) next[i] = cleaned[i];
    setDigits(next);
    setErrorMessage('');
    // Move focus to last filled + 1
    const focusIdx = Math.min(cleaned.length, NUM_DIGITS - 1);
    setFocusedIndex(focusIdx);
    boxRefs.current[focusIdx]?.focus();

    // no success haptic — error-only policy
  }, []);

  // ── Per-box change handler ─────────────────────────────────────────────
  const handleBoxChange = (text: string, index: number) => {
    if (/\D/.test(text)) {
      playErrorFeedback();
    }

    const cleaned = text.replace(/\D/g, '');

    // Paste / autofill dump: if 2+ chars come in at once treat as full code
    if (cleaned.length > 1) {
      applyCode(cleaned);
      return;
    }

    const next = [...digits];
    next[index] = cleaned.slice(-1); // take last char if somehow >1
    setDigits(next);
    setErrorMessage('');

    if (cleaned && index < NUM_DIGITS - 1) {
      const nextIdx = index + 1;
      setFocusedIndex(nextIdx);
      boxRefs.current[nextIdx]?.focus();
      // no selection haptic — error-only policy
    }
  };

  // ── Backspace handler ──────────────────────────────────────────────────
  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        const prevIdx = index - 1;
        const next = [...digits];
        next[prevIdx] = '';
        setDigits(next);
        setFocusedIndex(prevIdx);
        boxRefs.current[prevIdx]?.focus();
      }
    }
  };

  // ── Verify ─────────────────────────────────────────────────────────────
  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== NUM_DIGITS || !/^\d{6}$/.test(code)) {
      triggerShake();
      setErrorMessage('Please enter the complete 6-digit code.');
      return;
    }

    setErrorMessage('');
    setIsVerifying(true);

    // Brief success pulse animation
    Animated.sequence([
      Animated.timing(successAnim, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(successAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    try {
      const res = await onVerify(code);
      if (res === false) {
        triggerShake();
        setDigits(Array(NUM_DIGITS).fill(''));
        setFocusedIndex(0);
        setTimeout(() => boxRefs.current[0]?.focus(), 100);
      }
    } catch (err: any) {
      triggerShake();
      setErrorMessage(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Resend ─────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMessage('');
    setDigits(Array(NUM_DIGITS).fill(''));
    setFocusedIndex(0);

    try {
      await onResend();
      setCooldown(120);
      setTimeout(() => boxRefs.current[0]?.focus(), 200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const codeComplete = digits.every((d) => d !== '');

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropTap} onPress={() => {}} />

        <Animated.View
          style={[
            styles.modalCard,
            { transform: [{ translateY: cardAnim }, { scale: successAnim }] },
          ]}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {subtitle || 'We sent a 6-digit code to'}
            </Text>
            <View style={styles.emailBadgeWrap}>
              <Text style={styles.emailBadge} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <Text style={styles.autofillHint}>
              {Platform.OS === 'ios'
                ? 'iOS will suggest the code from your email automatically'
                : 'The code will appear in your notification bar'}
            </Text>
          </View>

          {/* ── Hidden single input for iOS autofill oneTimeCode ───── */}
          {Platform.OS === 'ios' && (
            <TextInput
              ref={autofillRef}
              style={styles.hiddenInput}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              value={digits.join('')}
              onChangeText={(text) => applyCode(text)}
              caretHidden
            />
          )}

          {/* ── 6 Split Digit Boxes ─────────────────────────────────── */}
          <Animated.View
            style={[
              styles.boxesRow,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            {Array(NUM_DIGITS)
              .fill(null)
              .map((_, i) => {
                const isFocused = focusedIndex === i && !digits[i];
                const isFilled = !!digits[i];
                return (
                  <TextInput
                    key={i}
                    ref={(r) => { boxRefs.current[i] = r; }}
                    style={[
                      styles.digitBox,
                      isFilled && styles.digitBoxFilled,
                      isFocused && styles.digitBoxFocused,
                    ]}
                    keyboardType="number-pad"
                    maxLength={6} // allow paste of full code
                    value={digits[i]}
                    onChangeText={(t) => handleBoxChange(t, i)}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    onFocus={() => setFocusedIndex(i)}
                    // ── iOS OTP autofill (works in all boxes) ──────
                    textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : 'none'}
                    autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                    selectTextOnFocus
                    caretHidden={Platform.OS === 'ios'}
                    selectionColor="#ffffff"
                    placeholderTextColor="#52525b"
                    placeholder="·"
                  />
                );
              })}
          </Animated.View>

          {/* ── Error ─────────────────────────────────────────────── */}
          {!!errorMessage && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* ── Resend Countdown ───────────────────────────────────── */}
          <View style={styles.resendRow}>
            {cooldown > 0 ? (
              <Text style={styles.countdownText}>
                Resend available in{' '}
                <Text style={styles.timerBold}>{formatTimer(cooldown)}</Text>
              </Text>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleResend}
                disabled={isResending}
              >
                <Text style={styles.resendLink}>
                  {isResending ? 'Sending new code...' : 'Resend code'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Action Buttons ────────────────────────────────────── */}
          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleVerify}
              disabled={isVerifying || !codeComplete}
              style={[
                styles.primaryBtn,
                (!codeComplete || isVerifying) && styles.primaryBtnDisabled,
                codeComplete && !isVerifying && styles.primaryBtnReady,
              ]}
            >
              {isVerifying ? (
                <ActivityIndicator color={codeComplete ? '#09090b' : '#ffffff'} size="small" />
              ) : (
                <Text style={[styles.primaryBtnText, codeComplete && styles.primaryBtnTextReady]}>
                  {codeComplete ? 'Verify & Continue' : 'Enter Code Above'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              disabled={isVerifying}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdropTap: {
    ...StyleSheet.absoluteFill,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(18, 18, 24, 0.96)',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    alignItems: 'center',
    marginBottom: 22,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  iconEmoji: {
    fontSize: 26,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  emailBadgeWrap: {
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 100,
    maxWidth: '100%',
  },
  emailBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  autofillHint: {
    fontSize: 11,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 10,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  // ── Split boxes ────────────────────────────────────────────────────────
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  digitBox: {
    width: 46,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    backgroundColor: '#18181b',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    color: '#ffffff',
  },
  digitBoxFocused: {
    borderColor: '#76F756',
    backgroundColor: '#27272a',
    ...Platform.select({
      ios: {
        shadowColor: '#76F756',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
    }),
  },
  digitBoxFilled: {
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: '#27272a',
  },
  // ── Error ──────────────────────────────────────────────────────────────
  errorWrap: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  // ── Resend ─────────────────────────────────────────────────────────────
  resendRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  countdownText: {
    color: '#a1a1aa',
    fontSize: 13,
  },
  timerBold: {
    fontWeight: '800',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  resendLink: {
    color: '#76F756',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  // ── Buttons ────────────────────────────────────────────────────────────
  actions: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#27272a',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnReady: {
    backgroundColor: '#76F756',
    ...Platform.select({
      ios: {
        shadowColor: '#76F756',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#71717a',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  primaryBtnTextReady: {
    color: '#09090b',
    fontWeight: '800',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '600',
  },
});
