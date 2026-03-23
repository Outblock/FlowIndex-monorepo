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

const DEFAULT_BASE_URL = 'https://flowindex.io/api';

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
      // Block by height also returns { data: [...] }
      const resp = await this.request<{ data: Block[] }>(`/flow/block/${height}`);
      if (!resp.data || resp.data.length === 0) {
        throw new FlowIndexApiError(404, `Block ${height} not found`);
      }
      return resp.data[0];
    }
    // /flow/block returns a list — fetch latest by requesting limit=1
    const list = await this.request<{ data: Block[] }>('/flow/block?limit=1');
    if (!list.data || list.data.length === 0) {
      throw new FlowIndexApiError(404, 'No blocks found');
    }
    return list.data[0];
  }

  async getTransaction(txId: string): Promise<Transaction> {
    // Transactions are fetched by query: /flow/transaction?id=<txId>
    const resp = await this.request<{ data: Transaction[] }>(`/flow/transaction?id=${txId}`);
    if (!resp.data || resp.data.length === 0) {
      throw new FlowIndexApiError(404, `Transaction ${txId} not found`);
    }
    return resp.data[0];
  }

  async getEvmTransaction(hash: string): Promise<EvmTransaction> {
    return this.request<EvmTransaction>(`/flow/evm/transaction/${hash}`);
  }

  async getAccount(address: string): Promise<Account> {
    const resp = await this.request<{ data: Account[] }>(`/flow/account/${address}`);
    if (!resp.data || resp.data.length === 0) {
      throw new FlowIndexApiError(404, `Account ${address} not found`);
    }
    return resp.data[0];
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
