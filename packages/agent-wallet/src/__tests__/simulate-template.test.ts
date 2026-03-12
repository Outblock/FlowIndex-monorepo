import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTemplateSimulationRequest,
  maybeSimulateTemplate,
} from '../simulate/template.js';
import { toJsonCdcValue } from '../cadence/arguments.js';
import type { Template } from '../templates/registry.js';
import type { AgentWalletConfig } from '../config/env.js';
import type { FlowSigner, SignerInfo } from '@flowindex/flow-signer';

const signerInfo: SignerInfo = {
  type: 'local',
  flowAddress: '0x1234567890abcdef',
  evmAddress: '0xdeadbeef',
  keyIndex: 0,
  sigAlgo: 'ECDSA_secp256k1',
  hashAlgo: 'SHA2_256',
};

const mockSigner: FlowSigner = {
  init: vi.fn().mockResolvedValue(undefined),
  info: () => signerInfo,
  signFlowTransaction: vi.fn().mockResolvedValue({ signature: 'a'.repeat(128) }),
  isHeadless: () => true,
};

const mockTemplate: Template = {
  name: 'transfer_tokens_v3',
  category: 'token',
  type: 'transaction',
  description: 'Transfer fungible tokens',
  cadence: 'transaction(recipient: Address, amount: UFix64, ids: [UInt64]) {}',
  args: [
    { name: 'recipient', type: 'Address', description: '' },
    { name: 'amount', type: 'UFix64', description: '' },
    { name: 'ids', type: '[UInt64]', description: '' },
  ],
};

describe('simulate/template helpers', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes Address values to JSON-CDC', () => {
    expect(toJsonCdcValue('Address', '1234')).toEqual({
      type: 'Address',
      value: '0x1234',
    });
  });

  it('serializes array values recursively to JSON-CDC', () => {
    expect(toJsonCdcValue('[[UInt8]]', [
      [1, 2],
      [3],
    ])).toEqual({
      type: 'Array',
      value: [
        {
          type: 'Array',
          value: [
            { type: 'UInt8', value: '1' },
            { type: 'UInt8', value: '2' },
          ],
        },
        {
          type: 'Array',
          value: [{ type: 'UInt8', value: '3' }],
        },
      ],
    });
  });

  it('serializes optional values to JSON-CDC', () => {
    expect(toJsonCdcValue('String?', null)).toEqual({
      type: 'Optional',
      value: null,
    });
    expect(toJsonCdcValue('Address?', '1234')).toEqual({
      type: 'Optional',
      value: {
        type: 'Address',
        value: '0x1234',
      },
    });
  });

  it('builds a simulation request from template metadata', () => {
    expect(buildTemplateSimulationRequest(
      mockTemplate,
      {
        recipient: '0xf233dcee88fe0abe',
        amount: '10.0',
        ids: [1, 2],
      },
      '0x1234567890abcdef',
      { advance_blocks: 2 },
    )).toEqual({
      cadence: mockTemplate.cadence,
      arguments: [
        { type: 'Address', value: '0xf233dcee88fe0abe' },
        { type: 'UFix64', value: '10.0' },
        {
          type: 'Array',
          value: [
            { type: 'UInt64', value: '1' },
            { type: 'UInt64', value: '2' },
          ],
        },
      ],
      authorizers: ['0x1234567890abcdef'],
      payer: '0x1234567890abcdef',
      scheduled: { advance_blocks: 2 },
    });
  });

  it('skips simulation on testnet', async () => {
    const config: AgentWalletConfig = {
      network: 'testnet',
      flowKeyIndex: 0,
      sigAlgo: 'ECDSA_secp256k1',
      hashAlgo: 'SHA2_256',
      evmAccountIndex: 0,
      flowindexUrl: 'https://flowindex.io/api',
      flowSimulatorEnabled: true,
      flowSimulatorUrl: 'https://simulator.flowindex.io/api',
      allowRawCadenceSigning: false,
      approvalRequired: true,
      signerType: 'local-key',
    };

    const result = await maybeSimulateTemplate(
      config,
      mockSigner,
      mockTemplate,
      {
        recipient: '0xf233dcee88fe0abe',
        amount: '10.0',
        ids: [1, 2],
      },
    );

    expect(result.simulation).toBeUndefined();
    expect(result.skippedReason).toContain('mainnet');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skips simulation when FLOW_SIMULATOR_ENABLED is false', async () => {
    const config: AgentWalletConfig = {
      network: 'mainnet',
      flowKeyIndex: 0,
      sigAlgo: 'ECDSA_secp256k1',
      hashAlgo: 'SHA2_256',
      evmAccountIndex: 0,
      flowindexUrl: 'https://flowindex.io/api',
      flowSimulatorEnabled: false,
      flowSimulatorUrl: 'https://simulator.flowindex.io/api',
      allowRawCadenceSigning: false,
      approvalRequired: true,
      signerType: 'local-key',
    };

    const result = await maybeSimulateTemplate(
      config,
      mockSigner,
      mockTemplate,
      {
        recipient: '0xf233dcee88fe0abe',
        amount: '10.0',
        ids: [1, 2],
      },
    );

    expect(result.simulation).toBeUndefined();
    expect(result.skippedReason).toContain('FLOW_SIMULATOR_ENABLED=false');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
