import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { playSelectionFeedback, playLightFeedback } from '../../lib/feedback';
import { useTheme } from '../../lib/ThemeContext';
import { ThemeColors } from '../../lib/theme';

interface RowItem {
  id: string;
  label: string;
  subtitle?: string;
  value?: string;
  icon: any;
  onPress: () => void;
  danger?: boolean;
}

interface Section {
  sectionId: string;
  title: string;
  rows: RowItem[];
}

const SETTINGS_ICONS = {
  account: require('../../../assets/settings/account.webp'),
  notifications: require('../../../assets/settings/notifications.webp'),
  privacy: require('../../../assets/settings/privacy.webp'),
  focus: require('../../../assets/settings/focus.webp'),
  help: require('../../../assets/settings/help.webp'),
  feedback: require('../../../assets/settings/feedback.webp'),
  terms: require('../../../assets/settings/terms.webp'),
  privacyPolicy: require('../../../assets/settings/privacy-policy.webp'),
  signout: require('../../../assets/settings/signout.webp'),
};

function SettingsRow({
  item,
  isFirst,
  isLast,
  styles,
}: {
  item: RowItem;
  isFirst: boolean;
  isLast: boolean;
  styles: any;
}) {
  return (
    <View style={styles.rowWrapper}>
      <TouchableOpacity
        activeOpacity={0.65}
        onPress={() => {
          playSelectionFeedback();
          item.onPress();
        }}
        style={[
          styles.row,
          isFirst && styles.rowFirst,
          isLast && styles.rowLast,
        ]}
      >
        <Image
          source={item.icon}
          style={styles.rowIcon}
          contentFit="cover"
          transition={150}
        />
        <View style={styles.rowBody}>
          <Text style={[styles.rowLabel, item.danger && styles.rowLabelDanger]}>
            {item.label}
          </Text>
          {item.subtitle ? <Text style={styles.rowSub}>{item.subtitle}</Text> : null}
        </View>
        {item.value ? <Text style={styles.rowValue}>{item.value}</Text> : null}
        {!item.danger && <Text style={styles.chevron}>›</Text>}
      </TouchableOpacity>
      {!isLast && <View style={styles.insetDivider} />}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { isDark, colors, themeMode, setThemeMode, systemScheme } = useTheme();
  const styles = useMemo(() => createSettingsStyles(colors, isDark), [colors, isDark]);

  const [profile, setProfile] = useState<{
    username?: string;
    display_name?: string;
    email?: string;
    avatar_url?: string | null;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setProfile({
                username: data.username,
                display_name: data.display_name,
                email: user.email,
                avatar_url: data.avatar_url,
              });
            } else {
              setProfile({ email: user.email });
            }
          });
      }
    });
  }, []);

  const sections: Section[] = [
    {
      sectionId: 'preferences',
      title: 'Preferences',
      rows: [
        {
          id: 'notifications',
          label: 'Notifications',
          subtitle: 'Alerts, audio chime & banners',
          icon: SETTINGS_ICONS.notifications,
          onPress: () => router.push('/settings/notifications'),
        },
        {
          id: 'privacy',
          label: 'Privacy & Security',
          subtitle: 'Diagnostics & data permissions',
          icon: SETTINGS_ICONS.privacy,
          onPress: () => router.push('/settings/privacy'),
        },
        {
          id: 'focus',
          label: 'Focus Preferences',
          subtitle: 'Strictness & window controls',
          icon: SETTINGS_ICONS.focus,
          onPress: () => router.push('/settings/focus'),
        },
      ],
    },
    {
      sectionId: 'support',
      title: 'Support & Legal',
      rows: [
        {
          id: 'help',
          label: 'Help & FAQ',
          subtitle: 'Guides and common questions',
          icon: SETTINGS_ICONS.help,
          onPress: () => router.push('/settings/help'),
        },
        {
          id: 'feedback',
          label: 'Send Feedback',
          subtitle: 'Report an issue or suggest feature',
          icon: SETTINGS_ICONS.feedback,
          onPress: () => router.push('/settings/feedback'),
        },
        {
          id: 'terms',
          label: 'Terms of Service',
          icon: SETTINGS_ICONS.terms,
          onPress: () => router.push('/settings/terms'),
        },
        {
          id: 'privacy-policy',
          label: 'Privacy Policy',
          icon: SETTINGS_ICONS.privacyPolicy,
          onPress: () => router.push('/settings/privacy-policy'),
        },
      ],
    },
    {
      sectionId: 'account',
      title: '',
      rows: [
        {
          id: 'signout',
          label: 'Sign Out',
          danger: true,
          icon: SETTINGS_ICONS.signout,
          onPress: async () => {
            playLightFeedback();
            await supabase.auth.signOut();
            router.replace('/');
          },
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.6}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Apple ID Style Profile Card */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.appleIdCard}
          onPress={() => {
            playSelectionFeedback();
            router.push('/settings/account');
          }}
        >
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.appleIdAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.appleIdAvatarFallback}>
              <Text style={styles.appleIdAvatarText}>
                {profile?.username ? profile.username.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
          )}
          <View style={styles.appleIdBody}>
            <Text style={styles.appleIdName} numberOfLines={1}>
              {profile?.display_name || (profile?.username ? `@${profile.username}` : 'FocusLock User')}
            </Text>
            <Text style={styles.appleIdSub} numberOfLines={1}>
              {profile?.email || 'FocusLock Account, Profile & Security'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Appearance Mode Card */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>APPEARANCE</Text>
          <View style={styles.appearanceCard}>
            <View style={styles.appearanceRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  playLightFeedback();
                  setThemeMode('system');
                }}
                style={[
                  styles.appearanceBtn,
                  themeMode === 'system' && styles.appearanceBtnActive,
                ]}
              >
                <View style={[styles.radioCircle, themeMode === 'system' && styles.radioCircleActive]}>
                  {themeMode === 'system' && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.appearanceLabel, themeMode === 'system' && styles.appearanceLabelActive]}>
                  System
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  playLightFeedback();
                  setThemeMode('light');
                }}
                style={[
                  styles.appearanceBtn,
                  themeMode === 'light' && styles.appearanceBtnActive,
                ]}
              >
                <View style={[styles.radioCircle, themeMode === 'light' && styles.radioCircleActive]}>
                  {themeMode === 'light' && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.appearanceLabel, themeMode === 'light' && styles.appearanceLabelActive]}>
                  Light
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  playLightFeedback();
                  setThemeMode('dark');
                }}
                style={[
                  styles.appearanceBtn,
                  themeMode === 'dark' && styles.appearanceBtnActive,
                ]}
              >
                <View style={[styles.radioCircle, themeMode === 'dark' && styles.radioCircleActive]}>
                  {themeMode === 'dark' && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.appearanceLabel, themeMode === 'dark' && styles.appearanceLabelActive]}>
                  Dark
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.appearanceDescription}>
              {themeMode === 'system'
                ? `Automatic · Dark at night (7 PM – 6 AM), Light during the day (${isDark ? 'Dark mode currently active' : 'Light mode currently active'}).`
                : themeMode === 'light'
                ? 'Always uses clean Light theme.'
                : 'Always uses sleek Dark Glass theme.'}
            </Text>
          </View>
        </View>

        {/* Grouped Settings Cards */}
        {sections.map((section) => (
          <View key={section.sectionId} style={styles.sectionWrap}>
            {section.title ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null}
            <View style={styles.sectionCard}>
              {section.rows.map((item, i) => (
                <SettingsRow
                  key={item.id}
                  item={item}
                  isFirst={i === 0}
                  isLast={i === section.rows.length - 1}
                  styles={styles}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.logoBadgeWrap}>
            <Image
              source={require('../../../assets/logo.webp')}
              style={styles.footerLogo}
              contentFit="contain"
            />
          </View>
          <Text style={styles.footerName}>FocusLock</Text>
          <Text style={styles.footerVersion}>Version 1.0.0 (Build 1)</Text>
          <Text style={styles.footerCopy}>Waiyat Labs Inc. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createSettingsStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.bg,
    },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(12,18,32,0.92)' : '#ffffff',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingRight: 8,
    },
    backArrow: {
      color: C.accent,
      fontSize: 32,
      lineHeight: 32,
      fontWeight: '300',
      marginTop: -4,
      marginRight: 2,
    },
    backText: {
      color: C.accent,
      fontSize: 17,
      fontWeight: '400',
    },
    navTitle: {
      color: C.textPrimary,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.4,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: 18,
      paddingBottom: 48,
    },

    // Apple ID Card
    appleIdCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      marginHorizontal: 16,
      marginBottom: 24,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: C.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.3 : 0.05,
          shadowRadius: 6,
        },
        android: { elevation: 2 },
      }),
    },
    appleIdAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    appleIdAvatarFallback: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appleIdAvatarText: {
      color: '#ffffff',
      fontSize: 22,
      fontWeight: '700',
    },
    appleIdBody: {
      flex: 1,
      marginLeft: 14,
      marginRight: 8,
    },
    appleIdName: {
      fontSize: 17,
      fontWeight: '700',
      color: C.textPrimary,
      letterSpacing: -0.3,
    },
    appleIdSub: {
      fontSize: 13,
      color: C.textSecondary,
      fontWeight: '400',
      marginTop: 2,
    },

    // Appearance Card
    appearanceCard: {
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      marginHorizontal: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    appearanceRow: {
      flexDirection: 'row',
      gap: 8,
    },
    appearanceBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: C.bgInput,
      borderWidth: 1,
      borderColor: C.border,
    },
    appearanceBtnActive: {
      backgroundColor: C.accentDim,
      borderColor: C.accent,
    },
    appearanceEmoji: {
      fontSize: 14,
    },
    appearanceLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textSecondary,
    },
    appearanceLabelActive: {
      color: C.accent,
      fontWeight: '700',
    },
    appearanceCheck: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: C.accent,
    },
    appearanceDescription: {
      fontSize: 12,
      color: C.textMuted,
      marginTop: 10,
      marginHorizontal: 4,
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

    // Grouped Sections
    sectionWrap: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginLeft: 28,
      marginBottom: 8,
    },
    sectionCard: {
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      marginHorizontal: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    },
    rowWrapper: {
      backgroundColor: 'transparent',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: 'transparent',
    },
    rowFirst: {},
    rowLast: {},
    rowIcon: {
      width: 30,
      height: 30,
      borderRadius: 7,
      overflow: 'hidden',
    },
    rowBody: {
      flex: 1,
      marginLeft: 14,
    },
    rowLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: C.textPrimary,
      letterSpacing: -0.3,
    },
    rowLabelDanger: {
      color: C.danger,
    },
    rowSub: {
      fontSize: 12,
      color: C.textMuted,
      marginTop: 2,
    },
    rowValue: {
      fontSize: 15,
      color: C.textSecondary,
      marginRight: 6,
    },
    chevron: {
      fontSize: 18,
      color: C.textMuted,
      fontWeight: '400',
    },
    insetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
      marginLeft: 60,
    },

    // Footer
    footer: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 4,
    },
    logoBadgeWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: C.border,
    },
    footerLogo: {
      width: '100%',
      height: '100%',
    },
    footerName: {
      fontSize: 15,
      fontWeight: '700',
      color: C.textPrimary,
    },
    footerVersion: {
      fontSize: 12,
      color: C.textMuted,
    },
    footerCopy: {
      fontSize: 11,
      color: C.textMuted,
      marginTop: 4,
    },
  });
}
