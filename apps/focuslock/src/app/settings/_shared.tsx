// Shared header and styles for all settings sub-screens (Adaptive Theme)
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { ThemeColors, darkColors, lightColors } from '../../lib/theme';

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        headerStyles.header,
        {
          backgroundColor: isDark ? 'rgba(12, 18, 32, 0.95)' : '#ffffff',
          borderBottomColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity onPress={onBack} style={headerStyles.backBtn} activeOpacity={0.6}>
        <Text style={[headerStyles.backArrow, { color: colors.accent }]}>‹</Text>
        <Text style={[headerStyles.backText, { color: colors.accent }]}>Settings</Text>
      </TouchableOpacity>
      <Text style={[headerStyles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  backArrow: {
    fontSize: 32,
    lineHeight: 32,
    fontWeight: '300',
    marginTop: -4,
    marginRight: 2,
  },
  backText: {
    fontSize: 17,
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
});

export function createSharedStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: C.bg,
    },
    sectionLabel: {
      color: C.textMuted,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginLeft: 28,
    },
    card: {
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
      borderRadius: 14,
      marginHorizontal: 16,
      overflow: 'hidden',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: C.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: isDark ? C.bgCardSolid : '#ffffff',
    },
    rowFirst: {
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
    },
    rowLast: {
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    rowBody: {
      flex: 1,
      marginRight: 12,
    },
    rowLabel: {
      color: C.textPrimary,
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: -0.3,
    },
    rowSub: {
      color: C.textSecondary,
      fontSize: 13,
      marginTop: 2,
      lineHeight: 18,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
      marginLeft: 16,
    },
    primaryBtn: {
      backgroundColor: C.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 16,
    },
    primaryBtnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingTop: 18,
      paddingBottom: 48,
    },
  });
}

/** Dynamic hook for settings screens */
export function useSharedStyles() {
  const { isDark, colors } = useTheme();
  const sh = useMemo(() => createSharedStyles(colors, isDark), [colors, isDark]);
  return { sh, isDark, colors };
}

// Fallback static sh for backwards compatibility
export const sh = createSharedStyles(darkColors, true);

export default function SettingsSharedDummy() {
  return null;
}
