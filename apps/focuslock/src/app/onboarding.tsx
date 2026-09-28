import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-zinc-950 px-5 justify-between py-6">
      <View>
        <Button
          title="← Back"
          variant="secondary"
          className="self-start px-3 py-1.5 mb-6"
          onPress={() => router.back()}
        />
        <Text className="text-white text-3xl font-bold tracking-tight">Onboarding</Text>
        <Text className="text-zinc-400 text-sm mt-1 mb-6">
          Step-by-step setup as outlined in FocusLock Product Spec §26
        </Text>

        <View className="gap-3">
          <Card>
            <Text className="text-white font-semibold">1. Explain & Request Authorization</Text>
            <Text className="text-zinc-400 text-xs mt-1">Screen Time (iOS) / UsageStats (Android)</Text>
          </Card>
          <Card>
            <Text className="text-white font-semibold">2. Notification Setup</Text>
            <Text className="text-zinc-400 text-xs mt-1">20-minute pre-reset reminder & warnings</Text>
          </Card>
          <Card>
            <Text className="text-white font-semibold">3. Select Apps & Configure Limits</Text>
            <Text className="text-zinc-400 text-xs mt-1">Select apps, set daily allowances & reset hour</Text>
          </Card>
        </View>
      </View>

      <Button
        title="Complete Setup & Enter App"
        variant="primary"
        onPress={() => router.replace('/')}
      />
    </SafeAreaView>
  );
}
