import { describe, it, expect } from 'vitest';
import { EMULATOR_SERVICE_ADDRESS, EMULATOR_SERVICE_KEY, buildEmulatorAuthz } from './emulatorSigner';

describe('emulatorSigner', () => {
  it('exports correct service account address', () => {
    expect(EMULATOR_SERVICE_ADDRESS).toBe('f8d6e0586b0a20c7');
  });

  it('exports correct service private key', () => {
    expect(EMULATOR_SERVICE_KEY).toBe('bf9db4706c2fdb9011ee7e170ccac492f05427b96ab41d8bf2d8c58443704b76');
  });

  it('buildEmulatorAuthz returns correct authorization shape', () => {
    const mockAccount = { tempId: 'x', addr: 'x', keyId: 0 };
    const authz = buildEmulatorAuthz(mockAccount);

    expect(authz.addr).toBe('f8d6e0586b0a20c7');
    expect(authz.keyId).toBe(0);
    expect(authz.signatureAlgorithm).toBe(2);
    expect(authz.hashAlgorithm).toBe(3);
    expect(typeof authz.signingFunction).toBe('function');
  });
});
