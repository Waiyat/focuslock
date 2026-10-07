import React from 'react';
import { Text, ScrollView, View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';

const PRIVACY_SECTIONS = [
  {
    title: '1. Our Privacy Commitment',
    body: 'At FocusLock, privacy is not an afterthought—it is foundational to how we build software. We believe your screen-time habits and personal focus choices belong exclusively to you. We do not monetize your attention, track your browsing activity, or sell your telemetry data to data brokers or advertising networks.',
  },
  {
    title: '2. Information We Collect',
    body: 'We collect only the minimal data required to provide and synchronize your digital wellbeing settings:\n• Account Information: Your email address, username, and authentication tokens created during sign up.\n• FocusLock Configuration: The specific app packages you choose to restrict, your daily allocated time limits, strictness settings, and chosen reset times.\n• Daily Usage Counters: Aggregate minutes spent per restricted application today, necessary to determine when lock triggers engage.',
  },
  {
    title: '3. What We Never Collect',
    body: 'FocusLock is strictly an enforcement and timer utility. We NEVER monitor or access:\n• In-app text, chats, emails, or personal messages.\n• Browsing history, URLs visited, or web searches.\n• Keystrokes, passwords, or personal credentials.\n• Photos, camera feeds, audio recordings, or location data.\n• Contact lists or personal files.',
  },
  {
    title: '4. How Your Data Is Used',
    body: 'Data collected by FocusLock is utilized strictly for:\n• Enforcing your designated screen-time limits on your device.\n• Synchronizing your restrictions and streak records across authenticated sessions.\n• Triggering local warnings (e.g., 15 minutes before daily limit lockout).\n• Executing daily usage resets at your specified reset hour.',
  },
  {
    title: '5. Data Storage & Military-Grade Encryption',
    body: 'All communications between the Application and our backend are encrypted via modern TLS 1.3 transport security. Remote database records are safeguarded using Postgres Row-Level Security (RLS) and AES-256 encryption at rest. Device-side authentication tokens are stored securely within your hardware device enclave (iOS Keychain / Android Keystore).',
  },
  {
    title: '6. Zero Third-Party Sharing or Advertising',
    body: 'We do not sell, rent, lease, or monetize your personal usage information to any third parties. We do not embed ad-tracking SDKs, marketing trackers, or cross-app behavioral analytic systems in the Application.',
  },
  {
    title: '7. Data Retention & Account Deletion',
    body: 'You maintain absolute control over your personal data. You can inspect or update your account details at any time in Account Settings. If you choose to delete your account, you can initiate immediate, permanent deletion directly inside the app, which removes all associated database records and tokens within 30 days.',
  },
  {
    title: '8. Children’s Privacy',
    body: 'FocusLock is not directed toward individuals under the age of 13. We do not knowingly solicit or collect personally identifiable information from children under 13.',
  },
  {
    title: '9. Updates to this Privacy Policy',
    body: 'We may periodically update this policy to reflect enhancements in our features or changes in regulatory standards. We will alert you to meaningful revisions by updating the date below and notifying you within the Application.',
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createPrivacyPolicyStyles(colors, isDark);

  const handleContactPrivacy = () => {
    Linking.openURL('mailto:privacy@waiyatlabs.space?subject=Privacy%20Inquiry%20FocusLock');
  };

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Privacy Policy" onBack={() => router.back()} />
      <ScrollView
        style={sh.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroBadge}>PRIVACY FIRST</Text>
          <Text style={styles.heroTitle}>FocusLock Privacy Policy</Text>
          <Text style={styles.heroSubtitle}>
            How we protect your personal information, on-device usage, and account security.
          </Text>
          <View style={styles.versionPill}>
            <Text style={styles.versionText}>Version 1.0 · Last Updated: September 2024</Text>
          </View>
        </View>

        {/* Section Cards */}
        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        {/* Contact & Support Card */}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Privacy Concerns or Data Requests?</Text>
          <Text style={styles.contactBody}>
            For questions regarding data practices, export requests, or privacy inquiries, contact our Data Protection team.
          </Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactPrivacy}
            activeOpacity={0.7}
          >
            <Text style={styles.contactButtonText}>Contact privacy@waiyatlabs.space</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footerNoteWrap}>
          <Text style={styles.footerNoteText}>
            Waiyat Labs Inc. All rights reserved. FocusLock complies with strict digital privacy guidelines.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createPrivacyPolicyStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: isDark ? colors.bgCardSolid : '#ffffff',
    borderRadius: 14,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBadge: {
    color: '#34c759',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  versionPill: {
    alignSelf: 'flex-start',
    backgroundColor: isDark ? colors.bgInput : '#f2f2f7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  versionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: isDark ? colors.bgCardSolid : '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  sectionBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  contactCard: {
    backgroundColor: isDark ? colors.bgCardSolid : '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  contactBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  contactButton: {
    backgroundColor: isDark ? colors.bgInput : '#f2f2f7',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  footerNoteWrap: {
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  footerNoteText: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  });
}
