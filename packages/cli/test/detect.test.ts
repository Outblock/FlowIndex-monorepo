import { describe, it, expect } from 'vitest';
import { detectInputType, InputType } from '../src/lib/detect.js';

describe('detectInputType', () => {
  it('detects Flow transaction hash', () => {
    const hash = 'a'.repeat(64);
    expect(detectInputType(hash)).toEqual({ type: InputType.FlowTxHash, value: hash });
  });

  it('detects EVM transaction hash', () => {
    const hash = '0x' + 'a'.repeat(64);
    expect(detectInputType(hash)).toEqual({ type: InputType.EvmTxHash, value: hash });
  });

  it('detects Flow address', () => {
    const addr = 'e467b9dd11fa00df';
    expect(detectInputType(addr)).toEqual({ type: InputType.FlowAddress, value: addr });
  });

  it('detects Flow address with 0x prefix', () => {
    const addr = '0xe467b9dd11fa00df';
    expect(detectInputType(addr)).toEqual({ type: InputType.FlowAddress, value: 'e467b9dd11fa00df' });
  });

  it('detects EVM address', () => {
    const addr = '0x' + 'a'.repeat(40);
    expect(detectInputType(addr)).toEqual({ type: InputType.EvmAddress, value: addr });
  });

  it('detects .find name', () => {
    expect(detectInputType('hao.find')).toEqual({ type: InputType.FlowName, value: 'hao.find' });
  });

  it('detects .fn name', () => {
    expect(detectInputType('alice.fn')).toEqual({ type: InputType.FlowName, value: 'alice.fn' });
  });

  it('detects block height', () => {
    expect(detectInputType('85000000')).toEqual({ type: InputType.BlockHeight, value: 85000000 });
  });

  it('falls back to search query', () => {
    expect(detectInputType('FlowToken')).toEqual({ type: InputType.SearchQuery, value: 'FlowToken' });
  });

  it('handles mixed case hex', () => {
    const hash = 'aAbBcCdD'.repeat(8);
    expect(detectInputType(hash)).toEqual({ type: InputType.FlowTxHash, value: hash.toLowerCase() });
  });
});
