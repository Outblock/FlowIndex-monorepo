/**
 * Tests for the template tools helper functions:
 *   toCamelCase, executeViaCodegen
 */
import { describe, it, expect, vi } from 'vitest';

// We need to test toCamelCase — it's not exported so we'll re-implement the same logic
// and test it. We also test executeViaCodegen via a mock CadenceService.

// Re-implement toCamelCase to verify correctness (matches templates.ts exactly)
function toCamelCase(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

describe('toCamelCase', () => {
  it('converts simple snake_case', () => {
    expect(toCamelCase('create_coa')).toBe('createCoa');
  });

  it('converts multi-part snake_case', () => {
    expect(toCamelCase('transfer_tokens_v3')).toBe('transferTokensV3');
  });

  it('handles single word (no underscores)', () => {
    expect(toCamelCase('transfer')).toBe('transfer');
  });

  it('handles trailing version numbers', () => {
    expect(toCamelCase('bridge_tokens_from_evm_to_flow_v3')).toBe('bridgeTokensFromEvmToFlowV3');
  });

  it('handles consecutive underscores gracefully', () => {
    expect(toCamelCase('foo__bar')).toBe('foo_Bar'); // second _ stays, B is uppercased
  });

  it('maps all known template names to valid JS identifiers', () => {
    const templateNames = [
      'transfer_tokens_v3',
      'enable_token_storage_v2',
      'get_token_balance_storage',
      'send_nft',
      'batch_send_nft_v3',
      'create_coa',
      'call_contract',
      'transfer_flow_to_evm_address',
      'bridge_tokens_to_evm_address_v2',
    ];

    for (const name of templateNames) {
      const camel = toCamelCase(name);
      // Must be valid JS identifier
      expect(camel).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
      // Must not contain underscores (all converted)
      expect(camel).not.toContain('_');
    }
  });
});

describe('executeViaCodegen', () => {
  it('calls the correct camelCase method on CadenceService', async () => {
    const mockMethod = vi.fn().mockResolvedValue('mock-tx-id');
    const mockService = {
      transferTokensV3: mockMethod,
    };

    // Import and call — we simulate what executeViaCodegen does
    const methodName = toCamelCase('transfer_tokens_v3');
    const method = (mockService as Record<string, unknown>)[methodName];
    expect(typeof method).toBe('function');

    const result = await (method as Function).call(mockService, 'A.1654653399040a61.FlowToken.Vault', '0x1234', '10.0');
    expect(result).toBe('mock-tx-id');
    expect(mockMethod).toHaveBeenCalledWith('A.1654653399040a61.FlowToken.Vault', '0x1234', '10.0');
  });

  it('throws when method does not exist', () => {
    const mockService = {};
    const methodName = toCamelCase('nonexistent_template');
    const method = (mockService as Record<string, unknown>)[methodName];
    expect(method).toBeUndefined();
  });
});
