import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';

export interface UserKey {
  id: string;
  label: string;
  flow_address: string;
  public_key: string;
  key_index: number;
  sig_algo: string;
  hash_algo: string;
  source: 'imported' | 'created';
  created_at: string;
}

export function useKeys() {
  const { accessToken, user } = useAuth();
  const [keys, setKeys] = useState<UserKey[]>([]);
  const [loading, setLoading] = useState(false);

  const callEdgeFunction = useCallback(
    async <T = unknown>(
      endpoint: string,
      data: Record<string, unknown> = {},
    ): Promise<T> => {
      if (!supabase || !accessToken) throw new Error('Not authenticated');
      const { data: result, error } = await supabase.functions.invoke(
        'flow-keys',
        {
          body: { endpoint, data },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (error) throw new Error(error.message || 'Edge function error');
      if (!result.success)
        throw new Error(result.error?.message || 'Unknown error');
      return result.data as T;
    },
    [accessToken],
  );

  const fetchKeys = useCallback(async () => {
    if (!user || !accessToken) return;
    setLoading(true);
    try {
      const result = await callEdgeFunction<{ keys: UserKey[] }>('/keys/list');
      setKeys(result.keys);
    } catch {
      // Silently fail — user may not have any keys
    } finally {
      setLoading(false);
    }
  }, [user, accessToken, callEdgeFunction]);

  const createKey = useCallback(
    async (
      label: string,
      network?: 'mainnet' | 'testnet',
    ): Promise<UserKey> => {
      const result = await callEdgeFunction<UserKey>('/keys/create', {
        label,
        network,
      });
      await fetchKeys();
      return result;
    },
    [callEdgeFunction, fetchKeys],
  );

  const importKey = useCallback(
    async (
      privateKey: string,
      flowAddress: string,
      label?: string,
      keyIndex?: number,
    ): Promise<UserKey> => {
      const result = await callEdgeFunction<UserKey>('/keys/import', {
        privateKey,
        flowAddress,
        label,
        keyIndex,
      });
      await fetchKeys();
      return result;
    },
    [callEdgeFunction, fetchKeys],
  );

  const signMessage = useCallback(
    async (keyId: string, message: string): Promise<string> => {
      const result = await callEdgeFunction<{ signature: string }>(
        '/keys/sign',
        { keyId, message },
      );
      return result.signature;
    },
    [callEdgeFunction],
  );

  const deleteKey = useCallback(
    async (keyId: string): Promise<void> => {
      await callEdgeFunction('/keys/delete', { keyId });
      await fetchKeys();
    },
    [callEdgeFunction, fetchKeys],
  );

  // Auto-fetch keys when user is authenticated
  useEffect(() => {
    if (user) fetchKeys();
  }, [user, fetchKeys]);

  return { keys, loading, fetchKeys, createKey, importKey, signMessage, deleteKey };
}
