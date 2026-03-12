/**
 * Minimal pending-transaction queue for the approval flow.
 *
 * Transactions that require human approval are parked here until
 * an approve/reject tool call resolves them.
 */

import type { SimulateTransactionResponse } from '../flowindex/client.js';

export interface PendingTx {
  template_name: string;
  cadence: string;
  args: Record<string, unknown>;
  summary: string;
  createdAt: number;
  preflightSimulation?: SimulateTransactionResponse;
  preflightSimulationSkippedReason?: string;
  preflightSimulationError?: string;
}

const pendingTxs = new Map<string, PendingTx>();

export interface PendingTxSummary {
  tx_id: string;
  summary: string;
  created_at: number;
  preflight_simulation?: {
    success: boolean;
    summary: string;
    error: string | null;
  };
  preflight_simulation_skipped_reason?: string;
  preflight_simulation_error?: string;
}

export function addPendingTx(txId: string, tx: PendingTx): void {
  pendingTxs.set(txId, { ...tx, createdAt: Date.now() });
}

export function getPendingTx(txId: string): PendingTx | undefined {
  return pendingTxs.get(txId);
}

export function removePendingTx(txId: string): boolean {
  return pendingTxs.delete(txId);
}

export function listPendingTxs(): PendingTxSummary[] {
  return Array.from(pendingTxs.entries()).map(([id, tx]) => ({
    tx_id: id,
    summary: tx.summary,
    created_at: tx.createdAt,
    ...(tx.preflightSimulation
      ? {
          preflight_simulation: {
            success: tx.preflightSimulation.success,
            summary: tx.preflightSimulation.summary,
            error: tx.preflightSimulation.error ?? null,
          },
        }
      : {}),
    ...(tx.preflightSimulationSkippedReason
      ? { preflight_simulation_skipped_reason: tx.preflightSimulationSkippedReason }
      : {}),
    ...(tx.preflightSimulationError
      ? { preflight_simulation_error: tx.preflightSimulationError }
      : {}),
  }));
}
