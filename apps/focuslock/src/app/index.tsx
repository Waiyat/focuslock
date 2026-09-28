import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  Platform,
  StatusBar as RNStatusBar,
  Animated,
  Easing,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

const TRUST_PILLS = [
  'No impulsive overrides',
  'Local enforcement',
  'Zero usage tracking',
];

export default function HomeScreen() {
  const router = useRouter();

  // Animation drivers
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1.08)).current;

  const titleAnim = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(24)).current;

  const headlineAnim = useRef(new Animated.Value(0)).current;
  const headlineY = useRef(new Animated.Value(20)).current;

  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(16)).current;

  const pillsAnim = useRef(new Animated.Value(0)).current;
  const pillsY = useRef(new Animated.Value(14)).current;

  const ctaAnim = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(22)).current;

  // Press feedback animation
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Cinematic background reveal
    Animated.parallel([
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(bgScale, {
        toValue: 1,
        duration: 1400,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
    ]).start();

    // Staggered content entrance
    Animated.stagger(120, [
      // 1. Title
      Animated.parallel([
        Animated.timing(titleAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(titleY, {
          toValue: 0,
          duration: 600,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]),
      // 2. Headline
      Animated.parallel([
        Animated.timing(headlineAnim, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headlineY, {
          toValue: 0,
          duration: 650,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]),
      // 3. Subtitle
      Animated.parallel([
        Animated.timing(subtitleAnim, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(subtitleY, {
          toValue: 0,
          duration: 650,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]),
      // 4. Trust Pills
      Animated.parallel([
        Animated.timing(pillsAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pillsY, {
          toValue: 0,
          duration: 600,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]),
      // 5. Actions / Legal
      Animated.parallel([
        Animated.timing(ctaAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ctaY, {
          toValue: 0,
          duration: 700,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 5,
    }).start();
  };

  const handleTerms = () => {
    Linking.openURL('https://waiyatlabs.space/terms-of-service').catch(() => {});
  };

  const handlePrivacy = () => {
    Linking.openURL('https://waiyatlabs.space/privacy').catch(() => {});
  };

  return (
    <View style={styles.container}>
      <RNStatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Animated Background Image */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: bgOpacity,
            transform: [{ scale: bgScale }],
          },
        ]}
      >
        <Image
          source={require('../../assets/bg-img.webp')}
          contentFit="cover"
          transition={500}
          priority="high"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Subtle cinematic gradient vignette */}
      <View style={styles.overlay}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>

          {/* ── Top: Brand Name ── */}
          <Animated.View
            style={[
              styles.topSection,
              {
                opacity: titleAnim,
                transform: [{ translateY: titleY }],
              },
            ]}
          >
            <Text style={styles.brandTitle}>FocusLock</Text>
          </Animated.View>

          {/* ── Middle: Value Proposition ── */}
          <View style={styles.middleSection}>
            {/* Headline */}
            <Animated.View
              style={{
                opacity: headlineAnim,
                transform: [{ translateY: headlineY }],
              }}
            >
              <Text style={styles.headline}>
                Decide your screen time before distraction takes over.
              </Text>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View
              style={{
                opacity: subtitleAnim,
                transform: [{ translateY: subtitleY }],
              }}
            >
              <Text style={styles.subtitle}>
                Pre-commit your daily app allowances. Once the window closes, your limits lock in until the next configured reset.
              </Text>
            </Animated.View>

            {/* Trust Pills */}
            <Animated.View
              style={[
                styles.pillsContainer,
                {
                  opacity: pillsAnim,
                  transform: [{ translateY: pillsY }],
                },
              ]}
            >
              {TRUST_PILLS.map((pill) => (
                <View key={pill} style={styles.pillBadge}>
                  <Text style={styles.pillText}>{pill}</Text>
                </View>
              ))}
            </Animated.View>
          </View>

          {/* ── Bottom: Call to Actions & Legal ── */}
          <Animated.View
            style={[
              styles.bottomSection,
              {
                opacity: ctaAnim,
                transform: [{ translateY: ctaY }],
              },
            ]}
          >
            {/* Primary Action Button */}
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => router.push('/(auth)/register')}
              style={{ width: '100%' }}
            >
              <Animated.View
                style={[
                  styles.primaryButton,
                  {
                    transform: [{ scale: buttonScale }],
                  },
                ]}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </Animated.View>
            </Pressable>

            {/* Secondary: Sign In */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push('/(auth)/login')}
              style={styles.signInButton}
            >
              <Text style={styles.signInText}>
                Already have an account?{' '}
                <Text style={styles.signInHighlight}>Sign In</Text>
              </Text>
            </TouchableOpacity>

            {/* Legal */}
            <View style={styles.legalContainer}>
              <Text style={styles.legalMuted}>By continuing, you agree to our</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={handleTerms}>
                <Text style={styles.legalLink}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalMuted}>and</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={handlePrivacy}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.54)',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: Platform.OS === 'ios' ? 20 : 28,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 14 : 22,
  },
  brandTitle: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 44,
    letterSpacing: -1.4,
    lineHeight: 50,
  },
  middleSection: {
    gap: 16,
  },
  headline: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 27,
    lineHeight: 35,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    color: '#d4d4d8',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  pillBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  pillText: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  bottomSection: {
    gap: 14,
    alignItems: 'center',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#ffffff',
    paddingVertical: 17,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  signInButton: {
    paddingVertical: 4,
  },
  signInText: {
    color: '#d4d4d8',
    fontSize: 14,
  },
  signInHighlight: {
    color: '#ffffff',
    fontWeight: '600',
  },
  legalContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 2,
  },
  legalMuted: {
    color: '#71717a',
    fontSize: 11,
    lineHeight: 18,
  },
  legalLink: {
    color: '#a1a1aa',
    fontSize: 11,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
});
