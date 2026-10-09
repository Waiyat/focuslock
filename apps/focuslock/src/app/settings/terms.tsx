import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { ThemeColors } from '../../lib/theme';

const APP_VERSION = '1.1.5';
const LAST_UPDATED = 'October 2026';
const SUPPORT_EMAIL = 'support@waiyatlabs.space';

interface TermsSection { title: string; body: string }

const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'Acceptance of Terms',
    body:
      'By downloading, installing, accessing, or using FocusLock (the "Application"), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must discontinue use and uninstall the Application.',
  },
  {
    title: 'Description of Service',
    body:
      'FocusLock is an intentional digital wellbeing and screen-time management tool. It lets you set daily usage thresholds for specific applications and enforces those limits on-device to help reduce habitual distractions.',
  },
  {
    title: 'Your Account',
    body:
      'A personal account is required to use FocusLock. You are responsible for safeguarding your credentials and for all activity that occurs under your account. Notify us immediately of any unauthorized access or suspected breach.',
  },
  {
    title: 'Device Permissions',
    body:
      'To measure foreground app usage and display lock overlays when a limit is reached, FocusLock requires system permissions such as Usage Stats or Accessibility on Android. These permissions are used strictly on your device for enforcement and are never used to read personal content.',
  },
  {
    title: 'Acceptable Use',
    body:
      'You agree not to reverse engineer or tamper with the Application or its enforcement mechanisms, attempt to bypass lock screens or timers through exploits, or use the Application for any unlawful, harassing, or fraudulent purpose.',
  },
  {
    title: 'Modifying Limits',
    body:
      'To preserve the integrity of self-imposed limits, active restrictions can only be changed during your designated reset window (the period shortly before your scheduled daily reset). This design prevents impulsive mid-day adjustments.',
  },
  {
    title: 'Disclaimer',
    body:
      'FocusLock is provided on an "AS IS" and "AS AVAILABLE" basis, without warranties of any kind. We do not warrant uninterrupted operation or compatibility with every device configuration or third-party launcher.',
  },
  {
    title: 'Limitation of Liability',
    body:
      'To the maximum extent permitted by law, Waiyat Labs and its affiliates shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of, or inability to use, the Application.',
  },
  {
    title: 'Changes to These Terms',
    body:
      'We may revise these Terms from time to time. When we do, we will update the "Last Updated" date shown above. Continued use of FocusLock after any revision constitutes acceptance of the updated Terms.',
  },
];

export default function TermsScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createTermsStyles(colors, isDark);

  const openSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('FocusLock Terms Inquiry')}`);
  };

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Terms of Service" onBack={() => router.back()} />
      <ScrollView style={sh.scroll} contentContainerStyle={sh.content} showsVerticalScrollIndicator={false}>
        <View style={styles.wrap}>
          {/* Intro */}
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>FocusLock Terms of Service</Text>
            <Text style={styles.introBody}>
              Please read these terms carefully. They explain your rights and responsibilities when using FocusLock to manage screen time on your device.
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Version {APP_VERSION}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>Updated {LAST_UPDATED}</Text>
            </View>
          </View>

          {TERMS_SECTIONS.map((section, i) => (
            <View key={section.title}>
              <Text style={sh.sectionLabel}>{`${i + 1}. ${section.title}`}</Text>
              <View style={sh.card}>
                <View style={styles.sectionBodyWrap}>
                  <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
              </View>
            </View>
          ))}

          {/* Contact */}
          <Text style={sh.sectionLabel}>Questions</Text>
          <View style={sh.card}>
            <TouchableOpacity style={sh.row} onPress={openSupport} activeOpacity={0.6}>
              <View style={sh.rowBody}>
                <Text style={[sh.rowLabel, { color: colors.accentText }]}>Contact Support</Text>
                <Text style={sh.rowSub}>{SUPPORT_EMAIL}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            {'Waiyat Labs. All rights reserved.\nFocusLock is a digital wellbeing product of Waiyat Labs.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createTermsStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',
    },
    introCard: {
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      marginHorizontal: 16,
      marginBottom: 24,
    },
    introTitle: {
      color: C.textPrimary,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
      marginBottom: 6,
    },
    introBody: {
      color: C.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    metaText: {
      color: C.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: C.textMuted,
    },
    sectionBodyWrap: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    sectionBody: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    chevron: {
      color: C.textMuted,
      fontSize: 22,
      fontWeight: '300',
      lineHeight: 24,
    },
    footer: {
      color: C.textMuted,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      marginHorizontal: 32,
      marginTop: 4,
    },
  });
}
