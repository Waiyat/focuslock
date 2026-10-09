import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
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

const GROUPS: FaqGroup[] = [
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How do daily limits work?',
        a: 'FocusLock measures how long each restricted app is in the foreground. When an app reaches its daily limit, it is locked until your next scheduled reset.',
      },
      {
        q: 'How do I add an app to restrict?',
        a: 'Open the Home or App Limits tab and tap "Add". Choose an installed app, set a daily allowance, and save. Enforcement begins right away.',
      },
      {
        q: 'Do I need to keep FocusLock open?',
        a: 'No. Once you grant the required permissions, FocusLock enforces your limits in the background using system usage services.',
      },
    ],
  },
  {
    title: 'Limits & Resets',
    items: [
      {
        q: 'When do my limits reset?',
        a: 'All counters reset at your configured daily reset time (8:00 AM by default). Locked apps become available again and usage returns to zero.',
      },
      {
        q: 'Why can I only edit limits at certain times?',
        a: 'To protect your focus, active limits can only be changed during the short reset window just before your daily reset. This prevents impulsive mid-day edits.',
      },
      {
        q: 'Can I extend a limit after it locks?',
        a: 'No. Once a limit is locked for the day, it stays enforced until the next reset. This is the core of the anti-impulse design.',
      },
    ],
  },
  {
    title: 'Account & Privacy',
    items: [
      {
        q: 'Is my data private?',
        a: 'Yes. Your limits and usage counters are tied to your account. We never read your messages, photos, browsing history, or any personal content.',
      },
      {
        q: 'Why was I signed out on another device?',
        a: 'FocusLock keeps one active session at a time. Signing in on a new device securely signs out the previous one to keep your limits consistent.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Go to Settings, then Account, and choose Delete Account. This permanently removes your account and all associated data.',
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
  sh: any;
  colors: ThemeColors;
}) {
  return (
    <View style={!isLast && sh.rowDivider ? undefined : undefined}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.6}
        style={styles.faqHeader}
      >
        <Text style={[sh.rowLabel, styles.faqQuestion]}>{item.q}</Text>
        <View
          style={[
            styles.chevronWrap,
            isOpen && { transform: [{ rotate: '90deg' }] },
          ]}
        >
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </View>
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.answerWrap}>
          <Text style={styles.answer}>{item.a}</Text>
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

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

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
            <View key={group.title}>
              <Text style={sh.sectionLabel}>{group.title}</Text>
              <View style={sh.card}>
                {group.items.map((item, i) => {
                  const key = `${group.title}-${i}`;
                  return (
                    <FaqRow
                      key={key}
                      item={item}
                      isOpen={openKey === key}
                      onToggle={() => toggle(key)}
                      isLast={i === group.items.length - 1}
                      sh={sh}
                      colors={colors}
                    />
                  );
                })}
              </View>
            </View>
          ))}

          <Text style={styles.footer}>
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
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginHorizontal: 32,
    marginTop: 4,
  },
});
