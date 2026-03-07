import { AuthProvider as BaseAuthProvider } from '@flowindex/auth-ui';
import type { AuthConfig } from '@flowindex/auth-ui';

const config: AuthConfig = {
  gotrueUrl: (import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') + '/auth/v1',
  passkeyAuthUrl: (import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321') + '/functions/v1/passkey-auth',
  rpId: import.meta.env.VITE_RP_ID || 'flowindex.io',
  rpName: 'FlowIndex Wallet',
};

export function WalletAuthProvider({ children }: { children: React.ReactNode }) {
  return <BaseAuthProvider config={config}>{children}</BaseAuthProvider>;
}
