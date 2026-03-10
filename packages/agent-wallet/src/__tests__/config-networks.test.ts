import { describe, it, expect } from 'vitest';
import { NETWORK_CONFIG, getFlowAccessNode, getEvmRpcUrl } from '../config/networks.js';

describe('config/networks', () => {
  it('mainnet config has correct access node and chain ID', () => {
    const cfg = NETWORK_CONFIG.mainnet;
    expect(cfg.accessNode).toContain('mainnet');
    expect(cfg.evmChainId).toBe(747);
    expect(cfg.contracts.FlowToken).toBeDefined();
    expect(cfg.contracts.FungibleToken).toBeDefined();
    expect(cfg.contracts.EVM).toBeDefined();
  });

  it('testnet config has correct access node and chain ID', () => {
    const cfg = NETWORK_CONFIG.testnet;
    expect(cfg.accessNode).toContain('testnet');
    expect(cfg.evmChainId).toBe(545);
    expect(cfg.contracts.FlowToken).toBeDefined();
  });

  it('getFlowAccessNode returns REST URLs', () => {
    expect(getFlowAccessNode('mainnet')).toContain('http');
    expect(getFlowAccessNode('testnet')).toContain('http');
  });

  it('getEvmRpcUrl returns URLs', () => {
    expect(getEvmRpcUrl('mainnet')).toContain('http');
    expect(getEvmRpcUrl('testnet')).toContain('http');
  });

  it('all contract addresses are lowercase hex without 0x prefix', () => {
    for (const network of ['mainnet', 'testnet'] as const) {
      const contracts = NETWORK_CONFIG[network].contracts;
      for (const [name, addr] of Object.entries(contracts)) {
        expect(addr, `${network}.${name}`).toMatch(/^(0x)?[0-9a-f]+$/);
      }
    }
  });
});
