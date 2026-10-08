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
import { playSelectionFeedback, playLightFeedback, playErrorFeedback, playSuccessFeedback } from '../lib/feedback';
import {
  notifyAppLocked,
  notifyAppWarning,
  notifyDailyReset,
  requestNotificationPermissions,
  registerPushToken,
} from '../lib/notifications';
import { AppIcon, resolveAppIcon, getCachedIcon } from '../lib/appIcons';

// App limit data model
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
  onPress?: () => void;
  onAddUsage?: (appId: string, seconds: number) => void;
  onLockApp?: (appId: string) => void;
  onResetUsage?: (appId: string) => void;
}

function AnimatedAppCard({
  app,
  index,
  formatSeconds,
  onPress,
  onAddUsage,
  onLockApp,
  onResetUsage,
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
  const isWarning = !isLocked && remaining <= 600;

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
        <View style={styles.appCardTopRow}>
          <View style={styles.appCardLeft}>
            <AppIconImage app={app} size={40} isLocked={isLocked} />
            <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <Text style={styles.appName} numberOfLines={1} ellipsizeMode="tail">{app.app_display_name}</Text>
              <Text style={styles.appMeta} numberOfLines={1} ellipsizeMode="tail">
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

        {/* Micro progress line inside card */}
        <View style={styles.cardProgressTrack}>
          <View
            style={[
              styles.cardProgressFill,
              { width: `${Math.min(100, (used / app.daily_limit_seconds) * 100)}%` },
              isLocked && styles.cardProgressFillLocked,
              isWarning && styles.cardProgressFillWarning,
            ]}
          />
        </View>

        {/* Interactive drawer revealed on tap */}
        {isExpanded && (
          <View style={styles.appCardDrawer}>
            <View style={styles.drawerDivider} />
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Simulate Hardware Rules:</Text>
              <View style={styles.drawerActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    playLightFeedback();
                    onAddUsage?.(app.id, 900);
                  }}
                  style={styles.drawerBtn}
                >
                  <Text style={styles.drawerBtnText}>+15m</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    onLockApp?.(app.id);
                  }}
                  style={[styles.drawerBtn, styles.drawerBtnLock]}
                >
                  <Text style={[styles.drawerBtnText, styles.drawerBtnTextLock]}>
                    Lock Now
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    playLightFeedback();
                    onResetUsage?.(app.id);
                  }}
                  style={styles.drawerBtn}
                >
                  <Text style={styles.drawerBtnText}>Reset</Text>
                </TouchableOpacity>
              </View>
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
  onAddUsage?: (appId: string, seconds: number) => void;
  onLockApp?: (appId: string) => void;
  onResetUsage?: (appId: string) => void;
  onDeleteLimit?: (appId: string, appName: string) => void;
}

function AnimatedLimitConfigCard({
  app,
  index,
  formatSeconds,
  onAddUsage,
  onLockApp,
  onResetUsage,
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
        <View style={styles.limitCardRow}>
          <AppIconImage app={app} size={40} isLocked={isLocked} />
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
              <Text style={styles.appName} numberOfLines={1} ellipsizeMode="tail">{app.app_display_name}</Text>
              {app.category ? (
                <View style={styles.categoryBadgeTiny}>
                  <Text style={styles.categoryBadgeTinyText}>{app.category}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.appBundleText} numberOfLines={1} ellipsizeMode="tail">{app.app_bundle_id}</Text>
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
              {isLocked ? 'LOCKED' : `${formatSeconds(app.daily_limit_seconds)}/day`}
            </Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.appCardDrawer}>
            <View style={styles.drawerDivider} />
            <View style={styles.drawerRow}>
              <Text style={styles.drawerLabel}>Controls:</Text>
              <View style={styles.drawerActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    playLightFeedback();
                    onAddUsage?.(app.id, 900);
                  }}
                  style={styles.drawerBtn}
                >
                  <Text style={styles.drawerBtnText}>+15m</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    onLockApp?.(app.id);
                  }}
                  style={[styles.drawerBtn, styles.drawerBtnLock]}
                >
                  <Text style={[styles.drawerBtnText, styles.drawerBtnTextLock]}>
                    Lock
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    playLightFeedback();
                    onResetUsage?.(app.id);
                  }}
                  style={styles.drawerBtn}
                >
                  <Text style={styles.drawerBtnText}>Reset</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDeleteLimit?.(app.id, app.app_display_name);
                  }}
                  style={[styles.drawerBtn, styles.drawerBtnDelete]}
                >
                  <Text style={[styles.drawerBtnText, styles.drawerBtnTextDelete]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={styles.limitCardFooter}>
          <Text style={styles.lockNotice}>
            {isLocked
              ? 'Shielding Active • Cannot be bypassed until daily reset'
              : 'Enforced locally • Tap to test hardware lock notification'}
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
    timezone: 'UTC',
    window_minutes: 20,
  });

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

  const handleAppLimitSuccess = (savedLimit: any) => {
    setLimits((prev) => {
      const filtered = prev.filter((l) => l.app_bundle_id !== savedLimit.app_bundle_id);
      return [...filtered, { ...savedLimit, used_seconds: 0 }];
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

      // 2. Fetch App Limits
      const { data: limitsData } = await supabase
        .from('app_limits')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (limitsData && limitsData.length > 0) {
        // Use real data without simulation
        setLimits(limitsData.map((l) => ({ ...l, used_seconds: l.used_seconds || 0 })));
      } else {
        // No apps configured yet - show empty state
        setLimits([]);
      }

      // 3. Fetch Reset Window
      const { data: windowData } = await supabase
        .from('reset_windows')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (windowData) {
        setResetWindow(windowData);
      }
    } catch (err: any) {
      console.warn('[Dashboard Data Fetch Error]:', err);
    } finally {
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
  // 2. COUNTDOWN TIMER TO DAILY RESET
  // -----------------------------------------------------------------------
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const [resetHour, resetMinute] = (resetWindow.reset_time || '08:00:00')
        .split(':')
        .map(Number);

      const target = new Date();
      target.setHours(resetHour, resetMinute, 0, 0);

      // If reset time passed today, target tomorrow's reset
      if (now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 1);
      }

      const diffMs = target.getTime() - now.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(diffSec / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;

      setCountdownText(
        `${hours}h ${minutes < 10 ? '0' : ''}${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [resetWindow]);

  // Request notification permissions when dashboard mounts
  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  // -----------------------------------------------------------------------
  // 3. HARDWARE ENFORCEMENT & NOTIFICATION SIMULATION
  // -----------------------------------------------------------------------

  const handleLockApp = (appId: string) => {
    setLimits((prev) =>
      prev.map((a) => {
        if (a.id === appId) {
          const lockedApp = { ...a, used_seconds: a.daily_limit_seconds };
          notifyAppLocked(
            a.app_display_name,
            formatSeconds(a.daily_limit_seconds),
            resetWindow.reset_time?.slice(0, 5) || '08:00 AM'
          );
          return lockedApp;
        }
        return a;
      })
    );
  };

  const handleAddUsage = async (appId: string, secondsToAdd: number = 900) => {
    // Optimistic local update first
    let finalUsed = 0;

    setLimits((prev) =>
      prev.map((a) => {
        if (a.id === appId) {
          const prevUsed = a.used_seconds || 0;
          const newUsed = Math.min(a.daily_limit_seconds, prevUsed + secondsToAdd);
          const remaining = a.daily_limit_seconds - newUsed;
          finalUsed = newUsed;

          if (remaining <= 0) {
            notifyAppLocked(
              a.app_display_name,
              formatSeconds(a.daily_limit_seconds),
              resetWindow.reset_time?.slice(0, 5) || '08:00'
            );
          } else if (remaining <= 600 && prevUsed < a.daily_limit_seconds - 600) {
            notifyAppWarning(a.app_display_name, formatSeconds(remaining));
          } else {
            playLightFeedback();
          }

          return { ...a, used_seconds: newUsed };
        }
        return a;
      })
    );

    // Persist to Supabase
    try {
      const { error } = await supabase
        .from('app_limits')
        .update({ used_seconds: finalUsed, updated_at: new Date().toISOString() })
        .eq('id', appId);

      if (error) {
        console.warn('[Usage sync]', error.message);
      }
    } catch (err) {
      console.warn('[Usage sync error]', err);
    }
  };

  const handleResetAppUsage = async (appId: string) => {
    playSuccessFeedback();
    // Optimistic
    setLimits((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, used_seconds: 0 } : a))
    );
    showToast('App allowance reset.', 'info');

    // Persist to Supabase
    try {
      const { error } = await supabase
        .from('app_limits')
        .update({ used_seconds: 0, updated_at: new Date().toISOString() })
        .eq('id', appId);

      if (error) {
        console.warn('[Reset usage sync]', error.message);
      }
    } catch (err) {
      console.warn('[Reset usage sync error]', err);
    }
  };

  // -----------------------------------------------------------------------
  // REALTIME SYNCHRONIZATION: App Limits & Reset Windows
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!profile?.id) return;

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
                    l.app_bundle_id === item.app_bundle_id ? { ...l, ...item } : l
                  );
                }
                return [...prev, { ...item, used_seconds: 0 }];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const item = payload.new as AppLimitItem;
            setLimits((prev) => {
              if (!item.is_active) {
                return prev.filter((l) => l.app_bundle_id !== item.app_bundle_id);
              }
              return prev.map((l) =>
                l.app_bundle_id === item.app_bundle_id
                  ? { ...l, ...item, used_seconds: l.used_seconds || 0 }
                  : l
              );
            });
          } else if (payload.eventType === 'DELETE') {
            const oldItem = payload.old as { id: string };
            if (oldItem?.id) {
              setLimits((prev) => prev.filter((l) => l.id !== oldItem.id));
            }
          }
        }
      )
      .subscribe();

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
          if (payload.new) {
            setResetWindow(payload.new as ResetWindowConfig);
          }
        }
      )
      .subscribe();

    // Realtime subscription: used_seconds updates from other devices/backend
    const usageChannel = supabase
      .channel(`realtime-usage-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_limits',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const updated = payload.new as AppLimitItem;
          if (typeof updated.used_seconds === 'number') {
            setLimits((prev) =>
              prev.map((l) =>
                l.id === updated.id
                  ? { ...l, used_seconds: updated.used_seconds }
                  : l
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(limitsChannel);
      supabase.removeChannel(windowChannel);
      supabase.removeChannel(usageChannel);
    };
  }, [profile?.id]);

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

  const handleTestLockNotification = (targetApp?: AppLimitItem) => {
    const target = targetApp || limits[0];
    if (!target) {
      showToast('No restricted apps configured yet. Tap + Select Application below to add one.', 'info');
      return;
    }
    handleLockApp(target.id);
  };

  const handleTestWarningNotification = (targetApp?: AppLimitItem) => {
    const target = targetApp || limits[0];
    if (!target) {
      showToast('No restricted apps configured yet. Tap + Select Application below to add one.', 'info');
      return;
    }
    notifyAppWarning(target.app_display_name, '5m 00s');
  };

  const handleTestResetNotification = () => {
    setLimits((prev) => prev.map((l) => ({ ...l, used_seconds: 0 })));
    notifyDailyReset(resetWindow.reset_time?.slice(0, 5) || '08:00 AM');
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

  // Total daily usage across all apps
  const totalLimitSec = limits.reduce((acc, l) => acc + l.daily_limit_seconds, 0);
  const totalUsedSec = limits.reduce((acc, l) => acc + (l.used_seconds || 0), 0);
  const totalProgress = totalLimitSec > 0 ? Math.min(1, totalUsedSec / totalLimitSec) : 0;

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
              }}
              tintColor={colors.accent}
            />
          }
        >
          {/* ------------------------------------------------------------- */}
          {/* TAB 1: HOME (Dashboard) */}
          {/* ------------------------------------------------------------- */}
          {/* ------------------------------------------------------------- */}
          {/* TAB 1: HOME (Dashboard) */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'home' && (
            <AnimatedTabContent key="home">
              <View style={styles.tabContent}>

                {/* Greeting */}
                <StaggerItem index={0} totalDelay={70}>
                  <View style={styles.greetingBlock}>
                    <Text style={styles.greetingEyebrow}>
                      {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'} 👋
                    </Text>
                    <Text style={styles.greetingTitle}>
                      {profile?.display_name || (profile?.username ? profile.username : 'Welcome')}
                    </Text>
                  </View>
                </StaggerItem>

                {/* Hero card */}
                <StaggerItem index={1} totalDelay={70}>
                  <View style={styles.heroCard}>
                    <View style={styles.heroHeader}>
                      <Text style={styles.heroHeaderTitle}>Daily Allowance</Text>
                      <Text style={styles.resetLabel}>Daily Reset in</Text>
                    </View>

                    <Text style={styles.timerDisplay}>{countdownText || 'Calculating...'}</Text>
                    <Text style={styles.timerSub}>
                      Next reset at {resetWindow.reset_time?.slice(0, 5)} {resetWindow.timezone}
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

                <StaggerItem index={2} totalDelay={70}>
                  <View style={styles.sectionHeaderRow}>
                    <View>
                      <Text style={styles.sectionHeading}>Restricted Apps</Text>
                      <Text style={styles.sectionSubtext}>
                        Tap any app to simulate usage & test notifications
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        playLightFeedback();
                        setActiveTab('limits');
                      }}
                    >
                      <Text style={styles.sectionLink}>Manage all ({limits.length})</Text>
                    </TouchableOpacity>
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
                        onAddUsage={handleAddUsage}
                        onLockApp={handleLockApp}
                        onResetUsage={handleResetAppUsage}
                      />
                    ))
                  )}
                </View>

                {/* Philosophy Banner */}
                <View style={styles.quoteCard}>
                  <Text style={styles.quoteTitle}>Anti-Impulse Rule</Text>
                  <Text style={styles.quoteText}>
                    "Decide your screen time before distraction takes over. Active limits cannot be extended once set."
                  </Text>
                </View>
              </View>
            </AnimatedTabContent>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 2: LIMITS (Per-App Enforcement) */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'limits' && (
            <AnimatedTabContent key="limits">
              <View style={styles.tabContent}>
                <View style={styles.tabHeader}>
                  <Text style={styles.tabHeading}>App Limits</Text>
                  <Text style={styles.tabSubheading}>
                    Configure per-app daily allowances enforced by FocusLock hardware rules.
                  </Text>
                </View>

                {/* HARDWARE SIMULATION & NOTIFICATION TEST BANNER */}
                <View style={styles.testNotificationCard}>
                  <View style={styles.testHeaderRow}>
                    <View style={styles.testIconPill}>
                      <Text style={styles.testIconPillText}>TEST NOTIFICATIONS & RESTRICTIONS</Text>
                    </View>
                  </View>
                  <Text style={styles.testCardTitle}>Hardware Enforcement Simulation</Text>
                  <Text style={styles.testCardSub}>
                    Trigger push and in-app alerts with the FocusLock logo and audio chime to test alerts:
                  </Text>
                  <View style={styles.testButtonsRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleTestLockNotification()}
                      style={[styles.testBtn, styles.testBtnLock]}
                    >
                      <Text style={styles.testBtnText}>Lock App Alert</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleTestWarningNotification()}
                      style={[styles.testBtn, styles.testBtnWarning]}
                    >
                      <Text style={styles.testBtnText}>5m Warning</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleTestResetNotification()}
                      style={[styles.testBtn, styles.testBtnReset]}
                    >
                      <Text style={styles.testBtnText}>Daily Reset</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Add New App Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    playLightFeedback();
                    setShowAddModal(true);
                  }}
                  style={styles.addBtn}
                >
                  <Text style={styles.addBtnText}>+ Select Application to Limit</Text>
                </TouchableOpacity>

                <View style={styles.appsList}>
                  {limits.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <View style={styles.emptyIconBadge}>
                        <Image source={require('../../assets/lock.svg')} style={styles.emptyLockImg} contentFit="contain" />
                      </View>
                      <Text style={styles.emptyTitle}>Zero Distractions Configured</Text>
                      <Text style={styles.emptySub}>
                        Protect your time by selecting applications on this device to enforce daily screen-time limits.
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          playLightFeedback();
                          setShowAddModal(true);
                        }}
                        style={styles.emptyAddBtn}
                      >
                        <Text style={styles.emptyAddBtnText}>+ Choose from Installed Apps</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    limits.map((app, idx) => (
                      <AnimatedLimitConfigCard
                        key={app.id}
                        app={app}
                        index={idx}
                        formatSeconds={formatSeconds}
                        onAddUsage={handleAddUsage}
                        onLockApp={handleLockApp}
                        onResetUsage={handleResetAppUsage}
                        onDeleteLimit={handleDeleteLimit}
                      />
                    ))
                  )}
                </View>
              </View>
            </AnimatedTabContent>
          )}

          {/* ------------------------------------------------------------- */}
          {/* TAB 3: SCHEDULE (Daily Reset Window) */}
          {/* ------------------------------------------------------------- */}
          {activeTab === 'schedule' && (
            <AnimatedTabContent key="schedule">
              <View style={styles.tabContent}>
                <View style={styles.tabHeader}>
                  <Text style={styles.tabHeading}>Reset Schedule</Text>
                  <Text style={styles.tabSubheading}>
                    Your daily reset occurs at the scheduled time. A 20-minute pre-reset window lets
                    you set tomorrow's limits.
                  </Text>
                </View>

                <View style={styles.scheduleCard}>
                  <Text style={styles.scheduleCardTitle}>Current Daily Reset</Text>
                  <Text style={styles.scheduleTimeLarge}>
                    {resetWindow.reset_time?.slice(0, 5) || '08:00'}
                  </Text>
                  <Text style={styles.scheduleTimezone}>Timezone: {resetWindow.timezone}</Text>

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

                {/* Quick Action to adjust Reset Time */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    playLightFeedback();
                    setShowAddModal(true);
                  }}
                  style={styles.scheduleActionBtn}
                >
                  <Text style={styles.scheduleActionBtnText}>Adjust Daily Schedule & Limits</Text>
                </TouchableOpacity>

                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Why can't I edit limits anytime?</Text>
                  <Text style={styles.infoBody}>
                    FocusLock is powered by discipline, not willpower. By only permitting adjustments
                    during the calm pre-reset window, you make decisions before impulsivity takes over.
                  </Text>
                </View>
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
                <Text style={styles.settingsFooter}>FocusLock v1.0.0 · WaiyatLabs</Text>
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
  },
  tabContent: {
    gap: S.lg,
  },

  // ─── Greeting ──────────────────────────────────────────────────────────────
  greetingBlock: {
    marginBottom: 4,
    paddingTop: 4,
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
  greetingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.7,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.4,
  },
  sectionSubtext: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionLink: {
    color: C.accent,
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
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.22)',
  },
  appCardWarningState: {
    backgroundColor: C.warningDim,
    borderColor: 'rgba(251,191,36,0.22)',
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
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.28)',
  },
  badgeWarning: {
    backgroundColor: C.warningDim,
    borderColor: 'rgba(251,191,36,0.28)',
  },
  badgeText: {
    color: C.success,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextLocked: {
    color: C.danger,
  },
  badgeTextWarning: {
    color: C.warning,
  },
  cardProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 10,
  },
  cardProgressFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 2,
  },
  cardProgressFillLocked: {
    backgroundColor: C.danger,
  },
  cardProgressFillWarning: {
    backgroundColor: C.warning,
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
  drawerBtnLock: {
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.30)',
  },
  drawerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textPrimary,
  },
  drawerBtnTextLock: {
    color: C.danger,
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
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.22)',
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
    borderColor: 'rgba(59,130,246,0.22)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    flexShrink: 0,
    marginLeft: 6,
  },
  limitPillText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  limitPillLocked: {
    backgroundColor: C.dangerDim,
    borderColor: 'rgba(248,113,113,0.28)',
    borderWidth: 1,
  },
  limitPillTextLocked: {
    color: C.danger,
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

  // ─── Notification Test Card ────────────────────────────────────────────────
  testNotificationCard: {
    backgroundColor: C.bgCard,
    borderRadius: R.xl,
    padding: S.lg,
    marginBottom: S.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...cardShadow,
  },
  testHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: S.sm,
  },
  testIconPill: {
    backgroundColor: 'rgba(132,204,22,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(132,204,22,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  testIconPillText: {
    color: '#86EFAC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
  },
  testCardTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  testCardSub: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: S.md,
  },
  testButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testBtn: {
    flex: 1,
    borderRadius: R.md,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testBtnLock: {
    backgroundColor: 'rgba(248,113,113,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  testBtnWarning: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.30)',
  },
  testBtnReset: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  testBtnText: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: '700',
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
    color: '#FFFFFF',
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
    color: C.accent,
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    color: C.accent,
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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
    color: C.accent,
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
