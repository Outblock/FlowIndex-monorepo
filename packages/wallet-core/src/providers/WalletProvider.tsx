import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { WalletAccount } from '../store/wallet-store';

export type Network = 'mainnet' | 'testnet';

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

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export interface WalletProviderProps {
  children: React.ReactNode;
  accounts: WalletAccount[];
  authLoading: boolean;
  onRefreshAccounts?: () => Promise<void>;
  computeEvmAddress?: (publicKeySec1Hex: string) => Promise<string | null>;
  loadNetwork?: () => Network | Promise<Network>;
  saveNetwork?: (network: Network) => void | Promise<void>;
}

export function WalletProvider({
  children,
  accounts: externalAccounts,
  authLoading,
  onRefreshAccounts,
  computeEvmAddress,
  loadNetwork: loadNetworkFn,
  saveNetwork: saveNetworkFn,
}: WalletProviderProps) {
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [network, setNetwork] = useState<Network>('mainnet');
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load persisted network on mount
  useEffect(() => {
    if (!loadNetworkFn) return;
    const result = loadNetworkFn();
    if (result instanceof Promise) {
      result.then(setNetwork).catch(() => {});
    } else {
      setNetwork(result);
    }
  }, []);

  // Sync accounts from auth layer
  useEffect(() => {
    if (authLoading) return;

    if (!externalAccounts.length) {
      setActiveAccount(null);
      setLoading(false);
      return;
    }

    setActiveAccount((prev) => {
      if (prev) {
        const matched = externalAccounts.find((a) => a.credentialId === prev.credentialId);
        if (matched) return matched;
      }
      return externalAccounts[0];
    });
    setLoading(false);
  }, [externalAccounts, authLoading]);

  // Compute EVM address when active account changes
  useEffect(() => {
    if (!activeAccount?.publicKeySec1Hex || !computeEvmAddress) {
      setEvmAddress(null);
      return;
    }
    let cancelled = false;
    computeEvmAddress(activeAccount.publicKeySec1Hex).then((addr) => {
      if (!cancelled) setEvmAddress(addr);
    }).catch(() => {
      if (!cancelled) setEvmAddress(null);
    });
    return () => { cancelled = true; };
  }, [activeAccount?.publicKeySec1Hex, computeEvmAddress]);

  const switchAccount = useCallback((credentialId: string) => {
    const acct = externalAccounts.find((a) => a.credentialId === credentialId);
    if (acct) setActiveAccount(acct);
  }, [externalAccounts]);

  const switchNetwork = useCallback((net: Network) => {
    setNetwork(net);
    if (saveNetworkFn) {
      const result = saveNetworkFn(net);
      if (result instanceof Promise) result.catch(() => {});
    }
  }, [saveNetworkFn]);

  const refreshAccounts = useCallback(async () => {
    if (!onRefreshAccounts) return;
    setLoading(true);
    try {
      await onRefreshAccounts();
    } finally {
      setLoading(false);
    }
  }, [onRefreshAccounts]);

  const value: WalletContextValue = {
    activeAccount,
    accounts: externalAccounts,
    network,
    loading: loading || authLoading,
    evmAddress,
    switchAccount,
    switchNetwork,
    refreshAccounts,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
