import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SubHeader, useSharedStyles } from './_shared';

const FAQ = [
  { q: 'How do daily limits work?', a: 'FocusLock tracks cumulative time in each restricted app. Once the daily limit is reached, the app is locked until your configured daily reset time.' },
  { q: 'When do limits reset?', a: 'Limits reset at your configured daily reset time (default 08:00 AM). All usage counters are zeroed and locked apps become available again.' },
  { q: 'Can I change limits after setting them?', a: 'Yes, but only during the 20-minute window before daily reset. This prevents mid-day adjustments that undermine your restrictions.' },
  { q: 'Is my data safe?', a: 'All limit data is stored encrypted on-device and in your private database. We never share or sell your data to third parties.' },
  { q: 'How do I cancel my subscription?', a: 'Subscriptions are managed through the App Store (iOS) or Google Play (Android). Go to your account settings in the respective store to cancel.' },
  { q: 'Why did I get logged out?', a: 'FocusLock keeps you logged in between sessions. If you were logged out, please check your internet connection or try logging in again.' },
];

function FaqItem({ q, a, sh, colors }: { q: string; a: string; sh: any; colors: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity onPress={() => setOpen(!open)} activeOpacity={0.6} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 }}>
        <Text style={[sh.rowLabel, { flex: 1, paddingRight: 8 }]}>{q}</Text>
        <Text style={{ color: open ? colors.accent : colors.textMuted, fontSize: 18, fontWeight: '700' }}>{open ? '−' : '+'}</Text>
      </TouchableOpacity>
      {open && <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, paddingHorizontal: 16, paddingBottom: 14 }}>{a}</Text>}
    </View>
  );
}

export default function HelpScreen() {
  const router = useRouter();
  const { sh, colors } = useSharedStyles();
  return (
    <SafeAreaView style={sh.safe} edges={['top']}>
      <SubHeader title="Help & FAQ" onBack={() => router.back()} />
      <ScrollView style={sh.scroll} contentContainerStyle={sh.content} showsVerticalScrollIndicator={false}>
        <Text style={sh.sectionLabel}>FREQUENTLY ASKED QUESTIONS</Text>
        <View style={sh.card}>
          {FAQ.map((item, i) => (
            <React.Fragment key={i}>
              <FaqItem q={item.q} a={item.a} sh={sh} colors={colors} />
              {i < FAQ.length - 1 && <View style={sh.divider} />}
            </React.Fragment>
          ))}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 }}>
          Still need help? Use "Send Feedback" to reach our team.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
