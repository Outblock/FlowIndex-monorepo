import { useStore } from 'zustand';
import type { createSettingsStore } from '../store/settings-store';

export function useNetworkFromStore(store: ReturnType<typeof createSettingsStore>) {
  const network = useStore(store, (s) => s.network);
  const setNetwork = useStore(store, (s) => s.setNetwork);

  return { network, setNetwork };
}
