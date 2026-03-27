import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Network } from '../store/settings-store';

export interface WalletAccount {
  credentialId: string;
  flowAddress?: string;
  flowAddressTestnet?: string;
  evmAddress?: string;
  publicKeySec1Hex: string;
  authenticatorName?: string;
}

export interface WalletContextValue {
  activeAccount: WalletAccount | null;
  accounts: WalletAccount[];
  network: Network;
  loading: boolean;
  evmAddress: string | null;
  switchAccount: (credentialId: string) => void;
  switchNetwork: (network: Network) => void;
  refreshAccounts: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export interface WalletProviderProps {
  children: React.ReactNode;
  accounts: WalletAccount[];
  onRefreshAccounts?: () => Promise<WalletAccount[]>;
  initialNetwork?: Network;
  onNetworkChange?: (network: Network) => void;
  onActiveAccountChange?: (credentialId: string) => void;
  initialActiveAccountId?: string | null;
}

export function WalletProvider({
  children,
  accounts: initialAccounts,
  onRefreshAccounts,
  initialNetwork = 'mainnet',
  onNetworkChange,
  onActiveAccountChange,
  initialActiveAccountId,
}: WalletProviderProps) {
  const [accounts, setAccounts] = useState<WalletAccount[]>(initialAccounts);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    initialActiveAccountId ?? initialAccounts[0]?.credentialId ?? null,
  );
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAccounts(initialAccounts);
    if (!activeAccountId && initialAccounts.length > 0) {
      setActiveAccountId(initialAccounts[0].credentialId);
    }
  }, [initialAccounts]);

  const activeAccount = useMemo(
    () => accounts.find(a => a.credentialId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  const evmAddress = activeAccount?.evmAddress ?? null;

  const switchAccount = useCallback((credentialId: string) => {
    setActiveAccountId(credentialId);
    onActiveAccountChange?.(credentialId);
  }, [onActiveAccountChange]);

  const switchNetwork = useCallback((n: Network) => {
    setNetwork(n);
    onNetworkChange?.(n);
  }, [onNetworkChange]);

  const refreshAccounts = useCallback(async () => {
    if (!onRefreshAccounts) return;
    setLoading(true);
    try {
      const fresh = await onRefreshAccounts();
      setAccounts(fresh);
    } finally {
      setLoading(false);
    }
  }, [onRefreshAccounts]);

  const value = useMemo<WalletContextValue>(() => ({
    activeAccount,
    accounts,
    network,
    loading,
    evmAddress,
    switchAccount,
    switchNetwork,
    refreshAccounts,
  }), [activeAccount, accounts, network, loading, evmAddress, switchAccount, switchNetwork, refreshAccounts]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
}
