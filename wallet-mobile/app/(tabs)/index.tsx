import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBalance } from '@flowindex/wallet-core';

// TODO: Get address from wallet store after auth is wired up
const DEMO_ADDRESS = '0x33f75ff0b830dcec';

export default function DashboardScreen() {
  const { holdings, totalUsd, loading, error } = useBalance(DEMO_ADDRESS);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
          FlowIndex Wallet
        </Text>

        {loading ? (
          <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={{ color: '#ef4444', marginTop: 20 }}>{error}</Text>
        ) : (
          <>
            <Text style={{ color: '#00ef8b', fontSize: 36, fontWeight: '700', marginTop: 20 }}>
              ${totalUsd.toFixed(2)}
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 14, marginTop: 4, marginBottom: 24 }}>
              Total Balance
            </Text>

            {holdings.map((h) => (
              <View
                key={h.identifier}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#27272a',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#1a1a1a',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#a1a1aa', fontSize: 12, fontWeight: '600' }}>
                      {h.symbol.slice(0, 2)}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                      {h.name}
                    </Text>
                    <Text style={{ color: '#a1a1aa', fontSize: 13 }}>
                      {h.balance.toFixed(4)} {h.symbol}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                  ${h.usdValue.toFixed(2)}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
