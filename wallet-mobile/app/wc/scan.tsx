import { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ArrowLeft, Camera } from 'lucide-react-native';
import { useWalletConnect } from '../../providers';

export default function ScanScreen() {
  const router = useRouter();
  const { pair } = useWalletConnect();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const scanLock = useRef(false);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanLock.current || scanned) return;

    // Only handle WalletConnect URIs
    if (!data.startsWith('wc:')) return;

    scanLock.current = true;
    setScanned(true);

    pair(data)
      .then(() => {
        if (router.canGoBack()) router.back();
      })
      .catch((err) => {
        console.error('[WC] Scan pairing failed:', err);
        // Reset to allow re-scanning
        scanLock.current = false;
        setScanned(false);
      });
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.text}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Permission denied - show request screen
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Camera size={48} color="#a1a1aa" />
          <Text style={[styles.text, { fontSize: 18, fontWeight: '600', marginTop: 16 }]}>
            Camera Access Required
          </Text>
          <Text style={[styles.subtext, { marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }]}>
            Allow camera access to scan WalletConnect QR codes from dApps.
          </Text>
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [styles.button, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.buttonText}>Grant Permission</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={{ marginTop: 12 }}
          >
            <Text style={[styles.subtext, { textDecorationLine: 'underline' }]}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Header overlay */}
      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <ArrowLeft size={24} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* Center guide overlay */}
      <View style={styles.guideContainer}>
        <View style={styles.guideBox}>
          {/* Corner borders */}
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <Text style={styles.guideText}>
          {scanned ? 'Connecting...' : 'Point at a WalletConnect QR code'}
        </Text>
      </View>
    </View>
  );
}

const GUIDE_SIZE = 250;
const CORNER_SIZE = 30;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
  subtext: {
    color: '#a1a1aa',
    fontSize: 14,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#00ef8b',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '700',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  guideContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideBox: {
    width: GUIDE_SIZE,
    height: GUIDE_SIZE,
    position: 'relative',
  },
  guideText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#00ef8b',
    borderTopLeftRadius: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#00ef8b',
    borderTopRightRadius: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#00ef8b',
    borderBottomLeftRadius: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#00ef8b',
    borderBottomRightRadius: 4,
  },
});
