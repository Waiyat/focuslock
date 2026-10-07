import React from 'react';
import { Text, ScrollView, View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By downloading, installing, accessing, or using FocusLock ("the Application"), you agree to be legally bound by these Terms of Service. If you do not agree to all terms and conditions set forth herein, you must immediately uninstall and cease all use of the Application.',
  },
  {
    title: '2. Description of Service & Core Functionality',
    body: 'FocusLock is an intentional digital wellbeing and screen-time management tool. The Application allows users to establish daily usage thresholds for specific mobile applications and enforces time limits to assist in reducing habitual device distractions.',
  },
  {
    title: '3. User Accounts & Security',
    body: 'To access FocusLock services, you must register a personal account. You are solely responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized access or security breach.',
  },
  {
    title: '4. Device Permissions & System Integration',
    body: 'To monitor screen-time and enforce your chosen daily limits, FocusLock requires certain system-level permissions (such as Usage Stats, Accessibility, or Screen Time APIs depending on your operating system). These permissions are strictly utilized on your device to measure active foreground app duration and display lock overlays when thresholds are reached.',
  },
  {
    title: '5. Acceptable Use & Non-Circumvention',
    body: 'You agree not to:\n• Reverse engineer, decompile, or disassemble the Application or its underlying security mechanisms.\n• Interfere with or attempt to circumvent lock screens or timers through unauthorized device exploits.\n• Use the Application for any unlawful, harassing, or fraudulent purpose.\n• Attempt unauthorized access to our backend servers, user databases, or API infrastructure.',
  },
  {
    title: '6. Modifications to Restrictions & Cool-down Windows',
    body: 'To preserve the efficacy of digital self-control, FocusLock incorporates intentional restrictions on modifying active limits. You acknowledge and accept that limit modifications may be restricted to designated reset windows (such as the 20-minute window prior to your scheduled daily reset time).',
  },
  {
    title: '7. Disclaimer of Warranties',
    body: 'FocusLock is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express, implied, or statutory. Waiyat Labs does not warrant that the Application will be uninterrupted, error-free, or fully compatible with every third-party launcher or device configuration.',
  },
  {
    title: '8. Limitation of Liability',
    body: 'To the maximum extent permitted by applicable law, in no event shall Waiyat Labs, its developers, or affiliates be liable for any indirect, punitive, incidental, special, or consequential damages arising out of or in connection with the use or inability to use the Application.',
  },
  {
    title: '9. Changes to Terms',
    body: 'We reserve the right to revise or replace these Terms at any time. When substantial changes occur, we will update the "Last Updated" date at the top of this document. Continued use of FocusLock following any revisions constitutes full acceptance of the updated terms.',
  },
];

export default function TermsScreen() {
  const router = useRouter();
  const { sh, isDark, colors } = useSharedStyles();
  const styles = createTermsStyles(colors, isDark);

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@waiyatlabs.space?subject=Terms%20of%20Service%20Inquiry');
  };

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Terms of Service" onBack={() => router.back()} />
      <ScrollView
        style={sh.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Document Header Card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroBadge}>LEGAL AGREEMENT</Text>
          <Text style={styles.heroTitle}>FocusLock Terms of Service</Text>
          <Text style={styles.heroSubtitle}>
            Please review these terms carefully before utilizing FocusLock screen-time controls.
          </Text>
          <View style={styles.versionPill}>
            <Text style={styles.versionText}>Version 1.0 · Last Updated: September 2024</Text>
          </View>
        </View>

        {/* Grouped Section Cards */}
        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        {/* Contact & Support Card */}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Questions or Inquiries?</Text>
          <Text style={styles.contactBody}>
            If you have questions regarding these Terms or need clarification, please reach out to our legal and support team.
          </Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleContactSupport}
            activeOpacity={0.7}
          >
            <Text style={styles.contactButtonText}>Contact support@waiyatlabs.space</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Notice */}
        <View style={styles.footerNoteWrap}>
          <Text style={styles.footerNoteText}>
            Waiyat Labs Inc. All rights reserved. FocusLock is a registered digital wellbeing product.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createTermsStyles(colors: any, isDark: boolean) {
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
    color: '#007aff',
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
