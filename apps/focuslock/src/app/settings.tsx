import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-zinc-950 px-5 justify-between py-6">
      <View>
        <Button
          title="← Back to Home"
          variant="secondary"
          className="self-start px-3 py-1.5 mb-6"
          onPress={() => router.back()}
        />
        <Text className="text-white text-3xl font-bold tracking-tight">Settings & Limits</Text>
        <Text className="text-zinc-400 text-sm mt-1 mb-6">
          Manage restrictions, anti-impulse lock & notifications
        </Text>

        <View className="gap-3">
          <Card>
            <Text className="text-white font-semibold">Active Screen-Time Limits</Text>
            <Text className="text-zinc-400 text-xs mt-1">Status: LOCKED (Editable only during 20m pre-reset window)</Text>
          </Card>
          <Card>
            <Text className="text-white font-semibold">Daily Reset Time</Text>
            <Text className="text-zinc-400 text-xs mt-1">Currently set to: 08:00 AM</Text>
          </Card>
          <Card>
            <Text className="text-white font-semibold">Notifications</Text>
            <Text className="text-zinc-400 text-xs mt-1">Pre-reset warning (07:40 AM) & usage alerts</Text>
          </Card>
        </View>
      </View>

      <Button
        title="Done"
        variant="primary"
        onPress={() => router.back()}
      />
    </SafeAreaView>
  );
}
