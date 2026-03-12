import { describe, it, expect, beforeEach } from 'vitest';
import { addPendingTx, getPendingTx, removePendingTx, listPendingTxs } from '../approval/manager.js';

describe('approval/manager', () => {
  // The module uses a global Map, so we need to clean up after each test
  const ids: string[] = [];

  function addAndTrack(id: string, overrides?: Partial<Parameters<typeof addPendingTx>[1]>) {
    ids.push(id);
    addPendingTx(id, {
      kind: 'template',
      template_name: 'transfer_tokens_v3',
      cadence: 'transaction() {}',
      args: { amount: '1.0' },
      summary: `test tx ${id}`,
      createdAt: Date.now(),
      ...overrides,
    } as Parameters<typeof addPendingTx>[1]);
  }

  beforeEach(() => {
    // Remove any leftover entries
    for (const id of ids) removePendingTx(id);
    ids.length = 0;
  });

  it('addPendingTx + getPendingTx round-trip', () => {
    addAndTrack('tx-001');
    const tx = getPendingTx('tx-001');
    expect(tx).toBeDefined();
    expect(tx!.kind).toBe('template');
    if (tx?.kind === 'template') {
      expect(tx.template_name).toBe('transfer_tokens_v3');
      expect(tx.args).toEqual({ amount: '1.0' });
    }
  });

  it('getPendingTx returns undefined for unknown id', () => {
    expect(getPendingTx('does-not-exist')).toBeUndefined();
  });

  it('removePendingTx returns true when found, false otherwise', () => {
    addAndTrack('tx-002');
    expect(removePendingTx('tx-002')).toBe(true);
    expect(removePendingTx('tx-002')).toBe(false);
    expect(getPendingTx('tx-002')).toBeUndefined();
  });

  it('listPendingTxs returns all entries with correct shape', () => {
    addAndTrack('tx-a');
    addAndTrack('tx-b', { summary: 'second tx' });

    const list = listPendingTxs();
    expect(list.length).toBeGreaterThanOrEqual(2);

    const a = list.find((t) => t.tx_id === 'tx-a');
    const b = list.find((t) => t.tx_id === 'tx-b');
    expect(a).toBeDefined();
    expect(a!.kind).toBe('template');
    expect(a!.summary).toBe('test tx tx-a');
    expect(b!.summary).toBe('second tx');
    expect(typeof a!.created_at).toBe('number');
  });

  it('listPendingTxs excludes removed entries', () => {
    addAndTrack('tx-rm');
    removePendingTx('tx-rm');
    const list = listPendingTxs();
    expect(list.find((t) => t.tx_id === 'tx-rm')).toBeUndefined();
  });

  it('listPendingTxs includes preflight simulation summary when present', () => {
    addAndTrack('tx-preflight', {
      preflightSimulation: {
        success: true,
        summary: 'Transfer 1 FLOW',
        computationUsed: 123,
        balanceChanges: [],
        tags: [],
        events: [],
        summaryItems: [],
        transfers: [],
        nftTransfers: [],
        systemEvents: [],
        evmExecutions: [],
        evmLogTransfers: [],
        defiEvents: [],
        stakingEvents: [],
        fee: 0,
      },
    });

    const list = listPendingTxs();
    const pending = list.find((t) => t.tx_id === 'tx-preflight');
    expect(pending?.preflight_simulation).toEqual({
      success: true,
      summary: 'Transfer 1 FLOW',
      error: null,
    });
  });

  it('supports raw cadence pending transactions', () => {
    ids.push('tx-raw');
    addPendingTx('tx-raw', {
      kind: 'raw_cadence',
      cadence: 'transaction(amount: UFix64) {}',
      arguments: [{ type: 'UFix64', value: '1.0' }],
      summary: 'transaction(amount: UFix64) [arg_count=1]',
      createdAt: Date.now(),
    });

    const tx = getPendingTx('tx-raw');
    expect(tx?.kind).toBe('raw_cadence');
    if (tx?.kind === 'raw_cadence') {
      expect(tx.arguments).toEqual([{ type: 'UFix64', value: '1.0' }]);
    }

    const listed = listPendingTxs().find((entry) => entry.tx_id === 'tx-raw');
    expect(listed?.kind).toBe('raw_cadence');
  });
});
