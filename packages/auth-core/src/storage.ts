/**
 * Default token storage — re-exports the web implementation.
 * Metro overrides this with storage.native.ts on React Native.
 */
export { loadStoredTokens, persistTokens, clearTokens } from './storage.web';
