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
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';
import { OtpModal } from '../../components/ui/OtpModal';
import { supabase } from '../../lib/supabase';
import {
  requestRegisterOtp,
  verifyRegisterOtp,
  resendRegisterOtp,
} from '../../lib/api';
import { claimDeviceSession, getDeviceName, getDevicePlatform } from '../../lib/deviceSession';
import {
  useGoogleAuthRequest,
  completeGoogleSignIn,
  isGoogleConfigured,
} from '../../lib/googleAuth';
import {
  useAuthStyles,
  shakeInput,
  BrandTopBar,
  GoogleAuthButton,
  OrDivider,
} from './_shared';
import { useTheme } from '../../lib/ThemeContext';

export default function RegisterScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const styles = useAuthStyles();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);

  // Per-field error messages drive the red input border.
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  const usernameShakeAnim = useRef(new Animated.Value(0)).current;
  const emailShakeAnim = useRef(new Animated.Value(0)).current;
  const passwordShakeAnim = useRef(new Animated.Value(0)).current;
  const confirmPasswordShakeAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'error') => {
    setToast({ visible: true, message, type });
  };

  const flagUsernameError = (message: string) => {
    setUsernameError(message);
    shakeInput(usernameShakeAnim);
    showToast(message);
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
  const flagConfirmError = (message: string) => {
    setConfirmPasswordError(message);
    shakeInput(confirmPasswordShakeAnim);
    showToast(message);
  };

  const isUsernameValid = /^[a-zA-Z0-9_.]{3,30}$/.test(username.trim());
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isConfirmValid = confirmPassword.length >= 6 && confirmPassword === password;
  const isFormValid = isUsernameValid && isEmailValid && isPasswordValid && isConfirmValid;

  const handleUsernameChange = (text: string) => {
    const disallowedRegex = /[^a-zA-Z0-9_.]/g;
    setUsername(text);
    if (usernameError) setUsernameError('');
    if (disallowedRegex.test(text)) {
      setUsername(text.replace(disallowedRegex, ''));
      flagUsernameError('Username can only contain letters, numbers, underscores, and dots.');
    }
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

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (confirmPasswordError) setConfirmPasswordError('');
    if (/\s/.test(text)) {
      setConfirmPassword(text.replace(/\s/g, ''));
      flagConfirmError('Spaces are not allowed in passwords.');
    }
  };

  const validate = () => {
    let valid = true;
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername) {
      flagUsernameError('Please enter a username.');
      valid = false;
    } else if (cleanUsername.length < 3) {
      flagUsernameError('Username must be at least 3 characters.');
      valid = false;
    } else if (!/^[a-zA-Z0-9_.]{3,30}$/.test(cleanUsername)) {
      flagUsernameError('Username can only contain letters, numbers, underscores, and dots.');
      valid = false;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      flagEmailError('Please enter your email address.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      flagEmailError('Please enter a valid email address.');
      valid = false;
    }

    if (!password) {
      flagPasswordError('Please enter a password.');
      valid = false;
    } else if (password.length < 6) {
      flagPasswordError('Password must be at least 6 characters.');
      valid = false;
    }

    if (!confirmPassword) {
      flagConfirmError('Please confirm your password.');
      valid = false;
    } else if (password !== confirmPassword) {
      flagConfirmError('Passwords do not match. Please re-check.');
      valid = false;
    }

    return valid;
  };

  // Sign-in completed (password or Google). The session claim must never
  // block the route transition: it runs in the background while the screen
  // swaps instantly. Register flows route to onboarding (new users complete
  // onboarding there); login's own handoff decides dashboard vs onboarding.
  const claimAndRoute = () => {
    try {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (data.session?.access_token) {
            claimDeviceSession(
              data.session.access_token,
              getDeviceName(),
              getDevicePlatform()
            ).catch(() => {});
          }
        })
        .catch(() => {});
    } catch {
      /* non-blocking */
    }
    router.replace('/onboarding');
  };

  const handleRegister = async () => {
    if (isLoading) return;
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
      const msg = res.error.toLowerCase();
      if (msg.includes('username')) {
        flagUsernameError(res.error);
      } else if (msg.includes('email')) {
        flagEmailError(res.error);
      } else {
        showToast(res.error);
      }
      return;
    }

    showToast(`Verification code has been sent to ${cleanEmail} verify and continue`, 'info');
    setShowOtpModal(true);
  };

  const handleVerifyOtp = async (code: string): Promise<boolean | string> => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await verifyRegisterOtp(cleanEmail, code);
    if (res.error) return res.error;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError) {
      setShowOtpModal(false);
      router.replace({
        pathname: '/(auth)/login',
        params: { flash: 'Your account is verified! Sign in with your password to continue.' },
      });
      return true;
    }

    setShowOtpModal(false);
    // Fire-and-forget: the route swaps now (verified toast rides along);
    // claim + navigation flush before it so nothing waits on them.
    showToast('Email verified — redirecting…', 'success');
    claimAndRoute();
    return true;
  };

  const handleResendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const res = await resendRegisterOtp(cleanEmail);
    if (res.error) throw new Error(res.error);
    showToast(`A new verification code was sent to ${cleanEmail}.`, 'success');
  };

  // ── Google OAuth (ID token) — sign-in AND sign-up in one flow ────────────
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
            claimDeviceSession(data.session.access_token, getDeviceName(), getDevicePlatform()).catch(
              () => {}
            );
          }
        } catch {
          /* non-blocking */
        }
        setGoogleLoading(false);
        router.replace(isNewUser ? '/onboarding' : '/dashboard');
      } catch (err: any) {
        setGoogleLoading(false);
        showToast(err?.message || 'Google sign-up failed. Please try again.', 'error');
      }
    })();
  }, [googleResponse, router]);

  const handleGoogleSignUp = async () => {
    if (!isGoogleConfigured()) {
      showToast(
        'Google sign-up is not configured yet. Add your Google client IDs to continue.',
        'info'
      );
      return;
    }
    setGoogleLoading(true);
    try {
      await googlePromptAsync();
    } catch {
      setGoogleLoading(false);
      showToast('Could not start Google sign-up.', 'error');
    }
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
        title="Verify Your Account"
        subtitle="Verification code has been sent to:"
        email={email.trim().toLowerCase()}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        onClose={() => setShowOtpModal(false)}
        initialCooldown={120}
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
                <Text style={styles.title}>Create account</Text>
                <Text style={styles.subtitle}>
                  Join FocusLock to enforce hardware-backed discipline and eliminate phone addiction.
                </Text>
              </View>

              <GoogleAuthButton
                onPress={handleGoogleSignUp}
                loading={googleLoading}
                disabled={isLoading}
                label="Sign up with Google"
              />

              <OrDivider text="or register with email" />

              <View style={styles.formFields}>
                <Animated.View style={{ transform: [{ translateX: usernameShakeAnim }] }}>
                  <Input
                    label="Username"
                    placeholder="e.g. alex_focus"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={username}
                    onChangeText={handleUsernameChange}
                    error={usernameError.trim() ? usernameError : undefined}
                    leftIcon={
                      <Image
                        source={require('../../../assets/mail.svg')}
                        style={styles.inputIcon}
                        contentFit="contain"
                      />
                    }
                  />
                </Animated.View>

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
                    placeholder="At least 6 characters"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
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

                <Animated.View style={{ transform: [{ translateX: confirmPasswordShakeAnim }] }}>
                  <Input
                    label="Confirm Password"
                    placeholder="Repeat your password"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    value={confirmPassword}
                    onChangeText={handleConfirmPasswordChange}
                    error={confirmPasswordError.trim() ? confirmPasswordError : undefined}
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
                          source={showConfirmPassword ? require('../../../assets/eye-off.svg') : require('../../../assets/eye.svg')}
                          style={styles.eyeIcon}
                          contentFit="contain"
                        />
                      </TouchableOpacity>
                    }
                  />
                </Animated.View>
              </View>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleRegister}
                disabled={!isFormValid || isLoading}
                style={[styles.primaryButton, (!isFormValid || isLoading) && styles.primaryButtonDisabled]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

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

