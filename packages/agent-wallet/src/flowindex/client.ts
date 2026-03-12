/**
 * FlowIndex API client — thin wrapper around the FlowIndex REST API.
 *
 * Default base URL is https://flowindex.io/api. The API routes live under
 * /api/flow/... on the public domain.
 */
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

export class FlowIndexClient {
  constructor(
    private baseUrl: string,
    private simulatorUrl = 'https://simulator.flowindex.io/api',
  ) {}

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const resp = init ? await fetch(url, init) : await fetch(url);
    if (!resp.ok) {
      throw new Error(
        `FlowIndex API error ${resp.status}: ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  private async get(path: string): Promise<unknown> {
    return this.request(`${this.baseUrl}${path}`);
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async getAccount(address: string): Promise<unknown> {
    return this.get(`/flow/account/${address}`);
  }

  async getFlowBalance(address: string): Promise<unknown> {
    // FLOW balance is included in the FT vaults response
    const result = (await this.get(`/flow/account/${address}/ft`)) as {
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
    return this.get(`/flow/account/${address}/ft`);
  }

  async getNftCollections(address: string): Promise<unknown> {
    return this.get(`/flow/account/${address}/nft`);
  }

  async getTransaction(txId: string): Promise<unknown> {
    return this.get(`/flow/transaction/${txId}`);
  }

  async simulateTransaction(
    request: SimulateTransactionRequest,
  ): Promise<SimulateTransactionResponse> {
    return this.post(`${this.simulatorUrl}/simulate`, request) as Promise<SimulateTransactionResponse>;
  }
}
