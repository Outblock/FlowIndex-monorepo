import { View, Text, ScrollView, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWallet, useBalance } from '@flowindex/wallet-core';
import * as Clipboard from 'expo-clipboard';

function formatAddress(addr?: string | null): string {
  if (!addr) return '';
  const clean = addr.startsWith('0x') ? addr : `0x${addr}`;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { activeAccount, network, evmAddress } = useWallet();

  const flowAddress = network === 'testnet'
    ? activeAccount?.flowAddressTestnet
    : activeAccount?.flowAddress;

  const { holdings, totalUsd, loading, error, refetch } = useBalance(flowAddress ? `0x${flowAddress}` : '');

  const copyAddress = async (addr: string) => {
    await Clipboard.setStringAsync(addr.startsWith('0x') ? addr : `0x${addr}`);
  };

  if (!activeAccount) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00ef8b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#00ef8b" />}
      >
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
          FlowIndex Wallet
        </Text>

        <Pressable onPress={() => flowAddress && copyAddress(flowAddress)}>
          <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 2 }}>
            Flow: {formatAddress(flowAddress)}
          </Text>
        </Pressable>

        {evmAddress && (
          <Pressable onPress={() => copyAddress(evmAddress)}>
            <Text style={{ color: '#a1a1aa', fontSize: 14, marginBottom: 4 }}>
              EVM: {formatAddress(evmAddress)}
            </Text>
          </Pressable>
        )}

        {loading ? (
          <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={{ color: '#ef4444', marginTop: 20 }}>{error}</Text>
        ) : (
          <>
            <Text style={{ color: '#00ef8b', fontSize: 36, fontWeight: '700', marginTop: 20 }}>
              ${totalUsd.toFixed(2)}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 14, marginTop: 4, marginBottom: 16 }}>
              Total Balance
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              <Pressable
                onPress={() => router.push('/send')}
                style={{ flex: 1, backgroundColor: '#00ef8b', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#0a0a0a', fontSize: 15, fontWeight: '700' }}>Send</Text>
              </Pressable>
              <Pressable
                onPress={() => flowAddress && copyAddress(flowAddress)}
                style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#27272a', paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Receive</Text>
              </Pressable>
            </View>

            {holdings.map((h) => (
              <View
                key={h.identifier}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#27272a' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>{h.symbol.slice(0, 2)}</Text>
                  </View>
                  <View>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{h.name}</Text>
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{h.balance.toFixed(4)} {h.symbol}</Text>
                  </View>
                </View>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>${h.usdValue.toFixed(2)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
