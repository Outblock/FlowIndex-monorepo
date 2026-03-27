import { configureApiClient } from '@flowindex/wallet-core';
import { WalletProvider } from '@flowindex/wallet-core';
import { MobileAuthProvider, useMobileAuth } from './AuthProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WalletAccount, Network } from '@flowindex/wallet-core';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://flowindex.io/api';
configureApiClient({ baseUrl: API_URL });

const NETWORK_KEY = 'flowindex_wallet_network';

async function loadNetworkAsync(): Promise<Network> {
  try {
    const stored = await AsyncStorage.getItem(NETWORK_KEY);
    if (stored === 'mainnet' || stored === 'testnet') return stored;
  } catch { /* ignore */ }
  return 'mainnet';
}

async function saveNetwork(network: Network): Promise<void> {
  try {
    await AsyncStorage.setItem(NETWORK_KEY, network);
  } catch { /* ignore */ }
}

function WalletBridge({ children }: { children: React.ReactNode }) {
  const { accounts, loading: authLoading, refreshState } = useMobileAuth();

  const walletAccounts: WalletAccount[] = accounts.map((a) => ({
    credentialId: a.credentialId,
    flowAddress: a.flowAddress,
    flowAddressTestnet: a.flowAddressTestnet,
    evmAddress: a.evmAddress,
    publicKeySec1Hex: a.publicKeySec1Hex,
    authenticatorName: a.authenticatorName,
  }));

  return (
    <WalletProvider
      accounts={walletAccounts}
      authLoading={authLoading}
      onRefreshAccounts={refreshState}
      loadNetwork={loadNetworkAsync}
      saveNetwork={saveNetwork}
    >
      {children}
    </WalletProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MobileAuthProvider>
      <WalletBridge>
        {children}
      </WalletBridge>
    </MobileAuthProvider>
  );
}
