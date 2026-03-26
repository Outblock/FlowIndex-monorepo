import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createPasskeyAuthClient,
  userFromToken,
  isExpired,
  secondsUntilExpiry,
  refreshAccessToken,
  gotruePost,
} from '@flowindex/auth-core';
import type { AuthUser, PasskeyAccount, PasskeyInfo, StoredTokens } from '@flowindex/auth-core';
import { signFlowTransaction, createPasskeyAuthz } from '@flowindex/flow-passkey';

const TOKEN_KEY = 'flowindex_wallet_tokens';

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.accessToken && parsed?.refreshToken) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch { /* ignore */ }
}

async function clearTokenStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export interface MobileAuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  accounts: PasskeyAccount[];
  passkeys: PasskeyInfo[];
  passkeyLoading: boolean;
  register(walletName?: string): Promise<{ credentialId: string; publicKeySec1Hex: string }>;
  login(): Promise<void>;
  signOut(): Promise<void>;
  sign(messageHex: string, credentialId: string): Promise<{ signature: string; extensionData: string }>;
  getFlowAuthz(address: string, keyIndex: number, credentialId: string): (account: any) => any;
  provisionAccounts(credentialId: string): Promise<any>;
  pollProvisionTx(txId: string, network: 'mainnet' | 'testnet'): Promise<string>;
  saveProvisionedAddress(credentialId: string, network: string, address: string): Promise<void>;
  saveEvmAddress(credentialId: string, evmAddress: string): Promise<void>;
  refreshState(): Promise<void>;
}

export const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function useMobileAuth(): MobileAuthContextValue {
  const ctx = useContext(MobileAuthContext);
  if (!ctx) throw new Error('useMobileAuth must be used within MobileAuthProvider');
  return ctx;
}

const GOTRUE_URL = process.env.EXPO_PUBLIC_GOTRUE_URL || 'https://run.flowindex.io/auth/v1';
const PASSKEY_AUTH_URL = process.env.EXPO_PUBLIC_PASSKEY_AUTH_URL || 'https://run.flowindex.io/functions/v1/passkey-auth';
const RP_ID = 'flowindex.io';
const RP_NAME = 'FlowIndex';

export function MobileAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [accounts, setAccounts] = useState<PasskeyAccount[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const passkeyClient = useRef(
    createPasskeyAuthClient({
      passkeyAuthUrl: PASSKEY_AUTH_URL,
      rpId: RP_ID,
      rpName: RP_NAME,
    }),
  ).current;

  const scheduleRefresh = useCallback((aToken: string, rToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const secs = secondsUntilExpiry(aToken);
    const delayMs = Math.max((secs - 60) * 1000, 5_000);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const data = await refreshAccessToken(GOTRUE_URL, rToken);
        const u = userFromToken(data.access_token);
        await saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
        setUser(u);
        setAccessToken(data.access_token);
        refreshTokenRef.current = data.refresh_token;
        scheduleRefresh(data.access_token, data.refresh_token);
      } catch {
        await clearTokenStorage();
        setUser(null);
        setAccessToken(null);
        refreshTokenRef.current = null;
      }
    }, delayMs);
  }, []);

  const applyTokenResponse = useCallback(
    async (data: { access_token: string; refresh_token: string }) => {
      const u = userFromToken(data.access_token);
      await saveTokens({ accessToken: data.access_token, refreshToken: data.refresh_token });
      setUser(u);
      setAccessToken(data.access_token);
      refreshTokenRef.current = data.refresh_token;
      scheduleRefresh(data.access_token, data.refresh_token);
    },
    [scheduleRefresh],
  );

  // Restore session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadTokens();
      if (!stored) { setLoading(false); return; }

      if (!isExpired(stored.accessToken)) {
        if (!cancelled) {
          const u = userFromToken(stored.accessToken);
          setUser(u);
          setAccessToken(stored.accessToken);
          refreshTokenRef.current = stored.refreshToken;
          scheduleRefresh(stored.accessToken, stored.refreshToken);
          setLoading(false);
        }
        return;
      }

      try {
        const data = await refreshAccessToken(GOTRUE_URL, stored.refreshToken);
        if (!cancelled) await applyTokenResponse(data);
      } catch {
        if (!cancelled) await clearTokenStorage();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);

  const refreshPasskeyState = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride ?? accessToken;
    if (!token) { setAccounts([]); setPasskeys([]); return; }
    try {
      const [passkeyList, accountList] = await Promise.all([
        passkeyClient.listPasskeys(token),
        passkeyClient.listAccounts(token),
      ]);
      setPasskeys(passkeyList);
      setAccounts(accountList);
    } catch {
      setPasskeys([]);
      setAccounts([]);
    }
  }, [accessToken, passkeyClient]);

  useEffect(() => {
    if (user && accessToken) refreshPasskeyState(accessToken);
  }, [user, accessToken]);

  const register = useCallback(async (walletName?: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    setPasskeyLoading(true);
    try {
      const result = await passkeyClient.register(accessToken, walletName);
      await refreshPasskeyState(accessToken);
      return result;
    } finally {
      setPasskeyLoading(false);
    }
  }, [accessToken, passkeyClient, refreshPasskeyState]);

  const login = useCallback(async () => {
    setPasskeyLoading(true);
    try {
      const { tokenHash } = await passkeyClient.login();
      if (tokenHash) {
        const data = await gotruePost(GOTRUE_URL, '/verify', { type: 'magiclink', token_hash: tokenHash });
        await applyTokenResponse(data);
        await refreshPasskeyState(data.access_token);
      }
    } finally {
      setPasskeyLoading(false);
    }
  }, [passkeyClient, applyTokenResponse, refreshPasskeyState]);

  const signOut = useCallback(async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    await clearTokenStorage();
    setUser(null);
    setAccessToken(null);
    refreshTokenRef.current = null;
    setAccounts([]);
    setPasskeys([]);
  }, []);

  const sign = useCallback(async (messageHex: string, credentialId: string) => {
    return signFlowTransaction({ messageHex, credentialId, rpId: RP_ID });
  }, []);

  const getFlowAuthz = useCallback((address: string, keyIndex: number, credentialId: string) => {
    return createPasskeyAuthz({ address, keyIndex, credentialId, rpId: RP_ID });
  }, []);

  const value: MobileAuthContextValue = {
    user, accessToken, loading, accounts, passkeys, passkeyLoading,
    register, login, signOut, sign, getFlowAuthz,
    provisionAccounts: (cid) => {
      if (!accessToken) throw new Error('Not authenticated');
      return passkeyClient.provisionAccounts(accessToken, cid);
    },
    pollProvisionTx: (txId, network) => passkeyClient.pollProvisionTx(txId, network),
    saveProvisionedAddress: async (cid, network, addr) => {
      if (!accessToken) throw new Error('Not authenticated');
      await passkeyClient.saveProvisionedAddress(accessToken, cid, network, addr);
    },
    saveEvmAddress: async (cid, evmAddr) => {
      if (!accessToken) throw new Error('Not authenticated');
      await passkeyClient.saveEvmAddress(accessToken, cid, evmAddr);
    },
    refreshState: () => refreshPasskeyState(),
  };

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}
