import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { ThemeColors } from '../../lib/theme';

const APP_VERSION = '1.1.5';
const LAST_UPDATED = 'October 2026';
const SUPPORT_EMAIL = 'support@waiyatlabs.space';

interface PrivacySection {
  title: string;
  body: string;
}

const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'Overview',
    body:
      'FocusLock is a digital wellbeing application developed by Waiyat Labs. This Privacy Policy explains how information is handled when you use FocusLock, including information processed on your device and information needed to operate your account. We aim to limit collection to what is reasonably necessary to provide and maintain the service.',
  },
  {
    title: 'Information We Handle',
    body:
      'Depending on the features you use, FocusLock may handle your account information, such as your email address and authentication details; your selected app limits and related settings; and app-usage information needed to calculate usage and enforce limits. We may also process technical and diagnostic information, such as your app version and device or session identifiers, to support security, account management, and troubleshooting. The precise information processed depends on the features and services you use.',
  },
  {
    title: 'App Usage and Device Permissions',
    body:
      'On Android, FocusLock may require Usage Access and other system permissions, depending on the features available on your device. These permissions allow supported features to identify app usage, calculate time against your limits, and enforce restrictions. FocusLock is designed to manage app usage, not to read the contents of your messages, passwords, or private conversations. You can review or revoke permissions in your device settings, although some features may stop working.',
  },
  {
    title: 'How We Use Information',
    body:
      'Information is used to provide screen-time controls, calculate usage against configured limits, maintain your account and device session, synchronize relevant settings where supported, troubleshoot problems, respond to support requests, and protect the service from misuse. FocusLock is not designed to serve third-party advertisements.',
  },
  {
    title: 'On-Device Processing and Online Services',
    body:
      'Some app-usage monitoring and enforcement operations are performed locally on your device. Account authentication and supported online features also rely on remote services. For example, FocusLock uses Supabase authentication, and its backend may process account or device-session information needed to provide supported features. Therefore, not all information handled by FocusLock necessarily remains on your device.',
  },
  {
    title: 'Authentication and Device Sessions',
    body:
      'FocusLock may maintain an active-device session associated with your account. The current service is designed to allow one active device session per account; signing in on another device may invalidate the previous session. Authentication and session information is processed to verify access and maintain account security.',
  },
  {
    title: 'Sharing and Service Providers',
    body:
      'Waiyat Labs does not sell your personal information. Information may be processed by service providers that help deliver FocusLock, such as authentication and hosting providers, to the extent needed to operate the service. Information may also be disclosed when required by applicable law or when reasonably necessary to protect users, the service, or legal rights.',
  },
  {
    title: 'Data Retention and Account Deletion',
    body:
      'Information is retained for as long as reasonably necessary to provide the service, maintain security, meet legal obligations, and resolve legitimate disputes. You may request account deletion by contacting support. We will review and process the request, subject to applicable legal requirements and any limited retention that is legitimately necessary. Contacting support does not itself confirm that deletion has been completed.',
  },
  {
    title: 'Uninstalling FocusLock',
    body:
      'Uninstalling FocusLock removes the application from your device, but it should not be assumed to delete your online account or all information held by online services. Some device-local settings or usage records may also be removed when the app is uninstalled. If you want your account and associated data deleted, contact support to request account deletion.',
  },
  {
    title: 'Security',
    body:
      'We use reasonable measures intended to protect information handled by FocusLock. However, no application, storage system, or method of transmission can be guaranteed completely secure. You should keep your device secure and avoid sharing your account credentials with others.',
  },
  {
    title: "Children's Privacy",
    body:
      'FocusLock is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal information to us, please contact support so the situation can be reviewed and appropriate action taken.',
  },
  {
    title: 'Your Choices',
    body:
      'You can manage supported device permissions through your device settings and contact support with questions about your account or a request to delete your data. Revoking permissions may affect app-usage monitoring and enforcement. Available controls may vary by device, operating system, and application version.',
  },
  {
    title: 'Changes to This Policy',
    body:
      'This Privacy Policy may be updated as FocusLock changes. When it is revised, we will update the date shown on this screen. Where required, we will provide additional notice of material changes. Please review the policy periodically.',
  },
  {
    title: 'Contact Us',
    body:
      'For privacy questions, requests concerning your personal information, or account-deletion requests, contact support@waiyatlabs.space.',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createPrivacyStyles(colors, isDark);

  const openSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      'FocusLock Privacy Inquiry',
    )}`;

    try {
      const supported = await Linking.canOpenURL(url);

      if (!supported) {
        Alert.alert(
          'Email unavailable',
          `Please email ${SUPPORT_EMAIL} directly.`,
        );
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Unable to open email',
        `Please email ${SUPPORT_EMAIL} directly.`,
      );
    }
  };

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Privacy Policy" onBack={() => router.back()} />

      <ScrollView
        style={sh.scroll}
        contentContainerStyle={sh.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wrap}>
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>FocusLock Privacy Policy</Text>

            <Text style={styles.introBody}>
              Your focus is personal. Learn what information FocusLock handles,
              why it is needed, and how to contact us about your privacy.
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>Version {APP_VERSION}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.metaText}>Updated {LAST_UPDATED}</Text>
            </View>
          </View>

          {PRIVACY_SECTIONS.map((section, index) => (
            <View key={section.title}>
              <Text style={sh.sectionLabel}>
                {`${index + 1}. ${section.title}`}
              </Text>

              <View style={sh.card}>
                <View style={styles.sectionBodyWrap}>
                  <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
              </View>
            </View>
          ))}

          <Text style={sh.sectionLabel}>Privacy Support</Text>

          <View style={sh.card}>
            <TouchableOpacity
              style={sh.row}
              onPress={openSupport}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Email FocusLock privacy support"
            >
              <View style={sh.rowBody}>
                <Text style={[sh.rowLabel, { color: colors.accentText }]}>
                  Contact Support
                </Text>
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
      marginBottom: 16,
    },
  });
}