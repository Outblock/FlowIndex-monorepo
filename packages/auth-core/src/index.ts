// Types
export type {
  AuthUser,
  StoredTokens,
  TokenData,
  OAuthProvider,
  PasskeyAccount,
  PasskeyInfo,
  ProvisionResult,
  PasskeyClientConfig,
} from './types';

// JWT helpers
export { parseJwt, isExpired, secondsUntilExpiry, userFromToken } from './jwt';
export type { UserFromTokenOptions } from './jwt';

// Token storage helpers (platform-split: web vs native)
export { loadStoredTokens, persistTokens, clearTokens } from './storage';
// Web-only: direct cookie access (not available on native)
export { loadTokensFromCookie } from './storage.web';

// GoTrue helpers
export { gotruePost, refreshAccessToken, buildOAuthRedirectUrl } from './gotrue';

// Passkey auth client
export { createPasskeyAuthClient } from './passkey-client';
