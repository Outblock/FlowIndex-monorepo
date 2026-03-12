import { afterEach, describe, expect, it, vi } from 'vitest';

const { mutateMock, onceSealedMock, txMock } = vi.hoisted(() => {
  const onceSealed = vi.fn();
  const tx = vi.fn(() => ({ onceSealed }));
  return {
    mutateMock: vi.fn(),
    onceSealedMock: onceSealed,
    txMock: tx,
  };
});

vi.mock('@onflow/fcl', () => ({
  mutate: mutateMock,
  tx: txMock,
  sansPrefix: (address: string) => address.replace(/^0x/, ''),
}));

import { executeCadenceTransaction } from '../cadence/transaction.js';

const signerInfo = {
  type: 'local',
  flowAddress: '0x1234567890abcdef',
  evmAddress: '0xdeadbeef',
  keyIndex: 0,
  sigAlgo: 'ECDSA_secp256k1',
  hashAlgo: 'SHA2_256',
};

const mockSigner = {
  init: vi.fn().mockResolvedValue(undefined),
  info: () => signerInfo,
  signFlowTransaction: vi.fn().mockResolvedValue({ signature: 'a'.repeat(128) }),
  isHeadless: () => true,
} as const;

describe('cadence/transaction', () => {
  afterEach(() => {
    mutateMock.mockReset();
    onceSealedMock.mockReset();
    txMock.mockClear();
  });

  it('executes a raw cadence transaction through FCL mutate and waits for seal', async () => {
    mutateMock.mockResolvedValue('tx-123');
    onceSealedMock.mockResolvedValue({
      blockHeight: 42,
      events: [{ type: 'A.test.Event', data: { ok: true } }],
    });

    const result = await executeCadenceTransaction(
      'transaction(amount: UFix64) { prepare(signer: auth(BorrowValue) &Account) {} }',
      [{ type: 'UFix64', value: '1.0' }],
      mockSigner,
      'mainnet',
    );

    expect(result).toEqual({
      status: 'sealed',
      tx_id: 'tx-123',
      block_height: 42,
      events: [{ type: 'A.test.Event', data: { ok: true } }],
    });

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(txMock).toHaveBeenCalledWith('tx-123');

    const config = mutateMock.mock.calls[0]?.[0] as {
      cadence: string;
      args?: (arg: (value: unknown, type: unknown) => unknown, t: Record<string, unknown>) => unknown[];
      proposer: unknown;
      payer: unknown;
      authorizations: unknown[];
      limit: number;
    };

    expect(config.cadence).toContain('FlowIndex Agent Wallet');
    expect(config.cadence).toContain('transaction(amount: UFix64)');
    expect(config.args).toBeTypeOf('function');
    expect(config.proposer).toBeTypeOf('function');
    expect(config.payer).toBeTypeOf('function');
    expect(config.authorizations).toHaveLength(1);
    expect(config.limit).toBe(9999);
  });
});
