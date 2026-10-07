import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import '../../global.css';
import { InAppNotificationBanner } from '../components/ui';
import { initNotifications } from '../lib/notifications';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';

function AppShell() {
  const { isDark, colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: '#09090b' }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#09090b' },
          animation: 'slide_from_right',
          animationDuration: 280,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            animation: 'fade',
            animationDuration: 300,
          }}
        />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 280,
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            animation: 'slide_from_right',
            animationDuration: 280,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="dashboard"
          options={{
            animation: 'fade_from_bottom',
            animationDuration: 320,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            animation: 'slide_from_bottom',
            animationDuration: 300,
            gestureEnabled: true,
          }}
        />
      </Stack>
      <InAppNotificationBanner />
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initNotifications();
  }, []);

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
