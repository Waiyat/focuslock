import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';

export default function SettingsLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
        animationDuration: 260,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="account" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="focus" />
      <Stack.Screen name="help" />
      <Stack.Screen name="feedback" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="privacy-policy" />
    </Stack>
  );
}
