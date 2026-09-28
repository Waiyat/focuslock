import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export default function RegisterScreen() {
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
        <Text className="text-white text-3xl font-bold tracking-tight">Create Account</Text>
        <Text className="text-zinc-400 text-sm mt-1 mb-6">
          Start building discipline with FocusLock.
        </Text>

        <Card className="gap-3">
          <Text className="text-zinc-500 text-sm italic">
            [Registration fields & verification placeholders will be implemented here]
          </Text>
        </Card>
      </View>

      <View className="gap-3">
        <Button
          title="Create Account"
          variant="primary"
          onPress={() => router.replace('/onboarding')}
        />
        <Button
          title="Already have an account? Sign In"
          variant="secondary"
          onPress={() => router.push('/(auth)/login')}
        />
      </View>
    </SafeAreaView>
  );
}
