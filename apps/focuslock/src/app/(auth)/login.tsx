import React, { useState, useRef, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { OtpModal } from '../../components/ui/OtpModal';
import { supabase } from '../../lib/supabase';
import { isOnboardingComplete } from '../../lib/onboarding';
import { resendRegisterOtp, verifyRegisterOtp } from '../../lib/api';
import { claimDeviceSession, getDeviceName, getDevicePlatform } from '../../lib/deviceSession';
import {
  useGoogleAuthRequest,
  completeGoogleSignIn,
  isGoogleConfigured,
} from '../../lib/googleAuth';
import { useAuthStyles, shakeInput, BrandTopBar, GoogleAuthButton, OrDivider } from './_shared';
import { useTheme } from '../../lib/ThemeContext';

export default function LoginScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const styles = useAuthStyles();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);

  // Per-field error messages drive the red input border.
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  // Flash message handed over from other screens (e.g. register → login).
  const { flash } = useLocalSearchParams<{ flash?: string }>();
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(
      () => setToast({ visible: true, message: String(flash), type: 'success' }),
      0
    );
    return () => clearTimeout(timer);
  }, [flash]);

  const emailShakeAnim = useRef(new Animated.Value(0)).current;
  const passwordShakeAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setToast({ visible: true, message, type });
  };

  const flagEmailError = (message: string) => {
    setEmailError(message);
    shakeInput(emailShakeAnim);
    showToast(message);
  };

  const flagPasswordError = (message: string) => {
    setPasswordError(message);
    shakeInput(passwordShakeAnim);
    showToast(message);
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (emailError) setEmailError('');
    if (/\s/.test(text)) {
      setEmail(text.replace(/\s/g, ''));
      flagEmailError('Spaces are not allowed in email addresses.');
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError('');
    if (/\s/.test(text)) {
      setPassword(text.replace(/\s/g, ''));
      flagPasswordError('Spaces are not allowed in passwords.');
    }
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isFormValid = isEmailValid && isPasswordValid;

  const validate = () => {
    let valid = true;
    if (!email.trim()) {
      flagEmailError('Please enter your email address.');
      valid = false;
    } else if (!isEmailValid) {
      flagEmailError('Please enter a valid email address.');
      valid = false;
    }
    if (!password) {
      flagPasswordError('Please enter your password.');
      valid = false;
    } else if (password.length < 6) {
      flagPasswordError('Password must be at least 6 characters.');
      valid = false;
    }
    return valid;
  };

  /** Shared success path — verified? → onboarding check → dashboard. */
  const finishSignIn = async (user: any) => {
    const onboarded = await isOnboardingComplete(user);
    // Single-device session: claim THIS install as the holder (latest wins).
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await claimDeviceSession(data.session.access_token, getDeviceName(), getDevicePlatform());
      }
    } catch {
      /* non-blocking — the foreground check retries when online */
    }
    router.replace(onboarded ? '/dashboard' : '/onboarding');
  };

  const handleSignIn = async () => {
    if (isLoading) return;
    if (!validate()) return;
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      const message = (error.message || '').toLowerCase();
      const unconfirmed =
        (error as any).code === 'email_not_confirmed' ||
        message.includes('not confirmed') ||
        message.includes('confirm your email');

      if (message.includes('invalid login')) {
        setIsLoading(false);
        setEmailError(' ');
        setPasswordError(' ');
        shakeInput(emailShakeAnim);
        shakeInput(passwordShakeAnim);
        showToast('Incorrect email or password. Please try again.');
        return;
      }

      if (unconfirmed) {
        showToast(
          'Your email is not verified yet — enter the code we send you to continue.',
          'info'
        );
        const resend = await resendRegisterOtp(cleanEmail);
        setIsLoading(false);
        if (resend.error) {
          showToast(resend.error, 'error');
          return;
        }
        setShowOtpModal(true);
        return;
      }

      setIsLoading(false);
      showToast(error.message ?? 'Sign in failed. Please try again.');
      return;
    }

    setIsLoading(false);
    await finishSignIn(data?.user);
  };

  const handleVerifyLoginOtp = async (code: string): Promise<boolean | string> => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await verifyRegisterOtp(cleanEmail, code);
    if (res.error) return res.error;

    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    setIsLoading(false);

    if (error) {
      const message = error.message || 'Sign in failed. Please try again.';
      return message.toLowerCase().includes('invalid login')
        ? 'Incorrect password for this account.'
        : message;
    }

    setShowOtpModal(false);
    await finishSignIn(data?.user);
    return true;
  };

  const handleResendLoginOtp = async () => {
    const res = await resendRegisterOtp(email.trim().toLowerCase());
    if (res.error) throw new Error(res.error);
  };

  // ── Google OAuth (ID token) ────────────────────────────────────────────
  const [, googleResponse, googlePromptAsync] = useGoogleAuthRequest();

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      setGoogleLoading(false);
      return;
    }
    const idToken =
      (googleResponse as any).params?.id_token ??
      (googleResponse as any).authentication?.idToken;
    if (!idToken) {
      setGoogleLoading(false);
      showToast('Google did not return an ID token.', 'error');
      return;
    }
    (async () => {
      try {
        const { isNewUser } = await completeGoogleSignIn(idToken);
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) {
            await claimDeviceSession(
              data.session.access_token,
              getDeviceName(),
              getDevicePlatform()
            );
          }
        } catch {
          /* non-blocking */
        }
        setGoogleLoading(false);
        router.replace(isNewUser ? '/onboarding' : '/dashboard');
      } catch (err: any) {
        setGoogleLoading(false);
        showToast(err?.message || 'Google sign-in failed. Please try again.', 'error');
      }
    })();
  }, [googleResponse, router]);

  const handleGoogleSignIn = async () => {
    if (!isGoogleConfigured()) {
      showToast(
        'Google sign-in is not configured yet. Add your Google client IDs to continue.',
        'info'
      );
      return;
    }
    setGoogleLoading(true);
    try {
      await googlePromptAsync();
    } catch {
      setGoogleLoading(false);
      showToast('Could not start Google sign-in.', 'error');
    }
  };

  const handleForgotPassword = () => {
    router.push('/(auth)/forgot-password');
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

      {/* Email verification — opened automatically when sign-in is blocked
          by an unverified email (verification code flow). */}
      <OtpModal
        visible={showOtpModal}
        title="Verify Your Email"
        subtitle="Enter the 6-digit code we sent to"
        email={email.trim().toLowerCase()}
        onVerify={handleVerifyLoginOtp}
        onResend={handleResendLoginOtp}
        onClose={() => setShowOtpModal(false)}
        initialCooldown={120}
      />

      {/* Ambient brand orbs */}
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
            <BrandTopBar onBack={() => router.replace('/')} />

            <View style={styles.card}>
              <View pointerEvents="none" style={styles.cardAccentEdge} />

              <View style={styles.headerBlock}>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.subtitle}>
                  Sign in to keep your screen-time discipline enforced across every device.
                </Text>
              </View>

              {/* Google — one button covers sign-in AND sign-up */}
              <GoogleAuthButton onPress={handleGoogleSignIn} loading={googleLoading} disabled={isLoading} />

              <OrDivider text="or sign in with email" />



              {/* Form fields */}
              <View style={styles.formFields}>
                <Animated.View style={{ transform: [{ translateX: emailShakeAnim }] }}>
                  <Input
                    label="Email Address"
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

                <Animated.View style={{ transform: [{ translateX: passwordShakeAnim }] }}>
                  <Input
                    label="Password"
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    value={password}
                    onChangeText={handlePasswordChange}
                    error={passwordError.trim() ? passwordError : undefined}
                    leftIcon={
                      <Image
                        source={require('../../../assets/lock.svg')}
                        style={styles.inputIcon}
                        contentFit="contain"
                      />
                    }
                    rightIcon={
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={styles.eyeButton}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <Image
                          source={showPassword ? require('../../../assets/eye-off.svg') : require('../../../assets/eye.svg')}
                          style={styles.eyeIcon}
                          contentFit="contain"
                        />
                      </TouchableOpacity>
                    }
                  />
                </Animated.View>
              </View>

              {/* Forgot password */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleForgotPassword}
                style={{ alignSelf: 'flex-end', marginBottom: 18, marginTop: -6 }}
              >
                <Text style={styles.footerLink}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Primary action */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSignIn}
                disabled={!isFormValid || isLoading}
                style={[styles.primaryButton, (!isFormValid || isLoading) && styles.primaryButtonDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>New to FocusLock?</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(auth)/register')}>
                  <Text style={styles.footerLink}>Create account</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
