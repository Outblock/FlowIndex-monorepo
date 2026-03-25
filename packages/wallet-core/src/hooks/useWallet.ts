import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { createWalletStore } from '../store/wallet-store';

/**
 * Hook to access wallet state. Requires a WalletStore to be provided
 * via context (see WalletProvider in the consuming app).
 */
export function useWalletFromStore(store: ReturnType<typeof createWalletStore>) {
  const accounts = useStore(store, (s) => s.accounts);
  const activeAccountId = useStore(store, (s) => s.activeAccountId);
  const loading = useStore(store, (s) => s.loading);
  const setAccounts = useStore(store, (s) => s.setAccounts);
  const setActiveAccount = useStore(store, (s) => s.setActiveAccount);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.credentialId === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );

  return {
    accounts,
    activeAccount,
    loading,
    setAccounts,
    switchAccount: setActiveAccount,
  };
}
