import { Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Globe, QrCode, Scan, Unlink } from 'lucide-react-native';
import { useWalletConnect } from '../../providers';
import type { WCSession } from '../../providers/WalletConnectProvider';

function SessionRow({ session, onDisconnect }: { session: WCSession; onDisconnect: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#18181b',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
      }}
    >
      {/* dApp icon */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          backgroundColor: '#27272a',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
          overflow: 'hidden',
        }}
      >
        {session.peerIcon ? (
          <Image
            source={{ uri: session.peerIcon }}
            style={{ width: 42, height: 42, borderRadius: 8 }}
            resizeMode="cover"
          />
        ) : (
          <Globe size={22} color="#a1a1aa" />
        )}
      </View>

      {/* dApp info */}
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}
          numberOfLines={1}
        >
          {session.peerName}
        </Text>
        <Text
          style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        >
          {session.peerUrl}
        </Text>
      </View>

      {/* Disconnect button */}
      <TouchableOpacity
        onPress={onDisconnect}
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          backgroundColor: '#2d1215',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 10,
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Unlink size={18} color="#f87171" />
      </TouchableOpacity>
    </View>
  );
}

export default function ConnectScreen() {
  const router = useRouter();
  const { sessions, disconnect } = useWalletConnect();

  function handleDisconnect(session: WCSession) {
    Alert.alert(
      'Disconnect dApp',
      `Disconnect from ${session.peerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnect(session.topic),
        },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: 20,
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '700' }}>
          Connected dApps
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/wc/scan')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#00ef8b',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            gap: 6,
          }}
        >
          <Scan size={16} color="#0a0a0a" />
          <Text style={{ color: '#0a0a0a', fontSize: 14, fontWeight: '600' }}>
            Scan
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sessions list or empty state */}
      {sessions.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 40,
          }}
        >
          <QrCode size={56} color="#3f3f46" />
          <Text
            style={{
              color: '#a1a1aa',
              fontSize: 18,
              fontWeight: '600',
              marginTop: 20,
              textAlign: 'center',
            }}
          >
            No active connections
          </Text>
          <Text
            style={{
              color: '#52525b',
              fontSize: 14,
              marginTop: 8,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            Scan a WalletConnect QR code to connect to a dApp
          </Text>
        </View>
      ) : (
        <FlashList
          data={sessions}
          keyExtractor={(item) => item.topic}
          renderItem={({ item }) => (
            <SessionRow
              session={item}
              onDisconnect={() => handleDisconnect(item)}
            />
          )}
          estimatedItemSize={70}
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        />
      )}
    </View>
  );
}
