import React, { useState, useRef, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { OtpModal } from '../../components/ui/OtpModal';
import { supabase } from '../../lib/supabase';
import { playErrorFeedback } from '../../lib/feedback';
import { isOnboardingComplete } from '../../lib/onboarding';
import { resendRegisterOtp, verifyRegisterOtp } from '../../lib/api';
import { claimDeviceSession } from '../../lib/deviceSession';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  // Flash message handed over from other screens (e.g. register → login).
  const { flash } = useLocalSearchParams<{ flash?: string }>();
  useEffect(() => {
    if (!flash) return;
    // Deferred so the effect body performs no synchronous state work.
    const timer = setTimeout(
      () => setToast({ visible: true, message: String(flash), type: 'success' }),
      0
    );
    return () => clearTimeout(timer);
  }, [flash]);

  const emailShakeAnim = useRef(new Animated.Value(0)).current;
  const passwordShakeAnim = useRef(new Animated.Value(0)).current;

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

  const handleEmailChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      triggerInputShake(emailShakeAnim);
      showToast('Spaces are not allowed in email addresses.');
      setEmail(text.replace(/\s/g, ''));
    } else {
      setEmail(text);
    }
  };

  const handlePasswordChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      triggerInputShake(passwordShakeAnim);
      showToast('Spaces are not allowed in passwords.');
      setPassword(text.replace(/\s/g, ''));
    } else {
      setPassword(text);
    }
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isFormValid = isEmailValid && isPasswordValid;

  const validate = () => {
    let valid = true;

    if (!email.trim()) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter your email address.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter a valid email address.');
      valid = false;
    }

    if (!password) {
      triggerInputShake(passwordShakeAnim);
      if (valid) showToast('Please enter your password.');
      valid = false;
    } else if (password.length < 6) {
      triggerInputShake(passwordShakeAnim);
      if (valid) showToast('Password must be at least 6 characters.');
      valid = false;
    }

    return valid;
  };

  /** Shared success path — the requested smart gate: verified? → onboarding check → dashboard. */
  const finishSignIn = async (user: any) => {
    const onboarded = await isOnboardingComplete(user);
    // Single-device session: claim THIS install as the holder (latest wins).
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await claimDeviceSession(data.session.access_token);
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
        triggerInputShake(emailShakeAnim);
        triggerInputShake(passwordShakeAnim);
        showToast('Incorrect email or password. Please try again.');
        return;
      }

      if (unconfirmed) {
        // Requested flow: unverified email → take the user straight into
        // verification instead of a dead-end toast.
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
    // Verified (or confirmation not required): onboarding gate decides the rest.
    await finishSignIn(data?.user);
  };

  /** Verification during sign-in: on success we re-run the blocked sign-in. */
  const handleVerifyLoginOtp = async (code: string): Promise<boolean | string> => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await verifyRegisterOtp(cleanEmail, code);
    if (res.error) return res.error; // shown inline by OtpModal (not a toast)

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
    if (res.error) throw new Error(res.error); // OtpModal shows this inline
  };

  const handleGoogleSignIn = async () => {
    showToast('Google OAuth requires native configuration. Coming soon.', 'info');
    // TODO: wire Supabase Google OAuth with expo-auth-session
    // const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleForgotPassword = () => {
    router.push('/(auth)/forgot-password');
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
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.brandTag}>FOCUSLOCK</Text>
            </View>

            <View style={styles.glassCard}>
              <View style={styles.headerBlock}>
                <Text style={styles.title}>Sign In</Text>
                <Text style={styles.subtitle}>
                  Access your synchronized lock profiles and daily app limits.
                </Text>
              </View>

              {/* Google Sign-In */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleGoogleSignIn}
                style={styles.googleButton}
              >
                <Image
                  source={require('../../../assets/google-logo.webp')}
                  style={styles.googleLogo}
                  contentFit="contain"
                />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with email</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Inputs */}
              <View style={styles.formFields}>
                <Animated.View style={{ transform: [{ translateX: emailShakeAnim }] }}>
                  <Input
                    variant="dark"
                    label="Email Address"
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

                <Animated.View style={{ transform: [{ translateX: passwordShakeAnim }] }}>
                  <Input
                    variant="dark"
                    label="Password"
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    value={password}
                    onChangeText={handlePasswordChange}
                    rightActionText="Forgot password?"
                    onRightActionPress={handleForgotPassword}
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
                          source={
                            showPassword
                              ? require('../../../assets/eye-off.svg')
                              : require('../../../assets/eye.svg')
                          }
                          style={styles.eyeIcon}
                          contentFit="contain"
                        />
                      </TouchableOpacity>
                    }
                  />
                </Animated.View>
              </View>

              {/* Primary Action */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSignIn}
                disabled={!isFormValid || isLoading}
                style={[styles.primaryButton, (!isFormValid || isLoading) && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Don't have an account?</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(auth)/register')}>
                  <Text style={styles.footerLink}>Create an account</Text>
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
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)', borderColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 1.5,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 20,
  },
  googleLogo: { width: 20, height: 20, marginRight: 10 },
  googleButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  dividerText: { color: '#71717a', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 12 },
  formFields: { gap: 16, marginBottom: 24 },
  inputIcon: { width: 18, height: 18 },
  eyeButton: { padding: 4, justifyContent: 'center', alignItems: 'center' },
  eyeIcon: { width: 20, height: 20, tintColor: '#a1a1aa' },
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
