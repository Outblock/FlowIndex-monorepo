import { View, Text, Pressable, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Globe } from 'lucide-react-native';
import { useWallet, buildAuthnResponse } from '@flowindex/wallet-core';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://flowindex.io/api';

function formatAddress(addr?: string | null): string {
  if (!addr) return '';
  const clean = addr.startsWith('0x') ? addr : `0x${addr}`;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export default function FclAuthnScreen() {
  const router = useRouter();
  const { callback, nonce, appName, appIcon } = useLocalSearchParams<{
    callback: string;
    nonce?: string;
    appName?: string;
    appIcon?: string;
  }>();

  const { activeAccount, network } = useWallet();

  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  if (!callback) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: '#ef4444', fontSize: 16 }}>Missing callback URL</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, padding: 12, backgroundColor: '#1a1a1a', borderRadius: 10 }}>
          <Text style={{ color: '#fff' }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleApprove = async () => {
    if (!activeAccount || !flowAddress) {
      Linking.openURL(`${callback}?fclError=no_account`);
      router.back();
      return;
    }

    const keyId = 0; // primary key
    const response = buildAuthnResponse({
      address: flowAddress,
      keyId,
      baseUrl: BASE_URL,
      network,
    });

    const encoded = Buffer.from(JSON.stringify(response)).toString('base64');
    Linking.openURL(`${callback}?fclResponse=${encodeURIComponent(encoded)}`);
    router.back();
  };

  const handleReject = () => {
    Linking.openURL(`${callback}?fclError=user_rejected`);
    router.back();
  };

  const displayName = appName || 'Unknown dApp';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flex: 1, padding: 20, justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 24 }}>
            Connect Wallet
          </Text>

          {/* dApp info */}
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#27272a' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {appIcon ? (
                <Image
                  source={{ uri: appIcon }}
                  style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#27272a' }}
                />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#27272a', justifyContent: 'center', alignItems: 'center' }}>
                  <Globe size={24} color="#a1a1aa" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{displayName}</Text>
                <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 2 }}>wants to connect</Text>
              </View>
            </View>
          </View>

          {/* Account info */}
          {activeAccount && (
            <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#27272a' }}>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 8 }}>Connecting with</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                  {activeAccount.authenticatorName || 'FlowIndex Account'}
                </Text>
                <View style={{ backgroundColor: '#1a3a2a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ef8b44' }}>
                  <Text style={{ color: '#00ef8b', fontSize: 11, fontWeight: '600' }}>Cadence</Text>
                </View>
              </View>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 6, fontFamily: 'monospace' }}>
                {flowAddress ? `0x${flowAddress}` : 'No account provisioned'}
              </Text>
            </View>
          )}

          {!activeAccount && (
            <View style={{ backgroundColor: '#2a1a0a', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#92400e44' }}>
              <Text style={{ color: '#fbbf24', fontSize: 13 }}>
                No wallet account found. Please set up your wallet first.
              </Text>
            </View>
          )}
        </View>

        {/* Buttons */}
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={handleApprove}
            disabled={!activeAccount || !flowAddress}
            style={({ pressed }) => ({
              backgroundColor: activeAccount && flowAddress ? '#00ef8b' : '#1a3a2a',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: activeAccount && flowAddress ? '#0a0a0a' : '#4ade80', fontSize: 16, fontWeight: '700' }}>
              Connect
            </Text>
          </Pressable>

          <Pressable
            onPress={handleReject}
            style={({ pressed }) => ({
              backgroundColor: '#1a1a1a',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#27272a',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Reject</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
