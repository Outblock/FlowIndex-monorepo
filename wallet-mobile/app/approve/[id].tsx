import { useState } from 'react';
import {
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fingerprint, X, Globe, Code, ChevronDown, ChevronUp } from 'lucide-react-native';
import { usePendingRequests } from '../../stores/pending-requests';

export default function ApproveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { get, remove } = usePendingRequests();
  const request = get(id);

  const [signing, setSigning] = useState(false);
  const [scriptExpanded, setScriptExpanded] = useState(false);

  if (!request) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#a1a1aa', fontSize: 16 }}>Request not found</Text>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1a1a1a', borderRadius: 10 }}
        >
          <Text style={{ color: '#fff', fontSize: 14 }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const { dapp, payload, chainType } = request;

  const scriptPreview =
    payload?.cadence ?? payload?.data ?? payload?.script ?? payload?.tx ?? null;
  const scriptText = typeof scriptPreview === 'string'
    ? scriptPreview
    : scriptPreview != null
      ? JSON.stringify(scriptPreview, null, 2)
      : null;

  const handleApprove = async () => {
    setSigning(true);
    try {
      if (typeof payload?.onApprove === 'function') {
        await payload.onApprove();
      }
      remove(id);
      router.back();
    } catch (err) {
      setSigning(false);
      Alert.alert('Signing Failed', (err as Error).message);
      // Don't remove request - let user retry
    }
  };

  const handleReject = () => {
    if (typeof payload?.onReject === 'function') {
      payload.onReject();
    }
    remove(id);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 24 }}>
          Approve Transaction
        </Text>

        {/* dApp info card */}
        <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#27272a' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {dapp.icon ? (
              <Image
                source={{ uri: dapp.icon }}
                style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#27272a' }}
              />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#27272a', justifyContent: 'center', alignItems: 'center' }}>
                <Globe size={24} color="#a1a1aa" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{dapp.name || 'Unknown dApp'}</Text>
              <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{dapp.url}</Text>
            </View>
            {/* Chain badge */}
            <View style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: chainType === 'cadence' ? '#1a3a2a' : '#1a2a3a',
              borderWidth: 1,
              borderColor: chainType === 'cadence' ? '#00ef8b44' : '#3b82f644',
            }}>
              <Text style={{
                color: chainType === 'cadence' ? '#00ef8b' : '#60a5fa',
                fontSize: 11,
                fontWeight: '600',
              }}>
                {chainType === 'cadence' ? 'Cadence' : 'EVM'}
              </Text>
            </View>
          </View>
        </View>

        {/* Script preview (collapsible) */}
        {scriptText && (
          <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#27272a', overflow: 'hidden' }}>
            <Pressable
              onPress={() => setScriptExpanded((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Code size={16} color="#a1a1aa" />
                <Text style={{ color: '#a1a1aa', fontSize: 14, fontWeight: '500' }}>
                  {chainType === 'cadence' ? 'Transaction Script' : 'Transaction Data'}
                </Text>
              </View>
              {scriptExpanded
                ? <ChevronUp size={16} color="#a1a1aa" />
                : <ChevronDown size={16} color="#a1a1aa" />
              }
            </Pressable>
            {scriptExpanded && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 220 }}>
                  <Text style={{ color: '#d4d4d8', fontSize: 11, fontFamily: 'monospace', lineHeight: 17 }}>
                    {scriptText}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Signing indicator */}
        {signing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#27272a' }}>
            <ActivityIndicator color="#00ef8b" />
            <Text style={{ color: '#a1a1aa', fontSize: 14 }}>Signing with passkey…</Text>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      <View style={{ padding: 20, paddingBottom: 32, gap: 12 }}>
        <Pressable
          onPress={handleApprove}
          disabled={signing}
          style={({ pressed }) => ({
            backgroundColor: signing ? '#14532d' : '#00ef8b',
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            opacity: pressed || signing ? 0.8 : 1,
          })}
        >
          {signing
            ? <ActivityIndicator color="#0a0a0a" size="small" />
            : <Fingerprint size={20} color="#0a0a0a" />
          }
          <Text style={{ color: '#0a0a0a', fontSize: 16, fontWeight: '700' }}>
            {signing ? 'Signing…' : 'Approve'}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleReject}
          disabled={signing}
          style={({ pressed }) => ({
            backgroundColor: '#1a1a1a',
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: '#27272a',
            opacity: pressed || signing ? 0.6 : 1,
          })}
        >
          <X size={18} color="#ef4444" />
          <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600' }}>Reject</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
