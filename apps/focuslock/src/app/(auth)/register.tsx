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
import { Input, Toast, OtpModal } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  requestRegisterOtp,
  verifyRegisterOtp,
  resendRegisterOtp,
} from '../../lib/api';
import { playErrorFeedback } from '../../lib/feedback';

export default function RegisterScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  // Separate shake animations for each individual input field
  const usernameShakeAnim = useRef(new Animated.Value(0)).current;
  const emailShakeAnim = useRef(new Animated.Value(0)).current;
  const passwordShakeAnim = useRef(new Animated.Value(0)).current;
  const confirmPasswordShakeAnim = useRef(new Animated.Value(0)).current;

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

  const isUsernameValid = /^[a-zA-Z0-9_.]{3,30}$/.test(username.trim());
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isConfirmValid = confirmPassword.length >= 6 && confirmPassword === password;
  const isFormValid = isUsernameValid && isEmailValid && isPasswordValid && isConfirmValid;

  const handleUsernameChange = (text: string) => {
    // Only letters, numbers, underscores, and dots are allowed
    const disallowedRegex = /[^a-zA-Z0-9_.]/g;
    if (disallowedRegex.test(text)) {
      playErrorFeedback();
      triggerInputShake(usernameShakeAnim);
      showToast('Username can only contain letters, numbers, underscores, and dots.', 'error');
      setUsername(text.replace(disallowedRegex, ''));
    } else {
      setUsername(text);
    }
  };

  const handleEmailChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      triggerInputShake(emailShakeAnim);
      showToast('Spaces are not allowed in email addresses.', 'error');
      setEmail(text.replace(/\s/g, ''));
    } else {
      setEmail(text);
    }
  };

  const handlePasswordChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      triggerInputShake(passwordShakeAnim);
      showToast('Spaces are not allowed in passwords.', 'error');
      setPassword(text.replace(/\s/g, ''));
    } else {
      setPassword(text);
    }
  };

  const handleConfirmPasswordChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      triggerInputShake(confirmPasswordShakeAnim);
      showToast('Spaces are not allowed in passwords.', 'error');
      setConfirmPassword(text.replace(/\s/g, ''));
    } else {
      setConfirmPassword(text);
    }
  };

  const validate = () => {
    // 1. Username validation
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      triggerInputShake(usernameShakeAnim);
      showToast('Please enter a username.');
      return false;
    }
    if (cleanUsername.length < 3) {
      triggerInputShake(usernameShakeAnim);
      showToast('Username must be at least 3 characters.');
      return false;
    }
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(cleanUsername)) {
      triggerInputShake(usernameShakeAnim);
      showToast('Username can only contain letters, numbers, underscores, and dots.');
      return false;
    }

    // 2. Email validation
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter your email address.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter a valid email address.');
      return false;
    }

    // 3. Password validation
    if (!password) {
      triggerInputShake(passwordShakeAnim);
      showToast('Please enter a password.');
      return false;
    }
    if (password.length < 6) {
      triggerInputShake(passwordShakeAnim);
      showToast('Password must be at least 6 characters.');
      return false;
    }

    // 4. Confirm Password validation
    if (!confirmPassword) {
      triggerInputShake(confirmPasswordShakeAnim);
      showToast('Please confirm your password.');
      return false;
    }
    if (password !== confirmPassword) {
      triggerInputShake(confirmPasswordShakeAnim);
      showToast('Passwords do not match. Please re-check.');
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    const res = await requestRegisterOtp({
      username: cleanUsername,
      email: cleanEmail,
      password,
      confirmPassword,
    });

    setIsLoading(false);

    if (res.error) {
      if (res.error.toLowerCase().includes('username')) {
        triggerInputShake(usernameShakeAnim);
      } else if (res.error.toLowerCase().includes('email')) {
        triggerInputShake(emailShakeAnim);
      }
      showToast(res.error);
      return;
    }

    // Toast message requested by user:
    // "verification code has been sent to [EMAIL_ADDRESS] verify and continue"
    showToast(`Verification code has been sent to ${cleanEmail} verify and continue`, 'info');
    setShowOtpModal(true);
  };

  const handleVerifyOtp = async (code: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await verifyRegisterOtp(cleanEmail, code);

    if (res.error) {
      showToast(res.error);
      return false;
    }

    // Account created in Supabase! Sign in immediately
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setShowOtpModal(false);
    showToast('Account created successfully!', 'success');

    if (!signInError) {
      // New accounts always go through onboarding to accept terms & grant permissions
      router.replace('/onboarding');
    } else {
      router.replace('/(auth)/login');
    }
  };

  const handleResendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await resendRegisterOtp(cleanEmail);

    if (res.error) {
      showToast(res.error);
      return false;
    }

    showToast(`A new verification code was sent to ${cleanEmail}.`, 'success');
  };

  const handleGoogleSignIn = async () => {
    showToast('Google OAuth requires native app scheme. Coming soon.', 'info');
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
        title="Verify Your Account"
        subtitle="Verification code has been sent to:"
        email={email.trim().toLowerCase()}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
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
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                  Join FocusLock to enforce hardware-backed discipline and eliminate phone addiction.
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
                <Text style={styles.dividerText}>or register with email</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Registration Form Fields */}
              <View style={styles.formFields}>
                {/* 1. Username */}
                <Animated.View style={{ transform: [{ translateX: usernameShakeAnim }] }}>
                  <Input
                    variant="dark"
                    label="Username"
                    placeholder="e.g. alex_focus"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={username}
                    onChangeText={handleUsernameChange}
                    leftIcon={
                      <Image
                        source={require('../../../assets/user.svg')}
                        style={styles.inputIcon}
                        contentFit="contain"
                      />
                    }
                  />
                </Animated.View>

                {/* 2. Email */}
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

                {/* 3. Password */}
                <Animated.View style={{ transform: [{ translateX: passwordShakeAnim }] }}>
                  <Input
                    variant="dark"
                    label="Password"
                    placeholder="At least 6 characters"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    value={password}
                    onChangeText={handlePasswordChange}
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

                {/* 4. Confirm Password */}
                <Animated.View style={{ transform: [{ translateX: confirmPasswordShakeAnim }] }}>
                  <Input
                    variant="dark"
                    label="Confirm Password"
                    placeholder="Repeat your password"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    value={confirmPassword}
                    onChangeText={handleConfirmPasswordChange}
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
                        onPress={() => setShowConfirmPassword((prev) => !prev)}
                        style={styles.eyeButton}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <Image
                          source={
                            showConfirmPassword
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

              {/* Primary Action Button */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleRegister}
                disabled={!isFormValid || isLoading}
                style={[styles.primaryButton, (!isFormValid || isLoading) && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'Sending Code...' : 'Create Account'}
                </Text>
              </TouchableOpacity>

              {/* Footer */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Already have an account?</Text>
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
  headerBlock: { marginBottom: 20 },
  title: { fontSize: 30, fontWeight: '800', color: '#ffffff', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, color: '#a1a1aa', marginTop: 6, lineHeight: 21 },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)', borderColor: 'rgba(255, 255, 255, 0.14)', borderWidth: 1.5,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 18,
  },
  googleLogo: { width: 20, height: 20, marginRight: 10 },
  googleButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)' },
  dividerText: { color: '#71717a', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 12 },
  formFields: { gap: 14, marginBottom: 22 },
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
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, gap: 6 },
  footerText: { color: '#a1a1aa', fontSize: 13 },
  footerLink: { color: '#76F756', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
