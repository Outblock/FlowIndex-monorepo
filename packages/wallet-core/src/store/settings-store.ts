import { createStore } from 'zustand/vanilla';

export type Network = 'mainnet' | 'testnet';

export interface SettingsState {
  network: Network;
}

export interface SettingsActions {
  setNetwork: (network: Network) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const createSettingsStore = (initialNetwork: Network = 'mainnet') =>
  createStore<SettingsStore>((set) => ({
    network: initialNetwork,
    setNetwork: (network) => set({ network }),
  }));
