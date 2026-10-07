import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import { Input } from './Input';
import { playErrorFeedback } from '../../lib/feedback';

interface ResetPasswordModalProps {
  visible: boolean;
  email: string;
  onSubmit: (newPassword: string, confirmPassword: string) => Promise<boolean | void>;
  onClose: () => void;
}

export function ResetPasswordModal({
  visible,
  email,
  onSubmit,
  onClose,
}: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const newPassShakeAnim = useRef(new Animated.Value(0)).current;
  const confirmPassShakeAnim = useRef(new Animated.Value(0)).current;

  const isFormValid = newPassword.length >= 6 && confirmPassword === newPassword;

  const triggerShake = (anim: Animated.Value) => {
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

  const handleNewPasswordChange = (text: string) => {
    if (/\s/.test(text)) {
      triggerShake(newPassShakeAnim);
      return;
    }
    setNewPassword(text);
    if (errorMessage) setErrorMessage('');
  };

  const handleConfirmPasswordChange = (text: string) => {
    if (/\s/.test(text)) {
      triggerShake(confirmPassShakeAnim);
      return;
    }
    setConfirmPassword(text);
    if (errorMessage) setErrorMessage('');
  };

  const handleSubmit = async () => {
    setErrorMessage('');

    if (!newPassword || newPassword.length < 6) {
      triggerShake(newPassShakeAnim);
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      triggerShake(confirmPassShakeAnim);
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(newPassword, confirmPassword);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              Code verified! Choose a secure new password for:
            </Text>
            <Text style={styles.emailBadge}>{email}</Text>
          </View>

          {/* Form Fields */}
          <View style={styles.formFields}>
            {/* 1. New Password */}
            <Animated.View style={{ transform: [{ translateX: newPassShakeAnim }] }}>
              <Input
                variant="dark"
                label="New Password"
                placeholder="At least 6 characters"
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={newPassword}
                onChangeText={handleNewPasswordChange}
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
                    onPress={() => setShowNewPassword((p) => !p)}
                    style={styles.eyeBtn}
                  >
                    <Image
                      source={
                        showNewPassword
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

            {/* 2. Confirm New Password */}
            <Animated.View style={{ transform: [{ translateX: confirmPassShakeAnim }] }}>
              <Input
                variant="dark"
                label="Confirm New Password"
                placeholder="Repeat new password"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
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
                    onPress={() => setShowConfirmPassword((p) => !p)}
                    style={styles.eyeBtn}
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

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          {/* Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              style={[
                styles.primaryBtn,
                (!isFormValid || isSubmitting) && styles.primaryBtnDisabled,
                isFormValid && !isSubmitting && styles.primaryBtnReady,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color={isFormValid ? '#09090b' : '#ffffff'} size="small" />
              ) : (
                <Text style={[styles.primaryBtnText, isFormValid && styles.primaryBtnTextReady]}>
                  Update Password
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              disabled={isSubmitting}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(18, 18, 24, 0.96)',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.5,
        shadowRadius: 32,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  emailBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  formFields: {
    gap: 14,
    marginBottom: 16,
  },
  inputIcon: {
    width: 18,
    height: 18,
  },
  eyeBtn: {
    padding: 4,
  },
  eyeIcon: {
    width: 18,
    height: 18,
    tintColor: '#a1a1aa',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
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
      android: {
        elevation: 6,
      },
    }),
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#71717a',
    fontSize: 15,
    fontWeight: '700',
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
