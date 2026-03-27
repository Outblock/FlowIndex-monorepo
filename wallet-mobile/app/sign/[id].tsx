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
import { Fingerprint, X, Globe, Code } from 'lucide-react-native';
import { usePendingRequests } from '../../stores/pending-requests';

function tryDecodeHexToUtf8(hex: string): string | null {
  try {
    const clean = hex.replace(/^0x/, '');
    if (clean.length % 2 !== 0) return null;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    // Check if all bytes are printable ASCII/UTF-8
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const isPrintable = /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(decoded);
    return isPrintable ? decoded : null;
  } catch {
    return null;
  }
}

export default function SignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { get, remove } = usePendingRequests();
  const request = get(id);

  const [signing, setSigning] = useState(false);

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

  // Attempt to decode hex message to readable UTF-8
  const rawMessage: string = payload?.message ?? '';
  const decodedMessage = tryDecodeHexToUtf8(rawMessage);
  const displayMessage = decodedMessage ?? rawMessage;
  const isHex = !decodedMessage && rawMessage.length > 0;

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
          Sign Message
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

        {/* Message content */}
        <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#27272a', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: '#27272a' }}>
            <Code size={16} color="#a1a1aa" />
            <Text style={{ color: '#a1a1aa', fontSize: 14, fontWeight: '500' }}>
              {isHex ? 'Message (hex)' : 'Message'}
            </Text>
          </View>
          <View style={{ padding: 14 }}>
            {rawMessage.length === 0 ? (
              <Text style={{ color: '#71717a', fontSize: 13, fontStyle: 'italic' }}>No message content</Text>
            ) : isHex ? (
              <ScrollView horizontal showsHorizontalScrollIndicator style={{ maxHeight: 120 }}>
                <Text style={{ color: '#d4d4d8', fontSize: 11, fontFamily: 'monospace', lineHeight: 17 }}>
                  {rawMessage}
                </Text>
              </ScrollView>
            ) : (
              <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>
                {displayMessage}
              </Text>
            )}
          </View>
        </View>

        {/* Warning */}
        <View style={{ backgroundColor: '#2a1a0a', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#92400e44' }}>
          <Text style={{ color: '#fbbf24', fontSize: 13, lineHeight: 18 }}>
            Only sign messages from dApps you trust. This action cannot be undone.
          </Text>
        </View>

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
            {signing ? 'Signing…' : 'Sign'}
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
