import { Stack } from 'expo-router';

export default function FclLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
        contentStyle: { backgroundColor: '#0a0a0a' },
      }}
    />
  );
}
