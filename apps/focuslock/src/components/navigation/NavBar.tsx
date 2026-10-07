import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { playSelectionFeedback } from '../../lib/feedback';
import { R, S } from '../../lib/theme';
import { useTheme } from '../../lib/ThemeContext';

interface NavBarProps {
  isVisible: boolean;
  username?: string;
  avatarUrl?: string | null;
  onPressProfile?: () => void;
}

export function NavBar({ isVisible, username, avatarUrl, onPressProfile }: NavBarProps) {
  const { colors, isDark } = useTheme();
  const [shouldRender, setShouldRender] = useState(isVisible);
  const animValue = useRef(new Animated.Value(isVisible ? 1 : 0)).current;

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      Animated.timing(animValue, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(animValue, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShouldRender(false);
      });
    }
  }, [isVisible]);

  if (!shouldRender) return null;

  const initial = username ? username.charAt(0).toUpperCase() : 'U';
  const translateY = animValue.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: animValue, transform: [{ translateY }] },
      ]}
    >
      {/* Left: Brand */}
      <View style={styles.leftBrand}>
        <View
          style={[
            styles.logoBadge,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.border,
            },
          ]}
        >
          <Image
            source={require('../../../assets/logo.webp')}
            style={styles.logoImage}
            contentFit="cover"
            transition={200}
          />
        </View>
        <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>FocusLock</Text>
      </View>

      {/* Right: Avatar */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          playSelectionFeedback();
          onPressProfile?.();
        }}
        style={[
          styles.avatarButton,
          {
            borderColor: colors.borderLight,
          },
        ]}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatarImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.xl,
    paddingTop: Platform.OS === 'android' ? 10 : 4,
    paddingBottom: S.md,
    backgroundColor: 'transparent',
    zIndex: 50,
  },
  leftBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: R.sm,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
