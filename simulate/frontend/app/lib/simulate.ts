export interface SimulateRequest {
  cadence: string
  arguments: Array<Record<string, unknown>>
  authorizers: string[]
  payer: string
}

export interface BalanceChange {
  address: string
  token: string
  delta: string
}

export interface SimulateResponse {
  success: boolean
  error?: string
  events: Array<{ type: string; payload: unknown }>
  balanceChanges: BalanceChange[]
  computationUsed: number
}

export async function simulateTransaction(req: SimulateRequest): Promise<SimulateResponse> {
  const resp = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  if (!resp.ok) {
    const text = await resp.text()
    return {
      success: false,
      error: `Simulation service error: ${resp.status} ${text}`,
      events: [],
      balanceChanges: [],
      computationUsed: 0,
    }
  }

  const raw = await resp.json()
  return {
    success: raw.success,
    error: raw.error,
    events: raw.events ?? [],
    balanceChanges: raw.balance_changes ?? raw.balanceChanges ?? [],
    computationUsed: raw.computation_used ?? raw.computationUsed ?? 0,
  }
}
