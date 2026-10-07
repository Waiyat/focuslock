import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  InAppNotificationPayload,
  subscribeInAppNotifications,
} from '../../lib/notifications';

// ─── Accent colours per notification type ─────────────────────────────────────
const ACCENT = {
  locked: {
    border: 'rgba(239,68,68,0.52)',
    badge: 'rgba(239,68,68,0.16)',
    dot: '#ef4444',
    label: 'RESTRICTION',
    bar: '#ef4444',
  },
  warning: {
    border: 'rgba(245,158,11,0.52)',
    badge: 'rgba(245,158,11,0.16)',
    dot: '#f59e0b',
    label: 'LIMIT WARNING',
    bar: '#f59e0b',
  },
  info: {
    border: 'rgba(132,204,22,0.40)',
    badge: 'rgba(132,204,22,0.14)',
    dot: '#84cc16',
    label: 'ALERT',
    bar: '#84cc16',
  },
} as const;

const DISMISS_DURATION_MS = 3000;

export function InAppNotificationBanner() {
  const insets = useSafeAreaInsets();
  const [currentNotif, setCurrentNotif] = useState<InAppNotificationPayload | null>(null);

  // Animation values
  const translateY = useRef(new Animated.Value(-160)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.93)).current;
  const progress   = useRef(new Animated.Value(1)).current; // 1→0 drain

  const dismissTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnim  = useRef<Animated.CompositeAnimation | null>(null);
  const isVisibleRef  = useRef(false);

  // ── Dismiss ──────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    if (!isVisibleRef.current) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    progressAnim.current?.stop();

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -160,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.93,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isVisibleRef.current = false;
      setCurrentNotif(null);
      progress.setValue(1);
    });
  }, []);

  // ── Start progress drain then auto-dismiss ────────────────────────────────
  const startAutoTimer = useCallback((durationMs: number) => {
    progressAnim.current = Animated.timing(progress, {
      toValue: 0,
      duration: durationMs,
      useNativeDriver: false,
    });
    progressAnim.current.start();
    dismissTimer.current = setTimeout(dismiss, durationMs);
  }, [dismiss]);

  // ── Subscribe to incoming notifications ──────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeInAppNotifications((payload) => {
      // Cancel any existing banner
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      progressAnim.current?.stop();
      progress.setValue(1);

      isVisibleRef.current = true;
      setCurrentNotif(payload);
      translateY.setValue(-160);
      opacity.setValue(0);
      scale.setValue(0.92);

      // Spring entrance
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 72,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 72,
          friction: 10,
        }),
      ]).start();

      startAutoTimer(DISMISS_DURATION_MS);
    });

    return () => {
      unsubscribe();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      progressAnim.current?.stop();
    };
  }, [startAutoTimer]);

  // ── Swipe-up pan responder ────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
      onPanResponderGrant: () => {
        // Pause progress on touch
        progressAnim.current?.stop();
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      },
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) translateY.setValue(g.dy * 0.75);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -30 || g.vy < -0.6) {
          dismiss();
        } else {
          // Snap back, resume timer with remaining time
          const remaining = (progress as any)._value * DISMISS_DURATION_MS;
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 72,
            friction: 10,
          }).start(() => startAutoTimer(Math.max(remaining, 500)));
        }
      },
    })
  ).current;

  if (!currentNotif) return null;

  const type   = (currentNotif.type ?? 'info') as keyof typeof ACCENT;
  const accent = ACCENT[type] ?? ACCENT.info;

  const topOffset = Platform.OS === 'ios'
    ? Math.max(insets.top, 10)
    : insets.top + 8;

  // Progress bar: full width → 0
  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: topOffset,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* ── Card ─────────────────────────────────────────────────────── */}
      <View style={[styles.card, { borderColor: accent.border }]}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              source={require('../../../assets/logo.webp')}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.brandName}>FOCUSLOCK</Text>
            <View style={[styles.typeDot, { backgroundColor: accent.dot }]} />
            <View style={[styles.typePill, { backgroundColor: accent.badge }]}>
              <Text style={[styles.typePillText, { color: accent.dot }]}>
                {accent.label}
              </Text>
            </View>
          </View>
          <Text style={styles.timeLabel}>NOW</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{currentNotif.title}</Text>
          <Text style={styles.message} numberOfLines={2}>{currentNotif.body}</Text>
        </View>

        {/* Progress drain bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              { width: barWidth, backgroundColor: accent.bar },
            ]}
          />
        </View>

        {/* Swipe-up hint */}
        <View style={styles.handle} />
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 99999,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: 'rgba(9, 9, 11, 0.97)',
    borderWidth: 1,
    borderRadius: 20,
    paddingTop: 13,
    paddingHorizontal: 15,
    paddingBottom: 0,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.50,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  logo: {
    width: 19,
    height: 19,
    borderRadius: 5,
  },
  brandName: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  typeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  typePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 100,
  },
  typePillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  timeLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginLeft: 6,
  },

  // Body
  body: {
    gap: 3,
    marginBottom: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  message: {
    color: '#94a3b8',
    fontSize: 12.5,
    lineHeight: 17,
    letterSpacing: 0.05,
  },

  // Timer progress bar
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    opacity: 0.75,
  },

  // Swipe handle
  handle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'center',
    marginTop: 9,
    marginBottom: 10,
  },
});
