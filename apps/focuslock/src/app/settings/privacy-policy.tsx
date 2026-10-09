import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { ThemeColors } from '../../lib/theme';

const APP_VERSION = '1.1.5';
const LAST_UPDATED = 'October 2026';
const SUPPORT_EMAIL = 'support@waiyatlabs.space';

interface PrivacySection { title: string; body: string }

// NOTE: Review every section against what FocusLock actually collects and
// does before publishing. These reflect only what the Terms screen states.
const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Overview',
    body:
      'This Privacy Policy explains what information FocusLock collects, how it is used, and the choices you have. We aim to collect only what is needed to provide screen-time management and keep your account working.',
  },
  {
    title: 'Information We Collect',
    body:
      'Account information, such as your email address and the credentials you use to sign in. App usage information, such as which apps you select to limit and the time spent in them, which is used to enforce your daily thresholds. Basic technical information, such as device model and app version, to help us fix issues.',
  },
  {
    title: 'Device Permissions',
    body:
      'FocusLock uses system permissions such as Usage Stats or Accessibility on Android to measure foreground app usage and display lock overlays when a limit is reached. These permissions are used on your device for enforcement and are not used to read the content of your messages, passwords, or other personal data.',
  },
  {
    title: 'How We Use Information',
    body:
      'We use information to provide and enforce your limits, maintain your account, improve reliability and performance, respond to support requests, and keep the Application secure. We do not use your information to show third-party advertising.',
  },
  {
    title: 'On-Device Processing',
    body:
      'Usage monitoring and limit enforcement happen on your device. Information that leaves your device is limited to what is needed to operate your account and, where applicable, sync your settings.',
  },
  {
    title: 'Sharing of Information',
    body:
      'We do not sell your personal information. We may share limited information with service providers who help us operate the Application, or when required by law or to protect the rights and safety of users and Waiyat Labs.',
  },
  {
    title: 'Data Retention and Deletion',
    body:
      'We keep your information for as long as your account is active or as needed to provide the service. You may request deletion of your account and associated data at any time by contacting us, and we will process the request within a reasonable period.',
  },
  {
    title: 'Security',
    body:
      'We use reasonable technical and organizational measures to protect your information. No method of storage or transmission is completely secure, so we cannot guarantee absolute security.',
  },
  {
    title: "Children's Privacy",
    body:
      'FocusLock is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us information, contact us and we will delete it.',
  },
  {
    title: 'Changes to This Policy',
    body:
      'We may update this Privacy Policy from time to time. When we do, we will update the "Last Updated" date shown above. Continued use of FocusLock after any revision constitutes acceptance of the updated policy.',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createPrivacyStyles(colors, isDark);

  const openSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('FocusLock Privacy Inquiry')}`);
  };

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Privacy Policy" onBack={() => router.back()} />
      <ScrollView style={sh.scroll} contentContainerStyle={sh.content} showsVerticalScrollIndicator={false}>
        <View style={styles.wrap}>
          {/* Intro */}
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>FocusLock Privacy Policy</Text>
            <Text style={styles.introBody}>
              Your focus is personal. This policy describes what information FocusLock handles and how we protect it.
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Version {APP_VERSION}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>Updated {LAST_UPDATED}</Text>
            </View>
          </View>

          {PRIVACY_SECTIONS.map((section, i) => (
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

function createPrivacyStyles(C: ThemeColors, isDark: boolean) {
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