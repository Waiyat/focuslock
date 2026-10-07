import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { supabase } from '../lib/supabase';
import { isOnboardingComplete } from '../lib/onboarding';
import * as Haptics from 'expo-haptics';

// ─── Design tokens ────────────────────────────────────────────────────────────
const NEON        = '#76F756';
const NEON_GLOW   = 'rgba(118,247,86,0.50)';
const NEON_DIM    = 'rgba(118,247,86,0.14)';
const NEON_BORDER = 'rgba(118,247,86,0.30)';

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND_CHARS = 'FocusLock'.split(''); // ['F', 'o', 'c', 'u', 's', 'L', 'o', 'c', 'k']

const FEATURE_CARDS = [
  {
    id: 'no-overrides',
    icon: require('../../assets/feat-no-overrides.svg'),
    title: 'No impulsive overrides',
    subtitle: 'Stay focused, effortlessly.',
  },
  {
    id: 'local-enforce',
    icon: require('../../assets/feat-local-enforce.svg'),
    title: 'Local enforcement',
    subtitle: 'Works right on your device.',
  },
  {
    id: 'privacy',
    icon: require('../../assets/feat-privacy-tracking.svg'),
    title: 'Zero usage tracking',
    subtitle: 'Your privacy, always.',
  },
];

// ─── Haptic helpers ───────────────────────────────────────────────────────────

async function tickHaptic() {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* graceful no-op */
  }
}

async function confirmHaptic() {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* graceful no-op */
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();

  // Phase: 'checking-auth' → 'intro' → 'home'
  const [phase, setPhase] = useState<'checking-auth' | 'intro' | 'home'>('checking-auth');

  // Intro animation values
  const logoY        = useRef(new Animated.Value(-280)).current;
  const logoScale    = useRef(new Animated.Value(1)).current;
  const introOpacity = useRef(new Animated.Value(1)).current;

  // Individual opacity value for each letter in 'FocusLock'
  const letterOpacities = useRef(BRAND_CHARS.map(() => new Animated.Value(0))).current;

  // Homepage reveal values
  const homeOpacity     = useRef(new Animated.Value(0)).current;
  const headerOpacity   = useRef(new Animated.Value(0)).current;
  const headlineOpacity = useRef(new Animated.Value(0)).current;
  const headlineY       = useRef(new Animated.Value(24)).current;
  const cardsOpacity    = useRef(new Animated.Value(0)).current;
  const cardsY          = useRef(new Animated.Value(14)).current;
  const ctaOpacity      = useRef(new Animated.Value(0)).current;
  const ctaY            = useRef(new Animated.Value(20)).current;
  const buttonScale     = useRef(new Animated.Value(1)).current;

  // Cleanup tracking
  const isMounted = useRef(true);
  const timers    = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addTimer = useCallback((t: ReturnType<typeof setTimeout>) => {
    timers.current.push(t);
    return t;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  // ── Auth check — runs before any animation ──────────────────────────────────
  useEffect(() => {
    let active = true;

    const redirectIfAuthed = async (user: any) => {
      if (!active || !user) return;
      const onboarded = await isOnboardingComplete(user);
      if (active) router.replace(onboarded ? '/dashboard' : '/onboarding');
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        redirectIfAuthed(session.user);
      } else {
        if (isMounted.current) setPhase('intro');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) redirectIfAuthed(session.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // ── Home entrance animations ────────────────────────────────────────────────
  const runHomeEntrance = useCallback(() => {
    Animated.timing(homeOpacity, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    const delayed = (delay: number, anim: Animated.CompositeAnimation) =>
      addTimer(
        setTimeout(() => {
          if (isMounted.current) anim.start();
        }, delay)
      );

    delayed(
      60,
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );

    delayed(
      140,
      Animated.parallel([
        Animated.timing(headlineOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(headlineY,       { toValue: 0, duration: 600, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      ])
    );

    delayed(
      280,
      Animated.parallel([
        Animated.timing(cardsOpacity, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(cardsY,       { toValue: 0, duration: 550, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      ])
    );

    delayed(
      400,
      Animated.parallel([
        Animated.timing(ctaOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ctaY,       { toValue: 0, duration: 600, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      ])
    );
  }, [addTimer, homeOpacity, headerOpacity, headlineOpacity, headlineY, cardsOpacity, cardsY, ctaOpacity, ctaY]);

  // ── Simultaneous Drop + Per-Letter Fade Out Sequence ────────────────────────
  useEffect(() => {
    if (phase !== 'intro') return;

    // Reset values for intro
    introOpacity.setValue(1);
    logoY.setValue(-280);
    letterOpacities.forEach((opacity) => opacity.setValue(0));

    // 1. Logo drops with physics settle
    Animated.sequence([
      Animated.timing(logoY, {
        toValue: 8,
        duration: 1300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1.0),
        useNativeDriver: true,
      }),
      Animated.timing(logoY, {
        toValue: -3,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(logoY, {
        toValue: 0,
        duration: 160,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Typewriter: Starts typing AT THE EXACT SAME TIME as drop begins
    let charIdx = 0;
    const typeNextLetter = () => {
      if (!isMounted.current) return;
      Animated.timing(letterOpacities[charIdx], {
        toValue: 1,
        duration: 60,
        useNativeDriver: true,
      }).start();
      tickHaptic();
      charIdx++;

      if (charIdx === BRAND_CHARS.length) {
        // All letters are typed! Rest momentarily, then each letter fades out one by one
        addTimer(
          setTimeout(() => {
            if (!isMounted.current) return;
            startPerLetterFadeOut();
          }, 320)
        );
      } else {
        addTimer(setTimeout(typeNextLetter, 175)); // 175ms per letter
      }
    };

    // 3. Each letter fades out one by one. When the last letter fades out, comes the homescreen!
    const startPerLetterFadeOut = () => {
      let fadeIdx = 0;

      const fadeNextLetter = () => {
        if (!isMounted.current) return;
        const currentIdx = fadeIdx;
        fadeIdx++;
        const isLastLetter = fadeIdx === BRAND_CHARS.length;

        Animated.timing(letterOpacities[currentIdx], {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          if (isLastLetter) {
            // When the last letter fades out comes the main homescreen with heavy haptic!
            if (!isMounted.current) return;
            confirmHaptic();

            // Reveal homescreen immediately!
            runHomeEntrance();

            Animated.timing(introOpacity, {
              toValue: 0,
              duration: 320,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }).start(() => {
              if (isMounted.current) {
                setPhase('home');
              }
            });
          }
        });

        if (!isLastLetter) {
          tickHaptic();
          addTimer(setTimeout(fadeNextLetter, 100)); // 100ms stagger between each fading letter
        }
      };

      fadeNextLetter();
    };

    // Starts typing immediately as drop begins
    addTimer(setTimeout(typeNextLetter, 90));
  }, [phase, addTimer, logoY, introOpacity, homeOpacity, letterOpacities, runHomeEntrance]);

  // ── Press handlers ──────────────────────────────────────────────────────────
  const handlePressIn  = () =>
    Animated.spring(buttonScale, { toValue: 0.97, useNativeDriver: true, speed: 28, bounciness: 3 }).start();
  const handlePressOut = () =>
    Animated.spring(buttonScale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 5 }).start();

  const handleTerms   = () => router.push('/settings/terms');
  const handlePrivacy = () => router.push('/settings/privacy-policy');

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  if (phase === 'checking-auth') {
    return <View style={styles.checkingContainer} />;
  }

  return (
    <View style={styles.rootContainer}>
      <RNStatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Main Homescreen Layer ── */}
      <Animated.View
        style={[styles.homeRoot, { opacity: homeOpacity }]}
        pointerEvents={phase === 'home' ? 'auto' : 'none'}
      >
        {/* Background — glassy bokeh office photo with 3D phone graphic */}
        <Image
          source={require('../../assets/bg-home.jpg')}
          contentFit="cover"
          priority="high"
          style={styles.backgroundImage}
        />

        {/* Dark cinematic scrim so left content stays readable */}
        <View style={styles.darkScrim} />

        {/* Neon-green ambient glow — bottom center (matches screenshot) */}
        <View style={styles.ambientGlowBottom} />
        {/* Subtle top-left atmospheric haze */}
        <View style={styles.ambientGlowTopLeft} />

        <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>

          {/* ── Header Bar ── */}
          <Animated.View style={[styles.headerBar, { opacity: headerOpacity }]}>
            {/* Brand lockup: sphere logo + FocusLock wordmark + tagline */}
            <View style={styles.brandGroup}>
              <View style={styles.brandSphere}>
                <Image
                  source={require('../../assets/logo.webp')}
                  contentFit="cover"
                  style={styles.brandSphereCoverImage}
                />
              </View>
              <View style={styles.brandTextGroup}>
                <Text style={styles.brandWordmark}>
                  <Text style={styles.brandWordmarkWhite}>Focus</Text>
                  <Text style={styles.brandWordmarkGreen}>Lock</Text>
                </Text>
                <Text style={styles.brandTagline}>Focus  /  Block  /  Achieve</Text>
              </View>
            </View>

            {/* Frosted glass Sign In pill */}
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push('/(auth)/login')}
              style={styles.headerSignInButton}
            >
              <Text style={styles.headerSignInText}>Sign In</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ── Main Hero Content ── */}
          <View style={styles.mainContent}>

            {/* Headline + subtitle — constrained to 66% width so phone graphic shows */}
            <Animated.View
              style={[styles.headlineContainer, { opacity: headlineOpacity, transform: [{ translateY: headlineY }] }]}
            >
              <Text style={styles.kicker}>YOUR FOCUS. OUR PRIORITY.</Text>

              <View style={styles.headlineBlock}>
                <Text style={styles.headlineLine1}>Decide your</Text>
                <Text style={styles.headlineLine2}>limits before</Text>
                <Text style={styles.headlineLine3}>distraction</Text>
                <Text style={styles.headlineLine4}>does.</Text>
              </View>

              <Text style={styles.subtitle}>
                Pre-commit your daily app allowances. Once your window closes, on-device limits lock in strictly until tomorrow's reset.
              </Text>
            </Animated.View>

            {/* ── Frosted Glass Feature Cards ── */}
            <Animated.View
              style={[styles.cardsColumn, { opacity: cardsOpacity, transform: [{ translateY: cardsY }] }]}
            >
              {FEATURE_CARDS.map((card) => (
                <TouchableOpacity
                  key={card.id}
                  activeOpacity={0.78}
                  style={styles.featureCard}
                >
                  {/* Neon-green circular icon badge */}
                  <View style={styles.featureIconBadge}>
                    <Image
                      source={card.icon}
                      style={styles.featureIcon}
                      contentFit="contain"
                    />
                  </View>

                  <View style={styles.featureCardText}>
                    <Text style={styles.featureCardTitle}>{card.title}</Text>
                    <Text style={styles.featureCardSubtitle}>{card.subtitle}</Text>
                  </View>

                  <Text style={styles.featureChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          </View>

          {/* ── Bottom CTA Dock ── */}
          <Animated.View
            style={[styles.ctaSection, { opacity: ctaOpacity, transform: [{ translateY: ctaY }] }]}
          >
            {/* Neon-green Get Started pill */}
            <Pressable
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => router.push('/(auth)/register')}
              style={{ width: '100%' }}
            >
              <Animated.View style={[styles.primaryButton, { transform: [{ scale: buttonScale }] }]}>
                <Text style={styles.primaryButtonText}>Get Started  →</Text>
              </Animated.View>
            </Pressable>

            <TouchableOpacity
              activeOpacity={0.72}
              onPress={() => router.push('/(auth)/login')}
              style={styles.signInButton}
            >
              <Text style={styles.signInText}>
                Already have an account?{'  '}
                <Text style={styles.signInHighlight}>Sign In →</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.legalRow}>
              <Text style={styles.legalMuted}>By continuing you agree to our </Text>
              <TouchableOpacity activeOpacity={0.7} onPress={handleTerms}>
                <Text style={styles.legalLink}>Terms</Text>
              </TouchableOpacity>
              <Text style={styles.legalMuted}> and </Text>
              <TouchableOpacity activeOpacity={0.7} onPress={handlePrivacy}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

        </SafeAreaView>
      </Animated.View>

      {/* Intro Overlay Layer (fades out to reveal homescreen when last letter disappears) */}
      {phase === 'intro' && (
        <Animated.View
          style={[styles.introContainer, { opacity: introOpacity }]}
          pointerEvents="none"
        >
          {/* Dropping Logo: Perfectly rounded-full sphere with the logo graphic fully covering edge-to-edge */}
          <Animated.View
            style={[
              styles.introLogoWrapper,
              { transform: [{ translateY: logoY }, { scale: logoScale }] },
            ]}
          >
            <View style={styles.introLogoCircle}>
              <Image
                source={require('../../assets/logo.webp')}
                contentFit="cover"
                style={styles.introLogoCoverImage}
              />
            </View>
          </Animated.View>

          {/* Typewriter text: each letter animated individually with zero bullets */}
          <View style={styles.introLettersRow}>
            {BRAND_CHARS.map((char, index) => (
              <Animated.Text
                key={index}
                style={[
                  styles.introBrandChar,
                  { opacity: letterOpacities[index] },
                ]}
              >
                {char}
              </Animated.Text>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  checkingContainer: {
    flex: 1,
    backgroundColor: '#09090b',
  },

  // ── Intro ──────────────────────────────────────────────────────────────────
  introContainer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#09090b',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  introLogoWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  // Perfect circle/sphere container
  introLogoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52, // rounded-full sphere
    backgroundColor: '#0d0d12',
    overflow: 'hidden', // clips the zoomed logo perfectly inside
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#a8e63d',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 14,
  },
  // Scale ensures the logo graphic fully covers the circle/sphere with no border padding
  introLogoCoverImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    transform: [{ scale: 1.30 }],
  },
  // Individual letters row for typewriter + per-letter fade out
  introLettersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 4,
  },
  introBrandChar: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.0,
    lineHeight: 48,
  },

  // ── Home Root & Background ──────────────────────────────────────────────────
  homeRoot: { flex: 1, backgroundColor: '#07090f' },
  backgroundImage: { ...StyleSheet.absoluteFill },
  darkScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 8, 14, 0.15)',
  },
  // Bottom neon-green glow — matching screenshot
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -60,
    alignSelf: 'center',
    width: 380,
    height: 220,
    borderRadius: 190,
    backgroundColor: 'rgba(118,247,86,0.12)',
  },
  ambientGlowTopLeft: {
    position: 'absolute',
    top: -40,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(118,247,86,0.04)',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'ios' ? 10 : 18,
    paddingBottom: Platform.OS === 'ios' ? 6 : 12,
    justifyContent: 'space-between',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandSphere: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#0d0d12', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  brandSphereCoverImage: {
    width: 44, height: 44, borderRadius: 22,
    transform: [{ scale: 1.30 }],
  },
  brandTextGroup: { gap: 1 },
  brandWordmark: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandWordmarkWhite: { color: '#ffffff' },
  brandWordmarkGreen: { color: NEON },
  brandTagline: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  headerSignInButton: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  headerSignInText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // ── Main Content ────────────────────────────────────────────────────────────
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 14,
  },
  headlineContainer: { gap: 8 },
  kicker: {
    color: 'rgba(148,163,184,0.90)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Constrained to 56% width so 3D phone graphic remains fully visible on the right
  headlineBlock: {
    maxWidth: '56%',
    gap: 0,
  },
  headlineLine1: {
    color: '#ffffff',
    fontSize: 35, fontWeight: '800', lineHeight: 42, letterSpacing: -1.2,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  headlineLine2: {
    color: NEON,
    fontSize: 35, fontWeight: '800', lineHeight: 42, letterSpacing: -1.2,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  headlineLine3: {
    color: NEON,
    fontSize: 35, fontWeight: '800', lineHeight: 42, letterSpacing: -1.2,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  headlineLine4: {
    color: '#ffffff',
    fontSize: 35, fontWeight: '800', lineHeight: 42, letterSpacing: -1.2,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  subtitle: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 13.5, lineHeight: 20, letterSpacing: 0.1,
    maxWidth: '58%',
    textShadowColor: 'rgba(0,0,0,0.80)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },

  // ── Feature Cards (frosted glass) ──────────────────────────────────────────
  cardsColumn: { gap: 10 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.2,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  featureIconBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: NEON_DIM,
    borderColor: NEON_BORDER,
    borderWidth: 1.2,
    alignItems: 'center', justifyContent: 'center',
  },
  featureIcon: { width: 20, height: 20 },
  featureCardText: { flex: 1, gap: 2 },
  featureCardTitle: {
    color: '#f8fafc', fontSize: 14, fontWeight: '700', letterSpacing: -0.1,
  },
  featureCardSubtitle: {
    color: 'rgba(148,163,184,0.85)', fontSize: 12.5, fontWeight: '400', lineHeight: 18,
  },
  featureChevron: {
    color: 'rgba(148,163,184,0.7)', fontSize: 20, fontWeight: '300', lineHeight: 24,
  },

  // ── Bottom CTA Section ─────────────────────────────────────────────────────
  ctaSection: {
    gap: 10,
    alignItems: 'center',
    paddingBottom: 4,
  },
  // Vibrant neon-green pill — matching screenshot exactly
  primaryButton: {
    width: '100%',
    backgroundColor: NEON,
    paddingVertical: 18,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 12,
  },
  primaryButtonText: {
    color: '#09090b',
    fontSize: 16, fontWeight: '800', letterSpacing: 0.2,
  },
  signInButton: { paddingVertical: 4 },
  signInText: {
    color: 'rgba(148,163,184,0.90)',
    fontSize: 14, letterSpacing: 0.1,
  },
  signInHighlight: {
    color: NEON,
    fontWeight: '700',
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  legalMuted: {
    color: 'rgba(100,116,139,0.80)',
    fontSize: 11, lineHeight: 18,
  },
  legalLink: {
    color: 'rgba(203,213,225,0.80)',
    fontSize: 11, lineHeight: 18,
    textDecorationLine: 'underline',
  },
});
