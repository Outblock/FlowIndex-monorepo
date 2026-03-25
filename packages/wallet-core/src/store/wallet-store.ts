import { createStore } from 'zustand/vanilla';

export interface WalletAccount {
  credentialId: string;
  flowAddress?: string;
  flowAddressTestnet?: string;
  evmAddress?: string;
  publicKeySec1Hex: string;
  authenticatorName?: string;
}

export interface WalletState {
  accounts: WalletAccount[];
  activeAccountId: string | null;
  loading: boolean;
}

export interface WalletActions {
  setAccounts: (accounts: WalletAccount[]) => void;
  setActiveAccount: (credentialId: string) => void;
  setLoading: (loading: boolean) => void;
}

export type WalletStore = WalletState & WalletActions;

export const createWalletStore = () =>
  createStore<WalletStore>((set) => ({
    accounts: [],
    activeAccountId: null,
    loading: true,
    setAccounts: (accounts) => set({ accounts }),
    setActiveAccount: (credentialId) => set({ activeAccountId: credentialId }),
    setLoading: (loading) => set({ loading }),
  }));
