import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';
import { ThemeColors } from '../../lib/theme';

interface Faq {
  q: string;
  a: string;
}

interface FaqGroup {
  title: string;
  items: Faq[];
}

type SharedStyles = ReturnType<typeof useSharedStyles>['sh'];

const GROUPS: FaqGroup[] = [
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How does FocusLock work?',
        a: 'FocusLock helps you manage time spent in supported apps. Choose an installed app, set an allowance, and grant the required permissions. FocusLock monitors supported app usage and enforces configured limits when the allowance is reached.',
      },
      {
        q: 'How do I add an app to restrict?',
        a: 'Open the Home or App Limits tab and tap Add. Select an available installed app, choose its allowance, and save. The limit becomes active according to your current settings and required permissions.',
      },
      {
        q: 'Do I need to keep FocusLock open?',
        a: 'No, not normally. On supported Android devices, FocusLock uses system services to monitor usage and enforce limits in the background. Device settings, battery restrictions, and permissions may affect background operation.',
      },
      {
        q: 'Why can I not find an app in the app selector?',
        a: 'FocusLock can only offer apps it can discover and support on your device. Check that the app is installed and that the necessary Android app-visibility and usage permissions are available.',
      },
    ],
  },
  {
    title: 'Limits & Resets',
    items: [
      {
        q: 'How do daily limits work?',
        a: 'FocusLock measures usage for supported apps and compares it with your configured allowance. When the allowance is reached, the app is restricted according to FocusLock’s enforcement rules until the applicable reset.',
      },
      {
        q: 'When do my limits reset?',
        a: 'Limits reset according to your configured daily reset schedule. When the reset occurs, eligible counters start a new period and restrictions are updated. Check your current settings for the applicable reset time.',
      },
      {
        q: 'Why can I only edit limits at certain times?',
        a: 'FocusLock is designed to help prevent impulsive changes. Depending on your current configuration, editing active limits may only be available during the permitted editing window.',
      },
      {
        q: 'Can I extend a limit after an app locks?',
        a: 'FocusLock is designed to help you stick to the allowance you set. Whether a limit can be changed depends on the rules currently implemented in your version of the app. Check the available controls in App Limits.',
      },
      {
        q: 'Why does my usage time look incorrect?',
        a: 'Usage reporting can be affected by missing permissions, device settings, monitoring interruptions, or differences in the time period being compared. Confirm that Usage Access is enabled, reopen FocusLock, and compare the same time period on both screens.',
      },
    ],
  },
  {
    title: 'Uninstalled Apps',
    items: [
      {
        q: 'What happens when I uninstall a limited app?',
        a: 'When FocusLock confirms that a limited app is no longer installed on this device, it removes that app’s local limit and enforcement state and informs you. This cleanup is limited to the device where the app was removed.',
      },
      {
        q: 'Will uninstalling an app remove its limit everywhere?',
        a: 'No. Uninstall cleanup applies only to the device where the app was removed. It should not delete your account’s unrelated records or a limit belonging to another device.',
      },
      {
        q: 'What happens if I reinstall an app?',
        a: 'The app can be selected again if it is supported and visible to FocusLock. You must add it and configure a new limit. The previous local limit is not automatically restored.',
      },
      {
        q: 'Why did FocusLock notify me that an app was removed?',
        a: 'FocusLock detected that an app with a local limit was no longer installed and cleaned up its local restriction data. If you install that app again, you can configure a fresh limit.',
      },
    ],
  },
  {
    title: 'Permissions & Troubleshooting',
    items: [
      {
        q: 'Why does FocusLock need Usage Access?',
        a: 'Usage Access allows FocusLock to obtain supported app-usage information needed to measure time spent in restricted apps. Without it, usage monitoring and enforcement may not work correctly.',
      },
      {
        q: 'Why does FocusLock need other permissions?',
        a: 'Some Android features require additional permissions to support monitoring, restrictions, or notifications. FocusLock should request only the permissions needed for the features you use. You can review permissions in your device settings.',
      },
      {
        q: 'What happens if I disable a required permission?',
        a: 'Some monitoring or enforcement features may stop working correctly. Re-enable the required permission in Android settings, then reopen FocusLock and check that monitoring has resumed.',
      },
      {
        q: 'Why is an app not being restricted?',
        a: 'Check that the app is supported, its limit is active, the allowance has been reached, and the required permissions are enabled. If the problem continues, use Send Feedback in Settings.',
      },
      {
        q: 'Does FocusLock work the same on every phone?',
        a: 'Not always. Android versions, device manufacturers, battery management, and permission policies can affect background monitoring and enforcement. Some features may differ by device.',
      },
    ],
  },
  {
    title: 'Account & Devices',
    items: [
      {
        q: 'Why can I only use FocusLock on one device at a time?',
        a: 'FocusLock allows one active device session per account to help protect account access and keep device-session enforcement consistent. Signing in on a new device signs out the previous session.',
      },
      {
        q: 'Will signing in on another device delete my app limits?',
        a: 'Signing in on a new device changes which device has the active session. It does not mean that unrelated account records should be deleted. Local enforcement and installed-app availability are managed on the relevant device.',
      },
      {
        q: 'What if I lose access to my device?',
        a: 'Sign in on a device you control to establish a new session, if your account access is still available. If you suspect someone else has accessed your account, secure your sign-in method and contact the FocusLock team.',
      },
      {
        q: 'How do I delete my account?',
        a: 'If account deletion is available in your version, open Settings, go to Account, and choose Delete Account. Read the confirmation carefully before proceeding. Account deletion is intended to remove the account and its associated data according to the service’s deletion process.',
      },
    ],
  },
  {
    title: 'Privacy & Data',
    items: [
      {
        q: 'What information does FocusLock use?',
        a: 'FocusLock uses account information, app-limit settings, supported app-usage information, and device-session information needed to provide its features. The exact information processed depends on the features you use and the permissions you grant.',
      },
      {
        q: 'Does FocusLock read my messages or photos?',
        a: 'Usage monitoring is intended to measure app usage, not read your private messages or photos. Review the Privacy Policy for details about the information FocusLock accesses, processes, and stores.',
      },
      {
        q: 'Where is my information stored?',
        a: 'Some information may be associated with your account through FocusLock’s backend services, while enforcement state and other operational data may be stored locally on your device. See the Privacy Policy for the applicable data handling details.',
      },
      {
        q: 'Does uninstalling FocusLock delete all my account data?',
        a: 'Uninstalling the app removes its local installation and may remove local app data according to Android behavior. It does not necessarily delete account information stored by online services. Use the account deletion process if you want to request account and associated data deletion.',
      },
    ],
  },
  {
    title: 'Support & Feedback',
    items: [
      {
        q: 'How do I report a problem?',
        a: 'Open Settings and use Send Feedback. Describe what happened, what you expected, and the steps that reproduce the issue. You can include your device model and Android version. Never send passwords, authentication tokens, or other secret credentials.',
      },
      {
        q: 'How can I suggest a feature?',
        a: 'Use Send Feedback in Settings to describe the feature, the problem it would solve, and how you would expect it to work.',
      },
    ],
  },
];

function FaqRow({
  item,
  isOpen,
  onToggle,
  isLast,
  sh,
  colors,
}: {
  item: Faq;
  isOpen: boolean;
  onToggle: () => void;
  isLast: boolean;
  sh: SharedStyles;
  colors: ThemeColors;
}) {
  return (
    <View>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={item.q}
        style={styles.faqHeader}
      >
        <Text style={[sh.rowLabel, styles.faqQuestion]}>{item.q}</Text>
        <View style={[styles.chevronWrap, isOpen && styles.chevronOpen]}>
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.answerWrap}>
          <Text style={[styles.answer, { color: colors.textMuted }]}>
            {item.a}
          </Text>
        </View>
      )}

      {!isLast && <View style={sh.divider} />}
    </View>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const { sh, colors } = useSharedStyles();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const toggle = (key: string) => {
    setOpenKey((previous) => (previous === key ? null : key));
  };

  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Help & FAQ" onBack={() => router.back()} />

      <ScrollView
        style={sh.scroll}
        contentContainerStyle={sh.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.wrap}>
          {GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={sh.sectionLabel}>{group.title}</Text>

              <View style={sh.card}>
                {group.items.map((item, index) => {
                  const key = `${group.title}-${index}`;
                  return (
                    <FaqRow
                      key={key}
                      item={item}
                      isOpen={openKey === key}
                      onToggle={() => toggle(key)}
                      isLast={index === group.items.length - 1}
                      sh={sh}
                      colors={colors}
                    />
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={[styles.footer, { color: colors.textMuted }]}>
            Still need a hand? Use Send Feedback in Settings to reach our team directly.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  group: {
    marginBottom: 8,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  faqQuestion: {
    flex: 1,
    paddingRight: 12,
  },
  chevronWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
  },
  answerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  answer: {
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginHorizontal: 32,
    marginTop: 12,
    marginBottom: 20,
  },
});
