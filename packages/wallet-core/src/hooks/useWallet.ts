/**
 * Re-export useWallet from providers for convenience.
 * This replaces the old zustand-based useWalletFromStore.
 */
export { useWallet } from '../providers/WalletProvider';
export type { WalletContextValue, WalletAccount } from '../providers/WalletProvider';
