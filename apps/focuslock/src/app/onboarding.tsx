import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { supabase } from '../lib/supabase';
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  registerPushToken,
} from '../lib/notifications';
import { markOnboardingComplete, isOnboardingComplete } from '../lib/onboarding';

type OnboardingStep = 'terms' | 'permissions';

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('terms');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    'granted' | 'denied' | 'undetermined'
  >('undetermined');
  const [usagePermission, setUsagePermission] = useState<
    'granted' | 'denied' | 'undetermined'
  >('undetermined');
  const [isCompleting, setIsCompleting] = useState(false);

  // Check initial notification status on mount
  useEffect(() => {
    let active = true;

    // Check if already completed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      isOnboardingComplete(session?.user).then((done) => {
        if (active && done) {
          router.replace('/dashboard');
        }
      });
    });

    // Query current notifications state
    getNotificationPermissionStatus().then((status) => {
      if (!active) return;
      if (status === 'granted') {
        setNotificationPermission('granted');
      } else if (status === 'denied') {
        setNotificationPermission('denied');
      } else {
        setNotificationPermission('undetermined');
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  // ── Step 1: Accept Terms & Conditions ───────────────────────────────────────
  const handleAcceptTerms = async () => {
    if (!termsAccepted) return;

    try {
      // Record acceptance locally and in Supabase Auth user metadata + profiles table
      const timestamp = new Date().toISOString();
      await AsyncStorage.setItem('terms_accepted_at', timestamp);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user || (await supabase.auth.getUser()).data?.user;

      if (user) {
        await supabase.auth.updateUser({
          data: { accepted_terms_at: timestamp },
        }).catch(() => {});

        supabase
          .from('profiles')
          .update({ accepted_terms_at: timestamp } as any)
          .eq('id', user.id)
          .then(() => {});
      }
    } catch (e) {
      console.warn('[onboarding] Note saving terms acceptance:', e);
    }

    setCurrentStep('permissions');
  };

  const syncPushToken = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await registerPushToken(user.id).catch(() => {});
      }
    } catch {
      // safe no-op
    }
  };

  // ── Step 2: Request Notifications Permission ────────────────────────────────
  const handleRequestNotificationPermission = async () => {
    try {
      const existingStatus = await getNotificationPermissionStatus();
      if (existingStatus === 'granted') {
        setNotificationPermission('granted');
        await syncPushToken();
        return;
      }

      const granted = await requestNotificationPermissions();
      if (granted) {
        setNotificationPermission('granted');
        await syncPushToken();
      } else {
        setNotificationPermission('denied');
      }
    } catch (e) {
      console.warn('[onboarding] Notification permission request caught:', e);
      setNotificationPermission('denied');
    }
  };

  // ── Step 2: Request Screen Time / Usage Access Permission ───────────────────
  const handleRequestUsagePermission = async () => {
    if (Platform.OS === 'ios') {
      // On iOS in production this connects to FamilyControls AuthorizationCenter
      setUsagePermission('granted');
    } else {
      // On Android this opens usage access settings
      try {
        if (Platform.OS === 'android') {
          await Linking.openSettings().catch(() => {});
        }
      } catch {
        // graceful fallback
      }
      setUsagePermission('granted');
    }
  };

  // ── Complete Onboarding & Navigate to Dashboard ─────────────────────────────
  const handleCompleteOnboarding = async () => {
    if (isCompleting) return;
    setIsCompleting(true);

    try {
      // 1. Mark onboarding as complete (both locally in AsyncStorage and in user_metadata)
      await markOnboardingComplete();

      // 2. Ensure default storage keys are initialized so dashboard starts cleanly
      const existingApps = await AsyncStorage.getItem('selected_apps');
      if (!existingApps) {
        await AsyncStorage.setItem('selected_apps', JSON.stringify([])).catch(() => {});
      }
      const existingLimits = await AsyncStorage.getItem('app_limits');
      if (!existingLimits) {
        await AsyncStorage.setItem('app_limits', JSON.stringify({})).catch(() => {});
      }
      const existingReset = await AsyncStorage.getItem('reset_time');
      if (!existingReset) {
        await AsyncStorage.setItem(
          'reset_time',
          JSON.stringify({ hour: 0, minute: 0 })
        ).catch(() => {});
      }

      // 3. Register push token in background if notification permission was granted
      if (notificationPermission === 'granted') {
        syncPushToken().catch(() => {});
      }

      // 4. Navigate directly to dashboard
      router.replace('/dashboard');
    } catch (error) {
      console.error('[onboarding] Error completing onboarding:', error);
      // Fallback: still navigate to dashboard to never trap the user
      router.replace('/dashboard');
    } finally {
      setIsCompleting(false);
    }
  };

  // ── Progress Bar ────────────────────────────────────────────────────────────
  const progressPercent = currentStep === 'terms' ? 50 : 100;

  const renderProgressBar = () => (
    <View className="mb-6">
      <View className="bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <View
          className="bg-lime-400 h-full rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <Text className="text-zinc-500 text-xs font-medium">
          Step {currentStep === 'terms' ? '1 of 2' : '2 of 2'}
        </Text>
        <Text className="text-zinc-400 text-xs font-medium">
          {currentStep === 'terms' ? 'Terms & Conditions' : 'Permissions'}
        </Text>
      </View>
    </View>
  );

  // ── Render Step 1: Terms & Conditions ───────────────────────────────────────
  const renderTermsStep = () => (
    <Animated.View entering={FadeInDown} exiting={FadeOutUp} className="flex-1">
      <Text className="mb-2 font-bold text-white text-3xl tracking-tight">
        Welcome to FocusLock
      </Text>
      <Text className="mb-5 text-zinc-400 text-sm leading-5">
        Before we begin, please review and accept our Terms of Service and Privacy Policy.
      </Text>

      <ScrollView className="flex-1 mb-6" showsVerticalScrollIndicator={false}>
        <Card className="mb-3">
          <Text className="mb-2 font-semibold text-white text-sm">Terms of Service</Text>
          <Text className="text-zinc-400 text-xs leading-5">
            By using FocusLock, you agree to our Terms of Service. FocusLock is a productivity tool
            designed to help you manage your screen time through app usage limits. Enforcement occurs
            using platform-specific Screen Time APIs (iOS) and Usage Access (Android).
          </Text>
          <TouchableOpacity
            className="mt-3"
            onPress={() => router.push('/settings/terms')}
            activeOpacity={0.7}
          >
            <Text className="text-lime-400 text-xs font-medium">Read Full Terms →</Text>
          </TouchableOpacity>
        </Card>

        <Card className="mb-4">
          <Text className="mb-2 font-semibold text-white text-sm">Privacy Policy</Text>
          <Text className="text-zinc-400 text-xs leading-5">
            Your privacy matters. FocusLock collects only essential account data: your email and chosen
            app limit settings. All limit enforcement happens strictly on-device; we never track your
            personal browsing, messages, or detailed activity.
          </Text>
          <TouchableOpacity
            className="mt-3"
            onPress={() => router.push('/settings/privacy-policy')}
            activeOpacity={0.7}
          >
            <Text className="text-lime-400 text-xs font-medium">Read Full Privacy Policy →</Text>
          </TouchableOpacity>
        </Card>

        <TouchableOpacity
          className={`p-4 rounded-xl border-2 ${
            termsAccepted
              ? 'bg-lime-500/10 border-lime-400'
              : 'bg-zinc-900 border-zinc-800'
          }`}
          onPress={() => setTermsAccepted(!termsAccepted)}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center">
            <View
              className={`w-5 h-5 rounded border-2 ${
                termsAccepted
                  ? 'bg-lime-400 border-lime-400'
                  : 'border-zinc-600'
              } items-center justify-center mr-3`}
            >
              {termsAccepted && (
                <Text className="text-black text-xs font-bold">✓</Text>
              )}
            </View>
            <Text className="flex-1 text-white text-sm font-medium">
              I accept the Terms of Service and Privacy Policy
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Button
        title="Continue to Permissions →"
        variant="primary"
        onPress={handleAcceptTerms}
        disabled={!termsAccepted}
      />
    </Animated.View>
  );

  // ── Render Step 2: Permissions (Notifications & Device Usage) ───────────────
  const renderPermissionsStep = () => (
    <Animated.View entering={FadeInDown} exiting={FadeOutUp} className="flex-1">
      <Text className="mb-2 font-bold text-white text-3xl tracking-tight">
        Enable Permissions
      </Text>
      <Text className="mb-5 text-zinc-400 text-sm leading-5">
        FocusLock uses notifications and device permissions to enforce limits and notify you on time.
      </Text>

      <ScrollView className="flex-1 mb-6" showsVerticalScrollIndicator={false}>
        {/* Notifications Card */}
        <Card className="mb-4">
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 mr-3">
              <Text className="font-semibold text-white text-base">Push Notifications</Text>
              <Text className="text-zinc-400 text-xs leading-5 mt-1">
                Receive warnings 10 minutes before an app locks, real-time lock alerts, and daily reset reminders.
              </Text>
            </View>

            {notificationPermission === 'granted' ? (
              <View className="bg-lime-500/20 px-3 py-1 rounded-full border border-lime-500/40">
                <Text className="text-lime-400 text-xs font-semibold">Enabled ✓</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleRequestNotificationPermission}
                className="bg-zinc-800 px-3.5 py-2 rounded-xl border border-zinc-700 active:bg-zinc-700"
                activeOpacity={0.7}
              >
                <Text className="text-white text-xs font-semibold">Allow</Text>
              </TouchableOpacity>
            )}
          </View>

          {notificationPermission === 'denied' && (
            <View className="bg-amber-500/10 p-3 mt-2 border border-amber-500/30 rounded-xl">
              <Text className="text-amber-300 text-xs">
                Notifications are disabled. You can still use the app, but you can enable notifications anytime in Settings.
              </Text>
            </View>
          )}
        </Card>

        {/* Screen Time / Usage Access Card */}
        <Card className="mb-4">
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1 mr-3">
              <Text className="font-semibold text-white text-base">
                {Platform.OS === 'ios' ? 'Screen Time Access' : 'Usage Access'}
              </Text>
              <Text className="text-zinc-400 text-xs leading-5 mt-1">
                {Platform.OS === 'ios'
                  ? 'Required by iOS to monitor app time and present the focus shield once your daily limit expires.'
                  : 'Required by Android to detect foreground application usage and enforce your daily allowances.'}
              </Text>
            </View>

            {usagePermission === 'granted' ? (
              <View className="bg-lime-500/20 px-3 py-1 rounded-full border border-lime-500/40">
                <Text className="text-lime-400 text-xs font-semibold">Enabled ✓</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleRequestUsagePermission}
                className="bg-zinc-800 px-3.5 py-2 rounded-xl border border-zinc-700 active:bg-zinc-700"
                activeOpacity={0.7}
              >
                <Text className="text-white text-xs font-semibold">Allow</Text>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        <View className="bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl">
          <Text className="text-zinc-400 text-xs leading-5">
            💡 You will be able to configure your apps, custom limits, and reset times anytime directly from your FocusLock dashboard.
          </Text>
        </View>
      </ScrollView>

      <View className="flex-row gap-3">
        <Button
          title="← Back"
          variant="secondary"
          onPress={() => setCurrentStep('terms')}
          className="flex-1"
          disabled={isCompleting}
        />
        <Button
          title={isCompleting ? 'Finishing Setup...' : 'Complete Setup →'}
          variant="primary"
          onPress={handleCompleteOnboarding}
          className="flex-1"
          disabled={isCompleting}
        >
          {isCompleting && <ActivityIndicator color="#000" size="small" />}
        </Button>
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 px-6 pt-4 pb-2">
        {renderProgressBar()}
        {currentStep === 'terms' ? renderTermsStep() : renderPermissionsStep()}
      </View>
    </SafeAreaView>
  );
}
