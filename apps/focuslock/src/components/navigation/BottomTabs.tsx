import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSelectionFeedback } from '../../lib/feedback';
import { R, getGlassNavShadow } from '../../lib/theme';
import { useTheme } from '../../lib/ThemeContext';

export type TabKey = 'home' | 'limits' | 'analytics' | 'settings';

interface TabItem {
  key: TabKey;
  label: string;
  icon: any;
}

const TABS: TabItem[] = [
  { key: 'home',      label: 'Home',      icon: require('../../../assets/tab-home.svg') },
  { key: 'limits',    label: 'Limits',    icon: require('../../../assets/tab-limits.svg') },
  { key: 'analytics', label: 'Analytics', icon: require('../../../assets/tab-analytics.svg') },
  { key: 'settings',  label: 'Settings',  icon: require('../../../assets/tab-settings.svg') },
];

interface BottomTabsProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

interface TabButtonProps {
  tab: TabItem;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
  accentColor: string;
  inactiveColor: string;
  activeBgColor: string;
  activeBorderColor: string;
}

function TabButton({
  tab,
  isActive,
  onPress,
  isDark,
  accentColor,
  inactiveColor,
  activeBgColor,
  activeBorderColor,
}: TabButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isActive ? 1.05 : 1,
      damping: 16,
      stiffness: 240,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }, [isActive]);

  const iconTint = isActive ? accentColor : inactiveColor;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        playSelectionFeedback();
        onPress();
      }}
      style={styles.tabButtonWrapper}
    >
      <Animated.View
        style={[
          styles.tabButton,
          isActive && [
            styles.tabButtonActive,
            {
              backgroundColor: activeBgColor,
              borderColor: activeBorderColor,
            },
          ],
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Image
          source={tab.icon}
          tintColor={iconTint}
          style={[styles.tabIcon, { tintColor: iconTint }]}
          contentFit="contain"
        />
        <Text
          style={[
            styles.tabLabel,
            isActive
              ? [styles.tabLabelActive, { color: isDark ? '#FFFFFF' : accentColor }]
              : [styles.tabLabelInactive, { color: inactiveColor }],
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function BottomTabs({ activeTab, onSelectTab }: BottomTabsProps) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const pillWidth = useRef<number>(0);
  const hoveredTab = useRef<TabKey | null>(null);
  const isDragging = useRef(false);

  const getTabAtX = useCallback((x: number): TabKey => {
    const w = pillWidth.current;
    if (w <= 0) return TABS[0].key;
    const zoneWidth = w / TABS.length;
    const idx = Math.min(TABS.length - 1, Math.max(0, Math.floor(x / zoneWidth)));
    return TABS[idx].key;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 6 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onMoveShouldSetPanResponderCapture: (_evt, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),

      onPanResponderGrant: (evt) => {
        isDragging.current = true;
        hoveredTab.current = getTabAtX(evt.nativeEvent.locationX);
      },

      onPanResponderMove: (evt) => {
        const tab = getTabAtX(evt.nativeEvent.locationX);
        if (tab !== hoveredTab.current) {
          hoveredTab.current = tab;
          playSelectionFeedback();
          onSelectTab(tab);
        }
      },

      onPanResponderRelease: (evt, gs) => {
        if (Math.abs(gs.dx) <= 6) {
          const tab = getTabAtX(evt.nativeEvent.locationX);
          playSelectionFeedback();
          onSelectTab(tab);
        }
        isDragging.current = false;
        hoveredTab.current = null;
      },

      onPanResponderTerminate: () => {
        isDragging.current = false;
        hoveredTab.current = null;
      },
    }),
  ).current;

  // Safe bottom offset that clears Android system 3-button bar or iOS home pill
  const bottomOffset = Math.max(insets.bottom, Platform.OS === 'android' ? 22 : 12) + 8;
  const dynamicShadow = getGlassNavShadow(isDark);

  const pillContainerStyle = [
    styles.pillContainer,
    dynamicShadow,
    {
      backgroundColor: isDark ? '#141E33' : 'rgba(255, 255, 255, 0.96)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)',
    },
  ];

  // High-contrast, vivid highlights — neon-green brand, themed per mode
  const activeBgColor = isDark ? 'rgba(118, 247, 86, 0.16)' : 'rgba(91, 217, 74, 0.10)';
  const activeBorderColor = isDark ? 'rgba(118, 247, 86, 0.60)' : 'rgba(91, 217, 74, 0.50)';
  const accentColor = isDark ? '#76F756' : '#15803D';
  const inactiveColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={[styles.floatingWrapper, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View
        style={pillContainerStyle}
        onLayout={(e) => { pillWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            isActive={activeTab === tab.key}
            onPress={() => onSelectTab(tab.key)}
            isDark={isDark}
            accentColor={accentColor}
            inactiveColor={inactiveColor}
            activeBgColor={activeBgColor}
            activeBorderColor={activeBorderColor}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  pillContainer: {
    width: '100%',
    maxWidth: 380,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: R.xxl,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tabButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: R.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabButtonActive: {
    borderWidth: 1,
  },
  tabIcon: {
    width: 22,
    height: 22,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabLabelInactive: {
    fontWeight: '500',
  },
});
