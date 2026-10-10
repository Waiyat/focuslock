import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeSetItem } from '../lib/safeStorage';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { lightColors as C } from '../lib/theme';
import { isOnboardingComplete, markOnboardingComplete } from '../lib/onboarding';
import {
  getNotificationPermissionStatus,
  registerPushToken,
  requestNotificationPermissions,
} from '../lib/notifications';
import { usageBridge } from '../lib/usage/usageBridge';
import { usageEngine } from '../lib/usage/usageEngine';
import type { UsageAccessStatus } from '../lib/usage/types';
import { SUPPORTED_IOS_APPS } from '../lib/appProvider/iosCatalog';
import { LOCAL_APP_ICONS } from '../lib/appIcons';
import { Toast } from '../components/ui/Toast';
import { AppLimitSetupModal } from '../components/ui/AppLimitSetupModal';

const STEPS = ['Welcome', 'Supported apps', 'Daily limits', 'Permissions', 'Finish'] as const;

// Layout constants
const MAX_CONTENT_WIDTH = 560;
const H_PADDING = 20;
const APP_GRID_GAP = 10;
const APP_GRID_COLUMNS = 3;
const APP_PREVIEW_COUNT = 12; // chips shown before "Show all"
const COMPACT_HEIGHT = 700; // screens shorter than this get smaller headings
const MIN_PANEL_HEIGHT = 360; // fallback until the step area has been measured
const CHROME_HEIGHT_ESTIMATE = 260; // header + footer + safe areas, pre-measure only
const CUE_HEIGHT = 56; // fixed strip under the artwork that holds "Read more"

// Mirrors the `reset_windows` defaults shown by the dashboard and the limit
// wizard — the authoritative schedule itself lives in Supabase (reset_windows),
// so this is display copy only, never a second source of truth.
const DEFAULT_RESET_TIME = '08:00:00';
const DEFAULT_WINDOW_MINUTES = 20;

type NotifStatus = 'granted' | 'denied' | 'undetermined';
type FinishError = 'required-perms' | 'persist' | null;
type ToastType = 'error' | 'info' | 'success';
type ChipKind = 'ok' | 'required' | 'optional' | 'neutral';
type ImageSource = React.ComponentProps<typeof Image>['source'];

/** Same 12-hour formatting the dashboard uses (display only). */
function formatClock(resetTime?: string | null): string {
  const [rawH, rawM] = (resetTime || DEFAULT_RESET_TIME).split(':').map(Number);
  const h = (((rawH || 0) % 24) + 24) % 24;
  const m = (((rawM || 0) % 60) + 60) % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${m < 10 ? '0' + m : m} ${period}`;
}

/** When the pre-reset configuration window opens (reset - windowMinutes). */
function windowOpensLabel(resetTime: string, windowMinutes: number): string {
  const [rawH, rawM] = resetTime.split(':').map(Number);
  const totalMin = ((((rawH || 0) % 24) * 60 + ((rawM || 0) % 60)) - windowMinutes + 1440) % 1440;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return formatClock(`${hh < 10 ? '0' + hh : hh}:${mm < 10 ? '0' + mm : mm}:00`);
}

const FEATURES = [
  {
    id: 'no-overrides',
    icon: require('../../assets/feat-no-overrides.svg'),
    title: 'No impulsive overrides',
    body: "When today's allowance is used up, the lock holds until the next reset.",
  },
  {
    id: 'local-enforce',
    icon: require('../../assets/feat-local-enforce.svg'),
    title: 'Enforced on your device',
    body: 'Locks are applied by your phone using native platform features.',
  },
  {
    id: 'privacy',
    icon: require('../../assets/feat-privacy-tracking.svg'),
    title: 'Private by design',
    body: 'FocusLock measures time in apps. It never reads your messages, photos, or what you do inside them.',
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const justVerifiedArrived =
    useLocalSearchParams<{ justVerified?: string }>().justVerified === '1';
  const { height, width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [stepIndex, setStepIndex] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('undetermined');
  const [access, setAccess] = useState<UsageAccessStatus | null>(null);
  const [accessCheckFailed, setAccessCheckFailed] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [finishError, setFinishError] = useState<FinishError>(null);
  const [configuredIds, setConfiguredIds] = useState<string[]>([]);
  const [showLimitWizard, setShowLimitWizard] = useState(false);
  const [showAllApps, setShowAllApps] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Responsive sizing: smaller headings on short screens, capped width on tablets.
  // (Step transitions use the `FadeIn` entering animation keyed by step below;
  // the Read more cue uses the border-drawn chevron in <ReadMore/>.)
  const compact = height < COMPACT_HEIGHT;
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH) - H_PADDING * 2;
  const appChipWidth = Math.floor(
    (contentWidth - APP_GRID_GAP * (APP_GRID_COLUMNS - 1)) / APP_GRID_COLUMNS
  );

  // The image panel is exactly as tall as the visible step area (between the
  // fixed header and footer), so the artwork covers the whole screen.
  const scrollRef = useRef<ScrollView>(null);
  const [stepAreaH, setStepAreaH] = useState(0);
  const panelHeight =
    stepAreaH > 0 ? stepAreaH : Math.max(height - CHROME_HEIGHT_ESTIMATE, MIN_PANEL_HEIGHT);

  // Once someone has opened a step's details (tap or scroll) the "Read more"
  // cue is gone for good on that step, including when they come back to it.
  const [seenSteps, setSeenSteps] = useState<Record<number, boolean>>({});
  const markSeen = useCallback(() => {
    setSeenSteps((prev) => (prev[stepIndex] ? prev : { ...prev, [stepIndex]: true }));
  }, [stepIndex]);

  const scrollToDetails = useCallback(() => {
    markSeen();
    scrollRef.current?.scrollTo({ y: panelHeight, animated: !reduceMotion });
  }, [markSeen, panelHeight, reduceMotion]);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      if (e.nativeEvent.contentOffset.y > 40) markSeen();
    },
    [markSeen]
  );

  const isAndroid = Platform.OS === 'android';
  const isIOS = Platform.OS === 'ios';
  // Native usage engine exists only in Android dev/prod builds (never Expo Go).
  const engineAvailable = useMemo(() => usageEngine.available, []);
  const androidPermsRequired = isAndroid && engineAvailable;

  const resetLabel = useMemo(() => formatClock(DEFAULT_RESET_TIME), []);
  const windowOpenLabel = useMemo(
    () => windowOpensLabel(DEFAULT_RESET_TIME, DEFAULT_WINDOW_MINUTES),
    []
  );

  // Real permission snapshot — only Android confirms grants.
  const accessGranted = !!access && access.usageAccessGranted && access.overlayGranted;
  const accessPending = access === null && !accessCheckFailed;
  const checkingAccess = androidPermsRequired && accessPending;
  const canLeavePermissions = !androidPermsRequired || accessGranted;
  const missingPermissions: string[] = androidPermsRequired
    ? [
        ...(access?.usageAccessGranted ? [] : ['Usage Access']),
        ...(access?.overlayGranted ? [] : ['Display over other apps']),
      ]
    : [];

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ visible: true, message, type });
  }, []);

  // Tracks the last Usage Access grant observed from Android so a fresh grant
  // (Settings -> return) restarts native monitoring exactly once.
  const usageGrantedRef = useRef(false);

  const refreshAccess = useCallback(async () => {
    if (!isAndroid) return;
    try {
      const next = await usageEngine.accessStatus();
      const granted = next.available && next.usageAccessGranted;
      const justGranted = granted && !usageGrantedRef.current;
      usageGrantedRef.current = granted;
      setAccess(next);
      setAccessCheckFailed(false);
      if (justGranted) {
        // setLimits is skipped by the bridge while Usage Access is missing —
        // re-push limits so monitoring actually starts after the grant.
        usageEngine.resyncForMonitoring().catch(() => {});
      }
    } catch (err) {
      console.warn('[onboarding] Usage Access verification failed:', err);
      setAccessCheckFailed(true);
    }
  }, [isAndroid]);

  const refreshNotificationStatus = useCallback(async () => {
    try {
      const status = await getNotificationPermissionStatus();
      setNotifStatus(
        status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined'
      );
    } catch (err) {
      console.warn('[onboarding] Notification permission check failed:', err);
    }
  }, []);

  const syncPushToken = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) await registerPushToken(data.user.id);
    } catch (err) {
      console.warn('[onboarding] Push token sync failed:', err);
    }
  }, []);

  // Mount: run the real checks and re-verify on every return to the
  // foreground (e.g. back from Settings). The status check below is
  // intentionally fire-and-forget: this screen renders instantly rather than
  // gating the first frame on session + metadata round-trips (that gate is
  // what made the signup→onboarding transition appear to stall). An
  // already-onboarded user who lands here is pushed to the dashboard the
  // moment the check settles — without ever blocking onboarding itself.
  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!active) return;
        const done = await isOnboardingComplete(session?.user);
        if (!active) return;
        if (done) {
          if (justVerifiedArrived) {
            showToast('Email verified — redirecting…', 'success');
            // Retire the query param so Back/forward never repeats the toast.
            router.setParams({ justVerified: undefined });
          }
          router.replace('/dashboard');
        }
      } catch (err) {
        console.warn('[onboarding] Onboarding status check failed:', err);
      }
    };
    bootstrap();

    // Deferred so the effect body itself performs no synchronous state work.
    const initialChecks = setTimeout(() => {
      if (!active) return;
      refreshAccess();
      refreshNotificationStatus();
    }, 0);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refreshAccess();
      refreshNotificationStatus();
    });

    return () => {
      active = false;
      clearTimeout(initialChecks);
      subscription.remove();
    };
  }, [router, refreshAccess, refreshNotificationStatus, justVerifiedArrived, showToast]);

  // Android hardware Back walks back through the steps instead of leaving.
  useEffect(() => {
    if (!isAndroid) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isCompleting) return true; // ignore while setup is being saved
      if (showLimitWizard) return false; // the wizard modal handles its own Back
      if (stepIndex > 0) {
        setStepIndex((i) => Math.max(0, i - 1));
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [isAndroid, isCompleting, showLimitWizard, stepIndex]);

  // Tell screen-reader users which step they are on after every step change.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    AccessibilityInfo.announceForAccessibility(
      `Step ${stepIndex + 1} of ${STEPS.length}: ${STEPS[stepIndex]}`
    );
  }, [stepIndex]);

  // ── Terms acceptance ────────────────────────────────────────────────────────
  // Writing `accepted_terms_at` auth metadata early would make
  // isOnboardingComplete() report true while required setup is still missing,
  // so the authoritative record is only written on the final step.
  const toggleTerms = async () => {
    const next = !termsAccepted;
    // Acceptance is state the user owns: never block the checkbox itself.
    // A best-effort local timestamp is written now; async-storage v3 in
    // Expo Go returns a null native module ("Native module is null"), in
    // which case we keep going in-memory. The authoritative terms record
    // (`accepted_terms_at` in AsyncStorage, auth metadata, profiles and the
    // backend) is written by `markOnboardingComplete()` on the final step,
    // where a failure is surfaced with a retry instead of being swallowed.
    setTermsAccepted(next);
    if (!next) return;
    // Best-effort local timestamp via the safe-storage wrapper: this resolves
    // even in Expo Go (in-memory fallback), so it never throws. The
    // authoritative terms record is written by markOnboardingComplete() on the
    // final step, where a failure is surfaced with a retry.
    await safeSetItem('terms_accepted_at', new Date().toISOString());
  };

  // ── Notifications (optional on both platforms) ──────────────────────────────
  const handleEnableNotifications = async () => {
    try {
      const existing = await getNotificationPermissionStatus();
      if (existing === 'granted') {
        setNotifStatus('granted');
        await syncPushToken();
        return;
      }
      const granted = await requestNotificationPermissions();
      if (granted) {
        setNotifStatus('granted');
        await syncPushToken();
      } else {
        setNotifStatus('denied');
      }
    } catch (err) {
      console.warn('[onboarding] Notification permission request failed:', err);
      setNotifStatus('denied');
    }
  };

  const handleOpenSystemSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.warn('[onboarding] Failed to open system Settings:', err);
    }
    // Status re-verifies on AppState 'active'; poll once more as a fallback.
    setTimeout(() => {
      refreshNotificationStatus();
      refreshAccess();
    }, 800);
  };

  // ── Android special access openers ──────────────────────────────────────────
  const openUsageAccessSettings = useCallback(async () => {
    try {
      await usageBridge.openUsageAccessSettings();
    } catch {
      await Linking.openSettings().catch((err) =>
        console.warn('[onboarding] Failed to open Settings:', err)
      );
    }
    // Android reports the real state on foreground return; poll as fallback.
    setTimeout(refreshAccess, 800);
  }, [refreshAccess]);

  const openOverlaySettings = useCallback(async () => {
    try {
      await usageBridge.openOverlaySettings();
    } catch {
      await Linking.openSettings().catch((err) =>
        console.warn('[onboarding] Failed to open Settings:', err)
      );
    }
    setTimeout(refreshAccess, 800);
  }, [refreshAccess]);

  // ── Limit wizard (existing AppLimitSetupModal) ──────────────────────────────
  const handleAppLimitSuccess = (savedLimit: any) => {
    const id = typeof savedLimit?.app_bundle_id === 'string' ? savedLimit.app_bundle_id : null;
    if (id) setConfiguredIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  // ── Final step: verify, persist, navigate ───────────────────────────────────
  const handleFinish = async () => {
    if (isCompleting) return;
    if (!termsAccepted) {
      showToast('Please accept the Terms of Service and Privacy Policy first.', 'error');
      return;
    }
    setIsCompleting(true);
    setFinishError(null);
    try {
      // 1. Re-verify required Android permissions at completion time — never
      //    trust an old snapshot (the user may have revoked on the way here).
      if (androidPermsRequired) {
        const st = await usageEngine.accessStatus();
        setAccess(st);
        if (!(st.usageAccessGranted && st.overlayGranted)) {
          usageGrantedRef.current = false;
          setFinishError('required-perms');
          showToast('Required permissions are missing again. Grant them and try once more.', 'error');
          return;
        }
      }

      // 2. Persist across local storage, Supabase metadata, profiles & backend.
      await markOnboardingComplete();

      // 3. Verify the critical local persistence actually took effect instead
      //    of silently swallowing a failure.
      const done = await isOnboardingComplete();
      if (!done) {
        setFinishError('persist');
        showToast('We could not save your setup. Check your connection and try again.', 'error');
        return;
      }

      // 4. Register the push token in the background when notifications are on.
      if (notifStatus === 'granted') syncPushToken().catch(() => {});

      router.replace('/dashboard');
    } catch (err) {
      console.error('[onboarding] Failed to complete setup:', err);
      setFinishError('persist');
      showToast('Something went wrong while finishing setup. Please try again.', 'error');
    } finally {
      setIsCompleting(false);
    }
  };

  // ── Shared step pieces ──────────────────────────────────────────────────────
  // Image panel: the whole artwork fills the visible step area, edge to edge,
  // with nothing placed on top of it. Only a slim "Read more" strip sits below
  // the image. The step's title and description follow right after the panel,
  // at the top of the details, so they never cover or crop the artwork.
  const renderPanel = (
    source: ImageSource,
    title: string,
    sub: string,
    readMoreLabel = 'Read more'
  ) => (
    <>
      <View style={[s.panel, { height: panelHeight }]}>
        {/* Backdrop: the same artwork, blurred and softened. It only shows in
            any leftover space around the artwork on unusually shaped screens. */}
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={40}
          transition={0}
          accessible={false}
        />
        <View style={s.panelScrim} />

        <StepArt source={source} reduceMotion={reduceMotion} />

        {/* Fixed-height strip: the artwork never resizes when the cue goes away. */}
        <View style={s.panelBottom}>
          {!seenSteps[stepIndex] && (
            <ReadMore label={readMoreLabel} onPress={scrollToDetails} reduceMotion={reduceMotion} />
          )}
        </View>
      </View>

      <View style={s.heading}>
        <Text
          style={[s.h1, compact && s.h1Compact]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>
        <Text style={s.sub} maxFontSizeMultiplier={1.2}>
          {sub}
        </Text>
      </View>
    </>
  );

  // ── Progress header ─────────────────────────────────────────────────────────
  const renderHeader = () => (
    <View
      style={s.header}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}: ${STEPS[stepIndex]}`}
      accessibilityValue={{ min: 1, max: STEPS.length, now: stepIndex + 1 }}
    >
      <View style={s.brandRow}>
        <Image
          source={require('../../assets/logo.webp')}
          style={s.brandLogo}
          contentFit="contain"
          accessible={false}
        />
        <Text style={s.brandName} maxFontSizeMultiplier={1.3}>
          FocusLock
        </Text>
        <Text style={s.stepCounter} maxFontSizeMultiplier={1.3}>
          {`Step ${stepIndex + 1} of ${STEPS.length}`}
        </Text>
      </View>
      <View style={s.track}>
        {STEPS.map((name, i) => (
          <View key={name} style={[s.seg, i <= stepIndex && s.segActive]} />
        ))}
      </View>
    </View>
  );

  // ── Footer (one primary action per step) ────────────────────────────────────
  const renderFooter = () => {
    const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

    const withBack = (primary: React.ReactNode, hint?: React.ReactNode) => (
      <View style={s.footer}>
        <View style={s.footerInner}>
          {hint}
          <View style={s.footerRow}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={goBack}
              disabled={isCompleting}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Go back to the previous step"
              accessibilityState={{ disabled: isCompleting }}
            >
              <Text style={s.backBtnText} maxFontSizeMultiplier={1.3}>
                ← Back
              </Text>
            </TouchableOpacity>
            {primary}
          </View>
        </View>
      </View>
    );

    if (stepIndex === 0) {
      return (
        <View style={s.footer}>
          <View style={s.footerInner}>
            {!termsAccepted && (
              <Text style={s.footerHint}>
                Scroll down and accept the Terms &amp; Privacy Policy to continue.
              </Text>
            )}
            <View style={s.footerRow}>
              <PrimaryButton
                label="Get Started"
                disabled={!termsAccepted}
                onPress={() => setStepIndex(1)}
              />
            </View>
          </View>
        </View>
      );
    }

    if (stepIndex === 1 || stepIndex === 2) {
      return withBack(
        <PrimaryButton label="Continue" onPress={() => setStepIndex((i) => i + 1)} />
      );
    }

    if (stepIndex === 3) {
      const label = checkingAccess
        ? 'Checking permissions…'
        : canLeavePermissions
          ? 'Continue'
          : 'Grant permissions to continue';
      const hint =
        !canLeavePermissions && !checkingAccess && missingPermissions.length > 0 ? (
          <Text style={s.footerHint}>{`Still needed: ${missingPermissions.join(' and ')}.`}</Text>
        ) : undefined;
      return withBack(
        <PrimaryButton
          label={label}
          loading={checkingAccess}
          disabled={!canLeavePermissions}
          onPress={() => setStepIndex(4)}
        />,
        hint
      );
    }

    // stepIndex === 4 — finish
    if (finishError === 'required-perms') {
      return withBack(
        <PrimaryButton
          label="Back to permissions"
          onPress={() => {
            setFinishError(null);
            setStepIndex(3);
          }}
        />,
        <Text style={[s.footerHint, { color: C.warning }]}>
          Required permissions are missing again — grant them to finish setup.
        </Text>
      );
    }

    return withBack(
      <View style={s.finishGroup}>
        <PrimaryButton
          label={
            isCompleting
              ? 'Finishing setup…'
              : finishError === 'persist'
                ? 'Try again'
                : 'Finish — Open Dashboard'
          }
          loading={isCompleting}
          onPress={handleFinish}
        />
        {finishError === 'persist' && !isCompleting && (
          <TouchableOpacity
            style={s.skipBtn}
            onPress={() => router.replace('/dashboard')}
            accessibilityRole="button"
            accessibilityLabel="Continue to the dashboard without saving setup"
          >
            <Text style={s.skipBtnText} maxFontSizeMultiplier={1.3}>
              Continue anyway
            </Text>
          </TouchableOpacity>
        )}
      </View>,
      finishError === 'persist' ? (
        <Text style={[s.footerHint, { color: C.warning }]}>
          We couldn&apos;t save your setup. Check your connection and try again.
        </Text>
      ) : undefined
    );
  };

  // ── Step 1: Welcome ─────────────────────────────────────────────────────────
  const renderWelcome = () => (
    <>
      {renderPanel(
        require('../../assets/onboarding/welcome.webp'),
        'Take back your attention',
        'FocusLock gives every app a daily allowance and locks it the moment the time is up — so your screen time ends when you meant it to, not when you finally notice.',
        'Read more & accept terms'
      )}

      <View style={s.details}>
        <View style={s.stack}>
          {FEATURES.map((f) => (
            <View key={f.id} style={s.featureRow}>
              <View style={s.featureIconBadge}>
                <Image
                  source={f.icon}
                  style={s.featureIcon}
                  contentFit="contain"
                  accessible={false}
                />
              </View>
              <View style={s.flex1}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.termsBox}>
          <TouchableOpacity
            style={s.termsRow}
            activeOpacity={0.7}
            onPress={toggleTerms}
            accessibilityRole="checkbox"
            accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
            accessibilityState={{ checked: termsAccepted }}
          >
            <View style={[s.checkbox, termsAccepted && s.checkboxOn]}>
              {termsAccepted && <Text style={s.checkMark}>✓</Text>}
            </View>
            <Text style={s.termsText}>I agree to the Terms of Service and Privacy Policy</Text>
          </TouchableOpacity>
          <View style={s.linkRow}>
            <TouchableOpacity
              style={s.linkBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/settings/terms')}
              accessibilityRole="link"
              accessibilityLabel="Read the Terms of Service"
            >
              <Text style={s.link}>Terms of Service →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.linkBtn}
              activeOpacity={0.7}
              onPress={() => router.push('/settings/privacy-policy')}
              accessibilityRole="link"
              accessibilityLabel="Read the Privacy Policy"
            >
              <Text style={s.link}>Privacy Policy →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );

  // ── Step 2: Supported apps (informational preview only) ─────────────────────
  const renderSupportedApps = () => {
    const visibleApps = showAllApps
      ? SUPPORTED_IOS_APPS
      : SUPPORTED_IOS_APPS.slice(0, APP_PREVIEW_COUNT);
    const canExpand = SUPPORTED_IOS_APPS.length > APP_PREVIEW_COUNT;

    return (
      <>
        {renderPanel(
          require('../../assets/onboarding/apps.webp'),
          'The apps you want back',
          isIOS
            ? 'These are some of the popular apps FocusLock supports on iPhone.'
            : 'FocusLock can limit apps installed on your phone. These are some popular examples.',
          'See supported apps'
        )}

        <View style={s.details}>
          <View style={s.previewBanner}>
            <View style={s.previewPill}>
              <Text style={s.previewPillText} maxFontSizeMultiplier={1.3}>
                PREVIEW
              </Text>
            </View>
            <Text style={s.previewBannerText}>
              Nothing is selected yet. You&apos;ll choose your apps in the last step.
            </Text>
          </View>

          <View style={s.appGrid}>
            {visibleApps.map((app) => {
              const icon = LOCAL_APP_ICONS[app.id];
              return (
                <View key={app.id} style={[s.appChip, { width: appChipWidth }]}>
                  {icon ? (
                    <Image source={icon} style={s.appIcon} contentFit="cover" accessible={false} />
                  ) : (
                    <View style={[s.appIcon, s.appFallback]}>
                      <Text style={s.appFallbackText}>{app.badgeCode || '?'}</Text>
                    </View>
                  )}
                  <Text style={s.appLabel} numberOfLines={1}>
                    {app.name}
                  </Text>
                </View>
              );
            })}
          </View>

          {canExpand && (
            <TouchableOpacity
              style={s.moreBtn}
              activeOpacity={0.7}
              onPress={() => setShowAllApps((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllApps }}
              accessibilityLabel={
                showAllApps
                  ? 'Show fewer example apps'
                  : `Show all ${SUPPORTED_IOS_APPS.length} example apps`
              }
            >
              <Text style={s.moreBtnText}>
                {showAllApps ? 'Show fewer' : `Show all ${SUPPORTED_IOS_APPS.length} apps`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  };

  // ── Step 3: Daily limits & reset schedule ───────────────────────────────────
  const renderLimits = () => (
    <>
      {renderPanel(
        require('../../assets/onboarding/limits.webp'),
        'Daily limits that reset every day',
        "Each app you pick gets its own allowance. When it's used up, FocusLock locks the app until the next reset — no snooze, no override.",
        'How limits work'
      )}

      <View style={s.details}>
        <View style={s.stack}>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>Daily allowance</Text>
            <Text style={s.infoBody}>
              Give an app a set amount of screen time — say 1 hour of YouTube. The lock appears the
              moment today&apos;s allowance is spent.
            </Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>{`Daily reset · ${resetLabel}`}</Text>
            <Text style={s.infoBody}>
              {`All allowances refill together at ${resetLabel} every day. This is the default schedule — you can change it later from your dashboard.`}
            </Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>{`Safe editing window · ${DEFAULT_WINDOW_MINUTES} min`}</Text>
            <Text style={s.infoBody}>
              {`Existing limits and the schedule unlock for editing in the ${DEFAULT_WINDOW_MINUTES} minutes before each reset (from ${windowOpenLabel}). New apps can be added anytime.`}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  // ── Step 4: Platform permissions ────────────────────────────────────────────
  const chipFor = (on: boolean): ChipKind => (on ? 'ok' : accessPending ? 'neutral' : 'required');
  const chipLabelFor = (on: boolean): string =>
    on ? '✓ Enabled' : accessPending ? 'Checking…' : 'Required';

  const renderAndroidPermissions = () => {
    const usageOn = !!access?.usageAccessGranted;
    const overlayOn = !!access?.overlayGranted;
    const checkFailed = engineAvailable && accessCheckFailed && access === null;

    return (
      <>
        {!engineAvailable && (
          <View style={s.warnBox}>
            <Text style={s.warnTitle}>Usage monitoring isn&apos;t available in this build</Text>
            <Text style={s.warnBody}>
              {__DEV__
                ? "This build doesn't include FocusLock's native usage engine (for example, when running in Expo Go), so permissions can't be verified here. Build the native app with `npx expo run:android` to test enforcement. You can continue setup."
                : "This version of FocusLock can't monitor app usage on your device, so limits can't be enforced yet. You can continue setup, but please update the app or contact support."}
            </Text>
          </View>
        )}

        {checkFailed && (
          <View style={s.warnBox}>
            <Text style={s.warnTitle}>We couldn&apos;t check your permissions</Text>
            <Text style={s.warnBody}>
              Android didn&apos;t answer the permission check. Try again — this is usually
              temporary.
            </Text>
            <TouchableOpacity
              style={s.cardAction}
              activeOpacity={0.85}
              onPress={() => {
                refreshAccess();
              }}
              accessibilityRole="button"
              accessibilityLabel="Check permissions again"
            >
              <Text style={s.cardActionText}>Check again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1 — Usage Access (special access, opened via the usage bridge) */}
        <View style={[s.permCard, usageOn && s.permCardOk]}>
          <View style={s.permHeader}>
            <View style={s.permTitleWrap}>
              <Text style={s.permTitle}>1 · Usage Access</Text>
              <Text style={s.permBody}>
                Lets FocusLock measure today&apos;s screen time for each app — the source of truth
                for every allowance. Tap the button, choose FocusLock in the list, and switch on
                &quot;Permit usage access&quot;. Wording can vary slightly by phone.
              </Text>
            </View>
            <StatusChip kind={chipFor(usageOn)} label={chipLabelFor(usageOn)} />
          </View>
          {!usageOn && (
            <>
              <TouchableOpacity
                style={s.cardAction}
                activeOpacity={0.85}
                onPress={openUsageAccessSettings}
                accessibilityRole="button"
                accessibilityLabel="Open Android settings for Usage Access"
              >
                <Text style={s.cardActionText}>Open Android Settings</Text>
              </TouchableOpacity>
              <Text style={s.recovery}>
                Come back here after switching it on. This screen shows &quot;Enabled&quot; only
                once Android confirms it.
              </Text>
            </>
          )}
        </View>

        {/* 2 — Display over other apps (required by the lock screen overlay) */}
        <View style={[s.permCard, overlayOn && s.permCardOk]}>
          <View style={s.permHeader}>
            <View style={s.permTitleWrap}>
              <Text style={s.permTitle}>2 · Display over other apps</Text>
              <Text style={s.permBody}>
                Lets FocusLock show its lock screen over an app the moment your limit is reached.
                Tap the button, pick FocusLock if asked, and switch on &quot;Allow display over
                other apps&quot;. Wording can vary slightly by phone.
              </Text>
            </View>
            <StatusChip kind={chipFor(overlayOn)} label={chipLabelFor(overlayOn)} />
          </View>
          {!overlayOn && (
            <>
              <TouchableOpacity
                style={s.cardAction}
                activeOpacity={0.85}
                onPress={openOverlaySettings}
                accessibilityRole="button"
                accessibilityLabel="Open Android settings for Display over other apps"
              >
                <Text style={s.cardActionText}>Open Android Settings</Text>
              </TouchableOpacity>
              <Text style={s.recovery}>
                Not in the list? Search Settings for &quot;Display over other apps&quot;. This
                screen refreshes automatically when you return.
              </Text>
            </>
          )}
        </View>

        {renderNotificationsCard('3')}
      </>
    );
  };

  // Optional on both platforms — never blocks setup.
  const renderNotificationsCard = (number: string) => (
    <View style={[s.permCard, notifStatus === 'granted' && s.permCardOk]}>
      <View style={s.permHeader}>
        <View style={s.permTitleWrap}>
          <Text style={s.permTitle}>{`${number} · Notifications (optional)`}</Text>
          <Text style={s.permBody}>
            Warnings 10 minutes before an app locks, real-time lock alerts, and daily reset
            reminders. Limits work fine without them.
          </Text>
        </View>
        <StatusChip
          kind={notifStatus === 'granted' ? 'ok' : 'optional'}
          label={notifStatus === 'granted' ? '✓ Enabled' : 'Optional'}
        />
      </View>
      {notifStatus === 'undetermined' && (
        <TouchableOpacity
          style={[s.cardAction, s.cardActionPrimary]}
          activeOpacity={0.85}
          onPress={handleEnableNotifications}
          accessibilityRole="button"
          accessibilityLabel="Enable notifications"
        >
          <Text style={[s.cardActionText, s.cardActionTextPrimary]}>Enable notifications</Text>
        </TouchableOpacity>
      )}
      {notifStatus === 'denied' && (
        <>
          <TouchableOpacity
            style={s.cardAction}
            activeOpacity={0.85}
            onPress={handleOpenSystemSettings}
            accessibilityRole="button"
            accessibilityLabel="Open system settings to enable notifications"
          >
            <Text style={s.cardActionText}>Open Settings</Text>
          </TouchableOpacity>
          <Text style={s.recovery}>
            Notifications are off. You can turn them on in system Settings anytime — setup
            doesn&apos;t depend on it.
          </Text>
        </>
      )}
    </View>
  );

  const renderIOSPermissions = () => (
    <>
      <View style={s.permCard}>
        <View style={s.permHeader}>
          <View style={s.permTitleWrap}>
            <Text style={s.permTitle}>Screen Time access isn&apos;t available yet</Text>
            <Text style={s.permBody}>
              This build doesn&apos;t use Apple&apos;s Screen Time (Family Controls) yet, so iOS has no
              permission to ask you for — and FocusLock won&apos;t pretend otherwise. You can still
              choose apps and save limits, but apps won&apos;t be locked on iPhone until that support
              ships. Active locking currently works on Android only.
            </Text>
          </View>
          <StatusChip kind="neutral" label="Not available" />
        </View>
      </View>

      <View style={s.permCard}>
        <View style={s.permHeader}>
          <View style={s.permTitleWrap}>
            <Text style={s.permTitle}>App selection on iOS</Text>
            <Text style={s.permBody}>
              Your installed apps are read directly on-device in the final step — no account
              needed, and nothing leaves your phone until you save a limit.
            </Text>
          </View>
          <StatusChip kind="ok" label="✓ Ready" />
        </View>
      </View>

      {renderNotificationsCard('1')}
    </>
  );

  const renderPermissions = () => (
    <>
      {renderPanel(
        require('../../assets/onboarding/permissions.webp'),
        'Permissions',
        isAndroid
          ? 'FocusLock needs two special permissions from Android. Both open Android Settings, and both count only once Android itself confirms them.'
          : 'A quick, honest note about iOS — plus optional notifications.',
        'Review permissions'
      )}
      <View style={s.details}>
        {isAndroid ? renderAndroidPermissions() : renderIOSPermissions()}
      </View>
    </>
  );

  // ── Step 5: App configuration, verification & completion ────────────────────
  const renderSetup = () => {
    const permRow = isAndroid ? (
      engineAvailable ? (
        <CheckRow
          state={accessGranted ? 'ok' : 'missing'}
          label={accessGranted ? 'Permissions confirmed by Android' : 'Required permissions still missing'}
        />
      ) : (
        <CheckRow state="neutral" label="Permissions need the native build" />
      )
    ) : (
      <CheckRow state="neutral" label="Screen Time not available on iOS in this build" />
    );

    return (
      <>
        {renderPanel(
          require('../../assets/onboarding/setup.webp'),
          'Choose your apps & finish',
          'Pick the apps that pull you in and give each one a daily allowance — the same wizard your dashboard uses. You can change everything later.',
          'Choose apps & finish'
        )}

        <View style={s.details}>
          <View style={s.checklist}>
            <CheckRow state={termsAccepted ? 'ok' : 'missing'} label="Terms & Privacy accepted" />
            {permRow}
            <CheckRow
              state={configuredIds.length > 0 ? 'ok' : 'neutral'}
              label={
                configuredIds.length > 0
                  ? `${configuredIds.length} app${configuredIds.length === 1 ? '' : 's'} ready to limit`
                  : 'No apps chosen yet — optional, add them later'
              }
            />
          </View>

          <TouchableOpacity
            style={s.addAppBtn}
            activeOpacity={0.85}
            onPress={() => setShowLimitWizard(true)}
            accessibilityRole="button"
            accessibilityLabel={
              configuredIds.length === 0 ? 'Choose apps and set limits' : 'Add another app'
            }
          >
            <Text style={s.addAppText}>
              {configuredIds.length === 0 ? 'Choose apps & set limits' : 'Add another app'}
            </Text>
            <Text style={s.addAppChevron}>›</Text>
          </TouchableOpacity>

          <Text style={s.footnote}>
            {isIOS
              ? "Limits you save are kept, but FocusLock can't lock apps on iPhone in this build yet. You can add or change apps from the dashboard anytime."
              : 'Locking starts as soon as an allowance exists and the permissions from step 4 are in place. Skipping app selection is fine — the dashboard can add apps anytime.'}
          </Text>
        </View>
      </>
    );
  };

  // ── Screen ──────────────────────────────────────────────────────────────────
  // Steps render on the first frame — never behind a bootstrap spinner. The
  // onboarding-complete check runs fire-and-forget in the mount effect above.
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {renderHeader()}

      <View style={s.stepWrap}>
        {/* Only the body fades between steps; header & footer stay put.
            Keyed by step so the scroll position resets to the image panel. */}
        <Animated.View
          key={stepIndex}
          entering={reduceMotion ? undefined : FadeIn.duration(180)}
          style={s.stepWrap}
          onLayout={(e) => setStepAreaH(Math.round(e.nativeEvent.layout.height))}
        >
          <ScrollView
            ref={scrollRef}
            style={s.scroll}
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={handleScroll}
            scrollEventThrottle={16}
            snapToOffsets={[0, panelHeight]}
            snapToEnd={false}
            decelerationRate="fast"
          >
            {stepIndex === 0 && renderWelcome()}
            {stepIndex === 1 && renderSupportedApps()}
            {stepIndex === 2 && renderLimits()}
            {stepIndex === 3 && renderPermissions()}
            {stepIndex === 4 && renderSetup()}
          </ScrollView>
        </Animated.View>

        {renderFooter()}
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((t) => (t.visible ? { ...t, visible: false } : t))}
      />

      {/* Existing shared wizard — app selection + limit configuration + save */}
      <AppLimitSetupModal
        visible={showLimitWizard}
        onClose={() => setShowLimitWizard(false)}
        existingBundleIds={configuredIds}
        currentResetTime={DEFAULT_RESET_TIME}
        configWindowOpen={false}
        windowMinutes={DEFAULT_WINDOW_MINUTES}
        windowOpenLabel={windowOpenLabel}
        onSuccess={handleAppLimitSuccess}
        showToast={showToast}
      />
    </SafeAreaView>
  );
}

// ─── Small presentational helpers ─────────────────────────────────────────────

/**
 * Step artwork. Always `contain`: the WHOLE image is shown, never cropped, and
 * nothing is drawn on top of it. It is scaled to the full screen width whenever
 * the space is tall enough (both side edges touch the screen). On a screen too
 * short for that, it scales down to fit the height and the blurred backdrop
 * fills the gaps beside it.
 */
function StepArt({ source, reduceMotion }: { source: ImageSource; reduceMotion: boolean }) {
  return (
    <View style={s.artArea}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        contentPosition="center"
        transition={reduceMotion ? 0 : 200}
        accessible={false}
      />
    </View>
  );
}

/**
 * "Read more ⌄" cue under the artwork. The chevron is drawn with borders
 * (not a glyph) so it looks identical on every Android font. It bobs four
 * times to draw the eye, then stops; under "reduce motion" it never animates.
 */
function ReadMore({
  label,
  onPress,
  reduceMotion,
}: {
  label: string;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const y = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    y.value = withRepeat(withTiming(6, { duration: 700 }), 4, true);
  }, [reduceMotion, y]);

  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <TouchableOpacity
      style={s.readMore}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Scrolls down to the rest of this step"
    >
      <Text style={s.readMoreText} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      <Animated.View style={bob}>
        <View style={s.chevron} />
      </Animated.View>
    </TouchableOpacity>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      style={[s.primaryBtn, disabled && s.primaryBtnDisabled]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
    >
      {loading && <ActivityIndicator size="small" color={C.onAccent} />}
      <Text style={s.primaryBtnText} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function StatusChip({ kind, label }: { kind: ChipKind; label: string }) {
  const muted = kind === 'neutral' || kind === 'optional';
  return (
    <View
      style={[s.chip, kind === 'ok' && s.chipOk, kind === 'required' && s.chipRequired, muted && s.chipNeutral]}
      accessibilityLiveRegion="polite"
    >
      <Text
        style={[
          s.chipText,
          kind === 'ok' && s.chipTextOk,
          kind === 'required' && s.chipTextRequired,
          muted && s.chipTextNeutral,
        ]}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </View>
  );
}

function CheckRow({ state, label }: { state: 'ok' | 'missing' | 'neutral'; label: string }) {
  const status = state === 'ok' ? 'Done' : state === 'missing' ? 'Needs attention' : '';
  return (
    <View
      style={s.checkRow}
      accessible
      accessibilityLabel={status ? `${label}. ${status}` : label}
    >
      <View
        style={[s.checkDot, state === 'ok' && s.checkDotOk, state === 'missing' && s.checkDotMissing]}
      >
        <Text style={[s.checkGlyph, state !== 'ok' && s.checkGlyphLight]}>
          {state === 'ok' ? '✓' : state === 'missing' ? '!' : '–'}
        </Text>
      </View>
      <Text style={s.checkText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // ── Shell ───────────────────────────────────────────────────────────────────
  root: {
    flex: 1,
    backgroundColor: C.bg, // near-white canvas (bright, minimal)
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: H_PADDING,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  stepCounter: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  track: {
    flexDirection: 'row',
    gap: 6,
  },
  seg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  segActive: {
    backgroundColor: C.accent, // restrained FocusLock lime
  },

  // ── Step canvas ─────────────────────────────────────────────────────────────
  stepWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  body: {
    width: '100%',
  },
  heading: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: H_PADDING,
    paddingTop: 22,
    gap: 8,
  },
  details: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: H_PADDING,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 16,
  },
  stack: {
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  footnote: {
    fontSize: 12.5,
    color: C.textSecondary,
    lineHeight: 18,
  },

  // ── Image panel ─────────────────────────────────────────────────────────────
  panel: {
    width: '100%',
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  panelScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.55)', // keeps the blurred backdrop light
  },
  artArea: {
    flex: 1,
    width: '100%',
    minHeight: 120,
  },
  panelBottom: {
    height: CUE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: {
    fontSize: 26,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  h1Compact: {
    fontSize: 23,
    lineHeight: 29,
  },
  sub: {
    fontSize: 15,
    color: C.textSecondary,
    lineHeight: 22,
  },
  readMore: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  readMoreText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.textPrimary,
  },
  chevron: {
    width: 12,
    height: 12,
    marginTop: 2,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: C.textPrimary,
    transform: [{ rotate: '45deg' }],
  },

  // ── Welcome: feature rows ───────────────────────────────────────────────────
  featureRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  featureIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIcon: {
    width: 24,
    height: 24,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
  },
  featureBody: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },

  // ── Welcome: terms ──────────────────────────────────────────────────────────
  termsBox: {
    backgroundColor: C.bgCardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '800',
    color: C.onAccent,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: C.textPrimary,
    lineHeight: 19,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 20,
  },
  linkBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accentText,
  },

  // ── Supported apps preview ──────────────────────────────────────────────────
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(91,217,74,0.30)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  previewPill: {
    backgroundColor: C.bgCardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  previewPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: C.accentText,
  },
  previewBannerText: {
    flex: 1,
    fontSize: 13,
    color: C.textPrimary,
    lineHeight: 18,
    fontWeight: '600',
  },
  appGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_GRID_GAP,
  },
  appChip: {
    alignItems: 'center',
    backgroundColor: C.bgCardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 6,
  },
  appIcon: {
    width: 46,
    height: 46,
    borderRadius: 11,
  },
  appFallback: {
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appFallbackText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.accentText,
  },
  appLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textPrimary,
    textAlign: 'center',
  },
  moreBtn: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  moreBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.accentText,
  },

  // ── Info / warning cards ────────────────────────────────────────────────────
  infoCard: {
    backgroundColor: C.bgCardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.textPrimary,
  },
  infoBody: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
  },
  warnBox: {
    backgroundColor: C.warningDim,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  warnTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#B45309',
  },
  warnBody: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },

  // ── Permissions ─────────────────────────────────────────────────────────────
  permCard: {
    backgroundColor: C.bgCardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  permCardOk: {
    borderColor: C.accent,
  },
  permHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  permTitleWrap: {
    flex: 1,
  },
  permTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.textPrimary,
  },
  permBody: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
    marginTop: 3,
  },
  recovery: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
  },
  cardAction: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: C.bgCard,
  },
  cardActionPrimary: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  cardActionText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: C.textPrimary,
  },
  cardActionTextPrimary: {
    color: C.onAccent,
  },

  // ── Status chips ────────────────────────────────────────────────────────────
  chip: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  chipOk: {
    backgroundColor: C.accent,
  },
  chipRequired: {
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  chipNeutral: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextOk: {
    color: C.onAccent,
  },
  chipTextRequired: {
    color: '#B45309',
  },
  chipTextNeutral: {
    color: C.textSecondary,
  },

  // ── Setup checklist ─────────────────────────────────────────────────────────
  checklist: {
    backgroundColor: C.bgCardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotOk: {
    backgroundColor: C.accent,
  },
  checkDotMissing: {
    backgroundColor: '#F59E0B',
  },
  checkGlyph: {
    fontSize: 11,
    fontWeight: '900',
    color: C.onAccent,
  },
  checkGlyphLight: {
    color: '#FFFFFF',
  },
  checkText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: C.textPrimary,
    lineHeight: 18,
  },
  addAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: 'rgba(91,217,74,0.35)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  addAppText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: C.accentText,
  },
  addAppChevron: {
    fontSize: 18,
    fontWeight: '800',
    color: C.accentText,
  },

  // ── Footer & actions ────────────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  footerInner: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerHint: {
    fontSize: 12.5,
    color: C.textSecondary,
    lineHeight: 17,
    textAlign: 'center',
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  primaryBtnText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: C.onAccent,
    letterSpacing: -0.2,
  },
  backBtn: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textSecondary,
  },
  finishGroup: {
    flex: 1,
    gap: 4,
  },
  skipBtn: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.textSecondary,
    textDecorationLine: 'underline',
  },
});
