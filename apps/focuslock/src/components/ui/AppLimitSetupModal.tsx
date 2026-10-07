import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { getNotificationPermissionStatus, requestNotificationPermissions } from '../../lib/notifications';
import { playSelectionFeedback, playLightFeedback, playErrorFeedback, playSuccessFeedback } from '../../lib/feedback';
import { supabase } from '../../lib/supabase';
import { AppIcon } from '../../lib/appIcons';

export interface InstalledAppItem {
  id: string;
  name: string;
  bundleId: string;
  category: 'Social' | 'Video' | 'Chat' | 'Games' | 'Web' | 'Other';
  badgeCode: string;
  color: string;
  urlScheme?: string;
  isPopular?: boolean;
}

// Built-in verified application catalog matching device operating systems
export const DEVICE_APP_CATALOG: InstalledAppItem[] = [
  // Social Media
  { id: 'instagram', name: 'Instagram', bundleId: Platform.OS === 'ios' ? 'com.burbn.instagram' : 'com.instagram.android', category: 'Social', badgeCode: 'IG', color: '#E1306C', urlScheme: 'instagram://', isPopular: true },
  { id: 'tiktok', name: 'TikTok', bundleId: Platform.OS === 'ios' ? 'com.zhiliaoapp.musically' : 'com.zhiliaoapp.musically', category: 'Social', badgeCode: 'TT', color: '#09090b', urlScheme: 'snssdk1233://', isPopular: true },
  { id: 'x_twitter', name: 'X / Twitter', bundleId: Platform.OS === 'ios' ? 'com.atebits.Tweetie2' : 'com.twitter.android', category: 'Social', badgeCode: 'X', color: '#0f1419', urlScheme: 'twitter://', isPopular: true },
  { id: 'facebook', name: 'Facebook', bundleId: Platform.OS === 'ios' ? 'com.facebook.Facebook' : 'com.facebook.katana', category: 'Social', badgeCode: 'FB', color: '#1877F2', urlScheme: 'fb://' },
  { id: 'snapchat', name: 'Snapchat', bundleId: Platform.OS === 'ios' ? 'com.toyopagroup.picaboo' : 'com.snapchat.android', category: 'Social', badgeCode: 'SC', color: '#EAB308', urlScheme: 'snapchat://', isPopular: true },
  { id: 'reddit', name: 'Reddit', bundleId: Platform.OS === 'ios' ? 'com.reddit.Reddit' : 'com.reddit.frontpage', category: 'Social', badgeCode: 'RD', color: '#FF4500', urlScheme: 'reddit://', isPopular: true },
  { id: 'threads', name: 'Threads', bundleId: Platform.OS === 'ios' ? 'com.burbn.threads' : 'com.instagram.barcelona', category: 'Social', badgeCode: 'TH', color: '#09090b', urlScheme: 'barcelona://' },
  { id: 'pinterest', name: 'Pinterest', bundleId: Platform.OS === 'ios' ? 'pinterest' : 'com.pinterest', category: 'Social', badgeCode: 'PIN', color: '#E60023', urlScheme: 'pinterest://' },
  { id: 'linkedin', name: 'LinkedIn', bundleId: Platform.OS === 'ios' ? 'com.linkedin.LinkedIn' : 'com.linkedin.android', category: 'Social', badgeCode: 'IN', color: '#0A66C2', urlScheme: 'linkedin://' },

  // Video & Entertainment
  { id: 'youtube', name: 'YouTube', bundleId: Platform.OS === 'ios' ? 'com.google.ios.youtube' : 'com.google.android.youtube', category: 'Video', badgeCode: 'YT', color: '#DC2626', urlScheme: 'youtube://', isPopular: true },
  { id: 'netflix', name: 'Netflix', bundleId: Platform.OS === 'ios' ? 'com.netflix.Netflix' : 'com.netflix.mediaclient', category: 'Video', badgeCode: 'NFLX', color: '#E50914', urlScheme: 'nflx://', isPopular: true },
  { id: 'twitch', name: 'Twitch', bundleId: Platform.OS === 'ios' ? 'tv.twitch' : 'tv.twitch.android.app', category: 'Video', badgeCode: 'TW', color: '#9146FF', urlScheme: 'twitch://' },
  { id: 'disney_plus', name: 'Disney+', bundleId: Platform.OS === 'ios' ? 'com.disney.disneyplus' : 'com.disney.disneyplus', category: 'Video', badgeCode: 'D+', color: '#113CCF' },
  { id: 'spotify', name: 'Spotify', bundleId: Platform.OS === 'ios' ? 'com.spotify.client' : 'com.spotify.music', category: 'Video', badgeCode: 'SP', color: '#1DB954', urlScheme: 'spotify://' },

  // Messaging & Chat
  { id: 'whatsapp', name: 'WhatsApp', bundleId: Platform.OS === 'ios' ? 'net.whatsapp.WhatsApp' : 'com.whatsapp', category: 'Chat', badgeCode: 'WA', color: '#16A34A', urlScheme: 'whatsapp://', isPopular: true },
  { id: 'telegram', name: 'Telegram', bundleId: Platform.OS === 'ios' ? 'ph.telegra.Telegraph' : 'org.telegram.messenger', category: 'Chat', badgeCode: 'TG', color: '#24A1DE', urlScheme: 'tg://' },
  { id: 'discord', name: 'Discord', bundleId: Platform.OS === 'ios' ? 'com.hammerandchisel.discord' : 'com.discord', category: 'Chat', badgeCode: 'DC', color: '#5865F2', urlScheme: 'discord://', isPopular: true },
  { id: 'messenger', name: 'Messenger', bundleId: Platform.OS === 'ios' ? 'com.facebook.Messenger' : 'com.facebook.orca', category: 'Chat', badgeCode: 'MSG', color: '#00B2FF', urlScheme: 'fb-messenger://' },

  // Gaming
  { id: 'roblox', name: 'Roblox', bundleId: Platform.OS === 'ios' ? 'com.roblox.robloxmobile' : 'com.roblox.client', category: 'Games', badgeCode: 'RBX', color: '#18181b' },
  { id: 'subway_surfers', name: 'Subway Surfers', bundleId: Platform.OS === 'ios' ? 'com.kiloo.subwaysurfers' : 'com.kiloo.subwaysurf', category: 'Games', badgeCode: 'SUB', color: '#F59E0B' },
  { id: 'candy_crush', name: 'Candy Crush', bundleId: Platform.OS === 'ios' ? 'com.midasplayer.apps.candycrushsaga' : 'com.king.candycrushsaga', category: 'Games', badgeCode: 'CC', color: '#EC4899' },
  { id: 'pubg', name: 'PUBG Mobile', bundleId: Platform.OS === 'ios' ? 'com.tencent.ig' : 'com.tencent.ig', category: 'Games', badgeCode: 'PUBG', color: '#D97706' },

  // Browsers & Web
  { id: 'chrome', name: 'Google Chrome', bundleId: Platform.OS === 'ios' ? 'com.google.chrome.ios' : 'com.android.chrome', category: 'Web', badgeCode: 'CHR', color: '#4285F4', urlScheme: 'googlechrome://', isPopular: true },
  { id: 'safari', name: 'Safari', bundleId: 'com.apple.mobilesafari', category: 'Web', badgeCode: 'SF', color: '#007AFF' },
  { id: 'firefox', name: 'Firefox', bundleId: Platform.OS === 'ios' ? 'org.mozilla.ios.Fennec' : 'org.mozilla.firefox', category: 'Web', badgeCode: 'FF', color: '#FF7139', urlScheme: 'firefox://' },
  { id: 'brave', name: 'Brave Browser', bundleId: Platform.OS === 'ios' ? 'com.brave.ios.browser' : 'com.brave.browser', category: 'Web', badgeCode: 'BRV', color: '#FB542B', urlScheme: 'brave://' },
];

interface AppLimitSetupModalProps {
  visible: boolean;
  onClose: () => void;
  existingBundleIds: string[];
  currentResetTime?: string;
  onSuccess: (savedLimit: any) => void;
  showToast: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

export function AppLimitSetupModal({
  visible,
  onClose,
  existingBundleIds,
  currentResetTime = '08:00:00',
  onSuccess,
  showToast,
}: AppLimitSetupModalProps) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // Step 1: App Selection & Permissions
  const [selectedCategory, setSelectedCategory] = useState<string>('Installed');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<InstalledAppItem | null>(null);
  const [isCustomApp, setIsCustomApp] = useState(false);
  const [customAppName, setCustomAppName] = useState('');
  const [customBundleId, setCustomBundleId] = useState('');
  const [permissionGranted, setPermissionGranted] = useState<boolean>(true);
  const [notificationStatus, setNotificationStatus] = useState<'granted' | 'denied' | 'checking'>('granted');

  // Step 2: Time Limit
  const [limitHours, setLimitHours] = useState<number>(1);
  const [limitMinutes, setLimitMinutes] = useState<number>(0);

  // Step 3: Daily Reset
  const [resetHour, setResetHour] = useState<number>(parseInt(currentResetTime.slice(0, 2), 10) || 8);
  const [resetMinute, setResetMinute] = useState<number>(parseInt(currentResetTime.slice(3, 5), 10) || 0);
  const [preResetWindowMinutes, setPreResetWindowMinutes] = useState<number>(20);

  // Step 4: Strictness & Notifications
  const [strictness, setStrictness] = useState<'standard' | 'strict' | 'extreme'>('standard');
  const [enableWarningNotif, setEnableWarningNotif] = useState(true);
  const [enableLockNotif, setEnableLockNotif] = useState(true);
  const [enableResetWindowNotif, setEnableResetWindowNotif] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation values
  const stepSlideAnim = useRef(new Animated.Value(0)).current;
  const stepFadeAnim = useRef(new Animated.Value(1)).current;

  const [detectedInstalledIds, setDetectedInstalledIds] = useState<Set<string>>(new Set());
  const [isScanningApps, setIsScanningApps] = useState(false);
  // Web-only: manual selection of apps the user has installed
  const [webManualIds, setWebManualIds] = useState<Set<string>>(new Set());

  // Check permissions & probe installed applications on device
  useEffect(() => {
    if (visible) {
      setCurrentStep(1);
      setSelectedApp(null);
      setIsCustomApp(false);
      setCustomAppName('');
      setCustomBundleId('');
      setLimitHours(1);
      setLimitMinutes(0);
      setResetHour(parseInt(currentResetTime.slice(0, 2), 10) || 8);
      setResetMinute(parseInt(currentResetTime.slice(3, 5), 10) || 0);

      // Verify notification status
      getNotificationPermissionStatus().then((status) => {
        setNotificationStatus(status === 'granted' ? 'granted' : 'denied');
      }).catch(() => {
        setNotificationStatus('granted');
      });

      if (Platform.OS === 'web') {
        // Browsers cannot probe custom URL schemes.
        // Pre-seed with popular apps so the Installed tab is useful immediately.
        // User can then toggle individual apps on/off.
        const popular = new Set(DEVICE_APP_CATALOG.filter((a) => a.isPopular).map((a) => a.id));
        setDetectedInstalledIds(popular);
        setWebManualIds(popular);
        setSelectedCategory('Installed');
        setIsScanningApps(false);
      } else {
        // Native: probe URL schemes
        let isMounted = true;
        setIsScanningApps(true);

        const probeInstalled = async () => {
          const detected = new Set<string>();
          for (const app of DEVICE_APP_CATALOG) {
            if (app.urlScheme) {
              try {
                const canOpen = await Linking.canOpenURL(app.urlScheme);
                if (canOpen) {
                  detected.add(app.id);
                }
              } catch {
                // Scheme not supported
              }
            }
          }
          if (isMounted) {
            setDetectedInstalledIds(detected);
            setIsScanningApps(false);
            // Auto-switch: show installed if found, fall back to All
            if (detected.size > 0) {
              setSelectedCategory('Installed');
            } else {
              setSelectedCategory('All');
            }
          }
        };

        probeInstalled();

        return () => {
          isMounted = false;
        };
      }
    }
  }, [visible, currentResetTime]);

  const animateStepTransition = (nextStep: WizardStep) => {
    Animated.parallel([
      Animated.timing(stepFadeAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(stepSlideAnim, {
        toValue: nextStep > currentStep ? -20 : 20,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentStep(nextStep);
      stepSlideAnim.setValue(nextStep > currentStep ? 20 : -20);
      Animated.parallel([
        Animated.timing(stepFadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(stepSlideAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Filtered applications
  const filteredApps = useMemo(() => {
    const list = DEVICE_APP_CATALOG.filter((app) => {
      const matchesCategory =
        selectedCategory === 'All'
          ? true
          : selectedCategory === 'Installed'
          ? detectedInstalledIds.has(app.id)
          : app.category === selectedCategory;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        app.name.toLowerCase().includes(q) ||
        app.bundleId.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });

    return list.sort((a, b) => {
      const aInstalled = detectedInstalledIds.has(a.id) ? 1 : 0;
      const bInstalled = detectedInstalledIds.has(b.id) ? 1 : 0;
      if (bInstalled !== aInstalled) return bInstalled - aInstalled;
      return a.name.localeCompare(b.name);
    });
  }, [selectedCategory, searchQuery, detectedInstalledIds]);

  const totalLimitSeconds = (limitHours * 3600) + (limitMinutes * 60);

  const formattedAllowance = useMemo(() => {
    if (limitHours === 0 && limitMinutes === 0) return '0 mins';
    const parts = [];
    if (limitHours > 0) parts.push(`${limitHours}h`);
    if (limitMinutes > 0) parts.push(`${limitMinutes}m`);
    return parts.join(' ');
  }, [limitHours, limitMinutes]);

  const formattedResetTime = useMemo(() => {
    const hh = resetHour < 10 ? `0${resetHour}` : `${resetHour}`;
    const mm = resetMinute < 10 ? `0${resetMinute}` : `${resetMinute}`;
    const period = resetHour >= 12 ? 'PM' : 'AM';
    const displayH = resetHour % 12 === 0 ? 12 : resetHour % 12;
    return `${displayH}:${mm} ${period} (${hh}:${mm}:00)`;
  }, [resetHour, resetMinute]);

  const handleSelectApp = (app: InstalledAppItem) => {
    playSelectionFeedback();
    setSelectedApp(app);
    setIsCustomApp(false);
  };

  const handleEnablePermission = async () => {
    playLightFeedback();
    if (notificationStatus !== 'granted') {
      const granted = await requestNotificationPermissions();
      setNotificationStatus(granted ? 'granted' : 'denied');
      if (granted) {
        showToast('Notification permission enabled!', 'success');
      }
    } else {
      showToast('Device Screen Time access is active.', 'info');
    }
  };

  const handleNextFromStep1 = () => {
    if (isCustomApp) {
      if (!customAppName.trim()) {
        playErrorFeedback();
        showToast('Please enter an Application Display Name', 'error');
        return;
      }
      if (!customBundleId.trim()) {
        playErrorFeedback();
        showToast('Please enter a valid Package or Bundle ID', 'error');
        return;
      }
      const customCode = customAppName.trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'APP';
      setSelectedApp({
        id: `custom-${Date.now()}`,
        name: customAppName.trim(),
        bundleId: customBundleId.trim(),
        category: 'Other',
        badgeCode: customCode,
        color: '#6366f1',
      });
    } else if (!selectedApp) {
      playErrorFeedback();
      showToast('Please tap to select an application to limit', 'error');
      return;
    }
    playLightFeedback();
    animateStepTransition(2);
  };

  const handleNextFromStep2 = () => {
    if (totalLimitSeconds < 300) {
      playErrorFeedback();
      showToast('Minimum allowance is 5 minutes', 'error');
      return;
    }
    playLightFeedback();
    animateStepTransition(3);
  };

  const handleNextFromStep3 = () => {
    playLightFeedback();
    animateStepTransition(4);
  };

  const handleNextFromStep4 = () => {
    playLightFeedback();
    animateStepTransition(5);
  };

  // Submit and save in Supabase Realtime
  const handleSaveAndActivate = async () => {
    if (!selectedApp) return;

    setIsSubmitting(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      if (!user) {
        showToast('Session expired. Please sign in again.', 'error');
        setIsSubmitting(false);
        return;
      }

      const formattedDbResetTime = `${resetHour < 10 ? '0' : ''}${resetHour}:${resetMinute < 10 ? '0' : ''}${resetMinute}:00`;

      // 1. Upsert App Limit in Supabase
      const { data: limitData, error: limitError } = await supabase
        .from('app_limits')
        .upsert(
          {
            user_id: user.id,
            app_bundle_id: selectedApp.bundleId,
            app_display_name: selectedApp.name,
            daily_limit_seconds: totalLimitSeconds,
            category: selectedApp.category,
            icon_emoji: selectedApp.badgeCode,
            strictness: strictness,
            is_active: true,
          },
          { onConflict: 'user_id,app_bundle_id' }
        )
        .select()
        .single();

      if (limitError) {
        console.error('[Supabase Error saving limit]:', limitError);
        showToast(`Failed to save: ${limitError.message}`, 'error');
        setIsSubmitting(false);
        return;
      }

      // 2. Update Reset Window in Supabase
      await supabase
        .from('reset_windows')
        .upsert(
          {
            user_id: user.id,
            reset_time: formattedDbResetTime,
            window_minutes: preResetWindowMinutes,
            repeat_type: 'daily',
            is_active: true,
          },
          { onConflict: 'user_id' }
        );

      // 3. Update notification preferences if needed
      await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: user.id,
            notify_on_limit_reached: enableLockNotif,
            notify_window_opening: enableResetWindowNotif,
          },
          { onConflict: 'user_id' }
        );

      playSuccessFeedback();
      showToast(`Enforcement activated for ${selectedApp.name}!`, 'success');
      onSuccess(limitData);
      onClose();
    } catch (err: any) {
      console.error('[AppLimitSetupModal Error]:', err);
      showToast(err.message || 'An unexpected error occurred', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          {/* Header with Step Tracker */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View>
                <Text style={styles.stepCounterText}>STEP {currentStep} OF 5</Text>
                <Text style={styles.headerTitle}>
                  {currentStep === 1 && 'Select Application'}
                  {currentStep === 2 && 'Set Daily Allowance'}
                  {currentStep === 3 && 'Daily Reset Time'}
                  {currentStep === 4 && 'Enforcement Rules'}
                  {currentStep === 5 && 'Review & Activate'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onClose}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Stepper Progress Bar */}
            <View style={styles.stepTrack}>
              {[1, 2, 3, 4, 5].map((step) => (
                <View
                  key={step}
                  style={[
                    styles.stepBar,
                    step <= currentStep && styles.stepBarActive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Animated Body Content */}
          <Animated.View
            style={[
              styles.contentBody,
              {
                opacity: stepFadeAnim,
                transform: [{ translateX: stepSlideAnim }],
              },
            ]}
          >
            {/* ----------------------------------------------------------- */}
            {/* STEP 1: SELECT INSTALLED APPLICATION */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 1 && (
              <View style={styles.stepContent}>
                {/* Device Permissions Status Banner */}
                <View style={styles.permissionCard}>
                  <View style={styles.permissionInfo}>
                    <Text style={styles.permissionTitle}>
                      {Platform.OS === 'ios' ? 'Apple Screen Time Access' : 'Android Usage Access'}
                    </Text>
                    <Text style={styles.permissionDesc}>
                      {notificationStatus === 'granted'
                        ? 'Enforcement layer & local alert channels active.'
                        : 'Grant notification & usage access to trigger lockout shields.'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={handleEnablePermission}
                    style={[
                      styles.permissionPill,
                      notificationStatus === 'granted'
                        ? styles.permissionPillGranted
                        : styles.permissionPillAction,
                    ]}
                  >
                    <Text
                      style={[
                        styles.permissionPillText,
                        notificationStatus === 'granted'
                          ? styles.permissionPillTextGranted
                          : styles.permissionPillTextAction,
                      ]}
                    >
                      {notificationStatus === 'granted' ? 'Authorized' : 'Enable'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <View style={styles.searchRow}>
                  <View style={styles.searchIconBadge}>
                    <Text style={styles.searchIconBadgeText}>FIND</Text>
                  </View>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search installed apps or bundle IDs..."
                    placeholderTextColor="#94a3b8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <Text style={styles.clearSearchText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Category Selector Chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScroll}
                >
                  {(detectedInstalledIds.size > 0
                    ? ['All', 'Installed', 'Social', 'Video', 'Chat', 'Games', 'Web']
                    : ['All', 'Social', 'Video', 'Chat', 'Games', 'Web']
                  ).map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      activeOpacity={0.75}
                      onPress={() => {
                        playSelectionFeedback();
                        setSelectedCategory(cat);
                        setIsCustomApp(false);
                      }}
                      style={[
                        styles.categoryChip,
                        selectedCategory === cat && !isCustomApp && styles.categoryChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          selectedCategory === cat && !isCustomApp && styles.categoryChipTextActive,
                        ]}
                      >
                        {cat === 'Installed' ? `Installed (${detectedInstalledIds.size})` : cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      playSelectionFeedback();
                      setIsCustomApp(true);
                      setSelectedApp(null);
                    }}
                    style={[
                      styles.categoryChip,
                      isCustomApp && styles.categoryChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isCustomApp && styles.categoryChipTextActive,
                      ]}
                    >
                      + Custom App
                    </Text>
                  </TouchableOpacity>
                </ScrollView>

                {/* Application Grid / List */}
                {!isCustomApp ? (
                  <ScrollView style={styles.appListScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.catalogHeading}>
                      {isScanningApps
                        ? '🔍 SCANNING YOUR DEVICE FOR APPS...'
                        : selectedCategory === 'Installed'
                        ? `INSTALLED APPS (${detectedInstalledIds.size} FOUND ON THIS DEVICE)`
                        : `AVAILABLE APPLICATIONS (${filteredApps.length})`}
                    </Text>

                    {Platform.OS === 'web' && (
                      <View style={styles.webTestingBanner}>
                        <Text style={styles.webTestingText}>
                          🌐 Web Preview: Simulating installed apps for rapid browser testing. On physical devices, FocusLock probes real installed packages.
                        </Text>
                      </View>
                    )}

                    {/* Scanning skeleton */}
                    {isScanningApps && (
                      <View style={styles.scanSkeletonContainer}>
                        {[...Array(6)].map((_, i) => (
                          <View key={i} style={styles.scanSkeletonRow}>
                            <View style={styles.scanSkeletonIcon} />
                            <View style={styles.scanSkeletonTextWrap}>
                              <View style={[styles.scanSkeletonLine, { width: `${55 + (i % 3) * 15}%` }]} />
                              <View style={[styles.scanSkeletonLine, { width: '40%', opacity: 0.5, marginTop: 4 }]} />
                            </View>
                          </View>
                        ))}
                        <Text style={styles.scanHint}>Checking which apps are installed on your device…</Text>
                      </View>
                    )}

                    {/* Empty state when Installed tab has no results */}
                    {!isScanningApps && selectedCategory === 'Installed' && filteredApps.length === 0 && (
                      <View style={styles.emptyInstalled}>
                        <Text style={styles.emptyInstalledIcon}>📱</Text>
                        <Text style={styles.emptyInstalledTitle}>No matching apps detected</Text>
                        <Text style={styles.emptyInstalledSub}>Switch to "All" to browse the full catalog, or use Custom App to add one manually.</Text>
                      </View>
                    )}
                    {!isScanningApps && (
                    <View style={styles.appListGrid}>
                      {filteredApps.map((app) => {
                        const isSelected = selectedApp?.id === app.id;
                        const isAlreadyLimited = existingBundleIds.includes(app.bundleId);
                        const isDetectedOnDevice = detectedInstalledIds.has(app.id);

                        return (
                          <TouchableOpacity
                            key={app.id}
                            activeOpacity={0.8}
                            onPress={() => handleSelectApp(app)}
                            style={[
                              styles.appSelectCard,
                              isSelected && styles.appSelectCardActive,
                              isAlreadyLimited && styles.appSelectCardAlready,
                            ]}
                          >
                            <AppIcon
                              bundleId={app.bundleId}
                              appName={app.name}
                              appId={app.id}
                              size={44}
                              fallbackBadge={app.badgeCode}
                              fallbackColor={app.color}
                            />

                            <View style={styles.appDetailsCol}>
                              <View style={styles.appNameRow}>
                                <Text style={styles.appTitle}>{app.name}</Text>
                                {isDetectedOnDevice && (
                                  <View style={styles.installedBadge}>
                                    <Text style={styles.installedBadgeText}>On Device</Text>
                                  </View>
                                )}
                                {isAlreadyLimited && (
                                  <View style={styles.alreadyBadge}>
                                    <Text style={styles.alreadyBadgeText}>Limited</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.appBundleSub} numberOfLines={1}>
                                {app.bundleId}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.radioCircle,
                                isSelected && styles.radioCircleSelected,
                              ]}
                            >
                              {isSelected && <View style={styles.radioDot} />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    )}
                  </ScrollView>
                ) : (
                  /* Custom App Manual Entry */
                  <View style={styles.customAppBox}>
                    <Text style={styles.customAppTitle}>Custom Application Specification</Text>
                    <Text style={styles.customAppSub}>
                      Specify any system or sideloaded package identifier on this device.
                    </Text>

                    <Text style={styles.inputLabel}>Application Name</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Duolingo or Kindle"
                      placeholderTextColor="#94a3b8"
                      value={customAppName}
                      onChangeText={setCustomAppName}
                    />

                    <Text style={styles.inputLabel}>Package / Bundle Identifier</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. com.duolingo or com.amazon.kindle"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="none"
                      value={customBundleId}
                      onChangeText={setCustomBundleId}
                    />
                  </View>
                )}
              </View>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 2: SET DAILY TIME LIMIT */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 2 && selectedApp && (
              <View style={styles.stepContent}>
                {/* Selected App Header */}
                <View style={styles.selectedBanner}>
                  <AppIcon
                    bundleId={selectedApp.bundleId}
                    appName={selectedApp.name}
                    appId={selectedApp.id}
                    size={44}
                    fallbackBadge={selectedApp.badgeCode}
                    fallbackColor={selectedApp.color}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedAppName}>{selectedApp.name}</Text>
                    <Text style={styles.selectedAppBundle}>{selectedApp.bundleId}</Text>
                  </View>
                  <View style={styles.badgePill}>
                    <Text style={styles.badgePillText}>{selectedApp.category}</Text>
                  </View>
                </View>

                {/* Big Time Display */}
                <View style={styles.timeDisplayCard}>
                  <Text style={styles.timeDisplayLabel}>DAILY ALLOWANCE</Text>
                  <Text style={styles.timeDisplayValue}>{formattedAllowance}</Text>
                  <Text style={styles.timeDisplaySub}>
                    {totalLimitSeconds.toLocaleString()} seconds per 24-hour cycle
                  </Text>
                </View>

                {/* Quick Presets */}
                <Text style={styles.presetsHeading}>QUICK PRESETS</Text>
                <View style={styles.presetsGrid}>
                  {[
                    { label: '15m', h: 0, m: 15 },
                    { label: '30m', h: 0, m: 30 },
                    { label: '45m', h: 0, m: 45 },
                    { label: '1 hour', h: 1, m: 0 },
                    { label: '1h 30m', h: 1, m: 30 },
                    { label: '2 hours', h: 2, m: 0 },
                    { label: '3 hours', h: 3, m: 0 },
                    { label: '4 hours', h: 4, m: 0 },
                  ].map((preset) => {
                    const isSelected = limitHours === preset.h && limitMinutes === preset.m;
                    return (
                      <TouchableOpacity
                        key={preset.label}
                        activeOpacity={0.75}
                        onPress={() => {
                          playSelectionFeedback();
                          setLimitHours(preset.h);
                          setLimitMinutes(preset.m);
                        }}
                        style={[
                          styles.presetChip,
                          isSelected && styles.presetChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isSelected && styles.presetChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Steppers */}
                <View style={styles.stepperContainer}>
                  <View style={styles.stepperCol}>
                    <Text style={styles.stepperLabel}>Hours</Text>
                    <View style={styles.stepperControls}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setLimitHours((prev) => Math.max(0, prev - 1));
                        }}
                        style={styles.stepperBtn}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{limitHours}h</Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setLimitHours((prev) => Math.min(12, prev + 1));
                        }}
                        style={styles.stepperBtn}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.stepperCol}>
                    <Text style={styles.stepperLabel}>Minutes</Text>
                    <View style={styles.stepperControls}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setLimitMinutes((prev) => (prev <= 0 ? 55 : prev - 5));
                        }}
                        style={styles.stepperBtn}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{limitMinutes}m</Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setLimitMinutes((prev) => (prev >= 55 ? 0 : prev + 5));
                        }}
                        style={styles.stepperBtn}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Philosophy rule explanation */}
                <View style={styles.ruleNotice}>
                  <View style={styles.ruleNoticeBadge}>
                    <Text style={styles.ruleNoticeBadgeText}>RULE</Text>
                  </View>
                  <Text style={styles.ruleNoticeText}>
                    Usage is cumulative across all sessions. Once {formattedAllowance} is reached,
                    the application will be locked until the daily reset.
                  </Text>
                </View>
              </View>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 3: SET DAILY RESET TIME */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 3 && (
              <View style={styles.stepContent}>
                <View style={styles.resetHeaderCard}>
                  <Text style={styles.timeDisplayLabel}>DAILY RESET SCHEDULE</Text>
                  <Text style={styles.resetLargeTime}>{formattedResetTime}</Text>
                  <Text style={styles.resetCardSub}>
                    All restricted apps refresh their allowance every 24 hours at this exact time.
                  </Text>
                </View>

                {/* Preset Reset Times */}
                <Text style={styles.presetsHeading}>CHOOSE RESET SCHEDULE</Text>
                <View style={styles.resetPresetsList}>
                  {[
                    { label: '05:00 AM', title: 'Early Riser (Recommended)', desc: 'Resets before morning activities start', h: 5, m: 0 },
                    { label: '08:00 AM', title: 'Standard Morning', desc: 'Resets at start of workday', h: 8, m: 0 },
                    { label: '12:00 AM', title: 'Midnight Reset', desc: 'Resets at the start of calendar day', h: 0, m: 0 },
                  ].map((item) => {
                    const isSelected = resetHour === item.h && resetMinute === item.m;
                    return (
                      <TouchableOpacity
                        key={item.label}
                        activeOpacity={0.8}
                        onPress={() => {
                          playSelectionFeedback();
                          setResetHour(item.h);
                          setResetMinute(item.m);
                        }}
                        style={[
                          styles.resetOptionCard,
                          isSelected && styles.resetOptionCardActive,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={styles.resetOptionRow}>
                            <Text style={styles.resetOptionLabel}>{item.label}</Text>
                            <Text style={styles.resetOptionTitle}>• {item.title}</Text>
                          </View>
                          <Text style={styles.resetOptionDesc}>{item.desc}</Text>
                        </View>
                        <View
                          style={[
                            styles.radioCircle,
                            isSelected && styles.radioCircleSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioDot} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Pre-reset 20-minute window */}
                <View style={styles.windowCard}>
                  <View style={styles.windowCardHeader}>
                    <Text style={styles.windowCardIcon}>⏱️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.windowCardTitle}>20-Minute Pre-Reset Window</Text>
                      <Text style={styles.windowCardDesc}>
                        FocusLock unlocks editing for 20 minutes before reset so you can plan tomorrow's
                        allowance without impulse decisions.
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 4: ENFORCEMENT & SHIELDING RULES */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 4 && (
              <View style={styles.stepContent}>
                <Text style={styles.presetsHeading}>SELECT ENFORCEMENT STRICTNESS</Text>

                <View style={styles.strictnessGrid}>
                  {[
                    {
                      key: 'standard' as const,
                      title: 'Standard Shield',
                      badge: 'RECOMMENDED',
                      desc: 'Sends 10m warning before lock. Enforces hardware shield when limit is consumed.',
                    },
                    {
                      key: 'strict' as const,
                      title: 'Strict Lock',
                      badge: 'DISCIPLINED',
                      desc: 'Sends 10m and 5m warnings. Immediate lock with no extensions allowed until daily reset.',
                    },
                    {
                      key: 'extreme' as const,
                      title: 'Extreme Discipline',
                      badge: 'MAXIMUM',
                      desc: 'Hard lockout shield with persistent system alert banners and zero override window.',
                    },
                  ].map((level) => {
                    const isSelected = strictness === level.key;
                    return (
                      <TouchableOpacity
                        key={level.key}
                        activeOpacity={0.8}
                        onPress={() => {
                          playSelectionFeedback();
                          setStrictness(level.key);
                        }}
                        style={[
                          styles.strictnessCard,
                          isSelected && styles.strictnessCardActive,
                        ]}
                      >
                        <View style={styles.strictnessTopRow}>
                          <Text style={styles.strictnessTitle}>{level.title}</Text>
                          <View
                            style={[
                              styles.strictnessBadge,
                              isSelected && styles.strictnessBadgeActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.strictnessBadgeText,
                                isSelected && styles.strictnessBadgeTextActive,
                              ]}
                            >
                              {level.badge}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.strictnessDesc}>{level.desc}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Notifications Toggles */}
                <Text style={styles.presetsHeading}>NOTIFICATIONS & ALERTS</Text>
                <View style={styles.notifTogglesBox}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      playLightFeedback();
                      setEnableWarningNotif(!enableWarningNotif);
                    }}
                    style={styles.notifToggleRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifToggleTitle}>Approaching Limit Warning</Text>
                      <Text style={styles.notifToggleSub}>Alerts you 10 minutes before lockout</Text>
                    </View>
                    <View
                      style={[
                        styles.toggleSwitch,
                        enableWarningNotif && styles.toggleSwitchOn,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleKnob,
                          enableWarningNotif && styles.toggleKnobOn,
                        ]}
                      />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      playLightFeedback();
                      setEnableLockNotif(!enableLockNotif);
                    }}
                    style={styles.notifToggleRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifToggleTitle}>Limit Reached Lockout Alert</Text>
                      <Text style={styles.notifToggleSub}>Sounds alert when app is shielded</Text>
                    </View>
                    <View
                      style={[
                        styles.toggleSwitch,
                        enableLockNotif && styles.toggleSwitchOn,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleKnob,
                          enableLockNotif && styles.toggleKnobOn,
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 5: REVIEW & ACTIVATE */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 5 && selectedApp && (
              <View style={styles.stepContent}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryBadge}>SUMMARY & CONFIRMATION</Text>

                  {/* App info */}
                  <View style={styles.summaryRow}>
                    <AppIcon
                      bundleId={selectedApp.bundleId}
                      appName={selectedApp.name}
                      appId={selectedApp.id}
                      size={44}
                      fallbackBadge={selectedApp.badgeCode}
                      fallbackColor={selectedApp.color}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryAppName}>{selectedApp.name}</Text>
                      <Text style={styles.summaryAppBundle}>{selectedApp.bundleId}</Text>
                    </View>
                  </View>

                  <View style={styles.summaryDivider} />

                  {/* Configured values */}
                  <View style={styles.summaryDetailGrid}>
                    <View style={styles.summaryDetailItem}>
                      <Text style={styles.summaryDetailLabel}>Daily Allowance</Text>
                      <Text style={styles.summaryDetailValue}>{formattedAllowance}</Text>
                    </View>

                    <View style={styles.summaryDetailItem}>
                      <Text style={styles.summaryDetailLabel}>Daily Reset</Text>
                      <Text style={styles.summaryDetailValue}>
                        {resetHour < 10 ? `0${resetHour}` : resetHour}:{resetMinute < 10 ? `0${resetMinute}` : resetMinute} (Daily)
                      </Text>
                    </View>

                    <View style={styles.summaryDetailItem}>
                      <Text style={styles.summaryDetailLabel}>Strictness</Text>
                      <Text style={styles.summaryDetailValue}>
                        {strictness.toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.summaryDetailItem}>
                      <Text style={styles.summaryDetailLabel}>Pre-Reset Edit</Text>
                      <Text style={styles.summaryDetailValue}>20 min window</Text>
                    </View>
                  </View>
                </View>

                {/* Final Anti-Impulse Reminder */}
                <View style={styles.antiImpulseBox}>
                  <Text style={styles.antiImpulseTitle}>Anti-Impulse Lock Guarantee</Text>
                  <Text style={styles.antiImpulseText}>
                    Once activated, this limit applies immediately. Changes can only be made
                    during the designated 20-minute window prior to reset.
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Modal Footer Controls */}
          <View style={styles.footer}>
            {currentStep > 1 && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  playLightFeedback();
                  animateStepTransition((currentStep - 1) as WizardStep);
                }}
                disabled={isSubmitting}
                style={styles.backBtn}
              >
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (currentStep === 1) handleNextFromStep1();
                else if (currentStep === 2) handleNextFromStep2();
                else if (currentStep === 3) handleNextFromStep3();
                else if (currentStep === 4) handleNextFromStep4();
                else if (currentStep === 5) handleSaveAndActivate();
              }}
              disabled={isSubmitting}
              style={[
                styles.primaryBtn,
                currentStep === 1 && !selectedApp && !isCustomApp && styles.primaryBtnDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {currentStep === 1 && 'Continue to Allowance →'}
                  {currentStep === 2 && 'Set Reset Schedule →'}
                  {currentStep === 3 && 'Configure Rules →'}
                  {currentStep === 4 && 'Review Configuration →'}
                  {currentStep === 5 && 'Lock In & Activate Realtime'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 20,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6366f1',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },
  stepTrack: {
    flexDirection: 'row',
    gap: 6,
    height: 4,
  },
  stepBar: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
  },
  stepBarActive: {
    backgroundColor: '#6366f1',
  },
  contentBody: {
    paddingHorizontal: 22,
    paddingTop: 16,
    maxHeight: 520,
  },
  stepContent: {
    gap: 16,
  },

  // Permissions Banner
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  permissionInfo: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  permissionDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  permissionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  permissionPillGranted: {
    backgroundColor: '#dcfce7',
  },
  permissionPillAction: {
    backgroundColor: '#6366f1',
  },
  permissionPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  permissionPillTextGranted: {
    color: '#15803d',
  },
  permissionPillTextAction: {
    color: '#ffffff',
  },

  // Search & Categories
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchIconBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  searchIconBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
  },
  clearSearchText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  categoryChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // App List Grid
  catalogHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },
  webTestingBanner: {
    backgroundColor: '#0f172a',
    borderColor: '#1e3a8a',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  webTestingText: {
    color: '#93c5fd',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  // Scan skeleton
  scanSkeletonContainer: {
    gap: 10,
    paddingVertical: 8,
  },
  scanSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
  },
  scanSkeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#334155',
  },
  scanSkeletonTextWrap: {
    flex: 1,
    gap: 6,
  },
  scanSkeletonLine: {
    height: 9,
    borderRadius: 5,
    backgroundColor: '#334155',
  },
  scanHint: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Empty installed state
  emptyInstalled: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyInstalledIcon: {
    fontSize: 40,
  },
  emptyInstalledTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#cbd5e1',
    textAlign: 'center',
  },
  emptyInstalledSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 17,
  },

  appListScroll: {
    maxHeight: 280,
  },
  appListGrid: {
    gap: 8,
    paddingBottom: 16,
  },
  appSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  appSelectCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#f5f3ff',
  },
  appSelectCardAlready: {
    opacity: 0.75,
  },
  appIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appIconBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
  appDetailsCol: {
    flex: 1,
  },
  appNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  installedBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  installedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803d',
  },
  alreadyBadge: {
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alreadyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  appBundleSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#6366f1',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366f1',
  },

  // Custom App Form
  customAppBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 10,
  },
  customAppTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  customAppSub: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
  },

  // Step 2 & 3 Time Displays
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedAppName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  selectedAppBundle: {
    fontSize: 11,
    color: '#64748b',
  },
  badgePill: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338ca',
  },
  timeDisplayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  timeDisplayLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  timeDisplayValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
  },
  timeDisplaySub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },

  // Presets
  presetsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 1.2,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetChipActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  presetChipTextActive: {
    color: '#ffffff',
  },

  // Steppers
  stepperContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  stepperCol: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    minWidth: 44,
    textAlign: 'center',
  },
  ruleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  ruleNoticeBadge: {
    backgroundColor: '#bfdbfe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ruleNoticeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1e3a8a',
    letterSpacing: 0.5,
  },
  ruleNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#1e40af',
    lineHeight: 15,
  },

  // Reset Schedule Step
  resetHeaderCard: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    padding: 18,
  },
  resetLargeTime: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
  },
  resetCardSub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  resetPresetsList: {
    gap: 8,
  },
  resetOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  resetOptionCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#f5f3ff',
  },
  resetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resetOptionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  resetOptionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
  resetOptionDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  windowCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 12,
  },
  windowCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  windowCardIcon: {
    fontSize: 20,
  },
  windowCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  windowCardDesc: {
    fontSize: 11,
    color: '#15803d',
    lineHeight: 15,
    marginTop: 2,
  },

  // Step 4 Strictness
  strictnessGrid: {
    gap: 8,
  },
  strictnessCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 4,
  },
  strictnessCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#f5f3ff',
  },
  strictnessTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strictnessTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  strictnessBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  strictnessBadgeActive: {
    backgroundColor: '#6366f1',
  },
  strictnessBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
  },
  strictnessBadgeTextActive: {
    color: '#ffffff',
  },
  strictnessDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },

  // Notification Toggles
  notifTogglesBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  notifToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  notifToggleTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  notifToggleSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 10,
  },
  toggleSwitch: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#cbd5e1',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchOn: {
    backgroundColor: '#6366f1',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },

  // Step 5 Review
  summaryCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  summaryBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#818cf8',
    letterSpacing: 1.5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryAppName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  summaryAppBundle: {
    fontSize: 11,
    color: '#94a3b8',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#1e293b',
  },
  summaryDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryDetailItem: {
    width: '46%',
  },
  summaryDetailLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
  },
  summaryDetailValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '700',
    marginTop: 2,
  },
  antiImpulseBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    padding: 12,
  },
  antiImpulseTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 2,
  },
  antiImpulseText: {
    fontSize: 11,
    color: '#dc2626',
    lineHeight: 15,
  },

  // Footer Actions
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  backBtn: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
