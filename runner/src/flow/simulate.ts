export interface SimulateRequest {
  cadence: string;
  arguments: Array<{ type: string; value: string }>;
  authorizers: string[];
  payer: string;
  verbose?: boolean;
}

export interface BalanceChange {
  address: string;
  token: string;
  delta: string;
}

export interface SimulateResponse {
  success: boolean;
  error?: string;
  events: Array<{ type: string; payload: any }>;
  balanceChanges: BalanceChange[];
  computationUsed: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export async function simulateTransaction(req: SimulateRequest): Promise<SimulateResponse> {
  const resp = await fetch(`${API_BASE}/flow/v1/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return {
      success: false,
      error: `Simulation service error: ${resp.status} ${text}`,
      events: [],
      balanceChanges: [],
      computationUsed: 0,
    };
  }

  return resp.json();
}
