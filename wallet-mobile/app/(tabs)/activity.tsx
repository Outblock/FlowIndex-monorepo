import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useWallet, getAccountTransactions, getAccountFtTransfers, deriveActivityType, buildSummaryLine, formatRelativeTime } from '@flowindex/wallet-core';
import type { AccountTransaction, FtTransfer } from '@flowindex/wallet-core';

type Tab = 'transactions' | 'transfers';

export default function ActivityScreen() {
  const { activeAccount, network } = useWallet();
  const flowAddress = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;
  const [tab, setTab] = useState<Tab>('transactions');

  if (!flowAddress) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#71717a' }}>No account</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        {(['transactions', 'transfers'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: tab === t ? '#00ef8b' : '#1a1a1a' }}>
            <Text style={{ color: tab === t ? '#0a0a0a' : '#a1a1aa', fontWeight: '600', fontSize: 14 }}>
              {t === 'transactions' ? 'All Transactions' : 'FT Transfers'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'transactions' ? <TransactionList address={flowAddress} /> : <TransferList address={flowAddress} />}
    </SafeAreaView>
  );
}

function TransactionList({ address }: { address: string }) {
  const [txs, setTxs] = useState<AccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const PAGE_SIZE = 25;

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    try {
      const result = await getAccountTransactions(address, PAGE_SIZE, offset);
      if (append) { setTxs((prev) => [...prev, ...result.data]); } else { setTxs(result.data); }
      setHasMore(result.hasMore);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [address]);

  useEffect(() => { fetchPage(0, false); }, [fetchPage]);

  return (
    <FlashList
      data={txs}
      keyExtractor={(item) => `${item.id}-${item.block_height}`}
      estimatedItemSize={70}
      onEndReached={() => hasMore && !loading && fetchPage(txs.length, true)}
      onEndReachedThreshold={0.3}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPage(0, false); }} tintColor="#00ef8b" />}
      ListEmptyComponent={loading ? <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} /> : <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 40 }}>No transactions</Text>}
      renderItem={({ item }) => {
        const badge = deriveActivityType(item);
        const summary = buildSummaryLine(item);
        return (
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={1}>{badge.label}</Text>
              <Text style={{ color: '#71717a', fontSize: 12 }}>{formatRelativeTime(item.timestamp)}</Text>
            </View>
            <Text style={{ color: '#a1a1aa', fontSize: 13 }} numberOfLines={1}>{summary}</Text>
          </View>
        );
      }}
    />
  );
}

function TransferList({ address }: { address: string }) {
  const [transfers, setTransfers] = useState<FtTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const PAGE_SIZE = 25;

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    try {
      const result = await getAccountFtTransfers(address, PAGE_SIZE, offset);
      if (append) { setTransfers((prev) => [...prev, ...result.data]); } else { setTransfers(result.data); }
      setHasMore(result.hasMore);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [address]);

  useEffect(() => { fetchPage(0, false); }, [fetchPage]);

  return (
    <FlashList
      data={transfers}
      keyExtractor={(item, index) => `${item.transaction_hash}-${index}`}
      estimatedItemSize={70}
      onEndReached={() => hasMore && !loading && fetchPage(transfers.length, true)}
      onEndReachedThreshold={0.3}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPage(0, false); }} tintColor="#00ef8b" />}
      ListEmptyComponent={loading ? <ActivityIndicator color="#00ef8b" style={{ marginTop: 40 }} /> : <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 40 }}>No transfers</Text>}
      renderItem={({ item }) => {
        const isSent = item.direction === 'sent';
        const counterparty = isSent ? item.receiver : item.sender;
        const shortAddr = counterparty ? `0x${counterparty.slice(0, 4)}...${counterparty.slice(-4)}` : '';
        return (
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: isSent ? '#ef4444' : '#00ef8b', fontSize: 14, fontWeight: '500' }}>{isSent ? 'Sent' : 'Received'}</Text>
              <Text style={{ color: '#71717a', fontSize: 12 }}>{formatRelativeTime(item.timestamp)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#a1a1aa', fontSize: 13 }}>{shortAddr}</Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{isSent ? '-' : '+'}{parseFloat(item.amount).toFixed(4)} {item.token?.split('.').pop() || 'FLOW'}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}
