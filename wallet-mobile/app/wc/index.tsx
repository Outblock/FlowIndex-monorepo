import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWalletConnect } from '../../providers';

export default function WCPairingScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();
  const { pair, initialized } = useWalletConnect();
  const [error, setError] = useState<string | null>(null);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    if (!uri || !initialized || paired) return;

    const decodedUri = decodeURIComponent(uri);

    pair(decodedUri)
      .then(() => setPaired(true))
      .catch((err) => {
        console.error('[WC] Pairing failed:', err);
        setError(err?.message ?? 'Failed to connect');
      });
  }, [uri, initialized, paired]);

  // Fallback timeout: go back after 10s if session_proposal hasn't navigated us away
  useEffect(() => {
    if (!paired) return;
    const timer = setTimeout(() => {
      if (router.canGoBack()) router.back();
    }, 10000);
    return () => clearTimeout(timer);
  }, [paired]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
      {error ? (
        <View style={{ alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Connection Failed
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 14, textAlign: 'center' }}>{error}</Text>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <ActivityIndicator size="large" color="#00ef8b" />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500' }}>
            Connecting to dApp...
          </Text>
          <Text style={{ color: '#71717a', fontSize: 13 }}>
            Waiting for session proposal
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
