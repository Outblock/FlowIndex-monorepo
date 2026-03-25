import { apiFetch } from './client';
import type {
  ApiResponse,
  AccountData,
  FtHolding,
  NftCollection,
  NftItem,
  AccountTransaction,
  TransactionPage,
  FtTransfer,
  FtTransferPage,
} from './types';

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch combined account details (balance, keys, vaults, contracts). */
export async function getAccount(address: string): Promise<AccountData> {
  const res = await apiFetch<ApiResponse<AccountData[]>>(`/flow/account/${address}`);
  const item = res.data?.[0];
  if (!item) throw new Error(`Account not found: ${address}`);
  return item;
}

/** Fetch FT holdings / vault balances for an account. */
export async function getAccountFtHoldings(address: string): Promise<FtHolding[]> {
  const res = await apiFetch<ApiResponse<FtHolding[]>>(`/flow/account/${address}/ft`);
  return res.data ?? [];
}

/** Fetch NFT collections owned by an account. */
export async function getNftCollections(address: string): Promise<NftCollection[]> {
  const res = await apiFetch<ApiResponse<NftCollection[]>>(`/flow/account/${address}/nft`);
  return res.data ?? [];
}

/** Fetch NFT items for a specific collection owned by an account. */
export async function getNftCollectionItems(
  address: string,
  nftType: string,
  params?: { limit?: number; offset?: number },
): Promise<NftItem[]> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiFetch<ApiResponse<NftItem[]>>(
    `/flow/account/${address}/nft/${nftType}${query}`,
  );
  return res.data ?? [];
}

/** Fetch paginated transaction history for an account. */
export async function getAccountTransactions(
  address: string,
  params?: { limit?: number; offset?: number },
): Promise<TransactionPage> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const limit = params?.limit ?? 25;

  const res = await apiFetch<ApiResponse<AccountTransaction[]>>(
    `/flow/account/${address}/transaction${query}`,
  );
  const data = res.data ?? [];
  return { data, hasMore: data.length >= limit };
}

/** Fetch current token prices from the backend status endpoint. */
export async function getTokenPrices(): Promise<Record<string, number>> {
  const res = await apiFetch<ApiResponse<Array<{ symbol: string; price: number }>>>(
    '/status/prices',
  );
  const prices: Record<string, number> = {};
  for (const item of res.data ?? []) {
    if (item.symbol && item.price != null) {
      prices[item.symbol] = item.price;
    }
  }
  return prices;
}

/** Fetch paginated FT transfers for an account. */
export async function getAccountFtTransfers(
  address: string,
  params?: { limit?: number; offset?: number },
): Promise<FtTransferPage> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const limit = params?.limit ?? 25;

  const res = await apiFetch<ApiResponse<FtTransfer[]>>(
    `/flow/account/${address}/ft/transfer${query}`,
  );
  const data = res.data ?? [];
  return { data, hasMore: data.length >= limit };
}
