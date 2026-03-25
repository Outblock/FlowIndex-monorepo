import { useState, useEffect, useCallback } from 'react';
import { getAccount, getTokenPrices } from '../api/flow';
import type { AccountData, VaultInfo } from '../api/types';

export interface EnrichedHolding {
  symbol: string;
  name: string;
  balance: number;
  logoUrl: string;
  usdValue: number;
  identifier: string;
}

export interface BalanceState {
  account: AccountData | null;
  holdings: EnrichedHolding[];
  totalUsd: number;
  loading: boolean;
  error: string | null;
}

export function useBalance(address: string | undefined | null) {
  const [state, setState] = useState<BalanceState>({
    account: null,
    holdings: [],
    totalUsd: 0,
    loading: false,
    error: null,
  });

  const fetchBalances = useCallback(async () => {
    if (!address) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const [accountRes, pricesRes] = await Promise.allSettled([
        getAccount(address),
        getTokenPrices(),
      ]);

      const account = accountRes.status === 'fulfilled' ? accountRes.value : null;
      const prices = pricesRes.status === 'fulfilled' ? pricesRes.value : {};

      // Build enriched holdings from account.vaults (VaultInfo has symbol/name/logo)
      const flowBalance = account?.flowBalance ?? 0;
      const flowPrice = prices['FLOW'] ?? prices['flow'] ?? 0;

      const holdings: EnrichedHolding[] = [];

      // FLOW always first
      holdings.push({
        symbol: 'FLOW',
        name: 'Flow',
        balance: flowBalance,
        logoUrl: '',
        usdValue: flowBalance * flowPrice,
        identifier: 'FLOW',
      });

      // Other tokens from vaults
      const vaults = account?.vaults;
      if (vaults) {
        const others = Object.entries(vaults)
          .filter(([, v]) => v.symbol !== 'FLOW')
          .map(([, v]: [string, VaultInfo]) => {
            const balance = v.balance ?? 0;
            const symbol = v.symbol ?? '';
            const price = prices[symbol] ?? prices[symbol.toUpperCase()] ?? 0;
            return {
              symbol,
              name: v.name ?? symbol,
              balance,
              logoUrl: v.logo ?? '',
              usdValue: balance * price,
              identifier: v.token ?? v.path ?? symbol,
            };
          })
          .filter((v) => v.balance > 0)
          .sort((a, b) => b.usdValue - a.usdValue);

        holdings.push(...others);
      }

      const totalUsd = holdings.reduce((sum, h) => sum + h.usdValue, 0);

      setState({ account, holdings, totalUsd, loading: false, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
    }
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { ...state, refetch: fetchBalances };
}
