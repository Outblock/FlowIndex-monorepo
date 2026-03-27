import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useWallet, getNftCollections, getNftCollectionItems, resolveIPFS } from '@flowindex/wallet-core';
import type { NftCollection, NftItem } from '@flowindex/wallet-core';

export default function NftsScreen() {
  const { activeAccount, network } = useWallet();
  const flowAddress = network === 'testnet' ? activeAccount?.flowAddressTestnet : activeAccount?.flowAddress;

  const [collections, setCollections] = useState<NftCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, NftItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<Record<string, boolean>>({});

  const fetchCollections = useCallback(async () => {
    if (!flowAddress) return;
    try {
      const result = await getNftCollections(flowAddress);
      setCollections(result);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [flowAddress]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const toggleCollection = async (collection: NftCollection) => {
    const key = collection.id;
    if (expandedId === key) { setExpandedId(null); return; }
    setExpandedId(key);
    if (!items[key]) {
      setItemsLoading((prev) => ({ ...prev, [key]: true }));
      try {
        const result = await getNftCollectionItems(flowAddress!, collection.nft_type || key, 20, 0);
        setItems((prev) => ({ ...prev, [key]: result.data || result }));
      } catch { /* ignore */ }
      setItemsLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (!flowAddress) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#71717a' }}>No account</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#00ef8b" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', padding: 16 }}>NFTs</Text>
      <FlashList
        data={collections}
        keyExtractor={(item) => item.id}
        estimatedItemSize={80}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCollections(); }} tintColor="#00ef8b" />}
        ListEmptyComponent={<Text style={{ color: '#71717a', textAlign: 'center', marginTop: 40 }}>No NFTs found</Text>}
        renderItem={({ item: collection }) => (
          <View>
            <Pressable onPress={() => toggleCollection(collection)} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              {collection.logo ? (
                <Image source={{ uri: resolveIPFS(collection.logo) }} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#1a1a1a' }} />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#71717a', fontSize: 14, fontWeight: '600' }}>{(collection.display_name || collection.name || '?').slice(0, 2)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{collection.display_name || collection.name}</Text>
                <Text style={{ color: '#71717a', fontSize: 13 }}>{collection.owned_count ?? collection.total_count ?? '?'} items</Text>
              </View>
              <Text style={{ color: '#71717a', fontSize: 18 }}>{expandedId === collection.id ? '▾' : '▸'}</Text>
            </Pressable>
            {expandedId === collection.id && (
              <View style={{ padding: 12, backgroundColor: '#111' }}>
                {itemsLoading[collection.id] ? (
                  <ActivityIndicator color="#00ef8b" style={{ padding: 20 }} />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(items[collection.id] || []).map((nft) => (
                      <View key={nft.id} style={{ width: '48%', backgroundColor: '#1a1a1a', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
                        {nft.thumbnail ? (
                          <Image source={{ uri: resolveIPFS(nft.thumbnail) }} style={{ width: '100%', aspectRatio: 1, backgroundColor: '#0a0a0a' }} resizeMode="cover" />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#52525b', fontSize: 18 }}>?</Text>
                          </View>
                        )}
                        <View style={{ padding: 8 }}>
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{nft.name || `#${nft.nft_id}`}</Text>
                          {nft.serial_number != null && <Text style={{ color: '#71717a', fontSize: 12 }}>#{nft.serial_number}</Text>}
                        </View>
                      </View>
                    ))}
                    {(!items[collection.id] || items[collection.id].length === 0) && <Text style={{ color: '#71717a', padding: 12 }}>No items</Text>}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
