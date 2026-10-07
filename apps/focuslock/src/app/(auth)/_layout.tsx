import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#09090b' },
        animation: 'slide_from_right',
        animationDuration: 260,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{
          animation: 'slide_from_right',
        }}
      />
    </Stack>
  );
}
