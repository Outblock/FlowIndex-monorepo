/**
 * Tests for the CadenceService request interceptor (service.ts).
 *
 * The interceptor is where the signer gets injected into FCL transactions.
 * This is a critical path for debugging "invalid signature" errors because
 * any mismatch in addr, keyId, sigAlgo, hashAlgo will cause failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlowSigner, SignResult, SignerInfo } from '@flowindex/flow-signer';

// We test the interceptor logic in isolation by mocking the CadenceService

describe('service request interceptor', () => {
  function createMockSigner(overrides?: Partial<SignerInfo>): FlowSigner {
    const info: SignerInfo = {
      type: 'local',
      flowAddress: '0x1234567890abcdef',
      evmAddress: '0xdeadbeef',
      keyIndex: 0,
      sigAlgo: 'ECDSA_secp256k1',
      hashAlgo: 'SHA2_256',
      ...overrides,
    };

    return {
      init: vi.fn().mockResolvedValue(undefined),
      info: () => info,
      signFlowTransaction: vi.fn().mockResolvedValue({ signature: 'a'.repeat(128) }),
      isHeadless: () => true,
    };
  }

  // Replicate the interceptor logic from service.ts
  function createInterceptor(signer: FlowSigner) {
    function sigAlgoCode(algo: string): number {
      switch (algo) {
        case 'ECDSA_P256': return 2;
        case 'ECDSA_secp256k1': return 3;
        default: return 3;
      }
    }

    function hashAlgoCode(algo: string): number {
      switch (algo) {
        case 'SHA2_256': return 1;
        case 'SHA3_256': return 3;
        default: return 1;
      }
    }

    return (cfg: Record<string, unknown>) => {
      if (cfg.type === 'transaction') {
        const info = signer.info();
        const address = info.flowAddress;
        if (!address) throw new Error('Signer has no Flow address configured');

        const keyIndex = info.keyIndex;
        const sigAlgo = sigAlgoCode(info.sigAlgo);
        const hashAlgo = hashAlgoCode(info.hashAlgo);

        const sansPrefix = (addr: string) => addr.replace(/^0x/, '');

        const authz = (account: Record<string, unknown>) => ({
          ...account,
          addr: sansPrefix(address),
          keyId: keyIndex,
          signingFunction: async (signable: { message: string }) => {
            const result = await signer.signFlowTransaction(signable.message);
            return {
              addr: sansPrefix(address),
              keyId: keyIndex,
              signature: result.signature,
            };
          },
          sigAlgo,
          hashAlgo,
        });

        return {
          ...cfg,
          proposer: authz,
          payer: authz,
          authorizations: [authz],
        };
      }
      return cfg;
    };
  }

  it('passes through non-transaction configs unchanged', () => {
    const signer = createMockSigner();
    const interceptor = createInterceptor(signer);

    const scriptCfg = { type: 'script', cadence: 'access(all) fun main() {}' };
    const result = interceptor(scriptCfg);
    expect(result).toEqual(scriptCfg);
  });

  it('injects authz for transaction configs', () => {
    const signer = createMockSigner();
    const interceptor = createInterceptor(signer);

    const txCfg = { type: 'transaction', cadence: 'transaction() {}' };
    const result = interceptor(txCfg) as Record<string, unknown>;

    expect(result.proposer).toBeDefined();
    expect(result.payer).toBeDefined();
    expect(result.authorizations).toBeDefined();
    expect(Array.isArray(result.authorizations)).toBe(true);
  });

  it('authz produces correct addr (sans 0x prefix)', async () => {
    const signer = createMockSigner({ flowAddress: '0xabcdef1234567890' });
    const interceptor = createInterceptor(signer);

    const txCfg = { type: 'transaction' };
    const result = interceptor(txCfg) as Record<string, unknown>;

    const authz = result.proposer as (account: Record<string, unknown>) => Record<string, unknown>;
    const account = authz({});

    expect(account.addr).toBe('abcdef1234567890');
    expect(account.keyId).toBe(0);
    expect(account.sigAlgo).toBe(3); // secp256k1
    expect(account.hashAlgo).toBe(1); // SHA2_256
  });

  it('authz signingFunction delegates to signer', async () => {
    const mockSignResult: SignResult = { signature: 'b'.repeat(128) };
    const signer = createMockSigner();
    (signer.signFlowTransaction as ReturnType<typeof vi.fn>).mockResolvedValue(mockSignResult);

    const interceptor = createInterceptor(signer);
    const result = interceptor({ type: 'transaction' }) as Record<string, unknown>;
    const authz = result.proposer as (account: Record<string, unknown>) => Record<string, unknown>;
    const account = authz({});

    const signingFn = account.signingFunction as (s: { message: string }) => Promise<Record<string, unknown>>;
    const sigResult = await signingFn({ message: 'deadbeef' });

    expect(signer.signFlowTransaction).toHaveBeenCalledWith('deadbeef');
    expect(sigResult.signature).toBe('b'.repeat(128));
    expect(sigResult.addr).toBe('1234567890abcdef');
    expect(sigResult.keyId).toBe(0);
  });

  it('P256 + SHA3_256 signer produces correct algo codes', () => {
    const signer = createMockSigner({
      sigAlgo: 'ECDSA_P256',
      hashAlgo: 'SHA3_256',
    });
    const interceptor = createInterceptor(signer);

    const result = interceptor({ type: 'transaction' }) as Record<string, unknown>;
    const authz = result.proposer as (account: Record<string, unknown>) => Record<string, unknown>;
    const account = authz({});

    expect(account.sigAlgo).toBe(2); // P256
    expect(account.hashAlgo).toBe(3); // SHA3_256
  });

  it('throws when signer has no flow address', () => {
    const signer = createMockSigner({ flowAddress: undefined });
    const interceptor = createInterceptor(signer);

    expect(() => interceptor({ type: 'transaction' })).toThrow('no Flow address');
  });

  it('all three authz roles (proposer, payer, authorizations) are the same function', () => {
    const signer = createMockSigner();
    const interceptor = createInterceptor(signer);

    const result = interceptor({ type: 'transaction' }) as Record<string, unknown>;
    expect(result.proposer).toBe(result.payer);
    expect((result.authorizations as unknown[])[0]).toBe(result.proposer);
  });
});
