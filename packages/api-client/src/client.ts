import { FlowIndexApiError } from './errors.js';
import type {
  FlowIndexClientConfig,
  Block,
  Transaction,
  EvmTransaction,
  Account,
  EvmAddress,
  SearchResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.flowindex.io';

export class FlowIndexClient {
  private readonly baseUrl: string;

  constructor(config?: FlowIndexClientConfig) {
    this.baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, { method: 'GET' });

    if (!resp.ok) {
      const text = await resp.text();
      throw new FlowIndexApiError(resp.status, text);
    }

    return resp.json() as Promise<T>;
  }

  async getBlock(height?: number): Promise<Block> {
    if (height != null) {
      return this.request<Block>(`/flow/block/${height}`);
    }
    // /flow/block returns a list — fetch latest by requesting limit=1
    const list = await this.request<{ data: Block[] }>('/flow/block?limit=1');
    if (!list.data || list.data.length === 0) {
      throw new FlowIndexApiError(404, 'No blocks found');
    }
    return list.data[0];
  }

  async getTransaction(txId: string): Promise<Transaction> {
    return this.request<Transaction>(`/flow/transaction/${txId}`);
  }

  async getEvmTransaction(hash: string): Promise<EvmTransaction> {
    return this.request<EvmTransaction>(`/flow/evm/transaction/${hash}`);
  }

  async getAccount(address: string): Promise<Account> {
    return this.request<Account>(`/flow/account/${address}`);
  }

  async getEvmAddress(address: string): Promise<EvmAddress> {
    return this.request<EvmAddress>(`/flow/evm/address/${address}`);
  }

  async getAccountFtHoldings(address: string): Promise<unknown> {
    return this.request(`/flow/account/${address}/ft`);
  }

  async getAccountNftCollections(address: string): Promise<unknown> {
    return this.request(`/flow/account/${address}/nft`);
  }

  async getAccountTransfers(address: string, limit = 20, offset = 0): Promise<unknown> {
    return this.request(`/flow/account/${address}/transfer?limit=${limit}&offset=${offset}`);
  }

  async search(query: string, type?: string): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (type) params.set('type', type);
    return this.request<SearchResponse>(`/flow/search?${params}`);
  }
}
