/**
 * Platform-adaptive keychain.
 * Metro resolves .native.ts on RN; Vite resolves .web.ts on web.
 * This file is the fallback (web).
 */
export { KeychainWeb as Keychain } from './keychain.web';
