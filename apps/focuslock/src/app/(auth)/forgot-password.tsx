import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  StatusBar as RNStatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Input, Toast, OtpModal, ResetPasswordModal } from '../../components/ui';
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resendPasswordResetOtp,
  resetPasswordSubmit,
} from '../../lib/api';
import { playErrorFeedback } from '../../lib/feedback';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modals state
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetToken, setResetToken] = useState('');

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  const emailShakeAnim = useRef(new Animated.Value(0)).current;

  const triggerInputShake = (anim: Animated.Value) => {
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
  };

  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setToast({ visible: true, message, type });
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleEmailChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      triggerInputShake(emailShakeAnim);
      return;
    }
    setEmail(text);
  };

  const handleSendCode = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    const res = await requestPasswordResetOtp(cleanEmail);
    setIsLoading(false);

    if (res.error) {
      triggerInputShake(emailShakeAnim);
      showToast(res.error);
      return;
    }

    showToast(`Verification code has been sent to ${cleanEmail}. Verify to continue.`, 'info');
    setShowOtpModal(true);
  };

  // Called when user submits 6-digit code in OtpModal
  const handleVerifyOtp = async (code: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await verifyPasswordResetOtp(cleanEmail, code);

    if (res.error) {
      showToast(res.error);
      return false;
    }

    // Success! Save reset token, close OTP modal, open Reset Password modal
    setResetToken(res.data?.resetToken || '');
    setShowOtpModal(false);
    setTimeout(() => {
      setShowResetModal(true);
    }, 300);
  };

  // Called when user requests a new code in OtpModal
  const handleResendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await resendPasswordResetOtp(cleanEmail);

    if (res.error) {
      showToast(res.error);
      return false;
    }

    showToast(`A new reset code was sent to ${cleanEmail}.`, 'success');
  };

  // Called when user submits new password in ResetPasswordModal
  const handleResetSubmit = async (newPassword: string, confirmPassword: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await resetPasswordSubmit({
      email: cleanEmail,
      resetToken,
      newPassword,
      confirmPassword,
    });

    if (res.error) {
      showToast(res.error);
      return false;
    }

    setShowResetModal(false);
    showToast('Password reset successful! You can now securely log in.', 'success');

    // Fall back to login screen after successful reset
    setTimeout(() => {
      router.replace('/(auth)/login');
    }, 1500);
  };

  return (
    <View style={styles.screenContainer}>
      <RNStatusBar barStyle="light-content" backgroundColor="#09090b" />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      {/* OTP Verification Modal */}
      <OtpModal
        visible={showOtpModal}
        title="Verify Reset Code"
        subtitle="Enter the 6-digit code sent to:"
        email={email.trim().toLowerCase()}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        onClose={() => setShowOtpModal(false)}
        initialCooldown={30}
      />

      {/* Set New Password Modal */}
      <ResetPasswordModal
        visible={showResetModal}
        email={email.trim().toLowerCase()}
        onSubmit={handleResetSubmit}
        onClose={() => setShowResetModal(false)}
      />

      <View style={styles.ambientBlobTop} />
      <View style={styles.ambientBlobBottom} />

      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>← Back to Sign In</Text>
              </TouchableOpacity>
              <Text style={styles.brandTag}>FOCUSLOCK</Text>
            </View>

            <View style={styles.glassCard}>
              <View style={styles.headerBlock}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>
                  Enter your account email. We will send a secure 6-digit code via Resend to verify your identity.
                </Text>
              </View>

              {/* Form Field */}
              <View style={styles.formFields}>
                <Animated.View style={{ transform: [{ translateX: emailShakeAnim }] }}>
                  <Input
                    variant="dark"
                    label="Account Email Address"
                    placeholder="name@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={handleEmailChange}
                    leftIcon={
                      <Image
                        source={require('../../../assets/mail.svg')}
                        style={styles.inputIcon}
                        contentFit="contain"
                      />
                    }
                  />
                </Animated.View>
              </View>

              {/* Primary Action Button */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSendCode}
                disabled={!isEmailValid || isLoading}
                style={[styles.primaryButton, (!isEmailValid || isLoading) && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'Sending Code...' : 'Send Reset Code'}
                </Text>
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Remember your password?</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(auth)/login')}>
                  <Text style={styles.footerLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: '#09090b' },
  ambientBlobTop: {
    position: 'absolute', top: -60, left: -40,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(118, 247, 86, 0.06)',
  },
  ambientBlobBottom: {
    position: 'absolute', bottom: -80, right: -50,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 12, justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1,
    borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7,
  },
  backButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  brandTag: { color: '#71717a', fontSize: 11, fontWeight: '700', letterSpacing: 2.5 },
  glassCard: {
    backgroundColor: 'rgba(18, 18, 24, 0.88)', borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.5, borderRadius: 30, paddingHorizontal: 24, paddingVertical: 28,
    ...Platform.select({ ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 28 }, android: { elevation: 6 } }),
  },
  headerBlock: { marginBottom: 24 },
  title: { fontSize: 30, fontWeight: '800', color: '#ffffff', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, color: '#a1a1aa', marginTop: 6, lineHeight: 21 },
  formFields: { gap: 16, marginBottom: 24 },
  inputIcon: { width: 18, height: 18 },
  primaryButton: {
    backgroundColor: '#76F756', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#76F756', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 18, elevation: 8,
  },
  primaryButtonDisabled: { opacity: 0.60 },
  primaryButtonText: { color: '#09090b', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 22, gap: 6 },
  footerText: { color: '#a1a1aa', fontSize: 13 },
  footerLink: { color: '#76F756', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
