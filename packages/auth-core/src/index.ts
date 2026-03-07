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

// Cookie / token storage helpers
export { loadTokensFromCookie, loadStoredTokens, persistTokens, clearTokens } from './cookie';

// GoTrue helpers
export { gotruePost, refreshAccessToken, buildOAuthRedirectUrl } from './gotrue';

// Passkey auth client
export { createPasskeyAuthClient } from './passkey-client';
