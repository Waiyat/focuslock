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
import { Input } from '../../components/ui/Input';
import { Toast } from '../../components/ui/Toast';

export default function LoginScreen() {
  const router = useRouter();

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({
    visible: false,
    message: '',
    type: 'error',
  });

  // Independent input shake animation drivers
  const emailShakeAnim = useRef(new Animated.Value(0)).current;
  const passwordShakeAnim = useRef(new Animated.Value(0)).current;

  const triggerInputShake = (anim: Animated.Value) => {
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

  const validate = () => {
    let isValid = true;
    const isEmailMissing = !email.trim();
    const isEmailInvalid = !isEmailMissing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const isPasswordMissing = !password;
    const isPasswordTooShort = !isPasswordMissing && password.length < 6;

    if (isEmailMissing) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter your email address.');
      isValid = false;
    } else if (isEmailInvalid) {
      triggerInputShake(emailShakeAnim);
      showToast('Please enter a valid email address format.');
      isValid = false;
    }

    if (isPasswordMissing) {
      triggerInputShake(passwordShakeAnim);
      if (isValid) {
        showToast('Please enter your password.');
      }
      isValid = false;
    } else if (isPasswordTooShort) {
      triggerInputShake(passwordShakeAnim);
      if (isValid) {
        showToast('Password must be at least 6 characters.');
      }
      isValid = false;
    }

    return isValid;
  };

  const handleSignIn = async () => {
    if (!validate()) return;

    setIsLoading(true);
    // UI test flow before backend integration
    setTimeout(() => {
      setIsLoading(false);
      showToast(`Logged in successfully as ${email.trim()}`, 'success');
    }, 600);
  };

  const handleGoogleSignIn = () => {
    showToast('Connecting to Google OAuth...', 'info');
  };

  const handleForgotPassword = () => {
    showToast('Password recovery instructions sent if email exists.', 'info');
  };

  return (
    <View style={styles.screenContainer}>
      <RNStatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Modern sliding Toast Notification */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      {/* Subtle ambient gradient spheres for frosted depth */}
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
            {/* ── Top Bar: Back & Brand ── */}
            <View style={styles.topBar}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.back()}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>

              <Text style={styles.brandTag}>FOCUSLOCK</Text>
            </View>

            {/* ── Frosted Glass Form Card (Stable container) ── */}
            <View style={styles.glassCard}>

              {/* Title & Description */}
              <View style={styles.headerBlock}>
                <Text style={styles.title}>Sign In</Text>
                <Text style={styles.subtitle}>
                  Access your synchronized lock profiles and daily app limits.
                </Text>
              </View>

              {/* Official Google Sign-In Button */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleGoogleSignIn}
                style={styles.googleButton}
              >
                <Image
                  source={require('../../../assets/google-logo.png')}
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

              {/* Form Inputs (Individual field shake physics) */}
              <View style={styles.formFields}>
                {/* Email Input with independent shake */}
                <Animated.View
                  style={{ transform: [{ translateX: emailShakeAnim }] }}
                >
                  <Input
                    variant="light"
                    label="Email Address"
                    placeholder="name@company.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                    leftIcon={
                      <Image
                        source={require('../../../assets/mail.svg')}
                        style={styles.inputIcon}
                        contentFit="contain"
                      />
                    }
                  />
                </Animated.View>

                {/* Password Input with independent shake */}
                <Animated.View
                  style={{ transform: [{ translateX: passwordShakeAnim }] }}
                >
                  <Input
                    variant="light"
                    label="Password"
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
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

              {/* Primary Action Button */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSignIn}
                disabled={isLoading}
                style={[
                  styles.primaryButton,
                  isLoading && styles.primaryButtonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </Text>
              </TouchableOpacity>

              {/* Card Footer: Switch to Register */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Don't have an account?</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/(auth)/register')}
                >
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
  screenContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  ambientBlobTop: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(219, 234, 254, 0.7)',
    opacity: 0.8,
  },
  ambientBlobBottom: {
    position: 'absolute',
    bottom: -80,
    right: -50,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(243, 232, 255, 0.65)',
    opacity: 0.8,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  backButton: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  backButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  brandTag: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1.5,
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingVertical: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 28,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  headerBlock: {
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 21,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  googleLogo: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  googleButtonText: {
    color: '#1e293b',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
  },
  formFields: {
    gap: 16,
    marginBottom: 24,
  },
  inputIcon: {
    width: 18,
    height: 18,
  },
  eyeButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    width: 20,
    height: 20,
  },
  primaryButton: {
    backgroundColor: '#09090b',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#09090b',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    gap: 6,
  },
  footerText: {
    color: '#64748b',
    fontSize: 13,
  },
  footerLink: {
    color: '#09090b',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
