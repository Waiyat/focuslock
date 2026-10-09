import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar as RNStatusBar,
  Animated,
  ActivityIndicator,
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
import { useAuthStyles, shakeInput, BrandTopBar } from './_shared';
import { useTheme } from '../../lib/ThemeContext';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const styles = useAuthStyles();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modals state
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  const emailShakeAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setToast({ visible: true, message, type });
  };

  const flagEmailError = (message: string) => {
    setEmailError(message);
    shakeInput(emailShakeAnim);
    showToast(message);
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailError) setEmailError('');
    if (/\s/.test(text)) {
      setEmail(text.replace(/\s/g, ''));
      flagEmailError('Spaces are not allowed in email addresses.');
    }
  };

  const handleSendCode = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      flagEmailError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      flagEmailError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    const res = await requestPasswordResetOtp(cleanEmail);
    setIsLoading(false);

    if (res.error) {
      flagEmailError(res.error);
      return;
    }

    showToast(`Verification code has been sent to ${cleanEmail}. Verify to continue.`, 'info');
    setShowOtpModal(true);
  };

  const handleVerifyOtp = async (code: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await verifyPasswordResetOtp(cleanEmail, code);

    if (res.error) {
      showToast(res.error);
      return false;
    }

    setResetToken(res.data?.resetToken || '');
    setShowOtpModal(false);
    setTimeout(() => {
      setShowResetModal(true);
    }, 300);
  };

  const handleResendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await resendPasswordResetOtp(cleanEmail);

    if (res.error) {
      showToast(res.error);
      return false;
    }

    showToast(`A new reset code was sent to ${cleanEmail}.`, 'success');
  };

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

    setTimeout(() => {
      router.replace('/(auth)/login');
    }, 1500);
  };

  return (
    <View style={styles.screen}>
      <RNStatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

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

      <ResetPasswordModal
        visible={showResetModal}
        email={email.trim().toLowerCase()}
        onSubmit={handleResetSubmit}
        onClose={() => setShowResetModal(false)}
      />

      <View style={styles.orbGreen} pointerEvents="none" />
      <View style={styles.orbTeal} pointerEvents="none" />

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
            <BrandTopBar onBack={() => router.back()} />

            <View style={styles.card}>
              <View pointerEvents="none" style={styles.cardAccentEdge} />

              <View style={styles.headerBlock}>
                <Text style={styles.title}>Reset password</Text>
                <Text style={styles.subtitle}>
                  Enter your account email. We will send a secure 6-digit code to verify your identity.
                </Text>
              </View>

              <View style={styles.formFields}>
                <Animated.View style={{ transform: [{ translateX: emailShakeAnim }] }}>
                  <Input
                    label="Account Email Address"
                    placeholder="name@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={handleEmailChange}
                    error={emailError.trim() ? emailError : undefined}
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

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSendCode}
                disabled={!isEmailValid || isLoading}
                style={[styles.primaryButton, (!isEmailValid || isLoading) && styles.primaryButtonDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Code</Text>
                )}
              </TouchableOpacity>

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

