import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  FlatList,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playSelectionFeedback, playLightFeedback, playErrorFeedback } from '../../lib/feedback';
import { supabase } from '../../lib/supabase';
import { AppIcon } from '../../lib/appIcons';
import { ThemeColors } from '../../lib/theme';
import { useTheme } from '../../lib/ThemeContext';
import { loadSelectableApps } from '../../lib/appProvider';
import type { SelectableApp, SelectableAppsSource } from '../../lib/appProvider';

/** Platform-specific identifier used for Supabase `app_bundle_id` and icon resolution. */
function appIdentifier(app: SelectableApp): string {
  return app.packageName ?? app.bundleIdentifier ?? app.id;
}

// Real installed apps come from the platform provider (Android PackageManager
// / iOS LaunchServices). The curated catalog is only ever used as an
// explicitly labeled iOS fallback — the picker copy reflects that via `appsSource`.

interface AppLimitSetupModalProps {
  visible: boolean;
  onClose: () => void;
  existingBundleIds: string[];
  currentResetTime?: string;
  /** True while the pre-reset configuration window is open (§3.4). */
  configWindowOpen: boolean;
  /** Pre-reset window length in minutes (for display copy). */
  windowMinutes: number;
  /** Formatted window-open time, e.g. `7:40 AM` (for display copy). */
  windowOpenLabel: string;
  onSuccess: (savedLimit: any) => void;
  showToast: (msg: string, type?: 'info' | 'error' | 'success') => void;
}

type WizardStep = 1 | 2 | 3 | 4;

export function AppLimitSetupModal({
  visible,
  onClose,
  existingBundleIds,
  currentResetTime = '08:00:00',
  configWindowOpen,
  windowMinutes,
  windowOpenLabel,
  onSuccess,
  showToast,
}: AppLimitSetupModalProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  // Wide windows (tablets, desktop/web) get a centered sheet card instead of
  // a full-bleed column — keeps the modal at a comfortable reading width.
  const isWide = width >= 700;
  const contentPad = isCompact ? 16 : isWide ? 32 : 22;
  const styles = React.useMemo(
    () => createStyles(colors, { contentPad, isCompact, isWide }),
    [colors, contentPad, isCompact, isWide]
  );

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // Step 1: App selection (platform provider discovery)
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedApp, setSelectedApp] = useState<SelectableApp | null>(null);
  const [isCustomApp, setIsCustomApp] = useState(false);
  const [customAppName, setCustomAppName] = useState('');
  const [customBundleId, setCustomBundleId] = useState('');
  const [selectableApps, setSelectableApps] = useState<SelectableApp[]>([]);
  const [appsSource, setAppsSource] = useState<SelectableAppsSource>('device');
  const [isLoadingApps, setIsLoadingApps] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Step 2: Time Limit
  const [limitHours, setLimitHours] = useState<number>(1);
  const [limitMinutes, setLimitMinutes] = useState<number>(0);
  /**
   * Developer-only test limit (seconds) — __DEV__ builds ONLY, so it can
   * never ship in a production bundle. Lets real 30s/60s limits be tested
   * against real usage without waiting hours.
   */
  const [devLimitSeconds, setDevLimitSeconds] = useState<number | null>(null);

  // Step 3: Strictness & Notifications
  const [strictness, setStrictness] = useState<'standard' | 'strict' | 'extreme'>('standard');
  const [enableWarningNotif, setEnableWarningNotif] = useState(true);
  const [enableLockNotif, setEnableLockNotif] = useState(true);
  const [enableResetWindowNotif, setEnableResetWindowNotif] = useState(true);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation values
  const stepSlideAnim = useRef(new Animated.Value(0)).current;
  const stepFadeAnim = useRef(new Animated.Value(1)).current;

  // Reset wizard state whenever the picker opens
  useEffect(() => {
    if (visible) {
      setCurrentStep(1);
      setSelectedApp(null);
      setIsCustomApp(false);
      setCustomAppName('');
      setCustomBundleId('');
      setLimitHours(1);
      setLimitMinutes(0);
      setDevLimitSeconds(null);
      setSearchQuery('');
      setSelectedCategory('All');
      setLoadError(null);
      setAppsSource('device');
    }
  }, [visible]);

  // Load selectable apps through the platform provider when the picker opens.
  // Discovery runs entirely off the render cycle; results are session-cached
  // by the provider and only re-queried on explicit refresh. The snapshot's
  // `source` tells the UI whether these are real installed apps or the
  // explicitly labeled catalog fallback.
  const loadApps = useCallback(async (refresh = false) => {
    setIsLoadingApps(true);
    setLoadError(null);
    try {
      const snapshot = await loadSelectableApps({ refresh });
      setSelectableApps(snapshot.apps);
      setAppsSource(snapshot.source);
    } catch (err: any) {
      // Never fall back to fake/mock apps on failure.
      console.error('[AppLimitSetupModal] Failed to load selectable apps:', err);
      setSelectableApps([]);
      setLoadError(err?.message || 'Something went wrong while discovering your apps.');
    } finally {
      setIsLoadingApps(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Defer discovery one tick past the mount pass so the picker paints its
    // loading state first and no state updates run synchronously in the effect.
    const timer = setTimeout(() => loadApps(), 0);
    return () => clearTimeout(timer);
  }, [visible, loadApps]);

  // Refresh re-runs discovery — the list can change (installs/uninstalls),
  // so any previous selection must not silently survive.
  const handleRefreshApps = () => {
    setSelectedApp(null);
    loadApps(true);
  };

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

  // Category chips — only shown when the source provides real taxonomy
  const categories = useMemo(() => {
    const unique = Array.from(
      new Set(selectableApps.map((app) => app.category).filter((c): c is string => Boolean(c)))
    );
    return ['All', ...unique.sort((a, b) => a.localeCompare(b))];
  }, [selectableApps]);

  const showCategoryChips = categories.length > 1;

  // Local, case-insensitive name/identifier filter over the already-loaded
  // list — the underlying source is never re-queried on keystrokes.
  const filteredApps = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return selectableApps.filter((app) => {
      const matchesCategory = selectedCategory === 'All' || app.category === selectedCategory;
      const matchesSearch =
        !q ||
        app.name.toLowerCase().includes(q) ||
        appIdentifier(app).toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectableApps, searchQuery, selectedCategory]);

  const totalLimitSeconds = devLimitSeconds ?? (limitHours * 3600) + (limitMinutes * 60);

  const formattedAllowance = useMemo(() => {
    if (devLimitSeconds != null) {
      return devLimitSeconds < 60 ? `${devLimitSeconds}s` : `${Math.round(devLimitSeconds / 60)}m`;
    }
    if (limitHours === 0 && limitMinutes === 0) return '0 mins';
    const parts = [];
    if (limitHours > 0) parts.push(`${limitHours}h`);
    if (limitMinutes > 0) parts.push(`${limitMinutes}m`);
    return parts.join(' ');
  }, [limitHours, limitMinutes, devLimitSeconds]);

  const formattedResetTime = useMemo(() => {
    const h = parseInt(currentResetTime.slice(0, 2), 10);
    const m = parseInt(currentResetTime.slice(3, 5), 10);
    const hour24 = Number.isNaN(h) ? 8 : h;
    const minute = Number.isNaN(m) ? 0 : m;
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const displayH = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const mm = minute < 10 ? `0${minute}` : `${minute}`;
    return `${displayH}:${mm} ${period}`;
  }, [currentResetTime]);

  const handleSelectApp = (app: SelectableApp) => {
    playSelectionFeedback();
    // Anti-impulse rule: existing restrictions can only be reconfigured
    // during the pre-reset window (§3.4). New apps may be added anytime.
    const identifier = appIdentifier(app);
    if (!configWindowOpen && existingBundleIds.includes(identifier)) {
      showToast(
        `"${app.name}" already has a restriction. Changes unlock during the ${windowOpenLabel} window.`,
        'info'
      );
      return;
    }
    setSelectedApp(app);
    setIsCustomApp(false);
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
      const identifier = customBundleId.trim();
      setSelectedApp({
        id: `custom-${Date.now()}`,
        name: customAppName.trim(),
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        ...(Platform.OS === 'android'
          ? { packageName: identifier }
          : { bundleIdentifier: identifier }),
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
    if (devLimitSeconds == null && totalLimitSeconds < 300) {
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

      // 1. Upsert App Limit in Supabase
      const { data: limitData, error: limitError } = await supabase
        .from('app_limits')
        .upsert(
          {
            user_id: user.id,
            app_bundle_id: appIdentifier(selectedApp),
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

      // 2. Update notification preferences if needed
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

      playLightFeedback();
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalBackdrop} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header with Step Tracker */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View>
                <Text style={styles.stepCounterText}>STEP {currentStep} OF 4</Text>
                <Text style={styles.headerTitle}>
                  {currentStep === 1 && 'Select Application'}
                  {currentStep === 2 && 'Set Daily Allowance'}
                  {currentStep === 3 && 'Enforcement Rules'}
                  {currentStep === 4 && 'Review & Activate'}
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
              {[1, 2, 3, 4].map((step) => (
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
            {/* STEP 1: CHOOSE AN APPLICATION (platform provider discovery) */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 1 && (
              <View style={styles.stepContent}>
                {/* Title, filters, chips and list heading render inside the
                    FlatList header below so Step 1 scales with the window
                    and scrolls instead of overflowing it. */}

                {/* Loading state — initial discovery only; a refresh keeps the
                    existing list visible so the picker never flickers empty */}
                {isLoadingApps && selectableApps.length === 0 && !isCustomApp && (
                  <View style={styles.pickerStateBox}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.pickerStateTitle}>Finding your apps...</Text>
                    <Text style={styles.pickerStateSub}>
                      Reading installed applications — this only takes a moment.
                    </Text>
                  </View>
                )}

                {/* Error state — never a silent fallback to mock apps.
                    Manual entry stays reachable so the rest of the wizard is
                    usable even when discovery is unavailable (e.g. Expo Go). */}
                {!isLoadingApps && loadError && !isCustomApp && (
                  <View style={styles.pickerStateBox}>
                    <Text style={styles.pickerStateTitle}>{"Couldn't load your apps"}</Text>
                    <Text style={styles.pickerStateSub}>{loadError}</Text>
                    <View style={styles.stateBtnRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => loadApps(true)}
                        style={styles.retryBtn}
                      >
                        <Text style={styles.retryBtnText}>Try again</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          playSelectionFeedback();
                          setSelectedApp(null);
                          setIsCustomApp(true);
                        }}
                        style={styles.manualEntryBtn}
                      >
                        <Text style={styles.manualEntryBtnText}>Enter app manually →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Virtualized app list — picker chrome (title/filters/chips/
                    heading) and empty state live INSIDE the scroller so Step 1
                    adapts to any window height instead of overflowing it */}
                    {!loadError &&
                      !isCustomApp &&
                      (selectableApps.length > 0 || !isLoadingApps) && (
                      <FlatList
                        data={filteredApps}
                        keyExtractor={(item) => item.id}
                        style={styles.appList}
                        contentContainerStyle={styles.appListContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        initialNumToRender={12}
                        maxToRenderPerBatch={16}
                        windowSize={9}
                        removeClippedSubviews
                        ListHeaderComponent={
                          <View style={styles.listHeaderStack}>
                            {/* Picker header */}
                            <View style={styles.pickerHeader}>
                              <Text style={styles.pickerTitle}>Choose an app</Text>
                              <Text style={styles.pickerSubtitle}>
                                {'Select an app you\u2019d like FocusLock to limit.'}
                              </Text>
                            </View>

                            {/* Filter bar — search + custom entry, always reachable */}
                            <View style={styles.filterRow}>
                              <View style={styles.searchRow}>
                                <Text style={styles.searchGlyph}>{'\u{1F50D}'}</Text>
                                <TextInput
                                  style={styles.searchInput}
                                  placeholder="Search apps or package IDs..."
                                  placeholderTextColor={colors.textMuted}
                                  value={searchQuery}
                                  onChangeText={setSearchQuery}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  returnKeyType="search"
                                />
                                {searchQuery.length > 0 && (
                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setSearchQuery('')}
                                  >
                                    <Text style={styles.clearSearchText}>Clear</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                              <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={() => {
                                  playSelectionFeedback();
                                  setSelectedApp(null);
                                  setSearchQuery('');
                                  setIsCustomApp(true);
                                }}
                                style={styles.customBtn}
                              >
                                <Text style={styles.customBtnText}>+ Custom</Text>
                              </TouchableOpacity>
                            </View>

                            {/* Category chips — only when the source has real taxonomy */}
                            {showCategoryChips && (
                              <View style={styles.chipsWrap}>
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={styles.categoryScroll}
                                >
                                  {categories.map((cat) => (
                                    <TouchableOpacity
                                      key={cat}
                                      activeOpacity={0.75}
                                      onPress={() => {
                                        playSelectionFeedback();
                                        setSelectedCategory(cat);
                                      }}
                                      style={[
                                        styles.categoryChip,
                                        selectedCategory === cat && styles.categoryChipActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.categoryChipText,
                                          selectedCategory === cat &&
                                            styles.categoryChipTextActive,
                                        ]}
                                      >
                                        {cat}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </ScrollView>
                              </View>
                            )}

                            {/* List heading — honest, provider-aware */}
                            <View style={styles.listHeaderRow}>
                              <View style={styles.listHeaderTextCol}>
                                <Text style={styles.catalogHeading}>
                                  {appsSource === 'device'
                                    ? `Installed apps (${selectableApps.length})`
                                    : `Supported apps (${selectableApps.length})`}
                                </Text>
                                {appsSource === 'catalog' && (
                                  <Text style={styles.catalogNote}>
                                    Curated supported apps — run a development build
                                    (npx expo run:ios) for the full installed-app list.
                                  </Text>
                                )}
                              </View>
                              <TouchableOpacity
                                activeOpacity={0.7}
                                disabled={isLoadingApps}
                                onPress={handleRefreshApps}
                                style={styles.refreshBtn}
                              >
                                <Text style={styles.refreshBtnText}>
                                  {isLoadingApps ? '\u2026\u2026' : '\u21BB Refresh'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        }
                        ListEmptyComponent={
                          <View style={styles.emptyListBox}>
                            <Text style={styles.pickerStateTitle}>No apps found</Text>
                            <Text style={styles.pickerStateSub}>
                              {searchQuery.trim().length > 0
                                ? `Nothing matches "${searchQuery.trim()}".`
                                : 'No selectable applications are available right now.'}
                            </Text>
                          </View>
                        }
                        ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
                        renderItem={({ item }) => {
                          const identifier = appIdentifier(item);
                          const isSelected = selectedApp?.id === item.id;
                          const isAlreadyLimited = existingBundleIds.includes(identifier);

                          return (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => handleSelectApp(item)}
                              style={[
                                styles.appRow,
                                isSelected && styles.appRowSelected,
                                isAlreadyLimited && styles.appRowAlready,
                              ]}
                            >
                              <AppIcon
                                iconUri={item.icon}
                                bundleId={identifier}
                                appName={item.name}
                                appId={item.id}
                                size={40}
                                fallbackBadge={item.badgeCode}
                                fallbackColor={item.color}
                              />

                              <View style={styles.appDetailsCol}>
                                <View style={styles.appNameRow}>
                                  <Text style={styles.appTitle} numberOfLines={1}>
                                    {item.name}
                                  </Text>
                                  {isAlreadyLimited && (
                                    <View style={styles.alreadyBadge}>
                                      <Text style={styles.alreadyBadgeText}>Limited</Text>
                                    </View>
                                  )}
                                </View>
                                {item.category ? (
                                  <Text style={styles.appMeta} numberOfLines={1}>
                                    {item.category}
                                  </Text>
                                ) : null}
                              </View>

                              <View
                                style={[
                                  styles.radioCircle,
                                  isSelected && styles.radioCircleSelected,
                                ]}
                              >
                                {isSelected && <Text style={styles.checkMark}>✓</Text>}
                              </View>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    )}
                {/* Custom App Manual Entry — real identifier entry, not mock data.
                    Replaces the browse list entirely; back button restores it. */}
                {isCustomApp && (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => {
                        playSelectionFeedback();
                        setIsCustomApp(false);
                      }}
                      style={styles.backToBrowseBtn}
                    >
                      <Text style={styles.backToBrowseText}>← Browse installed apps</Text>
                    </TouchableOpacity>
                    <View style={styles.customAppBox}>
                      <Text style={styles.customAppTitle}>Custom Application Specification</Text>
                      <Text style={styles.customAppSub}>
                        Specify any system or sideloaded package identifier on this device.
                      </Text>

                      <Text style={styles.inputLabel}>Application Name</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Duolingo or Kindle"
                        placeholderTextColor={colors.textMuted}
                        value={customAppName}
                        onChangeText={setCustomAppName}
                      />

                      <Text style={styles.inputLabel}>Package / Bundle Identifier</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. com.duolingo or com.amazon.kindle"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        value={customBundleId}
                        onChangeText={setCustomBundleId}
                      />
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 2: SET DAILY TIME LIMIT */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 2 && selectedApp && (
              <ScrollView
                style={styles.stepScroll}
                contentContainerStyle={styles.stepScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Selected App Header */}
                <View style={styles.selectedBanner}>
                  <AppIcon
                    iconUri={selectedApp.icon}
                    bundleId={appIdentifier(selectedApp)}
                    appName={selectedApp.name}
                    appId={selectedApp.id}
                    size={44}
                    fallbackBadge={selectedApp.badgeCode}
                    fallbackColor={selectedApp.color}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedAppName}>{selectedApp.name}</Text>
                    <Text style={styles.selectedAppBundle} numberOfLines={1}>
                      {appIdentifier(selectedApp)}
                    </Text>
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
                          setDevLimitSeconds(null);
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

                {/* DEV ONLY: real short limits for on-device testing.
                    Gated by __DEV__ so this never ships in a release bundle. */}
                {__DEV__ && (
                  <>
                    <Text style={styles.presetsHeading}>DEV TEST (REAL SHORT LIMITS)</Text>
                    <View style={styles.presetsGrid}>
                      {[
                        { label: '30 sec', seconds: 30 },
                        { label: '60 sec', seconds: 60 },
                      ].map((preset) => {
                        const isSelected = devLimitSeconds === preset.seconds;
                        return (
                          <TouchableOpacity
                            key={preset.label}
                            activeOpacity={0.75}
                            onPress={() => {
                              playSelectionFeedback();
                              setDevLimitSeconds(preset.seconds);
                              setLimitHours(0);
                              setLimitMinutes(0);
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
                  </>
                )}

                {/* Custom Steppers */}
                <View style={styles.stepperContainer}>
                  <View style={styles.stepperCol}>
                    <Text style={styles.stepperLabel}>Hours</Text>
                    <View style={styles.stepperControls}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => {
                          playLightFeedback();
                          setDevLimitSeconds(null);
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
                          setDevLimitSeconds(null);
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
                          setDevLimitSeconds(null);
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
                          setDevLimitSeconds(null);
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

                {/* Read-only reset reference — Schedule tab is the single source of truth */}
                <View style={styles.resetRefRow}>
                  <Text style={styles.resetRefText}>
                    🔄 Resets daily at {formattedResetTime} · window opens {windowOpenLabel}
                  </Text>
                  <Text style={styles.resetRefHint}>Edit in Schedule tab</Text>
                </View>
              </ScrollView>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 3: ENFORCEMENT & SHIELDING RULES */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 3 && (
              <ScrollView
                style={styles.stepScroll}
                contentContainerStyle={styles.stepScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
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
              </ScrollView>
            )}

            {/* ----------------------------------------------------------- */}
            {/* STEP 4: REVIEW & ACTIVATE */}
            {/* ----------------------------------------------------------- */}
            {currentStep === 4 && selectedApp && (
              <ScrollView
                style={styles.stepScroll}
                contentContainerStyle={styles.stepScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryBadge}>SUMMARY & CONFIRMATION</Text>

                  {/* App info */}
                  <View style={styles.summaryRow}>
                    <AppIcon
                      iconUri={selectedApp.icon}
                      bundleId={appIdentifier(selectedApp)}
                      appName={selectedApp.name}
                      appId={selectedApp.id}
                      size={44}
                      fallbackBadge={selectedApp.badgeCode}
                      fallbackColor={selectedApp.color}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryAppName}>{selectedApp.name}</Text>
                      <Text style={styles.summaryAppBundle} numberOfLines={1}>
                        {appIdentifier(selectedApp)}
                      </Text>
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
                        {formattedResetTime} · Daily
                      </Text>
                      <Text style={styles.summaryDetailHint}>Managed in Schedule tab</Text>
                    </View>

                    <View style={styles.summaryDetailItem}>
                      <Text style={styles.summaryDetailLabel}>Strictness</Text>
                      <Text style={styles.summaryDetailValue}>
                        {strictness.toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.summaryDetailItem}>
                      <Text style={styles.summaryDetailLabel}>Pre-Reset Edit</Text>
                      <Text style={styles.summaryDetailValue}>{windowMinutes} min window</Text>
                      <Text style={styles.summaryDetailHint}>Opens at {windowOpenLabel}</Text>
                    </View>
                  </View>
                </View>

                {/* Final Anti-Impulse Reminder */}
                <View style={styles.antiImpulseBox}>
                  <Text style={styles.antiImpulseTitle}>Anti-Impulse Lock Guarantee</Text>
                  <Text style={styles.antiImpulseText}>
                    Once activated, this limit applies immediately. Changes can only be made
                    during the designated {windowMinutes}-minute window prior to reset.
                  </Text>
                </View>
              </ScrollView>
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
                else handleSaveAndActivate();
              }}
              disabled={isSubmitting || (currentStep === 1 && !selectedApp && !isCustomApp)}
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
                  {currentStep === 2 && 'Configure Rules →'}
                  {currentStep === 3 && 'Review Configuration →'}
                  {currentStep === 4 && 'Lock In & Activate'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

interface ModalLayout {
  /** Horizontal content padding scaled to the device width */
  contentPad: number;
  /** True for narrow (<380px) devices — compact typography */
  isCompact: boolean;
  /** True for wide (>=700px) windows — centered sheet presentation */
  isWide: boolean;
}

function createStyles(C: ThemeColors, layout: ModalLayout) {
  return StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    // Phone: seamless full-screen. Wide: dimmed backdrop around a sheet card.
    backgroundColor: layout.isWide ? 'rgba(0, 0, 0, 0.6)' : C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    ...(layout.isWide ? { padding: 24 } : null),
  },
  modalContainer: {
    width: '100%',
    maxWidth: 600,
    flex: 1,
    backgroundColor: C.bg,
    ...(layout.isWide
      ? {
          borderRadius: 24,
          overflow: 'hidden' as const,
          borderWidth: 1,
          borderColor: C.border,
        }
      : null),
  },
  header: {
    paddingHorizontal: layout.contentPad,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
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
    color: C.accentText,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: layout.isCompact ? 18 : 20,
    fontWeight: '800',
    color: C.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: C.textSecondary,
    fontWeight: '700',
  },
  stepTrack: {
    flexDirection: 'row',
    gap: 6,
    height: 4,
  },
  stepBar: {
    flex: 1,
    backgroundColor: C.bgSecondary,
    borderRadius: 2,
  },
  stepBarActive: {
    backgroundColor: C.accent,
  },
  contentBody: {
    paddingHorizontal: layout.contentPad,
    paddingTop: 16,
    flex: 1,
  },
  stepContent: {
    gap: 16,
    flex: 1,
  },
  // FlatList header stack — the picker chrome scrolls with the rows so
  // Step 1 always fits the window instead of overflowing it
  listHeaderStack: {
    gap: 16,
    paddingBottom: 4,
  },
  emptyListBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 8,
  },
  // Steps 2–4 are long forms — scroll them so nothing is clipped on short
  // windows (step 1 scrolls through its own virtualized app list instead).
  stepScroll: {
    flex: 1,
  },
  stepScrollContent: {
    gap: 16,
    flexGrow: 1,
    paddingBottom: 12,
  },
  backToBrowseBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
  },
  backToBrowseText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accentText,
  },

  // Picker header
  pickerHeader: {
    gap: 4,
  },
  pickerTitle: {
    fontSize: layout.isCompact ? 20 : 22,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  pickerSubtitle: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },

  // List header row (heading + refresh)
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listHeaderTextCol: {
    flex: 1,
    gap: 2,
  },
  catalogNote: {
    fontSize: 11,
    color: C.textMuted,
    lineHeight: 15,
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
  },

  // Picker states (loading / error / empty)
  pickerStateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  pickerStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
  },
  pickerStateSub: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 280,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.accent,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Error-state actions — retry discovery OR keep moving via manual entry
  stateBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  manualEntryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  manualEntryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.accentText,
  },

  // Filter bar — search field + custom entry button share one 44px row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchGlyph: {
    fontSize: 13,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.textPrimary,
  },
  clearSearchText: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '600',
  },
  customBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.accentText,
  },

  // Category chips — full-bleed horizontal row of uniform pill filters
  chipsWrap: {
    marginHorizontal: -layout.contentPad,
  },
  categoryScroll: {
    gap: 8,
    paddingHorizontal: layout.contentPad,
    paddingVertical: 2,
    alignItems: 'center',
  },
  categoryChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
  },
  categoryChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // App List Grid
  catalogHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 0.8,
  },

  // Virtualized app list
  appList: {
    flex: 1,
  },
  appListContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  rowSeparator: {
    height: 1,
    backgroundColor: C.border,
    opacity: 0.6,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 12,
  },
  appRowSelected: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  appRowAlready: {
    opacity: 0.7,
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
    color: C.textPrimary,
  },
  appMeta: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
  alreadyBadge: {
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alreadyBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.textSecondary,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: C.accent,
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '800',
    color: C.accentText,
  },

  // Custom App Form
  customAppBox: {
    backgroundColor: C.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 10,
  },
  customAppTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textPrimary,
  },
  customAppSub: {
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
  },
  textInput: {
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: C.textPrimary,
  },

  // Step 2 Time Displays
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: C.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  selectedAppName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
  },
  selectedAppBundle: {
    fontSize: 11,
    color: C.textMuted,
  },
  badgePill: {
    backgroundColor: C.accentDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.accentText,
  },
  timeDisplayCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  timeDisplayLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  timeDisplayValue: {
    fontSize: 34,
    fontWeight: '800',
    color: C.textPrimary,
  },
  timeDisplaySub: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 4,
  },

  // Presets
  presetsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textMuted,
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
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },

  // Steppers
  stepperContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  stepperCol: {
    flex: 1,
    backgroundColor: C.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    alignItems: 'center',
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
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
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '800',
    color: C.textPrimary,
    minWidth: 44,
    textAlign: 'center',
  },
  ruleNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(118,247,86,0.25)',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  ruleNoticeBadge: {
    backgroundColor: 'rgba(118,247,86,0.20)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ruleNoticeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.accentText,
    letterSpacing: 0.5,
  },
  ruleNoticeText: {
    flex: 1,
    fontSize: 11,
    color: C.textSecondary,
    lineHeight: 15,
  },

  // Read-only reset reference row
  resetRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: C.bgCard,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
  },
  resetRefText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    lineHeight: 16,
  },
  resetRefHint: {
    fontSize: 10,
    fontWeight: '700',
    color: C.accentText,
    letterSpacing: 0.3,
  },

  // Step 3 Strictness
  strictnessGrid: {
    gap: 8,
  },
  strictnessCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bgCard,
    gap: 4,
  },
  strictnessCardActive: {
    borderColor: C.accent,
    backgroundColor: C.accentDim,
  },
  strictnessTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  strictnessTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textPrimary,
  },
  strictnessBadge: {
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  strictnessBadgeActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  strictnessBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: C.textSecondary,
  },
  strictnessBadgeTextActive: {
    color: '#FFFFFF',
  },
  strictnessDesc: {
    fontSize: 11,
    color: C.textSecondary,
    lineHeight: 15,
  },

  // Notification Toggles
  notifTogglesBox: {
    backgroundColor: C.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.textPrimary,
  },
  notifToggleSub: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 10,
  },
  toggleSwitch: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.borderStrong,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchOn: {
    backgroundColor: C.accent,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },

  // Step 4 Review
  summaryCard: {
    backgroundColor: C.bgSecondary,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  summaryBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: C.accentText,
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
    color: C.textPrimary,
  },
  summaryAppBundle: {
    fontSize: 11,
    color: C.textMuted,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  summaryDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryDetailItem: {
    flexBasis: '46%',
    flexGrow: 1,
  },
  summaryDetailLabel: {
    fontSize: 10,
    color: C.textMuted,
    fontWeight: '600',
  },
  summaryDetailValue: {
    fontSize: 14,
    color: C.textPrimary,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryDetailHint: {
    fontSize: 10,
    color: C.accentText,
    fontWeight: '600',
    marginTop: 2,
  },
  antiImpulseBox: {
    backgroundColor: C.dangerDim,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    borderRadius: 14,
    padding: 12,
  },
  antiImpulseTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.danger,
    marginBottom: 2,
  },
  antiImpulseText: {
    fontSize: 11,
    color: C.danger,
    lineHeight: 15,
  },

  // Footer Actions
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.contentPad,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  backBtn: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: C.bgInput,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSecondary,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: C.textMuted,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
}
