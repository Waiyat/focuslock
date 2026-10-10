import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar as RNStatusBar,
  Platform,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  AppState,
} from 'react-native';
import { R, S, getGlassCardShadow, ThemeColors } from '../lib/theme';
import { useTheme } from '../lib/ThemeContext';

function useDashboardStyles() {
  const { isDark, colors } = useTheme();
  return useMemo(() => createStyles(colors, isDark), [colors, isDark]);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { NavBar, BottomTabs, TabKey } from '../components/navigation';
import { Toast } from '../components/ui/Toast';
import { AppLimitSetupModal } from '../components/ui/AppLimitSetupModal';
import { supabase } from '../lib/supabase';
import { uploadAvatar } from '../lib/storage';
import { playSelectionFeedback, playLightFeedback, playErrorFeedback } from '../lib/feedback';
import {
  notifyAppLocked,
  notifyDailyReset,
  notifyLimitWarning,
  requestNotificationPermissions,
  registerPushToken,
} from '../lib/notifications';
import { AppIcon, resolveAppIcon, getCachedIcon } from '../lib/appIcons';
import { usageEngine } from '../lib/usage/usageEngine';
import { usageBridge, isUsageEngineAvailable } from '../lib/usage/usageBridge';
import { getSessionStatus, hasPendingClaim } from '../lib/deviceSession';
import type { SessionStatus } from '../lib/deviceSession';
import { getAppDisplayNames } from '../lib/appProvider';
import { DEFAULT_WARNING_THRESHOLD_MS } from '../lib/usage/types';
import type { UsageAccessStatus } from '../lib/usage/types';
import { UsageAccessBanner } from '../components/ui/UsageAccessBanner';

// App limit data model
/** This app's own package — excluded from "most used" analytics (noise). */
const SELF_PACKAGE = 'com.focuslock.app';

interface AppLimitItem {
  id: string;
  app_bundle_id: string;
  app_display_name: string;
  daily_limit_seconds: number;
  is_active: boolean;
  used_seconds?: number;
  category?: string;
  icon_emoji?: string;
  strictness?: string;
}

interface UserProfile {
  id: string;
  email: string;
  username: string;
  display_name?: string;
  avatar_url?: string | null;
}

interface ResetWindowConfig {
  reset_time: string;
  timezone: string;
  window_minutes: number;
}

// -----------------------------------------------------------------------------
// Timezone-aware reset helpers
// -----------------------------------------------------------------------------

/** Resolves a safe IANA timezone, falling back to the device timezone. */
function resolveTimezone(tz?: string | null): string {
  if (!tz) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

/** Wall-clock parts of `date` as observed in `timeZone`. */
function zonedParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Epoch ms of the next daily reset boundary (HH:MM in `timeZone`) at or after `nowMs`.
 * Wall-clock arithmetic is used so DST shifts shift the boundary with local time.
 */
function nextResetMs(nowMs: number, resetTime: string, timeZone: string): number {
  const [resetHour, resetMinute] = (resetTime || '08:00:00').split(':').map(Number);
  const p = zonedParts(new Date(nowMs), timeZone);
  const nowSec = p.hour * 3600 + p.minute * 60 + p.second;
  const targetSec = ((resetHour || 0) % 24) * 3600 + ((resetMinute || 0) % 60) * 60;
  let deltaSec = targetSec - nowSec;
  if (deltaSec <= 0) deltaSec += 86400;
  return nowMs + deltaSec * 1000;
}

/** Epoch ms of the most recent daily reset boundary at or before `nowMs`. */
function lastResetMs(nowMs: number, resetTime: string, timeZone: string): number {
  return nextResetMs(nowMs, resetTime, timeZone) - 86400 * 1000;
}

/** Formats an HH:MM:SS db time as a 12-hour clock, e.g. `8:00 AM`. */
function formatClock(resetTime?: string | null): string {
  const [rawH, rawM] = (resetTime || '08:00:00').split(':').map(Number);
  const h = ((rawH || 0) % 24 + 24) % 24;
  const m = ((rawM || 0) % 60 + 60) % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m < 10 ? `0${m}` : m} ${period}`;
}

/** Short timezone label for display, e.g. `GMT+5` / `EDT`. */
function timezoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(
      new Date()
    );
    return parts.find((p) => p.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

/** Formats a raw second count as `Xh Ym Zs`. */
function formatHMS(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h}h ${m < 10 ? '0' : ''}${m}m ${s < 10 ? '0' : ''}${s}s`;
}

// -----------------------------------------------------------------------------
// Animated Helper Components  (next-gen)
// -----------------------------------------------------------------------------

/** Staggered fade + spring-slide entrance for each tab's content */
function AnimatedTabContent({ children }: { children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 18,
        stiffness: 160,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
}

/** Glowing pulsing status dot with ripple ring */
function PulsingDot() {
  const styles = useDashboardStyles();
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring1Op = useRef(new Animated.Value(0.6)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring2Op = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse1 = Animated.loop(
      Animated.parallel([
        Animated.timing(ring1, { toValue: 2.8, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ring1Op, { toValue: 0, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ])
    );
    const pulse2 = Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.parallel([
          Animated.timing(ring2, { toValue: 2.8, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ring2Op, { toValue: 0, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    pulse1.start();
    pulse2.start();
    return () => { pulse1.stop(); pulse2.stop(); };
  }, []);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View style={[styles.statusRing, { transform: [{ scale: ring1 }], opacity: ring1Op }]} />
      <Animated.View style={[styles.statusRing, { transform: [{ scale: ring2 }], opacity: ring2Op }]} />
      <View style={styles.statusDot} />
    </View>
  );
}

/** Shimmer skeleton bar for loading states */
function SkeletonBar({ width, height = 14, borderRadius = 7, style }: {
  width: number | string; height?: number; borderRadius?: number; style?: any;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: '#c7c7cc', opacity }, style]}
    />
  );
}

/** Compact duration for analytics stats: "2h 05m", "45m", "12s". */
function formatCompact(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Animated progress bar with spring overshoot */
function AnimatedProgressBar({ progress }: { progress: number }) {
  const styles = useDashboardStyles();
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(widthAnim, {
      toValue: Math.max(0, Math.min(1, progress)),
      damping: 20,
      stiffness: 120,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const bgColor = widthAnim.interpolate({
    inputRange: [0, 0.6, 0.85, 1],
    outputRange: ['#0ea5e9', '#0ea5e9', '#f59e0b', '#ef4444'],
  });

  const width = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.progressBarTrack}>
      <Animated.View style={[styles.progressBarFill, { width, backgroundColor: bgColor }]} />
    </View>
  );
}

/** Floating ambient orb that drifts slowly — purely decorative */
function FloatingOrb({ size, color, startX, startY, driftX, driftY, duration }: {
  size: number; color: string; startX: number; startY: number;
  driftX: number; driftY: number; duration: number;
}) {
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(startY)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(x, { toValue: startX + driftX, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(y, { toValue: startY + driftY, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(x, { toValue: startX, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(y, { toValue: startY, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.18,
        transform: [{ translateX: x }, { translateY: y }],
      }}
    />
  );
}

/** Staggered entrance wrapper — each child slides+fades in with a delay */
function StaggerItem({ children, index, totalDelay = 60 }: {
  children: React.ReactNode; index: number; totalDelay?: number;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(22)).current;
  useEffect(() => {
    const delay = index * totalDelay;
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 350, easing: Easing.out(Easing.exp), useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, damping: 16, stiffness: 180, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
  }, [index]);
  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      {children}
    </Animated.View>
  );
}

function getAppMonogram(app: AppLimitItem): string {
  return app.app_display_name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'AP';
}

/**
 * Renders the real app icon using high-res local assets and smart bundle/name matching
 */
function AppIconImage({
  app,
  size = 40,
  isLocked = false,
}: {
  app: AppLimitItem;
  size?: number;
  isLocked?: boolean;
}) {
  return (
    <AppIcon
      bundleId={app.app_bundle_id}
      appName={app.app_display_name}
      size={size}
      isLocked={isLocked}
      fallbackBadge={app.icon_emoji}
    />
  );
}

interface AnimatedAppCardProps {
  app: AppLimitItem;
  index: number;
  formatSeconds: (sec: number) => string;
  resetLabel: string;
  onPress?: () => void;
}

function AnimatedAppCard({
  app,
  index,
  formatSeconds,
  resetLabel,
  onPress,
}: AnimatedAppCardProps) {
  const styles = useDashboardStyles();
  const [isExpanded, setIsExpanded] = useState(false);
  const animFade = useRef(new Animated.Value(0)).current;
  const animSlide = useRef(new Animated.Value(14)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.spring(animSlide, {
          toValue: 0,
          damping: 14,
          stiffness: 190,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    }, Math.min(index * 55, 320));

    return () => clearTimeout(timeout);
  }, [index]);

  const used = app.used_seconds || 0;
  const remaining = Math.max(0, app.daily_limit_seconds - used);
  const isLocked = remaining <= 0;
  const isWarning = !isLocked && remaining <= DEFAULT_WARNING_THRESHOLD_MS / 1000;

  return (
    <Animated.View
      style={{
        opacity: animFade,
        transform: [{ translateY: animSlide }, { scale: pressScale }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPressIn={() => {
          Animated.spring(pressScale, {
            toValue: 0.98,
            useNativeDriver: true,
            friction: 6,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 4,
          }).start();
        }}
        onPress={() => {
          playSelectionFeedback();
          setIsExpanded((prev) => !prev);
          onPress?.();
        }}
        style={[
          styles.appCard,
          isLocked && styles.appCardLockedState,
          isWarning && styles.appCardWarningState,
        ]}
      >
        {/* Glass depth: deep wash for locked state + top-edge sheen */}
        {isLocked && <View pointerEvents="none" style={styles.lockedWash} />}
        <View pointerEvents="none" style={styles.glassSheen} />
        <View style={styles.appCardTopRow}>
          <View style={styles.appCardLeft}>
            <AppIconImage app={app} size={40} isLocked={isLocked} />
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <Text style={[styles.appName, isLocked && styles.appCardTextLocked]} numberOfLines={1} ellipsizeMode="tail">{app.app_display_name}</Text>
              <Text style={[styles.appMeta, isLocked && styles.appMetaLocked]} numberOfLines={1} ellipsizeMode="tail">
                Limit: {formatSeconds(app.daily_limit_seconds)} • Used:{' '}
                {formatSeconds(used)}
              </Text>
            </View>
          </View>

          <View style={styles.appCardRight}>
            <View
              style={[
                styles.badgePill,
                isLocked && styles.badgeLocked,
                isWarning && styles.badgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isLocked && styles.badgeTextLocked,
                  isWarning && styles.badgeTextWarning,
                ]}
                numberOfLines={1}
              >
                {isLocked
                  ? 'LOCKED'
                  : isWarning
                  ? 'WARNING'
                  : `${formatSeconds(remaining)} left`}
              </Text>
            </View>
          </View>
        </View>

        {/* Refined progress line — state-tinted track and fill */}
        <View
          style={[
            styles.cardProgressTrack,
            isWarning && styles.cardProgressTrackWarning,
            isLocked && styles.cardProgressTrackLocked,
          ]}
        >
          <View
            style={[
              styles.cardProgressFill,
              { width: `${Math.min(100, (used / app.daily_limit_seconds) * 100)}%` },
              isLocked && styles.cardProgressFillLocked,
              isWarning && styles.cardProgressFillWarning,
            ]}
          />
        </View>

        {(isLocked || isWarning) && (
          <Text
            style={[
              styles.cardStatusNote,
              isWarning && styles.cardStatusNoteWarning,
              isLocked && styles.cardStatusNoteLocked,
            ]}
          >
            {isLocked
              ? `Locked — resets ${resetLabel}`
              : `Warning: ${formatSeconds(remaining)} left — resets ${resetLabel}`}
          </Text>
        )}

        {/* Details drawer revealed on tap — real allowance data only */}
        {isExpanded && (
          <View style={[styles.appCardDrawer, isLocked && styles.drawerOnDark]}>
            <View style={[styles.drawerDivider, isLocked && styles.drawerDividerLocked]} />
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Remaining today</Text>
              <Text style={[styles.drawerValue, isLocked && styles.drawerValueOnDark]}>{formatSeconds(remaining)}</Text>
            </View>
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Daily allowance</Text>
              <Text style={[styles.drawerValue, isLocked && styles.drawerValueOnDark]}>{formatSeconds(app.daily_limit_seconds)}</Text>
            </View>
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Next reset</Text>
              <Text style={[styles.drawerValue, isLocked && styles.drawerValueOnDark]}>{resetLabel}</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

interface AnimatedLimitConfigCardProps {
  app: AppLimitItem;
  index: number;
  formatSeconds: (sec: number) => string;
  resetLabel: string;
  configWindowOpen: boolean;
  windowOpenLabel: string;
  onDeleteLimit?: (appId: string, appName: string) => void;
}

function AnimatedLimitConfigCard({
  app,
  index,
  formatSeconds,
  resetLabel,
  configWindowOpen,
  windowOpenLabel,
  onDeleteLimit,
}: AnimatedLimitConfigCardProps) {
  const styles = useDashboardStyles();
  const [isExpanded, setIsExpanded] = useState(false);
  const animFade = useRef(new Animated.Value(0)).current;
  const animSlide = useRef(new Animated.Value(14)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(animFade, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.spring(animSlide, {
          toValue: 0,
          damping: 14,
          stiffness: 190,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    }, Math.min(index * 55, 320));

    return () => clearTimeout(timeout);
  }, [index]);

  const used = app.used_seconds || 0;
  const remaining = Math.max(0, app.daily_limit_seconds - used);
  const isLocked = remaining <= 0;

  return (
    <Animated.View
      style={{
        opacity: animFade,
        transform: [{ translateY: animSlide }, { scale: pressScale }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPressIn={() => {
          Animated.spring(pressScale, {
            toValue: 0.98,
            useNativeDriver: true,
            friction: 6,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 4,
          }).start();
        }}
        onPress={() => {
          playSelectionFeedback();
          setIsExpanded((prev) => !prev);
        }}
        style={[
          styles.limitConfigCard,
          isLocked && styles.limitConfigCardLocked,
        ]}
      >
        {/* Glass depth: deep wash for locked state + top-edge sheen */}
        {isLocked && <View pointerEvents="none" style={styles.lockedWash} />}
        <View pointerEvents="none" style={styles.glassSheen} />
        <View style={styles.limitCardRow}>
          <AppIconImage app={app} size={40} isLocked={isLocked} />
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap', minWidth: 0, flexShrink: 1 }}>
              <Text style={[styles.appName, isLocked && styles.appCardTextLocked, { flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{app.app_display_name}</Text>
              {app.category ? (
                <View style={styles.categoryBadgeTiny}>
                  <Text style={styles.categoryBadgeTinyText}>{app.category}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.appBundleText, isLocked && styles.appBundleTextLocked]} numberOfLines={1} ellipsizeMode="tail">{app.app_bundle_id}</Text>
          </View>
          <View
            style={[
              styles.limitPill,
              isLocked && styles.limitPillLocked,
            ]}
          >
            <Text
              style={[
                styles.limitPillText,
                isLocked && styles.limitPillTextLocked,
              ]}
              numberOfLines={1}
            >
              {isLocked ? 'Locked' : `${formatSeconds(app.daily_limit_seconds)}/day`}
            </Text>
          </View>
        </View>

        {/* Details drawer — real allowance data + the one real management action */}
        {isExpanded && (
          <View style={[styles.appCardDrawer, isLocked && styles.drawerOnDark]}>
            <View style={[styles.drawerDivider, isLocked && styles.drawerDividerLocked]} />
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Used today</Text>
              <Text style={[styles.drawerValue, isLocked && styles.drawerValueOnDark]}>{formatSeconds(used)}</Text>
            </View>
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Daily allowance</Text>
              <Text style={[styles.drawerValue, isLocked && styles.drawerValueOnDark]}>{formatSeconds(app.daily_limit_seconds)}</Text>
            </View>
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Next reset</Text>
              <Text style={[styles.drawerValue, isLocked && styles.drawerValueOnDark]}>{resetLabel}</Text>
            </View>
            <View style={styles.drawerRow}>
              <Text style={[styles.drawerLabel, isLocked && styles.drawerLabelOnDark]}>Restriction</Text>
              {configWindowOpen ? (
                <View style={styles.drawerActions}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={(e) => {
                      e.stopPropagation();
                      playLightFeedback();
                      onDeleteLimit?.(app.id, app.app_display_name);
                    }}
                    style={[styles.drawerBtn, styles.drawerBtnDelete]}
                  >
                    <Text style={[styles.drawerBtnText, styles.drawerBtnTextDelete]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.drawerValueLocked}>Until {windowOpenLabel}</Text>
              )}
            </View>
          </View>
        )}

        <View style={[styles.limitCardFooter, isLocked && styles.limitCardFooterLocked]}>
          <Text style={[styles.lockNotice, isLocked && styles.lockNoticeLocked]}>
            {isLocked
              ? `Locked • resets at ${resetLabel}`
              : configWindowOpen
              ? `Window open • configure until ${resetLabel}`
              : `Editing opens at ${windowOpenLabel}`}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { isDark, colors, themeMode, setThemeMode, systemScheme } = useTheme();
  const styles = useDashboardStyles();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  // Real user data state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [limits, setLimits] = useState<AppLimitItem[]>([]);
  const [resetWindow, setResetWindow] = useState<ResetWindowConfig>({
    reset_time: '08:00:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    window_minutes: 20,
  });

  // Configuration phase (§20 state machine): ACTIVE (locked) vs RESET_WINDOW (editable)
  const [phase, setPhase] = useState<'ACTIVE' | 'RESET_WINDOW'>('ACTIVE');
  const [secondsToReset, setSecondsToReset] = useState(0);
  // Whether a reset_windows row exists in the DB (fresh accounts may have none)
  const [hasSavedResetWindow, setHasSavedResetWindow] = useState(false);
  const [hasFetchedWindow, setHasFetchedWindow] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdownText, setCountdownText] = useState('');
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type?: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'info' });

  // Add / Configure App Limit Wizard modal state
  const [showAddModal, setShowAddModal] = useState(false);

  // Permission/enforcement status surfaced as the discreet Home indicator.
  const [permStatus, setPermStatus] = useState<UsageAccessStatus | null>(null);
  // Bumped whenever new usage arrives so dependent views can reload.
  const [usageDataVersion, setUsageDataVersion] = useState(0);

  const handleAppLimitSuccess = (savedLimit: any) => {
    setLimits((prev) => {
      const filtered = prev.filter((l) => l.app_bundle_id !== savedLimit.app_bundle_id);
      // Preserve real usage when re-configuring an existing limit during the
      // window — only new limits start at zero.
      return [...filtered, { ...savedLimit, used_seconds: savedLimit.used_seconds ?? 0 }];
    });
  };

  // Avatar edit modal
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const showToast = (message: string, type: 'error' | 'info' | 'success' = 'info') => {
    setToast({ visible: true, message, type });
  };

  const handleAvatarUrlChange = (text: string) => {
    if (/\s/.test(text)) {
      playErrorFeedback();
      return;
    }
    setNewAvatarUrl(text);
  };

  // -----------------------------------------------------------------------
  // 1. DATA FETCHING (Supabase Real Data)
  // -----------------------------------------------------------------------

  const fetchUserData = useCallback(async () => {
    try {
      // Session is guaranteed to exist when this is called (auth guard above)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const user = sessionData.session.user;

      // 1. Fetch Profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
      } else {
        setProfile({
          id: user.id,
          email: user.email || '',
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
          display_name: user.user_metadata?.full_name || 'User',
          avatar_url: user.user_metadata?.avatar_url || null,
        });
      }

      // 2. Fetch Reset Window first — needed for timezone + daily-reset boundary math
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data: windowData } = await supabase
        .from('reset_windows')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (windowData) {
        setResetWindow(windowData);
        setHasSavedResetWindow(true);

        // The device is the source of truth for the user's timezone. Heal legacy rows
        // that still carry the 'UTC' database default so countdowns, greetings and
        // reset boundaries all agree on the same wall clock.
        if (resolveTimezone(windowData.timezone) !== deviceTz) {
          setResetWindow((prev) => ({ ...prev, timezone: deviceTz }));
          supabase
            .from('reset_windows')
            .upsert({ user_id: user.id, timezone: deviceTz }, { onConflict: 'user_id' })
            .then(({ error }: { error: any }) => {
              if (error) console.warn('[Timezone sync]', error.message);
            });
        }
      }

      // 3. Fetch App Limits
      const { data: limitsData } = await supabase
        .from('app_limits')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      let mappedLimits = (limitsData ?? []).map((l: any) => ({
        ...l,
        used_seconds: l.used_seconds || 0,
      }));

      // Catch-up daily reset: zero out usage recorded before the latest reset
      // boundary (covers time passed while the app was closed or offline).
      if (windowData && mappedLimits.length > 0) {
        const boundary = lastResetMs(Date.now(), windowData.reset_time || '08:00:00', deviceTz);
        const staleIds = mappedLimits
          .filter(
            (l: any) =>
              (l.used_seconds || 0) > 0 &&
              l.updated_at &&
              new Date(l.updated_at).getTime() < boundary
          )
          .map((l: any) => l.id);

        if (staleIds.length > 0) {
          mappedLimits = mappedLimits.map((l: any) =>
            staleIds.includes(l.id) ? { ...l, used_seconds: 0 } : l
          );
          // Note: app_limits has no used_seconds column (real usage lives in the
          // native engine + usage_snapshots) — local zero only, no DB write.
        }
      }

      setLimits(mappedLimits);
    } catch (err: any) {
      console.warn('[Dashboard Data Fetch Error]:', err);
    } finally {
      setHasFetchedWindow(true);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  // -----------------------------------------------------------------------
  // 1. AUTH GUARD — wait for Supabase to hydrate from storage
  // -----------------------------------------------------------------------
  useEffect(() => {
    let isSubscribed = true;

    // Direct check first in case storage is already loaded
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isSubscribed) return;
      if (session) {
        fetchUserData();
        // Register push token once we confirm a valid session
        registerPushToken(session.user.id).catch(() => {});
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isSubscribed) return;
        if (event === 'INITIAL_SESSION') {
          if (session) {
            fetchUserData();
            registerPushToken(session.user.id).catch(() => {});
          } else {
            // Confirm with getSession before assuming logged out
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
              fetchUserData();
              registerPushToken(data.session.user.id).catch(() => {});
            } else {
              router.replace('/(auth)/login');
            }
          }
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            fetchUserData();
            registerPushToken(session.user.id).catch(() => {});
          }
        } else if (event === 'SIGNED_OUT') {
          router.replace('/(auth)/login');
        }
      }
    );

    return () => {
      isSubscribed = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, router]);

  // -----------------------------------------------------------------------
  // 2. DAILY RESET ENGINE + TIMEZONE-AWARE COUNTDOWN
  // -----------------------------------------------------------------------

  const nextResetRef = useRef<number | null>(null);

  /** Runs the daily reset: zeroes local usage and notifies the user. */
  const performDailyReset = useCallback(() => {
    const resetLabel = formatClock(resetWindow.reset_time);

    // Local zero only — app_limits has no used_seconds column, and the native
    // engine already rolls its own usage at the local-day boundary.
    setLimits((prev) => prev.map((l) => (l.used_seconds ? { ...l, used_seconds: 0 } : l)));

    notifyDailyReset(resetLabel);
  }, [resetWindow.reset_time]);

  useEffect(() => {
    const timeZone = resolveTimezone(resetWindow.timezone);
    const resetTime = resetWindow.reset_time || '08:00:00';
    const windowMs = Math.max(1, resetWindow.window_minutes || 20) * 60 * 1000;

    const updateCountdown = () => {
      const nowMs = Date.now();
      const targetMs = nextResetMs(nowMs, resetTime, timeZone);

      // When the previous target is behind us, the boundary just passed → real reset.
      const prevTarget = nextResetRef.current;
      if (prevTarget !== null && nowMs >= prevTarget) {
        performDailyReset();
      }
      nextResetRef.current = targetMs;

      const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;

      setSecondsToReset(diffSec);
      setPhase(diffSec * 1000 <= windowMs ? 'RESET_WINDOW' : 'ACTIVE');
      setCountdownText(
        `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [resetWindow.reset_time, resetWindow.timezone, resetWindow.window_minutes, performDailyReset]);

  // Request notification permissions when dashboard mounts
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // -----------------------------------------------------------------------
  // REAL USAGE ENGINE (Android): native monitoring + real usage display.
  // app_limits rows are mirrored into the native engine; today's usage comes
  // from Android UsageStatsManager and stays LOCAL (never uploaded).
  // -----------------------------------------------------------------------
  const limitsRef = useRef<AppLimitItem[]>([]);
  useEffect(() => {
    limitsRef.current = limits;
  }, [limits]);

  const refreshRealUsage = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    const current = limitsRef.current;
    if (current.length === 0) return;
    try {
      const usageMap = await usageEngine.getTodayUsageMap(
        current.map((l) => l.app_bundle_id)
      );
      setLimits((prev) => {
        let changed = false;
        const next = prev.map((l) => {
          const ms = usageMap[l.app_bundle_id];
          if (typeof ms !== 'number') return l;
          const seconds = Math.round(ms / 1000);
          if (seconds === l.used_seconds) return l;
          changed = true;
          return { ...l, used_seconds: seconds };
        });
        return changed ? next : prev; // same ref → no re-render → no effect loop
      });
    } catch (err) {
      console.warn('[FocusLock][Usage] Usage refresh failed:', err);
    }
  }, []);

  // -------------------------------------------------------------------------
  // ANALYTICS (real data only): range-scoped aggregates straight from the
  // native reconstruction path. App display names resolved from the real
  // installed-app snapshot (never hardcoded sample data).
  // -------------------------------------------------------------------------
  const [analyticsRange, setAnalyticsRange] = useState<'today' | '7' | '30'>('7');
  const [analyticsData, setAnalyticsData] = useState<{
    totalMs: number;
    prevTotalMs: number;
    daily: { dayStartMs: number; dayEndMs: number; usageMs: number }[];
    perApp: { packageName: string; usageMs: number; label: string }[];
    hourly: number[];
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(false);

  // ── TODAY'S PULSE (Home): live metrics derived from the same real engine
  // reads as the Analytics tab — never mocked, hidden when unavailable. ──
  const pulse = useMemo(() => {
    const data = analyticsData;
    if (!data || data.totalMs <= 0) return null;
    const screenTimeMin = data.totalMs / 60000;
    const prevMin = data.prevTotalMs > 0 ? data.prevTotalMs / 60000 : 0;
    const deltaPct = prevMin > 0 ? ((screenTimeMin - prevMin) / prevMin) * 100 : null;
    const top = data.perApp.length > 0 ? data.perApp[0] : null;
    const maxHourMs = Math.max(...data.hourly, 0);
    const peakHour = maxHourMs > 0 ? data.hourly.indexOf(maxHourMs) : -1;
    const switches = data.hourly.reduce((acc, ms) => acc + (ms > 0 ? 1 : 0), 0);
    return { screenTimeMin, deltaPct, top, peakHour, switches };
  }, [analyticsData]);
  // Theme-aware chart series (recomputed per theme → both modes styled).
  const analyticsChartColors = [
    colors.chart1,
    colors.chart2,
    colors.chart3,
    colors.chart4,
    colors.chart5,
    colors.chart6,
  ];

  const loadAnalytics = useCallback(async () => {
    if (!isUsageEngineAvailable() || !usageBridge.hasAnalyticsSupport()) return;
    setAnalyticsLoading(true);
    setAnalyticsError(false);
    try {
      const now = Date.now();
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const dayStart = midnight.getTime();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const days = analyticsRange === 'today' ? 1 : analyticsRange === '7' ? 7 : 30;
      const start = analyticsRange === 'today' ? dayStart : dayStart - (days - 1) * DAY_MS;
      const prevStart = start - days * DAY_MS;

      const [totalMs, prevTotalMs, daily, perAppRaw, hourly] = await Promise.all([
        usageBridge.getTotalUsageForRange(start, now + 1),
        // Previous equal-length period — only for day-based ranges.
        days > 1 ? usageBridge.getTotalUsageForRange(prevStart, start) : Promise.resolve(0),
        usageBridge.getDailyUsageHistory(days),
        usageBridge.getPerAppUsageForRange(start, now + 1, 12),
        usageBridge.getHourlyUsageForRange(start, now + 1),
      ]);

      // FocusLock measures every foreground moment — listing itself as "most
      // used" would be noise, not insight.
      const rows = perAppRaw
        .filter((row) => row.packageName !== SELF_PACKAGE)
        .slice(0, 8);

      // Real display labels via PackageManager (covers system apps the
      // selectable-apps list omits); restricted-app name is the fallback,
      // package id last — never fabricated.
      let labelMap = new Map<string, string>();
      try {
        labelMap = await getAppDisplayNames(rows.map((r) => r.packageName));
      } catch {
        /* labels unavailable — restricted names / package ids used below */
      }
      const restrictedNames = new Map<string, string>(
        limitsRef.current.map((l) => [l.app_bundle_id, l.app_display_name])
      );

      const perApp = rows.map((row) => ({
        ...row,
        label:
          labelMap.get(row.packageName) ??
          restrictedNames.get(row.packageName) ??
          row.packageName,
      }));

      setAnalyticsData({ totalMs, prevTotalMs, daily, perApp, hourly });
    } catch (err) {
      console.warn('[FocusLock][Usage] Analytics load failed:', err);
      setAnalyticsData(null);
      setAnalyticsError(true);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsRange]);

  // Reload when the tab opens, the range changes, or fresh usage arrives.
  useEffect(() => {
    if (activeTab === 'analytics') loadAnalytics();
  }, [activeTab, loadAnalytics, usageDataVersion]);

  // Mirror app_limits into the native engine, then pull real usage.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    usageEngine.configure(limits).then(() => refreshRealUsage());
  }, [limits, refreshRealUsage]);

  // Native engine events → notifications + live usage refresh.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const unsubscribe = usageEngine.subscribe((event) => {
      if (event.type === 'onUsageUpdated') {
        refreshRealUsage();
      } else if (event.type === 'onLimitWarning') {
        const { appName, remainingMs } = event.payload;
        notifyLimitWarning({
          appName: appName || 'An app',
          remainingMinutes: Math.max(1, Math.round((remainingMs ?? 0) / 60000)),
        });
      } else if (event.type === 'onLimitReached') {
        const { appName, dailyLimitMs, resetAt } = event.payload;
        notifyAppLocked({
          appName: appName || 'An app',
          limitFormatted: formatHMS(Math.round((dailyLimitMs ?? 0) / 1000)),
          resetTime: resetAt
            ? new Date(resetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : undefined,
        });
        refreshRealUsage();
        setUsageDataVersion((v) => v + 1);
      }
    });
    return unsubscribe;
  }, [refreshRealUsage]);

  // Pulse reuses the analytics fetch when Home opens. Hiding while stale would
  // leave the first paint with no numbers; the banner covers the CTA case.
  // (Event-driven: tab switches + foreground bumps already call loadAnalytics
  // via the Analytics/pre-existing usage effects — no direct setState here.)
  useEffect(() => {
    if (activeTab !== 'home') return;
    const t = setTimeout(() => {
      void loadAnalytics();
    }, 0);
    return () => clearTimeout(t);
  }, [activeTab, loadAnalytics]);

  // Re-sync all dashboard data whenever the app returns to the foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchUserData();
        refreshRealUsage();
        // Bump so the Analytics tab (if open) reloads with fresh numbers.
        setUsageDataVersion((v) => v + 1);
        // Lock triggers recorded while we were backgrounded → surface now.
        usageEngine
          .consumeLockTrigger()
          .then((trigger) => {
            if (trigger) {
              showToast(`${trigger.appName} is locked — daily limit reached.`, 'error');
            }
          })
          .catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [fetchUserData, refreshRealUsage]);

  // -----------------------------------------------------------------------
  // SINGLE-DEVICE SESSIONS: precise tri-state sign-out.
  // Sign out ONLY on 'superseded' (this install HAD a row and was retired).
  // 'unregistered' (row missing) self-heals via re-claim — never signs out.
  // Offline / backend-down results keep the session; status re-checks run on
  // mount + foreground (≤1/min) plus a 60s poll so the second login wins
  // promptly on both devices.
  // -----------------------------------------------------------------------
  const lastSessionCheckRef = useRef(0);
  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const handleStatus = async (status: SessionStatus, deviceName: string | null, anotherDeviceActive: boolean) => {
      if (cancelled) return;
      if (status === 'superseded') {
        await supabase.auth.signOut();
        showToast(
          deviceName
            ? `Signed out — your account is now in use on ${deviceName}.`
            : 'Signed out — your account is now in use on another device.',
          'info'
        );
        router.replace('/(auth)/login');
        return;
      }
      if (status === 'unregistered') {
        // Self-heal: our claim never landed. Re-claim when nothing else is
        // active (safe), or when a login claim is pending (latest wins);
        // otherwise another install legitimately holds the session.
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token || cancelled) return;
          const pending = await hasPendingClaim();
          if (!anotherDeviceActive || pending) {
            const { claimDeviceSession, getDeviceName, getDevicePlatform } = await import(
              '../lib/deviceSession'
            );
            await claimDeviceSession(token, getDeviceName(), getDevicePlatform());
          }
        } catch {
          /* network failure → keep the session; retried on next check */
        }
      }
    };
    const checkHoldsSession = async () => {
      const now = Date.now();
      if (now - lastSessionCheckRef.current < 60_000) return;
      lastSessionCheckRef.current = now;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || cancelled) return;
        const result = await getSessionStatus(token);
        await handleStatus(result.status, result.deviceName, result.anotherDeviceActive);
      } catch {
        /* network failure → keep the session; retried on next check */
      }
    };
    checkHoldsSession();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkHoldsSession();
    });
    sessionPollRef.current = setInterval(checkHoldsSession, 60_000);
    return () => {
      cancelled = true;
      subscription.remove();
      if (sessionPollRef.current) clearInterval(sessionPollRef.current);
    };
  }, [router, showToast]);

  // -----------------------------------------------------------------------
  // REALTIME SYNCHRONIZATION: App Limits, Reset Windows & Profile
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!profile?.id) return;

    // Refetch whenever the main channel re-subscribes — covers dropped
    // connections so data is never silently stale.
    let hasSubscribedOnce = false;

    // Single consolidated channel for all app_limit changes (INSERT/UPDATE/DELETE),
    // including live used_seconds updates from other devices or the backend.
    const limitsChannel = supabase
      .channel(`realtime-limits-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_limits',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const item = payload.new as AppLimitItem;
            if (item.is_active) {
              setLimits((prev) => {
                const exists = prev.some(
                  (l) => l.id === item.id || l.app_bundle_id === item.app_bundle_id
                );
                if (exists) {
                  return prev.map((l) =>
                    l.app_bundle_id === item.app_bundle_id
                      ? {
                          ...l,
                          ...item,
                          used_seconds:
                            typeof item.used_seconds === 'number'
                              ? item.used_seconds
                              : l.used_seconds || 0,
                        }
                      : l
                  );
                }
                return [...prev, { ...item, used_seconds: item.used_seconds || 0 }];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const item = payload.new as AppLimitItem;
            setLimits((prev) => {
              if (!item.is_active) {
                return prev.filter(
                  (l) => l.id !== item.id && l.app_bundle_id !== item.app_bundle_id
                );
              }
              return prev.map((l) =>
                l.id === item.id || l.app_bundle_id === item.app_bundle_id
                  ? {
                      ...l,
                      ...item,
                      used_seconds:
                        typeof item.used_seconds === 'number'
                          ? item.used_seconds
                          : l.used_seconds || 0,
                    }
                  : l
              );
            });
          } else if (payload.eventType === 'DELETE') {
            const oldItem = payload.old as { id?: string; app_bundle_id?: string };
            setLimits((prev) =>
              prev.filter(
                (l) =>
                  !(oldItem?.id && l.id === oldItem.id) &&
                  !(oldItem?.app_bundle_id && l.app_bundle_id === oldItem.app_bundle_id)
              )
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedOnce) fetchUserData();
          hasSubscribedOnce = true;
        }
      });

    const windowChannel = supabase
      .channel(`realtime-reset-window-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reset_windows',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setResetWindow({
              reset_time: '08:00:00',
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              window_minutes: 20,
            });
            return;
          }
          const next = payload.new as ResetWindowConfig;
          if (next && (next.reset_time || next.timezone)) {
            setResetWindow(next);
          }
        }
      )
      .subscribe();

    // Live profile updates (avatar, display name, username)
    const profileChannel = supabase
      .channel(`realtime-profile-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const updated = payload.new as UserProfile;
          setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(limitsChannel);
      supabase.removeChannel(windowChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [profile?.id, fetchUserData]);

  // Dynamic calculation of timeline based on user's real reset window
  const timelineSchedule = useMemo(() => {
    const [h, m] = (resetWindow.reset_time || '08:00:00').split(':').map(Number);
    const windowM = resetWindow.window_minutes || 20;

    let preH = h;
    let preM = m - windowM;
    if (preM < 0) {
      preM += 60;
      preH = (preH - 1 + 24) % 24;
    }

    let postH = h;
    let postM = m + 1;
    if (postM >= 60) {
      postM -= 60;
      postH = (postH + 1) % 24;
    }

    const format12 = (hour: number, min: number) => {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayH = hour % 12 === 0 ? 12 : hour % 12;
      const padM = min < 10 ? `0${min}` : `${min}`;
      return `${displayH}:${padM} ${period}`;
    };

    return {
      windowOpen: format12(preH, preM),
      resetTime: format12(h, m),
      lockedTime: format12(postH, postM),
    };
  }, [resetWindow]);

  const handleDeleteLimit = (appId: string, appName: string) => {
    playLightFeedback();
    Alert.alert(
      'Remove Restriction',
      `Are you sure you want to remove the daily limit for ${appName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('app_limits')
                .delete()
                .eq('id', appId);

              if (error) {
                showToast(error.message, 'error');
                return;
              }

              setLimits((prev) => prev.filter((l) => l.id !== appId));
              showToast(`${appName} restriction removed.`, 'info');
            } catch {
              showToast('Failed to remove limit.', 'error');
            }
          },
        },
      ]
    );
  };

  const handlePickAndUploadAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('Photo library access is required to select a picture.', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      setIsSavingAvatar(true);
      const asset = result.assets[0];

      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) {
        showToast('Please sign in to update your avatar.', 'error');
        return;
      }

      const rawExt = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileExt = ['png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
      const mime = asset.mimeType || (fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : fileExt === 'gif' ? 'image/gif' : 'image/jpeg');

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const typedBlob = new Blob([blob], { type: mime });

      const { url: finalAvatarUrl, error: uploadError } = await uploadAvatar(user.id, typedBlob, fileExt, mime);
      if (uploadError || !finalAvatarUrl) {
        console.error('[Avatar Upload Error]:', uploadError);
        showToast(uploadError?.message || 'Could not upload picture.', 'error');
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: finalAvatarUrl } : prev));
      setShowAvatarModal(false);
      showToast('Profile photo updated!', 'success');
    } catch (err: any) {
      console.warn('[Avatar Upload Error]:', err);
      showToast('Could not select picture.', 'error');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleUpdateAvatar = async () => {
    if (!newAvatarUrl.trim()) {
      showToast('Please enter an image URL.', 'error');
      return;
    }

    setIsSavingAvatar(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: newAvatarUrl.trim() })
        .eq('id', user.id);

      if (error) {
        showToast(error.message, 'error');
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar_url: newAvatarUrl.trim() } : prev));
      setShowAvatarModal(false);
      setNewAvatarUrl('');
      showToast('Profile avatar updated.', 'success');
    } catch {
      showToast('Failed to update avatar.', 'error');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    showToast('Signed out of FocusLock.', 'info');
    router.replace('/');
  };

  // Helper formatting seconds
  const formatSeconds = (sec: number) => {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim();
    }
    return `${mins}m`;
  };

  // Total daily usage across all apps (Daily Allowance timer)
  const totalLimitSec = limits.reduce((acc, l) => acc + l.daily_limit_seconds, 0);
  const totalUsedSec = limits.reduce((acc, l) => acc + (l.used_seconds || 0), 0);
  const totalProgress = totalLimitSec > 0 ? Math.min(1, totalUsedSec / totalLimitSec) : 0;

  // Display helpers — single source of truth for time/timezone formatting
  const activeTimezone = resolveTimezone(resetWindow.timezone);
  const resetLabel = formatClock(resetWindow.reset_time);
  const zonedHour = zonedParts(new Date(), activeTimezone).hour;

  // Configuration-window helpers (§20 / §3.4)
  const windowMinutes = resetWindow.window_minutes || 20;
  const windowOpenLabel = useMemo(() => {
    const [h, m] = (resetWindow.reset_time || '08:00:00').split(':').map(Number);
    const totalMin = (((h || 0) % 24) * 60 + ((m || 0) % 60) - windowMinutes + 1440) % 1440;
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return formatClock(`${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}:00`);
  }, [resetWindow.reset_time, windowMinutes]);
  const secondsUntilWindow = Math.max(0, secondsToReset - windowMinutes * 60);
  // Editing allowed during the pre-reset window, or one-time setup when no schedule exists yet
  const canEditSchedule =
    phase === 'RESET_WINDOW' || (hasFetchedWindow && !hasSavedResetWindow);

  // -----------------------------------------------------------------------
  // SCHEDULE EDITOR — draft state for the general daily reset
  // -----------------------------------------------------------------------
  const [draftHour, setDraftHour] = useState(8);
  const [draftMinuteIndex, setDraftMinuteIndex] = useState(0); // 0..11 → 0,5,…,55
  const [draftWindowMinutes, setDraftWindowMinutes] = useState(20);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Sync the editor draft with the authoritative reset window (incl. realtime
  // updates). Guarded render-phase adjustment — avoids a cascading effect render.
  const scheduleSyncKey = `${resetWindow.reset_time}|${resetWindow.window_minutes}`;
  const [prevScheduleSyncKey, setPrevScheduleSyncKey] = useState<string | null>(null);
  if (prevScheduleSyncKey !== scheduleSyncKey) {
    setPrevScheduleSyncKey(scheduleSyncKey);
    const [h, m] = (resetWindow.reset_time || '08:00:00').split(':').map(Number);
    const hour24 = (((h || 0) % 24) + 24) % 24;
    const minute = (((m || 0) % 60) + 60) % 60;
    setDraftHour(hour24);
    setDraftMinuteIndex(Math.round(minute / 5) % 12);
    setDraftWindowMinutes(resetWindow.window_minutes || 20);
  }

  const draftMinute = draftMinuteIndex * 5;
  const displayHour = draftHour % 12 === 0 ? 12 : draftHour % 12;
  const isPM = draftHour >= 12;
  const draftPreview = formatClock(
    `${draftHour < 10 ? `0${draftHour}` : draftHour}:${draftMinute < 10 ? `0${draftMinute}` : draftMinute}:00`
  );
  const isScheduleDirty =
    draftHour !== parseInt((resetWindow.reset_time || '08:00:00').slice(0, 2), 10) % 24 ||
    draftMinute !== parseInt((resetWindow.reset_time || '08:00:00').slice(3, 5), 10) ||
    draftWindowMinutes !== (resetWindow.window_minutes || 20);

  const saveSchedule = async () => {
    if (!canEditSchedule || !isScheduleDirty || isSavingSchedule) return;
    setIsSavingSchedule(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showToast('Session expired. Please sign in again.', 'error');
        return;
      }

      const hh = draftHour < 10 ? `0${draftHour}` : `${draftHour}`;
      const mm = draftMinute < 10 ? `0${draftMinute}` : `${draftMinute}`;
      const resetTime = `${hh}:${mm}:00`;

      const { error } = await supabase.from('reset_windows').upsert(
        {
          user_id: sessionData.session.user.id,
          reset_time: resetTime,
          timezone: activeTimezone,
          window_minutes: draftWindowMinutes,
          is_active: true,
        },
        { onConflict: 'user_id' }
      );

      if (error) {
        showToast(error.message, 'error');
        return;
      }

      // Optimistic update — the realtime channel confirms on every device
      setResetWindow({
        reset_time: resetTime,
        timezone: activeTimezone,
        window_minutes: draftWindowMinutes,
      });
      setHasSavedResetWindow(true);
      showToast('Daily reset schedule updated.', 'success');
    } catch {
      showToast('Failed to save schedule. Please try again.', 'error');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  return (
    <View style={styles.screenContainer}>
      <RNStatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.bg} translucent={false} />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Top NavBar: Fixed and ONLY visible when bottom tab is 'home' */}
        <NavBar
          isVisible={activeTab === 'home'}
          username={profile?.username}
          avatarUrl={profile?.avatar_url}
          onPressProfile={() => router.push('/settings')}
        />

        {/* Main Content Area */}
        <ScrollView
          style={styles.mainScrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                fetchUserData();
                setUsageDataVersion((v) => v + 1);
              }}
              tintColor={colors.accent}
            />
          }
        >
          {/* ------------------------------------------------------------- */}
          {/* TAB 1: HOME (Command Center)                                  */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'home' && (
            <AnimatedTabContent key="home">
              <View style={styles.tabContent}>

                {/* Enforcement status — visible only while action is needed */}
                <UsageAccessBanner hideWhenReady onStatusChange={setPermStatus} />

                {/* Greeting */}
                <StaggerItem index={0} totalDelay={70}>
                  <View style={styles.greetingRow}>
                    <View style={styles.greetingBlock}>
                    <Text style={styles.greetingEyebrow}>
                      {zonedHour < 12 ? 'Good morning' : zonedHour < 17 ? 'Good afternoon' : 'Good evening'}
                      {profile?.display_name || profile?.username ? `, ${profile.display_name || profile.username}` : ''} 👋
                    </Text>
                    </View>

                    {/* Discreet enforcement indicator (real permission state) */}
                    {permStatus?.available && (
                      <View
                        style={[
                          styles.statusPill,
                          permStatus.canEnforce ? styles.statusPillOk : styles.statusPillWarn,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            permStatus.canEnforce ? styles.statusDotOk : styles.statusDotWarn,
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusPillText,
                            permStatus.canEnforce
                              ? styles.statusPillTextOk
                              : styles.statusPillTextWarn,
                          ]}
                        >
                          {permStatus.canEnforce ? 'Enforced' : 'Setup needed'}
                        </Text>
                      </View>
                    )}
                  </View>
                </StaggerItem>

                {/* Hero card — Daily Allowance countdown (original timer) */}
                <StaggerItem index={1} totalDelay={70}>
                  <View style={styles.heroCard}>
                    <View style={styles.heroHeader}>
                      <Text style={styles.heroHeaderTitle}>Daily Allowance</Text>
                      <View
                        style={[
                          styles.phasePill,
                          phase === 'RESET_WINDOW' && styles.phasePillWindow,
                        ]}
                      >
                        <View
                          style={[
                            styles.phaseDot,
                            phase === 'RESET_WINDOW' && styles.phaseDotWindow,
                          ]}
                        />
                        <Text
                          style={[
                            styles.phasePillText,
                            phase === 'RESET_WINDOW' && styles.phasePillTextWindow,
                          ]}
                        >
                          {phase === 'RESET_WINDOW' ? 'WINDOW OPEN' : 'ACTIVE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.timerDisplay}>{countdownText || 'Calculating...'}</Text>
                    <Text style={styles.timerSub}>
                      {phase === 'RESET_WINDOW'
                        ? `Reset window open until ${resetLabel}`
                        : `Next reset at ${resetLabel} · ${timezoneLabel(activeTimezone)}`}
                    </Text>

                    {/* Animated Progress bar */}
                    <View style={styles.progressContainer}>
                      <View style={styles.progressLabelRow}>
                        <Text style={styles.progressLabel}>
                          Consumed: {formatSeconds(totalUsedSec)}
                        </Text>
                        <Text style={styles.progressLimit}>
                          Total Allowance: {formatSeconds(totalLimitSec)}
                        </Text>
                      </View>
                      <AnimatedProgressBar progress={totalProgress} />
                    </View>
                  </View>
                </StaggerItem>

                {/* Configuration-window banner (§3.4) */}
                {phase === 'RESET_WINDOW' && (
                  <View style={styles.windowBanner}>
                    <Text style={styles.windowBannerTitle}>⚡ Configuration window open</Text>
                    <Text style={styles.windowBannerSub}>
                      Set the next day of limits now — editing locks again at {resetLabel}.
                    </Text>
                  </View>
                )}

                {/* ── TODAY'S PULSE: real live metrics (hidden when unavailable) ── */}
                {pulse && (
                  <StaggerItem index={2} totalDelay={70}>
                    <View style={styles.screenTimeCard}>
                      <Text style={styles.screenTimeLabel}>TODAY&apos;S PULSE · LIVE</Text>
                      <Text style={styles.screenTimeValue}>
                        {pulse.screenTimeMin < 60
                          ? `${Math.round(pulse.screenTimeMin)}m`
                          : `${Math.floor(pulse.screenTimeMin / 60)}h ${Math.round(pulse.screenTimeMin % 60)}m`}
                      </Text>
                      {pulse.deltaPct !== null ? (
                        <Text
                          style={[
                            styles.screenTimeCompare,
                            pulse.deltaPct <= 0
                              ? styles.screenTimeCompareGood
                              : styles.screenTimeCompareMuted,
                          ]}
                        >
                          {pulse.deltaPct <= 0 ? '↓' : '↑'} {Math.abs(Math.round(pulse.deltaPct))}% vs
                          yesterday
                        </Text>
                      ) : (
                        <Text style={styles.screenTimeCompareMuted}>Screen time today</Text>
                      )}
                      <View style={styles.metricsRow}>
                        <View style={styles.metricsCard}>
                          <Text style={styles.metricsCardValue} numberOfLines={1}>
                            {pulse.top ? pulse.top.label : '—'}
                          </Text>
                          <Text style={styles.metricsCardLabel}>Top app</Text>
                        </View>
                        <View style={styles.metricsCard}>
                          <Text style={styles.metricsCardValue}>
                            {pulse.peakHour >= 0 ? `${pulse.peakHour}:00` : '—'}
                          </Text>
                          <Text style={styles.metricsCardLabel}>Peak hour</Text>
                        </View>
                        <View style={styles.metricsCard}>
                          <Text style={styles.metricsCardValue}>{pulse.switches}</Text>
                          <Text style={styles.metricsCardLabel}>Active hrs</Text>
                        </View>
                      </View>
                    </View>
                  </StaggerItem>
                )}

                <StaggerItem index={2} totalDelay={70}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionHeaderText}>
                      <Text style={styles.sectionHeading} numberOfLines={1}>Restricted Apps</Text>
                      <Text style={styles.sectionSubtext} numberOfLines={1}>
                        Real usage · live lock states
                      </Text>
                    </View>
                    <View style={styles.sectionActions}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setShowAddModal(true);
                        }}
                        style={styles.sectionAddBtn}
                      >
                        <Text style={styles.sectionAddBtnText}>+ Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setActiveTab('limits');
                        }}
                      >
                        <Text style={styles.sectionLink}>Manage ({limits.length})</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </StaggerItem>

                <View style={styles.appsList}>
                  {limits.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconBadge}>
                        <Image source={require('../../assets/lock.svg')} style={styles.emptyLockImg} contentFit="contain" />
                      </View>
                      <Text style={styles.emptyTitle}>No Restricted Apps Yet</Text>
                      <Text style={styles.emptySub}>
                        Select applications from your device to enforce screen-time allowances and lock out distractions.
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          playLightFeedback();
                          setShowAddModal(true);
                        }}
                        style={styles.emptyAddBtn}
                      >
                        <Text style={styles.emptyAddBtnText}>+ Select Application</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    limits.map((app, idx) => (
                      <AnimatedAppCard
                        key={app.id}
                        app={app}
                        index={idx}
                        formatSeconds={formatSeconds}
                        resetLabel={resetLabel}
                      />
                    ))
                  )}
                </View>

                {/* Philosophy Banner */}
                <View style={styles.quoteCard}>
                  <Text style={styles.quoteTitle}>Anti-Impulse Rule</Text>
                  <Text style={styles.quoteText}>
                    &quot;Decide your screen time before distraction takes over. Active limits cannot be extended once set.&quot;
                  </Text>
                </View>
              </View>
            </AnimatedTabContent>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 2: APP LIMITS & SCHEDULING                              */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'limits' && (
            <AnimatedTabContent key="limits">
              <View style={styles.tabContent}>
                <View style={styles.tabHeader}>
                  <Text style={styles.tabHeading}>App Limits & Scheduling</Text>
                  <Text style={styles.tabSubheading}>
                    One daily reset governs every limit. Edits are allowed only during the open
                    configuration window.
                  </Text>
                </View>

                <View
                  style={[
                    styles.phaseCard,
                    phase === 'RESET_WINDOW' && styles.phaseCardWindow,
                  ]}
                >
                  <View style={styles.phaseCardHeader}>
                    <View
                      style={[
                        styles.phaseDot,
                        phase === 'RESET_WINDOW' && styles.phaseDotWindow,
                      ]}
                    />
                    <Text
                      style={[
                        styles.phaseCardTitle,
                        phase === 'RESET_WINDOW' && styles.phaseCardTitleWindow,
                      ]}
                    >
                      {phase === 'RESET_WINDOW'
                        ? 'Configuration window open'
                        : 'Limits active & locked'}
                    </Text>
                  </View>
                  <Text style={styles.phaseCardCountdown}>{countdownText || 'Calculating...'}</Text>
                  <Text style={styles.phaseCardSub}>
                    {phase === 'RESET_WINDOW'
                      ? `Set tomorrow's limits before ${resetLabel} — the window closes at reset.`
                      : `Editing unlocks when the ${windowMinutes}-minute window opens at ${windowOpenLabel}.`}
                  </Text>
                </View>

                {/* SCHEDULING ------------------------------------------------ */}
                <Text style={styles.groupSectionLabel}>Scheduling</Text>
                <View style={styles.scheduleCard}>
                  <Text style={styles.scheduleCardTitle}>Current Daily Reset</Text>
                  <Text style={styles.scheduleTimeLarge}>{resetLabel}</Text>
                  <Text style={styles.scheduleTimezone}>
                    Timezone: {activeTimezone} ({timezoneLabel(activeTimezone)})
                  </Text>

                  <View style={styles.divider} />

                  <View style={styles.timelineRow}>
                    <View style={styles.timelineItem}>
                      <Text style={styles.timelineHour}>{timelineSchedule.windowOpen}</Text>
                      <Text style={styles.timelineDesc}>{resetWindow.window_minutes || 20}-min window opens</Text>
                    </View>
                    <View style={styles.timelineItem}>
                      <Text style={styles.timelineHour}>{timelineSchedule.resetTime}</Text>
                      <Text style={styles.timelineDesc}>Daily limits reset</Text>
                    </View>
                    <View style={styles.timelineItem}>
                      <Text style={styles.timelineHour}>{timelineSchedule.lockedTime}</Text>
                      <Text style={styles.timelineDesc}>New day locks</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.scheduleEditorCard}>
                  <View style={styles.editorHeaderRow}>
                    <Text style={styles.editorTitle}>Daily Reset Time</Text>
                    {!canEditSchedule && (
                      <Text style={styles.editorLockText}>Editing in {formatHMS(secondsUntilWindow)}</Text>
                    )}
                  </View>

                  {/* Live preview */}
                  <View style={styles.editorPreviewBox}>
                    <Text style={styles.editorPreview}>{draftPreview}</Text>
                    <Text style={styles.editorPreviewSub}>
                      {activeTimezone} ({timezoneLabel(activeTimezone)})
                    </Text>
                  </View>

                  {/* Hour / Minute / Meridiem steppers */}
                  <View style={styles.segmentRow}>
                    <View style={styles.stepperCol}>
                      <Text style={styles.stepperLabel}>HOUR</Text>
                      <View style={styles.stepperControls}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={!canEditSchedule}
                          onPress={() => {
                            playLightFeedback();
                            setDraftHour((prev) => (prev + 23) % 24);
                          }}
                          style={[styles.stepperBtn, !canEditSchedule && styles.stepperBtnDisabled]}
                        >
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{displayHour}</Text>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={!canEditSchedule}
                          onPress={() => {
                            playLightFeedback();
                            setDraftHour((prev) => (prev + 1) % 24);
                          }}
                          style={[styles.stepperBtn, !canEditSchedule && styles.stepperBtnDisabled]}
                        >
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.stepperCol}>
                      <Text style={styles.stepperLabel}>MINUTE</Text>
                      <View style={styles.stepperControls}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={!canEditSchedule}
                          onPress={() => {
                            playLightFeedback();
                            setDraftMinuteIndex((prev) => (prev + 11) % 12);
                          }}
                          style={[styles.stepperBtn, !canEditSchedule && styles.stepperBtnDisabled]}
                        >
                          <Text style={styles.stepperBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{draftMinute}m</Text>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={!canEditSchedule}
                          onPress={() => {
                            playLightFeedback();
                            setDraftMinuteIndex((prev) => (prev + 1) % 12);
                          }}
                          style={[styles.stepperBtn, !canEditSchedule && styles.stepperBtnDisabled]}
                        >
                          <Text style={styles.stepperBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* AM / PM — own row so narrow screens never overflow */}
                  <View style={styles.meridiemRow}>
                    <Text style={styles.stepperLabel}>AM / PM</Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={!canEditSchedule}
                      onPress={() => {
                        playLightFeedback();
                        setDraftHour((prev) => (prev >= 12 ? prev - 12 : prev + 12));
                      }}
                      style={[styles.meridiemBtn, !canEditSchedule && styles.stepperBtnDisabled]}
                    >
                      <Text style={styles.meridiemBtnText}>{isPM ? 'PM' : 'AM'}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Preset reset times (§3.3 examples) */}
                  <Text style={styles.editorSectionLabel}>PRESETS</Text>
                  <View style={styles.presetRow}>
                    {[
                      { label: 'Midnight', h: 0, m: 0 },
                      { label: 'Early morning', h: 5, m: 0 },
                      { label: 'Morning', h: 8, m: 0 },
                    ].map((preset) => {
                      const isActive = draftHour === preset.h && draftMinute === preset.m;
                      return (
                        <TouchableOpacity
                          key={preset.label}
                          activeOpacity={0.75}
                          disabled={!canEditSchedule}
                          onPress={() => {
                            playLightFeedback();
                            setDraftHour(preset.h);
                            setDraftMinuteIndex(preset.m / 5);
                          }}
                          style={[
                            styles.presetChip,
                            isActive && styles.presetChipActive,
                            !canEditSchedule && styles.stepperBtnDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.presetChipText,
                              isActive && styles.presetChipTextActive,
                            ]}
                          >
                            {formatClock(
                              `${preset.h < 10 ? `0${preset.h}` : preset.h}:${preset.m < 10 ? `0${preset.m}` : preset.m}:00`
                            )}
                          </Text>
                          <Text
                            style={[
                              styles.presetChipSub,
                              isActive && styles.presetChipTextActive,
                            ]}
                          >
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Pre-reset window length */}
                  <Text style={styles.editorSectionLabel}>PRE-RESET WINDOW</Text>
                  <View style={styles.presetRow}>
                    {[10, 20, 30].map((w) => {
                      const isActive = draftWindowMinutes === w;
                      return (
                        <TouchableOpacity
                          key={w}
                          activeOpacity={0.75}
                          disabled={!canEditSchedule}
                          onPress={() => {
                            playLightFeedback();
                            setDraftWindowMinutes(w);
                          }}
                          style={[
                            styles.presetChip,
                            isActive && styles.presetChipActive,
                            !canEditSchedule && styles.stepperBtnDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.presetChipText,
                              isActive && styles.presetChipTextActive,
                            ]}
                          >
                            {w} min
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Save */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={!canEditSchedule || !isScheduleDirty || isSavingSchedule}
                    onPress={saveSchedule}
                    style={[
                      styles.saveScheduleBtn,
                      (!canEditSchedule || !isScheduleDirty || isSavingSchedule) &&
                        styles.saveScheduleBtnDisabled,
                    ]}
                  >
                    {isSavingSchedule ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Text style={styles.saveScheduleBtnText}>
                        {isScheduleDirty ? 'Save schedule' : 'Schedule saved'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {!canEditSchedule && (
                    <Text style={styles.editorGateNote}>
                      Schedule changes are limited to the {windowMinutes}-minute window,{' '}
                      {windowOpenLabel} – {resetLabel}.
                    </Text>
                  )}
                </View>

                {/* Phase-aware action: configure tomorrow's limits during the window */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={phase !== 'RESET_WINDOW'}
                  onPress={() => {
                    playLightFeedback();
                    setShowAddModal(true);
                  }}
                  style={[
                    styles.scheduleActionBtn,
                    phase !== 'RESET_WINDOW' && styles.scheduleActionBtnDisabled,
                  ]}
                >
                  <Text style={styles.scheduleActionBtnText}>
                    {phase === 'RESET_WINDOW'
                      ? "Configure tomorrow's limits"
                      : `Editing opens at ${windowOpenLabel}`}
                  </Text>
                </TouchableOpacity>

                {/* APP LIMITS ------------------------------------------------ */}
                <Text style={styles.groupSectionLabel}>App Limits</Text>
                {phase === 'RESET_WINDOW' ? (
                  <View style={styles.windowBanner}>
                    <Text style={styles.windowBannerTitle}>Configuration window open</Text>
                    <Text style={styles.windowBannerSub}>
                      Restrictions can be removed or changed until {resetLabel}.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.windowBannerLocked}>
                    <Text style={styles.windowBannerLockedTitle}>
                      Restrictions locked until {windowOpenLabel}
                    </Text>
                    <Text style={styles.windowBannerLockedSub}>
                      Limit changes and removals are available only during the {windowMinutes}-minute
                      pre-reset window.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    playLightFeedback();
                    setShowAddModal(true);
                  }}
                  style={styles.addBtn}
                >
                  <Text style={styles.addBtnText}>Select apps to limit</Text>
                </TouchableOpacity>
                <View style={styles.appsList}>
                  {limits.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconBadge}>
                        <Image source={require('../../assets/lock.svg')} style={styles.emptyLockImg} contentFit="contain" />
                      </View>
                      <Text style={styles.emptyTitle}>No limits configured yet</Text>
                      <Text style={styles.emptySub}>
                        Select installed apps to enforce a daily screen-time limit on this device.
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          playLightFeedback();
                          setShowAddModal(true);
                        }}
                        style={styles.emptyAddBtn}
                      >
                        <Text style={styles.emptyAddBtnText}>Select apps to limit</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    limits.map((app, idx) => (
                      <AnimatedLimitConfigCard
                        key={app.id}
                        app={app}
                        index={idx}
                        formatSeconds={formatSeconds}
                        resetLabel={resetLabel}
                        configWindowOpen={phase === 'RESET_WINDOW'}
                        windowOpenLabel={windowOpenLabel}
                        onDeleteLimit={handleDeleteLimit}
                      />
                    ))
                  )}
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Why can&apos;t I edit limits anytime?</Text>
                  <Text style={styles.infoBody}>
                    Limit changes are only allowed during the pre-reset window, so tomorrow&apos;s limits
                    are decided ahead of time — calmly, before impulsivity takes over.
                  </Text>
                </View>

              </View>
            </AnimatedTabContent>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 3: ANALYTICS (Real device usage)                          */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'analytics' && (
            <AnimatedTabContent key="analytics">
              <View style={styles.tabContent}>
                <View style={styles.tabHeader}>
                  <Text style={styles.tabHeading}>Analytics</Text>
                  <Text style={styles.tabSubheading}>
                    Real screen time from Android UsageStats — per day, per app, per hour.
                  </Text>
                </View>

                {/* Range selector */}
                <View style={styles.rangeRow}>
                  {([
                    ['today', 'Today'],
                    ['7', '7 days'],
                    ['30', '30 days'],
                  ] as const).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.7}
                      onPress={() => {
                        playLightFeedback();
                        setAnalyticsRange(key);
                      }}
                      style={[styles.rangeBtn, analyticsRange === key && styles.rangeBtnActive]}
                    >
                      <Text
                        style={[
                          styles.rangeBtnText,
                          analyticsRange === key && styles.rangeBtnTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!isUsageEngineAvailable() || !usageBridge.hasAnalyticsSupport() ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Analytics not in this build</Text>
                    <Text style={styles.emptySub}>
                      Real usage analytics need the full FocusLock Android build.
                    </Text>
                  </View>
                ) : analyticsLoading && !analyticsData ? (
                  <View style={styles.chartCard}>
                    <SkeletonBar width="100%" height={16} borderRadius={8} />
                    <SkeletonBar width="70%" height={16} borderRadius={8} />
                    <SkeletonBar width="85%" height={16} borderRadius={8} />
                  </View>
                ) : analyticsError && !analyticsData ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => loadAnalytics()}
                    style={styles.emptyCard}
                  >
                    <Text style={styles.emptyTitle}>Couldn't load usage data</Text>
                    <Text style={styles.emptySub}>
                      Real usage queries failed — tap to retry.
                    </Text>
                  </TouchableOpacity>
                ) : !analyticsData || analyticsData.totalMs === 0 ? (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconBadge}>
                      <Image
                        source={require('../../assets/lock.svg')}
                        style={styles.emptyLockImg}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.emptyTitle}>No usage recorded yet</Text>
                    <Text style={styles.emptySub}>
                      Screen-time analytics appear after the device records some usage.
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Stat cards */}
                    <View style={styles.statsRow}>
                      <View style={styles.statCard}>
                        <Text style={styles.statLabel}>
                          TOTAL ·{' '}
                          {analyticsRange === 'today'
                            ? 'TODAY'
                            : analyticsRange === '7'
                              ? '7 DAYS'
                              : '30 DAYS'}
                        </Text>
                        <Text style={styles.statValue}>
                          {formatCompact(Math.round(analyticsData.totalMs / 1000))}
                        </Text>
                      </View>
                      {analyticsRange === 'today' && totalLimitSec > 0 ? (
                        <View style={styles.statCard}>
                          <Text style={styles.statLabel}>ALLOWANCE LEFT</Text>
                          <Text
                            style={[
                              styles.statValue,
                              totalLimitSec - Math.round(analyticsData.totalMs / 1000) <= 0 &&
                                styles.statValueWarn,
                            ]}
                          >
                            {formatCompact(
                              Math.max(0, totalLimitSec - Math.round(analyticsData.totalMs / 1000))
                            )}
                          </Text>
                        </View>
                      ) : analyticsRange !== 'today' && analyticsData.prevTotalMs > 0 ? (
                        <View style={styles.statCard}>
                          <Text style={styles.statLabel}>VS PREVIOUS</Text>
                          {(() => {
                            const delta = analyticsData.totalMs - analyticsData.prevTotalMs;
                            const absSec = Math.max(1, Math.round(Math.abs(delta) / 1000));
                            return (
                              <Text
                                style={[
                                  styles.statValue,
                                  delta <= 0 ? styles.statValueGood : styles.statValueWarn,
                                ]}
                              >
                                {delta <= 0 ? '-' : '+'}
                                {formatCompact(absSec)}
                              </Text>
                            );
                          })()}
                        </View>
                      ) : (
                        <View style={styles.statCard}>
                          <Text style={styles.statLabel}>DAILY AVG</Text>
                          <Text style={styles.statValue}>
                            {formatCompact(
                              Math.round(analyticsData.totalMs / 1000) /
                                (analyticsRange === 'today'
                                  ? 1
                                  : analyticsRange === '7'
                                    ? 7
                                    : 30)
                            )}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Key insights — computed from the loaded range only */}
                    {(() => {
                      const maxDaily = analyticsData.daily.reduce(
                        (m, d) => (d.usageMs > m.usageMs ? d : m),
                        { dayStartMs: 0, dayEndMs: 0, usageMs: 0 }
                      );
                      const maxHourMs = Math.max(...analyticsData.hourly, 0);
                      const peakHour = maxHourMs > 0 ? analyticsData.hourly.indexOf(maxHourMs) : -1;
                      const showDay = analyticsData.daily.length > 1 && maxDaily.usageMs > 0;
                      const showHour = peakHour >= 0;
                      if (!showDay && !showHour) return null;
                      return (
                        <View style={styles.insightRow}>
                          {showDay && (
                            <View style={styles.insightChip}>
                              <Text style={styles.insightLabel}>BUSIEST DAY</Text>
                              <Text style={styles.insightValue}>
                                {new Date(maxDaily.dayStartMs).toLocaleDateString([], {
                                  weekday: 'short',
                                })}{' '}
                                · {formatCompact(Math.round(maxDaily.usageMs / 1000))}
                              </Text>
                            </View>
                          )}
                          {showHour && (
                            <View style={styles.insightChip}>
                              <Text style={styles.insightLabel}>PEAK HOUR</Text>
                              <Text style={styles.insightValue}>
                                {String(peakHour).padStart(2, '0')}:00–
                                {String((peakHour + 1) % 24).padStart(2, '0')}:00
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })()}
                    {/* Daily usage bars */}
                    {analyticsData.daily.length > 1 &&
                      (() => {
                        const maxMs = Math.max(...analyticsData.daily.map((d) => d.usageMs), 1);
                        const todayStr = new Date().toDateString();
                        return (
                          <View style={styles.chartCard}>
                            <Text style={styles.chartCardTitle}>Screen time by day</Text>
                            <View style={styles.dailyBars}>
                              {analyticsData.daily.map((d, idx) => {
                                const h = Math.max(3, Math.round((d.usageMs / maxMs) * 96));
                                const dt = new Date(d.dayStartMs);
                                const isToday = dt.toDateString() === todayStr;
                                return (
                                  <View key={d.dayStartMs} style={styles.dailyBarCol}>
                                    <View
                                      style={[
                                        styles.dailyBar,
                                        { height: h },
                                        isToday && styles.dailyBarActive,
                                      ]}
                                    />
                                    <Text
                                      style={[
                                        styles.dailyBarLabel,
                                        isToday && styles.dailyBarLabelActive,
                                      ]}
                                    >
                                      {analyticsData.daily.length > 14
                                        ? idx % 3 === 0 || isToday
                                          ? String(dt.getDate())
                                          : ''
                                        : dt.toLocaleDateString([], { weekday: 'short' }).charAt(0)}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                            <View style={styles.chartLegend}>
                              <View
                                style={[styles.chartLegendDot, { backgroundColor: colors.chart1 }]}
                              />
                              <Text style={styles.chartLegendText}>Screen time per day</Text>
                            </View>
                          </View>
                        );
                      })()}
                    {/* Most used apps */}
                    <View style={styles.chartCard}>
                      <Text style={styles.chartCardTitle}>Most used apps</Text>
                      {analyticsData.perApp.map((row, i) => {
                        const pct =
                          analyticsData.totalMs > 0
                            ? Math.min(1, row.usageMs / analyticsData.totalMs)
                            : 0;
                        const tint = analyticsChartColors[i % analyticsChartColors.length];
                        const limitItem = limits.find((l) => l.app_bundle_id === row.packageName);
                        return (
                          <View key={row.packageName} style={styles.appStatRow}>
                            <View style={[styles.appRankBadge, { backgroundColor: `${tint}33` }]}>
                              <Text style={[styles.appRankText, { color: tint }]}>{i + 1}</Text>
                            </View>
                            <View style={styles.appStatCenter}>
                              <Text numberOfLines={1} style={styles.appStatName}>
                                {row.label}
                              </Text>
                              <View style={styles.appStatTrack}>
                                <View
                                  style={[
                                    styles.appStatFill,
                                    {
                                      width: `${Math.max(3, pct * 100)}%`,
                                      backgroundColor:
                                        analyticsChartColors[i % analyticsChartColors.length],
                                    },
                                  ]}
                                />
                              </View>
                              {analyticsRange === 'today' && limitItem ? (
                                <Text style={styles.appStatMeta}>
                                  Limit {formatHMS(limitItem.daily_limit_seconds)}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.appStatRight}>
                              <Text style={styles.appStatTime}>
                                {formatCompact(Math.round(row.usageMs / 1000))}
                              </Text>
                              <Text style={styles.appStatPct}>{Math.round(pct * 100)}%</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>

                    {/* Hourly heatmap */}
                    <View style={styles.chartCard}>
                      <Text style={styles.chartCardTitle}>Usage by hour</Text>
                      <View style={styles.heatmapGrid}>
                        {analyticsData.hourly.map((ms, h) => {
                          const maxH = Math.max(...analyticsData.hourly, 1);
                          const intensity = ms > 0 ? Math.max(0.12, ms / maxH) : 0;
                          return (
                            <View
                              key={h}
                              style={[
                                styles.heatCell,
                                {
                                  backgroundColor:
                                    intensity > 0 ? colors.accent : colors.chartTrack,
                                },
                                intensity > 0 && { opacity: 0.25 + intensity * 0.75 },
                              ]}
                            />
                          );
                        })}
                      </View>
                      <View style={styles.heatLabelRow}>
                        {['0h', '6h', '12h', '18h', '24h'].map((t) => (
                          <Text key={t} style={styles.heatLabel}>
                            {t}
                          </Text>
                        ))}
                      </View>
                    </View>
                  </>
                )}
              </View>
            </AnimatedTabContent>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 4: SETTINGS (Account & Preferences) */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'settings' && (
            <AnimatedTabContent key="settings">
              <View style={styles.tabContent}>
                <View style={styles.tabHeader}>
                  <Text style={styles.tabHeading}>Settings</Text>
                  <Text style={styles.tabSubheading}>
                    Account, notifications, privacy, and more.
                  </Text>
                </View>

                {/* Profile Card — tapping opens Account settings */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.profileCard}
                  onPress={() => {
                    playLightFeedback();
                    router.push('/settings/account');
                  }}
                >
                  <View style={styles.profileTopRow}>
                    {profile?.avatar_url ? (
                      <Image
                        source={{ uri: profile.avatar_url }}
                        style={styles.profileAvatarLarge}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.profileAvatarFallbackLarge}>
                        <Text style={styles.profileInitialLarge}>
                          {profile?.username ? profile.username.charAt(0).toUpperCase() : 'U'}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 16 }}>
                      <Text style={styles.profileUsername}>
                        {profile?.display_name || (profile?.username ? `@${profile.username}` : 'Your Account')}
                      </Text>
                      <Text style={styles.profileEmail}>{profile?.email}</Text>
                      <Text style={styles.changeAvatarText}>Account & Profile →</Text>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </View>
                </TouchableOpacity>

                {/* APPEARANCE group */}
                <Text style={styles.settingsGroupLabel}>APPEARANCE</Text>
                <View style={styles.settingsGroupCard}>
                  <View style={styles.appearanceSelectorRow}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        playLightFeedback();
                        setThemeMode('system');
                      }}
                      style={[
                        styles.themeOptionPill,
                        themeMode === 'system' && styles.themeOptionPillActive,
                      ]}
                    >
                      <View style={[styles.radioCircle, themeMode === 'system' && styles.radioCircleActive]}>
                        {themeMode === 'system' && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.themeOptionLabel, themeMode === 'system' && styles.themeOptionTextActive]}>
                        System
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        playLightFeedback();
                        setThemeMode('light');
                      }}
                      style={[
                        styles.themeOptionPill,
                        themeMode === 'light' && styles.themeOptionPillActive,
                      ]}
                    >
                      <View style={[styles.radioCircle, themeMode === 'light' && styles.radioCircleActive]}>
                        {themeMode === 'light' && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.themeOptionLabel, themeMode === 'light' && styles.themeOptionTextActive]}>
                        Light
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        playLightFeedback();
                        setThemeMode('dark');
                      }}
                      style={[
                        styles.themeOptionPill,
                        themeMode === 'dark' && styles.themeOptionPillActive,
                      ]}
                    >
                      <View style={[styles.radioCircle, themeMode === 'dark' && styles.radioCircleActive]}>
                        {themeMode === 'dark' && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.themeOptionLabel, themeMode === 'dark' && styles.themeOptionTextActive]}>
                        Dark
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.themeDescription}>
                    {themeMode === 'system'
                      ? `Automatic · Dark at night (7 PM – 6 AM), Light during the day (${isDark ? 'Dark mode currently active' : 'Light mode currently active'}).`
                      : themeMode === 'light'
                      ? 'Always uses clean Light theme.'
                      : 'Always uses sleek Dark Glass theme.'}
                  </Text>
                </View>

                {/* PREFERENCES group */}
                <Text style={styles.settingsGroupLabel}>PREFERENCES</Text>
                <View style={styles.settingsGroupCard}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.settingsRow, styles.settingsRowWithDivider]}
                    onPress={() => { playLightFeedback(); router.push('/settings/notifications'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/notifications.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <View>
                        <Text style={styles.settingLabel}>Notifications</Text>
                        <Text style={styles.settingSubLabel}>Alerts, banners & sounds</Text>
                      </View>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.settingsRow, styles.settingsRowWithDivider]}
                    onPress={() => { playLightFeedback(); router.push('/settings/focus'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/focus.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <View>
                        <Text style={styles.settingLabel}>Focus Preferences</Text>
                        <Text style={styles.settingSubLabel}>Strictness & window controls</Text>
                      </View>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.settingsRow}
                    onPress={() => { playLightFeedback(); router.push('/settings/privacy'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/privacy.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <View>
                        <Text style={styles.settingLabel}>Privacy & Security</Text>
                        <Text style={styles.settingSubLabel}>Data & diagnostics</Text>
                      </View>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>
                </View>

                {/* SUPPORT group */}
                <Text style={styles.settingsGroupLabel}>SUPPORT & LEGAL</Text>
                <View style={styles.settingsGroupCard}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.settingsRow, styles.settingsRowWithDivider]}
                    onPress={() => { playLightFeedback(); router.push('/settings/help'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/help.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <View>
                        <Text style={styles.settingLabel}>Help & FAQ</Text>
                        <Text style={styles.settingSubLabel}>Guides & common questions</Text>
                      </View>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.settingsRow, styles.settingsRowWithDivider]}
                    onPress={() => { playLightFeedback(); router.push('/settings/feedback'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/feedback.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <View>
                        <Text style={styles.settingLabel}>Send Feedback</Text>
                        <Text style={styles.settingSubLabel}>Report issues or suggest features</Text>
                      </View>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.settingsRow, styles.settingsRowWithDivider]}
                    onPress={() => { playLightFeedback(); router.push('/settings/terms'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/terms.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <Text style={styles.settingLabel}>Terms of Service</Text>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.settingsRow}
                    onPress={() => { playLightFeedback(); router.push('/settings/privacy-policy'); }}
                  >
                    <View style={styles.settingIconRow}>
                      <Image
                        source={require('../../assets/settings/privacy-policy.svg')}
                        style={styles.settingIconImg}
                        contentFit="contain"
                      />
                      <Text style={styles.settingLabel}>Privacy Policy</Text>
                    </View>
                    <Text style={styles.settingChevron}>›</Text>
                  </TouchableOpacity>
                </View>

                {/* Sign Out */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    playLightFeedback();
                    handleSignOut();
                  }}
                  style={styles.signOutBtn}
                >
                  <Text style={styles.signOutBtnText}>Sign Out of FocusLock</Text>
                </TouchableOpacity>

                {/* App version footer */}
                <Text style={styles.settingsFooter}>FocusLock v1.1.5 · WaiyatLabs</Text>
              </View>
            </AnimatedTabContent>
          )}

          {/* Bottom spacing so content is never obscured by floating tabs */}
          <View style={{ height: 110 }} />
        </ScrollView>

        {/* Floating Bottom Navigation Tabs */}
        <BottomTabs
          activeTab={activeTab}
          onSelectTab={(tab) => {
            playLightFeedback();
            setActiveTab(tab);
          }}
        />
      </SafeAreaView>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: SELECT & CONFIGURE RESTRICTED APP (Wizard Flow) */}
      {/* ------------------------------------------------------------- */}
      <AppLimitSetupModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        existingBundleIds={limits.map((l) => l.app_bundle_id)}
        currentResetTime={resetWindow.reset_time}
        configWindowOpen={phase === 'RESET_WINDOW'}
        windowMinutes={windowMinutes}
        windowOpenLabel={windowOpenLabel}
        onSuccess={handleAppLimitSuccess}
        showToast={showToast}
      />

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CHANGE PROFILE AVATAR */}
      {/* ------------------------------------------------------------- */}
      <Modal visible={showAvatarModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Profile Picture</Text>
            <Text style={styles.modalSub}>
              Choose a photo from your device or enter a direct image URL.
            </Text>

            {/* Choose from Library Button */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePickAndUploadAvatar}
              disabled={isSavingAvatar}
              style={styles.modalSecondaryBtn}
            >
              <Text style={styles.modalSecondaryBtnText}>
                {isSavingAvatar ? 'Uploading Picture...' : 'Choose from Photo Library'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalDividerRow}>
              <View style={styles.modalDividerLine} />
              <Text style={styles.modalDividerText}>OR ENTER URL</Text>
              <View style={styles.modalDividerLine} />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.inputLabel}>Image URL</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="https://images.unsplash.com/..."
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                value={newAvatarUrl}
                onChangeText={handleAvatarUrlChange}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleUpdateAvatar}
                disabled={isSavingAvatar}
                style={styles.modalPrimaryBtn}
              >
                {isSavingAvatar ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>Save Avatar URL</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowAvatarModal(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(C: ThemeColors, isDark: boolean) {
  const cardShadow = getGlassCardShadow(isDark);
  return StyleSheet.create({
  // ─── Screen Layout ─────────────────────────────────────────────────────────
  screenContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },
  safeArea: {
    flex: 1,
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: S.lg,
    paddingTop: S.sm,
    paddingBottom: S.xxl,
  },
  tabContent: {
    gap: S.lg,
  },

  // ─── Greeting ──────────────────────────────────────────────────────────────
  greetingBlock: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginBottom: 4,
    paddingTop: 4,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  statusPillOk: {
    backgroundColor: C.accentDim,
    borderColor: isDark ? 'rgba(118,247,86,0.35)' : 'rgba(91,217,74,0.45)',
  },
  statusPillWarn: {
    backgroundColor: C.warningDim,
    borderColor: isDark ? 'rgba(251,191,36,0.4)' : 'rgba(245,158,11,0.45)',
  },
  statusDotOk: { backgroundColor: C.accent },
  statusDotWarn: { backgroundColor: C.warning },
  statusPillTextOk: { color: C.accentText },
  statusPillTextWarn: { color: isDark ? '#FBBF24' : '#B45309' },
  screenTimeCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    padding: S.lg,
    marginBottom: 14,
    ...cardShadow,
  },
  screenTimeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.textMuted,
  },
  screenTimeValue: {
    marginTop: 8,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    color: C.textPrimary,
  },
  screenTimeEmpty: {
    marginTop: 8,
    fontSize: 13,
    color: C.textSecondary,
  },
  screenTimeCompare: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  screenTimeCompareGood: {
    color: C.accentText,
  },
  screenTimeCompareMuted: {
    marginTop: 4,
    fontSize: 12.5,
    color: C.textMuted,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  sectionAddBtn: {
    backgroundColor: C.accent,
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: 'center',
  },
  sectionAddBtnText: {
    color: C.onAccent,
    fontSize: 12.5,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    padding: S.md,
    minHeight: 84,
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.textMuted,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: C.textPrimary,
  },
  statValueGood: { color: C.accentText },
  statValueWarn: { color: isDark ? '#FBBF24' : '#B45309' },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  rangeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bgCard,
  },
  rangeBtnActive: {
    backgroundColor: C.accentDim,
    borderColor: isDark ? 'rgba(118,247,86,0.5)' : 'rgba(91,217,74,0.6)',
  },
  rangeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSecondary,
  },
  rangeBtnTextActive: {
    color: C.accentText,
  },
  chartCard: {
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    padding: S.lg,
    marginBottom: 14,
  },
  chartCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 12,
  },
  dailyBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
    height: 124,
  },
  dailyBarCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  dailyBar: {
    width: '100%',
    maxWidth: 26,
    borderRadius: 5,
    backgroundColor: C.chart1,
  },
  dailyBarActive: {
    backgroundColor: C.accent,
  },
  dailyBarLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '600',
    color: C.chartLabel,
  },
  dailyBarLabelActive: {
    color: C.accentText,
    fontWeight: '800',
  },
  chartLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  chartLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartLegendText: {
    fontSize: 11.5,
    color: C.textMuted,
  },
  appStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  appRankBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appRankText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  appStatCenter: {
    flex: 1,
    minWidth: 0,
  },
  appStatName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: C.textPrimary,
  },
  appStatTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: C.chartTrack,
    marginTop: 5,
    overflow: 'hidden',
  },
  appStatFill: {
    height: 7,
    borderRadius: 4,
  },
  appStatMeta: {
    marginTop: 3,
    fontSize: 11,
    color: C.textMuted,
  },
  appStatTime: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSecondary,
  },
  appStatRight: {
    alignItems: 'flex-end',
    minWidth: 54,
  },
  appStatPct: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    marginTop: 2,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  insightChip: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  insightLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.textMuted,
  },
  insightValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  heatCell: {
    width: 13,
    height: 13,
    borderRadius: 4,
  },
  heatLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  heatLabel: {
    fontSize: 10.5,
    color: C.chartLabel,
  },
  greetingEyebrow: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  greetingSub: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
  },

  // ─── Hero Card ─────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: S.xxl,
    borderWidth: 1,
    borderColor: C.border,
    ...cardShadow,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: S.md,
  },
  heroHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.successDim,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.22)',
  },
  pulseContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.success,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.success,
  },
  statusPillText: {
    color: C.success,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  resetLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  timerDisplay: {
    fontSize: 34,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -1.0,
    fontVariant: ['tabular-nums'],
  },
  timerSub: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 3,
  },

  // ─── Progress Bar ──────────────────────────────────────────────────────────
  progressContainer: {
    marginTop: S.lg,
    paddingTop: S.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: S.sm,
  },
  progressLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  progressLimit: {
    color: C.textMuted,
    fontSize: 12,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ─── Section Header ────────────────────────────────────────────────────────
  metricsSection: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    gap: S.md,
  },
  metricsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.textPrimary,
  },
  metricsSectionSub: {
    color: C.textMuted,
    fontSize: 12,
  },
  metricsSkeleton: {
    alignItems: 'center',
    gap: S.sm,
  },
  metricsMissingText: {
    color: C.textMuted,
    fontSize: 13,
  },
  metricsMissingSub: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: S.sm,
    marginTop: S.md,
  },
  metricsCard: {
    backgroundColor: C.bgSecondary,
    borderRadius: R.md,
    padding: S.md,
    flex: 1,
    alignItems: 'center',
    gap: S.xs,
  },
  metricsCardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: C.textPrimary,
    lineHeight: 26,
  },
  metricsCardUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: C.textMuted,
  },
  metricsCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsCompare: {
    marginTop: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  metricsCompareLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.md,
  },
  metricsCompareValue: {
    fontSize: 16,
    fontWeight: '800',
    color: C.textPrimary,
    lineHeight: 20,
  },
  metricsCompareUp: {
    color: '#22c55e',
  },
  metricsCompareDown: {
    color: '#ef4444',
  },
  metricsCompareNote: {
    fontSize: 12,
    fontWeight: '500',
    color: C.textMuted,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionHeaderText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  sectionSubtext: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionLink: {
    color: C.accentText,
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── App Cards ─────────────────────────────────────────────────────────────
  appsList: {
    gap: S.md,
  },
  appCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
    ...cardShadow,
  },
  appCardLockedState: {
    borderColor: isDark ? 'rgba(248,113,113,0.55)' : 'rgba(220,38,38,0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.35 : 0.2,
        shadowRadius: 18,
      },
      android: { elevation: 9 },
    }),
  },
  appCardWarningState: {
    borderColor: isDark ? 'rgba(251,191,36,0.5)' : 'rgba(217,119,6,0.45)',
    ...Platform.select({
      ios: {
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.28 : 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 7 },
    }),
  },
  glassSheen: {
    position: 'absolute',
    top: 1,
    left: R.lg + 8,
    right: R.lg + 8,
    height: 1,
    borderRadius: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.95)',
  },
  lockedWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: R.lg,
    backgroundColor: isDark ? 'rgba(16,10,12,0.55)' : 'rgba(32,15,17,0.45)',
  },
  appCardTextLocked: {
    color: '#F4F4F5',
  },
  appMetaLocked: {
    color: 'rgba(244,244,245,0.6)',
  },
  appBundleTextLocked: {
    color: 'rgba(244,244,245,0.55)',
  },
  appCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  appCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  appIconBadge: {
    width: 44,
    height: 44,
    borderRadius: R.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: C.border,
  },
  appIconBadgeLocked: {
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.3)',
  },
  appIconInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: C.textPrimary,
  },
  appIconInitialLocked: {
    color: C.danger,
  },
  appName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  appMeta: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  appCardRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    marginLeft: 6,
  },
  badgePill: {
    backgroundColor: C.successDim,
    borderColor: 'rgba(52,211,153,0.25)',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  badgeLocked: {
    backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(220,38,38,0.1)',
    borderColor: isDark ? 'rgba(248,113,113,0.5)' : 'rgba(220,38,38,0.4)',
  },
  badgeWarning: {
    backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(217,119,6,0.1)',
    borderColor: isDark ? 'rgba(251,191,36,0.45)' : 'rgba(217,119,6,0.4)',
  },
  badgeText: {
    color: C.success,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextLocked: {
    color: isDark ? '#FCA5A5' : '#DC2626',
    letterSpacing: 0.8,
  },
  badgeTextWarning: {
    color: isDark ? '#FBBF24' : '#B45309',
    letterSpacing: 0.8,
  },
  cardProgressTrack: {
    height: 4,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    borderRadius: R.pill,
    overflow: 'hidden',
    marginTop: 10,
  },
  cardProgressTrackLocked: {
    backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(220,38,38,0.12)',
  },
  cardProgressTrackWarning: {
    backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(217,119,6,0.12)',
  },
  cardProgressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: R.pill,
  },
  cardProgressFillLocked: {
    backgroundColor: isDark ? '#F87171' : '#EF4444',
  },
  cardProgressFillWarning: {
    backgroundColor: isDark ? '#FBBF24' : '#F59E0B',
  },
  cardStatusNote: {
    marginTop: 8,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cardStatusNoteWarning: {
    color: isDark ? '#FBBF24' : '#B45309',
  },
  cardStatusNoteLocked: {
    color: isDark ? '#FCA5A5' : '#DC2626',
  },
  drawerOnDark: {
    borderTopColor: 'rgba(244,244,245,0.14)',
  },
  drawerDividerLocked: {
    borderTopColor: 'rgba(244,244,245,0.14)',
  },
  drawerLabelOnDark: {
    color: 'rgba(244,244,245,0.55)',
  },
  drawerValueOnDark: {
    color: '#F4F4F5',
  },
  appCardDrawer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: 'transparent',
    marginBottom: 2,
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  drawerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.2,
  },
  drawerValue: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textPrimary,
    letterSpacing: -0.1,
    flexShrink: 1,
    textAlign: 'right',
  },
  drawerValueLocked: {
    fontSize: 11,
    fontWeight: '700',
    color: 'blue',
    marginTop: 3,
    flexShrink: 1,
    textAlign: 'right',
  },

  // ─── Phase Pill (hero status) ──────────────────────────────────────────────
  phasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.successDim,
    borderColor: 'rgba(118,247,86,0.30)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  phasePillWindow: {
    backgroundColor: C.warningDim,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  phaseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.success,
  },
  phaseDotWindow: {
    backgroundColor: C.warning,
  },
  phasePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: C.success,
  },
  phasePillTextWindow: {
    color: C.warning,
  },

  // ─── Configuration-window banners ──────────────────────────────────────────
  windowBanner: {
    backgroundColor: C.warningDim,
    borderColor: 'rgba(251,191,36,0.35)',
    borderWidth: 1,
    borderRadius: R.lg,
    padding: S.md,
    gap: 3,
  },
  windowBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.warning,
    letterSpacing: -0.2,
  },
  windowBannerSub: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  windowBannerLocked: {
    backgroundColor: C.bgCard,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.lg,
    padding: S.md,
    gap: 3,
  },
  windowBannerLockedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  windowBannerLockedSub: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
  },
  drawerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flex: 1,
  },
  drawerBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: R.sm,
  },
  drawerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textPrimary,
  },
  drawerBtnDelete: {
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.28)',
  },
  drawerBtnTextDelete: {
    color: C.danger,
    fontWeight: '700',
  },

  // ─── Limits Tab ────────────────────────────────────────────────────────────
  limitConfigCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: S.md,
    borderWidth: 1,
    borderColor: C.border,
    gap: S.md,
    ...cardShadow,
  },
  limitConfigCardLocked: {
    borderColor: isDark ? 'rgba(248,113,113,0.55)' : 'rgba(220,38,38,0.5)',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.35 : 0.2,
        shadowRadius: 18,
      },
      android: { elevation: 9 },
    }),
  },
  limitCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  appBundleText: {
    fontSize: 11,
    color: C.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  limitPill: {
    backgroundColor: C.accentDim,
    borderColor: 'rgba(91,217,74,0.30)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    flexShrink: 0,
    marginLeft: 6,
  },
  limitPillText: {
    color: C.accentText,
    fontSize: 12,
    fontWeight: '700',
  },
  limitPillLocked: {
    backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(220,38,38,0.1)',
    borderColor: isDark ? 'rgba(248,113,113,0.5)' : 'rgba(220,38,38,0.4)',
    borderWidth: 1,
  },
  limitPillTextLocked: {
    color: isDark ? '#FCA5A5' : '#DC2626',
    letterSpacing: 0.3,
  },
  limitCardFooter: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
  },
  lockNotice: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '500',
  },
  limitCardFooterLocked: {
    borderTopColor: 'rgba(244,244,245,0.14)',
  },
  lockNoticeLocked: {
    color: 'rgba(244,244,245,0.7)',
  },
  categoryBadgeTiny: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: R.xs,
  },
  categoryBadgeTinyText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.textMuted,
  },

  // ─── Buttons ───────────────────────────────────────────────────────────────
  addBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  addBtnText: {
    color: C.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  tabHeader: {
    marginBottom: 4,
    paddingTop: S.lg,
  },
  tabHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  tabSubheading: {
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },

  // ─── Quote Card ────────────────────────────────────────────────────────────
  quoteCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: S.lg,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 4,
  },
  quoteTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  quoteText: {
    fontSize: 14,
    color: C.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // ─── Schedule Tab ──────────────────────────────────────────────────────────
  // ─── Schedule Tab: Phase card ──────────────────────────────────────────────
  phaseCard: {
    backgroundColor: C.bgCard,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.lg,
    padding: S.lg,
    gap: 6,
    ...cardShadow,
  },
  phaseCardWindow: {
    backgroundColor: C.warningDim,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  phaseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phaseCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: C.success,
  },
  phaseCardTitleWindow: {
    color: C.warning,
  },
  phaseCardCountdown: {
    fontSize: 32,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -1.0,
    fontVariant: ['tabular-nums'],
  },
  phaseCardSub: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },

  // ─── Schedule Tab: Reset-time editor ───────────────────────────────────────
  scheduleEditorCard: {
    backgroundColor: C.bgCard,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.lg,
    padding: S.lg,
    gap: S.md,
    ...cardShadow,
  },
  editorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  editorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  editorLockText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  editorPreviewBox: {
    alignItems: 'center',
    backgroundColor: C.bgSecondary,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.md,
    paddingVertical: S.md,
    gap: 2,
  },
  editorPreview: {
    fontSize: 40,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  editorPreviewSub: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
  },
  editorSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.textMuted,
    marginTop: 2,
  },
  groupSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.textMuted,
    textTransform: 'uppercase',
  },

  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepperCol: {
    flex: 1,
    backgroundColor: C.bgSecondary,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
  },
  stepperLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.0,
    color: C.textMuted,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.bgInput,
    borderColor: C.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textPrimary,
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '800',
    color: C.textPrimary,
    minWidth: 34,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  meridiemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.bgSecondary,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: R.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  meridiemBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: R.sm,
    backgroundColor: C.accentDim,
    borderColor: C.accent,
    borderWidth: 1,
  },
  meridiemBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.accentText,
    letterSpacing: 0.5,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.sm,
    backgroundColor: C.bgInput,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: 'center',
    gap: 1,
  },
  presetChipActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accent,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  presetChipTextActive: {
    color: C.accentText,
  },
  presetChipSub: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textMuted,
  },
  saveScheduleBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveScheduleBtnDisabled: {
    backgroundColor: C.bgSecondary,
    borderColor: C.border,
    borderWidth: 1,
  },
  saveScheduleBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.onAccent,
    letterSpacing: -0.2,
  },
  editorGateNote: {
    fontSize: 11,
    color: C.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },

  scheduleCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: S.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    ...cardShadow,
  },
  scheduleCardTitle: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scheduleTimeLarge: {
    fontSize: 52,
    fontWeight: '800',
    color: C.textPrimary,
    marginVertical: 6,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  scheduleTimezone: {
    color: C.textMuted,
    fontSize: 13,
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: C.border,
    marginVertical: S.lg,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  timelineItem: {
    alignItems: 'center',
  },
  timelineHour: {
    color: C.accentText,
    fontSize: 14,
    fontWeight: '800',
  },
  timelineDesc: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: S.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 6,
  },
  infoBody: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 20,
  },
  scheduleActionBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  scheduleActionBtnText: {
    color: C.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleActionBtnDisabled: {
    opacity: 0.45,
  },

  // ─── Empty State ───────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.borderLight,
    borderStyle: 'dashed',
    paddingVertical: 36,
    paddingHorizontal: S.lg,
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  emptyIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyLockImg: {
    width: 24,
    height: 24,
    tintColor: C.textMuted,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  emptyAddBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  emptyAddBtnText: {
    color: C.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },

  // ─── Settings Tab ──────────────────────────────────────────────────────────
  profileCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    padding: S.lg,
    borderWidth: 1,
    borderColor: C.borderLight,
    marginBottom: 4,
    ...cardShadow,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatarLarge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: C.borderLight,
  },
  profileAvatarFallbackLarge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitialLarge: {
    color: C.onAccent,
    fontSize: 22,
    fontWeight: '700',
  },
  profileUsername: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },
  changeAvatarText: {
    color: C.accentText,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  settingsGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    marginBottom: 8,
    marginTop: S.lg,
    marginLeft: 4,
  },
  settingsGroupCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...cardShadow,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: S.md,
  },
  settingsRowWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  settingIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    flex: 1,
  },
  settingIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 7.5,
    overflow: 'hidden',
  },
  settingIconImg: {
    width: 32,
    height: 32,
    borderRadius: 7.5,
    overflow: 'hidden',
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textPrimary,
    letterSpacing: -0.2,
  },
  settingSubLabel: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 1,
  },
  settingChevron: {
    color: C.textMuted,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '400',
  },
  signOutBtn: {
    backgroundColor: C.dangerDim,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: S.xxl,
  },
  signOutBtnText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  settingsFooter: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: S.xl,
    marginBottom: 8,
  },
  settingsGroup: {
    backgroundColor: C.bgCard,
    borderRadius: R.lg,
    overflow: 'hidden',
  },
  groupHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 1.5,
  },
  openSettingsBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: S.md,
  },
  openSettingsBtnText: {
    color: C.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },

  // ─── Modals ────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: S.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0E1425',
    borderRadius: R.xl,
    padding: S.xxl,
    borderWidth: 1,
    borderColor: C.borderLight,
    ...cardShadow,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.textPrimary,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: S.lg,
    lineHeight: 18,
  },
  modalInputGroup: {
    gap: 10,
    marginBottom: S.xl,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
  },
  modalInput: {
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: 11,
    fontSize: 14,
    color: C.textPrimary,
  },
  modalActions: {
    gap: 8,
  },
  modalPrimaryBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    color: C.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    backgroundColor: C.bgCard,
    borderRadius: R.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderLight,
    marginBottom: S.lg,
  },
  modalSecondaryBtnText: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modalDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    marginBottom: S.lg,
  },
  modalDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  modalDividerText: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  // ─── Appearance Selector ───────────────────────────────────────────────────
  appearanceSelectorRow: {
    flexDirection: 'row',
    gap: S.sm,
    padding: S.md,
  },
  themeOptionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: R.md,
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
  },
  themeOptionPillActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accent,
  },
  themeOptionIcon: {
    fontSize: 14,
  },
  themeOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  themeOptionTextActive: {
    color: C.accentText,
    fontWeight: '700',
  },
  themeActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
    marginLeft: 2,
  },
  themeDescription: {
    fontSize: 12,
    color: C.textMuted,
    paddingHorizontal: S.md,
    paddingBottom: S.md,
    lineHeight: 16,
  },
  radioCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: C.accent,
  },
  radioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  });
};
