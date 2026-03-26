import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMobileAuth } from '../../providers/AuthProvider';

export default function LoginScreen() {
  const { login, passkeyLoading } = useMobileAuth();
  const [status, setStatus] = useState<string>('');

  const handleSignIn = async () => {
    try {
      setStatus('Authenticating...');
      await login();
      setStatus('');
    } catch (e: any) {
      setStatus('');
      Alert.alert('Sign In Failed', e.message || 'Could not authenticate with passkey');
    }
  };

  const handleCreateWallet = async () => {
    try {
      setStatus('Creating wallet...');
      await login();
      setStatus('');
    } catch (e: any) {
      setStatus('');
      Alert.alert('Error', e.message || 'Failed to create wallet');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 24 }}>
      <View style={{ alignItems: 'center', marginBottom: 60 }}>
        <Text style={{ color: '#00ef8b', fontSize: 40, fontWeight: '800', marginBottom: 8 }}>
          FlowIndex
        </Text>
        <Text style={{ color: '#a1a1aa', fontSize: 16 }}>
          Non-custodial Flow Wallet
        </Text>
      </View>

      {passkeyLoading || status ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color="#00ef8b" size="large" />
          {status ? <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{status}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={handleSignIn}
            style={{
              backgroundColor: '#00ef8b',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#0a0a0a', fontSize: 17, fontWeight: '700' }}>
              Sign In with Passkey
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCreateWallet}
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#27272a',
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
              Create New Wallet
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
