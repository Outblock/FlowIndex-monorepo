/**
 * Minimal pending-transaction queue for the approval flow.
 *
 * Transactions that require human approval are parked here until
 * an approve/reject tool call resolves them.
 */

import type { CadenceArgument } from '../cadence/arguments.js';
import type { SimulateTransactionResponse } from '../flowindex/client.js';

interface PendingTxBase {
  kind: 'template' | 'raw_cadence';
  cadence: string;
  summary: string;
  createdAt: number;
  preflightSimulation?: SimulateTransactionResponse;
  preflightSimulationSkippedReason?: string;
  preflightSimulationError?: string;
}

export interface PendingTemplateTx extends PendingTxBase {
  kind: 'template';
  template_name: string;
  args: Record<string, unknown>;
}

export interface PendingRawCadenceTx extends PendingTxBase {
  kind: 'raw_cadence';
  arguments: CadenceArgument[];
}

export type PendingTx = PendingTemplateTx | PendingRawCadenceTx;

const pendingTxs = new Map<string, PendingTx>();

export interface PendingTxSummary {
  tx_id: string;
  kind: PendingTx['kind'];
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
    kind: tx.kind,
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
