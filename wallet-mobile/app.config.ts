import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'FlowIndex Wallet',
  slug: 'flowindex-wallet',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'flowindex-wallet',
  userInterfaceStyle: 'dark',
  splash: {
    backgroundColor: '#0a0a0a',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'io.flowindex.wallet',
    associatedDomains: ['webcredentials:flowindex.io'],
    infoPlist: {
      NSFaceIDUsageDescription: 'Authenticate to access your wallet',
      NSCameraUsageDescription: 'Scan QR codes to connect with dApps',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0a0a0a',
    },
    package: 'io.flowindex.wallet',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-local-authentication',
    'expo-camera',
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: true,
  },
});
