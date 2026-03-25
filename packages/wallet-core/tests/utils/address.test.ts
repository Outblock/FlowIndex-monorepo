import { describe, it, expect } from 'vitest';
import { normalizeAddress, formatShort } from '../../src/utils/address';

describe('normalizeAddress', () => {
  it('lowercases and adds 0x prefix', () => {
    expect(normalizeAddress('0xABCD1234')).toBe('0xabcd1234');
  });

  it('adds 0x prefix if missing', () => {
    expect(normalizeAddress('abcd1234')).toBe('0xabcd1234');
  });

  it('handles falsy values', () => {
    expect(normalizeAddress('')).toBe('');
    expect(normalizeAddress(null)).toBe('');
    expect(normalizeAddress(undefined)).toBe('');
  });
});

describe('formatShort', () => {
  it('truncates long addresses', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    const result = formatShort(addr);
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(addr.length);
  });

  it('returns short addresses as-is', () => {
    expect(formatShort('0x1234')).toBe('0x1234');
  });
});
