/**
 * FlowIndex API client for agent-wallet.
 *
 * Re-exports FlowIndexClient from @flowindex/api-client and extends it with
 * agent-wallet-specific helpers: simulateTransaction and getFlowBalance.
 */
export type { FlowIndexClientConfig, Block, Transaction, EvmTransaction, Account, EvmAddress, SearchResponse } from '@flowindex/api-client';
export { FlowIndexApiError } from '@flowindex/api-client';
import { FlowIndexClient as BaseFlowIndexClient } from '@flowindex/api-client';

export interface JsonCdcValue {
  type: string;
  value: unknown;
}

export interface SimulatorScheduledOptions {
  advance_seconds?: number;
  advance_blocks?: number;
}

export interface SimulateTransactionRequest {
  cadence: string;
  arguments: JsonCdcValue[];
  authorizers: string[];
  payer: string;
  scheduled?: SimulatorScheduledOptions;
}

export interface SimulateTransactionResponse {
  success: boolean;
  error?: string | null;
  computationUsed: number;
  balanceChanges: Array<{
    address: string;
    token: string;
    delta: string;
    before?: string;
    after?: string;
  }>;
  scheduledResults?: Array<{
    tx_id: string;
    success: boolean;
    error?: string | null;
    events: Array<{ type: string; payload: unknown }>;
    computation_used: number;
  }>;
  summary: string;
  summaryItems: Array<{ icon: string; text: string }>;
  transfers: unknown[];
  nftTransfers: unknown[];
  systemEvents: unknown[];
  evmExecutions: unknown[];
  evmLogTransfers: unknown[];
  defiEvents: unknown[];
  stakingEvents: unknown[];
  fee: number;
  tags: string[];
  events: Array<{ type: string; payload: unknown }>;
}

/**
 * Agent-wallet extended client. Accepts positional constructor args
 * (baseUrl, simulatorUrl) to maintain backward compatibility with
 * simulate/template.ts and existing tests.
 *
 * Adds simulateTransaction and getFlowBalance (convenience wrapper
 * that extracts FlowToken from FT holdings) on top of the shared
 * BaseFlowIndexClient from @flowindex/api-client.
 */
export class AgentWalletClient extends BaseFlowIndexClient {
  private readonly agentBaseUrl: string;
  private readonly simulatorUrl: string;

  constructor(
    baseUrl: string,
    simulatorUrl = 'https://simulator.flowindex.io/api',
  ) {
    super({ baseUrl });
    this.agentBaseUrl = baseUrl.replace(/\/+$/, '');
    this.simulatorUrl = simulatorUrl;
  }

  private async agentRequest(url: string, init?: RequestInit): Promise<unknown> {
    const resp = init ? await fetch(url, init) : await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `FlowIndex API error ${resp.status}: ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  private async agentGet(path: string): Promise<unknown> {
    return this.agentRequest(`${this.agentBaseUrl}${path}`);
  }

  private async agentPost(url: string, body: unknown): Promise<unknown> {
    return this.agentRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Returns raw account response (not unwrapped) — same behavior as original client.
   * Overrides the base getAccount which unwraps data[0].
   */
  override async getAccount(address: string): Promise<unknown> {
    return this.agentGet(`/flow/account/${address}`);
  }

  /**
   * Returns FLOW balance by extracting FlowToken vault from FT holdings.
   * Convenience method specific to agent-wallet.
   */
  async getFlowBalance(address: string): Promise<unknown> {
    const result = (await this.agentGet(`/flow/account/${address}/ft`)) as {
      data?: Array<{ token?: string; balance?: string }>;
    };
    const flowVault = result.data?.find((v) =>
      v.token?.includes('FlowToken'),
    );
    return {
      address,
      balance: flowVault?.balance ?? '0.0',
    };
  }

  async getFtBalances(address: string): Promise<unknown> {
    return this.agentGet(`/flow/account/${address}/ft`);
  }

  async getNftCollections(address: string): Promise<unknown> {
    return this.agentGet(`/flow/account/${address}/nft`);
  }

  /**
   * Returns raw transaction response — same behavior as original client.
   * The base getTransaction uses ?id= query param; original used /flow/transaction/:id.
   */
  override async getTransaction(txId: string): Promise<unknown> {
    return this.agentGet(`/flow/transaction/${txId}`);
  }

  async simulateTransaction(
    request: SimulateTransactionRequest,
  ): Promise<SimulateTransactionResponse> {
    return this.agentPost(`${this.simulatorUrl}/simulate`, request) as Promise<SimulateTransactionResponse>;
  }
}

// Re-export AgentWalletClient as FlowIndexClient for backward compatibility
// with existing imports in simulate/template.ts and tests.
export { AgentWalletClient as FlowIndexClient };
