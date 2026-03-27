import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../providers';
import { useMobileAuth } from '../providers/AuthProvider';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useMobileAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="send/index" options={{ presentation: 'modal', headerShown: true, headerTitle: 'Send FLOW', headerStyle: { backgroundColor: '#0a0a0a' }, headerTintColor: '#fff' }} />
        </Stack>
      </AuthGate>
    </AppProviders>
  );
}
