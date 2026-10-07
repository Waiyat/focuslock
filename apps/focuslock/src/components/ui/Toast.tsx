import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  View,
} from 'react-native';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'error' | 'info' | 'success';
  onDismiss: () => void;
  duration?: number;
}

const TOAST_CONFIG = {
  error: {
    bg: '#991b1b',
    border: '#b91c1c',
    indicator: '#fca5a5',
    icon: '✕',
  },
  success: {
    bg: '#14532d',
    border: '#16a34a',
    indicator: '#86efac',
    icon: '✓',
  },
  info: {
    bg: '#1e3a5f',
    border: '#2563eb',
    indicator: '#93c5fd',
    icon: 'ℹ',
  },
};

export function Toast({
  visible,
  message,
  type = 'error',
  onDismiss,
  duration = 3200,
}: ToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      if (timerRef.current) clearTimeout(timerRef.current);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
          speed: 16,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, duration);
    } else {
      handleDismiss();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, message]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const config = TOAST_CONFIG[type] ?? TOAST_CONFIG.info;

  return (
    <Animated.View
      style={[
        styles.toastWrapper,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleDismiss}
        style={[
          styles.toastContainer,
          {
            backgroundColor: config.bg,
            borderColor: config.border,
          },
        ]}
      >
        {/* Icon badge */}
        <View style={[styles.iconBadge, { backgroundColor: config.border }]}>
          <Text style={styles.iconText}>{config.icon}</Text>
        </View>
        <Text style={styles.toastText} numberOfLines={2}>
          {message}
        </Text>
        {/* Dismiss hint */}
        <Text style={[styles.dismissHint, { color: config.indicator }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 28,
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    width: '100%',
    maxWidth: 440,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  toastText: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  dismissHint: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.7,
    flexShrink: 0,
  },
});
