export { generateMnemonic, validateMnemonic, mnemonicToSeed } from './mnemonic';
export { deriveSecp256k1Key, deriveP256KeyFromPath, deriveEvmKey, FLOW_BIP44_PATH, EVM_BIP44_PATH } from './hd-derive';
export type { DerivedKey } from './hd-derive';
export { encrypt, decrypt, deriveKeyFromPassword } from './encryption';
// Keychain: consumers import from keychain.web.ts or keychain.native.ts via platform resolution.
// KeychainNative uses RN-only deps (expo-secure-store, @react-native-async-storage/async-storage)
// and is resolved by Metro's .native.ts resolution — not exported from this barrel.
export { KeychainWeb } from './keychain.web';
